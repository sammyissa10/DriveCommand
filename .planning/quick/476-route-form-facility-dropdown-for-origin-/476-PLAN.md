---
phase: quick-476
plan: 476
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/routes/FacilityAddressSelect.tsx
  - apps/web/src/components/routes/route-form.tsx
  - apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx
autonomous: true

must_haves:
  truths:
    - "On desktop New Route + Edit Route, Origin/Destination/each Stop show a native <select> of the tenant's facilities plus an 'Enter manually…' option that reveals the existing AddressAutocomplete text input"
    - "On mobile-web New Route (RouteCreateMobile), the same facility <select> + 'Enter manually…' toggle appears for Origin/Destination/each Stop"
    - "Selecting a facility submits that facility's composed address string in the origin/destination/stops_<i>_address FormData field and sets OSRM coords from the facility's lat/lng (or geocode fallback)"
    - "Editing an existing route round-trips: an address that matches a facility preselects it; an unmatched address defaults the control to 'Enter manually…' showing that address"
    - "createRoute / updateRoute server action is UNCHANGED and still receives the exact same FormData contract"
  artifacts:
    - path: "apps/web/src/components/routes/FacilityAddressSelect.tsx"
      provides: "Shared facility-vs-manual address control used by both route forms and stops"
    - path: "apps/web/src/components/routes/route-form.tsx"
      provides: "Desktop RouteForm using FacilityAddressSelect for origin/destination/stops"
    - path: "apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx"
      provides: "Mobile-web RouteCreateMobile using FacilityAddressSelect for origin/destination/stops"
  key_links:
    - from: "FacilityAddressSelect"
      to: "/api/v1/carrier/facilities?pageSize=200"
      via: "parent form useEffect fetch, passed down as facilities prop"
    - from: "FacilityAddressSelect"
      to: "createRoute FormData (origin/destination/stops_<i>_address + coords)"
      via: "hidden input (facility mode) or AddressAutocomplete name (manual mode) + onCoordsChange"
---

<objective>
Support tickets 78 & 79: on the owner "New Route" / route creation form, turn the Origin,
Destination, AND each Stop address field from a free-text AddressAutocomplete into a facility
selector. Any origin/destination/stop is really a facility, so users should pick from their
CarrierFacility records via a plain native `<select>`, with an "Enter manually…" escape hatch
that reveals the existing AddressAutocomplete free-text input.

Purpose: faster, more accurate route creation from known facilities; keeps OSRM distance working
via facility lat/lng.
Output: one shared client component + both route forms wired to it. Server action untouched.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@.planning/STATE.md

# Server action — ALREADY VERIFIED, MUST NOT CHANGE
# createRoute reads: origin, destination (strings), stops_submitted, and per-stop
# stops_<i>_type / _scheduledAt / _notes / _lat / _lng / _address. updateRoute is identical.
@apps/web/src/app/(owner)/actions/routes.ts

# The two forms to update (both feed createRoute)
@apps/web/src/components/routes/route-form.tsx
@apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx

# Reuse — the existing free-text control (keep for manual mode)
@apps/web/src/components/shared/address-autocomplete.tsx

# Facilities list API — RETURNS FULL RECORDS (findMany, no select): name, addressLine1/2,
# city, state, zip, country, latitude, longitude. Response = { data: { items, total, page, pageSize } }.
# NO endpoint change needed. Fetch pattern reference: RouteTemplateForm uses
# fetch('/api/v1/carrier/clients?pageSize=200').
@apps/web/src/app/api/v1/carrier/facilities/route.ts
@apps/web/src/lib/carrier/facilities.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create shared FacilityAddressSelect component</name>
  <files>apps/web/src/components/routes/FacilityAddressSelect.tsx</files>
  <action>
Create a new `'use client'` component `FacilityAddressSelect` plus an exported helper
`composeFacilityAddress`. This is the single source of the facility-vs-manual toggle logic
reused by desktop origin/destination/stops AND mobile origin/destination/stops.

Types + props:
```ts
export interface FacilityOption {
  id: string;
  name: string;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface FacilityAddressSelectProps {
  name: string;                 // FormData field name for the address STRING (e.g. "origin", "destination", `stops_${idx}_address`)
  facilities: FacilityOption[]; // fetched once by the parent form, passed down
  defaultValue?: string;        // existing address string (edit round-trip); '' for create
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;           // applied to BOTH the <select> and the AddressAutocomplete input (forms pass inputClass or dsFieldClass)
  onCoordsChange?: (coords: { lat: number; lng: number } | null) => void;
  onAddressChange?: (address: string) => void; // lets parent keep its own draft string in sync
}
```

