---
phase: quick-141
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/mobile/owner/routes/route.ts
  - apps/web/src/app/api/mobile/owner/routes/[id]/route.ts
  - packages/api-client/src/owner.ts
  - packages/api-client/src/index.ts
  - apps/mobile/app/(owner)/routes/_layout.tsx
  - apps/mobile/app/(owner)/routes/index.tsx
  - apps/mobile/app/(owner)/routes/[id].tsx
  - apps/mobile/app/(owner)/_layout.tsx
autonomous: true
must_haves:
  truths:
    - "Owner can see a list of routes with name, status, scheduled date, and driver"
    - "Owner can tap a route to see full details including stops and associated loads"
    - "Owner can edit route name, status, scheduled date, and driver assignment from the detail screen"
    - "Routes tab appears in the owner tab bar navigation"
  artifacts:
    - path: "apps/web/src/app/api/mobile/owner/routes/route.ts"
      provides: "GET /api/mobile/owner/routes — list routes for tenant"
      exports: ["GET"]
    - path: "apps/web/src/app/api/mobile/owner/routes/[id]/route.ts"
      provides: "GET and PATCH /api/mobile/owner/routes/[id] — detail and edit"
      exports: ["GET", "PATCH"]
    - path: "packages/api-client/src/owner.ts"
      provides: "ownerApi.getRoutes, getRoute, updateRoute methods"
    - path: "apps/mobile/app/(owner)/routes/index.tsx"
      provides: "Route list screen with status tabs and FlashList"
    - path: "apps/mobile/app/(owner)/routes/[id].tsx"
      provides: "Route detail screen with edit bottom sheets"
    - path: "apps/mobile/app/(owner)/routes/_layout.tsx"
      provides: "Stack navigator for routes section"
  key_links:
    - from: "apps/mobile/app/(owner)/routes/index.tsx"
      to: "/api/mobile/owner/routes"
      via: "ownerApi.getRoutes in useQuery"
      pattern: "ownerApi\\.getRoutes"
    - from: "apps/mobile/app/(owner)/routes/[id].tsx"
      to: "/api/mobile/owner/routes/[id]"
      via: "ownerApi.getRoute and ownerApi.updateRoute"
      pattern: "ownerApi\\.(getRoute|updateRoute)"
    - from: "apps/mobile/app/(owner)/_layout.tsx"
      to: "apps/mobile/app/(owner)/routes"
      via: "Tabs.Screen name='routes'"
      pattern: "name=\"routes\""
---

<objective>
Add a complete Routes section to the mobile owner portal: API routes for list/detail/edit, api-client methods, and mobile screens with navigation tab.

Purpose: Owner needs to manage routes (not just loads) from mobile — view route list, see details with stops and loads, edit route properties.
Output: 3 API endpoints, 3 api-client methods, 3 mobile screens, 1 tab bar entry.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/api/mobile/owner/loads/route.ts (API pattern — auth, bypass_rls, pagination)
@apps/web/src/app/api/mobile/owner/loads/[id]/route.ts (detail + PATCH pattern)
@packages/api-client/src/owner.ts (api-client pattern — types + ownerApi object)
@packages/api-client/src/index.ts (re-exports)
@apps/mobile/app/(owner)/loads/index.tsx (list screen pattern — FlashList, status tabs, badges)
@apps/mobile/app/(owner)/loads/[id].tsx (detail screen pattern — info fields, bottom sheets, mutations)
@apps/mobile/app/(owner)/loads/_layout.tsx (stack layout pattern)
@apps/mobile/app/(owner)/_layout.tsx (tab bar — where to add Routes tab)
@apps/web/prisma/schema.prisma (Route model: id, tenantId, driverId, truckId, origin, destination, scheduledDate, status[PLANNED|IN_PROGRESS|COMPLETED], name, notes, archivedAt; RouteStop model; RouteStatus enum)
</context>

<tasks>

<task type="auto">
  <name>Task 1: API routes and api-client for owner routes</name>
  <files>
    apps/web/src/app/api/mobile/owner/routes/route.ts
    apps/web/src/app/api/mobile/owner/routes/[id]/route.ts
    packages/api-client/src/owner.ts
    packages/api-client/src/index.ts
  </files>
  <action>
