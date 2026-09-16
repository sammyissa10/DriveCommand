---
phase: quick-625
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, tenant-guc, connection-pool, async-local-storage, prisma-dataloader, tc001]
requires:
  - quick-624 (pg-pool evicts the connection holding the session GUC)
  - quick-607 (docs/audits/guc-binding-fix.md: per-operation binding rejected)
  - quick-623's regenerated query census
provides:
  - an answer to "where is the tenant at checkout": AsyncLocalStorage, populated by the tenant client, read in pool.connect() at CALL time
  - a working checkout re-assertion prototype (scripts/audit/625-tenant-checkout.prototype.ts), measured at the bar
  - three structural traps found and measured (acquire-event context, cross-tenant findUnique batching, socket-loss crash)
  - both options sized against the census; recommendation and blast radius (docs/audits/guc-checkout-reassertion.md)
affects: []
decisions:
  - "recommend checkout re-assertion (connect-call capture + unbatchFindUnique + per-connection cache) over per-unit withTenantContext"
  - "the 144 gating statements STILL need routing: a bare client carries no tenant to re-assert"
  - "prototype lives in scripts/audit/, not src: an in-src placement turned the tenant-mechanism fence and wrapper countdown red, and both were right"
metrics:
  eviction_cells: "14 cells × prototype/shipped, cache off and on, cold process each"
  concurrency: "prototype 64/64 on 4 reads × 8 configs; 0 wrong-tenant, 0 empty, 0 P2028, 0 TC001"
  cost: "median 64.4 ms shipped · 130.9 ms re-assert · 66.9 ms re-assert+cache (laptop → us-west-1)"
  census: "1,342 exposed rows / 281 files / 569 units all covered; per-unit binding 623 units / 314 files, 133 nest a transaction"
  completed: 2026-09-16
---

# quick-625: the tenant GUC CAN be re-asserted at checkout

Executed inline by the orchestrator, as quick-624 was. `625-PLAN.md` records why. The full write-up with every raw
count is **`docs/audits/guc-checkout-reassertion.md`**; this summary gives the numbers the brief asked for.

## 0. Preconditions and baseline

- **Staging** (`625-preconditions.ts`, `00-preconditions.txt`):
  - `app_user`, `rolbypassrls=false`;
  - tripwire armed: unscoped TC001, scoped 1 row, disarmed silent 0;
  - `bypass_rls_policy` 86 on 86 tables, sorted list identical to production (sha256 `315c31b0…` both).
- **Vitest from the working tree at `43b480ef`, before any edit:** `2145 · 2026 · 64 · 52`, 25 failing files,
  identical to quick-624's close.

## 1. Where the tenant comes from at checkout

**AsyncLocalStorage**, populated by the tenant client and read inside `pool.connect()` at call time.
- **Populating it:** a top-level `$allOperations` extension on the client wraps every operation (raw included) in
  `store.run({tenantId})`, and a Proxy wraps `$transaction`.
- **Reading it:** a `pg.Pool` subclass overrides `connect()`, which `pool.query()` and adapter-pg's
  `startTransaction` both go through, and issues `set_config(…, false)` before handing the client back.
- **The binding belongs to the client object, not the request.**

Traps next to it, each read in source and then measured:
- **`pool.on('acquire')` runs in the context that pulsed the queue**, usually another request's release. It gives
  wrong-tenant reads (§4).
- **Prisma's DataLoader batches same-shape `findUnique` across callers** and dispatches from the first caller's
  `nextTick` (§3).

Also covered in the audit: a per-tenant `PrismaClient` over a pool facade (plausible, **not measured, not
recommended**), and the options ruled out (statement parsing, a pinned client per request, per-operation
transactions).

## 2. Prototype

`apps/web/scripts/audit/625-tenant-checkout.prototype.ts`: connect-call capture, fail-closed `''` for no context,
fail-closed eviction if the assertion fails, a socket-error listener for the assertion window, an optional
per-connection cache that forgets on any statement naming the GUC, and `unbatchFindUnique`. The shipped `prisma.ts`,
`tenant-rls.ts`, `tenant-client.ts` and `tenant-context.ts` are untouched.

## 3. Against quick-624's reproduction (cold process per cell, raw)

| cell | prototype | shipped |
|---|---|---|
| caught `SELECT 1/0`, then count on the same tenant client | **1**, drivers **3**, GUC `A` | **TC001**, TC001 |
| caught 42703 | **1**, GUC `A` | **TC001** |
| bare-client error, then tenant count | **1**, GUC `A` | **TC001** |
| error, then interactive tx | `[1, 3, A]` | **TC001** |
| error, then batch tx | `[1, 3]` | **TC001** |
| tenant B's error, then A | **3**, GUC `A` | **TC001** (and A's first read returned **2**, B's count) |
| tripwire **off**, caught `SELECT 1/0` | **1 / 3**, GUC `A` | **0 / 0**, GUC `''` |
| socket destroyed during checkout | error, then **1**, GUC `A`, process alive | error, then **TC001** |
| bare session `set_config(B)` between two A reads | **3**, GUC `A` | **2**, GUC `B` |
| same-tick `findUnique` A+B (unbatch on) | own · own | **NULL** (A) · own |
| same-tick `findUnique` A+B (unbatch **off**) | own · **NULL** (B, row exists) | — |
| bare statement after a tenant statement | **TC001** (fail closed) | **3** (inherited A) |

- **With the cache on, every value is identical.** The foreign-set cell proves the invalidation. The socket cell is
  not exercised with the cache on, because no assertion was in flight.
