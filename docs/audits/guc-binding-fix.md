# Can the tenant GUC be bound to the query inside the Prisma extension?

**Date:** 2026-09-12
**Scope:** investigation and prototype only. No call site changed; the shipped
`tenant-rls.ts` and `tenant-context.ts` are untouched.
**Prototype:** `apps/web/src/lib/db/extensions/tenant-rls-bound.prototype.ts` — a new file,
**imported by nothing**.
**Target:** `drivecommand-staging` (`wyixpgunnjmzguhggocz`). Production never connected to, never written.
**Predecessor:** `docs/audits/guc-binding.md`.

---

## Verdict

**Yes, it can bind — and no, this version should not ship.**

In-transaction state *is* observable (§1), and a prototype built on it binds correctly: at
`max: 5`, **64/64 operations correct, 0 wrong-tenant, 0 empty, 0 P2028**, with the wire trace
confirming `BEGIN → set_config(TRUE) → SELECT → COMMIT` on one connection for every query.
That clears the audit's isolation bar.

It fails on two other axes, both structural rather than tunable:

1. **At production's `max: 1` it fails 25 of 64 requests with P2028** — *"Unable to start a
   transaction in the given time."* Binding requires a transaction; a transaction pins a
   connection; `max: 1` has one to give. Global `transactionOptions` raises the success rate but
   does not close it (§5.2).
2. **One transaction shape deadlocks 6/6** — an outer transaction opened on the *bare* client with
   a tenant-client operation inside it. The extension sees no transaction, opens one, and blocks on
   the connection the outer already holds. That is the original P2028, re-entered through a new
   door (§4.1). ~17 feature files would need inspecting.

It also depends on `__internalParams`, private Prisma API, for the thing that makes it work.

**Recommendation: do not pursue extension-level binding. Take the call-site wrapper (§3.3),**
which is what the predecessor audit already recommended and what `tenantRawQuery` already
implements — now with direct evidence for why the two cheaper-looking options are worse.

---

## 1. Is in-transaction state observable?

**Observable.** The query-extension callback receives a fifth property beyond the documented four:

```
$allOperations arg keys: ["model","operation","args","__internalParams","query"]
```

`__internalParams.transaction` is the transaction descriptor. Measured against the real runtime
(`@prisma/client` 7.6.0, generated client in `src/generated/prisma`):

| context | `__internalParams.transaction` |
|---|---|
| no transaction | `undefined` |
| `$transaction(async tx => …)` | `{ kind: 'itx', id: '6b2cd380-…' }` |
| `$transaction([…])` | `{ kind: 'batch', id: 1 }` |

The runtime source confirms it is deliberate and passed **by reference**, not copied
(`src/generated/prisma/runtime/client.js`, extension-chain runner):

```js
return r[n]({
  model: t.model,
  operation: t.model ? t.action : t.clientMethod,
  args: Go(t.args ?? {}),
  __internalParams: t,
  query: (s, a = t) => { …; a.args = s; return Wo(e, a, r, n + 1) }
})
```

Two things follow from that snippet, and both are load-bearing:

- `query(args)` returns a **PrismaPromise**, so it can be placed inside a `$transaction([…])` array
  rather than merely awaited. This is what makes binding possible at all.
- The extension callback's `this` is **not a client** (`this.constructor.name === 'Array'`; no
  `$queryRawUnsafe`, no `_request`). `Prisma.getExtensionContext(this)` returns no client either.
  The only client handle available is the `client` argument to
  `Prisma.defineExtension((client) => …)`, which the shipped extension already has in scope.

**Caveat, stated up front rather than in a footnote.** `__internalParams` is private API — the
double underscore is Prisma saying so. It is not in the documented `$allOperations` signature, it
carries no stability guarantee, and a Prisma patch release may rename or remove it. A tenant
isolation boundary that silently degrades when a dependency changes shape is a bad trade: if
`__internalParams.transaction` ever reads `undefined` inside a transaction, this design opens a
transaction while one is held, which is a **deadlock**, and if it ever reads truthy outside one,
the GUC is never set, which is a **silent empty result**. Both failure directions are bad and
neither is loud.

---

## 2. The prototype

`apps/web/src/lib/db/extensions/tenant-rls-bound.prototype.ts`. Injection logic is byte-identical
to the shipped extension so that binding is the only variable. Three paths:

| situation | what it does |
|---|---|
| no transaction | `client.$transaction([ $executeRawUnsafe(set_config, TRUE), query(args) ])`, returns `[1]` |
| inside an `itx` | issues `set_config(TRUE)` **on that same itx**, opens nothing |
| inside a `batch` | passes through **unbound** — see the limitation below |

Two details that are not incidental:

