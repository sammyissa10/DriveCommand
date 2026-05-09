# Quick Task 185 — Summary

## Status: COMPLETE

## Changes Made

### `apps/web/src/components/carrier/facilities/FacilitySearchModal.tsx`
- **`handleSelect`**: Removed `onOpenChange(false)`. Parent (`StopBuilderAddModal`) now controls modal state — selecting a facility sets `step→2`, unmounting `FacilitySearchModal` and rendering the step-2 `Dialog` instead, with `open` still `true`.
- **"Create New Facility" button**: Removed `onOpenChange(false)`. Search modal now stays visible while the creation sheet opens on top.

### `apps/web/src/components/carrier/facilities/FacilityForm.tsx`
- Added `onSuccess?: (created: {...}) => void` prop to `FacilityFormProps`.
- In `handleSubmit`: when `onSuccess` is provided, parse the response body and call `onSuccess(created)` instead of `router.push('/carrier/facilities')`.

### `apps/web/src/components/carrier/stops/StopBuilderAddModal.tsx`
- Passed `onSuccess` to `<FacilityForm>` in the creation sheet: closes the sheet and calls `handleFacilitySelect(created)`, advancing to step 2 with the new facility pre-selected.

## Commit
`c0c9aed` — fix(quick-185): fix facility search modal bugs in stop builder
