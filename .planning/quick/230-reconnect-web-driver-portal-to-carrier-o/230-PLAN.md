---
phase: quick-230
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(driver)/actions/driver-routes.ts
  - apps/web/src/app/(driver)/actions/driver-load.ts
  - apps/web/src/app/(driver)/my-route/page.tsx
  - apps/web/src/app/(driver)/my-load/page.tsx
  - apps/web/src/app/(driver)/page.tsx
  - apps/web/src/app/(driver)/layout.tsx
  - apps/web/src/components/driver/route-detail-readonly.tsx
  - apps/web/src/components/driver/completed-route-history.tsx
  - apps/web/src/components/driver/load-status-button.tsx
  - apps/web/src/components/driver/completed-load-history.tsx
autonomous: true
must_haves:
  truths:
    - "Driver sees their active Carrier Ops dispatch on the Route tab with stops timeline"
    - "Driver sees loads from their active dispatch on the Load tab"
    - "Driver can start a trip (planned -> in_progress) from the Route tab"
    - "Driver can complete stops from the Route tab"
    - "Completed dispatches appear in the history section"
    - "Hours, Report, Support, and Messages tabs are unchanged"
  artifacts:
    - path: "apps/web/src/app/(driver)/actions/driver-routes.ts"
      provides: "getMyActiveDispatch, getMyDispatchHistory server actions querying CarrierDispatch"
    - path: "apps/web/src/app/(driver)/actions/driver-load.ts"
      provides: "getMyLoads server action querying CarrierLoad via active dispatches"
    - path: "apps/web/src/app/(driver)/my-route/page.tsx"
      provides: "Route tab rendering CarrierDispatch data with stops timeline"
    - path: "apps/web/src/app/(driver)/my-load/page.tsx"
      provides: "Load tab rendering CarrierLoad data from active dispatches"
  key_links:
    - from: "driver-routes.ts"
      to: "CarrierDispatch + CarrierStop + CarrierFacility"
      via: "prisma query with carrier_drivers user_id join"
      pattern: "carrierDriver.*userId.*carrierDispatch"
    - from: "my-route/page.tsx"
      to: "transitionDispatchStatus + completeStop + arriveStop"
      via: "server action wrappers calling existing lib functions"
      pattern: "transitionDispatchStatus|completeStop|arriveStop"
---

<objective>
Reconnect the web driver portal Route and Load tabs to Carrier Ops data (CarrierDispatch, CarrierStop, CarrierLoad tables) instead of the legacy Route/Load tables which are now empty.

Purpose: The driver currently sees "No route assigned" because the portal queries empty legacy tables. All dispatch data lives in the Carrier Ops tables (dispatches, stops, loads).
Output: Working Route and Load tabs showing real Carrier Ops dispatch data with Start Trip and Complete Stop actions.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma (CarrierDispatch lines 1501-1542, CarrierStop 1592-1635, CarrierLoad 1544-1590, CarrierDriver 1369-1402, CarrierFacility 1336-1367)
@apps/web/src/lib/carrier/dispatches.ts (transitionDispatchStatus function)
@apps/web/src/lib/carrier/stop-completion.ts (completeStop, arriveStop functions)
@apps/web/src/app/(driver)/actions/driver-routes.ts (current — queries legacy Route table)
@apps/web/src/app/(driver)/actions/driver-load.ts (current — queries legacy Load table)
@apps/web/src/app/(driver)/my-route/page.tsx (current route page)
@apps/web/src/app/(driver)/my-load/page.tsx (current load page)
@apps/web/src/app/(driver)/page.tsx (driver home — redirects to /my-route if route found)
@apps/web/src/app/(driver)/layout.tsx (layout — gets truckId for GPS)
@apps/web/src/components/driver/route-detail-readonly.tsx (current component — needs rewrite for Carrier Ops shape)
@apps/web/src/components/driver/load-status-button.tsx (reusable status button)
@apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts (reference: how mobile queries carrier driver dispatches)
@apps/web/src/lib/auth/supabase.ts (getSession, requireRole, getCurrentUser)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rewrite server actions to query Carrier Ops tables</name>
  <files>
    apps/web/src/app/(driver)/actions/driver-routes.ts
    apps/web/src/app/(driver)/actions/driver-load.ts
    apps/web/src/app/(driver)/layout.tsx
    apps/web/src/app/(driver)/page.tsx
  </files>
  <action>
Rewrite `driver-routes.ts` to query Carrier Ops tables instead of legacy Route/Load tables. The core pattern for resolving the driver identity is:

1. `getSession()` returns `{ userId, tenantId }` from session cookie
2. Look up `carrierDriver` via `prisma.carrierDriver.findFirst({ where: { userId: session.userId, orgId: session.tenantId } })`
3. Use `carrierDriver.id` as `primaryDriverId` when querying `carrierDispatch`