- **Found and fixed during step 3:**
  1. The DataLoader hole (unbatch off → NULL for an existing row).
  2. The socket-loss crash: before the fix, `PROCESS DIED exit=1 … Unhandled 'error' event`
     (`03b-socket-loss-before-fix.txt`).

## 4. Against quick-607's concurrency case (raw counts, 64 iterations, 8-way, two tenants)

| stack | max | evictions | R1 count | R2 GUC | R3 tx GUC | R3 tx count |
|---|---|---|---|---|---|---|
| prototype | 1 | no | 64 ok | 64 ok | 64 ok | 64 ok |
| prototype | 5 | no | 64 ok | 64 ok | 64 ok | 64 ok |
| prototype | 1 | yes | 64 ok | 64 ok | 64 ok | 64 ok |
| prototype | 5 | yes | 64 ok | 64 ok | 64 ok | 64 ok |
| prototype + cache | 1 / 5 | no / yes | 64 ok ×4 | 64 ok ×4 | 64 ok ×4 | 64 ok ×4 |
| acquire event | 1 | no | **wrong 32** | **wrong 32** | **wrong 56** | **wrong 56** |
| acquire event | 5 | no | **wrong 13** | **wrong 24** | **wrong 40** | **wrong 40** |
| shipped | 1 | no | **wrong 32** | **wrong 32** | **wrong 32** | **wrong 32** |
| shipped | 5 | no | **wrong 37** | **wrong 39** | **wrong 28** | **wrong 28** |
| shipped | 1 | yes | **TC001 64** | **empty 64** | **TC001 64** | **TC001 64** |

- **Prototype, all 8 configurations:** 0 wrong-tenant, 0 empty GUC reads, 0 P2028, 0 TC001, 0 unknown errors.
  Against quick-607's bar that is **128/128 on every read**, cache off and on, with and without evictions.
- **Rows not shown** (acquire with errors, shipped `max:5` with errors) are in the audit §4.1.

**Cost** (60 sequential ops, laptop → us-west-1, medians): shipped 64.4 ms · re-assert 130.9 ms (2 statements per
op) · re-assert + cache 66.9 ms. Production is iad1 → us-west-1; that round trip was not measured.

## 5. The two options

**Checkout re-assertion covers all 1,342 exposed rows** (281 files, 569 units) **with zero call-site changes:**
- 924 directly;
- 334 through the `$transaction` Proxy;
- 74 `findUnique` outside a transaction, only with the unbatch rewrite;
- 10 raw.

**Cost:** +1 round trip per checkout without the cache (≈ shipped with it, while contexts don't interleave); one
private-API read (`__internalParams.transaction`) on the unbatch path; lost same-tick `findUnique` batching.

**Per-unit binding, re-sized:**
- **623 units in 314 files** (569 exposed + 79 gating, innermost named function; quick-607 counted 456 *acquiring*
  units in 198 files, a different unit definition).
- **133 of the units already open their own transaction on the tenant client** and would nest inside the wrapper,
  which is quick-607's 6/6 deadlock at `max:1`.
- quick-611's 16 DORMANT swallow sites go live as each function is wrapped.
- Measured clean for its shape (quick-607 `guc-binding.md` §4.1, 128/128).

**Recommendation: checkout re-assertion,** with connect-call capture, `unbatchFindUnique` and the cache.

**The 144 routing statements still need routing. Stated explicitly.** They run on the bare client, which carries no
tenant: checkout asserts `''`, and the measured result is TC001 (a silent 0 with the tripwire off). Re-assertion makes
them fail loudly instead of inheriting a previous checkout's tenant, but it does not scope them. The 56
bypass-drop rows are likewise untouched.

**What the other option leaves open:** re-assertion is implicit per client object and relies on Prisma running
requests in the caller's async context, plus one private field. Per-unit binding would be explicit at every call
site, at the cost of 623 units and 133 restructures.

## 6. Blast radius (if adopted; nothing adopted here)

- **Files:** `prisma.ts` (pool subclass), `tenant-client.ts` (context extension, unbatch, Proxy), `tenant-context.ts`
  (delete the two now-redundant session `set_config`s, each a guaranteed cache miss), plus a guard test and a
  concurrency harness run pre-cutover.
- **Call sites: zero.**
- **What the harnesses would not catch:**
  - bare-client paths that work today only by inheriting a GUC start failing (loud on staging, invisible on
    production until the `app_user` cutover because RLS is inert on `postgres`);
  - cross-region latency when the cache misses;
  - Proxy identity or `getExtensionContext` use (none found in `src` outside generated code);
  - lost `findUnique` batching;
  - a Prisma upgrade changing the DataLoader or `__internalParams`, which fails silently;
  - a GUC write without statement text naming it (none today in `src` or migrations);
  - long multi-tenant cron loops (only two tenants in one process measured).

## 7. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | clean, **proven not blind** (TS2322 probe in `625-checkout-eviction.ts` reported, then removed) |
| `npm run build` | **exit 0**; the docs search-index drift it writes was reverted |
| vitest, final tree | `2145 / 2026 / 64 / 52`, 25 failing files |
| vs step-0 baseline | **failing-file set IDENTICAL** |

**One red, recorded rather than hidden.** The first full vitest run had the prototype at
`src/lib/db/tenant-checkout.prototype.ts` and failed **27** files, adding `tenant-mechanism-fence` (8 files
referencing `withTenantRLS` against an allowlist of 7) and `wrapper-migration-countdown` (totals moved). Both guards
were right. The prototype moved to `scripts/audit/`, which neither scans, instead of widening either guard. A smoke
re-run from there (`07-after-move-smoke.txt`) reproduced the results, and the final run above is back to the
baseline set.

**Nothing was written** to staging or production. Production was read for `pg_policies` only.
