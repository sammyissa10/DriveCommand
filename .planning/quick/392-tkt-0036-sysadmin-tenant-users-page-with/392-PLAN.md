---
phase: quick-392
plan: 392
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(admin)/actions/users.ts
  - apps/web/src/app/(admin)/users/page.tsx
  - apps/web/src/app/(admin)/users/users-list.tsx
  - apps/web/src/middleware.ts
  - apps/web/src/app/(admin)/layout.tsx
autonomous: true

must_haves:
  truths:
    - "Sysadmin can navigate to /users from the admin nav and see every user across every tenant in one table"
    - "Search box filters Name, Email, and Tenant Name client-side in real time"
    - "Role, Status, and Tenant dropdown filters narrow the table client-side"
    - "Non-sysadmin users hitting /users are redirected (middleware + layout + action guard all enforce)"
    - "Sensitive fields (passwordHash, licenseNumber, permissions, isDispatchReady, isSample, isSystemAdmin) never reach the client"
  artifacts:
    - path: "apps/web/src/app/(admin)/actions/users.ts"
      provides: "getAllUsers() server action with local requireAdminAccess and tenant join"
      contains: "async function requireAdminAccess"
    - path: "apps/web/src/app/(admin)/users/page.tsx"
      provides: "Server component that fetches users and renders client list"
      exports: ["default"]
    - path: "apps/web/src/app/(admin)/users/users-list.tsx"
      provides: "Client component with TanStack Table, search, and 3 filter dropdowns"
      contains: "'use client'"
    - path: "apps/web/src/middleware.ts"
      provides: "ADMIN_ALLOWED_PATHS includes '/users'"
      contains: "'/users'"
    - path: "apps/web/src/app/(admin)/layout.tsx"
      provides: "Nav link to /users after Tenants link"
      contains: "href=\"/users\""
  key_links:
    - from: "apps/web/src/app/(admin)/users/page.tsx"
      to: "apps/web/src/app/(admin)/actions/users.ts"
      via: "getAllUsers() import + await call"
      pattern: "from '@/app/\\(admin\\)/actions/users'"
    - from: "apps/web/src/app/(admin)/users/page.tsx"
      to: "apps/web/src/app/(admin)/users/users-list.tsx"
      via: "passes users prop to UsersList client component"
      pattern: "<UsersList"
    - from: "apps/web/src/app/(admin)/actions/users.ts"
      to: "prisma.user (bare client)"
      via: "cross-tenant findMany with tenant include"
      pattern: "prisma\\.user\\.findMany"
---

<objective>
Build a sysadmin-only Tenant Users page at `/users` that lists every non-sample, non-sysadmin user across every tenant with client-side search and three filter dropdowns (Role, Status, Tenant). Pure pattern-lift from the existing `/tenants` admin page — same three-layer auth guard, same bare-prisma cross-tenant read, same TanStack Table + Tailwind layout.

