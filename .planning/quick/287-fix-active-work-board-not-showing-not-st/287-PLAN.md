---
phase: quick-287
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/server/api/routers/workflows/instance.ts
  - apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx
autonomous: true

must_haves:
  truths:
    - "NOT_STARTED PlaybookInstances appear on the Active Work Board"
    - "NOT_STARTED instances without overdue steps render in the 'In Progress' swimlane"
    - "NOT_STARTED instances WITH overdue steps render in the 'Needs Attention' swimlane"
    - "BLOCKED instances continue to render in 'Needs Attention'"
    - "IN_PROGRESS instances continue to render correctly (overdue → attention, otherwise → progress)"
    - "COMPLETED instances do NOT appear on the Work Board (except completed-today in the 'Completed Today' lane)"
    - "Tenant isolation is preserved (instance.list still filters by ctx.tenantId)"
  artifacts:
    - path: "apps/web/src/server/api/routers/workflows/instance.ts"
      provides: "instance.list tRPC procedure that already returns NOT_STARTED when no status filter is passed"
      contains: "tenantId: ctx.tenantId"
    - path: "apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx"
      provides: "Swimlane classifier that buckets NOT_STARTED into 'progress' or 'attention'"
      contains: "NOT_STARTED"
  key_links:
    - from: "apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx"
      to: "classifyInstance() handles NOT_STARTED"
      via: "explicit branch returning 'attention' if any step is overdue, else 'progress'"
      pattern: "instance\\.status === 'NOT_STARTED'"
---

<objective>
Fix the Active Work Board on `/checklists` so that PlaybookInstances with status `NOT_STARTED` appear in the swimlanes. Today they are silently dropped because the client-side classifier in `WorkBoardSection.tsx` only handles `BLOCKED`, `COMPLETED`, and `IN_PROGRESS` — `NOT_STARTED` falls through to `return null` and the instance is excluded from all three lanes.

Per the workflow engine spec, NOT_STARTED instances are still **active** (the user has generated them but not begun work). They must surface on the board so the owner can see and start them. They go to:
- **In Progress** swimlane by default
- **Needs Attention** swimlane if any step is overdue (same overdue rule already applied to IN_PROGRESS)

`COMPLETED` instances must continue to be excluded (except the existing "Completed Today" lane behavior). Tenant isolation must remain intact.

Purpose: Owners can see and pick up checklists they have generated but not yet started.
Output: NOT_STARTED instances render on the Work Board in the correct swimlane.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md

# Files to investigate / fix
@apps/web/src/server/api/routers/workflows/instance.ts
@apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx

# Caller of instance.list (no status filter passed → API returns all statuses)
@apps/web/src/app/(owner)/checklists/_components/DashboardClient.tsx

# Workflow engine spec (Section 14 — phase scope; Section 3 — naming)
@docs/specs/workflow-engine.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify instance.list returns NOT_STARTED and document the contract</name>
  <files>apps/web/src/server/api/routers/workflows/instance.ts</files>
  <action>
Investigate the `list` procedure (lines 40-77) to confirm it already returns NOT_STARTED instances when no status filter is passed.

**Current behavior (already correct):**
- Line 47: `...(status ? { status } : {})` — status is only added to the where clause when the caller passes one. `DashboardClient.tsx` (line 28) calls `trpc.workflows.instance.list.queryOptions({ take: 20 })` with NO status filter, so all four statuses (NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETED) come back.
- Line 46: `tenantId: ctx.tenantId` — tenant isolation preserved.
- Lines 60-69: status sort already places NOT_STARTED at index 2 (after BLOCKED and IN_PROGRESS, before COMPLETED).

**The bug is NOT in this file.** The API is correct. Do not change the where clause and do not add a status filter — adding one would re-introduce the exact bug we are fixing (excluding NOT_STARTED).

