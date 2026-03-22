---
phase: quick-90
type: execute
autonomous: true
---

# Owner Portal RBAC — Permissions System for MANAGER Role

## Plan 1 of 4: DB Migration + Permissions Types + Auth Layer

<objective>
Add the `permissions` JSONB column to the User table, create the permissions type system, and thread permissions through the session/login/me chain so that downstream middleware and UI have access to user permissions.

Purpose: Establish the data foundation and auth plumbing that all other plans depend on.
Output: Working permissions data flow from DB -> login -> session cookie -> /api/auth/me -> AuthContext
</objective>

<context>
@prisma/schema.prisma (User model at line 146, ends at line 184)
@src/lib/auth/session.ts (SessionData interface, encrypt/decrypt, getSession, setSession)
@src/lib/auth/auth-context.tsx (AuthUser interface, AuthProvider fetching /api/auth/me)
@src/app/api/auth/login/route.ts (POST handler, setSession call at line 53)
@src/app/api/auth/me/route.ts (GET handler returning session fields)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create permissions type system and DB migration</name>
  <files>
    src/lib/auth/permissions.ts
    prisma/schema.prisma
    prisma/migrations/20260322000001_add_user_permissions/migration.sql
  </files>
  <action>
1. Create `src/lib/auth/permissions.ts`:
   - Define `UserPermissions` interface with these boolean keys:
     `canViewPayroll`, `canViewInvoices`, `canViewCRM`, `canViewAIDocuments`,
     `canViewLaneAnalytics`, `canViewProfitPredictor`, `canViewIFTA`,
     `canManageSettings`, `canViewBilling`
   - Export `DEFAULT_MANAGER_PERMISSIONS: UserPermissions` with ALL values = false
   - Export `OWNER_PERMISSIONS: UserPermissions` with ALL values = true
   - Export `PERMISSION_LABELS: Record<keyof UserPermissions, { label: string; description: string }>` mapping each key to human-readable names, e.g. `canViewPayroll -> { label: "Payroll", description: "View and manage driver payroll records" }`
   - Export `hasPermission(permissions: UserPermissions | null, key: keyof UserPermissions, role: string): boolean` — if role is 'OWNER' return true always; if role is 'MANAGER' return `permissions?.[key] ?? false`; otherwise return false
   - Export `getPermissions(user: { role: string; permissions: unknown }): UserPermissions` — if role is 'OWNER' return OWNER_PERMISSIONS; if role is 'MANAGER' parse permissions as UserPermissions with DEFAULT_MANAGER_PERMISSIONS fallback (use type guard, not zod); otherwise return DEFAULT_MANAGER_PERMISSIONS
   - Export `PERMISSION_GATED_PATHS` array mapping path prefixes to permission keys:
     ```
     { path: '/payroll', permission: 'canViewPayroll' },
     { path: '/invoices', permission: 'canViewInvoices' },
     { path: '/crm', permission: 'canViewCRM' },
     { path: '/ai-documents', permission: 'canViewAIDocuments' },
     { path: '/lane-analytics', permission: 'canViewLaneAnalytics' },
     { path: '/profit-predictor', permission: 'canViewProfitPredictor' },
     { path: '/ifta', permission: 'canViewIFTA' },
     { path: '/settings', permission: 'canManageSettings' },
     { path: '/subscription', permission: 'canViewBilling' },
     { path: '/billing', permission: 'canViewBilling' },
     ```

2. Add `permissions Json?` field to the User model in `prisma/schema.prisma` (after `isActive` field, before `createdAt`).

3. Create migration file `prisma/migrations/20260322000001_add_user_permissions/migration.sql`:
   ```sql
   -- Add permissions JSONB column to User table
   ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "permissions" JSONB;
   ```

4. Run `npx prisma generate` to regenerate the Prisma client with the new field. Do NOT run `npx prisma migrate deploy` or `npx prisma db push` — the migration SQL will be applied manually or via deploy.
  </action>
  <verify>
    - `npx prisma generate` succeeds without errors
    - `prisma/schema.prisma` shows `permissions Json?` in User model
    - `src/lib/auth/permissions.ts` exports UserPermissions, hasPermission, getPermissions, PERMISSION_GATED_PATHS
    - TypeScript compiles: `npx tsc --noEmit --pretty 2>&1 | head -20` shows no errors related to permissions.ts
  </verify>
  <done>Permissions type system exists with all 9 permission keys, DB migration SQL ready, Prisma client regenerated</done>
