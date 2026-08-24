---
phase: quick-531
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/src/lib/carrier/facility-errors.ts
  - apps/web/src/lib/carrier/__tests__/facility-errors.test.ts
  - apps/web/src/app/api/v1/carrier/loads/route.ts
  - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/stops/route.ts
  - apps/web/src/lib/carrier/loads.ts
  - apps/web/src/lib/carrier/stops.ts
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/lib/carrier/route-template-save.ts
  - .planning/quick/531-standardise-the-five-facility-ownership-/531-SUMMARY.md
  - .planning/STATE.md

must_haves:
  truths:
    - "All five facility ownership-check sites distinguish DELETED from NOT_IN_ORG and say which, in the two approved sentences verbatim."
    - "Sites 14, 17 and 18 return HTTP 400 with the truthful message instead of a 500 'Internal server error'."
    - "Site 16 returns 400 for a facility problem while a genuinely absent dispatch or client still returns 404."
    - "Site 15 still returns the `{ success: false, error }` shape its three document-import callers depend on — only the message changed."
    - "Cross-tenant facility ids are still rejected; only status and wording changed."
    - "No `deletedAt` predicate anywhere in the repo was added, removed or altered by this task."
  artifacts:
    - path: "apps/web/src/lib/carrier/facility-errors.ts"
      provides: "FacilityUnavailableReason, FacilityUnavailableError, facilityUnavailableMessage(), diagnoseFacilityUnavailable()"
      exports: ["FacilityUnavailableReason", "FacilityUnavailableError", "facilityUnavailableMessage", "diagnoseFacilityUnavailable"]
    - path: "apps/web/src/lib/carrier/__tests__/facility-errors.test.ts"
      provides: "Unit proof that a soft-deleted row diagnoses DELETED, no row diagnoses NOT_IN_ORG, and the message strings are exact"
  key_links:
    - from: "apps/web/src/lib/carrier/loads.ts persistStops"
      to: "FacilityUnavailableError"
      via: "throw on the already-failed branch"
      pattern: "throw new FacilityUnavailableError"
    - from: "apps/web/src/app/api/v1/carrier/loads/route.ts catch"
      to: "FacilityUnavailableError"
      via: "instanceof branch above logger.error"
      pattern: "err instanceof FacilityUnavailableError"
---

<objective>
Give the five carrier facility ownership checks one shared, truthful failure mode: say whether the facility is **deleted** or **not in this organization**, and surface both as a 400 rather than a 500 or a misleading 404.

Purpose: three of the five sites currently answer a bad facility id with "Internal server error" because the routes map lib errors to 400 by **exact string match**, and site 14 interpolates an id into its message so it can never match. A fourth answers 404 "Dispatch or facility not found", which is wrong for a facility that exists but was deleted.

Output: one new module `lib/carrier/facility-errors.ts`, five lib sites throwing/returning through it, five route files mapping it to 400 by `instanceof`, and a summary carrying the required audit.
</objective>

<pre_flight priority="first">

## Read this before touching anything

**This task adds and changes ZERO `deletedAt` filters.** All ten were applied in quick-530 (commit `14a26fbb`) and verified present. If you find yourself editing a line containing `deletedAt`, you have misread the task — stop.

**Do not restructure any main query.** The approach is a *supplementary* lookup on the path that has **already failed**. The `where: { id, orgId, deletedAt: null }` query stays byte-identical at all five sites. If separating the two causes at any site appears to require restructuring the main query, **STOP and report** rather than restructuring.

**MUST NOT TOUCH:**
- Any `deletedAt: null` predicate (all ten).
- The eight Group B sites listed in `.planning/quick/530-*/530-SUMMARY.md`.
- `softDeleteFacility`, `optimisation-service.ts`, anything in optimisation or `route_matrix_cache`.
- `schema.prisma`, any migration. **No DDL. No Supabase writes.**
- Cross-tenant rejection must REMAIN a rejection — only its message and status change.

**Task ordering is deliberate:** the module lands first, then the **routes** (inert — they catch an error nothing throws yet), then the **libs** (which activate them). Reversed, the intermediate commit would turn site 16's honest 404 into a 500. Every commit in this plan is safe standing alone.

**Deviation from the ticket's file list — flag both in the summary:**
1. A **new file** (`facility-errors.ts`) is created. Deliberate: putting the helper in `facilities.ts` would create an import cycle with `loads.ts`/`stops.ts`.
2. The ticket named only `fleet/drivers/route.ts` among routes. That covers **site 17 only**. Without `loads/route.ts`, `loads/[id]/route.ts`, `fleet/drivers/[id]/route.ts` and `stops/route.ts`, sites 14, 16 and 18 keep returning 500/404 and the task's goal fails.

