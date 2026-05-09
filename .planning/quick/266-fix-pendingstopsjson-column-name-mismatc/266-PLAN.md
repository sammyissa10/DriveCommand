---
phase: quick-266
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/src/lib/carrier/loads.ts
autonomous: true
must_haves:
  truths:
    - "pendingStopsJson field in CarrierLoad model maps to pending_stops_json DB column"
    - "createLoad writes pendingStopsJson when no dispatchId"
    - "updateLoad reads and clears pendingStopsJson when dispatch is attached"
    - "Prisma client is regenerated and in sync with schema"
    - "Zero TypeScript errors"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "CarrierLoad.pendingStopsJson with @map('pending_stops_json')"
      contains: '@map("pending_stops_json")'
    - path: "apps/web/src/generated/prisma/index.d.ts"
      provides: "Generated Prisma client with pendingStopsJson typed"
      contains: "pendingStopsJson"
  key_links:
    - from: "apps/web/src/lib/carrier/loads.ts"
      to: "prisma.carrierLoad"
      via: "pendingStopsJson field in create/update calls"
      pattern: "pendingStopsJson"
---

<objective>
Verify and fix the pendingStopsJson column name mapping in the CarrierLoad Prisma model, ensuring stops persist correctly end-to-end.

Purpose: The loads table has a snake_case column `pending_stops_json` that must be mapped via Prisma's @map directive. Without this mapping, Prisma silently fails to read/write the stops buffer, causing stops to disappear when loads are created without a dispatch.

Output: Verified schema mapping, regenerated Prisma client, confirmed TypeScript passes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (CarrierLoad model, line ~1561)
@apps/web/src/lib/carrier/loads.ts (createLoad, updateLoad, persistStops)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Verify schema mapping and regenerate Prisma client</name>
  <files>apps/web/prisma/schema.prisma</files>
  <action>
    1. Open `apps/web/prisma/schema.prisma` and find the CarrierLoad model.
    2. Verify `pendingStopsJson` field has `@map("pending_stops_json")` directive.
       - CURRENT STATE (as of planning): The directive IS present on line 1590.
       - If for any reason it is missing, add: `@map("pending_stops_json")` after `String?` and before `@db.Text`.
    3. Run `npx prisma generate` from `apps/web/` to regenerate the Prisma client.
    4. Verify the generated client at `apps/web/src/generated/prisma/index.d.ts` contains `pendingStopsJson` as a typed field on CarrierLoad.
    5. Do NOT add any console.log statements anywhere.
  </action>
  <verify>
    - `cd apps/web && npx prisma generate` completes without errors
    - `grep "pendingStopsJson" apps/web/src/generated/prisma/index.d.ts` returns matches
    - `grep '@map("pending_stops_json")' apps/web/prisma/schema.prisma` returns a match on the CarrierLoad model
  </verify>
  <done>CarrierLoad.pendingStopsJson correctly maps to the pending_stops_json DB column and the Prisma client is regenerated.</done>
</task>

<task type="auto">
  <name>Task 2: Verify loads.ts stop persistence logic and run tsc</name>
  <files>apps/web/src/lib/carrier/loads.ts</files>
  <action>
    1. Open `apps/web/src/lib/carrier/loads.ts`.
    2. Verify these three codepaths use `pendingStopsJson` (not `pending_stops_json` or any other variant):
       a. `createLoad` — when no dispatchId, stores stops as JSON: `data: { pendingStopsJson: JSON.stringify(data.stops) }`
       b. `updateLoad` — when dispatchId is newly attached, reads `pendingStopsJson` and calls `persistStops`, then clears it to null
       c. `updateLoad` — when stops are updated without dispatchId, writes to `pendingStopsJson`
    3. CURRENT STATE (as of planning): All three codepaths are correct. If any use the wrong field name, fix them.
    4. Run `cd apps/web && npx tsc --noEmit` to confirm zero TypeScript errors.
    5. Do NOT add console.log statements.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` exits with code 0
    - `grep -c "pendingStopsJson" apps/web/src/lib/carrier/loads.ts` returns 6+ matches (create, read, clear x2, update, null-check)
  </verify>
  <done>All pendingStopsJson references in loads.ts use the correct Prisma field name. TypeScript compiles with zero errors.</done>
</task>

</tasks>

<verification>
- Schema has @map("pending_stops_json") on CarrierLoad.pendingStopsJson
- Prisma client regenerated successfully
- loads.ts uses pendingStopsJson consistently (6+ references)
- tsc --noEmit passes with zero errors
- No console.log statements added
</verification>

<success_criteria>
The pendingStopsJson field correctly maps to the pending_stops_json database column. Prisma can read and write this field without silent failures. TypeScript compiles cleanly.
</success_criteria>

<output>
After completion, create `.planning/quick/266-fix-pendingstopsjson-column-name-mismatc/266-SUMMARY.md`
</output>
