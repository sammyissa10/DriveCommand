---
phase: quick-147
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/geo/osrm.ts
  - apps/web/src/app/api/geocoding/distance/route.ts
  - apps/web/src/components/profit-predictor/profit-predictor-form.tsx
  - apps/web/src/components/loads/load-form.tsx
  - apps/web/src/components/routes/route-form.tsx
  - apps/mobile/app/(owner)/more/profit-predictor.tsx
  - apps/mobile/app/(owner)/more/crm/[id].tsx
autonomous: true

must_haves:
  truths:
    - "Web profit predictor origin/destination fields use AddressAutocomplete with geocoding suggestions"
    - "Mobile profit predictor origin/destination fields use AddressInput with geocoding suggestions"
    - "Mobile CRM customer edit address field uses AddressInput with geocoding suggestions"
    - "Route and load forms compute distance via OSRM road distance, not haversine straight-line"
    - "Distance badge on route-form and load-form says 'road distance' not 'straight-line est.'"
    - "Profit predictor auto-fills distance from OSRM when both addresses are geocoded"
  artifacts:
    - path: "apps/web/src/lib/geo/osrm.ts"
      provides: "OSRM road distance utility"
      exports: ["getOSRMDistanceMiles"]
    - path: "apps/web/src/app/api/geocoding/distance/route.ts"
      provides: "Server-side OSRM proxy endpoint for mobile"
      exports: ["POST"]
  key_links:
    - from: "apps/web/src/components/loads/load-form.tsx"
      to: "apps/web/src/lib/geo/osrm.ts"
      via: "async OSRM call replacing haversine"
      pattern: "getOSRMDistanceMiles"
    - from: "apps/web/src/components/routes/route-form.tsx"
      to: "apps/web/src/lib/geo/osrm.ts"
      via: "async OSRM call replacing haversine"
      pattern: "getOSRMDistanceMiles"
    - from: "apps/mobile/app/(owner)/more/profit-predictor.tsx"
      to: "/api/geocoding/distance"
      via: "fetch to distance proxy"
      pattern: "api/geocoding/distance"
---

<objective>
Upgrade all address inputs across web and mobile to use geocoding autocomplete, and replace haversine straight-line distance calculations with OSRM real road distances.

Purpose: Users currently see inaccurate straight-line distance estimates on routes/loads (can be 20-40% off real road distance). Some address fields are plain text inputs without autocomplete. This task fixes both issues.

Output: All address fields use autocomplete, all distance estimates use real road distances via OSRM.
</objective>

<context>
@.planning/STATE.md
@apps/web/src/components/shared/address-autocomplete.tsx
@apps/mobile/components/owner/AddressInput.tsx
@apps/web/src/app/api/geocoding/autocomplete/route.ts
</context>

<audit_results>

## Web Address Fields

| File | Field | Current | Status |
|------|-------|---------|--------|
| `components/loads/load-form.tsx` | Origin, Destination | AddressAutocomplete | OK |
| `components/routes/route-form.tsx` | Origin, Destination, Stop addresses | AddressAutocomplete | OK |
| `components/drivers/driver-invite-form.tsx` | Address | AddressAutocomplete | OK |
| `components/crm/customer-form.tsx` | Address | AddressAutocomplete | OK |
| `components/profit-predictor/profit-predictor-form.tsx` | Origin, Destination | **Plain `<input type="text">`** | NEEDS FIX |

## Mobile Address Fields

| File | Field | Current | Status |
|------|-------|---------|--------|
| `components/owner/CreateLoadSheet.tsx` | Origin, Destination | AddressInput (autocomplete) | OK |
| `app/(owner)/more/profit-predictor.tsx` | Origin, Destination | **Plain `<TextInput>`** | NEEDS FIX |
| `app/(owner)/more/crm/[id].tsx` | Address (customer edit) | **Plain `<TextInput>`** | NEEDS FIX |

## Distance Calculations

| File | Method | Status |
|------|--------|--------|
| `components/loads/load-form.tsx` | `haversineDistanceMiles()` client-side | NEEDS OSRM |
| `components/routes/route-form.tsx` | `haversineDistanceMiles()` client-side | NEEDS OSRM |
| `components/profit-predictor/profit-predictor-form.tsx` | Manual user input | NEEDS AUTO-FILL FROM OSRM |
| `mobile/profit-predictor.tsx` | Manual user input | NEEDS AUTO-FILL FROM OSRM |
| `lib/geo/state-lookup.ts` (IFTA) | `haversineDistance()` for GPS pings | OK (GPS ping segments are point-to-point; haversine is correct here) |
| `lib/geofencing/geofence-check.ts` | `@turf/turf distance()` for geofence radius | OK (proximity check, not road distance) |

</audit_results>

<tasks>

