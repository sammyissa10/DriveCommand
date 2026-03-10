---
phase: quick-45
plan: 01
subsystem: ui
tags: [prisma, next.js, routes, co-drivers, react, typescript]

# Dependency graph
requires:
  - phase: quick-any
    provides: Route model in schema and route page components
provides:
  - RouteDriver join table for co-driver assignments
  - Route.name optional field
  - Document list auto-sync after upload
  - Condensed route page title (short ID badge)
  - Co-driver multi-select on route edit form
  - Co-driver display in route detail view
affects: [routes, drivers, route-edit, route-detail]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "useEffect sync pattern: sync local state from props after router.refresh() to fix stale prop issue"
    - "Comma-separated hidden field pattern: coDriverIds serialized as hidden input for form submission"
    - "Prisma $transaction for atomic delete+create when replacing a set"

key-files:
  created: []
  modified:
    - prisma/schema.prisma
    - src/app/(owner)/actions/routes.ts
    - src/app/(owner)/routes/[id]/route-documents-section.tsx
    - src/app/(owner)/routes/[id]/route-page-client.tsx
    - src/components/routes/route-edit-section.tsx
    - src/components/routes/route-form.tsx
    - src/components/routes/route-detail.tsx

key-decisions:
  - "Used prisma db push instead of migrate dev due to existing migration history drift in the project"
  - "Serialized coDriverIds as comma-separated hidden form field rather than calling updateRouteCoDrivers separately post-redirect"
  - "Handled co-drivers inline within updateRoute action to avoid race conditions with the redirect"
  - "Primary driver select uses controlled value to filter co-driver checkbox list (excludes primary from co-driver options)"

patterns-established:
  - "useEffect([initialProp]) sync: needed whenever a 'use client' component holds local state that mirrors a server-refreshed prop"

# Metrics
duration: 5min
completed: 2026-03-10
---

# Quick Task 45: TKT-0011 Routes UX Summary

**RouteDriver join table + Route.name field added to schema; document list fixed to sync after upload via useEffect; route title condensed to short ID badge; co-driver multi-select on route edit form with atomic save via hidden form field**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-10T05:29:57Z
- **Completed:** 2026-03-10T05:34:17Z
- **Tasks:** 3 (paused at checkpoint 4 for human verify)
- **Files modified:** 7

## Accomplishments
- Added RouteDriver join table and Route.name optional field to Prisma schema, pushed to DB and regenerated client
- Fixed document upload bug: `useEffect([initialDocuments])` now syncs local state when `router.refresh()` delivers new props
- Condensed route page title from full "origin to destination" string to `#7db72171 Origin → Destination` badge format
- Added optional Route Name text input to route create/edit form
- Added Co-Drivers checkbox list to route form (filtered to exclude primary driver), submitted as hidden comma-separated field
- Co-drivers saved atomically within `updateRoute` and `createRoute` via inline routeDriver delete+createMany
- `updateRouteCoDrivers` standalone server action also added for programmatic use
- RouteDetail view now shows co-driver names below primary driver section

## Task Commits

1. **Task 1: Schema — Route.name + RouteDriver join table** - `dbbfb53` (chore)
2. **Task 2: Fix document list sync + condense route title** - `663dbc4` (fix)
3. **Task 3: Co-driver support — actions + form** - `c9f7141` (feat)

## Files Created/Modified
- `prisma/schema.prisma` - Added Route.name field, RouteDriver model, User.routeCoDrivers back-relation
- `src/app/(owner)/actions/routes.ts` - getRoute includes coDrivers, updateRoute handles name+coDriverIds, new updateRouteCoDrivers action, createRoute handles name+coDriverIds
- `src/app/(owner)/routes/[id]/route-documents-section.tsx` - Added useEffect to sync documents state from props after refresh
- `src/app/(owner)/routes/[id]/route-page-client.tsx` - Added name to route interface, updated title to short ID badge + name/addresses
- `src/components/routes/route-edit-section.tsx` - Added name and coDrivers to route interface, passes initialCoDriverIds to RouteForm
- `src/components/routes/route-form.tsx` - Added Route Name input, Co-Drivers checkbox list, hidden coDriverIds field, controlled primary driver select
- `src/components/routes/route-detail.tsx` - Added CoDriver interface, displays co-driver list in driver section

## Decisions Made
- Used `prisma db push` instead of `migrate dev` because the project has existing migration history drift (several migrations were modified after application). `db push` syncs schema without requiring clean history.
- Serialized `coDriverIds` as a comma-separated hidden `<input>` submitted with the form, then parsed in `updateRoute`/`createRoute`. This avoids calling `updateRouteCoDrivers` after `redirect()` which would be unreachable.
- Primary driver `<select>` changed from `defaultValue` to controlled `value`+`onChange` so the co-driver checkbox list can filter out the selected primary driver in real time.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Added co-driver support to createRoute (not just updateRoute)**
- **Found during:** Task 3 (Co-driver support)
- **Issue:** Plan specified co-driver save for `updateRoute` only, but `RouteForm` also renders on the new-route page. Without handling it in `createRoute`, co-drivers would silently be dropped on route creation.
- **Fix:** Added coDriverIds parsing and routeDriver.createMany inside `createRoute` after the route record is created.
- **Files modified:** `src/app/(owner)/actions/routes.ts`
- **Verification:** TypeScript compiles cleanly, logic mirrors updateRoute pattern
- **Committed in:** `c9f7141` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (Rule 2 - missing critical functionality)
**Impact on plan:** Necessary for correctness — co-drivers would silently be lost on route creation without this fix. No scope creep.

## Issues Encountered
- `prisma migrate dev` failed due to migration history drift across the project (multiple existing migrations were modified after being applied). Resolved by using `prisma db push` which pushes schema changes directly without requiring clean migration history. The RouteDriver table and Route.name column were successfully applied to the database.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three UX issues from TKT-0011 are resolved in code
- Human verification checkpoint remains before marking complete
- Co-driver display and save flow ready for QA

---
*Phase: quick-45*
*Completed: 2026-03-10*

## Self-Check: PASSED

All key files verified present. All 3 task commits verified in git log.