</task>

<task type="auto">
  <name>Task 2: Thread permissions through session, login, /api/auth/me, and AuthContext</name>
  <files>
    src/lib/auth/session.ts
    src/app/api/auth/login/route.ts
    src/app/api/auth/me/route.ts
    src/lib/auth/auth-context.tsx
  </files>
  <action>
1. Update `SessionData` interface in `src/lib/auth/session.ts`:
   - Import `UserPermissions` from `./permissions`
   - Add `permissions?: UserPermissions` field to SessionData

2. Update `src/app/api/auth/login/route.ts`:
   - Import `getPermissions` from `@/lib/auth/permissions`
   - After finding the user (line ~33), compute permissions: `const permissions = getPermissions({ role: user.role, permissions: user.permissions })`
   - Add `permissions` to the `setSession()` call (line ~53)

3. Update `src/app/api/auth/me/route.ts`:
   - Add `permissions: session.permissions` to the JSON response object

4. Update `src/lib/auth/auth-context.tsx`:
   - Import `UserPermissions` from `./permissions`
   - Add `permissions?: UserPermissions` to the `AuthUser` interface
   - In AuthProvider's fetch `.then(data => ...)` block, add `permissions: data.permissions` to the setUser call
  </action>
  <verify>
    - `npx tsc --noEmit --pretty 2>&1 | head -30` — no TypeScript errors
    - Login route includes permissions in session
    - /api/auth/me returns permissions in response
    - AuthContext maps permissions to user object
  </verify>
  <done>Full permissions chain works: DB permissions field -> login -> encrypted session cookie -> /api/auth/me -> client AuthContext. OWNER users always get all-true permissions. MANAGER users get their stored permissions (default all-false if null in DB).</done>
</task>

</tasks>

---

## Plan 2 of 4: Middleware Guard + PermissionGuard Component + Sidebar Filtering

<objective>
Add MANAGER permission checks to the Next.js middleware (server-side route blocking) and create a client-side PermissionGuard component to filter sidebar nav items based on the user's permissions.

Purpose: Enforce permissions at both the routing layer (security) and the UI layer (UX).
Output: MANAGERs without permissions are blocked from gated routes and don't see them in the sidebar.
</objective>

<context>
@src/lib/auth/permissions.ts (created in Plan 1 — UserPermissions, PERMISSION_GATED_PATHS, hasPermission)
@src/middleware.ts (existing middleware with driver guard, OWNER_PATHS)
@src/lib/auth/guards.tsx (existing RoleGuard component)
@src/components/navigation/sidebar.tsx (full sidebar with nav items)
@src/lib/auth/auth-context.tsx (AuthUser with permissions field from Plan 1)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add MANAGER permission checks to middleware</name>
  <files>
    src/middleware.ts
  </files>
  <action>
1. Import `PERMISSION_GATED_PATHS` and `UserPermissions` from `@/lib/auth/permissions`.

2. After the DRIVER guard block (line ~103) and before the tenant header injection (line ~106), add a MANAGER permission guard:
   ```
   // MANAGER permission guard: check granular permissions for gated paths
   if (session.role === 'MANAGER') {
     const gatedRoute = PERMISSION_GATED_PATHS.find((g) =>
       pathname.startsWith('/' + g.path.replace(/^\//, ''))
     );
     if (gatedRoute) {
       const permissions = (session.permissions ?? {}) as UserPermissions;
       if (!permissions[gatedRoute.permission]) {
         return NextResponse.redirect(new URL('/unauthorized', request.url));
       }
     }
   }
   ```
   Note: `session.permissions` is available because Plan 1 adds it to SessionData. The paths in PERMISSION_GATED_PATHS already have leading slashes, so use `pathname.startsWith(g.path)` directly.