`composeFacilityAddress(f: FacilityOption): string`:
- Join `[addressLine1, addressLine2, city, state, zip].filter(Boolean)` with ', '.
- If that is empty, fall back to `f.name`. This composed string is what gets submitted AND what
  we compare against for edit round-trip matching.

Component behavior:
- Internal `mode: 'facility' | 'manual'` and `selectedFacilityId: string`.
- The native `<select>` is ALWAYS rendered and uses `className`. Options:
  - `<option value="">Select a facility…</option>`
  - one `<option value={f.id}>` per facility, label = `f.name` + (city/state suffix when present, e.g. `"Acme Yard — Dallas, TX"`).
  - a final `<option value="__manual__">Enter manually…</option>`.
- Determine INITIAL mode from `defaultValue` once `facilities` is available (run in a `useEffect`
  keyed on `facilities`/`defaultValue`, since the parent fetches async):
  - If `defaultValue` is non-empty: find a facility whose `composeFacilityAddress(f) === defaultValue`.
    - Match found → `mode='facility'`, `selectedFacilityId=f.id`, and fire `onCoordsChange` from its
      lat/lng (see coords rules).
    - No match → `mode='manual'`, `selectedFacilityId='__manual__'` and show `defaultValue` in the input.
  - If `defaultValue` empty → `mode='facility'`, `selectedFacilityId=''` (nothing chosen yet).
- On `<select>` change:
  - value `'__manual__'` → `mode='manual'`. Render the AddressAutocomplete seeded with the current
    address string (use a `key` so it remounts with the seed as `defaultValue`).
  - value `''` → `mode='facility'`, no facility; submit empty address; `onCoordsChange(null)`; `onAddressChange('')`.
  - a real facility id → `mode='facility'`; compute `addr = composeFacilityAddress(f)`; `onAddressChange(addr)`;
    set coords per rules below.
- Rendering the address VALUE into FormData (never two inputs with the same `name` at once):
  - FACILITY mode: DO NOT render AddressAutocomplete. Render a `<input type="hidden" name={name}
    value={composeFacilityAddress(selectedFacility) or ''} />` so the string is submitted.
  - MANUAL mode: render `<AddressAutocomplete id={name} name={name} defaultValue={currentAddress}
    required={required} disabled={disabled} placeholder={placeholder} className={className}
    onPlaceSelect={(place) => { onAddressChange?.(place.displayName); onCoordsChange?.({lat: place.lat, lng: place.lng}); }} />`.
    Do NOT render the hidden input in this mode.
