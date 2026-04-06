# Quick Task 185 — Fix Facility Search Modal Bugs in Stop Builder

## Task
Fix two bugs in the facility search modal used in the route template stop builder.

## Root Causes Identified

### Bug 1: "Create New Facility" closes the modal
`FacilitySearchModal` "Create New Facility" button called `onOpenChange(false)` before `onCreateNew()`, closing the search dialog before the sheet could open.

### Bug 2: Selecting a facility doesn't add the stop
`FacilitySearchModal.handleSelect` called `onSelect(facility)` then `onOpenChange(false)`. The `onOpenChange` propagated up to `StopBuilder`'s `setShowAddModal(false)`, triggering the reset `useEffect` in `StopBuilderAddModal` that wiped `step` and `selectedFacility` back to initial state before step 2 could render.

### Bonus fix: FacilityForm navigates away on success
`FacilityForm.handleSubmit` called `router.push('/carrier/facilities')` on success. When used inside a sheet in `StopBuilderAddModal`, this would navigate away from the page. Added `onSuccess` callback prop as an escape hatch.

## Fix Plan

1. **FacilitySearchModal.tsx** — Remove `onOpenChange(false)` from both:
   - `handleSelect` (let parent unmount by switching to step 2)
   - "Create New Facility" onClick (let sheet layer on top)

2. **FacilityForm.tsx** — Add `onSuccess` prop; call it instead of `router.push` when provided

3. **StopBuilderAddModal.tsx** — Pass `onSuccess` to `FacilityForm` that closes the sheet and auto-selects the new facility into step 2
