---
phase: quick-204
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/carrier/facilities/FacilityForm.tsx
  - apps/web/src/components/carrier/clients/ClientForm.tsx
autonomous: true
must_haves:
  truths:
    - "Typing in Address Line 1 on facility form shows autocomplete suggestions from Nominatim"
    - "Selecting a suggestion auto-fills addressLine1, city, state, zip, and lat/lng on facility form"
    - "Typing in Address Line 1 on client form shows autocomplete suggestions from Nominatim"
    - "Selecting a suggestion auto-fills addressLine1, city, state, zip on client form"
    - "All auto-filled fields remain manually editable after autocomplete selection"
    - "Existing form submission behavior is unchanged"
  artifacts:
    - path: "apps/web/src/components/carrier/facilities/FacilityForm.tsx"
      provides: "AddressAutocomplete integration for facility address"
      contains: "AddressAutocomplete"
    - path: "apps/web/src/components/carrier/clients/ClientForm.tsx"
      provides: "AddressAutocomplete integration for client address"
      contains: "AddressAutocomplete"
  key_links:
    - from: "FacilityForm.tsx"
      to: "@/components/shared/address-autocomplete"
      via: "import AddressAutocomplete"
      pattern: "AddressAutocomplete"
    - from: "ClientForm.tsx"
      to: "@/components/shared/address-autocomplete"
      via: "import AddressAutocomplete"
      pattern: "AddressAutocomplete"
---

<objective>
Replace the plain text Address Line 1 input in carrier FacilityForm and ClientForm with the shared AddressAutocomplete component, auto-populating city, state, zip (and lat/lng for facilities) when a place is selected.

Purpose: Consistent address entry UX across all forms; reduces manual typing errors for facility and client addresses.
Output: Two updated form components with smart address autocomplete.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/shared/address-autocomplete.tsx
@apps/web/src/app/api/geocoding/autocomplete/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add AddressAutocomplete to FacilityForm</name>
  <files>apps/web/src/components/carrier/facilities/FacilityForm.tsx</files>
  <action>
1. Add import: `import { AddressAutocomplete } from '@/components/shared/address-autocomplete';`

2. Add a helper function inside the component (before the return) to parse the Nominatim formatted address string. The format from the API is: `"street, city, state zip"` (comma-separated, state and zip space-separated in last segment). The parser should:
   ```ts
   function parseFormattedAddress(displayName: string) {
     const parts = displayName.split(',').map(s => s.trim());
     const street = parts[0] || '';
     const city = parts.length >= 3 ? parts[1] : '';
     const lastPart = parts[parts.length - 1] || '';
     // Last part is "STATE ZIP" e.g. "Illinois 60601" or just "Illinois"
     const stateZipMatch = lastPart.match(/^([A-Za-z\s]+?)(?:\s+(\d{5}(?:-\d{4})?))?$/);
     const state = stateZipMatch?.[1]?.trim() || '';
     const zip = stateZipMatch?.[2] || '';
     // Map full state names to 2-letter abbreviations for the most common US states
     // For simplicity, just take first 2 chars uppercase if longer than 2 — user can edit
     // Actually: use a simple lookup or just pass through — the field allows editing
     return { street, city, state, zip };
   }
   ```
   NOTE: Nominatim returns full state names (e.g. "Illinois" not "IL"). Since the state field has maxLength=2, convert using a US_STATES lookup map (all 50 states + DC + territories). Define this as a const outside the component. If the state name is not found in the map, pass it through as-is (user can manually correct).

3. Replace the Address Line 1 `<Input>` (lines 261-270) with `<AddressAutocomplete>`:
   ```tsx
   <AddressAutocomplete
     id="addressLine1"
     name="addressLine1"
     defaultValue={values.addressLine1}
     placeholder="123 Main St"
     className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
     onPlaceSelect={(place) => {
       const parsed = parseFormattedAddress(place.displayName);
       setValues((prev) => ({
         ...prev,
         addressLine1: parsed.street || place.displayName,
         city: parsed.city || prev.city,
         state: parsed.state || prev.state,
         zip: parsed.zip || prev.zip,
         latitude: String(place.lat),
         longitude: String(place.lng),
       }));
     }}
   />
   ```
   The className must match the shadcn Input styling since AddressAutocomplete renders a raw `<input>` element that needs identical visual treatment. Copy the exact className from the Input component's styles (check `apps/web/src/components/ui/input.tsx` for the exact classes).

