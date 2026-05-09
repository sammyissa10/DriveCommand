---
phase: quick-191
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/dispatch-generator.ts
autonomous: true
must_haves:
  truths:
    - "Auto-generated dispatches display DC-YYYY-NNNNN in dispatch list and detail views"
    - "Dispatch numbers from auto-generation never collide with manually created dispatch numbers"
    - "needsAssignment flag still works for conflict dispatches"
  artifacts:
    - path: "apps/web/src/lib/carrier/dispatch-generator.ts"
      provides: "Fixed dispatch number format and counter logic"
      contains: "[DISPATCH_NUMBER="
  key_links:
    - from: "apps/web/src/lib/carrier/dispatch-generator.ts"
      to: "DispatchCard.tsx / DispatchHeader.tsx"
      via: "notes field bracket format"
      pattern: "\\[DISPATCH_NUMBER="
---

<objective>
Fix dispatch numbers not generating or displaying in the dispatch list and detail views.

Purpose: Auto-generated dispatches show "—" instead of DC-YYYY-NNNNN because the notes format written by the generator does not match the regex the UI uses to extract dispatch numbers, and the counter only counts auto-generated dispatches instead of all org dispatches causing number collisions.

Output: Working dispatch number display for all auto-generated dispatches.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/dispatch-generator.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix dispatch number notes format and counter logic</name>
  <files>apps/web/src/lib/carrier/dispatch-generator.ts</files>
  <action>
Two changes in `dispatch-generator.ts`:

**Fix 1 — Notes format (lines ~302-304):**
Change the `autoNotes` construction to use the bracket format that the UI regex expects.

Current (broken):
```js
const autoNotes = hasConflict
  ? `[AUTO-GENERATED] dispatch_number=${dispatchNumber} needs_assignment=true`
  : `[AUTO-GENERATED] dispatch_number=${dispatchNumber}`;
```

Change to:
```js
const autoNotes = hasConflict
  ? `[DISPATCH_NUMBER=${dispatchNumber}] [AUTO-GENERATED] needs_assignment=true`
  : `[DISPATCH_NUMBER=${dispatchNumber}] [AUTO-GENERATED]`;
```

This matches the regex `notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/)` used in DispatchCard.tsx and DispatchHeader.tsx. The `needs_assignment=true` substring is preserved so the `notes?.includes('needs_assignment=true')` check in DispatchCard still works.

**Fix 2 — Counter collision (lines ~234-239):**
Replace the raw SQL query that only counts `[AUTO-GENERATED]` dispatches with a Prisma count of ALL org dispatches.

Current (broken):
```js
const existingAutoCount = await prisma.$queryRaw<{ count: bigint }[]>`
  SELECT COUNT(*) as count FROM dispatches
  WHERE org_id = ${orgId}::uuid
    AND notes LIKE '[AUTO-GENERATED]%'
`;
let dispatchCounter = Number(existingAutoCount[0]?.count ?? 0);
```

Change to:
```js
const existingCount = await prisma.carrierDispatch.count({ where: { orgId } });
let dispatchCounter = existingCount;
```

This ensures auto-generated dispatch numbers start after ALL existing dispatches (both manual and auto), preventing number collisions. Also update the comment above to reflect the new logic (remove the note about only counting auto-generated dispatches).
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — must pass with zero errors.

Then verify with grep:
- `grep -n "DISPATCH_NUMBER=" apps/web/src/lib/carrier/dispatch-generator.ts` shows the new bracket format
- `grep -n "carrierDispatch.count" apps/web/src/lib/carrier/dispatch-generator.ts` shows the new counter query
- `grep -n "queryRaw" apps/web/src/lib/carrier/dispatch-generator.ts` should NOT match the old counter query (may still appear elsewhere in file)
  </verify>
  <done>
Auto-generated dispatch notes use `[DISPATCH_NUMBER=DC-YYYY-NNNNN]` bracket format matching the UI extraction regex. Counter counts all org dispatches to prevent collisions with manually created dispatch numbers. TypeScript compiles cleanly.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes in apps/web
- The notes format in dispatch-generator.ts matches the regex in DispatchCard.tsx and DispatchHeader.tsx
- Counter logic counts all org dispatches, not just auto-generated ones
</verification>

<success_criteria>
- Auto-generated dispatches will display DC-YYYY-NNNNN in both dispatch list (DispatchCard) and detail (DispatchHeader) views
- No dispatch number collisions between manual and auto-generated dispatches
- needsAssignment detection still works via `notes?.includes('needs_assignment=true')`
</success_criteria>

<output>
After completion, create `.planning/quick/191-fix-dispatch-numbers-not-generating-or-d/191-SUMMARY.md`
</output>
