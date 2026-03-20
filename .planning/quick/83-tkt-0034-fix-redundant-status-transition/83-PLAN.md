---
phase: quick-83
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/loads.ts
autonomous: true
must_haves:
  truths:
    - "Calling updateLoadStatus with the current status returns success without error"
    - "Valid status transitions still work as before"
    - "Invalid status transitions still return an error"
  artifacts:
    - path: "src/app/(owner)/actions/loads.ts"
      provides: "Idempotent updateLoadStatus server action"
      contains: "load.status === newStatus"
  key_links: []
---

<objective>
TKT-0034: Make updateLoadStatus idempotent so that setting a load to its current status returns success instead of throwing a transition error.

Purpose: When two actors (driver portal + owner portal) race to set the same status, the second request currently fails with "Cannot transition from X to X". This is a poor UX -- idempotent status updates should succeed silently.
Output: Patched server action that short-circuits on same-status requests.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(owner)/actions/loads.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add idempotency guard to updateLoadStatus</name>
  <files>src/app/(owner)/actions/loads.ts</files>
  <action>
In the `updateLoadStatus` function (line ~350), add an idempotency check immediately after the `!load` null check (after line 359) and before the allowed transitions check (line 361):

```ts
// Idempotency: if already at target status, treat as success (TKT-0034)
if (load.status === newStatus) {
  return { success: true };
}
```

This must go BEFORE the `allowedTransitions` check so that same-status requests never hit the transition validation logic.

Do NOT change any other behavior -- valid transitions, invalid transitions, the INVOICED guard, and the DB update must all remain unchanged.
  </action>
  <verify>
1. `npx tsc --noEmit` passes (no type errors)
2. Read the patched function to confirm the guard is in the correct position (after null check, before transition validation)
  </verify>
  <done>
- Same-status calls (e.g., PICKED_UP to PICKED_UP) return `{ success: true }` without DB write
- Valid transitions still proceed normally
- Invalid transitions still return error
  </done>
</task>

</tasks>

<verification>
- TypeScript compilation passes
- The idempotency guard is positioned correctly in the function flow
</verification>

<success_criteria>
updateLoadStatus is idempotent: setting a load to its current status returns success instead of an error. No regressions to valid or invalid transition handling.
</success_criteria>

<output>
After completion, create `.planning/quick/83-tkt-0034-fix-redundant-status-transition/83-SUMMARY.md`
</output>
