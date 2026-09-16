---
phase: quick-626
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, tenant-guc, connection-pool, latency, cache-hit-rate, stop-and-report]
requires:
  - quick-625 (docs/audits/guc-checkout-reassertion.md — the prototype and its recommendation)
  - quick-624 (eviction; quiet-log click-through attribution)
provides:
  - the step-1 latency answer: under request-shaped traffic the per-connection cache hits 49.1 % (c=1) / 49.3 % (c=4)
  - real-traffic GUC round trips per request on SHIPPED code: 1.34 mean, median 1, p95 3 (87 requests)
  - a measured alternative (onNoContext 'leave'): 78.7 % hit, 1.00 round trip per request at c=1 = shipped
  - a counter hook + launcher that measure GUC round trips per click-through entry on either stack
affects: []
decisions:
  - "NOT ADOPTED. Step 1's stop condition was met: more than half of checkouts (50.9 %) pay the round trip"
  - "steps 2–7 not run: they are adoption steps and the brief says stop and report rather than adopt"
  - "no src or tests file changed"
metrics:
  hit_rate_cache: "49.1 % c=1 · 49.3 % c=4 (blind read); 38.5 % / 38.7 % with the harness's own GUC reads invalidating"
  latency_c1: "median/p95 ms — shipped 664.9/783.0 · re-assert 937.2/1010.1 · +cache 726.8/962.2 · +cache leave 662.2/735.7"
  real_traffic_shipped: "117 GUC writes / 414 checkouts / 87 requests"
  completed: 2026-09-16
---

# quick-626: checkout re-assertion was NOT adopted. The latency gate failed.

Executed inline by the orchestrator (`626-PLAN.md` records why). **Step 1 is a gate, and it failed on the brief's own
terms: under request-shaped traffic the cache hits on 49 % of checkouts, so 51 % pay the extra round trip.** The
brief says to stop and report rather than adopt in that case. Steps 2–7 are adoption steps and were not run. **No
`src` or `tests` file changed.** Production was not written. On staging, nothing was written beyond what the standard
click-through cron routes do (§5).

The margin is thin (50.9 % against a 50 % line), and the cause is structural rather than noise. §1.3 gives the reason
and §3 a measured alternative, so the decision can be made on evidence rather than on the threshold alone.

## 0. Preconditions and baseline

- **Staging** (`626-preconditions.ts` → `00-preconditions.txt`): `app_user`, `rolbypassrls=false`; tripwire armed
  (unscoped TC001, scoped 1 row, disarmed silent 0); `bypass_rls_policy` **86 on 86 tables**, sorted list identical to
  production (sha256 `315c31b0…` both). Production was read for `pg_policies` only.
- **vitest from the working tree at `2df6a42d`, before any edit:** `2145 · 2026 · 64 · 52`, **25 failing files**,
  identical to quick-625's close.

## 1. The latency risk, measured before adopting

### 1.1 Harness

`626-cache-hit-rate.ts`. One cold process per configuration, `max:1`, `app_user`, tripwire armed; 120 requests after
10 warm-up requests.
- **Tenants:** five, round-robin: A (3 drivers), B (2) and three uuids owning no rows. Every tenant read is judged, so
  a wrong-tenant GUC shows up as a wrong count.
- **Request shapes, read off the code:** every request starts with the **auth bootstrap** (`lib/auth/supabase.ts:163`,
  a *bare* batch `$transaction([set bypass TRUE, user.findUnique])`).
  - page 50 %: 4 tenant reads in `Promise.all`, then 1 more;
  - api 30 %: 1 tenant read, then a tenant interactive transaction;
  - action 20 %: tenant read, a bare bypass transaction, tenant read.
- **Concurrency:** c=1 (one request at a time per instance) and c=4 (four in flight on the one connection).
- **Instrument:** `pg.Pool#connect` and the parameterised `set_config('app.current_tenant_id', $1, false)` counted,
  patched before any pool exists. Hit rate = 1 − GUC writes / checkouts.

### 1.2 Raw results

`01-cache-hit-rate.txt`, `01b-cache-hit-rate-blind-read.txt`, `01c-cache-hit-rate-leave.txt`.

