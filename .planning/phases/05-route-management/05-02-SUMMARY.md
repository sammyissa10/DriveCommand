---
phase: 05-route-management
plan: 02
subsystem: ui
tags: [react, tanstack-table, useOptimistic, useActionState, server-components, client-components]

# Dependency graph
requires:
  - phase: 05-route-management
    provides: Route server actions with CRUD operations
  - phase: 03-truck-management
    provides: TanStack Table pattern for list views
  - phase: 04-driver-management
    provides: useOptimistic pattern for instant UI feedback
provides:
  - Complete route management UI with list, create, detail, and edit pages
  - TanStack Table with multi-column filtering and sorting
  - Unified route detail view showing route + driver + truck on one screen
  - Status transition UI with state-machine-aware buttons
affects: [06-document-upload]

# Tech tracking
tech-stack:
  added: []
  patterns: [unified-detail-view, status-transition-ui, active-driver-filtering]

key-files:
  created:
    - src/components/routes/route-form.tsx
    - src/components/routes/route-list.tsx
    - src/components/routes/route-detail.tsx
    - src/components/routes/route-status-actions.tsx
    - src/app/(owner)/routes/page.tsx
    - src/app/(owner)/routes/route-list-wrapper.tsx
    - src/app/(owner)/routes/new/page.tsx
    - src/app/(owner)/routes/new/new-route-client.tsx
    - src/app/(owner)/routes/[id]/page.tsx
    - src/app/(owner)/routes/[id]/edit/page.tsx
    - src/app/(owner)/routes/[id]/edit/edit-route-client.tsx
  modified:
    - src/components/routes/route-form.tsx (nullable driver names)
    - src/components/routes/route-list.tsx (nullable driver names)
    - src/components/routes/route-detail.tsx (nullable driver names)

key-decisions:
  - "Unified detail view shows route + driver + truck on one screen (ROUT-04 requirement)"
  - "Active drivers only in dropdown: new/edit pages query WHERE isActive=true for driver selection"
  - "Status transition buttons rendered conditionally based on current status (PLANNED shows Start, IN_PROGRESS shows Complete, COMPLETED shows checkmark)"
  - "Server component pages handle data fetching, client wrapper components handle interactivity (following Phase 03/04 pattern)"
  - "Nullable firstName/lastName handling: database schema allows null, UI renders empty string fallback"
  - "Navigation flow: list ↔ new, list ↔ detail, detail ↔ edit with back links and action buttons"
  - "Optimistic delete for instant UI feedback using React 19 useOptimistic hook"

patterns-established:
  - "Unified detail view pattern: Single page shows primary entity + related entities (driver + truck) in separate sections with cross-links"
  - "Active-only dropdown filtering: Form dropdowns query active entities only (isActive=true) to prevent assignment of deactivated resources"
  - "Status transition UI: Conditional action buttons based on state machine, with confirmation dialogs for irreversible actions"

# Metrics
duration: 4min 57sec
completed: 2026-02-14
---

# Phase 5 Plan 2: Route Management UI Summary

**Complete route CRUD UI with TanStack Table list, active driver/truck dropdowns, unified detail view (route + driver + truck), and state-machine-aware status transitions**

## Performance

- **Duration:** 4 min 57 sec
- **Started:** 2026-02-14T22:19:04Z
- **Completed:** 2026-02-14T22:24:01Z
- **Tasks:** 2
- **Files created:** 11

## Accomplishments
- Four route components: RouteForm with driver/truck dropdowns, RouteList with TanStack Table, RouteDetail with unified three-section view, RouteStatusActions with conditional buttons
- Seven route page files: list with optimistic delete, new with active driver/truck fetching, detail with formatted dates, edit with pre-filled form
- TanStack Table with global search and status filter dropdown (Planned, In Progress, Completed)
- Unified detail page shows route info, assigned driver, and assigned truck on one screen (ROUT-04)
- Status transition buttons use window.confirm dialogs and show appropriate actions based on current state

## Task Commits

Each task was committed atomically:

1. **Task 1: Create route form, list, detail, and status action components** - `91e4c3e` (feat)
2. **Task 2: Create route pages wired to server actions** - `39370d1` (feat)

## Files Created/Modified
- `src/components/routes/route-form.tsx` - Reusable form with driver/truck dropdowns, datetime-local input, React 19 useActionState, field-level validation errors
- `src/components/routes/route-list.tsx` - TanStack Table with sorting, filtering (global search + status dropdown), colored status badges, view/delete actions
- `src/components/routes/route-detail.tsx` - Three-section unified view: route details, assigned driver (with link to /drivers/{id}), assigned truck (with link to /trucks/{id})
- `src/components/routes/route-status-actions.tsx` - Conditional transition buttons: Start Route (PLANNED→IN_PROGRESS), Complete Route (IN_PROGRESS→COMPLETED), checkmark (COMPLETED)
- `src/app/(owner)/routes/page.tsx` - Server component list page fetching routes via listRoutes(), renders RouteListWrapper
- `src/app/(owner)/routes/route-list-wrapper.tsx` - Client component with useOptimistic for instant delete feedback
- `src/app/(owner)/routes/new/page.tsx` - Server component fetching active drivers and trucks for dropdowns
- `src/app/(owner)/routes/new/new-route-client.tsx` - Client component rendering RouteForm with createRoute action
- `src/app/(owner)/routes/[id]/page.tsx` - Server component detail page with formatted dates, renders RouteDetail + RouteStatusActions
- `src/app/(owner)/routes/[id]/edit/page.tsx` - Server component fetching route, active drivers/trucks, formats scheduledDate for datetime-local
- `src/app/(owner)/routes/[id]/edit/edit-route-client.tsx` - Client component with bound updateRoute action

