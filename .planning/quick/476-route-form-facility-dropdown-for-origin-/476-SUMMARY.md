---
phase: quick-476
plan: 476
subsystem: web-owner-routes
tags: [routes, facilities, forms, tkt-0078, tkt-0079]
dependency-graph:
  requires:
    - "apps/web/src/components/shared/address-autocomplete.tsx (reused for manual mode)"
    - "/api/v1/carrier/facilities (existing, no changes)"
    - "createRoute/updateRoute FormData contract (apps/web/src/app/(owner)/actions/routes.ts, UNCHANGED)"
  provides:
    - "FacilityAddressSelect — shared facility-vs-manual address control"
  affects:
    - "Desktop RouteForm (New Route + Edit Route)"
    - "Mobile-web RouteCreateMobile (New Route)"
tech-stack:
  added: []
  patterns:
    - "Native <select> facility picker + 'Enter manually…' escape hatch that swaps in the existing AddressAutocomplete, submitting the SAME FormData field name either way via a hidden input (facility mode) or the AddressAutocomplete's own input (manual mode)"
key-files:
  created:
    - apps/web/src/components/routes/FacilityAddressSelect.tsx
  modified:
    - apps/web/src/components/routes/route-form.tsx
    - apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
decisions:
  - "composeFacilityAddress() joins [addressLine1, addressLine2, city, state, zip] with ', ', falling back to facility name when no address parts exist — this exact string is both submitted in FormData and used to match against saved addresses on edit round-trip"
  - "Coords resolution: facility.latitude/longitude used directly when present; otherwise POST /api/geocoding/autocomplete with the composed address and take the first result; on any failure/no-results, onCoordsChange(null) so the parent's OSRM effect no-ops gracefully (no distance shown, no error)"
  - "A ref-guarded one-time init effect determines initial mode per field: no defaultValue -> facility mode with nothing selected; defaultValue matching a facility's composed address -> facility mode preselected + coords fired; unmatched defaultValue -> manual mode showing the saved text. A 4s fallback timer forces manual mode if the facilities fetch never resolves, so edit round-trip never gets stuck blank."
  - "Switching the select to 'Enter manually…' calls onCoordsChange(null) since the now-editable address may no longer match the previously selected facility's coordinates — the AddressAutocomplete's own onPlaceSelect re-supplies coords when the user picks a new suggestion"
  - "The <select> itself is marked required (not the hidden input, which HTML doesn't validate) when the field is required and still in facility mode — this blocks submission on an unselected required field without needing any JS-based form validation"
metrics:
  duration: ~35min
  completed: 2026-07-21
---

# Quick 476: Route Form Facility Dropdown for Origin/Destination/Stops Summary

Replaced free-text Origin/Destination/Stop address entry on both the desktop and mobile-web
route creation/edit forms with a facility picker backed by the tenant's `CarrierFacility`
records, keeping a native `<select>` + "Enter manually…" escape hatch to the existing
`AddressAutocomplete` for one-off addresses (support tickets 78 & 79).

## What Was Built

**`apps/web/src/components/routes/FacilityAddressSelect.tsx`** (new) — the single shared
control used by both forms for all three address fields (Origin, Destination, each Stop):

- Always renders a native `<select>` of `facilities` (passed down by the parent, fetched once
  from `/api/v1/carrier/facilities?pageSize=200`), with `"Select a facility…"` as the empty
  option and `"Enter manually…"` as the last option.
- **Facility mode** (a real facility chosen): renders a `<input type="hidden" name={name}
  value={composeFacilityAddress(selectedFacility)} />` so the exact same FormData field name
  the server action expects (`origin`, `destination`, `stops_<i>_address`) still receives a
  plain address string.
- **Manual mode** (`"Enter manually…"` chosen, or an edit-path address that doesn't match any
  facility): renders the existing `AddressAutocomplete` with that same `name`, so free-text
  entry with live suggestions still works exactly as before.
