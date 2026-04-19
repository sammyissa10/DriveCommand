---
phase: quick-254
plan: 01
subsystem: ui
tags: [leaflet, z-index, permissions, rbac, maps, team-permissions]

requires:
  - phase: quick-253
    provides: team permissions page and updateUserPermissions server action with Supabase sync

provides:
  - Notification dropdown renders above Leaflet map (z-[1001])
  - fullAccess master toggle in UserPermissions type + middleware bypass
  - Full Access toggle UI in PermissionEditor with greyed-out individual toggles
  - Map fitBounds fires exactly once per page load (ref guard)

affects: [team-permissions, live-map, middleware, permissions-system]

tech-stack:
  added: []
  patterns:
    - "fullAccess optional boolean in UserPermissions bypasses all MANAGER granular checks"
    - "useRef(false) guard in map components to fire fitBounds once even when data loads async"

key-files:
  created: []
  modified:
    - apps/web/src/components/navigation/notification-bell.tsx
    - apps/web/src/lib/auth/permissions.ts
    - apps/web/src/middleware.ts
    - apps/web/src/app/(owner)/settings/team-permissions/page.tsx
    - apps/web/src/components/maps/live-map.tsx

key-decisions:
  - "fullAccess not added to DEFAULT_MANAGER_PERMISSIONS — defaults to undefined/false for backward compat"
  - "getPermissions() explicitly preserves fullAccess key in merge since it is not in DEFAULT_MANAGER_PERMISSIONS"
  - "fullAccess bypasses granular gated-route checks in middleware but owner-only paths (team-permissions, subscription) remain blocked"
  - "FitBoundsOnMount adds vehicles to useEffect deps so async vehicle arrival after mount triggers zoom"
  - "maxZoom reduced from 15 to 14 for slightly more geographic context on initial zoom"

patterns-established:
  - "fullAccess pattern: optional field on UserPermissions, preserved through getPermissions() merge, synced by updateUserPermissions to both Prisma and Supabase app_metadata"

duration: 15min
completed: 2026-04-18
---

# Quick Task 254: Fix Notification Z-Index, Full Access Toggle, Map Auto-Zoom

**Notification dropdown raised to z-[1001] above Leaflet, Full Access master RBAC toggle wired to Prisma + Supabase, map fitBounds fires once on initial vehicle load**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-04-18T00:00:00Z
- **Completed:** 2026-04-18T00:15:00Z
- **Tasks:** 3
- **Files modified:** 5

## Accomplishments
- Notification bell container and dropdown both set to `z-[1001]`, rendering above all Leaflet tile/marker layers (z-index 400-1000)
- `fullAccess?: boolean` added to `UserPermissions` interface; `hasPermission()` short-circuits immediately for MANAGER; `getPermissions()` preserves `fullAccess` through the DEFAULT_MANAGER_PERMISSIONS merge
- Middleware now reads `permissions.fullAccess` before the gated-route block — full access managers skip all path-permission checks (owner-only pages still blocked)
- PermissionEditor shows a Full Access toggle at the top; when ON: green "Full Access Granted" badge appears and all individual section toggles grey out with `opacity-50 pointer-events-none`
- Member list row badge shows green-tinted "Full access" when `member.permissions.fullAccess` is true
- `FitBoundsOnMount` component refactored with `useRef(false)` guard and `vehicles` in dependency array — fitBounds fires exactly once when vehicles arrive (handles async load after map mount), never re-fires on 15s poll

## Task Commits

1. **Task 1: Fix notification dropdown z-index above Leaflet map** - `a24ea25` (fix)
2. **Task 2: Add Full Access master toggle to Team Permissions** - `f8158cb` (feat)
3. **Task 3: Auto-zoom map to vehicle bounds on initial load** - `b8cbcae` (fix)

## Files Created/Modified
- `apps/web/src/components/navigation/notification-bell.tsx` - Added `z-[1001]` to container and dropdown div
- `apps/web/src/lib/auth/permissions.ts` - Added `fullAccess?: boolean` to interface, updated `hasPermission()` and `getPermissions()`
- `apps/web/src/middleware.ts` - Wrapped granular permission check in `if (!permissions.fullAccess)`
- `apps/web/src/app/(owner)/settings/team-permissions/page.tsx` - Full Access toggle UI, allDisabled logic, badge update
- `apps/web/src/components/maps/live-map.tsx` - Added `useRef` import, refactored `FitBoundsOnMount` with ref guard

## Decisions Made
- `fullAccess` kept optional (`fullAccess?: boolean`) for backward compatibility — existing managers without it default to granular behavior unchanged
- `fullAccess` not included in `DEFAULT_MANAGER_PERMISSIONS` or `OWNER_PERMISSIONS` — it's a special override, not a per-page toggle
- `updateUserPermissions` action required no changes — it already syncs the entire permissions object to both Prisma and Supabase `app_metadata`
- `maxZoom` lowered from 15 to 14 per task spec for better geographic context on first load

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
Pre-existing TypeScript errors in `e2e/carrier/clients.spec.ts` and `e2e/carrier/loads.spec.ts` (Playwright Locator `.not` property type issue) — unrelated to this task, existed before.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- All three fixes are independent polish items, no blockers for subsequent work
- Full Access toggle ready to use — owner can grant a manager unrestricted carrier access in one click

## Self-Check: PASSED

Files verified present:
- apps/web/src/components/navigation/notification-bell.tsx — FOUND
- apps/web/src/lib/auth/permissions.ts — FOUND
- apps/web/src/middleware.ts — FOUND
- apps/web/src/app/(owner)/settings/team-permissions/page.tsx — FOUND
- apps/web/src/components/maps/live-map.tsx — FOUND

Commits verified:
- a24ea25 — FOUND
- f8158cb — FOUND
- b8cbcae — FOUND

---
*Phase: quick-254*
*Completed: 2026-04-18*
