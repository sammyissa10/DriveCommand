---
phase: quick-531
plan: 01
subsystem: carrier / document-import
tags: [error-handling, facilities, api]
dependency-graph:
  requires: [quick-530]
  provides: [FacilityUnavailableError, diagnoseFacilityUnavailable, facilityUnavailableMessage]
  affects:
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/stops/route.ts
tech-stack:
  added: []
  patterns: ["typed-error-instanceof-mapping (same idiom as DuplicateClientError / CarrierTruckConflictError)"]
key-files:
  created:
    - apps/web/src/lib/carrier/facility-errors.ts
    - apps/web/src/lib/carrier/__tests__/facility-errors.test.ts
  modified:
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/lib/carrier/stops.ts
    - apps/web/src/lib/carrier/fleet-drivers.ts
    - apps/web/src/lib/carrier/route-template-save.ts
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/stops/route.ts
decisions:
  - "New module facility-errors.ts rather than adding to facilities.ts, to avoid an import cycle with loads.ts/stops.ts"
  - "Route list expanded beyond the ticket's single named file (fleet/drivers/route.ts) to all five sites' route files, or sites 14/16/18 would still 500/404"
metrics:
  duration: "~55 min"
  completed: "2026-08-24"
---

# Quick-531: Standardise the five facility ownership-check error sites Summary

One shared, truthful failure mode for the five carrier facility ownership checks: `FacilityUnavailableError` / `diagnoseFacilityUnavailable` / `facilityUnavailableMessage` in a new `lib/carrier/facility-errors.ts`, wired through five lib sites and five route `instanceof` branches, turning three 500s and one misleading 404 into an honest 400 with one of two exact sentences.

## 1. Step 1 — live report (five-site table, as verified before editing)

| # | Site | File:line (verified) | Old mechanism | Old surfacing |
|---|------|----------------------|----------------|----------------|
| 14 | `persistStops` (batch check, loop over `facilityIds`) | `lib/carrier/loads.ts:373` | ``throw new Error(`Invalid facility: ${facilityId}`)`` | **500** via `loads/route.ts` (POST) and `loads/[id]/route.ts` (PATCH) — routes only string-matched `'Invalid client'`/`'Invalid contract'`, and the interpolated id made this message structurally unmatchable |
| 15 | `saveRouteTemplateCore` batch ownership check (`invalidFacility`) | `lib/carrier/route-template-save.ts:246` | `return { success: false, error: 'Invalid facility — does not belong to this organization' }` | validation result — shape is load-bearing (consumed by `optimisation-service.ts` + two `template-service.ts` callers) |
| 16 | `createStop` | `lib/carrier/stops.ts:135` | `return null` | **404** `'Dispatch or facility not found'` via `stops/route.ts:67`, indistinguishable from a genuinely absent dispatch/client |
| 17 | `createCarrierDriver` (`homeTerminalId`) | `lib/carrier/fleet-drivers.ts:247` | `throw new Error('Invalid homeTerminalId: facility not found in this organization')` | **500** via `fleet/drivers/route.ts` (POST) — no matching branch existed at all |
| 18 | `updateCarrierDriver` (`homeTerminalId`) | `lib/carrier/fleet-drivers.ts:597` | same throw | **500** via `fleet/drivers/[id]/route.ts` (PATCH) — same |

Line numbers matched the plan's `<verified_state>` table exactly except site 14 (373 vs the plan's estimated 372 — one-line drift, immaterial).

## 2. Step 2 — analysis: why one query collapses three causes, and the fix

Every site runs one query of the shape `where: { id, orgId, deletedAt: null }` (or `{ id: { in: [...] }, orgId, deletedAt: null }` for the batch sites). A `findFirst`/`findMany` miss on that predicate is structurally ambiguous — it cannot distinguish three causes: the id doesn't exist at all, the id belongs to a different tenant, or the id exists but is soft-deleted (`deletedAt` is set). Historically each site collapsed all three into either a generic `Error`/500 or a bare `return null`/404, discarding the distinction entirely.

