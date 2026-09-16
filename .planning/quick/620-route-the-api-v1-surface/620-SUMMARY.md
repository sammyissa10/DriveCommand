---
phase: quick-620
plan: 01
subsystem: security / multi-tenant isolation
tags: [rls, app_user-cutover, bypass_rls, api-v1, tenant-context, click-through, staging-drift]
requires:
  - quick-616 census (API_V1 6f/14s)
  - quick-617 pattern (getTenantPrismaForOrg, userId omitted, where clauses kept)
  - quick-618 fix (findUnique tenant predicate) — not reached by any statement here
  - quick-619 fixed dual-form TC001 driver hook
provides:
  - all 14 API_V1 statements routed; 0 stopped
  - the fixed TC001 hook running INSIDE next dev for both click-throughs, with a startup control
  - a finding the text-based detector hid: (owner)/layout.tsx raises TC001 on a cold pool behind HTTP 200
affects:
  - 6 route files under apps/web/src/app/api/v1
  - 2 guard tests (bypass-rls-flag-removal, tenant-client-stop-access) — updated after being witnessed red
  - apps/web/scripts/audit/wrapper-countdown.json (561 -> 566, regenerated)
decisions:
  - "census line stops/[id]/messages:89 is NOT BROKEN_POLICY — it is a User.findMany, and User has an ordinary tenant policy on both DBs"
  - "the three DECORATIVE rows were routed with the standard pattern, not 'delete the flag only' — that would put FleetMessage.create on a client that forwards userId"
  - "staging's FleetMessage drift (no isBroadcast/loadId) was NOT fixed by DDL; six handlers are labelled BLOCKED_BY_STAGING_DRIFT and their statements covered by shape cells"
metrics:
  statements_routed: 14
  statements_stopped: 0
  repo_remainder: 45
  completed: 2026-09-16
---

# quick-620 — API_V1 routed: 14 of 14

Executed inline by the orchestrator rather than planner and executor subagents; `620-PLAN.md` records why.

## 0. Preconditions and baseline

**Baseline, from the working tree at `63e08682`, before any edit** (`evidence/00-vitest-baseline*`):
`2143 tests · 2024 passed · 64 failed · 52 pending · 25 failing files`. That is quick-619's close.

**Staging** (`00-preconditions.txt`), all PASS:
- `current_user app_user`, `rolbypassrls false`.
- Tripwire armed: an unscoped read raises TC001, a scoped read succeeds, and a disarmed read is a silent 0 rows.
- `bypass_rls_policy` is **86 on 86 tables**, and the sorted list is **identical to production** (sha256 `315c31b0…`).

## 1. Step 1: 14 statements, nothing moved

All 14 `file:line` pairs are identical to the census. The last commit touching each file predates it (latest
`46484486`, quick-587, 2026-09-03). The remainder was measured by the same AST walker before any edit: **59 statements in 31 files**, of which API_V1 is 6 files / 14 statements. That reconciles with quick-619's close.

## 2. Step 2: tenant source, reported before any edit (`evidence/02-tenant-source-and-finduniq.md`)

| tenant source | statements |
|---|---:|
| **session** (`getSession()` → `app_metadata.tenantId`) | **14** |
| function parameter | 0 |
| job payload | 0 |
| nowhere | 0 |

Every handler is a cookie-session web route, so nothing needed a tenant threaded through a signature.

**Live policies, read from both databases, are byte-identical.** `FleetMessage` and `User` each have `tenant_isolation_policy ("tenantId" = current_tenant_id())`. `dispatches` has `(org_id = current_tenant_id())`. Each also carries `bypass_rls_policy`.

**Two census classifications corrected by measurement:**
1. **`stops/[id]/messages:89` was classed BROKEN_POLICY** with the reason "`stops`, zero policies". The statement is a **`User.findMany`**. `User` has an ordinary tenant policy, and no bypass transaction in that file touches `stops`. The override names the wrong table.
2. **The three DECORATIVE rows (49/76/201)** said "delete the flag only", relying on a GUC left on the pool by the earlier `getTenantPrisma()` call. That pool inheritance is the latent pattern quick-610 flagged. It would also have put `FleetMessage.create` on a client that forwards `userId`, and `FleetMessage.createdById` exists. They were routed with the standard pattern instead.

**What the extension newly applies was checked per statement before routing.** Ten statements already carry their own `tenantId`/`orgId`. The two mark-read `updateMany({ id: { in } })` statements gain one, but their ids come from the immediately preceding tenant-filtered read. `FleetMessage.tenantId` and `User.tenantId` are NOT NULL. `Trip` is EXEMPT from the extension.