- Coords rules on facility select:
  - If `f.latitude != null && f.longitude != null` → `onCoordsChange({ lat: f.latitude, lng: f.longitude })`.
  - Else (missing coords) → geocode fallback: POST `/api/geocoding/autocomplete` with
    `{ query: composeFacilityAddress(f) }`, take the first result's latitude/longitude and call
    `onCoordsChange`. On any failure/no results → `onCoordsChange(null)` (distance is skipped
    gracefully — the parent's OSRM effect already no-ops when a coord is null). Guard against races
    (ignore stale responses if the selection changed).

Keep it a plain native `<select>` (NOT a search box / combobox) per the decided pattern. No new
dependencies. Match existing code style in the repo (functional component, hooks).
  </action>
  <verify>Component compiles (checked via tsc in Task 2). Exports `FacilityAddressSelect`, `FacilityOption`, and `composeFacilityAddress`.</verify>
  <done>FacilityAddressSelect renders a native facility <select> + "Enter manually…" that reveals AddressAutocomplete, submits the composed address via `name`, and reports coords via onCoordsChange with a geocode fallback.</done>
</task>

<task type="auto">
  <name>Task 2: Wire both route forms to FacilityAddressSelect + typecheck</name>
  <files>apps/web/src/components/routes/route-form.tsx, apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx</files>
  <action>
In BOTH forms, fetch the facility list once and replace the three AddressAutocomplete usages
(origin, destination, each stop address) with `FacilityAddressSelect`. Import from
`@/components/routes/FacilityAddressSelect`.

Facility fetch (add to each form, mirroring RouteTemplateForm's client fetch):
```ts
const [facilities, setFacilities] = useState<FacilityOption[]>([]);
useEffect(() => {
  (async () => {
    try {
      const res = await fetch('/api/v1/carrier/facilities?pageSize=200');
      if (!res.ok) return;
      const json = await res.json();
      setFacilities(json?.data?.items ?? []);   // response shape: { data: { items, ... } }
    } catch { /* leave empty — forms still work in manual mode */ }
  })();
}, []);
```
(If `facilities` is empty, FacilityAddressSelect still shows "Select a facility…" + "Enter
manually…"; users can always fall back to manual. That is the intended graceful degradation.)

--- apps/web/src/components/routes/route-form.tsx (RouteForm — desktop, used for BOTH create and edit) ---
- Origin: replace the `<AddressAutocomplete id="origin" name="origin" .../>` with
  `<FacilityAddressSelect name="origin" facilities={facilities} defaultValue={initialData?.origin || ''}
   required disabled={isPending} placeholder="Enter origin address..." className={inputClass}
   onCoordsChange={setOriginCoords} />`.
- Destination: same, `name="destination"`, `defaultValue={initialData?.destination || ''}`,
  `onCoordsChange={setDestCoords}`.
- Stop address (inside the stops.map): replace the stop `<AddressAutocomplete name={`stops_${idx}_address`} ...>`
  with `<FacilityAddressSelect name={`stops_${idx}_address`} facilities={facilities}
   defaultValue={stop.address} disabled={isPending} placeholder="Enter stop address..."
   className={inputClass}
   onAddressChange={(addr) => updateStop(stop.clientId, 'address', addr)}
   onCoordsChange={(c) => setStopCoords((prev) => { const next = new Map(prev); if (c) next.set(stop.clientId, c); else next.delete(stop.clientId); return next; })} />`.
- Because RouteForm is reused for EDIT, the origin/destination/stop defaultValues drive the
  round-trip: matched → facility preselected, unmatched → "Enter manually…" showing the saved address.
  Do not change any hidden fields, the stops_submitted sentinel, distanceMiles wiring, or the action.

--- apps/web/src/app/(owner)/routes/new/RouteCreateMobile.tsx (mobile-web, create only) ---
- Same three replacements, but pass `className={dsFieldClass}` and (create path) NO defaultValue for
  origin/destination (they had none). For stops use `defaultValue={stop.address}` and the same
  onAddressChange/onCoordsChange handlers as desktop. Keep MobileScreen/SectionHeader/ds tokens intact.

Design: this is a native `<select>` styled with the form's existing token class (inputClass on
desktop, dsFieldClass on mobile) — no new visual system. Per project convention, briefly consult the
UI/UX Pro Max skill for select styling, but do NOT introduce new tokens or components; reuse the
existing field classes so it matches the surrounding inputs.

Finally, run the workspace typecheck and confirm no NEW errors in the touched files:
`cd apps/web && npx tsc --noEmit` (baseline has ~35 pre-existing errors — only regressions or
errors in the three touched files count as failures). Do NOT run vercel/deploy. Do NOT `git push`
(the user pushes/deploys themselves; commit only).
  </action>
  <verify>`cd apps/web && npx tsc --noEmit` shows no new errors in FacilityAddressSelect.tsx, route-form.tsx, or RouteCreateMobile.tsx. Grep confirms createRoute/updateRoute in actions/routes.ts is unchanged.</verify>
  <done>Both forms fetch facilities once and render FacilityAddressSelect for origin, destination, and every stop; facility selection populates the address string + coords; manual mode still works; edit round-trips; tsc clean for touched files; server action untouched.</done>
</task>

</tasks>

<verification>
- Desktop New Route: Origin/Destination/Stop show a facility dropdown + "Enter manually…"; picking a
  facility fills the address and (when lat/lng exist) shows the OSRM distance badge.
- Desktop Edit Route: existing saved addresses round-trip (matched facility preselected; unmatched →
  manual mode showing the saved text).
- Mobile-web New Route: same dropdown behavior with ds tokens.
- `apps/web/src/app/(owner)/actions/routes.ts` has ZERO diff.
- `npx tsc --noEmit` introduces no new errors in the three touched files.
</verification>

<success_criteria>
- Origin, Destination, and each Stop on both route forms are native facility `<select>` controls with
  an "Enter manually…" AddressAutocomplete fallback.
- Facility selection submits the composed address string in the exact existing FormData fields and
  supplies coords (facility lat/lng, geocode fallback, or graceful skip).
- Edit path round-trips correctly.
- createRoute/updateRoute unchanged; typecheck clean for touched files; no deploy, no push.
</success_criteria>

<output>
After completion, create `.planning/quick/476-route-form-facility-dropdown-for-origin-/476-SUMMARY.md`
summarizing the shared component contract, the three replacements per form, and the coords/geocode
fallback behavior. Commit with a `feat(tkt-0078,0079):` message. Do NOT push.
</output>