Purpose: Sysadmin can find any tenant user for support without logging into individual tenants (TKT-0036).
Output: New `/users` route, new server action `getAllUsers`, nav link, middleware allowlist entry.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/src/app/(admin)/actions/tenants.ts
@apps/web/src/app/(admin)/tenants/page.tsx
@apps/web/src/app/(admin)/tenants/tenant-list-client.tsx
@apps/web/src/middleware.ts
@apps/web/src/app/(admin)/layout.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create getAllUsers server action</name>
  <files>apps/web/src/app/(admin)/actions/users.ts</files>
  <action>
    Create new server action file. Pattern-lift from `apps/web/src/app/(admin)/actions/tenants.ts`:

    1. Start with `'use server';` directive.
    2. Imports:
       - `import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';`
       - `import { prisma } from '@/lib/db/prisma';` (BARE client — intentional cross-tenant read for sysadmin)
    3. Duplicate `requireAdminAccess()` locally — DO NOT import from tenants.ts (per task spec constraint). Same body: `await requireAuth(); const admin = await isSystemAdmin(); if (!admin) throw new Error('Unauthorized: Admin access required');`
    4. Export type `AdminUserRow` matching the select shape:
       ```ts
       export type AdminUserRow = {
         id: string;
         firstName: string | null;
         lastName: string | null;
         email: string;
         role: string;
         isActive: boolean;
         createdAt: Date;
         tenantId: string | null;
         tenant: { name: string } | null;
       };
       ```
       (Confirm exact nullability against Prisma schema for User.firstName/lastName/tenantId — adjust if non-null. Do NOT change schema.)
    5. Export `async function getAllUsers(): Promise<AdminUserRow[]>`:
       - First line: `await requireAdminAccess();`
       - Query:
         ```ts
         return prisma.user.findMany({
           where: { isSample: false, isSystemAdmin: false },
           select: {
             id: true,
             firstName: true,
             lastName: true,
             email: true,
             role: true,
             isActive: true,
             createdAt: true,
             tenantId: true,
             tenant: { select: { name: true } },
           },
           orderBy: { createdAt: 'desc' },
         });
         ```
    6. DO NOT select `passwordHash`, `licenseNumber`, `permissions`, `isDispatchReady`, `isSample`, `isSystemAdmin` — these must never reach the client.
    7. DO NOT use `getTenantPrisma()` — bare `prisma` is intentional for cross-tenant sysadmin reads (matches tenants.ts).
  </action>
  <verify>
    `npx tsc --noEmit` in `apps/web` exits 0. Grep confirms file contains `'use server'`, `prisma.user.findMany`, `isSample: false`, `isSystemAdmin: false`, and does NOT contain `passwordHash`, `licenseNumber`, `permissions`, `getTenantPrisma`.
  </verify>
  <done>
    `apps/web/src/app/(admin)/actions/users.ts` exists, exports `getAllUsers` and `AdminUserRow`, compiles cleanly, only selects the 9 whitelisted fields, and contains a local `requireAdminAccess`.
  </done>
</task>

