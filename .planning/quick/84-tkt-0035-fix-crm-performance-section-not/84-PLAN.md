---
phase: quick-84
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/loads.ts
autonomous: true
must_haves:
  truths:
    - "When a load transitions to INVOICED, the linked customer's totalLoads increments by 1"
    - "When a load transitions to INVOICED, the linked customer's totalRevenue increments by the load rate"
    - "When a load transitions to INVOICED, the linked customer's lastLoadDate is set to now"
    - "The CRM customer detail page reflects updated stats after invoicing a load"
  artifacts:
    - path: "src/app/(owner)/actions/loads.ts"
      provides: "Customer stats update on INVOICED transition"
      contains: "totalLoads.*increment"
  key_links:
    - from: "src/app/(owner)/actions/loads.ts"
      to: "prisma.customer.update"
      via: "fire-and-forget after load status update"
      pattern: "prisma\\.customer\\.update"
---

<objective>
Fix TKT-0035: CRM Performance section (totalLoads, totalRevenue, lastLoadDate) never updates when a load is invoiced.

Purpose: Customer performance metrics on the CRM detail page are stale because no code updates them on load status transitions.
Output: `updateLoadStatus` in loads.ts updates customer stats when transitioning to INVOICED.
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
  <name>Task 1: Update customer stats on INVOICED transition</name>
  <files>src/app/(owner)/actions/loads.ts</files>
  <action>
In `updateLoadStatus` (line ~350), make these changes:

1. Expand the `findUnique` select on line 356 to include `customerId` and `rate`:
   ```ts
   select: { status: true, customerId: true, rate: true }
   ```

2. After the `prisma.load.update` call (line 381-384) and before the notification block (line 386), add a fire-and-forget customer stats update when transitioning to INVOICED:
   ```ts
   // Update CRM customer performance stats
   if (newStatus === 'INVOICED' && load.customerId) {
     prisma.customer.update({
       where: { id: load.customerId },
       data: {
         totalLoads: { increment: 1 },
         totalRevenue: { increment: load.rate },
         lastLoadDate: new Date(),
       },
     }).catch((err) => console.error('Failed to update customer stats:', err));
   }
   ```

3. Add `revalidatePath` for the CRM customer page after the existing revalidations (after line 399, before `return { success: true }`):
   ```ts
   if (load.customerId) {
     revalidatePath(`/crm/${load.customerId}`);
   }
   ```

   Note: `load.customerId` is accessible here because the variable is declared in the try block scope and the revalidations are outside the try-catch. Move the `revalidatePath` calls for `/loads` and `/loads/${id}` and the new `/crm/${load.customerId}` inside the try block, after the notification block (before the catch), so `load` is in scope. Alternatively, hoist `customerId` to a `let` variable before the try block and assign it after the findUnique.

Follow the same fire-and-forget pattern used by `sendNotificationAndLogInteraction` on line 389 (no await, .catch for error handling).
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no type errors.
    Grep for `totalLoads.*increment` in loads.ts to confirm the update is present.
    Grep for `revalidatePath.*crm` in loads.ts to confirm cache invalidation is present.
  </verify>
  <done>
    When updateLoadStatus transitions a load to INVOICED, it fires a customer.update incrementing totalLoads by 1, totalRevenue by load.rate, and setting lastLoadDate to now. The CRM page path is revalidated so the UI reflects changes.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- The customer stats update fires only for INVOICED transitions (not other statuses)
- The update is fire-and-forget (no await) so it never blocks the load status change
- `revalidatePath` is called for the CRM customer page
</verification>

<success_criteria>
- TypeScript compiles without errors
- `updateLoadStatus` updates customer totalLoads, totalRevenue, lastLoadDate on INVOICED transition
- CRM page cache is invalidated via revalidatePath
</success_criteria>

<output>
After completion, create `.planning/quick/84-tkt-0035-fix-crm-performance-section-not/84-SUMMARY.md`
</output>
