---
phase: quick-72
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/lib/trucks/compute-truck-status.ts
autonomous: true
must_haves:
  truths:
    - "Trucks with expired registrationExpiry in documentMetadata show 'Expired Docs' status"
    - "Trucks with expired insuranceExpiry in documentMetadata show 'Expired Docs' status"
    - "Trucks with valid or missing documentMetadata dates are unaffected"
    - "Existing Document model expiry check still works alongside the new check"
  artifacts:
    - path: "src/lib/trucks/compute-truck-status.ts"
      provides: "documentMetadata expiry parsing in computeTruckStatus"
      contains: "documentMetadata"
  key_links:
    - from: "src/lib/trucks/compute-truck-status.ts"
      to: "truck.documentMetadata"
      via: "JSON field parsing in hasExpiredDocs check"
      pattern: "documentMetadata.*(registrationExpiry|insuranceExpiry)"
---

<objective>
TKT-0025: Fix Expired Docs status not triggering for trucks that store registration and insurance expiry dates in the documentMetadata JSONB field.

Purpose: computeTruckStatus currently only checks the Document model relation (truck.documents) for expired docs, but ignores the documentMetadata JSON field on the Truck model which stores registrationExpiry and insuranceExpiry as ISO date strings.

Output: Updated compute-truck-status.ts that parses documentMetadata expiry dates and includes them in the expired docs check.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/lib/trucks/compute-truck-status.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Parse documentMetadata expiry dates in computeTruckStatus</name>
  <files>src/lib/trucks/compute-truck-status.ts</files>
  <action>
1. Add a type alias above the TruckWithRelations interface:
   ```
   interface DocumentMetadata {
     registrationNumber?: string;
     registrationExpiry?: string;
     insuranceNumber?: string;
     insuranceExpiry?: string;
   }
   ```

2. Change the `documentMetadata` field in TruckWithRelations from `unknown` to `DocumentMetadata | null`.

3. Add a helper function `hasExpiredMetadataDate` that:
   - Accepts `documentMetadata: DocumentMetadata | null | undefined`
   - Returns boolean
   - Checks `registrationExpiry` and `insuranceExpiry` fields
   - For each: if the string exists and is truthy, parse it with `new Date(value)`, validate the parsed date is not NaN (`!isNaN(date.getTime())`), and check if it is less than `new Date()`
   - Returns true if either date is expired

4. In the `computeTruckStatus` function, update the existing expired docs check (lines 113-121) to combine both checks with OR:
   ```
   const now = new Date();
   const hasExpiredDocs =
     (truck.documents ?? []).some(
       (doc) => doc.expiryDate !== null && doc.expiryDate < now
     ) || hasExpiredMetadataDate(truck.documentMetadata as DocumentMetadata | null);
   ```

   Note: The cast is needed because Prisma's Json type resolves to JsonValue at runtime. The helper already handles null/undefined safely.
  </action>
  <verify>
    Run `npx tsc --noEmit` to confirm no type errors. Grep the file for `documentMetadata` and `registrationExpiry` to confirm the new logic is present.
  </verify>
  <done>
    computeTruckStatus checks both truck.documents expiry dates AND documentMetadata.registrationExpiry / documentMetadata.insuranceExpiry. Trucks with expired metadata dates correctly return "Expired Docs" status. Invalid or missing date strings are safely ignored.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors
- The hasExpiredDocs logic in computeTruckStatus now includes documentMetadata fields
- Existing Document model expiry check is preserved (OR, not replaced)
</verification>

<success_criteria>
- Trucks with expired registrationExpiry or insuranceExpiry in documentMetadata show "Expired Docs" status
- Trucks with only valid/missing metadata dates are not affected
- No type errors introduced
- Backward compatible with existing Document model expiry check
</success_criteria>

<output>
After completion, create `.planning/quick/72-tkt-0025-fix-expired-docs-status-not-tri/72-SUMMARY.md`
</output>