## 3. Step 3: findUnique

**None.** `grep -c findUnique` returns 0 for all 6 files, so no routed statement reaches quick-618's fix. Two statement shapes that quick-618 did not test do become live here: `updateMany` with `id in`, and `create` injection on `FleetMessage`. Both are covered in step 6.

## 4. Step 4: routed

| commit | scope | files | lines | statements |
|---|---|---:|---:|---:|
| `f2ab73ea` | `api/v1/messages/*` | 5 | 110 | 10 |
| `e0530a63` | `api/v1/carrier/stops/[id]/messages` + 2 guards | 3 | 49 | 4 |

- `getTenantPrismaForOrg(tenantId)` is acquired once per handler, inside the existing `try`.
- **`userId` is never passed.** Every `$transaction` + `TX_OPTIONS` is kept, the `set_config` lines are deleted, and the stale `@bypass_rls` docblocks are replaced.
- In the stops file, the routed client is a separate `orgPrisma`. The existing `getTenantPrisma()` stop-ownership lookup is not a bypass statement and is untouched.
- **Where clauses** are counted per file with comments stripped (`04-tenant-mentions-{before,after}.txt`). `where-with-tenantId` and `orgId:tenantId` are equal in all 6 files, bypass mentions go 14 → 0, and raw `tenantId` mentions rose by the acquisition only.
- **Guards witnessed RED first** (`04-guard-red.txt`):
  - `bypass-rls-flag-removal` RULE 2 failed with `expected +0 to be 4`.
  - `tenant-client-stop-access`'s import regex also failed, which I had not predicted.
  - I updated them: `retainedFlags 4→0`, `TOTAL_RETAINED 15→11`, and RULE 1 now also watches `orgPrisma`. That was proven by re-adding a flag inside an `orgPrisma` transaction: RULE 1 failed, and after restoring the file it was 29/29.
- **tsc is clean and proven not blind**: a TS2322 probe was reported, then removed.

## 5. Step 5: remainder, 45 measured against 45 expected

```
59 at quick-620 start − 14 routed = 45
repo-wide remainder: 45 statements in 25 files
PASS FLOOR (40) · PASS POSITIVE CONTROL · PASS COUNTER-ASSERTION thread/route.ts read, acquires, yields ZERO
PASS OTHER SURFACES UNCHANGED — all 45 non-API_V1 statements identical file:line before and after
```
619's floor of 50 sat above this task's correct answer, so it was lowered to 40 with the reason in the script.

## 6. Step 6: proof with `bypass_rls_policy` dropped on `FleetMessage`, `User`, `dispatches`

`620-routing-verify.ts` copies capture/drop/restore/self-heal verbatim from 619 and uses **619's fixed dual-form TC001 driver hook**. That hook now also records every other SQLSTATE it sees. **No `process.kill` is used.**

**The `finally`, proven first**: `86 → 83 → 86`, sorted list identical, 0 body mismatches, fixtures left 0, exit 3.

### Staging drift found before the harness was written

**Staging's `FleetMessage` lacks `isBroadcast` and `loadId`**; production and `schema.prisma` have both. This is the drift quick-619 saw as P2022. Every routed `FleetMessage` statement except audio-url's `findFirst` and the two `updateMany` selects, filters or writes `isBroadcast`. On staging those fail with **42703 before any policy is consulted**. **I did not alter staging's schema.** `FleetMessage` also holds **0 real rows** on staging, so its rows are disposable, marker-bodied fixtures, created and deleted on the privileged connection.

### The run: 20/20 PASS (`06-probe-cells.json`)

The real route handlers were run in cold processes with a real staging session injected. The stubs are `getSession`, `after` (no push), `generateDownloadUrl` (no R2), and for the stops file only, `getTenantPrisma` delegating to `getTenantPrismaForOrg(tenant, user)`. None of these is routed code.