**What to do in this task:**
1. Re-read lines 40-77 to confirm the analysis above.
2. Update the JSDoc on the `list` procedure (line 6) to make the contract explicit. Replace:
   ```
   *   list                — tenantMemberProcedure: paginated list, sorted BLOCKED→IN_PROGRESS→NOT_STARTED→COMPLETED
   ```
   with:
   ```
   *   list                — tenantMemberProcedure: paginated list across ALL statuses (NOT_STARTED, IN_PROGRESS, BLOCKED, COMPLETED) when no `status` filter is passed; sorted BLOCKED→IN_PROGRESS→NOT_STARTED→COMPLETED. Callers that want to exclude e.g. COMPLETED must pass `status` explicitly or filter client-side.
   ```
3. Add a brief inline comment above line 47 (the `...(status ? { status } : {})` line) clarifying: `// No filter ⇒ returns all statuses including NOT_STARTED — Active Work Board relies on this.`

**Do NOT:**
- Change the where clause logic
- Add a default status filter
- Touch any other procedure (`generate`, `get`, `getForEntity`, `computeReadiness`, `getDriverReadiness`)
- Modify the sort order
- Touch `listInstancesSchema` in `packages/validation`
  </action>
  <verify>
1. Open `apps/web/src/server/api/routers/workflows/instance.ts` and confirm the JSDoc on the `list` procedure mentions all four statuses.
2. Confirm line 47 still reads `...(status ? { status } : {})` — UNCHANGED.
3. Confirm `tenantId: ctx.tenantId` is still on line 46.
4. Run from repo root: `npx tsc --noEmit -p apps/web/tsconfig.json` — must pass with no new errors.
  </verify>
  <done>
- The `list` JSDoc explicitly states it returns all statuses when no filter is passed.
- An inline comment near the where clause explains the Work Board reliance on this behavior.
- No behavioral change to the procedure (where clause, sort, tenant filter all unchanged).
- TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix swimlane classifier to bucket NOT_STARTED instances</name>
  <files>apps/web/src/app/(owner)/checklists/_components/WorkBoardSection.tsx</files>
  <action>
Fix `classifyInstance()` (lines 28-49) so NOT_STARTED instances are routed to a swimlane instead of being dropped.

**Current bug (line 28-49):**
```ts
function classifyInstance(instance: InstanceListItem): BucketKey | null {
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  if (instance.status === 'BLOCKED') return 'attention';
  if (instance.status === 'COMPLETED') {
    return instance.completedAt && new Date(instance.completedAt) >= todayMidnight
      ? 'completed'
      : null;
  }
  if (instance.status === 'IN_PROGRESS') {
    const hasOverdue = instance.stepInstances.some(
      (s) =>
        s.status !== 'COMPLETE' &&
        s.status !== 'SKIPPED' &&
        s.dueDate != null &&
        new Date(s.dueDate) < new Date(),
    );
    return hasOverdue ? 'attention' : 'progress';
  }
  return null;  // ← NOT_STARTED falls through here and is silently dropped
}
```

**Fix:** Treat NOT_STARTED with the same overdue-detection logic as IN_PROGRESS — both are "active" instances. Replace the body of `classifyInstance` with logic that:

1. Keeps `BLOCKED → 'attention'` unchanged.
2. Keeps the COMPLETED branch unchanged (today → 'completed', older → null so it does NOT appear on the board).
3. Treats `IN_PROGRESS` and `NOT_STARTED` together: check overdue steps; if any → `'attention'`, else → `'progress'`.
4. Any other status (defensive) → `null`.

Concrete replacement:

```ts
function classifyInstance(instance: InstanceListItem): BucketKey | null {
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  if (instance.status === 'BLOCKED') return 'attention';

  if (instance.status === 'COMPLETED') {
    return instance.completedAt && new Date(instance.completedAt) >= todayMidnight
      ? 'completed'
      : null;
  }

  // NOT_STARTED and IN_PROGRESS are both "active" — show on the board.
  // Route to 'attention' if any step is overdue, otherwise 'progress'.
  if (instance.status === 'IN_PROGRESS' || instance.status === 'NOT_STARTED') {
    const now = new Date();
    const hasOverdue = instance.stepInstances.some(
      (s) =>
        s.status !== 'COMPLETE' &&
        s.status !== 'SKIPPED' &&
        s.dueDate != null &&
        new Date(s.dueDate) < now,
    );
    return hasOverdue ? 'attention' : 'progress';
  }

  return null;
}
```

