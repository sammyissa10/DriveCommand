---
phase: 254
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/navigation/notification-bell.tsx
  - apps/web/src/components/maps/live-map.tsx
  - apps/web/src/app/(owner)/settings/team-permissions/page.tsx
  - apps/web/src/lib/auth/permissions.ts
  - apps/web/src/middleware.ts
  - apps/web/src/app/(owner)/actions/team-permissions.ts
autonomous: true
must_haves:
  truths:
    - "Notification dropdown renders above the Leaflet map on the live-map page"
    - "Full Access toggle at top of permission editor enables/disables all individual toggles"
    - "Middleware allows all /carrier/* routes when fullAccess is true for MANAGER"
    - "Map auto-zooms to fit all vehicles with GPS on initial load only"
  artifacts:
    - path: "apps/web/src/components/navigation/notification-bell.tsx"
      provides: "z-index 1001 on dropdown wrapper"
    - path: "apps/web/src/lib/auth/permissions.ts"
      provides: "fullAccess field in UserPermissions interface"
    - path: "apps/web/src/middleware.ts"
      provides: "fullAccess bypass for MANAGER permission gating"
  key_links:
    - from: "apps/web/src/app/(owner)/settings/team-permissions/page.tsx"
      to: "apps/web/src/app/(owner)/actions/team-permissions.ts"
      via: "updateUserPermissions syncs fullAccess to Prisma + Supabase app_metadata"
      pattern: "fullAccess"
    - from: "apps/web/src/middleware.ts"
      to: "apps/web/src/lib/auth/permissions.ts"
      via: "reads permissions.fullAccess from app_metadata"
      pattern: "fullAccess"
---

<objective>
Fix three independent issues: (1) notification dropdown z-index above Leaflet map, (2) Full Access master toggle on Team Permissions page, (3) map auto-zoom to vehicle bounds on initial load.

Purpose: Polish carrier ops UX -- notifications must be clickable over the map, team permissions need a one-click full access grant, and the map should frame vehicles automatically.
Output: Updated notification bell, permissions system, middleware, team permissions page, and live map components.
</objective>

<context>
@apps/web/src/components/navigation/notification-bell.tsx
@apps/web/src/components/navigation/notification-center.tsx
@apps/web/src/components/maps/live-map.tsx
@apps/web/src/components/maps/live-map-wrapper.tsx
@apps/web/src/lib/maps/map-utils.ts
@apps/web/src/app/(owner)/settings/team-permissions/page.tsx
@apps/web/src/lib/auth/permissions.ts
@apps/web/src/middleware.ts
@apps/web/src/app/(owner)/actions/team-permissions.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix notification dropdown z-index above Leaflet map</name>
  <files>apps/web/src/components/navigation/notification-bell.tsx</files>
  <action>
Leaflet map tiles use z-index 400-1000. The notification dropdown currently uses `z-50` (z-index: 50) which renders behind the map.

In `notification-bell.tsx`, update the dropdown wrapper div (line 68) from:
```
<div className="absolute right-0 top-full mt-2 z-50">
```
to:
```
<div className="absolute right-0 top-full mt-2 z-[1001]">
```

Also ensure the parent container `<div ref={containerRef} className="relative">` gets `relative z-[1001]` so the stacking context is established above Leaflet:
```
<div ref={containerRef} className="relative z-[1001]">
```

This ensures both the bell button and the dropdown panel render above Leaflet's z-index range without affecting other header elements (the header itself already has stacking context from `bg-card/80 backdrop-blur-sm`).
  </action>
  <verify>
Open the live-map page in browser, click the notification bell. The dropdown must render fully above the map tiles and markers. No other UI elements should be visually broken.
  </verify>
  <done>Notification dropdown is fully visible and clickable above the Leaflet map on the live-map page.</done>
</task>

<task type="auto">
  <name>Task 2: Add Full Access master toggle to Team Permissions</name>
  <files>
apps/web/src/lib/auth/permissions.ts
apps/web/src/middleware.ts
apps/web/src/app/(owner)/settings/team-permissions/page.tsx
apps/web/src/app/(owner)/actions/team-permissions.ts
  </files>
  <action>
