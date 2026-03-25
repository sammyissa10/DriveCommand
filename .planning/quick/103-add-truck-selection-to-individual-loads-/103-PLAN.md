---
phase: quick-103
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/owner/loads/route.ts
  - apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
  - apps/web/src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts
  - apps/web/src/app/api/mobile/owner/trucks/route.ts
  - packages/api-client/src/owner.ts
  - packages/api-client/src/index.ts
  - apps/mobile/app/(owner)/loads.tsx
  - apps/mobile/app/(owner)/loads/[id].tsx
  - apps/mobile/components/owner/TruckPickerSheet.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can see a list of their loads on mobile"
    - "Owner can tap a load to see full details including currently assigned truck"
    - "Owner can open a truck picker and assign/change the truck on a load"
    - "Drivers still see truck as read-only (no regression)"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/loads/route.ts"
      provides: "GET owner loads list"
      exports: ["GET"]
    - path: "apps/web/src/app/api/mobile/owner/loads/[id]/route.ts"
      provides: "GET owner load detail"
      exports: ["GET"]
    - path: "apps/web/src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts"
      provides: "PATCH assign truck to load"
      exports: ["PATCH"]
    - path: "apps/web/src/app/api/mobile/owner/trucks/route.ts"
      provides: "GET trucks for tenant"
      exports: ["GET"]
    - path: "packages/api-client/src/owner.ts"
      provides: "ownerApi client methods"
    - path: "apps/mobile/components/owner/TruckPickerSheet.tsx"
      provides: "Bottom sheet truck picker UI"
  key_links:
    - from: "apps/mobile/app/(owner)/loads/[id].tsx"
      to: "/api/mobile/owner/loads/[id]/assign-truck"
      via: "ownerApi.assignTruck"
      pattern: "ownerApi\\.assignTruck"
    - from: "apps/mobile/app/(owner)/loads/[id].tsx"
      to: "TruckPickerSheet"
      via: "import and render"
      pattern: "TruckPickerSheet"
---

<objective>
Add truck selection to individual loads on the mobile owner portal.

Purpose: Owners need to assign or change the truck on a load from their mobile device. Currently the owner loads screen is a stub placeholder and no owner-specific mobile API exists. This plan creates the full vertical slice: owner API endpoints, API client, loads list, load detail screen with truck picker bottom sheet.