**PowerShell:** no `&&` or `||` as statement separators. One command per line, or use `;`.

</pre_flight>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md
@.planning/quick/530-pre-phase-8-ddl-batch-relay-handoff-enum/530-SUMMARY.md

Existing typed-error idiom to copy (read both — this is the pattern, not a suggestion):
@apps/web/src/lib/carrier/clients.ts        # DuplicateClientError, ~line 268
@apps/web/src/lib/carrier/fleet-trucks.ts   # CarrierTruckConflictError, ~line 47
</context>

<verified_state>
Live state of the five sites, verified from source at plan time. Do not re-derive; confirm line numbers have not drifted, then edit.

| # | Site | Current mechanism | Surfaces as |
|---|------|-------------------|-------------|
| 14 | `lib/carrier/loads.ts:372` `persistStops` (batch check, loop over `facilityIds`) | ``throw new Error(`Invalid facility: ${facilityId}`)`` | **500** via `api/v1/carrier/loads/route.ts` (POST) and `loads/[id]/route.ts` (PATCH) |
| 15 | `lib/carrier/route-template-save.ts:246` (batch, `invalidFacility`) | `return { success: false, error: 'Invalid facility — does not belong to this organization' }` | validation result — **shape is load-bearing** |
| 16 | `lib/carrier/stops.ts:135` `createStop` | `return null` | **404** 'Dispatch or facility not found' via `api/v1/carrier/stops/route.ts:67` |
| 17 | `lib/carrier/fleet-drivers.ts:247` `createCarrierDriver` | `throw new Error('Invalid homeTerminalId: facility not found in this organization')` | **500** via `api/v1/carrier/fleet/drivers/route.ts` |
| 18 | `lib/carrier/fleet-drivers.ts:597` `updateCarrierDriver` | same throw | **500** via `api/v1/carrier/fleet/drivers/[id]/route.ts` |

Why 14/17/18 are 500s: the routes DO map lib errors to 400, but by exact string equality (`'Invalid client'`, `'Invalid contract'`, `'User already linked to a carrier driver'`). These five were never added to that convention, and site 14's interpolated id makes it structurally unmatchable. **This is why the fix uses `instanceof`, not another string.**

Tenant client at every site is a plain `PrismaClient` (`getTenantPrisma(): Promise<PrismaClient>`); `saveRouteTemplateCore` already takes `db: PrismaClient` as a parameter. The helper takes the client so every site diagnoses through the same tenant-scoped connection.

`app/(owner)/actions/loads.ts:214` already returns `error.message` verbatim — the truthful message lands there automatically. **Verify, do not edit.**

The two approved strings, verbatim, no rewording:
```
DELETED     → "That facility has been deleted and cannot be used."
NOT_IN_ORG  → "That facility does not belong to this organization."
```
</verified_state>

<tasks>

<task type="auto">
  <name>Task 1: Capture the pre-task baseline, then add the shared facility-error module</name>
  <files>
apps/web/src/lib/carrier/facility-errors.ts (new)
apps/web/src/lib/carrier/__tests__/facility-errors.test.ts (new)
  </files>
  <action>
**Step A — baseline BEFORE any edit (this is the pre-task commit state; capture it now rather than checking it out later).**

Record the current HEAD hash. Then from `apps/web`, run the full vitest suite and save the raw output:

```
cd apps/web
npx vitest run --reporter=verbose 2>&1 | Tee-Object -FilePath "$env:TEMP\531-vitest-baseline.txt"
```

Record the failed-file count and failed-test count. quick-530's baseline was **14 files / 61 failures, all pre-existing**. If your numbers differ materially from that, note it — do not attempt to fix anything.

**Step B — create `apps/web/src/lib/carrier/facility-errors.ts`.** It exports exactly four things:

1. `export type FacilityUnavailableReason = 'DELETED' | 'NOT_IN_ORG';`

2. `export function facilityUnavailableMessage(reason: FacilityUnavailableReason): string` — returns the two approved strings verbatim. This function is the single place either sentence appears; site 15 uses it directly because it must keep its result shape.

3. `export class FacilityUnavailableError extends Error` with:
   - `readonly reason: FacilityUnavailableReason`
   - `readonly facilityId: string`
   - constructor `(reason, facilityId)` calling `super(facilityUnavailableMessage(reason))`
   - `this.name = 'FacilityUnavailableError'`
   - The facility id lives **on the object, never interpolated into the message** — that keeps the message a stable, matchable, user-safe sentence while preserving site 14's debugging value for the logger.

