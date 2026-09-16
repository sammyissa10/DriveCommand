# Can the tenant GUC be re-asserted at connection checkout?

**Date:** 2026-09-16 (quick-625)
**Scope:** investigation and prototype only. No call site changed; the shipped `prisma.ts`, `tenant-rls.ts`,
`tenant-client.ts` and `tenant-context.ts` are untouched.
**Prototype:** `apps/web/scripts/audit/625-tenant-checkout.prototype.ts`: outside `src` so neither the tenant-mechanism fence nor the wrapper countdown had to be widened for it (an in-`src` first placement turned both red, §7).
**Harnesses:** `apps/web/scripts/audit/625-checkout-eviction.ts`, `625-checkout-concurrency.ts`,
`.planning/quick/625-…/census-sizing.cjs`. Evidence under `.planning/quick/625-checkout-guc-reassertion-vs-per-unit-bin/evidence/`.
**Target:** `drivecommand-staging` (`wyixpgunnjmzguhggocz`) as `app_user`, tripwire armed. Production was opened
read-only for the `bypass_rls_policy` parity check and nothing else.
**Predecessors:** `guc-binding.md`, `guc-binding-fix.md` (quick-607), quick-624's summary.

---

## Verdict

**Yes, it can be re-asserted at checkout, and it measured clean where per-operation binding did not.**