All queries MUST use `prisma.$transaction` with bypass_rls (same pattern as layout.tsx and mobile API), since the driver-scoped server actions use `requireRole` + `getSession` but the Carrier Ops tables use RLS.

**New functions in driver-routes.ts:**

`getMyActiveDispatch()`:
- requireRole([DRIVER]), getSession()
- In a transaction with bypass_rls:
  - Find carrierDriver by userId + orgId
  - Find first carrierDispatch WHERE primaryDriverId = carrierDriver.id AND status IN ('planned', 'in_progress') ORDER BY scheduledDeparture ASC LIMIT 1
  - Include: truck (unitNumber, year, make, model), stops (orderBy sequenceOrder asc, include facility {name, city, state}), carrierLoads (include client {companyName})
- Return the dispatch or null

`getMyDispatchHistory()`:
- requireRole([DRIVER]), getSession()
- In a transaction with bypass_rls:
  - Find carrierDriver
  - findMany carrierDispatch WHERE primaryDriverId = carrierDriver.id AND status = 'completed' ORDER BY actualArrival DESC LIMIT 10
  - Include: truck (unitNumber), stops (orderBy sequenceOrder, include facility {name, city, state})
- Return array

`startTrip(dispatchId: string)`:
- requireRole([DRIVER]), getSession()
- In a transaction with bypass_rls:
  - Find carrierDriver, verify dispatch belongs to this driver AND orgId matches
  - Call `transitionDispatchStatus(session.tenantId, dispatchId, 'in_progress')` from `@/lib/carrier/dispatches`
  - revalidatePath('/my-route')
- Return result

`arriveAtStop(stopId: string)`:
- requireRole([DRIVER]), getSession()
- In a transaction with bypass_rls:
  - Find carrierDriver, verify the stop's dispatch belongs to this driver
- Then call `arriveStop(session.tenantId, stopId)` from `@/lib/carrier/stop-completion`
- revalidatePath('/my-route')
- Return result

`completeCurrentStop(stopId: string)`:
- requireRole([DRIVER]), getSession()
- In a transaction with bypass_rls:
  - Find carrierDriver, verify the stop's dispatch belongs to this driver
- Then call `completeStop(session.tenantId, stopId)` from `@/lib/carrier/stop-completion`
- revalidatePath('/my-route')
- Return result

IMPORTANT: The `transitionDispatchStatus`, `arriveStop`, and `completeStop` functions from lib/carrier already handle their own prisma calls. The server actions only need to verify driver ownership before delegating. Do NOT duplicate their business logic.

**New functions in driver-load.ts:**

`getMyLoads()`:
- requireRole([DRIVER]), getSession()
- In a transaction with bypass_rls:
  - Find carrierDriver
  - Find carrierLoads WHERE dispatchId IN (SELECT id FROM dispatches WHERE primaryDriverId = carrierDriver.id AND status IN ('planned', 'in_progress'))
  - Include: client (companyName), stops (include facility)
- Return array

Remove `getMyActiveLoad`, `getMyActiveLoadSummary`, `advanceLoadStatus`, `getMyCompletedLoads` (all query legacy tables).

**Update layout.tsx:**
- Change the GPS truckId lookup from querying legacy `route` table to querying `carrierDispatch`:
  - Find carrierDriver by userId + orgId
  - Find active carrierDispatch, select truckId
  - The GPS tracker expects a Truck.id but carrierDispatch.truckId points to CarrierTruck.id — set truckId = null for now (GPS uses legacy Truck table, Carrier Ops uses CarrierTruck — different tables, incompatible). Add a TODO comment noting this.

**Update page.tsx (driver home):**
- Change to call `getMyActiveDispatch()` instead of `getMyAssignedRoute()`
- Redirect to /my-route if dispatch found
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web — no type errors in modified files.
  </verify>
  <done>
All server actions query CarrierDispatch/CarrierStop/CarrierLoad tables. Start Trip and Complete Stop delegate to existing lib functions. Driver identity resolved via carrierDriver.userId join.
  </done>
</task>

<task type="auto">
  <name>Task 2: Rewrite Route and Load tab pages + components for Carrier Ops data shape</name>
  <files>
    apps/web/src/app/(driver)/my-route/page.tsx
    apps/web/src/app/(driver)/my-load/page.tsx
    apps/web/src/components/driver/route-detail-readonly.tsx
    apps/web/src/components/driver/completed-route-history.tsx
    apps/web/src/components/driver/completed-load-history.tsx
  </files>
  <action>
