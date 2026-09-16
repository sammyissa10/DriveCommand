---
phase: quick-627
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, tenant-guc, connection-pool, asynclocalstorage, prisma-dataloader, adopted]
requires:
  - quick-626 (the latency gate; the `leave` measurement this task adopts)
  - quick-625 (docs/audits/guc-checkout-reassertion.md — the prototype, §4's guard sketches)
  - quick-624 (eviction; quiet-log click-through attribution)
provides:
  - checkout-time tenant-GUC re-assertion, ADOPTED in prisma.ts / tenant-client.ts / tenant-context.ts, mode 'leave'
  - two guard tests on Prisma's private field and on caller-context execution, each proven to fire
  - /home's TC001 fixed (the connection-swap cause from quick-624)
affects:
  - every getTenantPrisma* client: GUC now asserted per checkout, not once per acquisition
decisions:
  - "ADOPTED. Step 1 64/64 on every read and configuration; step 5 at parity with shipped at c=1"
  - "default mode lives in src/lib/db/prisma.ts: TENANT_CHECKOUT_NO_CONTEXT = 'leave'"
  - "cache invalidation narrowed to GUC WRITES (set_config / SET / RESET of the GUC, RESET ALL, DISCARD ALL); reads no longer force a miss"
  - "c=4 costs one more GUC round trip per request than shipped (2.00 vs 1.00); shipped reads the wrong tenant 184 times to get its 1.00 — reported, not hidden"
metrics:
  step1_matrix: "candidate and adopted: 64/64 × 4 reads × {max1,max5} × {clean,errors}; 0 wrong, 0 empty, 0 P2028, 0 unknown"
  step5_c1: "adopted 1.00 GUC/req, 78.7 % hit, median/p95 663.6/734.1 and 662.3/751.6 ms; shipped 659.3/728.5 and 669.6/765.3"
  step5_c4: "adopted 2.00 GUC/req, 57.4 %, 2774.6/3786.7 and 2887.0/4223.2 ms, 0 wrong; shipped 1.00, 2566.8/3424.3 and 2563.7/3460.5, 184 wrong"
  real_traffic: "adopted 26 GUC writes / 297 checkouts / 87 requests (0.30 per request) vs shipped 117 / 414 (1.34)"
  click_through: "web 66·60·0·6 TC001 0 (was 66·59·1·6); mobile 30·24·5·0 TC001 0 (unchanged)"
  completed: 2026-09-16
---

# quick-627: checkout-time tenant-GUC re-assertion is adopted, in `leave` mode

Executed inline by the orchestrator (`627-PLAN.md` records why). **Adopted.** Step 1 cleared its bar, on the candidate
and again on the adopted modules. Step 5 is at parity with shipped at c=1, the configuration the brief chose `leave` on.
**`/home` is fixed.** Production was not written and was opened only for the `pg_policies` parity read. There was no
cutover, no production `DATABASE_URL` change, and `bypass_rls_policy` was not dropped. No package was installed.

## 0. Preconditions and baseline

- **Staging** (`627-preconditions.ts` → `00-preconditions.json`):
  - `app_user`, `rolbypassrls=false`.
  - Tripwire armed: unscoped TC001, scoped 1 row, disarmed silent 0.
  - `bypass_rls_policy` **86 on 86 tables**; sorted list identical to production (sha256 `315c31b0…` both).
- **vitest from the working tree at `ea008207`, before any edit:** `2145 · 2026 · 64 · 52`, **25 failing files**. Same
  set as quick-626's close.

## 1. The candidate, re-measured under `leave`

`scripts/audit/627-checkout-candidate.ts` is quick-625's prototype reduced to one configuration, written so the port
into `src` is a transcription:
- connect-call capture;
- `onNoContext: 'leave'`;
- the per-connection cache, with invalidation **narrowed to GUC writes**, as quick-626 §4 asked;
- the socket-error listener;
- the `findUnique` → `findFirst` rewrite.

### 1.1 Concurrency matrix (`01-checkout-concurrency.txt`)

8-way × 8 waves = 64 iterations, two tenants alternating, one cold process per configuration. Raw counts:

| stack | max | errors | connects | R1 count | R2 GUC | R3 tx GUC | R3 tx count |
|---|---:|---|---:|---|---|---|---|
| **candidate** | 1 | no | 1 | correct 64 | correct 64 | correct 64 | correct 64 |
| **candidate** | 5 | no | 5 | correct 64 | correct 64 | correct 64 | correct 64 |
| **candidate** | 1 | yes | 17 | correct 64 | correct 64 | correct 64 | correct 64 |
| **candidate** | 5 | yes | 21 | correct 64 | correct 64 | correct 64 | correct 64 |
| shipped | 1 | no | 1 | 32 · wrong 32 | 32 · wrong 32 | 32 · wrong 32 | 32 · wrong 32 |
| shipped | 5 | no | 5 | 29 · wrong 35 | 27 · wrong 37 | 35 · wrong 29 | 35 · wrong 29 |
| shipped | 1 | yes | 81 | TC001 64 | empty 64 | TC001 64 | TC001 64 |
| shipped | 5 | yes | 37 | 25 · wrong 23 · TC001 16 | 25 · wrong 23 · empty 16 | 24 · wrong 24 · TC001 16 | 24 · wrong 24 · TC001 16 |

**Bar met: 64/64 correct, 0 wrong-tenant, 0 empty, 0 P2028, 0 unknown errors, in all four candidate configurations.**

### 1.2 The cache's own behaviour (`01-checkout-eviction-cache.txt`, cold process per cell)

`gucSets` is the sequence of tenant values actually written on the wire. A cache hit writes nothing.

| cell | candidate | shipped |
|---|---|---|
| same tenant ×3 | `'' A`: one write, all correct | same |
| literal `current_setting` read between two statements | `'' A`: **the read did not force a miss** | same |
| A → B → A | `'' A B A B A`: 3 / 2 / 3, probes A and B | `'' A B`: **2 / 2 / 2, A's probe reads B** |
| bare `set_config(B,false)` between A statements | forgot, re-asserted A: 3, probe A | **2, probe B** |
| bare `RESET ALL` between A statements | forgot, re-asserted A: 3, probe A | **0, probe `''`** |
| bare tx with `set_config(B,true)` between | forgot, re-asserted: 3, probe A | 3 (session value survived) |
| bare after tenant (the `leave` give-up) | **inherits A: 3** | inherits A: 3 |
| bare on a cold connection | TC001 | TC001 |
| socket destroyed during B's assertion | B fails (connection terminated), **process survives**, B 2, A 3 | B fails, then TC001 ×2, P2010 |
| same-tick `findUnique`, A and B | own row · own row | **NULL (row exists)** · own row |
| same, without the rewrite (control) | **NULL (row exists)** · own row | — |

**A harness defect, found and fixed.** The first socket cell never destroyed anything (connects=1). The trigger patched
`pg.Client.prototype.query`, and the candidate's cache binds each client's `query` at first checkout, so the patch
never saw it. The trigger now hooks the connection's socket `write`. After that, the destruction lands during the
candidate's B assertion: `gucSets '' A B '' B A`, connects 2, ends 1.

## 2. quick-624's error reproduction under `leave` (`02-checkout-eviction-error.txt`, cold process per cell)

Tenant A owns 1 truck and 3 drivers.

| cell | candidate: the statement after the error | shipped |
|---|---|---|
| `SELECT 1/0` (22012), tripwire on | truck 1 · drivers 3 · probe A | **TC001 · TC001** |
| 22012, tripwire **off** | 1 · 3 · probe A | **0 · 0 · probe `''`** (silent) |
| missing column (42703, the `/home` shape), tripwire on | 1 · 3 · probe A | **TC001 · TC001** |
| 42703, tripwire **off** | 1 · 3 · probe A | **0 · 0 · probe `''`** |
| bare-client `SELECT 1/0` | 1 · probe A | **TC001** |
| tenant B's error, then A | A 3 · probe A | **A read B's 2 first**, then TC001 |
| error inside a transaction | 1 · probe A (no eviction) | 1 · probe A |
| error, then interactive `$transaction` | `[1, 3, A/3]` | **TC001** |
| error, then batch `$transaction([...])` | `[1, 3]` | **TC001** |
| error, then re-acquire | 1 | 1 |
| socket destroyed under a statement (cache hit) | fails, then 1 · probe A | fails, then **TC001** |

Every candidate eviction cell shows connects=2, ends=1 and a `'' → A` re-assertion on the replacement connection.
**TC001 count: 0 in every candidate cell.**

## 3. The two guards (`tests/security/tenant-checkout-guards.test.ts`)

Both run with no database: pg-pool honours `options.Client`, and a fake `pg.Client` records every statement together
with the GUC value its connection held when the statement ran. The fake pool is installed as the `globalThis.pool`
singleton `prisma.ts` already honours, and the module graph is re-evaluated over it. The test imports
`getTenantPrismaForOrg`, not `tenant-client`, so the fence corpus is unchanged (quick-626 §4).

- **Guard 1, the private field.** Asserts that Prisma still passes `__internalParams` to query extensions, with
  `transaction` undefined outside a transaction, `kind: 'itx'` inside an interactive one and `kind: 'batch'` inside a
  batch. Also asserts that `isInsideTransaction` answers accordingly, and that a tenant `findUnique` inside an
  interactive transaction is issued between BEGIN and COMMIT on the transaction's own connection.
  - **Proven** (`03-guard1-broken.txt`): `isInsideTransaction` was edited to read `__internalParamz`, as if Prisma
    renamed the field. **Both tests went red.** The second hit its 2 s transaction timeout, because the escaped
    `findFirst` waited for the connection its own transaction held. Restored; green.
- **Guard 2, caller context.** Two tenants, 24 concurrent operations: model reads, raw reads, interactive transactions
  and same-tick `findUnique` pairs. Asserts that every non-control statement carries exactly one tenant id in its bind
  values and ran under that tenant's GUC. Anti-vacuity: ≥30 statements checked, ≥12 per tenant. An in-file
  **self-test** routes the same traffic through a DataLoader-shaped dispatcher at the pool and asserts the detector sees
  mismatches.
  - **Proven** (`03-guard2-broken.txt`): `createTenantClient`'s `query(args)` was wrapped in a shared queue drained from
    the first caller's `nextTick`, as if Prisma dispatched from a shared context. **The main test went red: 6
    statements of tenant A ran under tenant B's GUC**, a wrong-tenant read. Restored; 4/4 green (`03-guards-restored.txt`).

## 4. Adopted

| file | change |
|---|---|
| `src/lib/db/prisma.ts` | `createTenantCheckoutPool` (the pool subclass: connect-call capture, cache, socket listener); `tenantCheckoutStore()` on `globalThis` beside the pool; `isInsideTransaction`; `SET_TENANT_GUC_SQL`; `TENANT_GUC_WRITE`. **The default mode lives here: `TENANT_CHECKOUT_NO_CONTEXT = 'leave'`.** The `''` initialiser and the tripwire arm are unchanged in text, and the arm is still under `if (ARM_TRIPWIRE)` (`tripwire-arming-gate` pins that shape; it was not bent). |
| `src/lib/db/tenant-client.ts` | the context extension, the `findUnique` rewrite and the `$transaction` Proxy, composed after the two existing extensions. Still exactly one `withTenantRLS` call and one `createTenantClient`. |
| `src/lib/context/tenant-context.ts` | the two session `set_config` calls are removed, with their doc comments. `tenantRawQuery` is unchanged. |

**Re-run on the adopted real modules** (`04-adopted-*`):
- concurrency: **64/64 on all four reads in all four configurations**;
- every cache and error cell identical to the candidate's §1.2 / §2 results.

**The store lives on `globalThis`, deliberately.** `prisma.ts` persists the pool on `globalThis` across module
re-evaluation (dev HMR, `vi.resetModules`). A module-scoped store would leave the persisted pool reading a store no
tenant client writes to: every checkout sees no context and, under `leave`, silently inherits. The guard test
re-evaluates the module graph and passes, which it would not do with a module-scoped store.

**A consequence of removing the two `set_config` calls, stated rather than hidden.**
- **Before:** `getTenantPrisma*()` wrote the GUC immediately, so a **bare** `prisma` statement issued after it in the
  same request usually inherited the right tenant.
- **After:** until the tenant client runs something, that bare statement inherits whatever the previous checkout
  left, possibly another request's tenant.
- **Where it matters:** production runs as `postgres`, where RLS is inert, so users see no change. It matters at
  cutover and is part of why the 144 must be routed.
- **Observed:** neither click-through surfaced it (§6).

## 5. Latency against shipped (`627-latency.ts`, a byte-identical copy of `626-cache-hit-rate.ts`)

- **Traffic:** 120 requests after 10 warm-up requests, five tenants, `--blind-read`, one cold process per
  configuration.
- **Shipped** was measured by `git stash` of the three files, restored by a trap.
- **Order:** shipped, adopted, shipped, adopted, to bracket network drift.

| stack · run | c | checkouts/req | GUC round trips/req | hit rate | median ms | p95 ms | RTT ms | wrong-tenant |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| shipped · 1 | 1 | 5.7 | 1.00 | — | 659.3 | 728.5 | 63.1 | 0 |
| **adopted · 1** | 1 | 4.7 | **1.00** | **78.7 %** | **663.6** | **734.1** | 65.5 | 0 |
| shipped · 2 | 1 | 5.7 | 1.00 | — | 669.6 | 765.3 | 65.1 | 0 |
| **adopted · 2** | 1 | 4.7 | **1.00** | **78.7 %** | **662.3** | **751.6** | 64.1 | 0 |
| shipped · 1 | 4 | 5.7 | 1.00 | — | 2566.8 | 3424.3 | 63.4 | **184** |
| adopted · 1 | 4 | 4.7 | 2.00 | 57.4 % | 2774.6 | 3786.7 | 63.6 | 0 |
| shipped · 2 | 4 | 5.7 | 1.00 | — | 2563.7 | 3460.5 | 63.8 | **184** |
| adopted · 2 | 4 | 4.7 | 2.00 | 57.4 % | 2887.0 | 4223.2 | 64.5 | 0 |

- **c=1 (the bar): parity.**
  - Round trips per request are identical at 1.00.
  - Adopted medians (663.6, 662.3) fall between shipped's (659.3, 669.6).
  - Adopted p95 (734.1, 751.6) falls between shipped's (728.5, 765.3).
  - The hit rate reproduces quick-626's `leave` measurement exactly (78.7 %).
- **c=4: not parity on cost, and it cannot be.**
  - Adopted pays one more round trip per request (+8 % / +13 % median).
  - This is the minimum for any stack that is correct. At `max: 1` with no invalidating writes in this traffic, the
    cache writes exactly when the connection's delivered tenant changes. That is reasoning from the mechanism, not a
    separate measurement.
  - Shipped's 1.00 comes from **not** re-asserting on a tenant switch, which is exactly why it read the wrong tenant
    **184 times**, in both runs.
  - These c=4 numbers match quick-626's `leave` row (57.4 %, 2.00).
- **Real traffic is better than the synthetic mix**, because a page rarely switches tenants (`06-guc-cost.json`, both
  click-throughs, same counter hook):

| | GUC writes | per request: mean · median · p95 · max | checkouts | writes / checkouts |
|---|---:|---|---:|---:|
| shipped (quick-626 `01d`) | 117 | 1.34 · 1 · 3 · 7 | 414 | 0.283 |
| **adopted** | **26** | **0.30 · 0 · 2 · 2** | **297** | **0.088** |

## 6. Click-throughs

- **Server:** `626-start-staging-server.js` (620's in-process detector plus 626's counter hook), after a fresh
  `.next`, because the step-5 stash touched `src`. The hook control PASSes in every server process.
- **Arming counter-assertion (`06-arming-control.txt`): all four parts PASS.**

| run | entries | pass | fail | not-reachable | TC001 | quick-624 |
|---|---:|---:|---:|---:|---:|---|
| web (604 passes 1 + 2) | 66 | **60** | **0** | 6 | **0** (slices and whole log) | 66 · 59 · 1 · 6, TC001 1 |
| mobile (617) | 30 | 24 | 5 | 0 | **0** (slices 0, whole log 0) | 30 · 24 · 5 · 0, whole log 2 |

- **`/home` is fixed.** Against quick-624, exactly one web entry changed: `DRIVER_A GET /home`, fail with 1 TC001 →
  **pass with 0** (quiet window 2.04 s, not capped). Its cause was the connection swap: the 42703 on staging's
  `FleetMessage` evicts, and the replacement connection's `''` was never re-set. The replacement is now re-asserted at
  checkout.
- **Mobile is unchanged entry for entry.** The same 5 failures: `driver/messages`, `driver/messages/route-thread`,
  `owner/drivers`, `owner/fleet/messages`, `owner/payroll`.
- **Windows:** 0 capped, the longest 2.79 s.
- **Secrets:** the run's `CRON_SECRET` was read from a scratchpad file, never written to evidence (grepped for the
  literal value: 0 hits), and deleted with the scratchpad.

