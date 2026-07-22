# Quick 483 — Summary

## Problem
On the mobile-web New Load screen, the STOPS section dead-ended with no
facilities: "No facilities yet. Stops happen at facilities. Add one first, then
come back." Users had to abandon a half-filled load, create a facility
elsewhere, and start over — risking losing everything they'd typed.

## Root observation
The **desktop** New Load flow already solves this: `StopBuilderAddModal` (and
`TripAddStopModal`) embed the shared `FacilityForm` inline via its existing
`onSuccess(created)` / `onCancel` props — which bypass navigation. Only the
**mobile** stops editor (`MobileStopsEditor`, used by `NewLoadMobile`) was
missing inline create.

## Change — `components/carrier/stops/MobileStopsEditor.tsx` (one file)
- **Reuses the existing `FacilityForm`** (requirement 4 — no duplication) inside a
  DS `SheetContainer`, rendered after the Add Stop sheet so it layers on top.
- **Two entry points:**
  - STOPS empty state: replaced the dead-end copy with "Stops happen at
    facilities. Add your first one right here." + an **"Add new facility"** primary
    button.
  - Stop-facility picker (inside the Add Stop sheet): a **"+ Add new facility"**
    option (sentinel value intercepted in the select's `onChange`).
- **On save (`onSuccess`):** the new facility is appended to a local
  `createdFacilities` list (merged over the server `facilities` prop via
  `allFacilities`), **auto-selected** for the stop being added
  (`form.facilityId`), the modal closes, and the Add Stop sheet reopens.
- **Load state preserved:** `NewLoadMobile` holds every load field (client,
  contract, commodity, rate, stops, …) in `useState`; the create path only POSTs
  to `/api/v1/carrier/facilities` and updates child state — no navigation, no
  `router.refresh`, no remount. `router.push` fires only on final load submit.

Shared editor → route templates get the same inline-create for free.

## State walkthrough (create-facility round trip)
1. **Zero facilities:** STOPS shows the warning + "Add new facility". Tap it → the
   New Facility form opens in a sheet over the load. Save → toast "Facility
   created", sheet closes, Add Stop sheet opens with the new facility already
   selected. Every load field typed so far is still there.
2. **Adding another stop (load already has stops / facilities exist):** tap
   "Add" → Add Stop sheet → open the Facility picker → "+ Add new facility" →
   form opens over the sheet. Save → returns to the Add Stop sheet with the new
   facility selected; existing stops and all load fields intact. Complete the
   stop → it appends after the existing ones.
3. **Cancel:** "Close" (sheet) or the form's Cancel dismisses the create form and
   returns to exactly where the user was; nothing is lost.

## Verification
- `npx tsc --noEmit` → **0 errors**.
- Traced state ownership end-to-end: load fields live in `NewLoadMobile`
  `useState` and are never touched by the inline create (no nav / refresh /
  remount), so the in-progress load survives the round trip.

## Out of scope
Desktop New Load (already has inline facility create); New Load form otherwise
unchanged.