Output: Working owner loads list + load detail with truck assignment via bottom sheet picker.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/auth/mobile-auth.ts (MobileAuthContext has role field - use role === 'OWNER' check)
@apps/web/src/app/api/mobile/driver/loads/route.ts (pattern for load list endpoint)
@apps/web/src/app/api/mobile/driver/loads/[id]/route.ts (pattern for load detail endpoint)
@packages/api-client/src/driver.ts (pattern for API client module - follow driverApi style)
@packages/api-client/src/client.ts (apiRequest helper)
@apps/mobile/app/(driver)/loads/[id].tsx (pattern for load detail screen UI)
@apps/mobile/components/ui/BottomSheet.tsx (existing BottomSheet component to reuse)
@apps/mobile/context/AuthContext.tsx (useAuthContext provides user with role field)
@packages/types/src/index.ts (AuthUser has role: UserRole, Truck type exists)
@apps/web/prisma/schema.prisma (Load model has truckId FK, Truck model schema)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Owner mobile API endpoints (loads + trucks + assign-truck)</name>
  <files>
    apps/web/src/app/api/mobile/owner/loads/route.ts
    apps/web/src/app/api/mobile/owner/loads/[id]/route.ts
    apps/web/src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts
    apps/web/src/app/api/mobile/owner/trucks/route.ts
  </files>
  <action>
    Create 4 new API routes under `/api/mobile/owner/`. All follow the same auth pattern as driver routes but check `auth.role !== 'OWNER'` returning 403 if not owner. Use `validateMobileToken` from `@/lib/auth/mobile-auth`. Use `prisma.$transaction` with `TX_OPTIONS` and `set_config('app.bypass_rls', 'on', TRUE)` exactly like the driver routes.

    1. **GET /api/mobile/owner/loads** (`route.ts`)
       - Accept `?status=active|history` query param (same logic as driver loads route)
       - Query `prisma.load.findMany` where `tenantId` matches auth, NOT filtered by driverId (owner sees all tenant loads)
       - Include `customer: { select: { id, companyName } }` and `truck: { select: { id, make, model, licensePlate } }`
       - Also include `driver: { select: { id, name } }` so owner can see which driver is assigned
       - Filter `archivedAt: null`, order by `updatedAt desc`
       - Return the loads array

    2. **GET /api/mobile/owner/loads/[id]** (`[id]/route.ts`)
       - Validate owner role, fetch single load by id + tenantId
       - Include customer, truck, driver (name, id), route with stops (ordered by position asc)
       - Flatten stops to top level (same pattern as driver load detail)
       - Return 404 if not found. No driverId check (owner can see any tenant load)

    3. **PATCH /api/mobile/owner/loads/[id]/assign-truck** (`[id]/assign-truck/route.ts`)
       - Accept JSON body: `{ truckId: string | null }` (null to unassign)
       - Validate owner role
       - If truckId is provided, verify the truck exists and belongs to same tenantId (query truck first, 404 if not found)
       - Update `prisma.load.update({ where: { id, tenantId }, data: { truckId } })`
       - Return updated load with truck included: `{ success: true, load: { ...updatedLoad } }`
       - Return 404 if load not found

    4. **GET /api/mobile/owner/trucks** (`trucks/route.ts`)
       - Validate owner role
       - Query `prisma.truck.findMany` where `tenantId`, `archivedAt: null`
       - Select: id, make, model, year, licensePlate, inMaintenance
       - Order by make asc, model asc
       - Return trucks array
  </action>
  <verify>
    Run `npx tsc --noEmit` from `apps/web` to verify no TypeScript errors in the new route files.
  </verify>
  <done>
    Four owner API endpoints exist and compile. Owner role is enforced on all routes. Loads list returns all tenant loads with truck+driver info. Load detail returns full load with stops. Assign-truck PATCH updates truckId. Trucks list returns tenant fleet.
  </done>
</task>