## 7. The routing figure

`622-query-census.ts --out evidence/07-query-census.json`, reconciled against quick-623's artefact
(`07-reconciliation.json`).
- **Still 144** (155 as scanned, 52 files; 144 / 45 corrected for the 11 driver-pay rows). Left 0, entered 0.
- **Statements 1,825 → 1,823.** The only difference is the two removed `tenant-context.ts` `$executeRawUnsafe` rows
  (`GUC_PLUMBING`).
- **The brief says five batches; the census has six.** They are quick-623 §9's figures, unchanged:

| # | batch | stmts / files |
|---:|---|---|
| C4 | workflow-engine remainder | 10 / 7 |
| C1 | owner carrier load + template editors | 34 / 5 |
| C2 | owner portal remainder (10 SWALLOWED) | 33 / 12 |
| C3 | notifications pipeline (design task) | 31 / 7 |
| C5 | lib/carrier + security | 24 / 6 |
| C6 | API remainder (11 leave via one line in `require-driver.ts`) | 23 / 15 |

10 + 34 + 33 + 31 + 24 + 23 = 155 scanned, 144 corrected. The bypass-drop class (56; D1–D4) is separate. If "five"
meant the C-batches after C4's remainder is folded into another batch, the total is the same.

## 8. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | clean, **proven not blind** (TS2322 probe in `tenant-client.ts` was the only error; removed) |
| `npm run build` | **exit 0**, run after the last `src` edit; docs search-index drift reverted |
| vitest after the last change | `2149 / 2030 / 64 / 52`, 25 failing files (+4 tests: the guards) |
| vs step-0 baseline | **failing-file set IDENTICAL** |
| `tenant-mechanism-fence` | green, untouched |
| `wrapper-migration-countdown` | green; **artefact regenerated, not weakened**. Totals unchanged (568 units / 578 call sites). Only `tenant-header-forgery.test.ts`'s anonymous-unit line keys moved (175/193 → 183/201), from the lines added above them |
| `tripwire-arming-gate`, `admin-connection-allowlist`, `provisioning-tenant-guc` | green, untouched |

