---
status: resolved
trigger: "TKT-0036 — sysadmin All Users diagnostic: map existing sysadmin surface for new /users page"
created: 2026-05-19T00:00:00Z
updated: 2026-05-19T00:00:00Z
read_only: true
---

## Current Focus

hypothesis: N/A — this is a pattern-mapping exercise, not a bug
test: N/A
expecting: N/A
next_action: COMPLETE — all patterns documented, recommendations written

## Symptoms

expected: A clear map of how the sysadmin portal is structured so the new /users page follows established conventions exactly.
actual: No diagnostic document existed — starting fresh investigation.
errors: None — not a bug.
reproduction: N/A
timeline: Ticket submitted May 16, 2026 from /tenants by sysadmin@drivecommand.com.

## Eliminated

(none — diagnostic only, no hypotheses to eliminate)

## Evidence

- timestamp: 2026-05-19
  checked: apps/web/src/app/(admin)/** glob
  found: Route group is `(admin)` — all sysadmin routes live under this directory. The URL segment is NOT /admin — it uses the Next.js route group convention so the segment is invisible. Actual URLs are /admin-dashboard, /tenants, /admin-support, /billing, /plans, /promos, /docs, /notifications, /automations.
  implication: New page URL must follow the same pattern — the directory is (admin)/users/ but the URL will be /users.

- timestamp: 2026-05-19
  checked: apps/web/src/app/(admin)/layout.tsx
  found: Layout runs two server-side auth checks: `getSession()` → redirect /sign-in if no session; `isSystemAdmin()` → redirect /sign-in if not admin. Both are called directly in the layout, with no middleware-level route guard for admin paths beyond what middleware enforces.
  implication: Auth is doubly enforced: middleware restricts sysadmin users to ADMIN_ALLOWED_PATHS, and the layout redirects non-admins back to /sign-in. New page inherits this automatically by living inside (admin)/.

- timestamp: 2026-05-19
  checked: apps/web/src/middleware.ts lines 154-160
  found: Middleware ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', '/admin-dashboard', '/tenants', '/billing', '/plans', '/promos', '/docs', '/unauthorized', '/onboarding', '/api', '/automations', '/notifications']. The new /users path is NOT in this list.
  implication: CRITICAL — /users must be added to ADMIN_ALLOWED_PATHS before the new page will be accessible to sysadmin users. Without this, middleware will redirect the sysadmin to /admin-support on every visit.

- timestamp: 2026-05-19
  checked: apps/web/src/lib/auth/supabase.ts
  found: `isSystemAdmin()` reads `session?.isSystemAdmin` from Supabase JWT app_metadata (fast path, no DB call). `requireAdminAccess()` in actions/tenants.ts calls `requireAuth()` then `isSystemAdmin()` and throws 'Unauthorized: Admin access required' if false.
  implication: Server actions use a local `requireAdminAccess()` helper pattern, not a shared exported helper. The new action file should define the same local helper at the top.

- timestamp: 2026-05-19
  checked: apps/web/src/app/(admin)/actions/tenants.ts (full file)
  found: All functions call local `requireAdminAccess()` which does requireAuth() + isSystemAdmin() check. All DB access uses bare `prisma` (imported from @/lib/db/prisma), never getTenantPrisma. No tenantId filter on cross-tenant queries. Structured logging via `logger` from @/lib/logger.
  implication: New actions/users.ts file should follow the exact same pattern: local requireAdminAccess(), import prisma from @/lib/db/prisma, no tenantId filter on the cross-tenant findMany.

- timestamp: 2026-05-19
  checked: apps/web/src/app/(admin)/tenants/tenant-list-client.tsx
  found: UI stack is TanStack Table v8 (`@tanstack/react-table`) — imports useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel, flexRender, ColumnDef. Search is CLIENT-SIDE using TanStack's globalFilter with `getFilteredRowModel()` — a plain `<input>` with `onChange={e => setGlobalFilter(e.target.value)}`. No debounce. No pagination — all rows rendered at once.
  implication: For a Users list that could have hundreds of rows across all tenants (much larger dataset than the Tenants list), the same client-side filter is fine if total user count stays manageable. If scale grows, server-side search + pagination would be needed. For the MVP page, follow the client-side pattern exactly.

- timestamp: 2026-05-19
  checked: apps/web/src/app/(admin)/tenants/tenant-list-client.tsx columns
  found: Tenants table columns: Name | Slug | Status (badge) | Users count | Trucks count | Routes count | Created | View (link) | Actions (Suspend/Delete buttons). Table uses plain HTML <table><thead><tbody> styled with Tailwind, wrapped in a white card div. Status is a colored badge (green=Active, yellow=Pending, red=Suspended).
  implication: Users table should follow the same plain HTML table + Tailwind pattern. Do NOT introduce AG Grid, shadcn DataTable, or any other table library. Role badges already exist in tenant-users-section.tsx.

- timestamp: 2026-05-19
  checked: apps/web/src/app/(admin)/tenants/[id]/tenant-users-section.tsx
  found: Existing per-tenant users table already shows: Name | Email | Role (badge, purple=OWNER/blue=MANAGER/green=DRIVER) | Status (green dot=Active/gray=Inactive) | Actions (dropdown: Send Password Reset, Change Role). Data fetched via `fetch('/api/admin/tenants/${tenantId}/users')` — REST GET, not a server action. Role change via `fetch('/api/admin/users/${userId}/role', { method: 'PATCH' })`.
  implication: Role badge classes and the status dot pattern are already established — reuse `getRoleBadgeClasses()` (defined locally there). The new All Users page will be read-mostly so actions column is optional for MVP.

- timestamp: 2026-05-19
  checked: apps/web/src/app/api/admin/tenants/[id]/users/route.ts
  found: Returns { id, firstName, lastName, email, role, isActive } per user for a single tenant. Auth: requireAuth() + isSystemAdmin() inline at the route level. Uses bare prisma, ordered by [role asc, firstName asc].
  implication: The new cross-tenant list needs a similar route or server action. Server action is preferred (consistent with tenants page) over a REST route.

- timestamp: 2026-05-19
  checked: apps/web/prisma/schema.prisma — User model (lines 236-402)
  found: User scalar fields: id (UUID PK), tenantId (UUID FK), email, passwordHash?, role (UserRole enum: OWNER|MANAGER|DRIVER), isSystemAdmin (Boolean), firstName?, lastName?, licenseNumber?, isActive (Boolean), permissions (Json?), isDispatchReady (Boolean), createdAt, updatedAt, isSample (Boolean). Relation: `tenant Tenant @relation(fields: [tenantId], references: [id])` — 1:1 relation, each user belongs to exactly one tenant. Indexes: @@unique([email, tenantId]), @@index([tenantId]), @@index([email]), @@index([tenantId, role, isActive]).
  implication: The relation is 1:1 (one user, one tenant) — straightforward join. Index coverage: tenantId is indexed (filter by tenant), email is indexed (search by email), composite [tenantId, role, isActive] covers filtered list. Cross-tenant query (no tenantId filter) will do a full table scan on User — acceptable for current scale, but note this for future.

- timestamp: 2026-05-19
  checked: User model fields for list vs. exclusion
  found: SAFE for list: id, firstName, lastName, email, role, isActive, createdAt, tenantId (for join). EXCLUDE from list: passwordHash (obviously), licenseNumber (PII), permissions (internal JSON), isDispatchReady (internal flag), isSample (internal flag), isSystemAdmin (internal flag).
  implication: Select exactly: id, firstName, lastName, email, role, isActive, createdAt, tenantId + tenant.name for the join.

- timestamp: 2026-05-19
  checked: Tenant model in schema.prisma
  found: Tenant has `name String` (not displayName). The `name` field is the display name used throughout the UI.
  implication: Join to tenant and select `tenant: { select: { name: true } }` to show tenant name in the Users list.

- timestamp: 2026-05-19
  checked: apps/web/src/app/(admin)/ nav links in layout.tsx
  found: Nav links are hardcoded in layout.tsx: Dashboard (/admin-dashboard), Tenants (/tenants), Support (/admin-support), Billing (/billing), Plans (/plans), Promos (/promos), Docs (/docs), Notifications (/notifications). No Users link exists yet.
  implication: Implementer must add a "Users" link to layout.tsx nav AND add '/users' to the ADMIN_ALLOWED_PATHS in middleware.ts.

- timestamp: 2026-05-19
  checked: apps/web/src/app/(admin)/actions/ for existing getAllUsers/listUsers
  found: No getAllUsers, listUsers, or getUsers function exists in any (admin)/actions/*.ts file. Only user queries that exist in admin context: findMany with `where: { tenantId }` inside suspendTenant/reactivateTenant (scoped), and findUnique in updateOwnerEmail.
  implication: New action getAllUsers() in (admin)/actions/users.ts must be created from scratch following the requireAdminAccess() + bare prisma pattern.

- timestamp: 2026-05-19
  checked: Card component usage in tenant detail page
  found: shadcn/ui Card, CardContent, CardHeader, CardTitle are imported from @/components/ui/card and used for section containers in the detail view. The list page (tenants/page.tsx) does NOT use Cards — it uses plain divs with `bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden` directly.
  implication: New users/page.tsx list view should match the tenants list page style (no Card wrapper around the table). Cards are for detail pages with multiple sections.

## Resolution

root_cause: N/A — diagnostic exercise, not a bug
fix: N/A
verification: N/A
files_changed: []

---

## RECOMMENDATIONS

### 1. Auth guard mechanism (exact file:line references)

**Two-layer enforcement — both must be satisfied:**

**Layer 1 — Middleware** (`apps/web/src/middleware.ts` line 154):
```
const ADMIN_ALLOWED_PATHS = ['/admin', '/admin-support', ... /* '/users' MISSING */];
if (appMeta.isSystemAdmin) {
  const isAdminPath = ADMIN_ALLOWED_PATHS.some((p) => pathname.startsWith(p));
  if (!isAdminPath) redirect('/admin-support');
}
```
ACTION REQUIRED: Add `'/users'` to this array before deploying the new page.

**Layer 2 — Layout** (`apps/web/src/app/(admin)/layout.tsx` lines 12-20):
```typescript
const session = await getSession();
if (!session) redirect('/sign-in');
const admin = await isSystemAdmin();
if (!admin) redirect('/sign-in');
```
New page inherits this automatically — no changes needed to layout.tsx for auth.

**Layer 3 — Action level** (pattern from `apps/web/src/app/(admin)/actions/tenants.ts` lines 16-22):
```typescript
async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) throw new Error('Unauthorized: Admin access required');
}
```
Copy this local helper verbatim into the new `(admin)/actions/users.ts` file.

`isSystemAdmin()` is at `apps/web/src/lib/auth/supabase.ts` line 119 — reads `session?.isSystemAdmin` from Supabase JWT app_metadata, no DB call.

---

### 2. Data-access pattern

- Import: `import { prisma } from '@/lib/db/prisma'`
- Use bare `prisma` (NOT `getTenantPrisma`) for cross-tenant queries
- No tenantId filter on the cross-tenant user list query
- Call `requireAdminAccess()` at the top of every exported function
- Use `logger` from `@/lib/logger` for any error logging
- Reference: `apps/web/src/app/(admin)/actions/tenants.ts`, `getAllTenants()` function

---

### 3. UI component stack

- **Table:** TanStack Table v8 (`@tanstack/react-table`) — useReactTable + getCoreRowModel + getSortedRowModel + getFilteredRowModel + flexRender + ColumnDef
- **Search:** Client-side globalFilter via `getFilteredRowModel()`, plain `<input>` with `onChange={e => setGlobalFilter(e.target.value)}`, NO debounce (matching existing convention)
- **Table HTML:** Plain `<table><thead><tbody>` with Tailwind classes — NOT shadcn DataTable
- **Wrapper:** `<div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">`
- **Header:** `<thead className="bg-gray-50">` / `<th className="text-left text-sm font-medium text-gray-500 uppercase px-6 py-3">`
- **Rows:** `<tr className="border-b hover:bg-gray-50">` / `<td className="px-6 py-4">`
- **Status badge:** `<span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium {colorClasses}">`
- **Role badge colors** (from `tenant-users-section.tsx`): OWNER=`bg-purple-100 text-purple-700`, MANAGER=`bg-blue-100 text-blue-700`, DRIVER=`bg-green-100 text-green-700`
- **Active indicator:** Green/gray dot `<span className="inline-block h-2 w-2 rounded-full bg-green-500" />`
- **Page structure:** Server component `page.tsx` fetches data + passes to `'use client'` list component (same split as `tenants/page.tsx` + `tenant-list-client.tsx`)