**Step 1 -- Update UserPermissions type** (`permissions.ts`):
- Add `fullAccess?: boolean` to the `UserPermissions` interface (optional so existing data is backward-compatible).
- Do NOT add it to `DEFAULT_MANAGER_PERMISSIONS` or `OWNER_PERMISSIONS` (it defaults to undefined/false).
- Do NOT add it to `PERMISSION_SECTIONS` (it is not a per-page toggle).
- Update `hasPermission()`: if `role === 'MANAGER'` and `permissions?.fullAccess === true`, return `true` immediately regardless of key.

**Step 2 -- Update middleware** (`middleware.ts`):
In the MANAGER permission guard block (line 165-182), before checking `PERMISSION_GATED_PATHS`, add an early return:
```ts
const permissions = (appMeta.permissions ?? {}) as UserPermissions;
// Full Access: skip all granular permission checks
if (permissions.fullAccess === true) {
  // Still block owner-only pages (team-permissions, subscription)
  // but allow all other /carrier/* routes
  // (owner-only check already happened above, so just fall through)
}
```
Concretely: move the `const permissions` line before the gated route check, and wrap the gated route block in `if (!permissions.fullAccess)`:
```ts
if (appMeta.role === 'MANAGER') {
  if (OWNER_ONLY_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/carrier/dashboard', request.url));
  }
  const permissions = (appMeta.permissions ?? {}) as UserPermissions;
  if (!permissions.fullAccess) {
    const gatedRoute = PERMISSION_GATED_PATHS.find((g) => pathname.startsWith(g.path));
    if (gatedRoute) {
      if (permissions[gatedRoute.permission] === false) {
        return NextResponse.redirect(new URL('/carrier/dashboard', request.url));
      }
    }
  }
}
```

**Step 3 -- Update PermissionEditor UI** (`team-permissions/page.tsx`):
Add a "Full Access" toggle at the TOP of the `PermissionEditor` component, above the existing "Enable All / Disable All" buttons:

```tsx
{/* Full Access master toggle */}
<div className="flex items-center justify-between rounded-lg border-2 border-primary/20 bg-primary/5 p-4">
  <div className="flex-1 min-w-0">
    <Label htmlFor={`${idPrefix}-fullAccess`} className="cursor-pointer">
      <span className="block text-sm font-semibold leading-none">Full Access</span>
      <span className="block text-xs text-muted-foreground mt-1">Grant access to all pages</span>
    </Label>
  </div>
  <Switch
    id={`${idPrefix}-fullAccess`}
    checked={permissions.fullAccess === true}
    onCheckedChange={(value) => onChange({ ...permissions, fullAccess: value })}
    disabled={disabled}
    className="shrink-0 ml-4"
  />
</div>

{/* Full Access badge */}
{permissions.fullAccess && (
  <Badge variant="default" className="bg-green-600 hover:bg-green-600 text-white">
    Full Access Granted
  </Badge>
)}
```

When `fullAccess` is true, pass `disabled={true}` to ALL individual permission toggles. Update the existing `disabled` prop on each Switch to be: `disabled={disabled || permissions.fullAccess === true}`. The simplest way: add a computed variable at the top of PermissionEditor:
```ts
const allDisabled = disabled || permissions.fullAccess === true;
```
Then use `allDisabled` as the disabled prop for the Enable All/Disable All buttons, section enable/disable buttons, and individual Switch components.

**Step 4 -- Sync fullAccess in server action** (`team-permissions.ts`):
The `updateUserPermissions` action already syncs the entire `permissions` object to both Prisma and Supabase `app_metadata`. Since `fullAccess` is part of the `UserPermissions` object, no changes needed here. BUT verify: in `getPermissions()` in `permissions.ts`, make sure `fullAccess` is preserved when merging. Currently the merge filters keys against `DEFAULT_MANAGER_PERMISSIONS`. Since `fullAccess` is NOT in `DEFAULT_MANAGER_PERMISSIONS`, it would be stripped.

Fix in `getPermissions()`: after the merge, explicitly preserve `fullAccess`:
```ts
const merged = {
  ...DEFAULT_MANAGER_PERMISSIONS,
  ...Object.fromEntries(
    Object.entries(user.permissions).filter(
      ([key]) => key in DEFAULT_MANAGER_PERMISSIONS || key === 'fullAccess'
    )
  ),
} as UserPermissions;
return merged;
```

