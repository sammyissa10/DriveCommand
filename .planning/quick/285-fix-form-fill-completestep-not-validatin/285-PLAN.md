---
phase: 285-fix-form-fill-completestep-not-validatin
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/server/services/workflows/completeStep.ts
  - apps/web/src/__tests__/workflows-complete-step.test.ts
autonomous: true

must_haves:
  truths:
    - "FORM_FILL completion rejects results that omit a required formSchema field with INVALID_FORM"
    - "FORM_FILL completion succeeds when all required formSchema fields are present and non-empty in formData"
    - "Existing FORM_FILL test (formData absent → INVALID_FORM) still passes"
    - "tsc --noEmit reports no TypeScript errors"
  artifacts:
    - path: "apps/web/src/server/services/workflows/completeStep.ts"
      provides: "FORM_FILL case validates formData against defaultConfig.formSchema"
      contains: "formSchema"
    - path: "apps/web/src/__tests__/workflows-complete-step.test.ts"
      provides: "Two new FORM_FILL tests for required-field enforcement"
      contains: "FORM_FILL: rejects with INVALID_FORM when required field is missing"
  key_links:
    - from: "completeStep.ts FORM_FILL branch"
      to: "stepSnapshot.defaultConfig.formSchema"
      via: "validateStepResult helper signature accepts defaultConfig"
      pattern: "defaultConfig\\?\\.formSchema"
---

<objective>
Close the FORM_FILL validation gap in completeStep so it enforces required fields declared by formSchema, per spec Section 6.3 / DoD check 5.

Purpose: Today the FORM_FILL branch only checks `typeof formData !== 'object'`. A caller can submit an empty `{}` and the step completes — bypassing the formSchema contract. DoD check 5 is blocked on this.

Output:
- `validateStepResult` enriched to read `defaultConfig.formSchema` and enforce required fields
- New tests covering (a) missing required field → INVALID_FORM, (b) all required fields present → success
- Clean `tsc --noEmit`
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/server/services/workflows/completeStep.ts
@apps/web/src/__tests__/workflows-complete-step.test.ts
@docs/specs/workflow-engine.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Enforce formSchema required fields in FORM_FILL branch</name>
  <files>apps/web/src/server/services/workflows/completeStep.ts</files>
  <action>
Update `validateStepResult` so the FORM_FILL branch consults `stepSnapshot.defaultConfig?.formSchema` and enforces required fields. Concrete steps:

1. Change `validateStepResult` signature from `(stepType: string, result: StepResult)` to `(stepType: string, result: StepResult, defaultConfig?: unknown)`. Update the call site (line 53) to pass `snap.defaultConfig`.

2. Inside the `case 'FORM_FILL':` block, AFTER the existing `typeof result.formData !== 'object'` check, add formSchema enforcement:
   - Narrow `defaultConfig` to an object with optional `formSchema` array.
   - Treat `formSchema` as `Array<{ id?: string; label?: string; type?: string; required?: boolean }>`. If it is not an array, skip schema validation (back-compat for steps with no schema).
   - For every field where `required === true`:
     - Resolve the field key as `field.id ?? field.label`. If neither exists, skip that entry (defensive — malformed schema should not crash).
     - Look up `(result.formData as Record<string, unknown>)[key]`.
     - Treat the field as missing if value is `undefined`, `null`, or (for strings) an empty/whitespace-only string. Empty arrays count as missing too.
     - On the first missing required field, throw `new TRPCError({ code: 'BAD_REQUEST', message: \`INVALID_FORM: \${field.label ?? key} is required\` })`. The error code stays INVALID_FORM (prefix-match) so existing callers/tests keep working; the field name is appended for diagnostics per spec.

3. Do not introduce new dependencies, do not refactor unrelated branches, do not touch the documented note that STEP_COMPLETE is not a TriggerEvent.

4. Keep the file's existing JSDoc header intact; if you tweak the FORM_FILL line in the header comment, only clarify that formSchema required-field enforcement now happens here.
  </action>
  <verify>
Run from repo root:
- `npx tsc --noEmit -p apps/web` — must be clean.
- Re-read the diff: only the FORM_FILL branch and the helper signature/call site should be changed.
  </verify>
  <done>