<task type="auto">
  <name>Task 1: Create OSRM distance utility and API proxy</name>
  <files>
    apps/web/src/lib/geo/osrm.ts
    apps/web/src/app/api/geocoding/distance/route.ts
  </files>
  <action>
1. Create `apps/web/src/lib/geo/osrm.ts`:
   - Export `async function getOSRMDistanceMiles(lat1: number, lng1: number, lat2: number, lng2: number): Promise<number | null>`
   - Call `http://router.project-osrm.org/route/v1/driving/${lng1},${lat1};${lng2},${lat2}?overview=false`
   - Parse response: `data.routes[0].distance` is meters. Convert: `meters / 1609.344` = miles.
   - Return `null` on any error (network, no route, invalid response). Do NOT throw.
   - Add a 5-second timeout via AbortController.
   - OSRM uses `lng,lat` order (not `lat,lng`). Be careful.

2. Create `apps/web/src/app/api/geocoding/distance/route.ts`:
   - Server-side proxy for mobile to call OSRM (mobile cannot call HTTP endpoints directly on some networks).
   - Accept POST with body: `{ originLat, originLng, destLat, destLng }` (all numbers).
   - Auth: same pattern as `/api/geocoding/autocomplete` — accept mobile Bearer token or web session cookie.
   - Rate limit: reuse `geocodingLimiter` with key `dist:${userId}`.
   - Validate all 4 fields are numbers and within valid lat/lng ranges.
   - Call `getOSRMDistanceMiles()` from the utility.
   - Return `{ distanceMiles: number }` on success, or `{ distanceMiles: null }` if OSRM returns null.
   - Return 401 if not authenticated, 400 for invalid input.
  </action>
  <verify>
    `npx tsc --noEmit` passes. Read both files and confirm: OSRM URL uses lng,lat order, timeout exists, auth check exists on the API route, rate limiting applied.
  </verify>
  <done>
    OSRM utility exists at `lib/geo/osrm.ts` with `getOSRMDistanceMiles` export. API proxy exists at `/api/geocoding/distance` with auth + rate limiting. Both handle errors gracefully (return null, not throw).
  </done>
</task>

<task type="auto">
  <name>Task 2: Upgrade web forms — AddressAutocomplete on profit predictor + OSRM distance on all forms</name>
  <files>
    apps/web/src/components/profit-predictor/profit-predictor-form.tsx
    apps/web/src/components/loads/load-form.tsx
    apps/web/src/components/routes/route-form.tsx
  </files>
  <action>
1. **profit-predictor-form.tsx** — Replace plain `<input>` for origin and destination with `AddressAutocomplete`:
   - Import `AddressAutocomplete` from `@/components/shared/address-autocomplete`.
   - Import `getOSRMDistanceMiles` from `@/lib/geo/osrm`.
   - Add state: `originCoords`, `destCoords` (same pattern as load-form.tsx).
   - Replace the origin `<input>` with `<AddressAutocomplete id="origin" name="origin" ... onPlaceSelect={(p) => { setOrigin(p.displayName); setOriginCoords({lat: p.lat, lng: p.lng}); }} />`. Use the same className styling pattern.
   - Same for destination.
   - Add a `useEffect` that fires when both `originCoords` and `destCoords` are set: call `getOSRMDistanceMiles(...)`, and if result is not null, set `distanceMiles` to `String(Math.round(result))`. This auto-fills the distance field.
   - Keep the distance input editable so user can override.
   - Show a small "(auto)" label next to the distance field when it was auto-filled from OSRM.