**Step 5 -- Update badge in member list** (`team-permissions/page.tsx`):
In the member row, update the badge logic to show "Full Access" when `member.permissions.fullAccess === true`:
```tsx
<Badge variant="secondary" className={`shrink-0 ${member.permissions.fullAccess ? 'bg-green-600/10 text-green-700 dark:text-green-400' : ''}`}>
  {member.permissions.fullAccess ? 'Full access' : count === TOTAL_PERMISSIONS ? 'Full access' : count === 0 ? 'No access' : `${count} of ${TOTAL_PERMISSIONS}`}
</Badge>
```
  </action>
  <verify>
1. `npx tsc --noEmit` in apps/web passes with no errors.
2. Open Team Permissions page, click a manager, toggle Full Access ON -- all individual toggles should grey out, green badge appears.
3. Toggle Full Access OFF -- individual toggles become active again.
4. Verify the permissions sync by checking Supabase app_metadata contains `fullAccess: true`.
  </verify>
  <done>
Full Access toggle appears at top of permission editor. When ON: green badge shown, all individual toggles greyed out, middleware allows all /carrier/* routes for that MANAGER. When OFF: existing granular behavior. Synced to both Prisma and Supabase app_metadata.
  </done>
</task>

<task type="auto">
  <name>Task 3: Auto-zoom map to vehicle bounds on initial load</name>
  <files>apps/web/src/components/maps/live-map.tsx</files>
  <action>
The `FitBoundsOnMount` component already exists in `live-map.tsx` (lines 33-47) and does exactly this -- it calls `map.fitBounds()` with the calculated bounds on mount. It uses `[map]` as the useEffect dependency, which means it only fires once when the map initializes.

However, the issue is that `FitBoundsOnMount` receives `vehicles` from the parent, and on initial render the `vehicles` array might be passed as `initialVehicles` from the wrapper's `vehiclesForMap` which filters for non-null lat/lng. The `calculateBounds` utility already handles filtering.

The current implementation looks correct for single-fire. BUT the `vehicles` prop changes on every 15s poll (the wrapper passes `vehiclesForMap` which updates via `setVehicles`). Since `FitBoundsOnMount` only depends on `[map]`, it won't re-fire on poll -- which is correct.

Review the current code more carefully: the `FitBoundsOnMount` component receives `vehicles` as a prop but the `useEffect` only depends on `[map]`. This means if `vehicles` is empty on first render (SSR edge case) and populated later, fitBounds won't fire. Add a ref-based guard to handle this:

Replace `FitBoundsOnMount` with:
```tsx
function FitBoundsOnMount({ vehicles }: { vehicles: VehicleLocation[] }) {
  const map = useMap();
  const hasFitted = useRef(false);

  useEffect(() => {
    if (hasFitted.current) return;
    if (vehicles.length === 0) return;

    const bounds = calculateBounds(vehicles);
    if (bounds) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
      hasFitted.current = true;
    }
  }, [map, vehicles]);

  return null;
}
```

Key changes:
1. Add `useRef` to imports (already imported on line 6 -- no, check: line 6 imports `useEffect, useState` only). Add `useRef` to the import.
2. Use `hasFitted` ref to ensure fitBounds fires exactly once.
3. Add `vehicles` to the dependency array so if vehicles arrive after mount (async), it still fires.
4. Change `maxZoom` from 15 to 14 per the task spec (slightly more zoomed out for better context).
5. Remove the eslint-disable comment since we now have proper dependencies.
  </action>
  <verify>
Open the live-map page with at least one vehicle that has GPS coordinates. The map should automatically zoom and center to show all vehicles with GPS data. Wait for a 15s poll refresh -- the map should NOT re-zoom. Navigate away and back -- should zoom again on fresh mount.
  </verify>
  <done>Map auto-zooms to fit all vehicles with known GPS on initial load. Uses a ref to prevent re-firing on 15s poll refreshes. maxZoom capped at 14.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` -- zero TypeScript errors
2. Notification bell dropdown visible above Leaflet map on /live-map
3. Full Access toggle functional on Team Permissions page (both member edit and invite sheets)
4. Middleware correctly bypasses granular checks when fullAccess=true (owner-only pages still blocked)
5. Map auto-zooms once on load, does not re-zoom on poll
</verification>

<success_criteria>
- Notification dropdown renders above z-index 1000 (Leaflet range)
- Full Access toggle persists to Prisma + Supabase app_metadata
- Full Access=true causes middleware to allow all /carrier/* routes for MANAGER
- Map fitBounds fires exactly once per page load
- Zero TypeScript errors
</success_criteria>
