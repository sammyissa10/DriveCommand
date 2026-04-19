---
phase: quick-253
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/auth/permissions.ts
  - apps/web/src/middleware.ts
  - apps/web/src/app/(owner)/actions/team-permissions.ts
  - apps/web/src/app/(owner)/settings/team-permissions/page.tsx
  - apps/web/src/components/navigation/sidebar.tsx
  - apps/web/src/app/(owner)/carrier/layout.tsx
  - apps/web/src/lib/auth/guards.tsx
autonomous: true
must_haves:
  truths:
    - "Permissions list matches current Carrier Ops pages exactly (16 route-based permissions)"
    - "New managers default to all permissions enabled (true)"
    - "Owner can toggle individual permissions off/on per manager"
    - "Sidebar hides nav items managers lack permission for"
    - "Server-side redirect blocks managers from accessing pages they lack permission for"
    - "Team Permissions UI shows grouped toggles with section enable/disable controls"
    - "OWNER role always has full access regardless of permissions"
    - "DRIVER role is completely unaffected"
    - "Team Permissions and Subscription pages are always owner-only"
    - "Support and Settings are always accessible to managers"
  artifacts:
    - path: "apps/web/src/lib/auth/permissions.ts"
      provides: "Route-based permission constants, section groupings, defaults-all-true"
    - path: "apps/web/src/app/(owner)/settings/team-permissions/page.tsx"
      provides: "Grouped toggle UI with section enable/disable and master toggle"
    - path: "apps/web/src/middleware.ts"
      provides: "MANAGER permission enforcement for /carrier/* routes"
    - path: "apps/web/src/components/navigation/sidebar.tsx"
      provides: "Permission-gated sidebar nav items for managers"
  key_links:
    - from: "apps/web/src/lib/auth/permissions.ts"
      to: "apps/web/src/middleware.ts"
      via: "PERMISSION_GATED_PATHS import"
      pattern: "PERMISSION_GATED_PATHS"
    - from: "apps/web/src/lib/auth/permissions.ts"
      to: "apps/web/src/components/navigation/sidebar.tsx"
      via: "PermissionGuard component using permission keys"
      pattern: "PermissionGuard"
    - from: "apps/web/src/lib/auth/permissions.ts"
      to: "apps/web/src/app/(owner)/settings/team-permissions/page.tsx"
      via: "PERMISSION_SECTIONS import for grouped UI"
      pattern: "PERMISSION_SECTIONS"
---

<objective>
Rebuild the Team Permissions system to reflect current Carrier Ops pages, default all permissions to enabled, fix enforcement in sidebar + middleware + carrier layout, and update the Team Permissions UI with grouped section toggles.

