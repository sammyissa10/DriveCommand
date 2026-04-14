---
phase: quick-211
plan: 01
subsystem: api
tags: [zod, formdata, validation, truck, tenant-isolation, server-actions]

# Dependency graph
requires: []
provides:
  - Null-safe FormData extraction helpers (formString, formStringOrUndefined) in truck server action
  - Null-tolerant documentMetadataSchema using z.preprocess for null/empty coercion
  - Confirmed tenant isolation via requireTenantId() + getTenantPrisma() with explicit security comment
affects: [truck-form, truck-crud, validation-package]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Use formString()/formStringOrUndefined() helpers instead of 'formData.get() as string' to prevent null → Zod rejection"
    - "Use z.preprocess((v) => (v === null || v === '' ? undefined : v), z.string().optional()) for FormData-sourced optional fields"

key-files:
  created: []
  modified:
    - apps/web/src/app/(owner)/actions/trucks.ts
    - packages/validation/src/truck.ts

key-decisions:
  - "Use preprocess() in Zod schema as defensive layer even though action helpers now prevent null reaching the schema — belt-and-suspenders for any future callers"
  - "formStringOrUndefined returns undefined for empty string too — prevents empty-string sentinel values from polluting document metadata JSON"

patterns-established:
  - "FormData null-safety pattern: always use formString() / formStringOrUndefined() instead of 'as string' cast"
  - "Zod optional string fields sourced from FormData should use z.preprocess to coerce null/empty to undefined"

# Metrics
duration: 15min
completed: 2026-04-14
---

# Quick-211: Fix Null String Fields and Tenant Isolation Summary

**Null-safe FormData helpers and z.preprocess coercion eliminate "expected string, received null" Zod errors in truck creation**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-14
- **Completed:** 2026-04-14
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `formString()` and `formStringOrUndefined()` helpers that safely convert `FormData.get()` null returns to empty string or undefined respectively
- Replaced all unsafe `formData.get('field') as string` casts in both `createTruck` and `updateTruck` functions
- Updated `documentMetadataSchema` to use `z.preprocess()` for null/empty-string coercion on all four optional fields
- Added explicit SECURITY comment above `requireTenantId()` in `createTruck` confirming tenantId is never accepted from client payload
- All existing `truckCreateSchema` unit tests (3) continue to pass

## Task Commits

1. **Task 1: Fix null-to-string coercion in truck server action and harden Zod schema** - `9d6e2f2` (fix)

**Plan metadata:** (see final commit below)

## Files Created/Modified
- `apps/web/src/app/(owner)/actions/trucks.ts` - Added null-safe FormData helpers; replaced all `as string` casts in createTruck and updateTruck; added SECURITY isolation comment
- `packages/validation/src/truck.ts` - Updated `documentMetadataSchema` optional fields to use `z.preprocess()` for null/empty coercion

## Decisions Made
- Used `z.preprocess()` in the Zod schema as a defensive layer even though the action-level helpers already prevent null from reaching the schema. Belt-and-suspenders for any future callers that bypass the helpers.
- `formStringOrUndefined()` returns `undefined` for both `null` and empty string (`''`). This prevents empty-string sentinel values from being stored in the document metadata JSONB field, keeping the data clean.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None - TypeScript check for web app and validation package passed cleanly. Pre-existing mobile app TS errors (JSX flag, missing module paths) and E2E test failures are unrelated and pre-existed this task.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Truck form submission works for both minimal (required fields only) and full (all fields including document metadata) submissions without Zod validation errors
- The `formString`/`formStringOrUndefined` pattern should be applied to other server actions that use `formData.get() as string` — see save-route-template.ts and other action files that have the same pattern

---
*Phase: quick-211*
*Completed: 2026-04-14*