4. IMPORTANT: The AddressAutocomplete component manages its own internal `query` state via `defaultValue`. It does NOT accept a controlled `value` prop — it only reads `defaultValue` on mount. This is fine because:
   - On initial render, `defaultValue={values.addressLine1}` seeds the input
   - When user selects a place, the component updates its own display text AND calls `onPlaceSelect` which updates the form state
   - The form state (`values.addressLine1`) is what gets submitted, and it's updated via `onPlaceSelect`
   - User can also type freely (the component allows manual text entry that gets submitted via the `name` attribute)

5. Keep all other address fields (addressLine2, city, state, zip, country, latitude, longitude) exactly as they are — they remain manually editable `<Input>` components.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm no type errors. Visually verify FacilityForm renders at /carrier/facilities/new.</verify>
  <done>FacilityForm Address Line 1 uses AddressAutocomplete. Selecting a suggestion fills city, state, zip, lat, lng. All fields remain editable. Form submits same shape as before.</done>
</task>

<task type="auto">
  <name>Task 2: Add AddressAutocomplete to ClientForm</name>
  <files>apps/web/src/components/carrier/clients/ClientForm.tsx</files>
  <action>
1. Add import: `import { AddressAutocomplete } from '@/components/shared/address-autocomplete';`

2. Reuse the same `parseFormattedAddress` helper and `US_STATES` abbreviation map. Since both forms need it, either:
   - (a) Duplicate it in ClientForm.tsx (acceptable for 2 files), OR
   - (b) Extract to a tiny utility — but the constraint says only modify these 2 files, so duplicate is the way to go.

3. Replace the Address Line 1 `<Input>` (lines 247-253) with `<AddressAutocomplete>`:
   ```tsx
   <AddressAutocomplete
     id="addressLine1"
     name="addressLine1"
     defaultValue={values.addressLine1}
     placeholder="123 Main St"
     className="[same shadcn Input classes as Task 1]"
     onPlaceSelect={(place) => {
       const parsed = parseFormattedAddress(place.displayName);
       setValues((prev) => ({
         ...prev,
         addressLine1: parsed.street || place.displayName,
         city: parsed.city || prev.city,
         state: parsed.state || prev.state,
         zip: parsed.zip || prev.zip,
       }));
     }}
   />
   ```
   Note: ClientForm does NOT have latitude/longitude fields, so do not set those.

4. Keep all other address fields exactly as they are.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web to confirm no type errors. Visually verify ClientForm renders at /carrier/clients/new.</verify>
  <done>ClientForm Address Line 1 uses AddressAutocomplete. Selecting a suggestion fills city, state, zip. All fields remain editable. Form submits same shape as before.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — zero type errors
2. Navigate to /carrier/facilities/new — type an address in Address Line 1, see dropdown suggestions, select one, verify city/state/zip/lat/lng auto-populate
3. Navigate to /carrier/clients/new — same test, verify city/state/zip auto-populate
4. Edit an existing facility — verify defaultValue populates from existing data
5. Edit an existing client — verify defaultValue populates from existing data
6. Manually edit auto-filled fields — verify they remain editable
7. Submit both forms — verify no regressions in save behavior
</verification>

<success_criteria>
- Both forms show address autocomplete dropdown when typing 3+ characters in Address Line 1
- Selecting a suggestion auto-fills city, state (2-letter abbreviation), zip, and lat/lng (facility only)
- All auto-filled fields remain manually editable
- Form submission payload shape is unchanged
- No TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/204-add-addressautocomplete-to-carrier-facil/204-SUMMARY.md`
</output>
