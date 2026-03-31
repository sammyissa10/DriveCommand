---
phase: quick-140
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts
  - packages/api-client/src/owner.ts
  - apps/mobile/app/(owner)/drivers/[id].tsx
  - apps/mobile/app/(owner)/more/trucks/[id].tsx
autonomous: true

must_haves:
  truths:
    - "Owner can edit driver name and license number from driver detail screen"
    - "Owner can edit truck make, model, year, plate, and VIN from truck detail screen"
    - "Edits persist across page refresh (saved to database)"
    - "Load detail screen already has edit actions — no changes needed"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts"
      provides: "PATCH endpoint for driver updates"
      exports: ["PATCH"]
    - path: "apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts"
      provides: "PATCH endpoint for truck updates"
      exports: ["PATCH"]
    - path: "packages/api-client/src/owner.ts"
      provides: "updateDriver and updateTruck client methods"
    - path: "apps/mobile/app/(owner)/drivers/[id].tsx"
      provides: "Edit button + edit bottom sheet for driver fields"
    - path: "apps/mobile/app/(owner)/more/trucks/[id].tsx"
      provides: "Edit button + edit bottom sheet for truck fields"
  key_links:
    - from: "apps/mobile/app/(owner)/drivers/[id].tsx"
      to: "/api/mobile/owner/drivers/[id]"
      via: "ownerApi.updateDriver"
      pattern: "ownerApi\\.updateDriver"
    - from: "apps/mobile/app/(owner)/more/trucks/[id].tsx"
      to: "/api/mobile/owner/trucks/[id]"
      via: "ownerApi.updateTruck"
      pattern: "ownerApi\\.updateTruck"
---

<objective>
Add edit capabilities to the mobile owner portal's Driver and Truck detail screens.

Purpose: Owners currently must use the web app to edit driver or truck info. This adds inline editing via bottom sheets on the mobile detail screens, matching the existing pattern used for load status/driver/truck assignment.

Output: PATCH API routes for drivers and trucks, api-client methods, and edit bottom sheets on both detail screens.

