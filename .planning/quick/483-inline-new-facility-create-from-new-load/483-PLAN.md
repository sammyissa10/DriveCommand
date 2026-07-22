# Quick 483 — Inline "New Facility" create from New Load STOPS

The mobile-web New Load screen (`NewLoadMobile` → `MobileStopsEditor`) dead-ended
when the carrier had no facilities: "No facilities yet. Stops happen at
facilities. Add one first, then come back." — forcing users to leave a half-filled
load, create a facility elsewhere, and start over.

Desktop already solves this: `StopBuilderAddModal` / `TripAddStopModal` embed the
shared `FacilityForm` inline via its existing `onSuccess(created)` / `onCancel`
props (no navigation). Only the mobile stops editor was missing it.

## Changes (single file: `components/carrier/stops/MobileStopsEditor.tsx`)
1. Reuse the existing `FacilityForm` (not duplicated) inside a DS `SheetContainer`
   layered above the Add Stop sheet.
2. Two entry points open it:
   - STOPS empty state: an "Add new facility" primary button (replaces the
     dead-end copy).
   - The stop-facility picker: a "+ Add new facility" option (sentinel value
     intercepted in onChange).
3. `onSuccess` → append the new facility to a local `createdFacilities` list
   (merged with the server `facilities` prop via `allFacilities`), auto-select it
   for the stop being added (`form.facilityId`), close the modal, and reopen the
   Add Stop sheet.
4. Load state is untouched: the parent `NewLoadMobile` holds every field in
   `useState`; the create path only POSTs + updates child state — no navigation,
   no `router.refresh`, no remount.

Works with zero facilities (empty-state button) and when adding an additional
stop to a load that already has stops (picker option). Shared component, so route
templates get the same fix.

## Constraints honored
- New Load form not refactored beyond the modal wiring.
- Trip/stop/facility data model + APIs unchanged.

## Out of scope
Desktop New Load (already has inline create).