4. `export async function diagnoseFacilityUnavailable(db: PrismaClient, facilityId: string, orgId: string): Promise<FacilityUnavailableReason>` — the supplementary lookup, called **only on a path that has already failed**:

```ts
const row = await db.carrierFacility.findFirst({
  where: { id: facilityId, orgId },
  select: { deletedAt: true },
});
return row?.deletedAt ? 'DELETED' : 'NOT_IN_ORG';
```

Note the absent `deletedAt: null` — this query is *deliberately* unfiltered because finding the soft-deleted row is its entire job. It is a **new** query, not an edit to an existing predicate. `orgId` stays, so a cross-tenant id still diagnoses `NOT_IN_ORG` and is still rejected.

Import `PrismaClient` from `@prisma/client`. Add a file-header doc comment stating: (a) why this is its own module — avoiding an `facilities.ts` ↔ `loads.ts`/`stops.ts` import cycle; (b) that the main ownership queries are untouched and this runs only after one has already missed; (c) the cost — **one extra round trip on the failure path only**, never on a success path.

**Step C — create `apps/web/src/lib/carrier/__tests__/facility-errors.test.ts`.** Follow the style of the existing tests in that directory. Cover:
- a row with `deletedAt` set → `'DELETED'`
- a row with `deletedAt: null` → `'NOT_IN_ORG'` (it missed the main query for some other reason; NOT_IN_ORG is the safe answer)
- no row → `'NOT_IN_ORG'`
- both message strings asserted **as literals**, character for character
- `new FacilityUnavailableError('DELETED', 'fac_1').message` does not contain `'fac_1'`, and `.facilityId === 'fac_1'`
- `instanceof Error` and `instanceof FacilityUnavailableError` both hold

The db argument is a stub whose `carrierFacility.findFirst` returns the fixture. **A faked DB is not evidence about SQL** — these tests prove the branch logic and the strings only, and the test file should say so in a comment.
  </action>
  <verify>
`npx vitest run src/lib/carrier/__tests__/facility-errors.test.ts` from `apps/web` — all new tests pass.
Baseline file exists at `$env:TEMP\531-vitest-baseline.txt` with recorded counts.
  </verify>
  <done>Baseline captured with counts recorded. `facility-errors.ts` exports the four symbols; its tests pass. Nothing else in the repo has changed. Committed.</done>
</task>

<task type="auto">
  <name>Task 2: Map FacilityUnavailableError to 400 in the five route files (inert until Task 3)</name>
  <files>
apps/web/src/app/api/v1/carrier/loads/route.ts
apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts
apps/web/src/app/api/v1/carrier/stops/route.ts
  </files>
  <action>
In each file, import `FacilityUnavailableError` from `@/lib/carrier/facility-errors` and add **one narrow branch**:

```ts
if (err instanceof FacilityUnavailableError) {
  return NextResponse.json({ error: err.message }, { status: 400 });
}
```

placed **ABOVE** the existing `logger.error(...)` + 500 fallback in the `catch`. Per file:

1. `loads/route.ts` (POST, catch at ~line 111) — add alongside the existing `'Invalid client'` / `'Invalid contract'` string branches. Leave those exactly as they are.
2. `loads/[id]/route.ts` (PATCH, catch at ~line 97) — this catch currently has no branches at all; add the single `instanceof` above the `logger.error`.
3. `fleet/drivers/route.ts` (POST, catch at ~line 119) — add above the existing `'User already linked to a carrier driver'` branch or below it; either order works since the conditions are disjoint.
4. `fleet/drivers/[id]/route.ts` (PATCH, catch at ~line 99) — no existing branches; add the one.
5. `stops/route.ts` (POST, catch at ~line 71) — add the `instanceof` branch in the catch. **Leave the `if (!stop) → 404 'Dispatch or facility not found'` check exactly as it is** — after Task 3 that path only fires for a genuinely absent dispatch or client, which is an honest 404.

**Do NOT broaden any catch.** One `instanceof` branch each, nothing else. No change to the `logger.error` calls, no change to any 500 fallback, no change to any status code other than the new 400 branch. A genuine server error must still be a logged 500.

Also **verify without editing**: `app/(owner)/actions/loads.ts:214` returns `error.message` verbatim, so it needs no change. Record the line you checked in the summary.

Commit. This commit is a no-op at runtime — nothing throws `FacilityUnavailableError` yet — which is exactly why it goes before Task 3.
  </action>
  <verify>