- **Eviction (quick-624's reproduction):** in every cell, the statement after a connection-killing error ran as the
  right tenant. That covers autocommit statements, interactive transactions, batch transactions, a bare-client error,
  another tenant's error, and the tripwire off. Shipped raised TC001 in the same cells, and returned a silent 0 with
  the tripwire off.
- **Concurrency (quick-607's case):** 64/64 correct on each of four reads, in every configuration: `max:1` and
  `max:5`, with and without injected evictions, cache off and on. **0 wrong-tenant, 0 empty, 0 P2028, 0 TC001.**
  Shipped, measured identically, read the other tenant's value on 20–39 of 64 per read. With evictions at `max:1` it
  raised TC001 64/64 on its tenant-table reads.
- **No new transactions, so no new deadlock.** This is the per-checkout shape, not quick-607's per-operation shape.
  It adds one statement to a checkout that already exists and pins nothing.

Three things had to be found and fixed before it measured clean. Each is structural, and each is the kind of thing
a less adversarial harness would have passed:

1. **The obvious hook is wrong.** Re-asserting on pg-pool's `'acquire'` event gives **wrong-tenant reads, 13–56 of
   64 per read** (§4). The tenant must be captured when `pool.connect()` is called, not when a client is handed over.
2. **Prisma batches `findUnique` across callers.** Two tenants' same-shape `findUnique` in one tick become one
   statement on one checkout, and the second tenant gets **NULL for a row that exists** (§3.2). The fix is to rewrite
   a non-transactional `findUnique` to `findFirst`.
3. **A socket that dies during the assertion crashed the process.** The first prototype turned it into an uncaught
   `'error'` event (§3.3). The fix is a listener held for exactly the assertion window.

**Recommendation: checkout re-assertion, with the per-connection cache, over per-unit binding (§5).** It needs
**no call-site change**. **The 144 gating statements still need routing**: a bare client carries no tenant, so there
is nothing to re-assert.

---

## 1. Where is the tenant known at checkout time?

A pool has no notion of a request, so the tenant has to come from somewhere the pool can reach at the moment it
hands out a connection. Read in source:

- **pg-pool 3.11.0:** `pool.query()` calls `this.connect(cb)`.
- **adapter-pg 7.4.0:** `performIO` calls `this.client.query(...)` on the pool for every non-transactional
  statement, and `startTransaction` calls `this.client.connect()`.
- **So an override of `connect()` on a `pg.Pool` subclass sees every checkout, BEGIN included.** `PrismaPg`
  accepts it, because its only check is `instanceof pg.Pool`.

### 1.1 AsyncLocalStorage: works, if populated by the tenant client and read at `connect()` call time

**Populated by the tenant client itself, not by the request:**
- `createTenantClient(tenantId)` already closes over the tenant.
- The prototype adds a top-level `query.$allOperations` extension that runs each operation inside
  `store.run({ tenantId }, async () => query(args))`. Top-level `$allOperations` also sees `$queryRaw*` and
  `$executeRaw*`.
- A Proxy wraps `$transaction`, which is not an operation, so it opens its connection inside the same context.

The binding therefore belongs to **the client object**. A client held across `await`s, passed into helpers, or
used from `after()` still carries its tenant. No `enterWith`, middleware, or request hook is involved.

**Read in `connect()`, synchronously, in the caller's async context.** Two traps sit right next to this:

- **`pool.on('acquire')` runs in the wrong context.** pg-pool emits it from `_acquireClient`, called by
  `_pulseQueue`. `_pulseQueue` runs from `process.nextTick` inside `connect()`, from `_release()` (the **releasing**
  request's context), or from a new connection's connect callback. At `max:1` under concurrency a waiter is almost
  always served by someone else's release. Measured: wrong tenant on up to 56/64 transaction reads (§4).
- **Prisma's DataLoader dispatches batched requests from the first requester's `nextTick`.** The generated
  runtime's `batchBy` returns a key only for `findUnique`/`findUniqueOrThrow` outside a transaction. Every other
  request goes straight to `singleLoader` in the caller's context. The `findUnique` batch is §3.2.

**Costs:**
- **Round trips:** one extra per checkout (§4.2). The cache removes it for a connection that already holds the value.
- **Private API:** the `findUnique` rewrite reads `__internalParams.transaction` to know it is outside a
  transaction. Rewriting inside a transaction would run `findFirst` on the bare delegate, outside the transaction.
  That is one read of the private field quick-607 §1 warned about, and **only on the unbatch path**.
- **Batching:** same-tick `findUnique` batching is lost.
- **ALS itself:** negligible on Node 24 (AsyncContextFrame).
- **What it relies on:** Prisma keeps executing requests in the caller's async context. The DataLoader already
  breaks that for one operation, and a future Prisma that queues requests more widely would break it silently
  (§6).

### 1.2 A request-scoped (per-tenant) client: plausible, not measured, not recommended

- **The idea:** one `PrismaClient` per tenant, with its own `PrismaPg` over a pool facade closing over `tenantId`.
  No ALS at all, and each tenant would get its own DataLoader, so no cross-tenant batching.
- **The cost:**
  - one engine and client instance per tenant per process;
  - the facade must still share one `pg.Pool`, or `max:1` stops meaning anything;
  - bare and tenant clients become different `PrismaClient`s, so their transactions can never be shared.
- **Not measured, so not recommended** (the brief forbids it).

### 1.3 Ruled out

- **Deriving the tenant from the statement.** The extension injects `tenantId` into `where`, but exempt models
  and raw SQL carry none.
- **A pinned `pg.Client` per request.** adapter-pg has no API for it (quick-607 §3.2, re-confirmed).
- **Per-operation transactions.** That is quick-607's measured and rejected shape.

**Answer:** AsyncLocalStorage supplies it: populated by the tenant client, read inside `pool.connect()` at call
time. A checkout with no tenant in context is set to `''` (fail closed).

---

## 2. The prototype

`625-tenant-checkout.prototype.ts`:

| part | what it does |
|---|---|
| `createCheckoutPool(config, { mode, onNoContext, cacheAssertion, armTripwire })` | `pg.Pool` subclass. `mode: 'connect-call'` captures the store in `connect()` and issues `set_config('app.current_tenant_id', <tenant or ''>, false)` on the delivered client **before** handing it back. On failure it releases the client with the error (evict) and fails the checkout. Mirrors `prisma.ts`'s `''` initialiser and tripwire arm. `mode: 'acquire-event'` is the negative control. |
| socket-error listener | Held on the client for exactly the assertion window (§3.3). |
| `cacheAssertion` | Remembers, per physical connection, the value the last successful assertion set, and skips the round trip when it matches. **Forgets** whenever any statement on that connection mentions `app.current_tenant_id`: `getTenantPrisma*`'s session set, a TRUE-scoped set in a transaction, anything. Starts unknown on a new connection. |
| `createCheckoutTenantClient(base, tenantId, userId, { unbatchFindUnique })` | The shipped `withTenantRLS` + `withAuditColumns`, unchanged, plus the context extension and the `$transaction` Proxy. `unbatchFindUnique` (default on) re-issues a non-transactional `findUnique[OrThrow]` as `findFirst[OrThrow]`. |

---

## 3. Measured against quick-624's reproduction

`625-checkout-eviction.ts`. One **cold process per cell** (quick-610), `max:1`, `app_user`, tripwire on unless
stated. **Tenants:** A (`b5623cdd…`, 1 truck, **3** drivers) and B (`8c6136c4…`, 1 truck, **2** drivers).
`carrierDriver` is exempt from injection, so a wrong-tenant GUC shows up as the wrong **number**, not just an empty
result. `probe` is a raw `SELECT current_setting(...), count(*) FROM carrier_drivers`.

### 3.1 Raw results (`03-checkout-eviction.txt`, cache off)

| cell | prototype | shipped |
|---|---|---|
| control, no error | 1 · 1 · probe `A`/3 | 1 · 1 · probe `A`/3 |
| `SELECT 1/0` caught, then count on the **same** tenant client | 1 · **1** · drivers **3** · probe `A`/3 | 1 · **TC001** · **TC001** · error |
| **bare**-client `SELECT 1/0`, then tenant count | 1 · **1** · probe `A`/3 | 1 · **TC001** · error |
| missing column (42703, the `/home` shape) | 1 · **1** · probe `A`/3 | 1 · **TC001** · error |
| error, then **interactive** `$transaction` | `[1, 3, A/3]` | **TC001** |
| error, then **batch** `$transaction([…])` | `[1, 3]` | **TC001** |
| **tenant B's** error, then A | A 3 · A **3** · probe `A`/3 | A **2** (B's count, before the error) · **TC001** · error |
| socket destroyed during checkout (fix applied) | 1 · error · **1** · probe `A`/3 | 1 · error · **TC001** · error |
| bare `$transaction` setting its own TRUE-scoped GUC (the 64 immune rows) | `[3, A/3]` | `[3, A/3]` |
| bare session `set_config(B)` between two A statements | 3 · **3** · probe `A`/3 | 3 · **2** · probe **`B`/2** |
| **bare** statement after a tenant statement | **TC001** (fail closed) | **3**, inherited `A` |
| same-tick `findUnique`, A and B, unbatch **on** | own row · own row | **NULL (row exists)** · own row |
| same-tick `findUnique`, unbatch **off** | own row · **NULL (row exists)** | — |
| `SELECT 1/0` caught, tripwire **off** | 1 · **1** · **3** · probe `A`/3 | 1 · **0** · **0** · probe `''`/0 |

- **Physical connections:** every prototype eviction cell shows `connects=2 ends=1` and a set sequence like
  `'' → A → '' → A`. The replacement connection's `''` initialiser is followed by the re-assertion.
- **TC001 count:** 0 in every prototype cell except bare-after-tenant.
- **Cache on (`03-checkout-eviction-cache.txt`):** every cell gives the same correct values. The
  foreign-session-set cell reads 3 and probe `A`/3, so the tracker forgot. The socket cell is **not exercised** with
  the cache on: the connection already held A, so no assertion was in flight when the socket was destroyed.

### 3.2 The DataLoader hole

- **Mechanism:** Prisma's batch key for `findUnique` is model + argument **shape** + selection
  (`Cl(protocolQuery)`). Two tenants' `findUnique({ where: { id }, select: { id: true } })` in one tick share a key.
  The batch goes out as one statement, from the first requester's `nextTick`, under the first requester's tenant.
- **Result:** the second tenant's row is filtered out and its caller gets `null`. That is not a leak, but it is a
  silent "not found" on a row that exists, and on injected models too (`where` gains `tenantId`, and the shape still
  matches).
- **No per-checkout scheme can fix this inside one statement.** The fix must stop the batch.
  `findFirst[OrThrow]` is never batched and returns the same result for a unique `where`.
- **Census exposure:** 74 of the 1,342 are `findUnique` outside a transaction (§5.1).
- **Shipped** also mis-answers this cell (A got NULL): last-writer-wins, the quick-607 defect.

### 3.3 The socket-loss crash (found, witnessed, fixed)

- **Mechanism:** pg-pool removes its idle `'error'` listener at checkout. `pool.query()` attaches its own only
  after `connect()`'s callback delivers the client. A socket that dies while the prototype's `set_config` is in
  flight emits `'error'` with no listener, and Node turns that into an uncaught exception.
- **Witnessed before the fix** (`03b-socket-loss-before-fix.txt`): `PROCESS DIED exit=1 … Unhandled 'error' event
  … q625 forced socket loss`.
- **After the fix:** the statement fails (it never runs unscoped), the process survives, and the next statement is
  correct.
- **In the first concurrency run**, the `max:5` injected-error configuration died with no payload, and the `max:1`
  run logged 3 `UNKNOWN` errors on a slow network (118 s against the usual 47 s). **It is not proven that this crash
  caused those.** Six re-runs before the fix and the full re-run after it were all 64/64 with no deaths.

---

## 4. Measured against quick-607's concurrency case

`625-checkout-concurrency.ts`, one cold process per configuration. 8 concurrent iterations × 8 waves = 64, two
tenants alternating, `app_user`, tripwire armed. Each iteration acquires a client, optionally runs a caught
`SELECT 1/0` (every 4th iteration with `--errors`), then:
- **R1:** `carrierDriver.count()`
- **R2:** raw `current_setting` (no RLS table, so an empty GUC reads as `''` rather than raising)
- **R3:** `$transaction(async tx => [current_setting, carrierDriver.count])` with the shipped `TX_OPTIONS`

### 4.1 Raw counts (`04-checkout-concurrency.txt`, the full re-run after all fixes)

| stack | max | evictions | connects | R1 count | R2 GUC read | R3 tx GUC | R3 tx count |
|---|---|---|---:|---|---|---|---|
| **prototype** | 1 | no | 1 | correct 64 | correct 64 | correct 64 | correct 64 |
| **prototype** | 5 | no | 5 | correct 64 | correct 64 | correct 64 | correct 64 |
| **prototype + cache** | 1 | no | 1 | correct 64 | correct 64 | correct 64 | correct 64 |
| **prototype + cache** | 5 | no | 5 | correct 64 | correct 64 | correct 64 | correct 64 |
| **prototype** | 1 | yes | 17 | correct 64 | correct 64 | correct 64 | correct 64 |
| **prototype** | 5 | yes | 21 | correct 64 | correct 64 | correct 64 | correct 64 |
| **prototype + cache** | 1 | yes | 17 | correct 64 | correct 64 | correct 64 | correct 64 |
| **prototype + cache** | 5 | yes | 21 | correct 64 | correct 64 | correct 64 | correct 64 |
| `acquire` event (control) | 1 | no | 1 | 32 · **wrong 32** | 32 · **wrong 32** | 8 · **wrong 56** | 8 · **wrong 56** |
| `acquire` event (control) | 5 | no | 5 | 51 · **wrong 13** | 40 · **wrong 24** | 24 · **wrong 40** | 24 · **wrong 40** |
| `acquire` event (control) | 1 | yes | 17 | 32 · **wrong 32** | 32 · **wrong 32** | 24 · **wrong 40** | 24 · **wrong 40** |
| `acquire` event (control) | 5 | yes | 21 | 49 · **wrong 15** | 25 · **wrong 39** | 38 · **wrong 26** | 38 · **wrong 26** |
| shipped | 1 | no | 1 | 32 · **wrong 32** | 32 · **wrong 32** | 32 · **wrong 32** | 32 · **wrong 32** |
| shipped | 5 | no | 5 | 27 · **wrong 37** | 25 · **wrong 39** | 36 · **wrong 28** | 36 · **wrong 28** |
| shipped | 1 | yes | 81 | **TC001 64** | **empty 64** | **TC001 64** | **TC001 64** |
| shipped | 5 | yes | 37 | 28 · wrong 20 · TC001 16 | 28 · wrong 20 · empty 16 | 26 · wrong 22 · TC001 16 | 26 · wrong 22 · TC001 16 |

**Against the bar** (quick-607's 128/128: zero wrong-tenant, zero empty, zero deadlocks). Prototype, both pool sizes:
- **cache off:** 128/128 on each of R1, R2, R3 clean, and again 128/128 with evictions;
- **cache on:** the same.

Across all 64 × 4 reads × 8 prototype configurations: **0 wrong-tenant, 0 empty, 0 P2028, 0 TC001, 0 unknown
errors.**

Two notes on reading the table:
- **Shipped's R1 wrong-tenant results are not model-level leaks.** `carrierDriver` is exempt from injection, so
  RLS is the only filter, and the wrong GUC admits the other tenant's rows. On injected models the same wrong GUC
  gives an empty result instead (quick-607 `guc-binding.md`).
- **Shipped `max:1` with evictions is 64/64 TC001.** One eviction every fourth iteration starves the whole run,
  because nothing on the shipped path ever re-issues the GUC on a replacement connection: 81 connections, every one
  at `''`.

### 4.2 Per-checkout cost (`05-checkout-cost.txt`)

60 sequential `carrierDriver.count()` on one warm connection, and 60 bare `SELECT 1`. Measured from this laptop to
us-west-1:

| stack | wire statements per op | median model op | median bare `SELECT 1` |
|---|---:|---:|---:|
| shipped | 1 | 64.4 ms | 63.0 ms |
| prototype | 2 | **130.9 ms** | **127.3 ms** |
| prototype + cache | (see note) | 66.9 ms | 64.9 ms |

- **Without the cache, every checkout pays one extra round trip.** That includes bare statements, because `''` is
  asserted too. **This matters for production:** `vercel.json` sets no `regions`, and `prisma.ts` documents
  functions in iad1 against Supabase us-west-1, so the extra trip is cross-country. The iad1 → us-west-1 round trip
  itself was **not measured** here.
- **With the cache, cost returns to shipped's level** whenever a connection keeps serving the same context.
- **The cache stops helping when contexts interleave on one connection.** Alternating bare and tenant statements,
  or two tenants, miss it every time. `getTenantPrisma*`'s own session `set_config` also forces a miss. That is
  reasoning from the invalidation rule, not a measurement, and is the reason §6 lists removing that `set_config` as
  part of adoption.
- **Instrument note:** the cache stack's wire-statement column read **0**. That is an artefact: the per-connection
  tracker binds pg's `query` before the benchmark's counter patches the prototype, so its statements bypass the
  counter. Latency is the valid measure for that row.

---

## 5. The two options, on evidence

### 5.1 Checkout re-assertion

**What it fixes, by census class** (`census-sizing.cjs` over quick-623's regenerated census, `06-census-sizing.json`).
The exposed set is quick-624's rule verbatim: **1,342 rows, 281 files, 569 function units.**

| class | rows | mechanism | measured by |
|---|---:|---|---|
| autocommit model operation on a tenant client | 924 | own checkout re-asserts | §3.1 rows 2–4, §4 R1 |
| inside `TX(TENANT_*)` | 334 | `$transaction` Proxy; checkout at BEGIN | §3.1 interactive/batch, §4 R3 |
| `findUnique[OrThrow]` outside a transaction | 74 | re-issued as `findFirst` (unbatch) | §3.1 same-tick cells |
| raw on a tenant client | 10 | top-level `$allOperations` | `probe` in every cell, §4 R2 |

**All 1,342 are covered structurally, with no call-site change.** 1,268 need nothing beyond the pool and client.
The 74 also depend on the unbatch rewrite.

**Cost:** one round trip per checkout (130.9 ms against 64.4 ms here), or none with the cache while contexts don't
interleave. One private-API read on the unbatch path. Loss of same-tick `findUnique` batching.

**What it cannot fix:**
- **The bare client. The 144 routing statements still need routing. Stated explicitly.**
  - `SILENT_ZERO_AT_CUTOVER` is 155 rows, 52 files, 79 units as scanned. 126 are `BARE`, 18 `TX(BARE)`, 11 mixed.
    Correcting for the 11 driver-pay rows (quick-623) gives 144.
  - They carry no tenant, so checkout asserts `''`. Measured: a bare statement after a tenant statement raised
    TC001 (§3.1). The tripwire off would give a silent 0.
  - Checkout re-assertion **does** turn quick-610/621's silent inheritance into a loud failure, because the bare
    client no longer reads the previous checkout's tenant. It does not supply the missing tenant.
  - The 56 `SILENT_ZERO_AT_BYPASS_DROP` rows (`TX(BARE)`, bypass-flagged) are likewise untouched.
- **A tenant-client operation inside a bare `prisma.$transaction` callback.** It still runs on a separate checkout,
  so it is correct, but it still deadlocks at `max:1`. That is pre-existing and not made worse (quick-607 §4a).
- **A GUC write with no statement text naming it** (a server-side function, `RESET ALL`, `DISCARD ALL`) is invisible
  to the cache. None exist today: grep finds no `RESET ALL`/`DISCARD ALL` in `src` outside generated code, and no
  `set_config('app.current_tenant_id'` in any migration. The cache depends on that staying true. Without the cache there is
  no such dependency.
- **Any future Prisma change that executes a request outside the caller's async context.** The DataLoader already
  does it for one operation (§1.1). This fails silently: a wrong-context checkout asserts `''` (fail closed) or
  another tenant.

### 5.2 Per-unit binding (`withTenantContext`)

**Re-sized against the census** (same AST unit rule, innermost named enclosing function):

| | quick-607's scope | now |
|---|---:|---:|
| units | 456 (units that **acquire** a tenant client) | **569** units containing an exposed statement; **623** including the 79 gating units |
| files | 198 | **281** exposed; **314** including gating |

The unit definitions differ, so the counts are not directly comparable. quick-607 counted acquiring functions;
this counts the innermost function containing each statement, which splits helpers from their callers.

**What it needs beyond the count:**
- **133 of the 569 units already open their own transaction on the tenant client.** Wrapped in `withTenantContext`,
  each nests a transaction inside a transaction, which is the 6/6 deadlock shape at `max:1` (quick-607 §4). Every
  one has to be restructured, not wrapped.
- A unit becomes atomic. quick-611's 16 DORMANT swallowed-error sites become live `25P02` cascades the moment their
  function is wrapped.
- Slow I/O inside a callback holds the only connection at `max:1`.

**Measured evidence for it:** `guc-binding.md` §4.1, 128/128 clean at both pool sizes, on the TRUE-scope
transaction shape.

**What it fixes that re-assertion does not:** nothing on the 1,342. On the 144 it is an alternative **routing**
target, not a way to avoid routing: those statements still have to move onto something that carries a tenant.

### 5.3 Recommendation

**Checkout re-assertion, with the cache and with `unbatchFindUnique` on.**
- It is measured at the bar on both pool sizes, with evictions, and against the shape that broke the per-operation
  prototype.
- It covers all 1,342 exposed rows with **zero call-site changes**, where per-unit binding touches 569–623 units,
  133 of which must be restructured.
- **The 144 still need routing.** Re-assertion makes their failure loud; it does not scope them.

**What choosing it leaves open, which per-unit binding would have closed:**
- **Binding is implicit, per client object, and relies on Prisma preserving async context.** Per-unit binding is
  explicit and visible in every function.
- **One private-API read on the unbatch path.**
- **One round trip per checkout whenever the cache misses.** Per-unit binding pays a round trip per unit instead.
- **Correctness depends on every GUC write being visible as statement text** while the cache is on.

---

## 6. Blast radius of the recommendation

**Files that would change (none changed here):**

| file | change |
|---|---|
| `src/lib/db/prisma.ts` | `new Pool` → the checkout pool subclass (connect-call, cache, socket listener). Initialiser and tripwire arm unchanged. |
| `src/lib/db/tenant-client.ts` | Add the context extension, `unbatchFindUnique`, and the `$transaction` Proxy after the two existing extensions. |
| `src/lib/context/tenant-context.ts` | Delete the two session `set_config` calls in `getTenantPrisma` and `getTenantPrismaForOrg`. They become redundant, and each one forces a cache miss. |
| a guard test | Pin the three findings: connect-call capture, never the acquire event; unbatch on; socket listener. Plus a harness in CI or pre-cutover, because a unit test cannot see async-context propagation. |

**Call sites that change: zero.** `getTenantPrisma*()` keeps its signature. `withTenantRLS` and `withAuditColumns`
keep their bodies.

**What could break that these harnesses would not catch:**
- **Bare-client paths that work today only by inheriting a tenant GUC start failing.** TC001 on staging, a silent 0
  under `app_user` with the tripwire off. This is the latent quick-610/621 class, now loud. It is desirable, but
  click-throughs will read it as a regression. On production's current `postgres` role RLS is inert, so users see
  no change until the cutover.
- **Latency.** Cross-region checkouts double whenever the cache misses, and the cache misses by design on
  connections that interleave bare and tenant statements. These harnesses ran from a laptop; iad1 → us-west-1 was
  not measured.
- **Any `instanceof`, identity or `Prisma.getExtensionContext` use of the tenant client**, which becomes a Proxy.
  Not found by grep, not tested.
- **`findUnique` batching loss** on pages that fan out many same-shape lookups in one tick.
- **A Prisma upgrade** that changes the DataLoader, queues requests in a shared context, or renames
  `__internalParams`. Each fails silently: the unbatch rewrite would stop detecting transactions (it would then
  rewrite inside a transaction and run outside it), or a checkout would see no context and assert `''`. Only a
  concurrency harness like `625-checkout-concurrency.ts` catches this.
- **A GUC write that doesn't name the GUC in statement text** (a SQL function, `RESET ALL`, `DISCARD ALL`) while the
  cache is on. That would give wrong-tenant reads, and only a test that exercised that exact statement would see it.
- **`after()`, cron and multi-tenant loops are expected to be fine**, because the binding is per client object.
  But only two tenants in one process were measured, not a long-running cron iterating many.

---

## 7. What was touched

- **Repo:** one prototype and two harnesses under `apps/web/scripts/audit/`, a copied preconditions script, this
  document, and the quick-625 planning directory. **No `src` or `tests` file changed.**
- **The prototype was first placed at `src/lib/db/tenant-checkout.prototype.ts`, and the full vitest run turned two
  guards red:**
  - `tenant-mechanism-fence` (a new file referencing `withTenantRLS`: 8 files against an allowlist of 7);
  - `wrapper-migration-countdown` (a new `src` file changes the totals).
  
  Both guards were right. Rather than add an allowlist entry and regenerate the countdown artefact for a prototype,
  the file moved to `scripts/audit/`, which neither corpus scans. That is the same boundary the fence's header already
  records for `618-finduniq-probe.ts`. Only its imports and header changed. A smoke re-run from the new location
  (`07-after-move-smoke.txt`) reproduced the eviction cells and a 64/64 injected-error configuration exactly.
- **Staging:** read only. No rows written, no DDL, no role or password change. The two tenants used already existed.
- **Production:** `pg_policies` read for the parity check. Nothing else.