**Do NOT:**
- Change `getNextStepLabel`, `getEntityLink`, `getEntityLabel`, `getPlaybookName`, `getEntityName`, `CircularProgress`, `InstanceCard`, `SwimlaneColumn`, or `WorkBoardSection` (the rendering components are correct).
- Change the swimlane titles ("Needs Attention", "In Progress", "Completed Today") — these match Section 3 naming in the workflow engine spec.
- Change the `BucketKey` type or the `classifyInstance` return type.
- Add a new bucket for NOT_STARTED — it must reuse the existing `progress` / `attention` lanes per the spec.
- Add a status filter to the upstream `instance.list` call in `DashboardClient.tsx`.
  </action>
  <verify>
1. Run `npx tsc --noEmit -p apps/web/tsconfig.json` — must pass.
2. Run dev server (`npm run dev` in `apps/web` or root turbo) and visit `/checklists`.
3. With a NOT_STARTED PlaybookInstance present in the DB for the current tenant:
   - Confirm it now appears on the Work Board.
   - Confirm it shows in the **In Progress** swimlane (yellow border) when no steps are overdue.
   - Manually set one of its `PlaybookStepInstance.dueDate` to yesterday in the DB and refresh — confirm it moves to the **Needs Attention** swimlane (red border).
4. Confirm a COMPLETED instance with `completedAt` older than today still does NOT appear in any swimlane.
5. Confirm a BLOCKED instance still appears in **Needs Attention**.
  </verify>
  <done>
- A NOT_STARTED instance with no overdue steps renders in the "In Progress" swimlane.
- A NOT_STARTED instance with at least one overdue step renders in the "Needs Attention" swimlane.
- BLOCKED, IN_PROGRESS, and COMPLETED behavior is unchanged.
- TypeScript compiles cleanly.
- Only `classifyInstance` was modified — all other functions/components in the file are byte-identical.
  </done>
</task>

</tasks>

<verification>
End-to-end check on `/checklists`:

1. Seed/locate (in the current tenant):
   - 1× NOT_STARTED instance with all step `dueDate`s in the future (or null) → expect **In Progress** lane.
   - 1× NOT_STARTED instance with at least one step `dueDate` in the past and step status not COMPLETE/SKIPPED → expect **Needs Attention** lane.
   - 1× BLOCKED instance → expect **Needs Attention**.
   - 1× IN_PROGRESS instance with no overdue steps → expect **In Progress**.
   - 1× COMPLETED instance with `completedAt` >= today midnight → expect **Completed Today**.
   - 1× COMPLETED instance with `completedAt` < today midnight → expect to NOT appear.

2. Tenant isolation: switching to a different tenant must not show any of the above.

3. `npx tsc --noEmit -p apps/web/tsconfig.json` passes.

4. Git diff scope check — only the two files in `files_modified` should be changed.
</verification>

<success_criteria>
- [ ] NOT_STARTED instances visible on the Work Board (In Progress or Needs Attention based on overdue steps)
- [ ] BLOCKED, IN_PROGRESS, COMPLETED behavior unchanged
- [ ] COMPLETED instances older than today still excluded
- [ ] Tenant isolation preserved (instance.list `where` clause still includes `tenantId: ctx.tenantId`)
- [ ] `instance.list` JSDoc updated to document the all-statuses contract
- [ ] No files outside the two listed in frontmatter were modified
- [ ] `npx tsc --noEmit -p apps/web/tsconfig.json` passes
</success_criteria>

<output>
After completion, create `.planning/quick/287-fix-active-work-board-not-showing-not-st/287-SUMMARY.md` documenting:
- The two files touched and the line-level changes
- Confirmation that the bug was client-side (classifier), not server-side (filter)
- Manual UAT result for the five swimlane scenarios
</output>