`git diff --stat` shows exactly five route files touched.
`git diff` shows only added `instanceof` branches and imports — zero lines removed except where a branch was inserted mid-block.
`npx tsc --noEmit` from `apps/web` (a full probe is not required here; Task 4 owns the gate).
  </verify>
  <done>Five route files each carry one `FacilityUnavailableError` → 400 branch above their 500 fallback. No catch was broadened. `(owner)/actions/loads.ts` verified unchanged. Committed.</done>
</task>

<task type="auto">
  <name>Task 3: Route the five lib sites through the shared diagnosis</name>
  <files>
apps/web/src/lib/carrier/loads.ts
apps/web/src/lib/carrier/fleet-drivers.ts
apps/web/src/lib/carrier/stops.ts
apps/web/src/lib/carrier/route-template-save.ts
  </files>
  <action>
At each site, the existing ownership query stays **byte-identical**. Only the already-failed branch changes.

**Site 14 — `loads.ts` ~line 372, `persistStops`.** Inside the existing loop, replace the interpolated `throw new Error(...)` with:
```ts
throw new FacilityUnavailableError(
  await diagnoseFacilityUnavailable(tenantPrisma, facilityId, orgId),
  facilityId,
);
```
The loop already breaks on the first bad id via the throw, so at most one supplementary lookup runs.

**Site 17 — `fleet-drivers.ts` ~line 247, `createCarrierDriver`.** Replace the `throw new Error('Invalid homeTerminalId: ...')` with the same construction, using `data.homeTerminalId`. **Leave the adjacent `'Invalid userId: user not found in this organization'` throw alone** — that is a user, not a facility, and is out of scope.

**Site 18 — `fleet-drivers.ts` ~line 597, `updateCarrierDriver`.** Identical change. Do not alter the `data.homeTerminalId !== undefined && data.homeTerminalId` guard.

**Site 16 — `stops.ts` ~line 135, `createStop`.** Change **only the facility branch**:
```ts
if (!facility) {
  throw new FacilityUnavailableError(
    await diagnoseFacilityUnavailable(tenantPrisma, data.facilityId, orgId),
    data.facilityId,
  );
}
```
The **dispatch branch and the client branch keep `return null`** — those are genuine absences and their 404 is correct. Add a short comment saying so, because the asymmetry looks like an oversight otherwise.

**Site 15 — `route-template-save.ts` ~line 246.** **KEEP the `{ success: false, error }` shape** — it is consumed by `optimisation-service.ts` (which must not be touched) plus two template-service callers. Only the message changes, and it comes from the same diagnosis:
```ts
if (invalidFacility) {
  const reason = await diagnoseFacilityUnavailable(db, invalidFacility, orgId);
  return { success: false, error: facilityUnavailableMessage(reason) };
}
```
Do **not** throw here. Do not change the return type. Leave the sibling `'Invalid truck — does not belong to this organization'` return alone.

Imports: `FacilityUnavailableError` / `diagnoseFacilityUnavailable` / `facilityUnavailableMessage` from `./facility-errors`.

If any site turns out to need the main query restructured to separate the two causes — **STOP and report**. Do not restructure.
  </action>
  <verify>
`git diff apps/web/src/lib` shows zero changes to any line containing `deletedAt`:
```
cd C:\Users\sammy\Projects\DriveCommand
git diff -U0 | Select-String -Pattern '^[+-].*deletedAt'
```
must return **nothing**.
`npx tsc --noEmit` from `apps/web` clean (full probe in Task 4).
  </verify>
  <done>All five lib sites throw/return via the shared diagnosis. `stops.ts` dispatch and client branches still `return null`. `route-template-save.ts` keeps its result shape. Zero `deletedAt` lines in the diff. Committed.</done>
</task>

<task type="auto">
  <name>Task 4: Prove the gates, compare against baseline, and write the summary</name>
  <files>
.planning/quick/531-standardise-the-five-facility-ownership-/531-SUMMARY.md
.planning/STATE.md
  </files>
  <action>
**Step A — the tsc gate, probed. The gate is KNOWN TO LIE.**

From `apps/web`, run `npx tsc --noEmit`.

- If the only errors are **syntax** errors (TS1110/TS1161/TS1354 and friends), or they are all in files you did not touch — **the gate is blind, not green.** Delete `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo`, re-run.
- Then **probe it**: inject `const x: number = 'y';` into a file you actually edited (use `src/lib/carrier/loads.ts`). Re-run tsc and confirm it reports **that** error. Remove the probe. Re-run and confirm clean.
- Sweep for strays left by previous runs: `Get-ChildItem -Recurse -Filter '__probe.ts' apps/web/src`. Report anything found.

Record the probe result verbatim in the summary. A clean run that was not probed is not evidence.

