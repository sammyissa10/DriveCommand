---
phase: quick-624
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, tenant-guc, connection-pool, tc001, click-through, attribution]
requires:
  - quick-623 §7 (the unexplained /home raise)
  - quick-622 query census
provides:
  - the cause: an autocommit SQL error makes pg-pool END the physical connection holding the session tenant GUC
  - causal proof independent of staging drift (624-eviction-probe.ts)
  - the class, sized: 1,342 of 1,408 SCOPED census rows in 281 files depend on a GUC set by a different checkout
  - click-through windows that close on a quiet log (attribution fixed and witnessed)
affects:
  - apps/web/scripts/audit/604-click-through.ts
  - apps/web/scripts/audit/617-mobile-click-through.ts
decisions:
  - "the census is RIGHT about the row; SCOPED describes the client, not the connection the statement runs on"
  - "not fixed: the fix belongs to a shared mechanism (getTenantPrisma*/withTenantRLS/the pool) — stop-and-report"
  - "attribution fixed regardless: windows close after 1.5 s of log quiet, capped at 20 s, recorded per entry"
metrics:
  reproductions: "/home 6/6 (trace server) + 3/3 (witness) + click-through"
  eviction_probe_cells: 8
  exposed_scoped_rows: "1,342 / 1,408 (281 files)"
  completed: 2026-09-16
---

# quick-624 — the /home TC001: a pool evicts the connection holding the tenant GUC

Executed inline by the orchestrator rather than planner and executor subagents; `624-PLAN.md` records why.

## 0. Baseline and preconditions

- **vitest from the working tree at `7d023ac3`, before any edit:** `2145 · 2026 · 64 · 52`, 25 failing files,
  identical to quick-623's close.
- **Staging:** `app_user`, tripwire armed (unscoped TC001 / scoped ok / disarmed silent 0), `bypass_rls_policy` 86,
  sorted list identical to production (sha256 `315c31b0…`).
- **No policy was dropped in this task.** Nothing written anywhere.

## 1. Reproduced on demand

- **Setup:** `624-start-staging-server.js`, which is 620's launcher preloading `624-guc-trace-hook.js`. That hook
  loads 620's detector unchanged, then journals every `pg.Client`.
- **Result:** `624-home-repro.ts --n 6` as `driver1@alpha.staging.test` gave **`/home` 200 with 1
  `[q620-hook] TC001` on 6 of 6** (`01-home-repro.txt`). Each request also produced **4 non-TC001 errors**, which
  620's detector never prints.

Request #2, verbatim (`02-raise-block.txt`):

```
===== RAISE on cid=7 backendPid=1197366881 =====
message: tenant context is required: app.current_tenant_id is the EMPTY STRING
sql (full): SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."Document"."id" FROM "public"."Document"
  WHERE ("public"."Document"."tenantId" = $1 AND "public"."Document"."driverId" = $2
  AND "public"."Document"."expiryDate" > $3 AND "public"."Document"."expiryDate" <= $4) OFFSET $5) AS "sub"
values: ["b5623cdd-…191b8","d606784c-…396f3","2026-09-16 20:35:16.474","2026-10-16 20:35:16.474","0"]
journal of cid=7:
  53208 CONNECT-START
  53472 SET app.current_tenant_id='' (session)        <- prisma.ts pool.on('connect') initialiser
  53473 SET app.tenant_context_tripwire='on' (session)
  53473 SELECT COUNT(*) … "Document" …  -> ERROR T-C-0-0-1
process-wide interleaving (tail):
  51894 cid=5 BEGIN · SET app.bypass_rls='on' (tx-local) · carrier_drivers … · COMMIT
  52133 cid=5 SELECT … "FleetMessage" …
  52195 cid=5 ERROR 42703: column FleetMessage.isBroadcast does not exist
  52195 cid=5 END
  52258 cid=6 CONNECT-START · SET app.current_tenant_id='' · BEGIN · bypass tx on dispatches/stops · COMMIT
  53017 cid=6 SELECT COUNT(*) … "FleetMessage" …
  53081 cid=6 ERROR 42703: column FleetMessage.isBroadcast does not exist
  53081 cid=6 END
  53208 cid=7 CONNECT-START … (above)
  53672 cid=7 END (physical connection closed)
```

**The GUC at raise time is the empty string**, on two independent counts:
- the database's own TC001 message says so;
- cid=7's journal shows the connection was opened for this statement, and the pool's `''` initialiser is the
  **only** `set_config` it ever received.

The tracer's follow-up read on the same client failed. That was not an aborted transaction: pg-pool had already
ended the connection (§3). The tracer's message is corrected.

## 2. The statement, from the SQL rather than the route

The JS stack is all pg-pool/pg frames. The query is dispatched from `pool.query`'s connect callback, which breaks
the async chain, so the site is resolved from the SQL shape and the bound values:
- `Document.count` with `driverId = <user id>`, `expiryDate > now`, `<= now + 30 days`, and the `tenantId` the
  extension injects. **Exactly one site builds that: `src/app/(driver)/actions/driver-dashboard.ts:124`**,
  `getDriverQuickActionBadges`.