<task type="auto">
  <name>Task 2: Owner API client + loads list and detail screens with truck picker</name>
  <files>
    packages/api-client/src/owner.ts
    packages/api-client/src/index.ts
    apps/mobile/app/(owner)/loads.tsx
    apps/mobile/app/(owner)/loads/[id].tsx
    apps/mobile/components/owner/TruckPickerSheet.tsx
  </files>
  <action>
    **A. Owner API client** (`packages/api-client/src/owner.ts`):
    Follow the exact pattern of `driver.ts`. Create and export `ownerApi` object with methods:
    - `getLoads(token, status: 'active' | 'history')` — GET `/api/mobile/owner/loads?status=...`
    - `getLoad(token, id)` — GET `/api/mobile/owner/loads/{id}`
    - `assignTruck(token, loadId, truckId: string | null)` — PATCH `/api/mobile/owner/loads/{loadId}/assign-truck` with `{ truckId }` body
    - `getTrucks(token)` — GET `/api/mobile/owner/trucks`

    Define types in the same file (matching driver.ts pattern):
    - `OwnerLoadSummary` — same as LoadSummary but add `truck: { id, make, model, licensePlate } | null` and `driver: { id, name } | null`
    - `OwnerLoadDetail` — same as LoadDetail but add `driver: { id, name } | null`
    - `TruckOption` — `{ id, make, model, year, licensePlate, inMaintenance }`

    Update `packages/api-client/src/index.ts`: export `ownerApi` and its types.

    **B. Owner loads list** (`apps/mobile/app/(owner)/loads.tsx`):
    Replace the stub with a real loads list. Use `useAuthContext` for token, `useQuery` with `ownerApi.getLoads`. Follow the driver loads list pattern but simpler:
    - Show active loads by default, toggle to history via two tab-style Pressable buttons at top
    - Each load card: loadNumber, status badge (reuse `getStatusBadge` logic from driver detail or inline), origin -> destination, customer name, assigned truck (if any) or "No truck" in muted text, assigned driver name (if any)
    - Each card is a Pressable that navigates to `/(owner)/loads/[id]`
    - Use FlashList from `@shopify/flash-list` for the list
    - Loading spinner, empty state, error state with retry
    - Dark theme: bg-slate-900, cards bg-slate-800 border-slate-700 (matching driver screens)

    **C. Owner load detail** (`apps/mobile/app/(owner)/loads/[id].tsx`):
    Create as a new file (this is under the owner layout, separate from driver's `[id].tsx`). Model closely on the driver's load detail screen but:
    - Use `ownerApi.getLoad` instead of `driverApi.getLoad`
    - In the "Assigned Truck" card section, add a "Change Truck" button (Pressable, sky-500 bg, rounded-lg, py-2 px-4). If no truck assigned, show "Assign Truck" button instead.
    - Pressing the button opens `TruckPickerSheet`
    - NO StatusUpdateButton (that's driver-only). Instead show status as read-only badge.
    - Show driver name if assigned (InfoField "Assigned Driver")
    - On successful truck assignment, invalidate the `['owner-load', id]` query to refetch

    **D. TruckPickerSheet** (`apps/mobile/components/owner/TruckPickerSheet.tsx`):
    A bottom sheet component using the existing `BottomSheet` from `components/ui/BottomSheet.tsx`:
    - Props: `visible`, `onClose`, `loadId`, `currentTruckId: string | null`, `onAssigned: () => void`
    - On open, fetch trucks via `ownerApi.getTrucks` using useQuery
    - Render a ScrollView list of truck options. Each row: make + model, licensePlate, year. If `inMaintenance`, show a warning badge "In Maintenance" (still selectable but flagged).
    - Currently selected truck has a checkmark icon and sky-500 border highlight
    - Add an "Unassign" option at top if a truck is currently assigned (sets truckId to null)
    - On tap, call `ownerApi.assignTruck(token, loadId, truckId)` via useMutation from react-query
    - Show loading state on the tapped row during mutation
    - On success: call `onAssigned()`, close sheet, show success toast via `react-native-toast-message` (Toast.show)
    - On error: show error toast
    - Use snapPoint="60%"

    **E. Expo Router setup**: The `(owner)/loads.tsx` file currently exists as a tab screen. The new `(owner)/loads/[id].tsx` needs expo-router to handle it. Rename `(owner)/loads.tsx` to `(owner)/loads/index.tsx` (move it into a loads directory) so that `loads/[id]` routing works. The tab in `_layout.tsx` already points to `name="loads"` which will resolve to `loads/index` automatically with Expo Router's directory-based routing.
  </action>
  <verify>
    1. Run `npx tsc --noEmit` from the monorepo root to check TypeScript compiles
    2. Run `cd apps/mobile && npx expo export --platform android --dump-sourcemap=false 2>&1 | tail -5` to verify the mobile bundle compiles without errors (or `npx expo start` and check for errors in the terminal)
  </verify>
  <done>
    Owner loads tab shows list of all tenant loads with truck/driver info. Tapping a load opens detail screen. Detail screen shows "Assign Truck" or "Change Truck" button. Bottom sheet lists all tenant trucks. Selecting a truck calls PATCH API and updates the load. Driver load detail is unchanged (read-only truck display).
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles with no errors across web and mobile
2. Owner loads list displays loads fetched from `/api/mobile/owner/loads`
3. Owner load detail shows full load info with truck assignment button
4. Truck picker bottom sheet lists trucks from `/api/mobile/owner/trucks`
5. Selecting a truck calls PATCH and updates the displayed truck
6. Driver load detail screen (`(driver)/loads/[id].tsx`) is completely unmodified
</verification>

<success_criteria>
- Owner can navigate to Loads tab, see all tenant loads with status/truck/driver info
- Owner can tap a load, see full detail, and tap "Assign Truck" / "Change Truck"
- Bottom sheet shows available trucks, owner taps one, truck is assigned via API
- Success toast confirms assignment, detail screen reflects new truck
- Driver screens are unaffected (read-only truck display preserved)
</success_criteria>

<output>
After completion, create `.planning/quick/103-add-truck-selection-to-individual-loads-/103-SUMMARY.md`
</output>
