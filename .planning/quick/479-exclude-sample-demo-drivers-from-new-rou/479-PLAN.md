---
phase: quick-479
plan: 479
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/drivers.ts
  - apps/web/src/app/(owner)/routes/new/page.tsx
  - apps/web/src/app/(owner)/routes/[id]/page.tsx
autonomous: true

must_haves:
  truths:
    - "Sample/demo drivers (User.isSample = true) do NOT appear in the New Route driver + co-driver pickers"
    - "Sample/demo drivers do NOT appear in the Edit Route driver + co-driver pickers for NEW selection"
    - "A route already assigned to a sample OR deactivated driver still shows that driver in the dropdown (existing assignment never silently dropped)"
    - "drivers/page.tsx and tags/page.tsx driver lists are byte-for-byte unaffected (still call listDrivers() with no args)"
  artifacts:
    - path: "apps/web/src/app/(owner)/actions/drivers.ts"
      provides: "listDrivers with excludeSamples option that adds isSample:false to the where clause"
      contains: "excludeSamples"
    - path: "apps/web/src/app/(owner)/routes/new/page.tsx"
      provides: "New Route picker sourced from listDrivers({ activeOnly: true, excludeSamples: true })"
      contains: "excludeSamples: true"
    - path: "apps/web/src/app/(owner)/routes/[id]/page.tsx"
      provides: "Edit Route picker sourced from listDrivers({ activeOnly: true, excludeSamples: true }); merge-assigned block unchanged"
      contains: "excludeSamples: true"
  key_links:
    - from: "routes/new/page.tsx"
      to: "listDrivers"
      via: "excludeSamples: true option"
      pattern: "excludeSamples: true"
    - from: "routes/[id]/page.tsx"
      to: "listDrivers"
      via: "excludeSamples: true option"
      pattern: "excludeSamples: true"
---

<objective>
Exclude sample/demo drivers (User.isSample = true) from the New Route and Edit Route driver + co-driver pickers. Live data confirms 15 active sample DRIVER users currently mix with 11 real ones in the picker. They are seeded demo data and must NEVER be selectable for a NEW route assignment. This extends quick-478.

Purpose: Prevent owners from accidentally assigning a fake/demo driver to a real route.
Output: `listDrivers` gains an `excludeSamples` opt; the two route pages opt in; all other callers and the edit-page merge fallback are untouched.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/(owner)/actions/drivers.ts
@apps/web/src/app/(owner)/routes/new/page.tsx
@apps/web/src/app/(owner)/routes/[id]/page.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add excludeSamples opt to listDrivers and opt in the two route pickers</name>
  <files>
    apps/web/src/app/(owner)/actions/drivers.ts
    apps/web/src/app/(owner)/routes/new/page.tsx
    apps/web/src/app/(owner)/routes/[id]/page.tsx
  </files>
  <action>
Make exactly three edits. Do NOT touch any other file. Do NOT reformat or reorder unrelated code.

**Edit 1 — `apps/web/src/app/(owner)/actions/drivers.ts`, the `listDrivers` function (currently lines ~236-251):**

Change the signature from:
```ts
export async function listDrivers(opts?: { activeOnly?: boolean }) {
```
to:
```ts
export async function listDrivers(opts?: { activeOnly?: boolean; excludeSamples?: boolean }) {
```

Then inside the `where` clause of the `prisma.user.findMany(...)` call, add the sample-exclusion condition alongside the existing conditional `isActive` spread. The final `where` must read:
```ts
    where: {
      role: 'DRIVER',
      ...(opts?.activeOnly ? { isActive: true } : {}),
      ...(opts?.excludeSamples ? { isSample: false } : {}),
    },
```
CRITICAL: the `excludeSamples` condition is a conditional spread, exactly like `activeOnly`. When no args are passed, BOTH spreads collapse to `{}`, so the default `where` stays byte-for-byte `{ role: 'DRIVER' }`. Do not add `isSample` unconditionally. Do not change `take: 100` or the `orderBy`.

**Edit 2 — `apps/web/src/app/(owner)/routes/new/page.tsx` (call at line ~16):**

Change:
```ts
    listDrivers({ activeOnly: true })
```
to:
```ts
    listDrivers({ activeOnly: true, excludeSamples: true })
```

**Edit 3 — `apps/web/src/app/(owner)/routes/[id]/page.tsx` (call at line ~76):**