**1. Create `apps/web/src/app/api/mobile/owner/routes/route.ts`** — GET endpoint.

Follow the exact pattern from `apps/web/src/app/api/mobile/owner/loads/route.ts`:
- Import `validateMobileToken`, `unauthorizedResponse`, `prisma`, `TX_OPTIONS`, `mobileLimiter`, `applyRateLimit`, `logger`
- Import `RouteStatus` from `@/generated/prisma`
- Auth check: must be OWNER role
- Rate limit with `mobileLimiter`
- Accept `?status=all|planned|active|completed` query param:
  - `all`: no filter
  - `planned`: `[RouteStatus.PLANNED]`
  - `active`: `[RouteStatus.IN_PROGRESS]`
  - `completed`: `[RouteStatus.COMPLETED]`
  - Default to `all`
- Use `$transaction` with `bypass_rls` pattern (copy the `@bypass_rls` JSDoc comment exactly)
- Query `tx.route.findMany` with:
  - `where: { tenantId, archivedAt: null, ...(statusFilter ? { status: { in: statusFilter } } : {}) }`
  - `include: { driver: { select: { id, firstName, lastName } }, truck: { select: { id, make, model, licensePlate } }, _count: { select: { loads: true, stops: true } } }`
  - `orderBy: { scheduledDate: 'desc' }`
  - Pagination: `take: limit, skip: (page - 1) * limit` (same pattern as loads)
- Also get `tx.route.count({ where })` for total
- Normalize driver name: `[firstName, lastName].filter(Boolean).join(' ') || 'Unknown Driver'`
- Return `{ routes: [...], pagination: { page, limit, total, totalPages } }`

**2. Create `apps/web/src/app/api/mobile/owner/routes/[id]/route.ts`** — GET and PATCH endpoints.

**GET handler:**
- Same auth/rate-limit pattern as loads/[id]
- `tx.route.findUnique` with `where: { id, tenantId, archivedAt: null }`
- Include: `driver` (id, firstName, lastName), `truck` (id, make, model, licensePlate), `stops` (ordered by position asc), `loads` (id, loadNumber, status, origin, destination, rate)
- Normalize driver name same way
- Return 404 if not found

**PATCH handler:**
- Same auth/rate-limit/body-parsing pattern as loads/[id] PATCH
- Allowed fields: `name` (string), `status` (RouteStatus: PLANNED, IN_PROGRESS, COMPLETED), `scheduledDate` (ISO string -> new Date()), `driverId` (string — Route.driverId is required, so no null/unassign)
- Validate status against `['PLANNED', 'IN_PROGRESS', 'COMPLETED']`
- If `driverId` provided, validate driver exists in tenant with role DRIVER and isActive
- If `scheduledDate` provided, convert to `new Date(scheduledDate)`
- Verify route exists with `tenantId` before updating
- Return updated route with same includes as GET

**3. Add types and methods to `packages/api-client/src/owner.ts`:**

Add these types after the existing types section:

```typescript
export interface OwnerRouteSummary {
  id: string
  name: string | null
  status: string
  origin: string
  destination: string
  scheduledDate: string
  driver: { id: string; name: string }
  truck: { id: string; make: string; model: string; licensePlate: string }
  _count: { loads: number; stops: number }
  createdAt: string
  updatedAt: string
}

export interface OwnerRouteDetail {
  id: string
  name: string | null
  status: string
  origin: string
  destination: string
  scheduledDate: string
  notes: string | null
  driver: { id: string; name: string }
  truck: { id: string; make: string; model: string; licensePlate: string }
  stops: RouteStop[]
  loads: Array<{ id: string; loadNumber: string; status: string; origin: string; destination: string; rate: number | null }>
  createdAt: string
}

export interface UpdateRoutePayload {
  name?: string
  status?: string
  scheduledDate?: string
  driverId?: string
}
```

Add these methods to the `ownerApi` object:

```typescript
getRoutes: (token: string, status: 'all' | 'planned' | 'active' | 'completed') =>
  apiRequest<OwnerRouteSummary[]>(`/api/mobile/owner/routes?status=${status}`, { token }),

getRoute: (token: string, id: string) =>
  apiRequest<OwnerRouteDetail>(`/api/mobile/owner/routes/${id}`, { token }),

updateRoute: (token: string, id: string, payload: UpdateRoutePayload) =>
  apiRequest<{ route: OwnerRouteDetail }>(`/api/mobile/owner/routes/${id}`, {
    method: 'PATCH',
    token,
    body: JSON.stringify(payload),
  }),
```

**4. Update `packages/api-client/src/index.ts`:**

Add to the type re-exports from `'./owner'`:
`OwnerRouteSummary, OwnerRouteDetail, UpdateRoutePayload`
  </action>
  <verify>
Run `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/web/tsconfig.json` and `npx tsc --noEmit -p packages/api-client/tsconfig.json` — both must pass with no errors related to the new route files.
  </verify>
  <done>
Three API endpoints exist (GET list, GET detail, PATCH edit) following the exact same auth/RLS/pagination pattern as the loads endpoints. Api-client has getRoutes, getRoute, updateRoute methods with proper types. All TypeScript compiles cleanly.
  </done>
</task>

<task type="auto">
  <name>Task 2: Mobile route screens and tab navigation</name>
  <files>
    apps/mobile/app/(owner)/routes/_layout.tsx
    apps/mobile/app/(owner)/routes/index.tsx
    apps/mobile/app/(owner)/routes/[id].tsx
    apps/mobile/app/(owner)/_layout.tsx
  </files>
  <action>
**1. Create `apps/mobile/app/(owner)/routes/_layout.tsx`** — exact copy of `loads/_layout.tsx`:
```typescript
import { Stack } from 'expo-router'

export default function OwnerRoutesStack() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: '#0f172a' },
        animation: 'slide_from_right',
      }}
    />
  )
}
```

**2. Create `apps/mobile/app/(owner)/routes/index.tsx`** — Route list screen.

Follow `loads/index.tsx` pattern exactly. Key differences:

- Import `ownerApi, type OwnerRouteSummary` from `@drivecommand/api-client`
- Use `Navigation` icon from `lucide-react-native` (for empty state) and `Route` or `Navigation` for the FAB is NOT needed — routes are not created from mobile, so NO SpeedDial/FAB.
- Status tabs: `all`, `planned` (PLANNED), `active` (IN_PROGRESS), `completed` (COMPLETED)
- Tab type: `'all' | 'planned' | 'active' | 'completed'`
- Query key: `['owner-routes', activeTab]`, query fn: `ownerApi.getRoutes(token!, activeTab)`
- Route card (`OwnerRouteCard`) shows:
  - Top row: route name (or "Unnamed Route" if null) + status badge
  - Route status badges: PLANNED -> { label: 'Planned', variant: 'muted' }, IN_PROGRESS -> { label: 'In Progress', variant: 'warning' }, COMPLETED -> { label: 'Completed', variant: 'success' }
  - Second row: origin -> destination (same style as load cards)
  - Third row: scheduled date formatted with `toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })`
  - Fourth row: driver name + load/stop counts (`{_count.loads} loads, {_count.stops} stops`)
- Card press navigates to `/(owner)/routes/${item.id}`
- Empty state: use `Navigation` icon from lucide, title varies by tab ("No routes yet", "No planned routes", etc.)
- NO create button / FAB — routes are created from the web app only
- Use `LoadCardSkeleton` for loading state (reuse existing skeleton component)
- Wrap in `SafeAreaView` + `AnimatedScreen` like loads

**3. Create `apps/mobile/app/(owner)/routes/[id].tsx`** — Route detail screen.

Follow `loads/[id].tsx` pattern. Simpler than loads — no truck picker, no cancel flow.

- Query: `['owner-route', id]`, fn: `ownerApi.getRoute(token!, id!)`
- Use `LoadDetailSkeleton` for loading state (reuse existing)

**Header:** Back button + route name (or "Unnamed Route") + status badge.

**Route Info Card:** 2-column grid using `InfoField` component (define locally like in loads/[id]):
- Name, Status, Origin, Destination, Scheduled Date, Driver name

**Stops section:** If `route.stops.length > 0`, show stops using `StopTimelineItem` component (already exists at `components/driver/StopTimelineItem`). Same pattern as loads/[id] stops section.