Purpose: The current permissions system references old routes (payroll, invoices, CRM, etc.) that no longer exist. The new Carrier Ops pages (/carrier/*) have zero permission enforcement. This task aligns permissions with reality and adds proper enforcement.

Output: Working permission system covering all 16 Carrier Ops routes with sidebar hiding, server-side blocking, and a grouped toggle UI.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/auth/permissions.ts
@apps/web/src/middleware.ts
@apps/web/src/app/(owner)/settings/team-permissions/page.tsx
@apps/web/src/app/(owner)/actions/team-permissions.ts
@apps/web/src/components/navigation/sidebar.tsx
@apps/web/src/lib/auth/guards.tsx
@apps/web/src/lib/auth/auth-context.tsx
@apps/web/src/app/api/auth/me/route.ts
@apps/web/src/app/(owner)/carrier/layout.tsx
@apps/web/src/lib/auth/roles.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Rebuild permission constants and server actions</name>
  <files>
    apps/web/src/lib/auth/permissions.ts
    apps/web/src/app/(owner)/actions/team-permissions.ts
  </files>
  <action>
**Rewrite `apps/web/src/lib/auth/permissions.ts` entirely:**

Replace the old `UserPermissions` interface with a new route-based permission system. Permission keys should be route paths (kebab-case identifiers derived from the route).

New `UserPermissions` interface keys (16 permissions total):

```
// Carrier Ops
carrierDashboard: boolean;    // /carrier/dashboard
clients: boolean;             // /carrier/clients
contracts: boolean;           // /carrier/contracts
templates: boolean;           // /carrier/templates
dispatches: boolean;          // /carrier/dispatches
carrierLoads: boolean;        // /carrier/loads

// Fleet
carrierDrivers: boolean;      // /carrier/fleet/drivers
carrierTrucks: boolean;       // /carrier/fleet/trucks
facilities: boolean;          // /carrier/facilities

// Reports
revenueReport: boolean;       // /carrier/reports/revenue
driverPayReport: boolean;     // /carrier/reports/driver-pay
arAgingReport: boolean;       // /carrier/reports/aging
performanceReport: boolean;   // /carrier/reports/performance

// Intelligence
liveMap: boolean;             // /live-map

// Other
aiDocuments: boolean;         // /ai-documents

// Always accessible (NOT in permissions — hardcoded):
// /support — always accessible to managers
// /settings — limited view only for managers (no team-permissions, no subscription)
```

**`DEFAULT_MANAGER_PERMISSIONS`**: Set ALL values to `true` (Fix 2 — default all enabled). Owner toggles OFF what they want to restrict.

**`OWNER_PERMISSIONS`**: All `true` (unchanged behavior).

**Add a `PERMISSION_SECTIONS` export** for the UI grouping:
```typescript
export interface PermissionSection {
  id: string;
  label: string;
  permissions: Array<{
    key: keyof UserPermissions;
    label: string;
    description: string;
    route: string;
  }>;
}

export const PERMISSION_SECTIONS: PermissionSection[] = [
  {
    id: 'carrier-ops',
    label: 'Carrier Ops',
    permissions: [
      { key: 'carrierDashboard', label: 'Carrier Dashboard', description: 'View the main carrier dashboard', route: '/carrier/dashboard' },
      { key: 'clients', label: 'Clients', description: 'View and manage clients', route: '/carrier/clients' },
      { key: 'contracts', label: 'Contracts', description: 'View and manage contracts', route: '/carrier/contracts' },
      { key: 'templates', label: 'Templates', description: 'View and manage templates', route: '/carrier/templates' },
      { key: 'dispatches', label: 'Dispatches', description: 'View and manage dispatches', route: '/carrier/dispatches' },
      { key: 'carrierLoads', label: 'Carrier Loads', description: 'View and manage carrier loads', route: '/carrier/loads' },
    ],
  },
  {
    id: 'fleet',
    label: 'Fleet',
    permissions: [
      { key: 'carrierDrivers', label: 'Carrier Drivers', description: 'View and manage carrier drivers', route: '/carrier/fleet/drivers' },
      { key: 'carrierTrucks', label: 'Carrier Trucks', description: 'View and manage carrier trucks', route: '/carrier/fleet/trucks' },
      { key: 'facilities', label: 'Facilities', description: 'View and manage facilities', route: '/carrier/facilities' },
    ],
  },
  {
    id: 'reports',
    label: 'Reports',
    permissions: [
      { key: 'revenueReport', label: 'Revenue Report', description: 'View revenue reports', route: '/carrier/reports/revenue' },
      { key: 'driverPayReport', label: 'Driver Pay Report', description: 'View driver pay reports', route: '/carrier/reports/driver-pay' },
      { key: 'arAgingReport', label: 'AR Aging Report', description: 'View accounts receivable aging reports', route: '/carrier/reports/aging' },
      { key: 'performanceReport', label: 'Performance Report', description: 'View performance reports', route: '/carrier/reports/performance' },
    ],
  },
  {
    id: 'intelligence',
    label: 'Intelligence',
    permissions: [
      { key: 'liveMap', label: 'Live Map', description: 'View the live fleet map', route: '/live-map' },
    ],
  },
  {
    id: 'other',
    label: 'Other',
    permissions: [
      { key: 'aiDocuments', label: 'AI Documents', description: 'Upload and extract data from freight documents using AI', route: '/ai-documents' },
    ],
  },
];
```

**Update `PERMISSION_GATED_PATHS`** to map the new routes to the new permission keys:
```typescript
export const PERMISSION_GATED_PATHS: Array<{
  path: string;
  permission: keyof UserPermissions;
}> = [
  { path: '/carrier/dashboard', permission: 'carrierDashboard' },
  { path: '/carrier/clients', permission: 'clients' },
  { path: '/carrier/contracts', permission: 'contracts' },
  { path: '/carrier/templates', permission: 'templates' },
  { path: '/carrier/dispatches', permission: 'dispatches' },
  { path: '/carrier/loads', permission: 'carrierLoads' },
  { path: '/carrier/fleet/drivers', permission: 'carrierDrivers' },
  { path: '/carrier/fleet/trucks', permission: 'carrierTrucks' },
  { path: '/carrier/facilities', permission: 'facilities' },
  { path: '/carrier/reports/revenue', permission: 'revenueReport' },
  { path: '/carrier/reports/driver-pay', permission: 'driverPayReport' },
  { path: '/carrier/reports/aging', permission: 'arAgingReport' },
  { path: '/carrier/reports/performance', permission: 'performanceReport' },
  { path: '/live-map', permission: 'liveMap' },
  { path: '/ai-documents', permission: 'aiDocuments' },
];
```

Keep the existing `PERMISSION_LABELS` export as a `Record<keyof UserPermissions, { label: string; description: string }>` derived from `PERMISSION_SECTIONS` for backward compat (flatten sections into a record).

Keep `hasPermission`, `getPermissions`, `isUserPermissions` helper functions — update them to work with the new keys. `getPermissions` for MANAGER should merge stored JSON with `DEFAULT_MANAGER_PERMISSIONS` so any MISSING key defaults to `true` (not false as before).

**Update `apps/web/src/app/(owner)/actions/team-permissions.ts`:**
- Import the new `UserPermissions` type
- No logic changes needed — it already uses `getPermissions()` and passes `UserPermissions` objects through
- Verify the `inviteTeamMember` action works with the new default-all-true permissions (new invites should get all permissions enabled by default)
  </action>
  <verify>
Run `npx tsc --noEmit` from `apps/web` — no type errors. Grep for old permission keys (`canViewPayroll`, `canViewInvoices`, etc.) to confirm zero remaining references outside of generated Prisma files.
  </verify>
  <done>
New `UserPermissions` interface with 16 route-based keys exists. All defaults are `true`. `PERMISSION_SECTIONS` export provides grouped metadata. `PERMISSION_GATED_PATHS` maps all 16 routes. Old permission keys are fully removed.
  </done>
</task>

<task type="auto">
  <name>Task 2: Fix enforcement — middleware, carrier layout, and sidebar</name>
  <files>
    apps/web/src/middleware.ts
    apps/web/src/app/(owner)/carrier/layout.tsx
    apps/web/src/components/navigation/sidebar.tsx
    apps/web/src/lib/auth/guards.tsx
  </files>
  <action>
**Update `apps/web/src/middleware.ts`:**

1. Update the `OWNER_PATHS` array to include `/carrier` prefix routes. Add `/carrier` to the array so that `pathname.startsWith('/carrier')` catches all carrier ops routes. Keep `/live-map`, `/ai-documents`, `/settings`, `/support` as they are (top-level routes).

2. The MANAGER permission guard block (lines ~161-170) already uses `PERMISSION_GATED_PATHS` which will now have the new routes from Task 1. Verify it works by checking: when `appMeta.role === 'MANAGER'`, it finds the gated route via `pathname.startsWith(g.path)` and checks `permissions[gatedRoute.permission]`. The permissions come from `appMeta.permissions` — this is read from Supabase `app_metadata`.

3. IMPORTANT: The middleware reads permissions from `appMeta.permissions` (Supabase app_metadata), NOT from the DB User.permissions field directly. The `/api/auth/me` endpoint returns `appMeta.permissions` for web sessions. This means permissions must be synced to Supabase app_metadata when updated. Check if `updateUserPermissions` in team-permissions.ts updates app_metadata — if not, add a Supabase admin call to sync.

4. Add owner-only path guards: `/settings/team-permissions` and `/settings/subscription` (or `/subscription`) should redirect MANAGER to `/carrier/dashboard` (not `/unauthorized`). Add these as explicit checks BEFORE the general `PERMISSION_GATED_PATHS` check:
```typescript
// Owner-only pages — always blocked for MANAGER
const OWNER_ONLY_PATHS = ['/settings/team-permissions', '/subscription'];
if (appMeta.role === 'MANAGER' && OWNER_ONLY_PATHS.some(p => pathname.startsWith(p))) {
  return NextResponse.redirect(new URL('/carrier/dashboard', request.url));
}
```

5. For the general MANAGER permission denial, redirect to `/carrier/dashboard` instead of `/unauthorized` (per spec: "redirect to /carrier/dashboard with toast").

**Update `apps/web/src/app/(owner)/carrier/layout.tsx`:**

Add server-side permission check for MANAGER role. After the existing role checks:
```typescript
import { getSession } from "@/lib/auth/supabase";
import { PERMISSION_GATED_PATHS } from "@/lib/auth/permissions";
```
This is belt-and-suspenders. The middleware handles it, but the layout adds a second layer. For MANAGER users, check if the current pathname matches a gated path and if permission is denied, redirect to `/carrier/dashboard`. Use `headers()` from `next/headers` to get the current pathname — or better, since this is a layout wrapping ALL /carrier/* routes, check at the individual page level instead. Actually, the middleware already handles this. The layout's existing DRIVER/non-OWNER-MANAGER checks are sufficient. Do NOT add per-page permission checks in the layout since the middleware already blocks unauthorized MANAGER access before the layout runs. Leave the layout as-is.

**Update `apps/web/src/components/navigation/sidebar.tsx`:**

Replace the current approach where only a few items use `<PermissionGuard>`. Instead, wrap EVERY nav item that corresponds to a permission-gated route in `<PermissionGuard permission="...">`.

The sidebar currently has these sections:
- Intelligence: Live Map -> wrap in `<PermissionGuard permission="liveMap">`
- Carrier Ops: Dashboard, Clients, Contracts, Templates, Dispatches, Loads -> wrap each in corresponding `<PermissionGuard>`
- Fleet sub-group (Drivers, Trucks, Facilities) -> wrap each sub-item in `<PermissionGuard>`
- Reports sub-group (Revenue, Driver Pay, AR Aging, Performance) -> wrap each sub-item in `<PermissionGuard>`
- Business: AI Documents -> already wrapped, update permission key from `"canViewAIDocuments"` to `"aiDocuments"`
- Settings section:
  - Team Permissions -> keep `{userRole === UserRole.OWNER && ...}` (owner only, no PermissionGuard needed)
  - Subscription -> keep `{userRole === UserRole.OWNER && ...}` (change from PermissionGuard to owner-only check)
  - Expense Categories, Expense Templates, Integrations -> these are under /settings/* which is always accessible to managers per spec. Remove `<PermissionGuard permission="canManageSettings">` wrapper. Show to all OWNER+MANAGER.
- Support: always visible (no change)

For parent menu items with sub-items (Fleet, Reports), hide the ENTIRE parent if ALL children are hidden. Use a helper: if none of the sub-permissions are granted, hide the parent group. Create a small helper component or inline logic:
```tsx
// For Fleet parent: show if user has ANY of carrierDrivers, carrierTrucks, facilities
// For Reports parent: show if user has ANY of revenueReport, driverPayReport, arAgingReport, performanceReport
```

**Update `apps/web/src/lib/auth/guards.tsx`:**

The `PermissionGuard` component uses `user.permissions?.[permission]` which reads from the AuthContext. The AuthContext gets permissions from `/api/auth/me` which returns `appMeta.permissions`. This should work with the new keys as long as the type is updated. Since `UserPermissions` is imported from `permissions.ts`, updating that file (Task 1) is sufficient. No code changes needed in guards.tsx unless the import path changed (it didn't).

BUT: with the new default-all-true approach, when `user.permissions` is `undefined` or `null` (no permissions set in app_metadata yet), `PermissionGuard` should treat all permissions as `true` (granted), not `false`. Currently line 95 does `user.permissions?.[permission]` which returns `undefined` if permissions is null, and `undefined` is falsy. FIX this: if `user.permissions` is null/undefined for a MANAGER, default to `true`:
```typescript
if (user.role === UserRole.MANAGER) {
  // Default-all-true: if no permissions set, everything is allowed
  if (!user.permissions) return <>{children}</>;
  if (user.permissions[permission] !== false) {
    return <>{children}</>;
  }
  return <>{fallback}</>;
}
```

Similarly update `hasPermission` in permissions.ts:
```typescript
export function hasPermission(permissions: UserPermissions | null, key: keyof UserPermissions, role: string): boolean {
  if (role === 'OWNER') return true;
  if (role === 'MANAGER') return permissions?.[key] !== false; // default true
  return false;
}
```

**Also sync permissions to Supabase app_metadata:**

Check `apps/web/src/app/(owner)/actions/team-permissions.ts` — `updateUserPermissions` only updates `prisma.user.update`. The middleware reads from `appMeta.permissions` (Supabase app_metadata). Add a Supabase admin call to sync permissions to app_metadata after the Prisma update:
```typescript
import { createAdminClient } from '@/lib/supabase/admin';

// After prisma.user.update:
// Find the user's Supabase auth UID (it's the User.id which maps to Supabase auth.users.id)
const adminClient = createAdminClient();
await adminClient.auth.admin.updateUserById(userId, {
  app_metadata: { permissions },
});
```

Wait — check if the User.id in the DB is the Supabase auth UID. Look at the User model: `id String @id @default(dbgenerated("gen_random_uuid()"))`. This is a DB-generated UUID, NOT necessarily the Supabase auth UID. Check how users are created to see if they share the same ID. If they don't match, we need to look up the Supabase UID differently.

Actually, looking at the `/api/auth/me` response for web: it returns `userId: user.id` where `user` is from `supabase.auth.getUser()`. The AuthContext stores this as `user.id`. The team-permissions action receives `userId` which is the member's DB user ID. We need to find the Supabase auth user for that DB user.

The simplest approach: query the DB user's email, then look up the Supabase user by email. Or: store the supabase auth UID in the User table. Check the accept-invitation flow to see how User records are created and whether they store the auth UID.

If the DB User.id does NOT match Supabase auth UID, use the member's email to update Supabase:
```typescript
// Look up the user email to sync to Supabase
const dbUser = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
if (dbUser) {
  // Find Supabase user by email
  const { data: { users } } = await adminClient.auth.admin.listUsers();
  const supaUser = users.find(u => u.email === dbUser.email);
  if (supaUser) {
    await adminClient.auth.admin.updateUserById(supaUser.id, {
      app_metadata: { ...supaUser.app_metadata, permissions },
    });
  }
}
```

This is heavy. Better approach: store both IDs or use email lookup. Check if there's a pattern already in the codebase for syncing app_metadata. Search for `updateUserById` usage.

If no existing pattern, use a simpler approach: store permissions in a way the middleware can read from the DB instead. Actually, the middleware already reads from Supabase app_metadata. We need to sync.

ALTERNATIVE simpler approach: Instead of syncing to app_metadata, change the middleware to read permissions from the DB directly via a lightweight query. But middleware runs on the edge and may not have Prisma access.

BEST approach: Add the Supabase admin sync in `updateUserPermissions`. Look up the Supabase auth user by email (since we have the member's email in the DB). This is acceptable for a settings save operation (not hot path).
  </action>
  <verify>
1. Run `npx tsc --noEmit` from `apps/web` — no type errors
2. Search for old permission keys in sidebar.tsx and guards.tsx — zero matches for `canView*` or `canManage*`
3. Verify `PERMISSION_GATED_PATHS` in middleware covers all `/carrier/*` routes by grep
4. Start dev server (`npm run dev`), sign in as OWNER — all sidebar items visible
5. Sign in as MANAGER with no permissions set — all sidebar items visible (default-all-true)
  </verify>
  <done>
Middleware blocks MANAGER users from permission-denied carrier routes (redirect to /carrier/dashboard). Sidebar hides nav items managers lack permission for. PermissionGuard defaults to true when no permissions are set. Owner-only paths (team-permissions, subscription) always blocked for MANAGER. Permissions synced to Supabase app_metadata on save.
  </done>
</task>

<task type="auto">
  <name>Task 3: Rebuild Team Permissions UI with grouped toggles</name>
  <files>
    apps/web/src/app/(owner)/settings/team-permissions/page.tsx
  </files>
  <action>
Rewrite the Team Permissions page UI using `PERMISSION_SECTIONS` from permissions.ts.

**Manager list (keep existing pattern):** List of managers with avatar initials, name, email, click to open permissions sheet. Update the badge to show "X of 16" instead of old count.

**Member permissions sheet — rebuild with grouped sections:**

```
[Sheet header: avatar, name, email]
[Description: "Toggle permissions on or off. Changes save instantly."]

--- Master Controls ---
[Enable All] [Disable All]   <- two buttons at top

--- Carrier Ops ---
[Enable All Section] [Disable All Section]
[Switch] Carrier Dashboard - View the main carrier dashboard
[Switch] Clients - View and manage clients
[Switch] Contracts - View and manage contracts
[Switch] Templates - View and manage templates
[Switch] Dispatches - View and manage dispatches
[Switch] Carrier Loads - View and manage carrier loads

--- Fleet ---
[Enable All Section] [Disable All Section]
[Switch] Carrier Drivers - ...
[Switch] Carrier Trucks - ...
[Switch] Facilities - ...

--- Reports ---
[Enable All Section] [Disable All Section]
[Switch] Revenue Report - ...
[Switch] Driver Pay Report - ...
[Switch] AR Aging Report - ...
[Switch] Performance Report - ...

--- Intelligence ---
[Enable All Section] [Disable All Section]
[Switch] Live Map - ...

--- Other ---
[Enable All Section] [Disable All Section]
[Switch] AI Documents - ...

--- Info ---
[small text] "Support and Settings are always accessible"
[small text] "Team Permissions and Subscription are owner-only"
[small text] "Last updated: {timestamp}" (if available)
```

**Implementation details:**

1. Import `PERMISSION_SECTIONS` from `@/lib/auth/permissions`

2. Master "Enable All" button: sets ALL 16 permission keys to `true` and calls `updateUserPermissions`
3. Master "Disable All" button: sets ALL 16 permission keys to `false` and calls `updateUserPermissions`

4. Per-section "Enable All" / "Disable All": small text buttons next to section header. Only toggles permissions in that section.

5. Individual toggles: same as before — `Switch` component, instant save via `handleToggle`

6. For the enable/disable all operations (master and section), batch the update into a single `updateUserPermissions` call with the full permissions object. Show optimistic update immediately, revert on error.

7. Keep the invite sheet. Update it to use `PERMISSION_SECTIONS` for the grouped toggle layout too. Default invite permissions should be all-true (from `DEFAULT_MANAGER_PERMISSIONS`).

8. Add a "Last updated" display per manager. This requires the `updatedAt` field from the User model. Update `getTeamMembers` in the server action to also select `updatedAt`, and update the `TeamMember` interface to include `updatedAt: string`. Display as relative time or formatted date below the permission toggles.

9. Style the section headers with `text-xs uppercase tracking-wider text-muted-foreground font-semibold` and the section enable/disable buttons as small `variant="ghost" size="sm"` buttons.

10. Add a small info card at the bottom of the permissions sheet:
```tsx
<div className="mt-6 rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground space-y-1">
  <p>Support and Settings are always accessible to team members.</p>
  <p>Team Permissions and Subscription are owner-only.</p>
</div>
```
  </action>
  <verify>
1. Run `npx tsc --noEmit` — no type errors
2. Start dev server, go to /settings/team-permissions as OWNER
3. Verify: sections render with correct grouping (5 sections, 16 toggles total)
4. Verify: "Enable All" / "Disable All" master buttons work
5. Verify: per-section enable/disable buttons work
6. Verify: individual toggle saves instantly with toast
7. Verify: invite sheet shows grouped permissions with all defaults ON
  </verify>
  <done>
Team Permissions page shows grouped toggle sections (Carrier Ops, Fleet, Reports, Intelligence, Other) with 16 permission switches. Master and per-section Enable All / Disable All controls work. Invite sheet uses same grouped layout with all-true defaults. Last updated timestamp displayed per manager. Info card explains always-accessible and owner-only pages.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors from `apps/web`
2. OWNER can see all sidebar items and access all carrier pages
3. MANAGER with no permissions stored sees all sidebar items (default-all-true)
4. OWNER disables "Carrier Loads" for a MANAGER -> MANAGER's sidebar hides "Carrier Loads" -> MANAGER navigating to /carrier/loads gets redirected to /carrier/dashboard
5. MANAGER cannot access /settings/team-permissions (redirected)
6. MANAGER cannot access /subscription (redirected)
7. MANAGER can always access /support and /settings (expense categories, templates, integrations)
8. DRIVER is completely unaffected (no sidebar changes, no new restrictions)
9. Team Permissions UI shows 5 grouped sections with 16 toggles
10. Enable All / Disable All buttons work at master and section levels
</verification>

<success_criteria>
- 16 route-based permissions replace the old 9 permission keys
- All permissions default to true for new and existing managers
- Sidebar dynamically shows/hides items based on manager permissions
- Middleware blocks unauthorized manager access with redirect to /carrier/dashboard
- Team Permissions UI has grouped sections with bulk toggle controls
- OWNER always has full access, DRIVER is unaffected
- Zero TypeScript errors
</success_criteria>

<output>
After completion, create `.planning/quick/253-rebuild-team-permissions-to-reflect-curr/253-SUMMARY.md`
</output>