---

### 4. Recommended URL path

`/users`

The directory will be `apps/web/src/app/(admin)/users/page.tsx`. The `(admin)` route group is invisible in the URL, so the page renders at `/users`.

**Required changes before page works:**
1. Add `'/users'` to `ADMIN_ALLOWED_PATHS` in `apps/web/src/middleware.ts` (line 154)
2. Add `<Link href="/users">Users</Link>` to the nav in `apps/web/src/app/(admin)/layout.tsx`

---

### 5. Recommended columns for the user list

| Column | Source field | Notes |
|--------|-------------|-------|
| Name | `firstName + lastName` | Fallback: italic "No name" if both null |
| Email | `email` | Always present |
| Tenant | `tenant.name` | Requires `include: { tenant: { select: { name: true } } }` or `select: { tenant: { select: { name: true } } }` |
| Role | `role` | Colored badge: OWNER/MANAGER/DRIVER |
| Status | `isActive` | Green dot=Active, gray dot=Inactive |
| Created | `createdAt` | `toLocaleDateString()` |

**Exclude:** passwordHash, licenseNumber, permissions, isDispatchReady, isSample, isSystemAdmin

---

### 6. Recommended filters

- **Role dropdown:** Filter by OWNER | MANAGER | DRIVER (client-side column filter via TanStack's `columnFilters`)
- **Status toggle:** Active / Inactive / All (client-side)
- **Tenant dropdown:** Filter by tenant (client-side — pass all tenants as a prop, build a `<select>` that sets a column filter on `tenantId`)
- **Global search input:** Searches across all columns via TanStack globalFilter — covers Name and Email automatically since both are string columns in the data

For tenant filter: either client-side (filter the pre-fetched dataset) or add a separate tenantId URL param + re-fetch. Client-side is consistent with the tenants page convention. At large scale, add a `?tenantId=` search param for server-side filtering.

---

### 7. Search field — which DB columns to search

For the server action `getAllUsers()`:
- If doing server-side search (future): search on `email` (indexed) and `firstName`+`lastName` (not separately indexed but covered by full table scan that's already happening)
- For MVP client-side search: TanStack globalFilter searches all visible string columns automatically — no DB changes needed

---

### 8. Index coverage assessment

Existing indexes on User:
- `@@index([tenantId])` — covers per-tenant queries
- `@@index([email])` — covers email search
- `@@index([tenantId, role, isActive])` — covers filtered per-tenant queries

**Gap for the cross-tenant All Users query:**
A `prisma.user.findMany({})` with no tenantId filter will do a full User table scan. There is NO index designed for the cross-tenant case (no index on `role` alone, no index on `isActive` alone, no index on `createdAt` alone). At current scale (small number of tenants, small number of users per tenant), this is acceptable. Flag it as a future optimization if user count grows beyond ~10,000.

**No new indexes required for MVP.**

---

### 9. Gotchas and non-obvious patterns

1. **Middleware ADMIN_ALLOWED_PATHS** — This is the single most common way to accidentally break a new admin page. The sysadmin will be silently redirected to /admin-support without an error. Always add the new path to this list first.

2. **Route group URL stripping** — The `(admin)` directory name is stripped from the URL by Next.js. Links must use `/users`, not `/admin/users` or `/(admin)/users`.

3. **No getTenantPrisma in admin actions** — Admin actions always use bare `prisma`. `getTenantPrisma` adds a tenantId row-level context and is only for tenant-scoped operations. Using it in admin actions would silently restrict queries to a single tenant.

4. **requireAdminAccess is a local function, not a shared export** — Each admin action file defines its own local `requireAdminAccess()`. This is intentional (the function in tenants.ts is not exported). The new users.ts file must copy it.

5. **Server component + client component split** — The page.tsx must be a server component that awaits the data, then passes it to a `'use client'` component for TanStack Table state. Never put TanStack Table hooks in a server component.

6. **No pagination in existing list views** — The tenants list renders all rows at once. For a users list spanning all tenants, this could be a larger dataset. For MVP, follow the same pattern. Add pagination only if performance becomes an issue.

7. **isSample users** — The User model has an `isSample` boolean (seeded demo data). The All Users list should probably exclude sample users (`where: { isSample: false }`) to keep the list meaningful. The tenants list action (getAllTenants) doesn't filter by sampleDataSeeded but it's worth doing for users.

8. **passwordHash field exists** — User has a `passwordHash` field. The Prisma select must explicitly NOT include it. Use an explicit `select: { ... }` object, never `include` the whole User row.

9. **Card vs. plain div** — The tenants list page uses plain divs (`bg-white rounded-lg shadow-sm border`), not shadcn Card. The detail page uses Cards. Match the pattern for the page type.

10. **Nav link placement** — The nav in layout.tsx is a flat list. The Users link should be placed logically near Tenants (they are related entities). Suggested order: Dashboard | Tenants | Users | Support | Billing | Plans | Promos | Docs | Notifications.

---

## Complete (admin) Route Tree

All files under `apps/web/src/app/(admin)/`:

```
layout.tsx                               — Shared admin layout + nav + auth guard
(admin)/admin-dashboard/page.tsx         — URL: /admin-dashboard
(admin)/admin-support/page.tsx           — URL: /admin-support
(admin)/admin-support/ticket-list.tsx
(admin)/tenants/page.tsx                 — URL: /tenants
(admin)/tenants/new/page.tsx             — URL: /tenants/new
(admin)/tenants/[id]/page.tsx            — URL: /tenants/[id]
(admin)/tenants/[id]/tenant-status-controls.tsx
(admin)/tenants/[id]/tenant-edit-form.tsx
(admin)/tenants/[id]/owner-email-form.tsx
(admin)/tenants/[id]/resend-invitation-button.tsx
(admin)/tenants/[id]/copy-tenant-id-button.tsx
(admin)/tenants/[id]/reset-password-button.tsx
(admin)/tenants/[id]/tenant-settings-form.tsx
(admin)/tenants/[id]/tenant-users-section.tsx
(admin)/tenants/[id]/automation-runs-section.tsx
(admin)/tenants/[id]/activation-progress-section.tsx
(admin)/tenants/[id]/extend-trial-button.tsx
(admin)/tenants/tenant-list-client.tsx
(admin)/billing/page.tsx                 — URL: /billing
(admin)/billing/new/page.tsx             — URL: /billing/new
(admin)/billing/new/new-invoice-form.tsx
(admin)/billing/[id]/page.tsx            — URL: /billing/[id]
(admin)/billing/[id]/edit/page.tsx       — URL: /billing/[id]/edit
(admin)/billing/[id]/edit/edit-invoice-form.tsx
(admin)/billing/[id]/invoice-actions.tsx
(admin)/billing/mark-overdue-button.tsx
(admin)/plans/page.tsx                   — URL: /plans
(admin)/plans/new/page.tsx               — URL: /plans/new
(admin)/plans/new/new-plan-form.tsx
(admin)/plans/[id]/page.tsx              — URL: /plans/[id]
(admin)/plans/[id]/edit-plan-form.tsx
(admin)/plans/plans-list-client.tsx
(admin)/promos/page.tsx                  — URL: /promos
(admin)/promos/new/page.tsx              — URL: /promos/new
(admin)/promos/new/new-promo-form.tsx
(admin)/promos/promos-list-client.tsx
(admin)/automations/page.tsx             — URL: /automations
(admin)/automations/automations-list-client.tsx
(admin)/automations/[ruleId]/page.tsx    — URL: /automations/[ruleId]
(admin)/automations/[ruleId]/rule-detail-client.tsx
(admin)/notifications/page.tsx           — URL: /notifications
(admin)/notifications/notifications-tabs.tsx
(admin)/notifications/email-config-tab.tsx
(admin)/notifications/send-log-tab.tsx
(admin)/notifications/templates-tab.tsx
(admin)/notifications/health-tile.tsx
(admin)/docs/page.tsx                    — URL: /docs
(admin)/docs/layout.tsx
(admin)/docs/features/page.tsx           — URL: /docs/features
(admin)/docs/features/[slug]/page.tsx
(admin)/docs/operations/page.tsx         — URL: /docs/operations
(admin)/docs/operations/[slug]/page.tsx
(admin)/docs/database/page.tsx           — URL: /docs/database
(admin)/docs/database/[model]/page.tsx
(admin)/docs/database/DatabaseSchemaClient.tsx
(admin)/api/docs-index/route.ts
(admin)/actions/tenants.ts
(admin)/actions/sysadmin-invoices.ts
(admin)/actions/plans.ts
(admin)/actions/promos.ts
(admin)/actions/automations.ts
(admin)/actions/notifications.ts
```

**New page will add:**
```
(admin)/users/page.tsx                   — URL: /users
(admin)/users/user-list-client.tsx
(admin)/actions/users.ts
```

---

TKT-0036 diagnostic complete. Sysadmin auth pattern: layout-level isSystemAdmin() + middleware ADMIN_ALLOWED_PATHS + action-level requireAdminAccess() (local helper). Recommended URL: /users.