| stack | c | checkouts / req | GUC round trips / req | **cache hit rate** | median ms | p95 ms | wrong-tenant reads |
|---|---:|---:|---:|---:|---:|---:|---:|
| shipped (`prisma.ts` + `getTenantPrismaForOrg`) | 1 | 5.7¹ | 1.00 | — | 664.9 | 783.0 | 0 |
| re-assert, no cache (run 01) | 1 | 4.7 | 4.70 | 0 % | 937.2 | 1010.1 | 0 |
| **re-assert + cache (as designed)** | 1 | 4.7 | **2.39** | **49.1 %** | **726.8** | **962.2** | 0 |
| re-assert + cache, `onNoContext:'leave'` | 1 | 4.7 | 1.00 | 78.7 % | 662.2 | 735.7 | 0 |
| shipped | 4 | 5.7¹ | 1.00 | — | 2558.8 | 3419.6 | **184** |
| re-assert, no cache (run 01) | 4 | 4.7 | 4.70 | 0 % | 3552.8 | 4564.9 | 0 |
| **re-assert + cache (as designed)** | 4 | 4.7 | **2.38** | **49.3 %** | **2885.2** | **3943.3** | 0 |
| re-assert + cache, `onNoContext:'leave'` | 4 | 4.7 | 2.00 | 57.4 % | 2790.8 | 3829.3 | 0 |

¹ Shipped's own `set_config` is a checkout of its own, hence 5.7 rather than 4.7.

- **Harness artefact, found and removed.** The first run (`01-…`) read 38.5 % / 38.7 %. The prototype's cache forgets
  its value on **any** statement text naming `app.current_tenant_id`, reads included, and the harness's correctness read
  named it. With the name passed as a bind value (`--blind-read`) the rate is 49.1 % / 49.3 %. The blind-read figure is
  the one to use. **The over-broad invalidation is itself a finding:** in the adopted code it should forget only on
  writes.
- **The as-designed stack never read the wrong tenant** (0 of every read, both concurrencies). Shipped read the wrong
  tenant **184 times at c=4**, which is quick-607's defect reproduced.

### 1.3 Why the rate is ~49 %, and why it will not tune away

Arithmetic from the shapes, which the measurement matches (49.1 % measured vs 48.9 % expected):
- The auth bootstrap is a checkout with no tenant in context, so the pool asserts `''`: a **miss** whenever the
  connection holds the previous request's tenant.
- The request's first tenant statement asserts the tenant again: a **second miss**.
- The bare bypass transaction in the action shape flips it twice more.
- Expected misses per request: page 2, api 2, action 4, which gives 2.4 of 4.7 checkouts.

**Every authenticated request pays at least two misses** as long as bare checkouts assert `''`. That floor comes from
fail-closed-for-bare, the property that makes the 144 routing statements fail loudly. It is not a tuning matter.

### 1.4 Shipped on real traffic (no code changed)