**Two things surfaced on the way to that last row, stated.**
1. **`tenant-header-forgery.test.ts` pinned the removed call.** It asserted that `getTenantPrisma()` writes a session
   `set_config` for the session tenant.
   - **Kept:** the trust-boundary property it guards. The tenant comes from the session and never the header, which
     `tenantClientCalls` asserts.
   - **Changed:** the test now asserts that the resolver issues **no** session GUC write, so the old
     per-acquisition write cannot quietly return. The locked GUC name and scope assertion is kept, moved to the
     statement the pool actually issues (`SET_TENANT_GUC_SQL`).
2. **The first full run also failed `transaction-abort-sites` and the live forgery case.** Both were timeouts: a
   bare STACK_TRACE_ERROR and an empty failure message. `transaction-abort-sites` passes alone, where its test takes
   7.3 s, and both pass in the final full run. This is quick-549's cold-load flake, and it is why the numbers above
   come from a run after the last change (quick-561).

## 9. Written

- **Production:** nothing. Read for `pg_policies` only.
- **Staging:** no DDL and no direct writes by any harness. The click-throughs drove their standard surfaces, including
  the 14 cron routes, which do their normal work, as in quick-604 through quick-626.
- **Repo:** the three `src` files, the guard test, the forgery-test update, the regenerated countdown artefact, six
  `scripts/audit/627-*` harnesses, the audit addendum (`docs/audits/guc-checkout-reassertion.md` §9), and this
  directory.
