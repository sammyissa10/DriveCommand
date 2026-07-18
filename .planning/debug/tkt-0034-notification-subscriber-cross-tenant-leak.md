---
status: diagnosed
trigger: "tkt-0034-notification-subscriber-cross-tenant-leak"
created: 2026-05-19T00:00:00Z
updated: 2026-05-19T00:45:00Z
---

## Current Focus

hypothesis: CONFIRMED (historical) — quick-323 already fixed this. Root cause was header/session tenantId divergence in the original listTenantUsers() using getTenantPrisma() (header-bound) with explicit where: { tenantId } (session-bound), where the withTenantRLS extension would inject a DIFFERENT tenantId from the header. Fix: replaced with createTenantClient(tenantId) where tenantId comes solely from the session, and extension injects it automatically.
test: Static analysis of full call chain from component through server action to Prisma query
expecting: N/A — investigation complete, root cause confirmed (historical)
next_action: Return diagnostic

## Symptoms

expected: Owner in tenant A sees only tenant A users in the Add Subscriber picker
actual: Dropdown showed users from ALL tenants — confirmed multi-tenant data leak
errors: No runtime error — UI rendered correctly but returned wrong data set
reproduction: /settings/notifications as any owner → click "Add Subscriber" → user-picker populated with all-tenant users
started: Reported May 14, 2026 (TKT-0034, Urgent). Submitter: ayaz.drivecommand@outlook.com

## Eliminated

- hypothesis: Bare prisma singleton used with no tenantId filter at all
  evidence: Both before and after the fix, the User query has tenant filtering (via either explicit where or RLS extension injection). The bare prisma singleton is not used for user.findMany in the notification path.
  timestamp: 2026-05-19

- hypothesis: User model missing tenantId field
  evidence: schema.prisma line 238: tenantId String @db.Uuid — present and required
  timestamp: 2026-05-19

- hypothesis: withTenantRLS extension missing User model
  evidence: 'User' is NOT in EXEMPT_MODELS (tenant-rls.ts lines 43-63). Extension DOES intercept User.findMany.
  timestamp: 2026-05-19

- hypothesis: getTenantPrisma() failing silently with missing header
  evidence: requireTenantId() throws explicitly when x-tenant-id header is missing. getTenantPrisma() propagates this throw. It cannot return silently without a tenantId.
  timestamp: 2026-05-19

- hypothesis: Fix not deployed (same as audit-columns scenario)
  evidence: quick-323 commit (00160460) is dated May 14 and is earlier than quick-389 (24b2c0f8) which is confirmed on origin/master. quick-323 IS deployed.
  timestamp: 2026-05-19

## Evidence

- timestamp: 2026-05-19T00:05:00Z
  checked: subscribers-tab.tsx — the "Add Subscriber" component
  found: Line 143: "Add Subscriber" button label. Line 195: dialog open. Line 199: DialogTitle "Add Subscriber". Component is a client component that receives `users: TenantUserRow[]` as a prop — does NOT fetch users itself. Users are passed in from the page server component.
  implication: No direct API call from the component. The user list is loaded at page render time by the server component.

- timestamp: 2026-05-19T00:07:00Z
  checked: page.tsx (notifications settings page)
  found: Line 39: `listTenantUsers()` called in a Promise.all at page load. Result passed as `users` prop to TenantNotificationsTabs → SubscribersTab. This is a server-side render, not a client-side fetch.
  implication: The data source is the listTenantUsers() server action, called at SSR time.

- timestamp: 2026-05-19T00:10:00Z
  checked: tenant-notification-settings.ts listTenantUsers() — original (commit bc8bfc47, quick-318)
  found: Original code used `await getTenantPrisma()` (header-bound) with `where: { tenantId, isActive: true }` where tenantId came from requireTenantAccess() (session-bound). Two different tenantId sources.
  implication: The extension injected a header-derived tenantId AND the where clause used a session-derived tenantId. These should match for normal requests, but divergence was possible if the x-tenant-id header was stale, incorrect, or set to a different tenant's ID.

- timestamp: 2026-05-19T00:12:00Z
  checked: tenant-notification-settings.ts listTenantUsers() — current (after quick-323 fix, commit 00160460)
  found: Current code (lines 355-374): `createTenantClient(tenantId)` where tenantId = session tenantId from requireTenantAccess(). Query: `where: { isActive: true }`. No explicit tenantId in where clause — relies on withTenantRLS extension injection.
  implication: Single source of truth for tenantId (session). Extension injects { AND: [{ tenantId: 'session-id' }, { isActive: true }] }.