- **Exempt models are bound too.** They are exempt from tenantId *injection* because they have no
  such column; they are not exempt from *RLS*, whose policies on those carrier tables read the same
  GUC via `orgId = current_tenant_id()`. Binding only the injected models would leave every carrier
  table unprotected at cutover.
- **The itx path is cached** by `${itxId}:${tenantId}`, so a transaction running ten operations
  issues one `set_config` rather than ten. Keyed by both, never by itx id alone, so a descriptor
  cannot inherit another tenant's binding.

The itx path needs private API. `client._request({ action:'executeRaw', transaction: tx, args:{ query,
parameters } })` is the only way to attach a raw statement to a transaction somebody else opened —
the public `$executeRawUnsafe` binds to whichever transaction its *client object* carries, and the
extension is handed no client object (§1). Awaiting a public raw call there would run it outside the
caller's transaction, on a second connection, which at `max: 1` is the deadlock this design exists to
avoid. Verified working:

```
_request on an existing itx: SUCCEEDED
GUC seen inside the outer itx afterwards: "11111111-2222-3333-4444-555555555555"
```

**Batch limitation.** Inside `$transaction([…])` the operation is already in a transaction, so
opening another would deadlock, and injecting an extra request into a running batch changes the
result arity the caller destructures. Measured cost of passing through unbound, `app_user`, 6
attempts: **6 succeeded, 0 P2028, and every one returned `[]`** — RLS with no GUC returns nothing.
So batch operations keep exactly today's broken behaviour: silent empty results, no error.

**Wire trace of one bound operation** — the mechanism doing what it claims:

```
WIRE: "BEGIN"
WIRE: "SELECT set_config('app.current_tenant_id', $1, true)"  values=["befc8b2f-…"]
WIRE: "SELECT … FROM \"public\".\"Truck\" WHERE …"             values=["befc8b2f-…","GUCFIX","0"]
WIRE: "COMMIT"
result: [{"model":"MODEL-A"}]
```

`set_config` and the query are in one transaction on one connection, and TRUE scope means the value
is gone at `COMMIT` (verified: a read after the batch returns `""`).

---

## 3. Alternatives

Step 3 was conditional on in-transaction state being unobservable. It is observable, so the
prototype was built — but since the prototype fails §4 and §5.2, the alternatives decide the
outcome and are evaluated here.

### 3.1 AsyncLocalStorage flag set by `tenantRawQuery` and anything opening an outer transaction

The extension reads an ALS flag instead of `__internalParams` to learn whether a transaction is
open. **Cost:** removes the private-API dependency but not the deadlock — knowing a transaction is
open does not let the extension put the GUC *on* it, so the itx path still needs `_request` or the
call site must set the GUC itself. And the flag has to be set by **every** site that opens a
transaction (255 `prisma.$transaction` occurrences); one missed site is a deadlock at `max: 1`, and
the failure is a request that hangs to timeout rather than a test that goes red. It is the
call-site change of §3.3 with worse ergonomics and a weaker guarantee.

### 3.2 `getTenantPrisma` returns a client pinned to a connection for the request

**Cost: not implementable on this stack.** Re-confirmed from `@prisma/adapter-pg` 7.4.0: non-
transactional statements go through `PgQueryable.performIO` → `this.client.query(...)` where
`this.client` is the `pg.Pool` — checkout and release per statement. The only code path that holds
a client is `startTransaction`'s `this.client.connect()`. An interactive transaction *is* Prisma's
connection-pinning primitive, so this reduces to §3.3. Pinning outside a transaction would mean
holding a `pg` client across the request and driving Prisma through it, which the adapter has no
API for.

### 3.3 One wrapper that owns the transaction, entered by every tenant-scoped path — **chosen**

`withTenantContext(tenantId, cb)`: opens one interactive transaction, issues
`set_config('app.current_tenant_id', $1, TRUE)` first, hands the callback a tx client extended with
`withTenantRLS` and `withAuditColumns`.

**Why this one:**

- **It is the only option measured clean at production's pool size.** The predecessor audit ran this
  exact shape at `max: 1` and `max: 5`, 16-way concurrent: **128/128 correct, 0 P2028, 0 leaks**. The
  prototype cannot match that at `max: 1` (§5.2) because it opens a transaction *per operation*
  rather than per unit of work — 10 queries become 10 connection acquisitions instead of 1.
- **It uses public API only.** No `__internalParams`, no `_request`. Nothing silently changes
  meaning when Prisma is upgraded.
- **It has no batch blind spot**, because raw queries and model queries alike run on the tx client.
  The prototype cannot cover raw queries at all — `$queryRaw` never enters `$allModels`, so under
  the prototype the 350 raw sites stay exactly as exposed as they are today.
- **It already exists and already runs in production.** `tenantRawQuery` is this shape, with 26
  invocations including 11 per request on the app's highest-frequency poller, and no P2028 in 7 days
  of production runtime errors.

