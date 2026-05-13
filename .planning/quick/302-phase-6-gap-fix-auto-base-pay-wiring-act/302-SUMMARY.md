---
phase: quick-302
plan: "01"
subsystem: driver-pay
tags:
  - driver-pay
  - state-machine
  - validation
  - server-action
  - form
dependency_graph:
  requires:
    - quick-301 (state machine, ensureBasePayComponent, transitions route)
  provides:
    - submit transition auto-creates BASE_PAY component for CPM/FLAT/etc
    - actualMiles + mileageSource round-trip: schema -> action -> form -> DB
  affects:
    - transitions route (submit branch)
    - loadDriverAssignmentUpdateSchema
    - SerializedAssignment type
    - updateAssignment server action
    - OverrideForm UI
tech_stack:
  added: []
  patterns:
    - superRefine cross-field validation (Pattern B: both-or-neither)
    - guard-then-call idiom for conditional side effects before FSM
key_files:
  created: []
  modified:
    - apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts
    - packages/validation/src/load-driver-assignment.ts
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
    - apps/web/src/components/driver-pay/override-form.tsx
    - apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts
    - apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts
    - apps/web/src/components/driver-pay/assign-driver-modal.tsx
decisions:
  - "Guard CPM/HOURLY submit: only call ensureBasePayComponent when quantity data exists, preserving FSM 422 gate for no-miles/no-hours cases"
  - "Cast proxied getTenantPrisma() client to PrismaClient when calling ensureBasePayComponent (typed to PrismaClient, proxy is compatible at runtime)"
  - "loadDriverAssignmentUpdateSchema converted from plain z.object to chained .superRefine for Pattern B cross-field rule"
  - "MileageSource cast as enum union type in Prisma update call to satisfy strict typing without schema change"
metrics:
  duration: "~15 minutes"
  completed: "2026-05-13T16:29:45Z"
  tasks_completed: 3
  files_changed: 7
---

# Phase quick-302 Plan 01: Phase 6 Gap Fix — Auto Base Pay Wiring Summary

Auto-create BASE_PAY component on submit (guarded for CPM/HOURLY with no quantity data); add actualMiles + mileageSource fields end-to-end from validation schema through server action to override form UI.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Wire ensureBasePayComponent into submit transition + extend tests | b4bae85 | transitions/route.ts, transitions-api.test.ts |
| 2 | Add actualMiles + mileageSource to validation schema and server action | 990e2e1 | load-driver-assignment.ts (validation), load-driver-assignments.ts (action), load-driver-assignments.test.ts, assign-driver-modal.tsx |
| 3 | Add actual miles + mileage source fields to override form | 3df7f29 | override-form.tsx |

## What Was Built

### Task 1 — Submit Transition Guard
`transitions/route.ts` now imports `ensureBasePayComponent` and calls it between step 4 (load assignment) and step 5 (load components) when `body.action === 'submit'`. The guard:
- CPM: only calls helper if `actualMiles != null || estimatedMiles != null`
- HOURLY: only calls helper if `actualHours != null || estimatedHours != null`
- All other pay types (FLAT_PER_LOAD, SALARY, PERCENTAGE, DAILY): always calls helper

When the guard prevents the call, the FSM's existing pre-condition check at step 7 returns the existing 422 "needs base pay" error — no new error path needed. Step 5 runs after potential creation so the FSM sees the newly-created row.

### Task 2 — Validation Schema + Server Action
`loadDriverAssignmentUpdateSchema` gained two new optional/nullable fields (`actualMiles` string with numeric + 4-decimal-place refinements, `mileageSource` enum) plus a `.superRefine` implementing Pattern B: providing one without the other returns a field-level validation error.

`SerializedAssignment` type, `serializeAssignment` function, and `updateAssignment` merge logic all updated to carry `actualMiles` and `mileageSource`. `assign-driver-modal.tsx` partial object fixed to satisfy the widened type.

### Task 3 — Override Form UI
`OverrideForm` gained two new state variables initialized from `assignment.actualMiles` and `assignment.mileageSource`. A 2-column grid row with `Actual miles` Input + `Mileage source` Select was added above the `Loaded miles only` toggle. Client-side Pattern B guard fires before the server call, showing an inline error if one is set without the other. Both fields flow into the `updateAssignment` call and the reconstructed `SerializedAssignment` for the `onSaved` callback.

## Test Results

| File | Tests | Result |
|------|-------|--------|
| transitions-api.test.ts | 17 (12 existing + 3 new) | All pass |
| load-driver-assignments.test.ts | 7 (3 existing + 2 new + 2 existing) | All pass |
| All driver-pay __tests__ (5 files) | 58 total | All pass |

New tests cover:
- (13) CPM with actualMiles → ensureBasePayComponent called once with correct args
- (14) FLAT_PER_LOAD → ensureBasePayComponent always called
- (15) CPM with no miles → ensureBasePayComponent NOT called, FSM returns 422
- (d) updateAssignment persists actualMiles + mileageSource correctly
- (e) Pattern B: actualMiles without mileageSource returns validation error, no DB write

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing field] assign-driver-modal.tsx partial object missing new required fields**
- **Found during:** Task 2 TypeScript check
- **Issue:** `SerializedAssignment` type gained `actualMiles` and `mileageSource` fields, but `assign-driver-modal.tsx` constructs a partial `SerializedAssignment` inline for optimistic UI update, which TypeScript caught as missing those fields.
- **Fix:** Added `actualMiles: null` and `mileageSource: null` to the partial object in `assign-driver-modal.tsx`.
- **Files modified:** `apps/web/src/components/driver-pay/assign-driver-modal.tsx`
- **Commit:** 990e2e1

**2. [Rule 3 - Blocking] packages/validation dist not auto-rebuilt**
- **Found during:** Task 2 TypeScript check (apps/web)
- **Issue:** `apps/web` imports from `@drivecommand/validation` which resolves to `packages/validation/dist/`. The dist was stale and TypeScript saw the old schema type without `actualMiles`/`mileageSource`.
- **Fix:** Ran `npm run build` in `packages/validation` to regenerate dist. (dist is gitignored — CI must build packages before web.)
- **Commit:** Not committed (dist is gitignored per repo .gitignore)

**3. [Rule 3 - Blocking] ESLint not configured in project**
- **Found during:** Task 3 verify step
- **Issue:** Plan verify step called `npx eslint src/components/driver-pay/override-form.tsx` but the project has no `eslint.config.(js|mjs|cjs)` or `.eslintrc.*` file. ESLint 9.x requires an explicit config.
- **Fix:** TypeScript check (clean) used as the authoritative linter gate. ESLint absence is a pre-existing project state, not introduced by this task.

## Self-Check: PASSED

Files verified to exist:
- `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts` — contains `ensureBasePayComponent`
- `packages/validation/src/load-driver-assignment.ts` — contains `actualMiles` and `superRefine`
- `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` — contains `mileageSource`
- `apps/web/src/components/driver-pay/override-form.tsx` — contains `mileageSource`
- `apps/web/src/app/api/driver-pay/__tests__/transitions-api.test.ts` — contains `ensureBasePayComponent`
- `apps/web/src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts` — contains `actualMiles`

Commits verified:
- b4bae85 — feat(quick-302): wire ensureBasePayComponent into submit transition
- 990e2e1 — feat(quick-302): add actualMiles + mileageSource to schema and server action
- 3df7f29 — feat(quick-302): add actual miles + mileage source fields to override form