2. **load-form.tsx** — Replace haversine with OSRM:
   - Remove import of `haversineDistanceMiles`.
   - Import `getOSRMDistanceMiles` from `@/lib/geo/osrm`.
   - Change the `distance` state from a synchronous computed value to `useState<number | null>(null)`.
   - Add a `useEffect` that fires when both `originCoords` and `destCoords` are set: call `getOSRMDistanceMiles(...)` and set distance state.
   - Add a loading state for the distance fetch (small spinner or "Calculating..." text in the badge).
   - Update the distance badge: change "straight-line est." label to "road distance" (or remove the label entirely since it's now accurate).
   - Keep the hidden `<input name="distanceMiles">` that submits the distance value with the form.

3. **route-form.tsx** — Same pattern as load-form:
   - Remove import of `haversineDistanceMiles`.
   - Import `getOSRMDistanceMiles` from `@/lib/geo/osrm`.
   - Change distance from synchronous haversine to async OSRM via useEffect.
   - Update badge label from "straight-line est." to "road distance".
   - Keep hidden distance input for form submission.

Note: The `haversineDistanceMiles` function in `address-autocomplete.tsx` can stay exported — it is still used by other consumers (IFTA via state-lookup.ts pattern). Just remove the imports from load-form and route-form.
  </action>
  <verify>
    `npx tsc --noEmit` passes. Read profit-predictor-form.tsx and confirm AddressAutocomplete is used for origin/destination. Read load-form.tsx and route-form.tsx and confirm they import `getOSRMDistanceMiles` (not `haversineDistanceMiles`). Grep for "straight-line" in those 3 files — should be zero matches.
  </verify>
  <done>
    Web profit predictor uses AddressAutocomplete for origin/destination with OSRM auto-distance. Load-form and route-form compute distance via OSRM road distance. No more "straight-line est." labels on any web form.
  </done>
</task>

<task type="auto">
  <name>Task 3: Upgrade mobile forms — AddressInput on profit predictor and CRM + OSRM auto-distance</name>
  <files>
    apps/mobile/app/(owner)/more/profit-predictor.tsx
    apps/mobile/app/(owner)/more/crm/[id].tsx
  </files>
  <action>
1. **profit-predictor.tsx** — Replace plain `<TextInput>` for origin and destination with `AddressInput`:
   - Import `AddressInput` from `../../components/owner/AddressInput` (same import path as CreateLoadSheet uses — verify relative path is correct from `apps/mobile/app/(owner)/more/profit-predictor.tsx`).
   - Add state: `originLat/originLng`, `destLat/destLng` (number | null, default null).
   - Replace the origin TextInput block (lines ~148-156) with:
     ```
     <AddressInput
       value={origin}
       onChangeText={setOrigin}
       onAddressSelect={(r) => {
         setOrigin(r.formatted_address)
         setOriginLat(r.latitude)
         setOriginLng(r.longitude)
       }}
       placeholder="e.g. Chicago, IL"
     />
     ```
   - Same for destination.
   - Wrap origin/destination Views with `style={{ zIndex: 20 }}` and `style={{ zIndex: 10 }}` respectively (same pattern as CreateLoadSheet) to fix dropdown overlap.
   - Add a `useEffect` that fires when all 4 coords are set: call the distance proxy `${API_URL}/api/geocoding/distance` with POST body `{ originLat, originLng, destLat, destLng }`. Set `distance` state to `String(Math.round(result.distanceMiles))` if successful. Include the auth token in the Authorization header (same pattern as ownerApi calls — get `token` from `useAuthContext()`).
   - Keep the distance input editable for manual override.
   - Define `const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://10.0.2.2:3000'` at top of file if not already present.

2. **crm/[id].tsx** — Replace plain `<TextInput>` for the Address field in edit mode with `AddressInput`:
   - Import `AddressInput` from the owner components.
   - Replace the address TextInput (around line 404-412) with AddressInput component.
   - Wire `onAddressSelect` to set the address state to `result.formatted_address`. No coordinates needed here (CRM customer address is just text).
   - Wrap the address field View with appropriate zIndex to avoid dropdown overlap with surrounding fields.
   - Ensure `keyboardShouldPersistTaps="handled"` is on the parent ScrollView (check if it already is).
  </action>
  <verify>
    `cd apps/mobile && npx tsc --noEmit` passes (or `npx expo export --dump-sourcemap` type check). Read profit-predictor.tsx and confirm AddressInput is used for origin/destination. Read crm/[id].tsx and confirm AddressInput is used for the address field in edit mode. Grep for plain TextInput usage for address/origin/destination across both files — should find none for those specific fields.
  </verify>
  <done>
    Mobile profit predictor uses AddressInput with geocoding autocomplete for origin/destination, and auto-fills distance via OSRM when both addresses are geocoded. Mobile CRM customer edit uses AddressInput for the address field. All address inputs across web and mobile now have geocoding autocomplete.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes from repo root
2. `cd apps/mobile && npx tsc --noEmit` passes
3. Grep: `grep -r "straight-line" apps/web/src/components/` returns zero matches
4. Grep: `grep -r "haversineDistanceMiles" apps/web/src/components/loads/load-form.tsx apps/web/src/components/routes/route-form.tsx` returns zero matches
5. Grep: `grep -r "AddressAutocomplete" apps/web/src/components/profit-predictor/` returns matches
6. Grep: `grep -r "AddressInput" apps/mobile/app/\(owner\)/more/profit-predictor.tsx apps/mobile/app/\(owner\)/more/crm/\[id\].tsx` returns matches
</verification>

<success_criteria>
- Every address input on web uses AddressAutocomplete (5 forms: loads, routes, drivers, CRM, profit predictor)
- Every address input on mobile uses AddressInput (3 forms: CreateLoadSheet, profit predictor, CRM edit)
- Route and load distance estimates use OSRM road distances (not haversine)
- Profit predictor (web + mobile) auto-fills distance when origin and destination are geocoded
- OSRM proxy at /api/geocoding/distance exists with auth and rate limiting
- No regression: IFTA and geofencing distance calculations remain unchanged (they correctly use haversine/turf for GPS point-to-point)
</success_criteria>

<output>
After completion, create `.planning/quick/147-audit-and-upgrade-all-address-input-fiel/147-SUMMARY.md`
</output>