`626-start-staging-server.js` (620's launcher) preloads `626-checkout-counter-hook.js`, which loads 620's detector
unchanged, then counts checkouts and tenant GUC writes and prints a cumulative line after 250 ms of quiet.
`guc-cost.cjs` takes per-entry deltas over each entry's `logByteRange`. **Both click-throughs, shipped code**
(`01d-*`):

| | value |
|---|---|
| click-through result | web **66 · 59 · 1 · 6**, mobile **30 · 24 · 5 · 0**: identical to quick-624 |
| entries that touched the DB | 87 of 96 |
| checkouts | 414 (4.76 per request, median 2, p95 17) |
| **GUC round trips (shipped `set_config` per acquisition)** | **117: 1.34 per request, median 1, p95 3, max 7** (`/settings/notifications`) |

The designed stack was **not** run on real traffic, because that would have meant changing `src` first. **What
follows is reasoning, not measurement:** at two misses minimum per authenticated request, it would pay at least about
2 round trips against shipped's measured 1.34.

### 1.5 Cross-region cost per miss

- **A miss is exactly one extra round trip** on the application → Supavisor link: `set_config` is awaited before the
  client is handed back, and pg does not pipeline.
- **Measured RTT from this machine to us-west-1:** median **62.9–65.0 ms** (bare `SELECT 1` on a warm connection, every
  run).
- **Production** (`prisma.ts` documents Vercel iad1 against Supabase us-west-1): **the iad1 → us-west-1 round trip was
  not measured.** It could not be measured from here without a deployment, which this task does not do. It is a
  cross-country link, so each miss costs one such round trip, of the same order as the laptop path.
- **At the measured 64 ms RTT, per request:**
  - synthetic: the designed stack pays **+1.39 round trips over shipped ≈ +89 ms** (measured median **+62 ms**, p95
    **+179 ms** at c=1);
  - real traffic: the designed stack's floor of ~2 against shipped's measured 1.34 is **≥ +0.66 round trips ≈ +42 ms**,
    and more on requests that interleave bare and tenant statements.

## 2. Steps 2–7: not run

They build, prove and measure an adoption the gate did not clear.
- **Step 7's figure (144) is unchanged and was not re-derived.** No routing changed and the census is untouched.
  quick-625 §5.1 has the breakdown.
- **Also not done:** the two guards (`__internalParams`, AsyncLocalStorage) and the shipped-code 64/64 matrix. Both
  belong to whichever variant is adopted, and their design is noted in §4 so the next task need not rediscover it.

## 3. Alternative, measured: `onNoContext: 'leave'`

The prototype's existing option: a checkout with no tenant in context asserts nothing, so a bare statement inherits
whatever the connection holds, **exactly as shipped does today**.
- **c=1:** 78.7 % hit, **1.00 round trip per request (= shipped)**, median 662.2 / p95 735.7 ms (shipped
  664.9 / 783.0).
- **c=4:** 57.4 %, 2.00 per request; 0 wrong-tenant reads, against shipped's 184.
- The remaining miss is one per **tenant switch** on a connection. Round-robin over five tenants forces one on every
  request, so single-tenant-per-instance traffic would do better. That is not measured.

**What it gives up, stated rather than hidden:**
- quick-625's "the 144 now fail loudly instead of inheriting" goes away. Bare statements keep today's silent
  inheritance (quick-610/621).
- Every **tenant-client** statement still gets its own tenant on its own checkout, so the 1,342-row eviction fix and
  the concurrency fix are unaffected in principle. **That has not been re-measured for `leave`.** quick-625's cells
  and matrix ran `clear`.
- The 144 still need routing either way.

**A second option, not measured:** keep `clear`, but let a bare transaction that sets `app.bypass_rls` tx-locally (the
auth bootstrap is one) skip the `''` assertion, since its GUC value is irrelevant while bypassed. That removes the
per-request double miss and keeps fail-loud for non-bypass bare statements. It becomes wrong at the bypass drop (the 56
`SILENT_ZERO_AT_BYPASS_DROP` rows), which need routing anyway.

**The choice between the three is a product decision:** fail-loud for bare statements against roughly one round trip
per request. It is the user's to make, not this task's.

## 4. Notes for whichever variant is adopted

- **Cache invalidation should match writes only** (`set_config('app.current_tenant_id'…`, `SET`/`RESET` of it), not
  any statement naming the GUC. A read must not force a miss (§1.2).
- **`__internalParams` guard (step 2)** needs no DB. Prisma 7.4.0's runtime passes `__internalParams: t` into every
  query-extension callback, and `t.transaction` is set before the callback for both batch and interactive
  transactions (`Wo` in `runtime/client.js`). A test can capture it in `$allOperations` without calling `query`, over a
  `PrismaPg` built on a `pg.Pool` with a fake `Client` (pg-pool honours `options.Client`).
- **AsyncLocalStorage guard (step 3)** can use the same fake `Client`: record the GUC value in effect when each
  statement runs, and assert it equals the tenant `withTenantRLS` injected into that statement's bind values. To prove
  it fires, wrap the adapter so requests dispatch from a queue started in the first caller's context (the DataLoader
  shape).
- **Fence and countdown:** keep the store and the pool subclass inside `prisma.ts` and `tenant-client.ts`, and write
  guard tests that import `getTenantPrismaForOrg` rather than `createTenantClient`. That avoids adding a referencing
  file to either guard's corpus. If either fires anyway, it is telling you something.

## 5. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | clean, **proven not blind** (TS2322 probe in `626-cache-hit-rate.ts` was the only error; removed) |
| `npm run build` | **exit 0**; docs search-index drift reverted |
| vitest after the last change | `2145 / 2026 / 64 / 52`, 25 failing files |
| vs step-0 baseline | **failing-file set IDENTICAL** |
| fence / countdown | untouched; no `src` or `tests` file changed |

**Written:**
- **Production:** nothing. It was read for `pg_policies` only.
- **Staging:** no DDL and no direct writes by any harness here. The click-throughs drove their standard surfaces,
  including the 14 cron routes, which do their normal work on staging exactly as in quick-604 through quick-624. The run's `CRON_SECRET` was generated per run, never written to evidence
(grepped), and deleted.
