---
phase: quick-50
plan: 50
subsystem: trucks
tags: [bug-fix, validation, forms, seed]
dependency_graph:
  requires: []
  provides: [valid-vin-seed, read-only-vin-edit-form]
  affects: [truck-edit-form, truck-create-form, seed-data]
tech_stack:
  added: []
  patterns: [read-only-form-fields, permanent-identifier-ux]
key_files:
  modified:
    - prisma/seed.ts
    - src/components/trucks/truck-form.tsx
    - src/app/(owner)/actions/trucks.ts
decisions:
  - "VIN is never sent to the DB on update — it is a permanent vehicle identifier and must not change after creation"
  - "Read-only VIN uses a plain readOnly input with no hidden field, relying on updateTruck to simply ignore VIN"
  - "P2002 VIN unique constraint handler removed from updateTruck since VIN can no longer conflict on update"
metrics:
  duration: 89s
  completed: "2026-03-10"
  tasks: 2
  files: 3
---

# Phase Quick-50: TKT-0006 Fix VIN Validation Error on Truck Edit Summary

**One-liner:** Fixed VIN browser validation error on truck edit by making VIN read-only in the form (no pattern/required attributes) and removing VIN from the updateTruck server action entirely, plus corrected seed's generateVIN() to exclude I/O/Q per ISO 3779.

## What Was Built

Two targeted fixes to unblock editing trucks whose seeded VINs contained characters banned by the VIN standard (I, O, Q):

1. **Seed fix:** `generateVIN()` now draws from a manual charset `ABCDEFGHJKLMNPRSTUVWXYZ0123456789` instead of `faker.string.alphanumeric(17).toUpperCase()`. The old implementation could produce I, O, or Q — all banned by ISO 3779. New VINs always match `/^[A-HJ-NPR-Z0-9]{17}$/`.

2. **Form fix:** `TruckForm` now conditionally renders the VIN field based on whether `initialData?.vin` is present. In edit mode: a `readOnly` input with no `pattern`, no `required`, and no hidden field — no browser validation fires. In create mode: the existing editable input with `pattern="[A-HJ-NPR-Z0-9]{17}"` is preserved unchanged.

3. **Server action fix:** `updateTruck` no longer reads or processes the `vin` field from FormData. VIN is a permanent vehicle identifier — it has no place in an update payload. The VIN-specific P2002 error handler was also removed since it can no longer be reached.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Fix generateVIN() in seed to use valid VIN character set | 33c25c8 | prisma/seed.ts |
| 2 | Make VIN read-only on edit form, remove VIN from updateTruck | c61cd91 | truck-form.tsx, trucks.ts |

## Decisions Made

- **VIN not submitted on update:** The read-only input has no `name` attribute and no hidden input, so VIN is simply absent from the FormData. The server action already skips absent fields. This is the cleanest approach — VIN never touches the update path.
- **No Zod schema changes needed:** Since VIN is absent from `rawData` in `updateTruck`, `truckUpdateSchema.partial()` never sees it. No schema modification required.
- **P2002 handler removed:** With VIN excluded from updates, the unique constraint on VIN can never fire during an update. Removing dead code reduces surface area.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Hidden input removed from read-only VIN implementation**

The plan specified including a hidden input (`<input type="hidden" name="vin" value={initialData.vin} />`) to submit the VIN value. However, the plan itself then identified that this would cause Zod validation failures for seeded trucks with invalid VINs. The simpler and more correct fix — removing VIN from `updateTruck` entirely — was already described in the plan as the preferred approach. The hidden input was omitted accordingly.

- **Found during:** Task 2
- **Fix:** No hidden input rendered in edit mode; VIN absent from FormData; updateTruck ignores VIN
- **Files modified:** truck-form.tsx, trucks.ts
- **Commit:** c61cd91

## Self-Check

**Files exist:**
- prisma/seed.ts — modified
- src/components/trucks/truck-form.tsx — modified
- src/app/(owner)/actions/trucks.ts — modified

**Commits exist:**
- 33c25c8: fix(quick-50): use valid VIN character set in generateVIN()
- c61cd91: fix(quick-50): make VIN read-only on edit form, remove VIN from updateTruck

**Build:** Passed — `npm run build` completed with no TypeScript errors (21 static pages generated, all routes compiled)

## Self-Check: PASSED