## Decisions Made

1. **Unified detail view (ROUT-04)** - Route detail page shows three card sections: route information (origin, destination, scheduled date, status, notes), assigned driver (name, email, license), assigned truck (vehicle, license plate, VIN). Each related entity has "View Details" link to full detail page.

2. **Active drivers only in dropdowns** - New route and edit route pages query `WHERE role='DRIVER' AND isActive=true` to prevent assignment of deactivated drivers. This enforces business rule at UI level (also enforced in server action).

3. **Status transition buttons** - RouteStatusActions component renders conditionally: PLANNED shows blue "Start Route" button, IN_PROGRESS shows green "Complete Route" button, COMPLETED shows checkmark text. Each transition uses window.confirm with appropriate message.

4. **Server/client component separation** - Server components (page.tsx) handle data fetching and auth (via actions), client wrappers (-client.tsx, -wrapper.tsx) handle interactivity. Follows Phase 03/04 pattern for clean separation of concerns.

5. **Nullable firstName/lastName handling** - Database schema has nullable firstName/lastName but UI expects strings. Components use `firstName || ''` fallback to render empty string instead of null, preventing type errors and display issues.

6. **Navigation flow** - List page has "Create Route" button → new page. List rows have "View" link → detail page. Detail page has "Edit Route" button → edit page. All pages have back links. Creates intuitive navigation loop.

7. **Optimistic delete** - RouteListWrapper uses React 19 useOptimistic hook to immediately remove deleted route from UI, then calls deleteRoute action in transition. Provides instant feedback while server processes.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed TypeScript type errors for nullable driver names**
- **Found during:** Task 2 TypeScript verification
- **Issue:** Database schema has nullable firstName/lastName (string | null) but component interfaces declared them as non-nullable (string). This caused type errors when passing driver data from server actions to components.
- **Fix:** Updated all Driver interfaces across components and page files to use `firstName: string | null` and `lastName: string | null`. Added nullish coalescing (`firstName || ''`) in UI rendering to display empty string instead of null.
- **Files modified:** route-form.tsx, route-list.tsx, route-detail.tsx, route-list-wrapper.tsx, new-route-client.tsx, edit-route-client.tsx
- **Commit:** Included in 39370d1

**2. [Rule 1 - Bug] Fixed getTenantPrisma() Promise not awaited**
- **Found during:** Task 2 TypeScript verification
- **Issue:** new/page.tsx and [id]/edit/page.tsx called `getTenantPrisma()` without await, causing type errors (Promise<Prisma> instead of Prisma). Server component code tried to call `.user.findMany()` on a Promise.
- **Fix:** Added `await` before `getTenantPrisma()` call in both pages.
- **Files modified:** new/page.tsx, [id]/edit/page.tsx
- **Commit:** Included in 39370d1

**3. [Rule 1 - Bug] Removed unnecessary requireRole calls**
- **Found during:** Task 2 TypeScript verification
- **Issue:** Page components called `requireRole(UserRole.OWNER)` which expected array but received single enum value. Also, (owner) layout already enforces authentication, and server actions already enforce role-based authorization.
- **Fix:** Removed all `requireRole()` calls from page components. Auth handled by layout + server actions.
- **Files modified:** page.tsx, new/page.tsx, [id]/page.tsx, [id]/edit/page.tsx
- **Commit:** Included in 39370d1

**4. [Rule 1 - Bug] Fixed TanStack Table meta type error**
- **Found during:** Task 1 TypeScript verification
- **Issue:** `info.table.options.meta?.onDelete(route.id)` caused type error: "Property 'onDelete' does not exist on type 'TableMeta<Route>'". TanStack Table meta property is typed as generic TableMeta which doesn't include custom onDelete callback.
- **Fix:** Created RouteTableMeta interface extending TableMeta<Route> with onDelete property. Cast meta to RouteTableMeta in actions column: `(info.table.options.meta as RouteTableMeta)?.onDelete(route.id)`.
- **Files modified:** route-list.tsx
- **Commit:** Included in 91e4c3e

## Issues Encountered

None beyond auto-fixed type errors during implementation.

## User Setup Required

None - all routes are within existing (owner) portal with authentication already configured.

## Next Phase Readiness

**Ready for Phase 6 (Document Upload):**
- Route detail page provides unified view where document upload UI will be integrated
- Route ID available in detail page for associating uploaded documents
- Server actions provide route data fetching needed for document association

**Blockers:** None

**Considerations for next phase:**
- Document upload component will likely be added to RouteDetail view as fourth section
- File upload will need route ID to create Document records with routeId foreign key
- Document list on route detail should show registration/insurance docs for assigned truck

## Self-Check

**Files verification:**
- FOUND: src/components/routes/route-form.tsx
- FOUND: src/components/routes/route-list.tsx
- FOUND: src/components/routes/route-detail.tsx
- FOUND: src/components/routes/route-status-actions.tsx
- FOUND: src/app/(owner)/routes/page.tsx
- FOUND: src/app/(owner)/routes/route-list-wrapper.tsx
- FOUND: src/app/(owner)/routes/new/page.tsx
- FOUND: src/app/(owner)/routes/new/new-route-client.tsx
- FOUND: src/app/(owner)/routes/[id]/page.tsx
- FOUND: src/app/(owner)/routes/[id]/edit/page.tsx
- FOUND: src/app/(owner)/routes/[id]/edit/edit-route-client.tsx

**Commits verification:**
- FOUND: 91e4c3e (Task 1)
- FOUND: 39370d1 (Task 2)

**Self-Check: PASSED**

---
*Phase: 05-route-management*
*Completed: 2026-02-14*
