---
phase: quick-104
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(owner)/actions/loads.ts
  - apps/web/src/components/loads/change-truck-modal.tsx
  - apps/web/src/app/(owner)/loads/[id]/page.tsx
  - apps/web/src/app/api/mobile/owner/fleet-positions/route.ts
  - packages/api-client/src/owner.ts
  - apps/mobile/app/(owner)/map.tsx
autonomous: true
must_haves:
  truths:
    - "Owner can change the truck assigned to a dispatched load from the web load detail page"
    - "Owner sees live driver/truck positions on the mobile fleet map tab"
  artifacts:
    - path: "apps/web/src/components/loads/change-truck-modal.tsx"
      provides: "Modal UI for changing truck assignment"
    - path: "apps/web/src/app/api/mobile/owner/fleet-positions/route.ts"
      provides: "Mobile API endpoint returning latest GPS positions with driver/load info"
    - path: "apps/mobile/app/(owner)/map.tsx"
      provides: "Live map with truck markers showing driver name, plate, load number"
  key_links:
    - from: "apps/web/src/components/loads/change-truck-modal.tsx"
      to: "apps/web/src/app/(owner)/actions/loads.ts"
      via: "server action reassignTruck"
      pattern: "reassignTruck"
    - from: "apps/mobile/app/(owner)/map.tsx"
      to: "/api/mobile/owner/fleet-positions"
      via: "apiClient fetch with polling"
      pattern: "fleet-positions"
---

<objective>
Two features in one plan:

1. **Edit Truck on Web Load Detail** — Add a "Change Truck" button in the Assignment card on the web load detail page. Clicking it opens a modal (following the dispatch-modal pattern) with a truck dropdown. Submits via a new `reassignTruck` server action. Available for DISPATCHED, PICKED_UP, IN_TRANSIT statuses (not PENDING — use dispatch, not DELIVERED/INVOICED/CANCELLED — locked).

2. **Fleet Map with Live Driver Positions (Mobile)** — Replace the stub owner map screen with a react-native-maps MapView showing markers for each active truck's latest GPS position. Each marker callout shows driver name, truck plate, and current load number. Add a new mobile API endpoint GET /api/mobile/owner/fleet-positions that queries GPSLocation DISTINCT ON truckId (reusing the pattern from the web live-map actions) and joins driver + active load info. Poll every 30 seconds.

Purpose: Owners need to reassign trucks mid-route and see where their fleet is from mobile.
Output: Working change-truck modal on web, working fleet map on mobile.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(owner)/loads/[id]/page.tsx
@apps/web/src/app/(owner)/actions/loads.ts
@apps/web/src/components/loads/dispatch-modal.tsx
@apps/web/src/app/(owner)/live-map/actions.ts
@apps/web/src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts
@apps/web/src/lib/auth/mobile-auth.ts
@packages/api-client/src/owner.ts
@apps/mobile/app/(owner)/map.tsx
@apps/mobile/package.json
@apps/web/prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Web — Change Truck modal and server action on load detail</name>
  <files>
    apps/web/src/app/(owner)/actions/loads.ts
    apps/web/src/components/loads/change-truck-modal.tsx
    apps/web/src/app/(owner)/loads/[id]/page.tsx
  </files>
  <action>
1. In `apps/web/src/app/(owner)/actions/loads.ts`, add a `reassignTruck` server action:
   - Signature: `export async function reassignTruck(loadId: string, prevState: any, formData: FormData)`
   - Requires OWNER or MANAGER role (use `requireRole([UserRole.OWNER, UserRole.MANAGER])`)
   - Reads `truckId` from formData. Validate it is a non-empty string.
   - Fetches the load, verifies status is one of DISPATCHED, PICKED_UP, IN_TRANSIT (return error otherwise).
   - Updates `load.truckId` to the new truckId. Also sets `updatedById` to current user.
   - Calls `revalidatePath('/loads')` and `revalidatePath(\`/loads/${loadId}\`)`.
   - Returns `{ success: true }` or `{ error: string }`.

2. Create `apps/web/src/components/loads/change-truck-modal.tsx` — a client component:
   - Follow the exact same modal pattern as `dispatch-modal.tsx` (backdrop, card, escape key, useActionState).
   - Props: `{ loadId: string, currentTruckId: string | null, trucks: Array<{ id: string; make: string; model: string; licensePlate: string }>, reassignAction: (loadId: string, prevState: any, formData: FormData) => Promise<any> }`
   - Trigger button: small outline button with Truck icon and text "Change Truck" (use the same outline style as the Edit button on the page).
   - Modal content: single `<select name="truckId">` dropdown listing trucks (pre-select currentTruckId). Submit button says "Save" / "Saving...".
   - On success (state?.success), close the modal automatically.
   - Use the same inputClass/labelClass constants from dispatch-modal.