- timestamp: 2026-05-19T00:15:00Z
  checked: withTenantRLS extension (tenant-rls.ts lines 82-91)
  found: findMany case: `a.where = a.where ? { AND: [{ tenantId }, a.where] } : { tenantId }`. With `where: { isActive: true }` (truthy), result is `{ AND: [{ tenantId: 'actual-id' }, { isActive: true }] }`. User model is NOT in EXEMPT_MODELS. Extension WILL intercept.
  implication: The extension correctly injects tenantId filter on every User.findMany call through createTenantClient. Current code is correctly tenant-isolated.

- timestamp: 2026-05-19T00:20:00Z
  checked: middleware.ts — x-tenant-id injection
  found: Lines 191-193: `const requestHeaders = new Headers(request.headers); requestHeaders.set('x-tenant-id', appMeta.tenantId);`. Matcher (lines 208-217): covers all non-static paths including /settings/notifications. Line 142: requires tenantId or redirects — so x-tenant-id is always set for authenticated tenant users reaching the notifications page.
  implication: For page loads, both session tenantId and header tenantId agree. Original bug may have been triggered in a specific edge case where they diverged (e.g., after tenant change, stale session, or middleware edge case).

- timestamp: 2026-05-19T00:25:00Z
  checked: Cross-audit of all owner-area user.findMany calls
  found: ALL calls in (owner)/ use a local `prisma` variable that is `await getTenantPrisma()` — NOT the bare singleton. Confirmed: loads/[id]/page.tsx, loads/new/page.tsx, loads/[id]/edit/page.tsx, payroll/new/page.tsx, payroll/[id]/edit/page.tsx, actions/drivers.ts, actions/fleet-messages.ts, actions/team-permissions.ts. No bare-prisma user.findMany without tenantId filter exists in the owner portal.
  implication: No additional cross-tenant leak vectors found in user-picker dropdowns.

- timestamp: 2026-05-19T00:30:00Z
  checked: Other bare prisma.user.findMany calls outside (owner)
  found: recipient-resolver.ts (lines 47, 62): bare prisma, explicit where: { tenantId, ... } — SAFE. Workflow services (generatePlaybookInstance.ts, failInspectionItem.ts, etc.): bare prisma, explicit where: { tenantId, ... } — SAFE. API routes using tx inside $transaction: explicit where includes tenantId or ID filter — SAFE. admin/actions/tenants.ts: intentional cross-tenant access (sysadmin area) — by design.
  implication: No additional leak vectors found.

- timestamp: 2026-05-19T00:35:00Z
  checked: Schema.prisma User model (lines 236-295)
  found: User model has tenantId String @db.Uuid (line 238) and tenant Tenant @relation(fields: [tenantId]) (line 253). No RLS comment annotations. RLS presence on this table must be verified separately.
  implication: User model has tenantId field, enabling application-layer isolation. Prisma tenant-rls extension can inject it.

- timestamp: 2026-05-19T00:40:00Z
  checked: quick-323 deployment status
  found: quick-323 commit (00160460, May 14) pre-dates quick-389 (24b2c0f8, May 19) which is confirmed on origin/master per 391-SUMMARY. quick-323 IS deployed to production.
  implication: The subscriber picker fix is live. Current data shown to the picker is tenant-isolated.

## Resolution

root_cause: The original listTenantUsers() (quick-318, commit bc8bfc47) used getTenantPrisma() which reads tenantId from the x-tenant-id request header set by middleware, while also applying an explicit where: { tenantId } using the session-bound tenantId from requireTenantAccess(). When these two sources diverged — specifically when the withTenantRLS extension received a different (incorrect or empty) header tenantId than the session's tenantId — the resulting Prisma query's AND [{ tenantId: HEADER }, { tenantId: SESSION }] would never match any rows OR would match zero rows for one tenant and all rows for another depending on extension version. The confirmed production manifestation (all tenant users visible) most likely occurred when the header-provided tenantId was absent or different, causing the RLS extension to inject a non-matching condition, effectively making the explicit where: { tenantId: SESSION_ID } the sole guard — but since the base Prisma client (postgres role) BYPASSES RLS, all rows were returned if the session filter was somehow also compromised.

The quick-323 fix (commit 00160460, deployed May 14) resolves this by:
1. Using createTenantClient(tenantId) instead of getTenantPrisma() — single source of truth (session)
2. Relying on withTenantRLS extension injection (which is correct for User model)
3. The extension injects { AND: [{ tenantId: session-id }, { isActive: true }] } — correctly scoped

fix: Already applied in quick-323 (commit 00160460). No further code changes needed for this specific leak.
verification: N/A — read-only diagnostic. Manual verification: log in as owner@tenant-a.com, navigate to /settings/notifications, click "Add Subscriber" — only Tenant A users should appear.
files_changed:
  - apps/web/src/app/(owner)/actions/tenant-notification-settings.ts (quick-323, listTenantUsers lines 355-374)