Its cost is real and was stated in the predecessor audit: ~90 `getTenantPrisma()` call sites and 350
raw occurrences across 134 files move inside a callback, and nothing inside a tenant context may
open another top-level transaction. That is a large, *visible*, statically-checkable change. The
prototype's cost is a small invisible change plus two failure modes that only appear under
concurrency in production.

---

## 4. Does P2028 reproduce against the prototype?

**Yes — in one shape, deterministically.** Run as `app_user`, `max: 1`, 6 attempts each,
`{maxWait: 4000, timeout: 8000}`.

| shape | succeeded | **P2028** | other |
|---|---|---|---|
| **4a** outer `prisma.$transaction` on the **bare** client, tenant-client model op inside | **0** | **6** | 0 |
| **4b** outer tx, op on the tx client via `tx.$extends(...)` | 0 | 0 | 6 (`tx.$extends is not a function`) |
| **4c** control: the audit's old nested array-tx | 0 | 6 | 0 |
| **4d** the **tenant client itself** opens the itx | **6** | **0** | 0 |

4d returned the right rows per tenant (`A:["MODEL-A"] B:["MODEL-B"] …`), so when the extension can
see the transaction it takes the safe path and works.

### 4.1 Which shape breaks, and how much of the codebase is in it

**4a is the killer.** The transaction is opened on a *different client object* than the one running
the tenant-scoped operation, so `__internalParams.transaction` is `undefined`, the extension opens a
batch, and it blocks on the connection the outer transaction already holds. This is exactly the
deadlock the shipped extension's header forbids, re-entered through a new door — and the shipped
extension does **not** have it (it opens nothing), so this is a regression the prototype introduces.

4b establishes that the obvious workaround is unavailable: **an interactive transaction client does
not expose `$extends`**, so feature code cannot extend a `tx` into a tenant client.

Counting the exposure required care, because `const prisma = await getTenantPrisma()` **shadows** the
imported bare client in several files — `(owner)/actions/loads.ts` does this, so its
`prisma.$transaction` calls are tenant-client transactions (safe shape 4d), not bare ones. Splitting
on that:

| | files |
|---|---|
| `prisma.$transaction` where `prisma` is a shadowed tenant client (safe, 4d) | 11 |
| `prisma.$transaction` on the imported bare client | 124 |
| …of those, files that **also** obtain a tenant client — the 4a risk set | **20** (17 excluding the two extension files and `tenant-context.ts`) |

Those 17 need line-by-line inspection to see whether a tenant-client operation actually executes
inside a bare transaction. Co-occurrence in a file is not proof of the shape — but a single instance
deadlocks every time it runs, and it will not show up in any test that is not concurrent and not at
`max: 1`.

### 4.2 A P2028 that is *not* the prototype's fault

Three operations inside one tenant-opened itx, 6 concurrent, `max: 1`, gave 2 P2028 — which looked
damning until the control was run:

| pool `max` | shipped extension | prototype |
|---|---|---|
| 1 | succeeded=3, **P2028=3** | succeeded=4, **P2028=2** |
| 5 | succeeded=6, P2028=0 | succeeded=6, P2028=0 |

Six concurrent interactive transactions starve a one-connection pool **regardless of extension**.
That P2028 is pre-existing and is not attributable to the prototype. Recorded so it is not
double-counted against it.

---

## 5. Step 5 — the concurrency harness, raw counts

8-way concurrent waves, two tenants alternating, 64 iterations per configuration, `app_user`,
against staging. `shipped` fires the session-scope `set_config` first, exactly as
`getTenantPrismaForOrg` does, so the control is honest. "wire" counts come from instrumenting the
`pg` pool and pairing each `"Truck"` SELECT with the `set_config` inside its own `BEGIN…COMMIT` on
the same physical connection.

### 5.1 Raw counts

| | **prototype max=1** | **shipped max=1** | **prototype max=5** | **shipped max=5** |
|---|---|---|---|---|
| rows correct (own tenant) | **39** | 32 | **64** | 31 |
| rows EMPTY (GUC empty/wrong) | **0** | **32** | **0** | **33** |
| rows CROSS-TENANT | **0** | 0 | **0** | 0 |
| errors total | **25** | 0 | **0** | 0 |
| …of which **P2028** | **25** | 0 | **0** | 0 |
| wire: SELECTs in a tx **with** a bound `set_config` | **39** | **0** | **64** | **0** |
| wire: SELECTs with **no** bound `set_config` | **0** | **64** | **0** | **64** |
| wire: distinct tenant ids on those `set_config`s | `["befc8b2f","7a1d0f07"]` | `[]` | `["befc8b2f","7a1d0f07"]` | `[]` |
| physical connections opened | 1 | 1 | 5 | 5 |