- The only other `Document.count` with an expiry range (`api/mobile/owner/dashboard/route.ts:81`) uses `gte`
  (`>=`) and no `driverId`.

**The census row** (quick-623's regenerated census): `driver-dashboard.ts:124 Document count`, **client
`TENANT_SESSION`** (the `getTenantPrisma()` at `:69`), inTx false, bypass false, **verdict `SCOPED`**, failure
`SWALLOWED` (`try/catch at line 65 — return defaults`). The route is `/home`, not `/my-load`.

## 3. The cause

**The census is right, and the statement runs on a different physical connection from the one its GUC was set
on.** It is not a wrong client, and nothing issues a reset: the connection holding the GUC is destroyed, and its
replacement starts at `''`.

The chain, each link observed or read in source:
1. `getTenantPrisma()` issues `set_config('app.current_tenant_id', <tenant>, false)`, a **session** GUC, on
   whatever connection the `max: 1` pool hands out (cid=5).
2. A later **autocommit** statement on the same pool fails. On `/home` that is `FleetMessage` 42703, because staging
   lacks `isBroadcast`; production has it (read-only check).
3. **pg-pool 3.11.0 ends the physical connection on ANY query error.** `pool.query` calls `client.release(err)`
   (`pg-pool/index.js:438`), and `_release` returns `this._remove(client)` whenever `err` is truthy (`:356-361`),
   which calls `client.end()`. Observed as `cid=5 END` right after the 42703.
4. The next checkout opens a new connection. `prisma.ts`'s `pool.on('connect')` sets `app.current_tenant_id = ''`
   (observed on cid=6 and cid=7). **Nothing re-issues the tenant GUC**: the tenant client was acquired once, at the
   top of the function.
5. The `Document.count` on the correctly acquired tenant client runs on cid=7. The tripwire sees `''` and raises
   TC001; `getDriverQuickActionBadges` swallows it and renders `expiringDocs: 0`.

**Proven independent of staging drift** (`624-eviction-probe.ts`, `03-eviction-probe.txt`). Each cell is a cold
process importing the **real** `src/lib/db/prisma.ts` and `getTenantPrismaForOrg`, as app_user, counting `Truck`,
where tenant A owns 1 row:

| cell | connects | result |
|---|---:|---|
| control, no error | 1 | count 1 · count 1 |
| `SELECT 1/0` caught (22012) | 2 | count 1 · **count on the SAME tenant client → TC001**; GUC sets `'' → tenant → ''` |
| missing column caught (42703, the `/home` shape) | 2 | count 1 · **TC001** |
| error **inside** `$transaction`, caught | 1 | count 1 · count 1: **no eviction** (the rollback releases cleanly) |
| autocommit error, then a **transaction** | 2 | count 1 · **`$transaction(count)` → TC001** |
| error, then **re-acquire** `getTenantPrismaForOrg` | 2 | count 1 · count 1 (re-issuing `set_config` recovers) |
| control, tripwire **off** | 1 | 1 · 1 |
| `SELECT 1/0` caught, tripwire **off** | 2 | count 1 · **count 0: a silent wrong answer** |

The last row is what the cutover would ship. Without the tripwire the statement does not fail: it returns **zero
rows for a tenant that has rows** (and would 42501 on an INSERT). That is the silent-zero class the census exists to
remove, arriving through statements the census counts as done.

## 4/5. The class, and whether the mechanism is new

**The census did not misresolve anything,** so there is no resolution class to size. Its ground truth (20/20 in
quick-622) and this row both resolve the client correctly. **What is wrong is the inference `SCOPED ⇒ executes with
tenant context`.** That property belongs to the connection at execution time, which no static artefact can
represent.

**Exposure, from the census** (`exposure.cjs` → `04-exposure.json`). Of the **1,408 `SCOPED`** rows:

| | rows |
|---|---:|
| rely on a session GUC set by a **different checkout** (`TENANT_SESSION`/`TENANT_ORG`, bare or `TX(…)`, with no in-transaction `set_config`) | **1,342 in 281 files** |
| set the tenant GUC inside their own transaction (`tenantGucInTx`), so the SET and the statements share one connection | 64 |
| bypass-flagged on every arm (exempt from the tripwire; admitted by `bypass_rls_policy` until the drop) | 2 |

- **Of the 1,342:** 793 are `TENANT_SESSION`, 248 `TX(TENANT_ORG)`, 195 `TENANT_ORG`, 71 `TX(TENANT_SESSION)`,
  and 35 `MIXED`. By failure handling, 799 are LOGGED, 335 THROWN, 148 SWALLOWED, 60 ERROR_RESPONSE.
- **Each is exposed only when, after its acquisition and before it runs, some autocommit statement on the same
  process's pool fails.** The trigger does not have to be in the same function. A caught P2002/P2025, a raw-query
  error, or anything a `.catch(() => null)` hides will do it. On a `max: 1` pool shared by concurrent requests,
  another request's error should do it too. **That cross-request case is inferred from the pool's design, not
  measured here.**
- **The 144 remaining gating statements join the 1,342 the moment they are routed.**

**Relation to earlier findings:**
- **quick-610 / 621 / 622 §7: the GUC SURVIVES a checkout** (pool inheritance), which makes a bare statement look
  scoped. **This is the inverse: the GUC is LOST by eviction, which makes a scoped statement fail.** Same root (a
  session-scope GUC on a pool, set by a separate statement from the one that relies on it); opposite failure. quick-610
  wrote down the premise ("every non-transactional statement is an independent pool checkout and the GUC is
  session-scoped"); **nobody recorded error-driven eviction. It is a new mechanism.**
- **quick-618** (`withTenantRLS` findUnique post-check): unrelated. The count here carries its tenant predicate.
- **quick-606** (five LATENT callers): they never set the GUC. These set it correctly, on a connection the pool
  later destroys.
- **The initialiser makes it fail CLOSED.** Because `pool.on('connect')` writes `''` rather than leaving a stale
  value, the replacement connection reads nothing (or raises) instead of another tenant's rows.

**Why quick-621's run did not show it:** unmeasured. The staging drift already existed at quick-620. The likeliest
explanation is queue order on the single-slot pool: if the `Document.count` checks out before the failing
`FleetMessage` statements, it runs on the original connection. It now reproduces on every request.

## 6. Fix: not applied, stop and report

- **The `/home` instance.** The only trigger is staging drift (`FleetMessage.isBroadcast`, `loadId`), which needs
  staging DDL. That is out of scope and not a fix for the class.
- **The class, three candidate shapes, all shared mechanisms:**
  1. run each unit in a transaction that issues `set_config(…, true)` inside the same checkout (the unbuilt
     `withTenantContext`, 0 call sites; 64 census rows already have this shape and are immune);
  2. have the tenant client re-assert the GUC per statement (`tenant-rls.ts`'s header records the deadlock an
     array-form version caused);
  3. stop pg-pool destroying a client on a statement-level error. Not recommended: a connection-level error must
     still evict.
- **The quick-622 census generator is untouched.**
- **Recommendation:** make "every tenant unit sets its GUC inside its own checkout" a cutover prerequisite alongside
  the 144, and add a census column (`gucSetInSameCheckout`) so the exposure is counted rather than inferred. Both are
  their own tasks.

## 7. Attribution, fixed, and the re-run

- **The defect:** `604-click-through.ts` closed each window **350 ms** after the response
  (`617-mobile-click-through.ts`: 120 ms). `/home`'s hook line is written later than that.
- **The fix:** both now wait until the server log has not grown for **1.5 s**, capped at 20 s. The web harness
  records `logWindow: { quietAfterMs, capped }` per entry (`5098f474`).

**Witness** (`05-attribution-witness.txt`): `/home` then `/my-load`, ×3, same server.

| window rule | `/home` TC001 | `/my-load` TC001 |
|---|---|---|
| fixed 350 ms (old) | 0, 0, 0 | **1, 1, 1** |
| quiet log (new) | **1, 1, 1** | 0, 0, 0 |

**Re-run on the standard 620 server** (arming control PASS; hook control PASS in every process):

| run | entries | pass | fail | not-reachable | TC001 |
|---|---:|---:|---:|---:|---:|
| web | 66 | 59 | 1 | 6 | 1 (web range; whole log 1) |
| mobile | 30 | 24 | 5 | 0 | 0 |

- **The `/home` raise remains, now attributed to `/home`.** It is not suppressed, because its trigger (staging
  drift) and its mechanism (§6) are both outside this task.
- **Against quick-623:** exactly two entries changed, `DRIVER_A /home` pass → **fail** and `DRIVER_A /my-load`
  fail → **pass**. The other 64 web entries and all 30 mobile entries are unchanged, and **0 windows hit the cap**
  (longest 2.12 s).

## 8. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | clean, **proven not blind** (TS2322 probe in `604-click-through.ts` reported, removed) |
| `npm run build` | **exit 0**; docs search-index drift reverted |
| vitest after the last code commit (`2b4988ec`) | `2145 / 2026 / 64 / 52`, 25 failing files |
| vs step-0 baseline | **failing-file set IDENTICAL** |
| wrapper countdown | unchanged (no `src` file changed) |

## 9. Is the census still trustworthy for the remaining 144?

**Yes for what it measures; no for what `SCOPED` has been taken to mean.**
- **Trustworthy:** as an inventory of statements not yet on a tenant client, i.e. the routing work. The 144 are
  still the right list, and this row did not show a resolution error.
- **Not trustworthy:** as evidence that a routed statement **will have tenant context at execution**. 1,342 `SCOPED`
  rows depend on a session GUC that any caught autocommit error on the pool silently removes.
- Finishing the 144 therefore closes the static gap but not the runtime one. **The cutover needs both.**