3. Also add `/unauthorized` to the existing driver redirect exclusion if needed — verify the DRIVER guard doesn't redirect from /unauthorized. Currently OWNER_PATHS does not include /unauthorized, so this should be fine.
  </action>
  <verify>
    - `npx tsc --noEmit --pretty 2>&1 | head -20` — no errors
    - Middleware code has MANAGER permission check after DRIVER guard
    - OWNER role is NOT affected (no check for OWNER in the new block)
  </verify>
  <done>MANAGER users hitting /payroll, /invoices, /crm, /ai-documents, /lane-analytics, /profit-predictor, /ifta, /settings/*, /subscription, /billing without the corresponding permission are redirected to /unauthorized. OWNER users pass through unaffected.</done>
</task>

<task type="auto">
  <name>Task 2: Create PermissionGuard component and filter sidebar</name>
  <files>
    src/lib/auth/guards.tsx
    src/components/navigation/sidebar.tsx
  </files>
  <action>
1. In `src/lib/auth/guards.tsx`, add a `PermissionGuard` component below the existing `RoleGuard`:
   - Import `UserPermissions` from `@/lib/auth/permissions`
   - Props: `permission: keyof UserPermissions`, `children: React.ReactNode`, `fallback?: React.ReactNode`
   - Implementation: uses `useAuth()` to get user. If not loaded, return null. If user role is 'OWNER', always show children. If user role is 'MANAGER', check `user.permissions?.[permission]` — if true show children, otherwise show fallback. All other roles: show fallback.
   - Export the component.

2. In `src/components/navigation/sidebar.tsx`:
   - Import `PermissionGuard` from `@/lib/auth/guards`
   - In the "Intelligence" section, wrap these items with PermissionGuard:
     - `/lane-analytics` item -> `<PermissionGuard permission="canViewLaneAnalytics">...</PermissionGuard>`
     - `/profit-predictor` item -> `<PermissionGuard permission="canViewProfitPredictor">`
     - `/ifta` item -> `<PermissionGuard permission="canViewIFTA">`
   - In the "Business" section, wrap these items:
     - `/crm` item -> `<PermissionGuard permission="canViewCRM">`
     - `/invoices` item -> `<PermissionGuard permission="canViewInvoices">`
     - `/payroll` item -> `<PermissionGuard permission="canViewPayroll">`
     - `/ai-documents` item -> `<PermissionGuard permission="canViewAIDocuments">`
   - The "Settings" section currently shows only for `userRole === UserRole.OWNER`. Change this:
     - Keep the OWNER-only condition for the whole section BUT also show it to MANAGERs who have `canManageSettings` or `canViewBilling`. The simplest approach: remove the `userRole === UserRole.OWNER` condition from the section wrapper and instead wrap individual items:
       - `/subscription` -> `<PermissionGuard permission="canViewBilling">`
       - `/settings/expense-categories` -> `<PermissionGuard permission="canManageSettings">`
       - `/settings/expense-templates` -> `<PermissionGuard permission="canManageSettings">`
       - `/settings/integrations` -> `<PermissionGuard permission="canManageSettings">`
     - The section itself should show if user is OWNER OR if user is MANAGER (since the individual guards handle visibility). Use `canViewFleetIntelligence` (already true for both OWNER and MANAGER) or just `userRole === UserRole.OWNER || userRole === UserRole.MANAGER`.
   - Items that are NOT gated (dashboard, trucks, drivers, routes, loads, live-map, safety, fuel, compliance, tags, support, messages, hours, incidents) should remain visible to all OWNER/MANAGER users with no PermissionGuard wrapper.
  </action>
  <verify>
    - `npx tsc --noEmit --pretty 2>&1 | head -20` — no errors
    - Sidebar imports PermissionGuard
    - Gated items are wrapped with PermissionGuard
    - Non-gated items remain unwrapped
    - Settings section visible to MANAGER users (individual items filtered by permission)
  </verify>
  <done>Sidebar dynamically shows/hides nav items based on MANAGER permissions. OWNER sees everything. MANAGER sees only items they have permissions for. Non-gated items visible to both.</done>
</task>

</tasks>

---

## Plan 3 of 4: Team Permissions Settings Page

<objective>
Create the settings page where OWNER users can view their MANAGER team members and toggle individual permissions for each one.

Purpose: Give the OwnerAdmin a UI to control what each MANAGER can access.
Output: /settings/team-permissions page with toggle cards per MANAGER user.
</objective>

<context>
@src/lib/auth/permissions.ts (UserPermissions, PERMISSION_LABELS, DEFAULT_MANAGER_PERMISSIONS)
@src/lib/auth/server.ts (requireRole, requireAuth, getSession)
@src/lib/context/tenant-context.ts (getTenantPrisma, requireTenantId)
@src/app/(owner)/actions/payroll.ts (pattern for server actions — first 15 lines)
@src/app/(owner)/settings/expense-templates/page.tsx (pattern for settings pages)
@src/components/navigation/sidebar.tsx (Settings section to add Team Permissions link)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create team-permissions server action</name>
  <files>
    src/app/(owner)/actions/team-permissions.ts
  </files>
  <action>
1. Create `src/app/(owner)/actions/team-permissions.ts` with 'use server' directive.

2. Import: `requireRole` from `@/lib/auth/server`, `UserRole` from `@/lib/auth/roles`, `getTenantPrisma`/`requireTenantId` from tenant-context, `UserPermissions`/`DEFAULT_MANAGER_PERMISSIONS`/`getPermissions` from `@/lib/auth/permissions`, `revalidatePath` from `next/cache`.

3. `getTeamMembers()`:
   - `await requireRole([UserRole.OWNER])` — OWNER only
   - Get tenant prisma via `getTenantPrisma()`
   - Query all users where `role: 'MANAGER'` and `isActive: true`, select: `id, email, firstName, lastName, permissions`
   - Map results: for each user, parse `permissions` via `getPermissions({ role: 'MANAGER', permissions: user.permissions })` and return `{ id, email, firstName, lastName, permissions: UserPermissions }`
   - Return the mapped array

4. `updateUserPermissions(userId: string, permissions: UserPermissions)`:
   - `await requireRole([UserRole.OWNER])` — OWNER only
   - `const tenantId = await requireTenantId()`
   - Get tenant prisma
   - Verify the target user exists, belongs to this tenant, and is MANAGER role (security check — prevent OWNER from editing another OWNER or cross-tenant)
   - Update user: `prisma.user.update({ where: { id: userId }, data: { permissions: permissions as any } })`
   - `revalidatePath('/settings/team-permissions')`
   - Return `{ success: true }`
  </action>
  <verify>
    - `npx tsc --noEmit --pretty 2>&1 | head -20` — no errors
    - File exports getTeamMembers and updateUserPermissions
    - Both functions require OWNER role
  </verify>
  <done>Server actions exist for fetching MANAGER users with permissions and updating individual user permissions. Both enforce OWNER-only access.</done>
</task>

<task type="auto">
  <name>Task 2: Create team-permissions settings page and add sidebar link</name>
  <files>
    src/app/(owner)/settings/team-permissions/page.tsx
    src/components/navigation/sidebar.tsx
  </files>
  <action>
1. Create `src/app/(owner)/settings/team-permissions/page.tsx`:
   - This is a client component ('use client') because it needs interactive toggle state
   - Import `getTeamMembers`, `updateUserPermissions` from actions
   - Import `UserPermissions`, `PERMISSION_LABELS`, `DEFAULT_MANAGER_PERMISSIONS` from permissions
   - Import shadcn components: Card, CardHeader, CardTitle, CardContent, Switch, Label, Badge, Button
   - Import `useAuth` from auth-context, `UserRole` from roles
   - Import `useEffect`, `useState`, `useTransition` from react
   - Import `toast` from sonner
   - Import `redirect` from next/navigation, `Users` and `Shield` from lucide-react

   Page layout:
   - Header: "Team Permissions" title with subtitle "Control what your team members can access"
   - On mount, fetch team members by calling the server action `getTeamMembers()` (server actions can be called from client components directly)
   - If no MANAGERs exist, show empty state card: Users icon, "No team members yet", "Invite team members from the Drivers page to configure their permissions" with a link to /drivers
   - For each MANAGER user, render a Card:
     - CardHeader: user name (firstName + lastName, fallback to email), email as subtitle, Badge showing "Manager"
     - CardContent: a grid of 9 permission toggles (2 columns on desktop, 1 on mobile)
     - Each toggle: shadcn Switch + Label with permission label and description from PERMISSION_LABELS
     - Switch checked state tracks local permissions state per user
     - On toggle change, call `updateUserPermissions(userId, updatedPermissions)` using useTransition for pending state
     - Show toast on success ("Permissions updated") or error
   - Add redirect check: if user is MANAGER (check via useAuth), redirect to /dashboard

2. In `src/components/navigation/sidebar.tsx`:
   - Add a "Team Permissions" nav item in the Settings section, BEFORE the existing items
   - Use `Shield` icon from lucide-react (already imported? check — if not, add to imports)
   - Link to `/settings/team-permissions`
   - This item should ONLY show for OWNER role (use `RoleGuard` with `[UserRole.OWNER]` or a direct role check). Do NOT use PermissionGuard here — this is an OWNER-exclusive feature, not permission-gated.
   - Import `RoleGuard` from `@/lib/auth/guards` if using that approach, or wrap with the existing `userRole === UserRole.OWNER` pattern used elsewhere in the sidebar.
   - Since the Settings section is now visible to MANAGER too (from Plan 2), add Team Permissions inside the section but wrap it so only OWNER sees it: `{userRole === UserRole.OWNER && (<SidebarMenuItem>...</SidebarMenuItem>)}`
  </action>
  <verify>
    - `npx tsc --noEmit --pretty 2>&1 | head -20` — no errors
    - Page exists at /settings/team-permissions
    - Sidebar shows "Team Permissions" link for OWNER users in Settings section
    - Page has toggle UI for each permission per MANAGER user
  </verify>
  <done>OWNER users can navigate to /settings/team-permissions, see all MANAGER team members, and toggle individual permissions on/off. Changes save immediately. MANAGER users cannot access this page.</done>
</task>

</tasks>

---

## Plan 4 of 4: Server-Side Permission Guards on Sensitive Actions

<objective>
Add server-side permission enforcement to sensitive server actions so that even if a MANAGER bypasses the UI/middleware, the server actions themselves reject unauthorized access.

Purpose: Defense-in-depth — server actions are the last line of security.
Output: Payroll, invoice, CRM, AI documents, lane analytics, profit predictor, IFTA, and settings server actions check MANAGER permissions.
</objective>

<context>
@src/lib/auth/permissions.ts (UserPermissions, hasPermission, getPermissions)
@src/lib/auth/server.ts (requireRole, getSession, requireAuth)
@src/app/(owner)/actions/payroll.ts (first 30 lines — requireRole pattern)
@src/app/(owner)/actions/invoices.ts (first 15 lines — requireRole pattern)
@src/app/(owner)/actions/customers.ts (first 15 lines — CRM actions)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create requirePermission helper</name>
  <files>
    src/lib/auth/require-permission.ts
  </files>
  <action>
1. Create `src/lib/auth/require-permission.ts`:
   - Import `getSession` from `./session`
   - Import `UserPermissions`, `hasPermission`, `getPermissions` from `./permissions`
   - Export `async function requirePermission(key: keyof UserPermissions): Promise<void>`
     - Get session via `getSession()`, throw 'Unauthorized' if null
     - If session.role is 'OWNER', return immediately (always allowed)
     - If session.role is 'MANAGER':
       - Parse permissions from session: `const perms = session.permissions ?? {}` cast to UserPermissions
       - If `!perms[key]`, throw new Error('PERMISSION_DENIED: You do not have access to this feature')
     - All other roles: throw 'Unauthorized'
  </action>
  <verify>
    - `npx tsc --noEmit --pretty 2>&1 | head -20` — no errors
    - File exports requirePermission function
  </verify>
  <done>requirePermission helper exists and can be called from any server action to enforce granular MANAGER permissions</done>
</task>

<task type="auto">
  <name>Task 2: Add permission checks to sensitive server actions</name>
  <files>
    src/app/(owner)/actions/payroll.ts
    src/app/(owner)/actions/invoices.ts
    src/app/(owner)/actions/customers.ts
    src/app/(owner)/actions/ai-documents.ts
    src/app/(owner)/actions/lane-analytics.ts
    src/app/(owner)/actions/profit-predictor.ts
    src/app/(owner)/actions/ifta.ts
    src/app/(owner)/actions/subscription.ts
    src/app/(owner)/actions/expense-categories.ts
    src/app/(owner)/actions/expense-templates.ts
    src/app/(owner)/actions/integrations.ts
  </files>
  <action>
For each file below, add `import { requirePermission } from '@/lib/auth/require-permission'` and add the requirePermission call AFTER the existing requireRole call (keep requireRole — it ensures OWNER or MANAGER, then requirePermission further restricts MANAGER):

1. `payroll.ts` — Add `await requirePermission('canViewPayroll')` after each `requireRole` call in every exported function
2. `invoices.ts` — Add `await requirePermission('canViewInvoices')` after each `requireRole` call
3. `customers.ts` — Add `await requirePermission('canViewCRM')` after each `requireRole` call (CRM = customers)
4. `ai-documents.ts` — Add `await requirePermission('canViewAIDocuments')` after each `requireRole` call
5. `lane-analytics.ts` — Add `await requirePermission('canViewLaneAnalytics')` after each `requireRole` call
6. `profit-predictor.ts` — Add `await requirePermission('canViewProfitPredictor')` after each `requireRole` call
7. `ifta.ts` — Add `await requirePermission('canViewIFTA')` after each `requireRole` call
8. `subscription.ts` — Add `await requirePermission('canViewBilling')` after each `requireRole` call
9. `expense-categories.ts` — Add `await requirePermission('canManageSettings')` after each `requireRole` call
10. `expense-templates.ts` — Add `await requirePermission('canManageSettings')` after each `requireRole` call
11. `integrations.ts` — Add `await requirePermission('canManageSettings')` after each `requireRole` call

Pattern for each file:
```typescript
import { requirePermission } from '@/lib/auth/require-permission';

// In each exported async function, after the requireRole line:
export async function someAction(...) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);
  await requirePermission('canViewPayroll'); // ADD THIS LINE
  // ... rest of function
}
```

IMPORTANT: For functions that only allow OWNER (requireRole([UserRole.OWNER])), do NOT add requirePermission — OWNER always passes. Only add to functions that allow MANAGER.
  </action>
  <verify>
    - `npx tsc --noEmit --pretty 2>&1 | head -30` — no errors
    - grep for `requirePermission` in all modified files to confirm it's added
    - Each sensitive action file has the import and the call
  </verify>
  <done>All sensitive server actions enforce granular permissions. MANAGER users without the relevant permission get PERMISSION_DENIED errors even if they bypass the middleware/UI. OWNER users are unaffected (requirePermission short-circuits for OWNER role).</done>
</task>

</tasks>

---

## Execution Order

| Order | Plan | Description | Files |
|-------|------|-------------|-------|
| 1 | Plan 1 | DB + Types + Auth chain | permissions.ts, schema.prisma, migration, session.ts, auth-context.tsx, login route, me route |
| 2 | Plan 2 | Middleware + PermissionGuard + Sidebar | middleware.ts, guards.tsx, sidebar.tsx |
| 3 | Plan 3 | Team Permissions settings page | team-permissions action, page, sidebar link |
| 4 | Plan 4 | Server-side action guards | require-permission.ts, 11 action files |

Plans 2, 3, and 4 all depend on Plan 1. Plans 2/3/4 are independent of each other but should run sequentially since Plan 2 and Plan 3 both modify sidebar.tsx.

## Post-Execution: Manual Steps

After all 4 plans execute:
1. Run the DB migration: `npx prisma migrate deploy` (or apply the SQL manually)
2. Log out and log back in to refresh the session cookie with permissions
3. Test: create a MANAGER user, verify they see no gated items, then grant permissions via /settings/team-permissions