Against the bar (128/128 — zero wrong-tenant, zero empty, zero deadlocks):

- **Isolation: passes outright.** Zero wrong-tenant and zero empty in all 128 prototype iterations,
  and every single query that executed was bound — 39/39 at `max: 1`, 64/64 at `max: 5`, 0 unbound.
  The shipped extension, measured identically, was unbound 128/128 and empty 65/128, reproducing the
  predecessor audit's result.
- **Deadlocks: fails at `max: 1`.** 25 P2028 in 64. Clean at `max: 5`.

So: **103/128 overall**, and the 25 failures are all availability, none correctness.

### 5.2 The `max: 1` failure is structural, not a timeout to tune

The error is `P2028 … Transaction API error: Unable to start a transaction in the given time.`
Raising Prisma's global acquire budget helps and does not fix it (64 concurrent, `max: 1`):

| `transactionOptions` | succeeded | P2028 |
|---|---|---|
| default | 4 | **60** |
| `{ maxWait: 15000, timeout: 30000 }` | 33 | **31** |

Binding requires a transaction, a transaction pins a connection, and `max: 1` has exactly one. The
prototype opens one **per operation**, so N concurrent operations need N sequential connection
acquisitions. The chosen approach (§3.3) opens one **per unit of work**, which is why the same
topology measured 128/128 clean for it. Raising the pool would help but is a production topology
change with its own Supabase connection-limit consequences — out of scope here, and not something to
smuggle in as a side effect of a security fix.

---

## 6. Blast radius of the chosen approach (§3.3)

**Files that change:** 2 to add the mechanism (`tenant-context.ts` gains `withTenantContext`;
`tenant-client.ts` gains a tx-client variant). Then the migration: ~90 files holding
`getTenantPrisma()` call sites, plus 134 files carrying the 350 `$queryRaw`/`$executeRaw`
occurrences that do not already go through `tenantRawQuery`. `tenant-rls.ts` itself needs no change
— injection stays exactly as it is.

**Must call sites change?** Yes, and that is the honest cost. There is no version of this that
leaves call sites alone: every option that does (the prototype, §3.1, §3.2) either fails at `max: 1`
or cannot be built on this adapter. The migration can be incremental — `withTenantContext` can land
and be adopted file by file while `getTenantPrisma` keeps working — but the cutover to `app_user`
cannot happen until the last one moves, because anything left behind returns silent empties.

**What could break that the harness would not catch:**

- **Nested transactions inside a tenant context.** The wrapper owns the outermost transaction, so
  any feature code that opens its own inside it deadlocks — the §4 shape, with the same 6/6
  determinism. The 17-file risk set is the place to start, but the real check is a lint/grep gate
  forbidding `prisma.$transaction` inside a `withTenantContext` callback, not a test.
- **Long-held connections.** One transaction per unit of work means a slow external call inside a
  callback (R2 upload, OSRM, an email) now holds a database connection for its duration. At `max: 1`
  that serialises the worker. The harness does no I/O inside the callback and would never show this.
- **Transaction semantics changing silently.** Work that is currently several autocommit statements
  becomes atomic. A partial write that used to persist now rolls back wholesale. That is usually an
  improvement and occasionally a behaviour change nobody asked for.
- **`after()` and cron paths.** They do not go through a request-shaped wrapper today. Anything not
  migrated inherits whatever tenant last ran in that worker (predecessor audit §3) — and at cutover
  starts returning nothing instead. Silent, and invisible to a concurrency harness.
- **Interactive-transaction timeouts under real payloads.** `timeout: 30000` bounds the whole unit of
  work, not one query. A page that fans out twenty queries inside one context has a new failure mode
  the harness's single-query iterations cannot produce.

---

## 7. What was touched

**Repo:** one new file, `apps/web/src/lib/db/extensions/tenant-rls-bound.prototype.ts`, imported by
nothing. `tsc --noEmit` is **0 errors** with it in the tree — verified against a deliberate probe
(`const __probe: number = "not-a-number"`), which tsc reported and nothing else, so the gate was live
rather than blind; the probe was then deleted.

**Staging:**

| change | state |
|---|---|
| `app_user` password set, recorded as `STAGING_DATABASE_URL_APP_USER` in `apps/web/.env.staging` (gitignored) | **left in place** — the brief asked for it. Role already had `LOGIN` and `rolbypassrls = false`; it simply had no password. Verified logging in on both `:6543` and `:5432` |
| 2 tenants `gucfix-a` / `gucfix-b`, 2 `"Truck"` rows `make='GUCFIX'` | deleted; residual count verified 0 |

The stale header in `.env.staging` claiming the role "does not exist on staging yet" was replaced
when the connection string was recorded.