<task type="auto">
  <name>Task 2: Create /users server page and client list component</name>
  <files>apps/web/src/app/(admin)/users/page.tsx, apps/web/src/app/(admin)/users/users-list.tsx</files>
  <action>
    Create two files. Pattern-lift from `apps/web/src/app/(admin)/tenants/page.tsx` and `tenant-list-client.tsx`.

    **File A: `apps/web/src/app/(admin)/users/page.tsx`** (server component, no `'use client'`):
    - `import { getAllUsers } from '@/app/(admin)/actions/users';`
    - `import { UsersList } from './users-list';`
    - Default async export:
      ```tsx
      export default async function UsersPage() {
        const users = await getAllUsers();
        return (
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Tenant Users</h1>
              <p className="text-gray-600 mt-1">Search and view users across all tenants</p>
            </div>
            <UsersList users={users} />
          </div>
        );
      }
      ```
    - No client interactivity here — guard already happens via (admin)/layout.tsx + getAllUsers' requireAdminAccess. Three-layer defense is fine.

    **File B: `apps/web/src/app/(admin)/users/users-list.tsx`** (client component):
    - Start with `'use client';`
    - Imports:
      - `useState, useMemo` from react
      - TanStack Table v8: `useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, flexRender, type SortingState, type ColumnDef`
      - `format` from `date-fns`
      - `type AdminUserRow` from `@/app/(admin)/actions/users`
    - Props: `{ users: AdminUserRow[] }`
    - State:
      - `sorting: SortingState` (default `[]`)
      - `globalFilter: string` (default `''`)
      - `roleFilter: string` (default `'ALL'`) — values: ALL | OWNER | MANAGER | DRIVER
      - `statusFilter: string` (default `'ALL'`) — values: ALL | ACTIVE | INACTIVE
      - `tenantFilter: string` (default `'ALL'`) — values: ALL | tenant name
    - Compute `tenantOptions` via `useMemo`: distinct, sorted `tenant?.name` values from `users` (filter out null).
    - Compute `filteredUsers` via `useMemo`: apply roleFilter, statusFilter, tenantFilter BEFORE passing to the table. Pass `filteredUsers` as table data. (globalFilter handled by table via `state.globalFilter` + `onGlobalFilterChange`.)
    - Configure table's `globalFilterFn` to be a custom function that searches `firstName + ' ' + lastName`, `email`, and `tenant?.name ?? ''` case-insensitively. Or set the table's default `globalFilterFn: 'includesString'` and provide an `accessorFn` per searchable column — pick the simpler approach: write one custom filterFn at the table level that checks all four fields.
    - Columns (`ColumnDef<AdminUserRow>[]`):
      1. **Name** — `accessorFn: r => \`${r.firstName ?? ''} ${r.lastName ?? ''}\`.trim() || '—'`. Cell renders as `<a href={\`mailto:${row.original.email}\`} className="text-blue-600 hover:underline">{value}</a>`.
      2. **Email** — `accessorKey: 'email'`. Plain text cell.
      3. **Tenant** — `accessorFn: r => r.tenant?.name ?? '—'`. Cell wraps the name in `<span title={row.original.tenantId ?? ''}>` for tooltip.
      4. **Role** — `accessorKey: 'role'`. Cell renders a badge: `OWNER` → `bg-purple-100 text-purple-800`, `MANAGER` → `bg-blue-100 text-blue-800`, `DRIVER` → `bg-green-100 text-green-800`. Use `<span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium {colorClasses}">`.
      5. **Status** — `accessorKey: 'isActive'`. Cell renders a colored dot + label: active → `<span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-green-500" />Active</span>`, inactive → gray dot + "Inactive".
      6. **Created** — `accessorKey: 'createdAt'`. Cell: `format(new Date(value), 'MMM d, yyyy')`.
    - Layout:
      - Top control row: search input (placeholder "Search name, email, or tenant…") on left, three filter `<select>` dropdowns on right. Use Tailwind classes consistent with tenant-list-client.tsx (`border border-gray-300 rounded-md px-3 py-2 text-sm`).
      - Plain HTML `<table>` (no DataTable abstraction). Headers click-to-sort via `header.column.getToggleSortingHandler()`. Use the same table chrome as tenant-list-client.tsx (`<table className="min-w-full divide-y divide-gray-200">`, etc.).
      - Empty state: when `table.getRowModel().rows.length === 0`, render a single row with colSpan covering all columns and the text "No users match the current filters" centered with `text-gray-500 py-8`.
    - DO NOT add pagination. DO NOT add row actions (no edit/delete — sysadmin reads only here).
  </action>
  <verify>
    `npx tsc --noEmit` in `apps/web` exits 0. `npm run build` (or `next build`) compiles the route without warnings. Manual: as sysadmin, visit `/users` — see table, search filters in real time, three dropdowns narrow results, role badges show correct colors, status dots correct, mailto link opens email client, tenantId visible on tenant hover. Non-sysadmin: hitting `/users` redirects per layout guard. (Middleware allowlist task is in Task 3 — until that runs, sysadmin will get bounced by middleware; verify in conjunction with Task 3.)
  </verify>
  <done>
    Both files exist. `/users` route renders the page with search + 3 filters + 6 columns. Empty state shows correctly when filters exclude all rows. No sensitive fields appear in client bundle (search bundle output for `passwordHash` — must be absent).
  </done>
</task>