The fix does not touch that query. It adds a **second, supplementary lookup** — `diagnoseFacilityUnavailable(db, facilityId, orgId)` — that runs *only on the branch that has already failed the first query*. It queries the same row by `{ id, orgId }` **without** the `deletedAt: null` filter (that omission is deliberate: finding the soft-deleted row is this query's entire purpose) and classifies: `deletedAt` set → `DELETED`; row found with `deletedAt` null, or no row at all → `NOT_IN_ORG` (a cross-tenant id and "doesn't exist" are treated identically — both are correctly rejected, and the message doesn't need to distinguish them for the caller).

**The cost, stated plainly, not buried: one extra round trip, and only on the failure path.** A successful ownership check — the overwhelming majority of calls — never touches `facility-errors.ts` at all. Nothing was added to any hot path.

## 3. Step 4 — the two approved strings, verbatim, as implemented

```
DELETED     → "That facility has been deleted and cannot be used."
NOT_IN_ORG  → "That facility does not belong to this organization."
```

Both live in exactly one function, `facilityUnavailableMessage()` in `facility-errors.ts`; every throwing site reaches them either via `FacilityUnavailableError`'s constructor (which calls `facilityUnavailableMessage` internally) or, for site 15, by calling `facilityUnavailableMessage` directly to preserve its `{ success, error }` shape.

`Select-String -Pattern 'has been deleted and cannot be used' -Recurse` over `apps/web/src`: exactly two hits — `facility-errors.ts:26` (the source) and `facility-errors.test.ts:46` (the assertion). No other file contains the sentence.

## 4. Diff summary

**Files changed (11 total, matches the plan's `files_modified` list exactly, plus this summary + STATE.md in this same commit):**

| Site | File | What changed |
|------|------|---------------|
| — (new module) | `apps/web/src/lib/carrier/facility-errors.ts` | new — 4 exports: `FacilityUnavailableReason`, `facilityUnavailableMessage`, `FacilityUnavailableError`, `diagnoseFacilityUnavailable` |
| — (new test) | `apps/web/src/lib/carrier/__tests__/facility-errors.test.ts` | new — 8 tests |
| 14 | `apps/web/src/lib/carrier/loads.ts` | `persistStops` facility-loop throw → `FacilityUnavailableError` via `diagnoseFacilityUnavailable` |
| 16 | `apps/web/src/lib/carrier/stops.ts` | `createStop` facility branch only → throws `FacilityUnavailableError`; dispatch/client branches untouched, comments added explaining the asymmetry |
| 17, 18 | `apps/web/src/lib/carrier/fleet-drivers.ts` | both `homeTerminalId` throws → `FacilityUnavailableError`; adjacent `userId` throws untouched |
| 15 | `apps/web/src/lib/carrier/route-template-save.ts` | `invalidFacility` return message swapped for `facilityUnavailableMessage(diagnoseFacilityUnavailable(...))`; `{ success: false, error }` shape unchanged |
| route (14) | `apps/web/src/app/api/v1/carrier/loads/route.ts` | +1 `instanceof` branch above existing string-match branches |
| route (14) | `apps/web/src/app/api/v1/carrier/loads/[id]/route.ts` | +1 `instanceof` branch (catch had none before) |
| route (17) | `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` | +1 `instanceof` branch above the `'User already linked...'` branch |
| route (18) | `apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts` | +1 `instanceof` branch (catch had none before) |
| route (16) | `apps/web/src/app/api/v1/carrier/stops/route.ts` | +1 `instanceof` branch; the `if (!stop) → 404` line for dispatch/client absences left byte-identical |

Line totals (`git diff --stat` against pre-task HEAD `ac226c07`):
- 5 route files: **20 insertions, 0 deletions** (each file: +4/-0 — import line + 3-line branch)
- 4 lib files: **34 insertions, 9 deletions** (net rewrites of the four throw/return sites plus imports)
- 2 new files: **157 insertions** (module + tests)

**Two deviations from the ticket, flagged as instructed:**

1. **New file, `facility-errors.ts`.** Not in the ticket's literal file list. Deliberate: putting the four exports in `facilities.ts` would create an import cycle, since `facilities.ts` is itself imported by both `loads.ts` and `stops.ts` — exactly the two files that need to throw the new error.
2. **The ticket named only `fleet/drivers/route.ts` among route files** (covering site 17 only). Without also touching `loads/route.ts`, `loads/[id]/route.ts`, `fleet/drivers/[id]/route.ts`, and `stops/route.ts`, sites 14, 16, and 18 would keep returning 500/404 exactly as before, and the task's stated goal ("Sites 14, 17 and 18 return HTTP 400... Site 16 returns 400 for a facility problem") would fail outright. All five route files were edited, per the plan's own `<verified_state>` and task instructions (which correctly specified all five, superseding the shorter ticket list).

**Honest notes on unchanged behavior:**
- `stops.ts` `createStop`'s dispatch and client branches still `return null` → still 404. Only the facility branch changed. These remain genuine absences.
- `route-template-save.ts` keeps its `{ success: false, error }` return shape exactly; `optimisation-service.ts` and the two `template-service.ts` callers are unaffected beyond the wording of the message they may display.
- `app/(owner)/actions/loads.ts:214` needed no edit and got none — verified it already returns `error.message` verbatim (`const msg = error instanceof Error ? error.message : ''; return { error: msg || 'Failed to create load. Please try again.' };`).

## 5. tsc probe result

Baseline run (after Task 3, before probing) was already clean:
```
npx tsc --noEmit
(no output — 0 errors)
```

Probe injected at `apps/web/src/lib/carrier/loads.ts:9` (a file this task edited):
```ts
const __probe531: number = 'y';
```
Result:
```
src/lib/carrier/loads.ts(9,7): error TS2322: Type 'string' is not assignable to type 'number'.
```
The gate reported exactly the injected error, at the injected line — proof semantic checking is running and not blinded by a stray parse error elsewhere.

Probe removed; `git diff apps/web/src/lib/carrier/loads.ts` against the just-committed Task 3 version came back **empty** (confirming the file was restored exactly). Re-run:
```
npx tsc --noEmit
(no output — 0 errors)
```

Stray-probe sweep: `find apps/web/src -iname "__probe*.ts"` → no results.

## 6. Regression comparison

**Baseline (Task 1, captured at pre-task HEAD `ac226c07`, before any edit):**
```
Test Files  14 failed | 104 passed | 8 skipped (126)
     Tests  61 failed | 1218 passed | 55 skipped | 3 todo (1337)
```
Matches quick-530's established pre-existing set exactly.

**After (Task 4, full suite, all four implementation commits applied):**
```
Test Files  14 failed | 105 passed | 8 skipped (127)
     Tests  61 failed | 1226 passed | 55 skipped | 3 todo (1345)
```

Delta: **+1 file passed, +8 tests passed** — exactly the new `facility-errors.test.ts` and its 8 tests. **Failed file count (14) and failed test count (61) are unchanged.** The list of failing files was diffed line-for-line between the two `FAIL` listings and is byte-identical — same 14 files, same failure class (workflows tRPC `headers`-outside-request-scope, driver-pay settlements, notifications dispatcher, auth unit tests, validation schemas). **Zero genuine regressions.**

Scoped run over everything this task touched:
```
npx vitest run src/lib/document-import src/lib/carrier tests/carrier
Test Files  36 passed | 3 skipped (39)
     Tests  541 passed | 9 skipped (550)
```
(quick-530 baseline for this same scoped run was 35 passed / 533 passed tests — the +1 file / +8 tests delta is again exactly the new test file.)

## 7. `deletedAt` grep proof

**The hard invariant's actual target — the Task 3 lib-site diff (loads.ts, stops.ts, fleet-drivers.ts, route-template-save.ts) — is empty, as required:**
```
git diff bd5c8e9a~1 bd5c8e9a -U0 -- apps/web/src/lib | Select-String '^[+-].*deletedAt'
(no output)
```
Also re-verified with `git status`/`git diff` immediately after making the Task 3 edits and before committing — same empty result.

**The full-task diff (pre-task HEAD `ac226c07` → now) is NOT empty**, and this is expected, not a violation — reported honestly rather than silently squared away:
```
+function stubDb(row: { deletedAt: Date | null } | null) {
+  it('diagnoses DELETED when the row exists with deletedAt set', async () => {
+    const db = stubDb({ deletedAt: new Date('2026-01-01T00:00:00Z') });
+  it('diagnoses NOT_IN_ORG when the row exists with deletedAt null (missed the main query for some other reason)', async () => {
+    const db = stubDb({ deletedAt: null });
+ * queries (`where: { id, orgId, deletedAt: null }`) are touched by this
+ * query has already missed. Deliberately unfiltered by `deletedAt`: finding
+    select: { deletedAt: true },
+  return row?.deletedAt ? 'DELETED' : 'NOT_IN_ORG';
```
All 9 lines are confined to exactly two files: `facility-errors.ts` (4 lines) and `facility-errors.test.ts` (5 lines) — verified by per-file grep, zero hits in any other of the 11 changed files. This is precisely the one explicitly-permitted new occurrence: "inside the new `diagnoseFacilityUnavailable` helper, whose whole job is to find the soft-deleted row — that helper deliberately does NOT filter `deletedAt: null`, and that is correct, not a violation." No existing `deletedAt` line anywhere in the repo was added to, removed from, or altered — all ten filters from quick-530 remain byte-identical.

## 8. Per-item audit

| Task | Status | Justification |
|------|--------|----------------|
| 1 — Baseline + module | **IMPLEMENTED** | Baseline captured pre-edit (14/61, matches quick-530); `facility-errors.ts` exports exactly the four named symbols; 8 unit tests pass |
| 2 — Route mapping (inert) | **IMPLEMENTED** | Exactly 5 route files touched, +20/-0 lines total, one `instanceof` branch each above the existing 500 fallback; `(owner)/actions/loads.ts:214` verified unchanged |
| 3 — Lib site wiring | **IMPLEMENTED** | Sites 14/16/17/18 throw `FacilityUnavailableError`; site 15 keeps its `{ success, error }` shape with the new message; all five main ownership queries byte-identical; zero `deletedAt` diff at the lib scope |
| 4 — Gates, comparison, summary | **IMPLEMENTED** | tsc probed (error with probe, clean without, stray sweep clean); vitest baseline vs after shows zero genuine regressions (+8 net passing tests, same 14/61 failing set); `deletedAt` proof documented for both the hard-invariant scope (empty) and the full-task scope (non-empty, confined to the one permitted file, explained) |

No task was partially done. No architectural deviation (Rule 4) was needed — the plan's own instructions superseded the ticket's shorter route-file list, and that was flagged rather than treated as a silent deviation.

## Deviations from Plan

### Auto-fixed / flagged deviations (both anticipated and pre-authorized by the plan itself)

**1. New file `facility-errors.ts` not in the ticket's literal list.**
- **Found during:** Task 1 planning (already anticipated in the plan's own pre-flight).
- **Reason:** Avoids an import cycle — `facilities.ts` is imported by both `loads.ts` and `stops.ts`, the two files needing to throw the new error.
- **Files:** `apps/web/src/lib/carrier/facility-errors.ts`, `apps/web/src/lib/carrier/__tests__/facility-errors.test.ts`
- **Commit:** `e7734a3e`

**2. Four additional route files beyond the ticket's named `fleet/drivers/route.ts`.**
- **Found during:** Task 2.
- **Reason:** The ticket named only site 17's route file; sites 14, 16, and 18 each live behind their own route file and would have kept 500ing/404ing without their own `instanceof` branch. The plan's `<verified_state>` and task instructions correctly specified all five, and that is what was built.
- **Files:** `loads/route.ts`, `loads/[id]/route.ts`, `fleet/drivers/[id]/route.ts`, `stops/route.ts` (plus `fleet/drivers/route.ts` itself)
- **Commit:** `b258fe45`

No Rule 1–4 deviations occurred beyond what the plan itself flagged in advance. No architectural questions arose that required stopping.

## Self-Check

- `apps/web/src/lib/carrier/facility-errors.ts` — FOUND
- `apps/web/src/lib/carrier/__tests__/facility-errors.test.ts` — FOUND
- Commit `e7734a3e` — FOUND (`git log --oneline` confirms)
- Commit `b258fe45` — FOUND
- Commit `bd5c8e9a` — FOUND