Change:
```ts
    listDrivers({ activeOnly: true }).catch((err) => {
```
to:
```ts
    listDrivers({ activeOnly: true, excludeSamples: true }).catch((err) => {
```

**DO NOT TOUCH — the "merge already-assigned drivers" block in `routes/[id]/page.tsx`** (the block near line ~186 that re-fetches missing assigned primary/co-driver ids via `prisma.user.findMany({ where: { id: { in: missingIds }, role: 'DRIVER' } })`). Leave that query EXACTLY as-is. Do NOT add `isSample: false` to it. Rationale: a route already assigned to a deactivated OR sample driver must still show that driver in the dropdown so an existing assignment is never silently dropped; we only block NEW selection of samples.

**DO NOT TOUCH** `apps/web/src/app/(owner)/drivers/page.tsx` or `apps/web/src/app/(owner)/tags/page.tsx` — they call `listDrivers()` with no args and must stay that way.

**DO NOT TOUCH** `apps/web/src/actions/routes.ts` (or any `routes.ts` action file) — it must remain zero-diff.
  </action>
  <verify>
Run all of the following from `apps/web`:

1. Typecheck (must produce 0 new errors; the three touched files must be clean — note the ~35 pre-existing baseline errors from missing @types are acceptable, only flag NEW errors or errors in the touched files):
   ```
   cd apps/web && npx tsc --noEmit
   ```

2. Confirm the excludeSamples opt is wired (from repo root):
   ```
   grep -n "excludeSamples" apps/web/src/app/(owner)/actions/drivers.ts apps/web/src/app/(owner)/routes/new/page.tsx apps/web/src/app/(owner)/routes/[id]/page.tsx
   ```
   Expect: signature + conditional spread in drivers.ts, and `excludeSamples: true` in both route pages.

3. Confirm the other two callers are UNCHANGED (still no args):
   ```
   grep -n "listDrivers()" apps/web/src/app/(owner)/drivers/page.tsx apps/web/src/app/(owner)/tags/page.tsx
   ```
   Expect: a `listDrivers()` match in each.

4. Confirm the edit-page merge query was NOT given an isSample filter — inspect the block near line ~186 in `routes/[id]/page.tsx` and confirm it still reads `where: { id: { in: missingIds }, role: 'DRIVER' }` with NO `isSample`.

5. Confirm routes.ts is zero-diff:
   ```
   git diff --stat -- apps/web/src/actions/routes.ts
   ```
   Expect: no output (no changes).

6. Confirm the overall diff touches ONLY the three intended files:
   ```
   git status --porcelain
   ```
   Expect: only `actions/drivers.ts`, `routes/new/page.tsx`, `routes/[id]/page.tsx` modified.
  </verify>
  <done>
`listDrivers` accepts `{ activeOnly?, excludeSamples? }`; default (no-arg) behavior is byte-for-byte unchanged; both route pickers pass `excludeSamples: true`; the edit-page merge fallback query is unchanged; drivers/page.tsx and tags/page.tsx still call `listDrivers()`; routes.ts is zero-diff; `npx tsc --noEmit` shows 0 new errors and the three touched files are clean.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` → 0 new errors, three touched files clean.
- `git status --porcelain` → only the three intended files modified.
- `git diff --stat -- apps/web/src/actions/routes.ts` → empty (zero-diff).
- Edit-page merge block still has no `isSample` filter.
</verification>

<success_criteria>
- Sample drivers (isSample = true) no longer appear in New Route or Edit Route driver/co-driver pickers for new selection.
- Routes already assigned to a sample/deactivated driver still display that driver in the dropdown.
- drivers/page.tsx and tags/page.tsx driver lists unchanged.
- routes.ts zero-diff. Change committed atomically. NOT pushed, NOT deployed.
</success_criteria>

<commit>
After verification passes, commit atomically:
```
git add apps/web/src/app/(owner)/actions/drivers.ts "apps/web/src/app/(owner)/routes/new/page.tsx" "apps/web/src/app/(owner)/routes/[id]/page.tsx"
git commit -m "fix(quick-479): exclude sample/demo drivers from New/Edit Route driver pickers"
```
DO NOT `git push`. DO NOT run `vercel`. The user handles push/deploy.
</commit>

<output>
After completion, create `.planning/quick/479-exclude-sample-demo-drivers-from-new-rou/479-SUMMARY.md`.
</output>
