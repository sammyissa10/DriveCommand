---
phase: quick-204
plan: "01"
subsystem: carrier-portal
tags: [address-autocomplete, carrier, facilities, clients, nominatim, geocoding]
dependency_graph:
  requires: [address-autocomplete component, geocoding autocomplete API]
  provides: [autocomplete address entry in FacilityForm, autocomplete address entry in ClientForm]
  affects: [carrier/facilities/new, carrier/facilities/[id]/edit, carrier/clients/new, carrier/clients/[id]/edit]
tech_stack:
  added: []
  patterns: [AddressAutocomplete component reuse, Nominatim address parsing, US state abbreviation lookup]
key_files:
  modified:
    - apps/web/src/components/carrier/facilities/FacilityForm.tsx
    - apps/web/src/components/carrier/clients/ClientForm.tsx
decisions:
  - Duplicated parseFormattedAddress and US_STATES into both files per plan constraint (only these 2 files allowed)
  - Used US_STATES lookup map for full-name-to-abbreviation conversion; unrecognized states pass through as-is for manual correction
metrics:
  duration: "~10 minutes"
  completed: "2026-04-12"
  tasks_completed: 2
  files_modified: 2
---

# Phase quick-204 Plan 01: Add AddressAutocomplete to Carrier Facility and Client Forms Summary

Replaced plain Address Line 1 inputs in FacilityForm and ClientForm with the shared AddressAutocomplete component backed by Nominatim, auto-populating city, state (2-letter abbreviation), zip, and lat/lng (facility only) on place selection.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Add AddressAutocomplete to FacilityForm | 432f22e | apps/web/src/components/carrier/facilities/FacilityForm.tsx |
| 2 | Add AddressAutocomplete to ClientForm | 432f22e | apps/web/src/components/carrier/clients/ClientForm.tsx |

## What Was Built

Both carrier forms now use the existing `AddressAutocomplete` component from `@/components/shared/address-autocomplete`. When the user types 3+ characters in Address Line 1, Nominatim suggestions appear in a dropdown. Selecting one auto-populates:

- **FacilityForm:** addressLine1, city, state, zip, latitude, longitude
- **ClientForm:** addressLine1, city, state, zip (no lat/lng fields on client)

Each form includes:
- `parseFormattedAddress(displayName)` — splits the Nominatim formatted address string (`"street, city, state zip"`) into discrete parts
- `US_STATES` lookup map — converts full state names (e.g. "Illinois") to 2-letter abbreviations (e.g. "IL") for the `maxLength={2}` state field

All auto-filled fields remain manually editable. Form submission payload shape is unchanged.

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/components/carrier/facilities/FacilityForm.tsx` — modified, contains `AddressAutocomplete`
- `apps/web/src/components/carrier/clients/ClientForm.tsx` — modified, contains `AddressAutocomplete`
- Commit `432f22e` exists
- `npx tsc --noEmit` — zero errors in source files (3 pre-existing errors in e2e test files unrelated to this task)
