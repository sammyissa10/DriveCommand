---
phase: quick-188
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
  - apps/web/src/components/carrier/templates/RouteTemplateList.tsx
autonomous: true
must_haves:
  truths:
    - "Route template form submits without check constraint violations"
    - "Schedule Type dropdown shows exactly: Fixed Days, Frequency, On Call"
    - "Equipment Type dropdown shows exactly: Dry Van, Flatbed, Reefer, Tanker, Step Deck, Other"
    - "Recurrence fields still appear for the appropriate schedule types"
  artifacts:
    - path: "apps/web/src/components/carrier/templates/RouteTemplateForm.tsx"
      provides: "Corrected dropdown constants matching DB constraints"
    - path: "apps/web/src/components/carrier/templates/RouteTemplateList.tsx"
      provides: "Updated schedule type display logic"
  key_links:
    - from: "RouteTemplateForm.tsx SCHEDULE_TYPES/EQUIPMENT_TYPES"
      to: "route_templates table check constraints"
      via: "values passed through save-route-template action to Prisma"
      pattern: "schedule_type IN|equipment_type IN"
---

<objective>
Fix route template form dropdowns so their values match the database check constraints, preventing constraint violation errors on submit.

Purpose: The form currently sends values like 'recurring', 'on_demand', 'seasonal', 'intermodal', 'power_only' but the DB only allows 'fixed_days', 'frequency', 'on_call' for schedule_type and 'dry_van', 'flatbed', 'reefer', 'tanker', 'step_deck', 'other' for equipment_type.

Output: Working route template creation/editing without constraint errors.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/templates/RouteTemplateForm.tsx
@apps/web/src/components/carrier/templates/RouteTemplateList.tsx
@apps/web/src/actions/carrier/save-route-template.ts

DB check constraints (from migration 20260404100005):
- route_templates_schedule_type_check: schedule_type IN ('fixed_days', 'frequency', 'on_call')
- route_templates_equipment_type_check: equipment_type IN ('dry_van', 'flatbed', 'reefer', 'tanker', 'step_deck', 'other')
</context>

<tasks>

<task type="auto">
  <name>Task 1: Update dropdown constants and conditional logic in RouteTemplateForm.tsx</name>
  <files>apps/web/src/components/carrier/templates/RouteTemplateForm.tsx</files>
  <action>
In `RouteTemplateForm.tsx`, make these changes:

1. Replace the `EQUIPMENT_TYPES` constant (lines 64-72) with values matching the DB constraint:
   ```
   { value: 'dry_van', label: 'Dry Van' },
   { value: 'flatbed', label: 'Flatbed' },
   { value: 'reefer', label: 'Reefer' },
   { value: 'tanker', label: 'Tanker' },
   { value: 'step_deck', label: 'Step Deck' },
   { value: 'other', label: 'Other' },
   ```
   Remove 'intermodal' and 'power_only' (not in DB constraint). Add 'other'.

2. Replace the `SCHEDULE_TYPES` constant (lines 74-78) with values matching the DB constraint:
   ```
   { value: 'fixed_days', label: 'Fixed Days' },
   { value: 'frequency', label: 'Frequency' },
   { value: 'on_call', label: 'On Call' },
   ```

3. Update the default scheduleType state (line 103): change `'recurring'` to `'fixed_days'`:
   ```
   const [scheduleType, setScheduleType] = useState(initialData?.scheduleType ?? 'fixed_days');
   ```

4. Update the conditional that shows recurrence fields (line 369): change `scheduleType === 'recurring'` to show recurrence fields for both recurring types:
   ```
   {(scheduleType === 'fixed_days' || scheduleType === 'frequency') && (
   ```
   Both 'fixed_days' and 'frequency' are recurring schedule types that need recurrence rule + timezone + departure time fields. 'on_call' is the only non-recurring type.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors. Visually inspect that the form renders with correct dropdown options.</verify>
  <done>SCHEDULE_TYPES has exactly 3 values: fixed_days, frequency, on_call. EQUIPMENT_TYPES has exactly 6 values: dry_van, flatbed, reefer, tanker, step_deck, other. Default scheduleType is 'fixed_days'. Recurrence fields show for fixed_days and frequency only.</done>
</task>

<task type="auto">
  <name>Task 2: Update schedule type display logic in RouteTemplateList.tsx</name>
  <files>apps/web/src/components/carrier/templates/RouteTemplateList.tsx</files>
  <action>
In `RouteTemplateList.tsx`, update line 354 where it checks `t.scheduleType === 'recurring'` to show recurrence rule formatting. Change to:

```
{(t.scheduleType === 'fixed_days' || t.scheduleType === 'frequency') ? (
```

This ensures the list view correctly displays formatted recurrence rules for the two recurring schedule types, and falls back to the capitalized label for 'on_call'.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors.</verify>
  <done>RouteTemplateList shows recurrence rule formatting for 'fixed_days' and 'frequency' schedule types, and shows capitalized label for 'on_call'.</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit -p apps/web/tsconfig.json` passes
2. Navigate to /carrier/templates/new — Schedule Type dropdown shows: Fixed Days, Frequency, On Call
3. Equipment Type dropdown shows: Dry Van, Flatbed, Reefer, Tanker, Step Deck, Other
4. Select "Fixed Days" or "Frequency" — recurrence fields appear
5. Select "On Call" — recurrence fields hidden
6. Fill form and submit — no check constraint violation error
</verification>

<success_criteria>
- Route template creation succeeds without DB constraint violations
- All dropdown values exactly match DB check constraints
- Recurrence fields show/hide correctly based on new schedule type values
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/188-fix-route-template-form-dropdowns-to-mat/188-SUMMARY.md`
</output>