**Associated Loads section:** If `route.loads.length > 0`, show a card listing loads. Each load row: load number, status badge, origin -> destination. Tapping a load row navigates to `/(owner)/loads/${load.id}`.

**Actions card** (only show if status !== 'COMPLETED'):
- "Edit Route" button opens an edit bottom sheet
- The edit bottom sheet contains:
  - Name: TextInput prefilled with current name
  - Status picker: three pressable options (PLANNED, IN_PROGRESS, COMPLETED) styled like StatusPickerSheet in loads
  - Scheduled Date: For simplicity, show current date as text (editing dates on mobile is complex — just show the date, don't make it editable for now)
  - Driver picker: pressable that opens a DriverPickerSheet (reuse the same pattern from loads/[id] — fetch `ownerApi.getActiveDrivers` when picker opens)
  - Save button that calls `ownerApi.updateRoute(token, id, payload)` via `useMutation`
  - On success: invalidate `['owner-route', id]` and `['owner-routes']`, show success toast, close sheet
  - On error: show error toast

Use `BottomSheet` component from `components/ui/BottomSheet` for the edit sheet (snapPoint "70%").
Use `useMutation` from `@tanstack/react-query` for the update.
Use `haptic.success()` and `haptic.error()` on mutation results.
Use `Toast.show()` for feedback (import from `react-native-toast-message`).

**4. Update `apps/mobile/app/(owner)/_layout.tsx`** — Add Routes tab.

Add a new `Tabs.Screen` for routes, positioned AFTER the "loads" tab and BEFORE "drivers":

```tsx
<Tabs.Screen
  name="routes"
  options={{
    tabBarLabel: 'Routes',
    tabBarIcon: ({ color }) => <Navigation color={color} size={tabBar.iconSize} />,
  }}
  listeners={{ tabPress: () => haptic.light() }}
/>
```

Import `Navigation` from `lucide-react-native` (add to existing import). This icon represents navigation/routing. The existing imports already include `Map` and `Package`, so `Navigation` fits the pattern.
  </action>
  <verify>
Run `cd C:/Users/sammy/Projects/DriveCommand && npx tsc --noEmit -p apps/mobile/tsconfig.json` — must pass with no errors related to new route screens. Visually verify: start the app on Android emulator, log in as owner, confirm Routes tab appears in tab bar, route list loads, tapping a route shows detail, edit bottom sheet opens and saves.
  </verify>
  <done>
Routes tab appears in owner tab bar between Loads and Drivers. Route list screen shows routes with status tabs, badges, and card layout matching the loads pattern. Route detail screen shows full route info, stops timeline, associated loads, and edit actions. Edit bottom sheet allows changing name, status, and driver with save/cancel functionality.
  </done>
</task>

</tasks>

<verification>
1. TypeScript compiles: `npx tsc --noEmit` passes for web, api-client, and mobile packages
2. API works: `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/mobile/owner/routes` returns route list
3. API detail works: `curl -H "Authorization: Bearer <token>" http://localhost:3000/api/mobile/owner/routes/<id>` returns route with stops and loads
4. API edit works: `curl -X PATCH -H "Authorization: Bearer <token>" -H "Content-Type: application/json" -d '{"name":"Test"}' http://localhost:3000/api/mobile/owner/routes/<id>` returns updated route
5. Mobile: Routes tab visible in owner tab bar
6. Mobile: Route list loads and displays cards with status, driver, origin/destination
7. Mobile: Route detail shows stops, loads, and edit actions
8. Mobile: Edit bottom sheet saves changes and shows toast feedback
</verification>

<success_criteria>
- Owner can navigate to Routes tab and see a list of all routes
- Owner can filter routes by status (all/planned/active/completed)
- Owner can tap a route to see full details including stops and associated loads
- Owner can edit route name, status, and driver assignment from the detail screen
- All screens match the existing mobile owner portal visual style (dark theme, slate cards, sky accents)
- No TypeScript errors across all packages
</success_criteria>

<output>
After completion, create `.planning/quick/141-mobile-owner-portal-add-routes-section-w/141-SUMMARY.md`
</output>