| cell | result | what it covers |
|---|---|---|
| `hook-control` | caller TC001, hook recorded 1 | the detector sees raises |
| `handler:audio-url:own` | **200**, stub URL for the own fixture | `audio-url:36` — row **returned**, handler end to end |
| `handler:audio-url:foreign` | **404**, counter-read 1 | `audio-url:36` isolation |
| `handler:send:foreign-recipient` | **404** "Recipient not found in tenant", counter-read 1, 0 rows | `send:64` isolation, real handler |
| `handler:send:own-recipient` | 500 on 42703 `isBroadcast`, 0 rows written, 0 TC001 | `send:64` **returned** the recipient (else 404); `send:76` BLOCKED_BY_STAGING_DRIFT |
| `handler:thread` · `conversations` · `broadcast` · `stops:GET` · `stops:POST` | each 500 on 42703, 0 TC001, 0 rows | BLOCKED_BY_STAGING_DRIFT; stops GET/POST passed their stop-ownership lookup first |
| `shape:fleet-findMany-stop` | own 1 · foreign 0 · counter 1 | `stops:49` |
| `shape:fleet-findMany-or` | 2 with the route predicate, **2 without it** (4 fixture rows exist) | `thread:79`, `conversations:38` (OR minus `isBroadcast`) |
| `shape:fleet-updateMany-mark-read` | handed one own id and one **foreign** id: **updated 1**, own read, foreign untouched | `stops:76`, `thread:105` |
| `shape:fleet-insert-policy` | own raw INSERT admitted (1 row); foreign **42501** at the driver, 0 rows | WITH CHECK for `stops:201`, `send:76`, `broadcast:54` |
| `shape:user-findMany` | only the own user, with **and without** the route's `tenantId` | `stops:89`, `conversations:74`, `thread:118` |
| `shape:trip-findMany` | only the own trip, with the `orgId` predicate **and with the policy alone** | `conversations:94` (Trip is extension-exempt) |
| `table:FleetMessage` | unscoped TC001 · scoped 3 · cross-tenant **PROVEN — on FIXTURE rows only** | |
| `table:User` | unscoped TC001 · scoped 6 · cross-tenant **PROVEN on real rows** | |
| `table:Trip` (`dispatches`) | unscoped TC001 · scoped 1 · cross-tenant **PROVEN on real rows** | |

**Isolation per table:**
- `User`: proven on real staging data.
- `dispatches`: proven on real staging data.
- **`FleetMessage`: proven only on fixture rows**, because staging has no real ones.

**Not proven on staging, named:**
- **The Prisma `create` path on `FleetMessage`**: the extension's `tenantId` injection on create, and `createdById` staying NULL. The first run tried it and got P2022, because Prisma writes the defaulted `isBroadcast` on every create. That transcript is kept as `*-FIRST-create-blocked*`. "createdById stays NULL" holds structurally, since `userId` is not passed, but it was not measured.
- **The full routed `FleetMessage` statements with `isBroadcast` present.** The shape cells remove exactly that one predicate or column and change nothing else.

The second transcript (`*-SECOND-p2010-wrapper*`) is also kept: Prisma wraps a failed raw statement as `P2010`, so the cell initially read the wrapper code. The database's 42501 is read at the driver hook, which is where it is authoritative.

**Restore:** re-created 3, live 86, sorted list identical, 0 body mismatches, fixtures left 0. **Against production:** staging and production sorted lists are identical, sha256 `0fa356b9…` and md5 `29498ef6…`, the same figures quick-616 and quick-619 recorded. Re-read after the click-throughs: still 86, md5 `29498ef6…`, 0 fixture rows.

## 7. Step 7: both click-throughs, with the fixed detector inside the server

**The fixed detector.** 619's dual-form hook had only ever run inside its step-6 harness. 619's click-throughs counted `TC001` in server-log text, which a route that swallows its error never writes. `620-tc001-driver-hook.js` preloads the same fixed hook into `next dev` via `NODE_OPTIONS --require`; `pg` is on Next's built-in server-external list, so the app loads the same `pg` it patches. It prints one line per driver-level raise, so both harnesses' slice matchers count swallowed raises too. **Control:** at startup every process runs an unscoped read with the tripwire armed and checks that the hook recorded it. **4 processes, 4 × `Q620_HOOK_CONTROL=PASS`.** The control line spells the code `T-C-0-0-1` so it cannot be counted as a raise.

**Arming counter-assertion: all four parts PASS** (`07-arming-control.txt`).

### Web — `604-click-through.ts` passes 1 + 2

**66 entries · 56 pass · 4 fail · 6 not-reachable · 12 TC001** (`07-click-through.json`, `07-web-pass{1,2}.txt`)