- `validateStepResult` accepts `defaultConfig` and the FORM_FILL branch throws INVALID_FORM on the first missing required formSchema field, with the field name in the message.
- No other StepType branches modified.
- `tsc --noEmit` clean for apps/web.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add FORM_FILL formSchema tests (missing field + all-present)</name>
  <files>apps/web/src/__tests__/workflows-complete-step.test.ts</files>
  <action>
Add two new tests inside the existing `describe('completeStep — type-specific validation', ...)` block, after the existing FORM_FILL test (line ~124). Reuse the existing `mockStepInstance` helper but ensure the formSchema is exposed under `defaultConfig` (where the service now reads it from). Concrete steps:

1. Update `mockStepInstance(stepType)` so the FORM_FILL branch sets BOTH `defaultConfig: { formSchema: [{ id: 'f1', label: 'Name', type: 'text', required: true }] }` AND keeps the existing top-level `formSchema` field (back-compat with current test). Reason: the service now reads `defaultConfig.formSchema`; the existing `it('FORM_FILL: rejects with INVALID_FORM when formData is absent', ...)` test will still pass because the early `typeof formData !== 'object'` branch triggers first.

2. Add test: `it('FORM_FILL: rejects with INVALID_FORM when a required formSchema field is missing', ...)`:
   - Mock `stepInstance.findFirst` to return `mockStepInstance('FORM_FILL')`.
   - Call `completeStep({ ...baseArgs, stepInstanceId: 'step-1', result: { formData: {} } })`.
   - Assert it rejects with an error whose `message` matches `/^INVALID_FORM/` (use `expect.stringMatching(/^INVALID_FORM/)` inside `objectContaining`).

3. Add test: `it('FORM_FILL: completes successfully when all required formSchema fields are present', ...)`:
   - Mock `stepInstance.findFirst` to return `mockStepInstance('FORM_FILL')`.
   - Call `completeStep({ ...baseArgs, stepInstanceId: 'step-1', result: { formData: { f1: 'Sammy' } } })`.
   - Assert the call resolves (does not throw). Optionally assert `prisma.stepInstance.update` was called once with `data.status === 'COMPLETE'`.

4. Do not change unrelated tests. Do not change the vi.mock blocks unless strictly required.
  </action>
  <verify>
- `npx vitest run apps/web/src/__tests__/workflows-complete-step.test.ts` — all tests pass (existing + 2 new).
- `npx tsc --noEmit -p apps/web` — clean.
  </verify>
  <done>
- Two new FORM_FILL tests added and passing.
- All previously-passing tests in this file still pass.
- `mockStepInstance` exposes `defaultConfig.formSchema` for FORM_FILL.
  </done>
</task>

</tasks>

<verification>
End-to-end checks for the quick task:

1. `npx vitest run apps/web/src/__tests__/workflows-complete-step.test.ts` — green (all FORM_FILL tests including the two new ones pass).
2. `npx tsc --noEmit -p apps/web` — no TypeScript errors.
3. Manual diff review:
   - `completeStep.ts` diff is bounded to `validateStepResult` signature, its call site, and the FORM_FILL `case` body.
   - Test file diff adds only two new `it(...)` blocks plus the `defaultConfig` field on `mockStepInstance`.
4. Spec alignment (docs/specs/workflow-engine.md Section 6.3): "formData passes validation against formSchema" — now enforced.
5. DoD check 5 — unblocked: FORM_FILL completion is rejected when required fields are missing.
</verification>

<success_criteria>
- FORM_FILL `completeStep` rejects with `INVALID_FORM` (optionally suffixed with the field name) when any `required: true` field declared in `defaultConfig.formSchema` is missing or empty in `result.formData`.
- FORM_FILL `completeStep` succeeds when every required field is present and non-empty.
- Existing FORM_FILL "absent formData" test still passes.
- All other StepType validations are untouched.
- `npx tsc --noEmit -p apps/web` is clean.
- `npx vitest run apps/web/src/__tests__/workflows-complete-step.test.ts` is green.
</success_criteria>

<output>
After completion, create `.planning/quick/285-fix-form-fill-completestep-not-validatin/285-SUMMARY.md` summarizing:
- The exact diff in `completeStep.ts` (signature change + FORM_FILL branch)
- The two new tests added
- Verification command output (vitest + tsc)
- Confirmation that DoD check 5 is unblocked
</output>
