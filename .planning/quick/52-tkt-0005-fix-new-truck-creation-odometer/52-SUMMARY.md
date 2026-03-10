---
phase: quick-52
plan: 01
subsystem: ui
tags: [zod, react, forms, validation, server-actions]

requires:
  - phase: quick-50
    provides: VIN validation fix on truck forms

provides:
  - Comma-formatted odometer input accepted without NaN validation errors
  - All truck form fields repopulate with entered values when server returns validation error

affects: [truck-form, trucks-actions]

tech-stack:
  added: []
  patterns:
    - "z.preprocess for string-to-number coercion in Zod schemas (strips non-numeric chars)"
    - "Return { error, values } from server actions on validation failure for sticky form fields"
    - "Form key prop (JSON.stringify of values) forces React remount to apply updated defaultValues"

key-files:
  created: []
  modified:
    - src/lib/validations/truck.schemas.ts
    - src/app/(owner)/actions/trucks.ts
    - src/components/trucks/truck-form.tsx

key-decisions:
  - "Use z.preprocess in Zod schema rather than parseInt in the action — single source of truth for coercion"
  - "Form key tied to state.values JSON forces full remount so useState initializers re-run with sticky values"
  - "Hidden odometer input (not the display input) carries numeric value to server, so preprocess strips commas as safety net"

patterns-established:
  - "Server actions always return { error, values } on validation failure — not just { error }"
  - "Zod schemas own numeric coercion via z.preprocess — actions pass raw strings"

duration: 8min
completed: 2026-03-10
---

# Quick-52: TKT-0005 Fix New Truck Creation Odometer Summary

**Zod z.preprocess coercion for odometer/year fields and sticky form values via { error, values } action returns + form remount key**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-10T00:00:00Z
- **Completed:** 2026-03-10T00:08:00Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Fixed odometer NaN error: z.preprocess now strips commas/non-numeric chars before coercing to number, replacing brittle parseInt calls in the action
- Fixed form field erasure on validation error: createTruck and updateTruck now return `values` alongside `error`, and the form component uses these to repopulate all fields
- Year and odometer (controlled inputs) also restore via updated useState initializers that read from `state?.values` first
- Edit truck form (/trucks/[id]/edit) benefits from the same sticky-values fix with no additional changes needed

## Task Commits

1. **Task 1: Fix odometer parsing and return form values from server actions** - `3feb2c6` (fix)
2. **Task 2: Make form fields sticky using returned values from action state** - `def54a1` (fix)

## Files Created/Modified

- `src/lib/validations/truck.schemas.ts` - Added z.preprocess for year and odometer fields to handle string-to-number conversion
- `src/app/(owner)/actions/trucks.ts` - Removed parseInt calls from rawData; added values return in validation error paths for both createTruck and updateTruck
- `src/components/trucks/truck-form.tsx` - Updated useState initializers for odometerDisplay and selectedYear; added form key prop for remount; updated all defaultValue props to prefer state?.values

## Decisions Made

- Used z.preprocess in the Zod schema rather than preprocessing in the action — keeps conversion logic co-located with validation rules
- Form key approach (JSON.stringify of state.values) chosen over converting inputs to controlled inputs — less invasive, preserves existing form structure
- Hidden odometer input (which carries the numeric value) already stores only digits via handleOdometerChange, but preprocess adds a safety net for any path that bypasses the display input

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Truck creation and editing forms are now fully functional for comma-formatted odometer values
- Form sticky values pattern established here can be applied to other forms in the codebase following the same { error, values } return + form key approach

---
*Phase: quick-52*
*Completed: 2026-03-10*