3. Update `apps/web/src/app/(owner)/loads/[id]/page.tsx`:
   - Import `ChangeTruckModal` and `reassignTruck`.
   - Expand the truck-fetching logic: currently trucks are only fetched when `load.status === 'PENDING'`. Change this so trucks are ALSO fetched when status is DISPATCHED, PICKED_UP, or IN_TRANSIT (the statuses where truck reassignment is allowed). Keep the existing PENDING fetch for the dispatch modal.
   - In the Assignment card, after the truck `<dd>` line showing plate, add the `<ChangeTruckModal>` component. Only render it when status is DISPATCHED, PICKED_UP, or IN_TRANSIT. Pass `reassignTruck.bind(null, id)` as the action, `load.truck?.id ?? null` as currentTruckId, and `availableTrucks` as trucks.
  </action>
  <verify>
    Run `npx tsc --noEmit -p apps/web/tsconfig.json` (or the project's type-check command). Load detail page renders without errors. The "Change Truck" button appears on a dispatched load's assignment card.
  </verify>
  <done>
    On a dispatched/picked-up/in-transit load detail page, a "Change Truck" button appears in the Assignment card. Clicking it opens a modal with a truck dropdown. Selecting a different truck and clicking Save updates the truck assignment. The page refreshes to show the new truck.
  </done>
</task>

<task type="auto">
  <name>Task 2: Mobile — Fleet positions API endpoint and live map screen</name>
  <files>
    apps/web/src/app/api/mobile/owner/fleet-positions/route.ts
    packages/api-client/src/owner.ts
    apps/mobile/app/(owner)/map.tsx
  </files>
  <action>
1. Create `apps/web/src/app/api/mobile/owner/fleet-positions/route.ts`:
   - GET endpoint, authenticated via `validateMobileToken(req)` from `@/lib/auth/mobile-auth`.
   - Require OWNER role (return 403 if not).
   - Use `prisma.$transaction` with bypass_rls pattern (same as assign-truck route).
   - Raw SQL query (reuse the pattern from `apps/web/src/app/(owner)/live-map/actions.ts` getLatestVehicleLocations):
     ```sql
     SELECT DISTINCT ON (gps."truckId")
       gps."truckId", gps.latitude, gps.longitude, gps.speed, gps.heading, gps.timestamp,
       t.make, t.model, t."licensePlate",
       u."firstName" AS "driverFirstName", u."lastName" AS "driverLastName",
       l."loadNumber"
     FROM "GPSLocation" gps
     INNER JOIN "Truck" t ON gps."truckId" = t.id
     LEFT JOIN "Load" l ON l."truckId" = t.id AND l."tenantId" = gps."tenantId"
       AND l.status IN ('DISPATCHED', 'PICKED_UP', 'IN_TRANSIT')
       AND l."archivedAt" IS NULL
     LEFT JOIN "User" u ON l."driverId" = u.id
     WHERE gps."tenantId" = $tenantId::uuid
     ORDER BY gps."truckId", gps.timestamp DESC
     ```
   - Map results to JSON: `{ truckId, latitude (Number), longitude (Number), speed, heading, timestamp, truck: { make, model, licensePlate }, driverName (string|null), loadNumber (string|null) }`.
   - Return JSON array.

2. Add to `packages/api-client/src/owner.ts`:
   - Add `FleetPosition` interface matching the API response shape.
   - Add `getFleetPositions: (token: string) => apiRequest<FleetPosition[]>('/api/mobile/owner/fleet-positions', { token })` to the `ownerApi` object.

3. Replace `apps/mobile/app/(owner)/map.tsx` stub with a full implementation:
   - Import `MapView, Marker, Callout, PROVIDER_GOOGLE` from `react-native-maps` and `react-native-map-clustering` for `ClusteredMapView` (but since we may have few trucks, use plain MapView).
   - Use `useQuery` from `@tanstack/react-query` with `queryKey: ['fleet-positions']`, `queryFn` calling `ownerApi.getFleetPositions(token)`, `refetchInterval: 30000` for 30-second polling.
   - Get auth token from session storage (follow the pattern used in other owner screens — check `apps/mobile/app/(owner)/loads/index.tsx` for the pattern).
   - Render a `MapView` filling the screen (`style={{ flex: 1 }}`), with `initialRegion` centered on the US (lat 39.8, lng -98.5, latDelta 30, lngDelta 30). If positions exist, fit the map to the markers.
   - For each position, render a `<Marker>` at `{ latitude, longitude }`.
   - Each Marker has a `<Callout>` showing: truck plate (bold), driver name (or "No driver"), load number (or "No active load"), and last-updated time (relative, e.g., "2 min ago").
   - Show a loading spinner (ActivityIndicator) while data is loading.
   - Show an empty state message "No active vehicles" if the array is empty.
   - Use NativeWind/Tailwind classes for callout text styling where possible, fall back to inline styles for MapView specifics.
   - Wrap MapView in ScreenWrapper but WITHOUT scroll (just flex-1).
  </action>
  <verify>
    Run `npx tsc --noEmit` in apps/mobile to type-check. Start the dev server and confirm the map tab renders a MapView. If GPS data exists in the database, markers should appear.
  </verify>
  <done>
    The mobile owner map tab shows a full-screen MapView with markers for each truck that has GPS data. Each marker callout displays the truck plate, driver name, load number, and last ping time. The map auto-refreshes every 30 seconds. The API endpoint returns the latest GPS position per truck with driver and load context.
  </done>
</task>

</tasks>

<verification>
- Web: Navigate to a dispatched load's detail page. The Assignment card shows a "Change Truck" button. Clicking it opens a modal with a truck dropdown. Selecting a new truck and saving updates the assignment.
- Mobile: Open the owner portal map tab. A MapView renders. If any trucks have GPS data, markers appear with callouts showing truck/driver/load info.
- Type-check passes for both apps/web and apps/mobile.
</verification>

<success_criteria>
1. Change Truck modal works end-to-end on web load detail for DISPATCHED/PICKED_UP/IN_TRANSIT loads
2. Mobile fleet map shows live truck positions with 30-second polling
3. Each map marker callout shows truck plate, driver name, and load number
4. No TypeScript errors in either app
</success_criteria>

<output>
After completion, create `.planning/quick/104-edit-truck-on-load-fleet-map-live-driver/104-SUMMARY.md`
</output>