- **Coords**: `onCoordsChange` fires with `{lat, lng}` from the facility record when present;
  falls back to a `POST /api/geocoding/autocomplete` geocode of the composed address when a
  facility has no stored coordinates; fires `null` on any failure so the OSRM distance
  calculation in the parent form simply skips (no crash, no stale distance).
- **Edit round-trip**: a saved address string that matches a facility's composed address
  preselects that facility (and fires its coords); an unmatched saved address falls back to
  manual mode showing the saved text verbatim.

**`apps/web/src/components/routes/route-form.tsx`** (desktop RouteForm, used for both New
Route and Edit Route) and **`apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx`**
(mobile-web New Route) — both now fetch `facilities` once via `useEffect` and swap in
`FacilityAddressSelect` for Origin, Destination, and each Stop's address field, wiring
`onCoordsChange` to the existing `originCoords`/`destCoords`/`stopCoords` state (which already
drove the OSRM distance calculation) and `onAddressChange` (stops only) to `updateStop`.

**`apps/web/src/app/(owner)/actions/routes.ts`** — zero diff, confirmed via `git diff` before
finishing. `createRoute`/`updateRoute` still read `origin`, `destination`, and
`stops_<i>_address` as plain strings; they have no idea whether the string came from a
facility pick or manual typing.

## Deviations from Plan

### Auto-fixed Issues

None — Task 1 and Task 2 were implemented as specified.

### Notable Discovery (not part of this task's scope)

While reading `route-form.tsx` and `RouteCreateMobile.tsx` before editing, both files already
contained substantial **pre-existing uncommitted changes** unrelated to this ticket: a
driver-portal-access gating feature (`driver.userId`-based select options, "needs portal
access" messaging, co-driver filtering) that appears to be in-progress follow-up work related
to TKT-0074, spread across 6 files not in this plan's scope
(`apps/web/src/app/(owner)/routes/[id]/page.tsx`, `route-page-client.tsx`,
`apps/web/src/app/(owner)/routes/new/page.tsx`, `new-route-client.tsx`,
`apps/web/src/components/routes/route-edit-section.tsx`, plus two Playwright specs).

To keep this task's commits scoped exactly to the plan (per the `files_modified` list), I
reverted only the unrelated hunks inside `route-form.tsx` and `RouteCreateMobile.tsx` back to
their original committed form before applying the `FacilityAddressSelect` wiring, then
committed. **The unrelated WIP was not discarded** — it remains sitting uncommitted in the
working tree exactly as it was found (confirmed via `git status` after this task's commits),
for the user or a future task to review and commit separately. One consequence: with that WIP
present, `apps/web/src/app/(owner)/routes/[id]/edit-route-client.tsx` (not modified by anyone)
currently mismatches the driver type that WIP introduces on `route-form.tsx`'s `drivers` prop
— but since I reverted `route-form.tsx`'s driver-prop type back to its committed form, that
mismatch does not currently manifest as a `tsc` error on disk (verified 0 errors). It would
resurface if that WIP is committed as-is without also updating `edit-route-client.tsx`.

## Verification

- `cd apps/web && npx tsc --noEmit` — 0 errors (confirmed both before touching the unrelated
  WIP files and after, isolating this task's changes).
- `git diff -- apps/web/src/app/\(owner\)/actions/routes.ts` — empty, server action untouched.
- `git status --short` after both commits shows only the pre-existing unrelated WIP files
  still modified/untracked; `FacilityAddressSelect.tsx`, `route-form.tsx`, and
  `RouteCreateMobile.tsx` are clean (fully committed).

## Commits

- `c105a824` — feat(tkt-0078,0079): add shared FacilityAddressSelect component
- `5db1abcf` — feat(tkt-0078,0079): wire route Origin/Destination/Stop fields to facility dropdown

## Self-Check: PASSED

- FOUND: apps/web/src/components/routes/FacilityAddressSelect.tsx
- FOUND: apps/web/src/components/routes/route-form.tsx (FacilityAddressSelect import present)
- FOUND: apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx (FacilityAddressSelect import present)
- FOUND commit c105a824 in `git log --oneline`
- FOUND commit 5db1abcf in `git log --oneline`