<task type="auto">
  <name>Task 3: Wire middleware allowlist and add nav link</name>
  <files>apps/web/src/middleware.ts, apps/web/src/app/(admin)/layout.tsx</files>
  <action>
    Two small edits to existing files.

    **Edit 1: `apps/web/src/middleware.ts` around line 154** — Add `'/users'` to the `ADMIN_ALLOWED_PATHS` array. Current line:
    ```ts
    const ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', '/admin-dashboard', '/tenants', '/billing', '/plans', '/promos', '/docs', '/unauthorized', '/onboarding', '/api', '/automations', '/notifications'];
    ```
    Change to (insert `'/users'` right after `'/tenants'` to keep alphabetical-ish grouping with related admin pages):
    ```ts
    const ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', '/admin-dashboard', '/tenants', '/users', '/billing', '/plans', '/promos', '/docs', '/unauthorized', '/onboarding', '/api', '/automations', '/notifications'];
    ```
    Note: There is no separate non-admin `/users` route in `(app)` that would conflict — `startsWith('/users')` will only match the new admin route. Confirm with a grep of `apps/web/src/app/users` (should not exist) before committing.

    **Edit 2: `apps/web/src/app/(admin)/layout.tsx`** — Add a new `<Link href="/users">Users</Link>` immediately after the existing Tenants link (currently lines 39–44). Use the exact same className: `"text-white hover:text-gray-300 font-medium"`. Insert block:
    ```tsx
    <Link
      href="/users"
      className="text-white hover:text-gray-300 font-medium"
    >
      Users
    </Link>
    ```
    Place it right after the Tenants `</Link>` closing tag and before the Support `<Link>`.
  </action>
  <verify>
    Grep `apps/web/src/middleware.ts` for `'/users'` — present in ADMIN_ALLOWED_PATHS array. Grep `apps/web/src/app/(admin)/layout.tsx` for `href="/users"` — present once. `npx tsc --noEmit` exits 0. Manual: as sysadmin, click "Users" in the top nav — lands on `/users` and table renders. As a non-sysadmin authenticated user, navigating to `/users` redirects to `/admin-support` (middleware) or `/sign-in` (layout fallback).
  </verify>
  <done>
    Middleware allows `/users` for sysadmin. Nav link appears between Tenants and Support. Full guard chain (middleware → layout → action) all block non-sysadmins. End-to-end flow works: sign in as sysadmin → click Users → search/filter/sort the cross-tenant user list.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` (run from `apps/web`) exits 0.
- Sysadmin login → `/users` → page loads, all expected users present (no isSample, no isSystemAdmin rows).
- Search box filters live across name, email, tenant name.
- Each filter dropdown (Role, Status, Tenant) narrows table; combined filters AND together.
- Click column headers to sort (Name, Email, Tenant, Role, Status, Created).
- Empty state appears when filters exclude all rows.
- Non-sysadmin (owner role) hitting `/users` → redirected (middleware bounces to `/admin-support`).
- Client bundle does NOT contain `passwordHash`, `licenseNumber`, or `permissions` field names from User payload (grep network response JSON in DevTools).
</verification>

<success_criteria>
- New `/users` route accessible to sysadmin, blocked for everyone else by all three guard layers.
- `getAllUsers()` returns only the 9 whitelisted fields, sorted createdAt DESC, excluding sample + sysadmin rows.
- TanStack Table renders 6 columns with the specified styling (role badges, status dots, mailto link, tenantId tooltip, formatted date).
- Search + 3 filters work client-side with no network round-trip.
- No pagination, no DataTable abstraction (matches `/tenants` pattern exactly).
- Nav link "Users" appears after "Tenants" in the admin header.
</success_criteria>

<output>
After completion, create `.planning/quick/392-tkt-0036-sysadmin-tenant-users-page-with/392-SUMMARY.md` documenting:
- Files created (3) and modified (2)
- Confirmation that bare `prisma` was used (not `getTenantPrisma`) and why (sysadmin cross-tenant read)
- Confirmation that `requireAdminAccess` was duplicated locally (not imported)
- Confirmation of the field whitelist (no sensitive fields exposed)
- Any deviations from the spec, with rationale
</output>
