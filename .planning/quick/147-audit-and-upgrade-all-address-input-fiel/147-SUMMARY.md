---
phase: quick-147
plan: "01"
subsystem: web-forms, mobile-forms, geocoding
tags: [address-autocomplete, osrm, distance, geocoding, profit-predictor, crm, load-form, route-form]
dependency-graph:
  requires: [geocoding-autocomplete-api, address-autocomplete-component, AddressInput-component]
  provides: [osrm-distance-utility, distance-proxy-api, upgraded-web-address-inputs, upgraded-mobile-address-inputs]
  affects: [profit-predictor-web, profit-predictor-mobile, load-form, route-form, crm-edit-mobile]
tech-stack:
  added: [OSRM public routing API, /api/geocoding/distance proxy]
  patterns: [async-useEffect-distance-fetch, address-select-coords-state, OSRM-lng-lat-order]
key-files:
  created:
    - apps/web/src/lib/geo/osrm.ts
    - apps/web/src/app/api/geocoding/distance/route.ts
  modified:
    - apps/web/src/components/profit-predictor/profit-predictor-form.tsx
    - apps/web/src/components/loads/load-form.tsx
    - apps/web/src/components/routes/route-form.tsx
    - apps/mobile/app/(owner)/more/profit-predictor.tsx
    - apps/mobile/app/(owner)/more/crm/[id].tsx
decisions:
  - "Used getOSRMDistanceMiles returning null (not throwing) — callers degrade gracefully"
  - "Shared geocodingLimiter for distance proxy (dist: prefix) — avoids new Redis limiter"
  - "kept haversineDistanceMiles exported from address-autocomplete.tsx — still valid for other consumers"
  - "OSRM distance badge shows loading spinner during fetch, then 'road distance' label"
  - "CRM address field uses AddressInput for autocomplete only — no coords stored (address is text)"
  - "Mobile distance auto-fill clears when user manually edits origin/destination text"
metrics:
  duration: "~25 minutes"
  completed: "2026-04-02"
  tasks: 3
  files: 7
---

# Quick-147: Audit and Upgrade All Address Input Fields — Summary

Upgraded all address inputs across web and mobile to use geocoding autocomplete, and replaced haversine straight-line distance calculations with OSRM real road distances.

## What Was Done

### Task 1: OSRM Distance Utility + API Proxy

**`apps/web/src/lib/geo/osrm.ts`** — New utility exporting `getOSRMDistanceMiles(lat1, lng1, lat2, lng2)`:
- Calls `http://router.project-osrm.org/route/v1/driving/{lng},{lat};{lng},{lat}?overview=false`
- OSRM coordinate order is `lng,lat` (not `lat,lng`) — handled correctly
- 5-second AbortController timeout
- Returns `number | null` — never throws, all errors produce `null`
- Converts meters to miles: `meters / 1609.344`

**`apps/web/src/app/api/geocoding/distance/route.ts`** — New POST proxy:
- Accepts `{ originLat, originLng, destLat, destLng }` body
- Auth: mobile Bearer token OR web session cookie (same pattern as autocomplete)
- Rate limited via shared `geocodingLimiter` with `dist:{userId}` key
- Validates all 4 coords are numbers within lat/lng ranges
- Returns `{ distanceMiles: number | null }`

### Task 2: Web Forms Upgraded

**`profit-predictor-form.tsx`**:
- Replaced both plain `<input type="text">` fields with `AddressAutocomplete`
- Added `originCoords` / `destCoords` state (lat/lng from place select)
- `useEffect` fires when both coords are set — calls `getOSRMDistanceMiles`, auto-fills distance field
- Shows `(auto)` label beside Distance heading when OSRM-filled
- User can override auto-filled value; editing clears the auto label

**`load-form.tsx`**:
- Removed `haversineDistanceMiles` import
- Distance changed from synchronous computed value to `useState<number | null>(null)`
- `useEffect` on `[originCoords, destCoords]` calls `getOSRMDistanceMiles` asynchronously
- Added `distanceLoading` state — shows spinner badge while OSRM fetches
- Distance badge label changed from `"straight-line est."` to `"road distance"`
- Added hidden `<input name="distanceMiles">` submitted with form

**`route-form.tsx`**:
- Same pattern as load-form: haversine removed, async OSRM via useEffect
- Loading spinner badge + `"road distance"` label
- Existing hidden `distanceMiles` field updated to use async `distance` state

### Task 3: Mobile Forms Upgraded

**`profit-predictor.tsx`**:
- Replaced origin and destination `<TextInput>` with `AddressInput`
- Added `originLat/Lng`, `destLat/Lng` state (number | null)
- `useEffect` on all 4 coords: POSTs to `${API_URL}/api/geocoding/distance` with Bearer token
- Distance field auto-fills with `Math.round(result.distanceMiles)` on success
- zIndex 20 on origin View, 10 on destination View to fix dropdown overlap

**`crm/[id].tsx`**:
- Replaced Address `<TextInput>` in edit bottom sheet with `AddressInput`
- `onAddressSelect` sets `address` state to `result.formatted_address` (no coords needed)
- zIndex 20 on address field View, 10 on the city/state/zip row below

## Not Regressed

- `lib/geo/state-lookup.ts` — `haversineDistance()` for IFTA GPS ping segments unchanged
- `lib/geofencing/geofence-check.ts` — `@turf/turf distance()` for geofence radius unchanged
- `haversineDistanceMiles` export in `address-autocomplete.tsx` preserved for other consumers

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `cd apps/web && npx tsc --noEmit` — passed
- `cd apps/mobile && npx tsc --noEmit` — no errors in modified files (pre-existing FlashList/JSX errors unrelated)
- `grep -r "straight-line" apps/web/src/components/` — zero matches
- `grep haversineDistanceMiles apps/web/src/components/loads/load-form.tsx apps/web/src/components/routes/route-form.tsx` — zero matches
- `grep AddressAutocomplete apps/web/src/components/profit-predictor/profit-predictor-form.tsx` — matched
- `grep AddressInput apps/mobile/app/\(owner\)/more/profit-predictor.tsx apps/mobile/app/\(owner\)/more/crm/\[id\].tsx` — matched

## Self-Check: PASSED
