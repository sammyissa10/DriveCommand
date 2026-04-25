---
phase: quick-285
plan: "01"
subsystem: workflows
tags: [form-fill, validation, completeStep, tdd]
dependency_graph:
  requires: []
  provides: [formSchema required-field enforcement in completeStep FORM_FILL branch]
  affects: [apps/web/src/server/services/workflows/completeStep.ts]
tech_stack:
  added: []
  patterns: [formSchema validation in validateStepResult]
key_files:
  created: []
  modified:
    - apps/web/src/server/services/workflows/completeStep.ts
    - apps/web/src/__tests__/workflows-complete-step.test.ts
decisions:
  - "Use key = field.id ?? field.label for field lookup, matching spec field identification"
  - "Treat undefined, null, empty string, whitespace-only string, and empty array as missing"
  - "Wrap FORM_FILL case in braces to allow const declarations inside switch"
  - "Back-compat: skip schema validation when formSchema is absent or not an array"
metrics:
  duration: "~8 minutes"
  completed: "2026-04-25"
  tasks: 2
  files: 2
---

# Phase 285 Plan 01: Fix FORM_FILL completeStep Not Validating formSchema — Summary

Closed the FORM_FILL validation gap in `completeStep` so required fields declared in `defaultConfig.formSchema` are enforced per spec Section 6.3 / DoD check 5.

## What Was Built

### Task 1 — Enforce formSchema required fields in FORM_FILL branch (commit `a40156e`)

**File:** `apps/web/src/server/services/workflows/completeStep.ts`

**Diff summary:**

1. `validateStepResult` signature changed from `(stepType, result)` to `(stepType, result, defaultConfig?: unknown)`.

2. Call site on line 53 updated to pass `snap.defaultConfig`:
   ```ts
   validateStepResult(snap.stepType, result, snap.defaultConfig);
   ```

3. `FORM_FILL` case now wrapped in braces (required for `const` declarations inside a switch) and extended with required-field enforcement:
   ```ts
   case 'FORM_FILL': {
     if (!result.formData || typeof result.formData !== 'object') {
       throw new TRPCError({ code: 'BAD_REQUEST', message: 'INVALID_FORM' });
     }
     const config = defaultConfig as { formSchema?: Array<...> } | undefined;
     const schema = config?.formSchema;
     if (Array.isArray(schema)) {
       const formData = result.formData as Record<string, unknown>;
       for (const field of schema) {
         if (!field.required) continue;
         const key = field.id ?? field.label;
         if (!key) continue;
         const value = formData[key];
         const isEmpty =
           value === undefined || value === null ||
           (typeof value === 'string' && value.trim() === '') ||
           (Array.isArray(value) && value.length === 0);
         if (isEmpty) {
           throw new TRPCError({
             code: 'BAD_REQUEST',
             message: `INVALID_FORM: ${field.label ?? key} is required`,
           });
         }
       }
     }
     break;
   }
   ```

No other StepType branches were modified.

---

### Task 2 — Add FORM_FILL formSchema tests (commit `4f004c6`)

**File:** `apps/web/src/__tests__/workflows-complete-step.test.ts`

**Changes:**

1. `mockStepInstance` updated to expose `defaultConfig.formSchema` for FORM_FILL steps (the service now reads from `defaultConfig`, not the top-level `stepSnapshot.formSchema`). The top-level field is kept for back-compat.

2. New test: **"FORM_FILL: rejects with INVALID_FORM when a required formSchema field is missing"**
   - Calls `completeStep` with `result: { formData: {} }` (empty object, required field absent)
   - Asserts message matches `/^INVALID_FORM/`

3. New test: **"FORM_FILL: completes successfully when all required formSchema fields are present"**
   - Calls `completeStep` with `result: { formData: { f1: 'Sammy' } }`
   - Asserts resolves without throwing
   - Asserts `prisma.stepInstance.update` called once with `{ data: { status: 'COMPLETE', ... } }`

---

## Verification Output

```
vitest run src/__tests__/workflows-complete-step.test.ts

  ✓ src/__tests__/workflows-complete-step.test.ts (9 tests) 815ms

Test Files  1 passed (1)
Tests       9 passed (9)
Duration    1.16s
```

```
npx tsc --noEmit -p apps/web
(no output — clean)
```

---

## DoD Check 5 — Unblocked

Before this fix, a caller could submit `result: { formData: {} }` and the FORM_FILL step would complete even when all schema fields were required. The early `typeof formData !== 'object'` guard passed because `{}` is an object.

After this fix, the FORM_FILL branch iterates `defaultConfig.formSchema`, finds `f1` (required), looks up `formData['f1']` → `undefined` → throws `INVALID_FORM: Name is required`.

DoD check 5 ("FORM_FILL completion rejects results that omit a required formSchema field with INVALID_FORM") is now passing.

---

## Deviations from Plan

None. Plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/server/services/workflows/completeStep.ts` — FOUND
- `apps/web/src/__tests__/workflows-complete-step.test.ts` — FOUND
- commit `a40156e` — FOUND
- commit `4f004c6` — FOUND