**The 4 failures are real, and the new detector is what exposed them.** They are pre-existing and not in API_V1.
- **Pages:** `/dashboard`, `/carrier/dashboard`, `/carrier/trips` and `/crm`, each raising TC001 ×3 behind **HTTP 200**.
- **Statements:** all 12 raises are the three bare-`prisma` `$queryRaw` reads in **`(owner)/layout.tsx`** (lines 41, 54 and 71: tenant name, `ActivationProgress`, `onboardingTourSeen`). Each sits inside a `try/catch` that swallows the error.
- **Why only 4 pages:** they raise on a cold pool and go silent once a scoped call has left a GUC on the `max: 1` connection, which is quick-610's inheritance pattern.
- **Visible effect:** a blank tenant name in the sidebar and default activation/tour state. No log line was written.
- **Why earlier runs missed it:** 619's web runs recorded "0 TC001" because they detected by log text. This task did not touch that file and did not route it. It carries no bypass flag, so it is not in the census either.

### Mobile — `617-mobile-click-through.ts`

**30 entries · 24 pass · 5 fail · 0 not-reachable · 0 TC001 in the correlated slices.** FLOOR, AUTH CONTROL (401) and TENANT CONTROL pass. The entries are **identical to quick-619** on role/route/status/verdict, and the 5 failures are the same staging P2022 drift plus the missing-parameter 400.

The harness's own "whole log" check reads FAIL (13). That check scans the entire shared server log, which here also holds the web pass's 12 layout raises and my launcher banner line, whose text contains "TC001". **Counted by byte range** (`07-tc001-by-range.txt`): 1 before the web run (the banner), **12 in the web range, 0 in the mobile range**, and 30 `GET /api/mobile` lines in that range as the positive control.

### Did either click-through exercise a statement this task routed?

**No.** The server log holds **0 requests** to any `/api/v1/messages/*` or `/api/v1/carrier/stops/*/messages` route, and neither harness references them. The web harness renders pages, and `/carrier/messages` fetches its data client-side, which a server HTML fetch never triggers. The mobile harness exercises `/api/mobile/*` only. **The step-6 handler and shape cells are the only execution of routed code in this task.**

## 8. Gates

| gate | result |
|---|---|
| `tsc --noEmit` | clean, **proven not blind** |
| `npm run build` | **exit 0**; the two docs search-index files it regenerates reverted as pre-existing drift (same as 617/618/619) |
| vitest after the last code/test commit (`7d880b23`) | `2143 / 2024 / 64 / 52`, **25 failing files** |
| vs step-0 baseline | **failing-file set IDENTICAL** (`diff` empty) |
| `wrapper-migration-countdown` | went up **561 → 566**, the quick-610/619 pattern; regenerated, assertion untouched; **+5 units in the 5 messages routes, stops file call sites 2 → 4, 0 elsewhere** |

## 9. Deviations and findings

**Deviations, stated:**
1. **The evidence commit `7d880b23` is 44 files**, over the ~10-file cap. It holds generated artefacts and harness scripts. Both code commits are within the cap (5 files / 110 lines and 3 files / 49 lines).
2. **Two census classifications were overridden by measurement** (§2).
3. **Two guard tests were changed**, each witnessed red first, with RULE 1's new receiver proven to fire.
4. **Proof by shape cells** for the drift-blocked statements, with each cell stating exactly what it removed.

**Findings for the next tasks:**
- **Staging schema drift on `FleetMessage`** (no `isBroadcast`, no `loadId`) blocks every realistic proof of the messages surface on staging. It is the same drift as 619's P2022s on the mobile routes. **Alternative:** apply production's two columns to staging as their own reviewed change, then re-run `620-routing-verify.ts --run`. The harness's six drift-blocked handler cells would then become full end-to-end proofs with no code change.
- **`(owner)/layout.tsx` raises TC001 three times per cold request and swallows it.** It sits on the owner portal outside this surface, is not bypass-flagged, and was invisible to every text-based click-through before this one.
- **The mobile harness's whole-log check assumes a log of its own.** When a log is shared, count by byte range.

## 10. Remaining surfaces: 45 statements in 25 files

| surface | files | statements |
|---|---:|---:|
| LIB_SERVICES (stopped residue) | 6 | 11 |
| OWNER_PORTAL | 4 | 7 |
| DRIVER_PORTAL | 4 | 6 |
| API_DRIVER | 2 | 6 |
| API_CRON | 1 | 4 |
| API_AUTH | 2 | 3 |
| API_DRIVER_PAY | 1 | 2 |
| API_GPS | 1 | 2 |
| API_INTEGRATIONS | 2 | 2 |
| API_PUSH_TOKENS | 1 | 1 |
| API_TRACK | 1 | 1 |

API_V1 is empty. **The bypass drop remains blocked at 45 statements.** The largest routable surface left is OWNER_PORTAL (7); LIB_SERVICES' 11 are all stopped pending decisions.
