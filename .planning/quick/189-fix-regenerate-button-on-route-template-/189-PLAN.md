---
phase: quick-189
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/templates/DispatchPreview.tsx
autonomous: true
must_haves:
  truths:
    - "Clicking Regenerate shows loading spinner and disables button"
    - "After generation, user sees a toast with results (created, skipped, or errors)"
    - "If generation produces only errors (e.g., no driver/truck assigned, no recurrence rule), user sees an error toast explaining why"
    - "Error count in summary banner displays correctly"
    - "Generated dispatches appear in the preview table after clicking Regenerate"
  artifacts:
    - path: "apps/web/src/components/carrier/templates/DispatchPreview.tsx"
      provides: "Fixed DispatchPreview with proper error handling and type-correct GenerateResult"
  key_links:
    - from: "DispatchPreview.tsx handleGenerate"
      to: "/api/v1/carrier/route-templates/[id]/generate"
      via: "fetch POST"
      pattern: "fetch.*route-templates.*generate"
---

<objective>
Fix the Regenerate button on the route template detail page so it properly shows loading state, displays generation results (including errors), and renders dispatches in the preview table.

Purpose: The button currently appears to "do nothing" because (1) when generation produces only errors (missing driver, missing recurrence rule), no toast is shown since neither the `dispatches_created > 0` nor `skipped_existing > 0` conditions are met, and (2) the `GenerateResult.errors` type is `number` but the API returns `string[]`, breaking the error count display in the summary banner.

Output: Working Regenerate button with complete user feedback for all outcomes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/carrier/templates/DispatchPreview.tsx
@apps/web/src/app/api/v1/carrier/route-templates/[id]/generate/route.ts
@apps/web/src/lib/carrier/dispatch-generator.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix DispatchPreview type mismatch and add comprehensive error feedback</name>
  <files>apps/web/src/components/carrier/templates/DispatchPreview.tsx</files>
  <action>
Fix three bugs in DispatchPreview.tsx:

**Bug 1 — Type mismatch on `errors` field:**
The `GenerateResult` interface defines `errors: number` but the API at `/api/v1/carrier/route-templates/[id]/generate` returns `errors: string[]` (from `dispatch-generator.ts` `GenerationResult.errors`). Change the interface to:
```typescript
interface GenerateResult {
  dispatches_created: number;
  skipped_existing: number;
  errors: string[];
}
```

**Bug 2 — No feedback when generation produces only errors:**
After `const result = data.data as GenerateResult;` (around line 93), the existing toast logic only handles `dispatches_created > 0` and `skipped_existing > 0`. Add a third condition:
```typescript
if (result.dispatches_created > 0) {
  toast.success(`${result.dispatches_created} dispatch${result.dispatches_created !== 1 ? 'es' : ''} generated`);
} else if (result.errors.length > 0) {
  toast.error(`Generation failed: ${result.errors[0]}`);
} else if (result.skipped_existing > 0) {
  toast.info(`All upcoming dispatches already exist (${result.skipped_existing} skipped)`);
} else {
  toast.info('No dispatches to generate for this schedule');
}
```
Note the reordering: errors should take priority over skipped when dispatches_created is 0. Also add a fallback for the case where all three are zero (e.g., no scheduled dates in range).

**Bug 3 — Fix error count display in the summary banner:**
In the summary banner (around line 147-155), change the errors display from `generateResult.errors > 0` to `generateResult.errors.length > 0`, and display the actual error messages:
```tsx
{generateResult.errors.length > 0 && (
  <span className="ml-2 text-destructive">
    &mdash; {generateResult.errors.length} error{generateResult.errors.length !== 1 ? 's' : ''}
  </span>
)}
```

Optionally, below the summary line, if there are errors, render them as a list:
```tsx
{generateResult.errors.length > 0 && (
  <ul className="mt-2 list-disc list-inside text-destructive text-xs space-y-0.5">
    {generateResult.errors.map((err, i) => (
      <li key={i}>{err}</li>
    ))}
  </ul>
)}
```
  </action>
  <verify>
1. Run `npx tsc --noEmit --project apps/web/tsconfig.json` — no errors
2. Visually inspect the component renders the Regenerate button with RefreshCw icon
3. Confirm the GenerateResult interface now has `errors: string[]`
4. Confirm all three toast paths exist (success, error, info/skipped, fallback)
5. Confirm summary banner uses `.length` for error checking
  </verify>
  <done>
- GenerateResult.errors type is string[] matching API response
- All generation outcomes produce user-visible feedback (toast)
- Error details are displayed in both toast and summary banner
- TypeScript compiles cleanly
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit --project apps/web/tsconfig.json` passes with no errors
- DispatchPreview component handles all 4 generation outcomes: success (created > 0), errors only, all skipped, no dates in range
- Error messages from the API (missing driver, missing truck, no recurrence rule) are surfaced to the user
</verification>

<success_criteria>
- Clicking Regenerate shows spinner animation on RefreshCw icon and disables button
- Generation results always produce a toast (success, error, info, or fallback)
- Error details from the generator are visible in the summary banner
- Type-safe: GenerateResult.errors matches API contract (string[])
</success_criteria>

<output>
After completion, create `.planning/quick/189-fix-regenerate-button-on-route-template-/189-SUMMARY.md`
</output>