**Step B — regression comparison.** From `apps/web`, run the full suite again:
```
npx vitest run --reporter=verbose 2>&1 | Tee-Object -FilePath "$env:TEMP\531-vitest-after.txt"
```
Diff the failed-file and failed-test counts against the Task 1 baseline (which was taken at the pre-task commit, before any edit — equivalent to checking that commit out and running the same files). **Report only genuine regressions**, i.e. files or tests that pass in the baseline and fail now. Pre-existing failures are noise; name the count, not the details.

If there is a genuine regression, **STOP and report it.** No workarounds.

**Step C — the `deletedAt` proof.** From the repo root, against the full task diff (pre-task HEAD → now):
```
git diff <pre-task-HEAD> -U0 | Select-String -Pattern '^[+-].*deletedAt'
```
Paste the (empty) result into the summary. This is the task's hard invariant.

**Step D — write `531-SUMMARY.md`.** It MUST contain, in this order:
1. **Step 1 live report** — the five-site table exactly as verified: site, file:line, old mechanism, old surfacing status.
2. **Step 2 analysis** — cause separation: why a single `where: { id, orgId, deletedAt: null }` collapses three causes; the supplementary-lookup approach; and the cost stated plainly, **not buried**: one extra round trip **on the failure path only**, never on success.
3. **Step 4 strings** — both sentences verbatim.
4. **Diff summary** — files changed, lines added/removed, and the two flagged deviations: the **new file** `facility-errors.ts` (with the import-cycle reason) and the **incomplete route list** in the ticket (only site 17 was covered; four more route files were required or sites 14/16/18 would still be wrong).
5. **tsc probe result** — the injected error, tsc reporting it, its removal, the clean re-run.
6. **Regression comparison** — baseline counts vs after counts, genuine regressions (expected: none).
7. **`deletedAt` grep proof** — the empty result.
8. **Per-item audit of steps 1–8**, each marked **IMPLEMENTED / PARTIALLY / NOT DONE** with a one-line justification.

Also record, honestly: `stops.ts` dispatch/client still 404; `route-template-save.ts` keeps its shape so its callers are unchanged; `(owner)/actions/loads.ts` needed no edit and got none.

**Step E — add the quick-531 row to `.planning/STATE.md`** following the existing row format, and stamp the implementation commit hash.

Commit docs. **Commit only — never push.**
  </action>
  <verify>
`npx tsc --noEmit` clean AND the probe demonstrably reported the injected error.
No `__probe.ts` anywhere under `apps/web/src`.
Vitest: no genuine regressions vs baseline.
`git diff <pre-task-HEAD> -U0 | Select-String '^[+-].*deletedAt'` returns nothing.
`531-SUMMARY.md` contains all eight required sections; STATE.md has the quick-531 row.
  </verify>
  <done>tsc probed and clean, suite compared to baseline with no genuine regressions, `deletedAt` proof empty, summary carries all eight sections including the 1–8 audit, STATE.md updated. Committed, not pushed.</done>
</task>

</tasks>

<verification>
1. `apps/web/src/lib/carrier/facility-errors.ts` exists and is the **only** place either approved sentence is written:
   `Select-String -Path apps\web\src -Pattern 'has been deleted and cannot be used' -Recurse` → one source hit (plus the test).
2. Five lib sites reference `diagnoseFacilityUnavailable`; four of them throw `FacilityUnavailableError`, `route-template-save.ts` returns `{ success: false, error }`.
3. Five route files each contain exactly one `err instanceof FacilityUnavailableError` branch, each above its `logger.error` + 500 fallback.
4. `stops/route.ts` still returns 404 'Dispatch or facility not found' for the non-facility branches.
5. `optimisation-service.ts`, `softDeleteFacility`, `schema.prisma` and every migration are untouched — confirm via `git diff --name-only <pre-task-HEAD>`.
6. Zero `deletedAt` lines in the full task diff.
7. `npx tsc --noEmit` clean **and probed**.
8. Full vitest suite shows no genuine regression against the Task 1 baseline.
</verification>

<success_criteria>
- A deleted facility id sent to any of the five sites yields "That facility has been deleted and cannot be used."
- A cross-tenant facility id yields "That facility does not belong to this organization." and is still **rejected**.
- Sites 14, 17, 18 return **400**, not 500. Site 16 returns **400** for a facility problem, **404** for an absent dispatch or client. Site 15 returns its unchanged shape with the new message.
- No `deletedAt` predicate anywhere was added, removed or altered.
- No DDL, no migration, no Supabase write.
- Four commits, none pushed.
</success_criteria>

<output>
Create `.planning/quick/531-standardise-the-five-facility-ownership-/531-SUMMARY.md` with the eight sections listed in Task 4 Step D.
</output>