**Rewrite my-route/page.tsx:**
- Import `getMyActiveDispatch`, `getMyDispatchHistory`, `startTrip`, `arriveAtStop`, `completeCurrentStop` from driver-routes actions
- Active dispatch section:
  - Header: dispatch status badge (planned = yellow, in_progress = green), scheduled departure datetime, truck unit number (from dispatch.truck.unitNumber)
  - Start Trip button: visible ONLY when dispatch.status === 'planned'. Client component that calls `startTrip(dispatch.id)` server action. Use same button pattern as LoadStatusButton (useTransition).
  - Stop timeline: ordered list of dispatch.stops by sequenceOrder. Each stop shows:
    - Sequence number circle (green if completed, blue if arrived, gray if pending)
    - Stop type badge (pickup/delivery/fuel_stop/etc)
    - Facility name + city, state (from stop.facility)
    - Appointment window (appointmentStart - appointmentEnd) if set
    - Status badge (pending/arrived/completed/skipped)
    - arrived_at / departed_at timestamps if present
    - "Arrive" button on the first pending stop (calls arriveAtStop)
    - "Complete Stop" button on arrived stops (calls completeCurrentStop)
  - Navigation link to Google Maps for the current pending/arrived stop (same buildNavigationUrl pattern but use facility lat/lng or address)
- Remove the old RouteDetailReadOnly component usage, Documents section, and MessagingPanel (those reference legacy Route data)
- Keep the Document and Message sections commented out with TODO noting they need reconnection to Carrier Ops documents/messaging
- Completed dispatches section: use getMyDispatchHistory(), show cards with dispatch date, truck, stop count, status

**Rewrite route-detail-readonly.tsx** OR replace it inline in the page:
- Since the data shape is completely different (CarrierDispatch vs Route), it's cleaner to build the new UI directly in my-route/page.tsx and delete the old component OR rewrite it entirely.
- Decision: rewrite route-detail-readonly.tsx to accept the new CarrierDispatch shape. The component should display:
  - Dispatch details card (status, scheduled departure, actual departure, planned miles, truck info)
  - Stop timeline with action buttons (arrive/complete)
- Extract the Start Trip and Arrive/Complete Stop buttons into a new client component `DispatchActionButtons` inside route-detail-readonly.tsx (or a separate file `dispatch-action-buttons.tsx` in the driver components folder) since they need useTransition for server action calls.

**Rewrite completed-route-history.tsx:**
- Accept completed CarrierDispatch[] instead of completed Route[]
- Show dispatch date, truck unit, stop count, status badge

**Rewrite my-load/page.tsx:**
- Import `getMyLoads` from driver-load actions
- Show list of CarrierLoad items from active dispatches
- Each load card: reference number or "Load #N", client name, commodity description, weight, pieces, rate type + amount, status badge
- Load detail (expandable or inline): pickup/delivery appointments from the load's linked stops, special instructions, driver instructions
- Remove old status timeline and LoadStatusButton (load status in Carrier Ops is managed via stop completion cascades, not direct load status updates)

**Rewrite completed-load-history.tsx:**
- This component showed completed loads from the legacy table. Since we're only showing loads from active dispatches now (per the brief), simplify to just show the load list. Remove the completed load history section from my-load/page.tsx for now (dispatches history is on the Route tab).

**Styling:**
- Match existing driver portal card styling: `rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-5 shadow-sm`
- Status badge colors: planned=yellow, in_progress=green, completed=gray, pending=muted, arrived=blue, skipped=red
- Stop type badges: pickup=blue, delivery=emerald, fuel_stop=amber, relay=purple, rest=gray
- Use lucide icons: MapPin, Package, Truck, Clock, Navigation, Play, CheckCircle
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web — no type errors.
Visit the driver portal as Sammy (driver) at localhost:3000 — the Route tab shows the active in_progress dispatch (69098808-...) with stops timeline, and the Load tab shows loads from that dispatch.
  </verify>
  <done>
Route tab displays the active CarrierDispatch with stop timeline showing facility names, appointment windows, status badges, and action buttons. Load tab shows CarrierLoads from active dispatches with client names, commodity info, and rates. Completed dispatches appear in history. No legacy Route/Load table queries remain in driver portal Route/Load tabs.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors in driver portal files
2. Driver portal Route tab shows the active CarrierDispatch (id: 69098808-...) with stops, truck info, and action buttons
3. Driver portal Load tab shows CarrierLoads linked to the active dispatch
4. Start Trip button (if dispatch is planned) calls transitionDispatchStatus — not a duplicate implementation
5. Complete Stop button calls the existing completeStop from lib/carrier/stop-completion
6. Hours, Report, Support, Messages tabs are completely unchanged
7. All queries use carrierDriver.userId = session.userId AND carrierDriver.orgId = session.tenantId for tenant isolation
</verification>

<success_criteria>
- Driver logged in as Sammy sees his active dispatch on the Route tab instead of "No route assigned"
- Stop timeline shows facility names, statuses, and timestamps
- Load tab shows loads from the active dispatch with client and commodity details
- No legacy Route/Load table queries in the driver portal Route and Load tabs
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/230-reconnect-web-driver-portal-to-carrier-o/230-SUMMARY.md`
</output>