NOTE: The Load detail screen (`apps/mobile/app/(owner)/loads/[id].tsx`) already has full edit actions (status change, driver assignment, truck assignment, cancel) via bottom sheets. No work needed there.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/mobile/app/(owner)/drivers/[id].tsx
@apps/mobile/app/(owner)/more/trucks/[id].tsx
@apps/mobile/app/(owner)/loads/[id].tsx (reference for bottom sheet edit pattern)
@apps/mobile/app/(owner)/drivers/invite.tsx (reference for form styling)
@apps/mobile/app/(owner)/more/invoices/new.tsx (reference for form styling)
@apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts (existing GET, add PATCH)
@apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts (existing GET, add PATCH)
@packages/api-client/src/owner.ts
@apps/web/src/app/(owner)/actions/drivers.ts (web updateDriver — reference for fields)
@apps/web/src/app/(owner)/actions/trucks.ts (web updateTruck — reference for fields)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add PATCH API routes for drivers and trucks + api-client methods</name>
  <files>
    apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts
    apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts
    packages/api-client/src/owner.ts
  </files>
  <action>
    **Driver PATCH endpoint** — Add a `PATCH` export to `apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts`:
    - Auth: `validateMobileToken` + role check `OWNER` + rate limit (same pattern as existing GET)
    - Accept JSON body: `{ firstName?: string, lastName?: string, licenseNumber?: string | null }`
    - These are the only 3 editable User fields on the model (firstName, lastName, licenseNumber). The web updateDriver action confirms this — it only persists these 3 fields despite accepting more in the form.
    - Validate: at least one field must be provided. firstName/lastName must be non-empty strings if provided.
    - Use `prisma.$transaction` with bypass_rls pattern (copy from GET handler above). Update `user` where `{ id, tenantId, role: 'DRIVER' }`.
    - Return `{ success: true, driver: { id, firstName, lastName, licenseNumber } }`.

    **Truck PATCH endpoint** — Add a `PATCH` export to `apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts`:
    - Auth: same pattern as driver (validateMobileToken + OWNER + rate limit)
    - Accept JSON body: `{ make?: string, model?: string, year?: number, licensePlate?: string, vin?: string, odometer?: number }`
    - Validate: at least one field must be provided. Strings non-empty if provided, year 1900-2100, odometer >= 0.
    - Use `prisma.$transaction` with bypass_rls pattern. Update `truck` where `{ id, tenantId, archivedAt: null }`. Set `updatedById: auth.userId`.
    - Return `{ success: true, truck: { id, make, model, year, licensePlate, vin, odometer } }`.

    **API client methods** — Add to `ownerApi` object in `packages/api-client/src/owner.ts`:

    1. Add `UpdateDriverPayload` interface: `{ firstName?: string; lastName?: string; licenseNumber?: string | null }`
    2. Add `UpdateTruckPayload` interface: `{ make?: string; model?: string; year?: number; licensePlate?: string; vin?: string; odometer?: number }`
    3. Add `updateDriver` method:
       ```
       updateDriver: (token: string, id: string, payload: UpdateDriverPayload) =>
         apiRequest<{ success: boolean; driver: { id: string; firstName: string; lastName: string; licenseNumber: string | null } }>(
           `/api/mobile/owner/drivers/${id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }
         ),
       ```
    4. Add `updateTruck` method:
       ```
       updateTruck: (token: string, id: string, payload: UpdateTruckPayload) =>
         apiRequest<{ success: boolean; truck: { id: string; make: string; model: string; year: number; licensePlate: string; vin: string; odometer: number } }>(
           `/api/mobile/owner/trucks/${id}`, { method: 'PATCH', token, body: JSON.stringify(payload) }
         ),
       ```
    5. Export the new payload types alongside existing exports.

    Place methods near related existing methods (updateDriver near getDriverDetail, updateTruck near getTruck).
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Run `cd packages/api-client && npx tsc --noEmit` — no type errors.
  </verify>
  <done>
    PATCH /api/mobile/owner/drivers/[id] accepts firstName, lastName, licenseNumber and persists to DB.
    PATCH /api/mobile/owner/trucks/[id] accepts make, model, year, licensePlate, vin, odometer and persists to DB.
    ownerApi.updateDriver and ownerApi.updateTruck are exported and typed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add edit bottom sheet to Driver detail screen</name>
  <files>apps/mobile/app/(owner)/drivers/[id].tsx</files>
  <action>
    Add an "Edit Driver" bottom sheet to the driver detail screen, following the exact pattern of `StatusPickerSheet` and `DriverPickerSheet` in `loads/[id].tsx`.

    **Edit button** — Add an Edit button (Pencil icon from lucide-react-native) in the nav bar header, to the left of the ComplianceIcon. Use the same Pressable style as other header actions. On press, open the edit sheet and populate form state from current `data`.

    **EditDriverSheet component** — Create inline in the same file (same pattern as StatusPickerSheet):
    - Props: `visible`, `onClose`, `initialData: { firstName, lastName, licenseNumber }`, `onSave: (payload) => void`, `isPending: boolean`
    - Uses `BottomSheet` component with `snapPoint="70%"` and `title="Edit Driver"`
    - Contains a `KeyboardAvoidingView` wrapping a `ScrollView` (needed because form fields)
    - Local state for `firstName`, `lastName`, `licenseNumber` — initialized from `initialData` via `useEffect` when `visible` changes to true
    - Form fields use the inline style pattern from `invite.tsx` (inputStyle/labelStyle objects, NOT NativeWind className — match the existing file's pattern):
      - First Name (required) + Last Name (required) side by side in a row
      - License Number (optional)
    - Save button: sky-600 background, full-width, "Save Changes" label, shows ActivityIndicator when isPending
    - Disable all fields and the back button while isPending

    **Mutation** — Add a `useMutation` calling `ownerApi.updateDriver(token!, id!, payload)`:
    - onSuccess: `haptic.success()`, invalidate queries `['owner-driver-detail', id]` and `['owner-drivers']`, show success Toast, close sheet
    - onError: `haptic.error()`, show error Toast

    **Parse name for initial values** — The API returns a single `name` string. Parse it for the form: split on whitespace, first token = firstName, rest joined = lastName. If only one token, firstName = that, lastName = ''.

    Import additions: `useState` (already imported), `useMutation` and `useQueryClient` from `@tanstack/react-query`, `Pencil` from `lucide-react-native`, `ActivityIndicator` and `KeyboardAvoidingView` and `Platform` and `TextInput` from `react-native`, `BottomSheet` from `../../../components/ui/BottomSheet`, `ownerApi` from `@drivecommand/api-client` (already partially imported — add `ownerApi` to existing import), `Toast` from `react-native-toast-message`.
  </action>
  <verify>
    Run `cd apps/mobile && npx tsc --noEmit` — no type errors in the driver detail file.
    Visually: the edit pencil icon appears in the header, tapping it opens a bottom sheet with pre-filled name and license fields, saving calls the API.
  </verify>
  <done>
    Driver detail screen has an Edit button in the header that opens a bottom sheet with firstName, lastName, licenseNumber fields. Saving persists changes and refreshes the detail view.
  </done>
</task>

<task type="auto">
  <name>Task 3: Add edit bottom sheet to Truck detail screen</name>
  <files>apps/mobile/app/(owner)/more/trucks/[id].tsx</files>
  <action>
    Add an "Edit Truck" bottom sheet to the truck detail screen, following the same pattern established in Task 2.

    **Edit button** — Add an Edit button (Pencil icon from lucide-react-native) in the header bar, placed after the status pill (right side). Use a Pressable with `active:opacity-75` className. On press, open the edit sheet and populate form state from current `truck` data.

    **EditTruckSheet component** — Create inline in the same file:
    - Props: `visible`, `onClose`, `initialData: { make, model, year, licensePlate, vin, odometer }`, `onSave: (payload) => void`, `isPending: boolean`
    - Uses `BottomSheet` with `snapPoint="85%"` (more fields, needs more space) and `title="Edit Truck"`
    - Contains a `KeyboardAvoidingView` wrapping a `ScrollView`
    - Local state for each field, initialized from `initialData` via `useEffect` when `visible` changes to true
    - Use NativeWind className pattern (matching this file's existing style — it uses `className` unlike invite.tsx):
      - Make + Model in a row (flex-row gap-3, each flex-1)
      - Year + License Plate in a row
      - VIN full width
      - Odometer full width, keyboardType="numeric"
    - Input styling: `bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm` (matches `inputClass` from invoices/new.tsx)
    - Label styling: `text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1.5`
    - Save button: `bg-sky-600 rounded-xl py-4 items-center`, "Save Changes" label, ActivityIndicator when isPending
    - Year and odometer stored as strings in local state, parsed to number on save

    **Mutation** — Add a `useMutation` calling `ownerApi.updateTruck(token!, id!, payload)`:
    - Build payload: only include fields that changed from initial values (compare each field)
    - onSuccess: `haptic.success()`, invalidate queries `['owner-truck', id]` and `['owner-trucks']`, show success Toast, close sheet
    - onError: `haptic.error()`, show error Toast

    Import additions: `useState` (add to existing React import), `useMutation` and `useQueryClient` from `@tanstack/react-query` (useQuery already imported — add these), `Pencil` from `lucide-react-native`, `KeyboardAvoidingView`, `Platform`, `TextInput` from `react-native` (add to existing import), `BottomSheet` from `../../../../components/ui/BottomSheet`, `ownerApi` and `type TruckDetail` (TruckDetail already imported — add ownerApi), `Toast` from `react-native-toast-message`, `haptic` from `../../../../lib/haptics`.
  </action>
  <verify>
    Run `cd apps/mobile && npx tsc --noEmit` — no type errors in the truck detail file.
    Visually: the edit pencil icon appears in the header, tapping it opens a bottom sheet with pre-filled truck fields, saving calls the API.
  </verify>
  <done>
    Truck detail screen has an Edit button in the header that opens a bottom sheet with make, model, year, licensePlate, vin, odometer fields. Saving persists changes and refreshes the detail view.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes (API routes type-check)
2. `cd packages/api-client && npx tsc --noEmit` passes (client methods type-check)
3. `cd apps/mobile && npx tsc --noEmit` passes (mobile screens type-check)
4. Manual test: Open driver detail -> tap edit pencil -> see pre-filled fields -> change name -> save -> detail refreshes with new name
5. Manual test: Open truck detail -> tap edit pencil -> see pre-filled fields -> change plate -> save -> detail refreshes with new plate
</verification>

<success_criteria>
- PATCH /api/mobile/owner/drivers/[id] works and updates firstName, lastName, licenseNumber
- PATCH /api/mobile/owner/trucks/[id] works and updates make, model, year, licensePlate, vin, odometer
- Driver detail screen shows edit pencil, opens bottom sheet with pre-filled form, saves successfully
- Truck detail screen shows edit pencil, opens bottom sheet with pre-filled form, saves successfully
- All TypeScript checks pass across web, api-client, and mobile packages
- Load detail screen is unchanged (already has edit actions)
</success_criteria>

<output>
After completion, create `.planning/quick/140-mobile-owner-portal-add-edit-actions-to-/140-SUMMARY.md`
</output>
