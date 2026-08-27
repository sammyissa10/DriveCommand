# quick-554 — Reports permission gating: UI-only, with more holes than reported

## Diagnosis

Pages sit under `(owner)/layout.tsx` (role OWNER|MANAGER) and `carrier/layout.tsx`
(DRIVER -> /home). APIs sit under `/api/...` and are covered by NEITHER, because
both middleware guards are prefix matches on `/carrier`.

| Route | Sidebar | Mobile More | GATED_PATHS | Server-side |
|---|---|---|---|---|
| reports/revenue | revenueReport | none | yes | page role only; API session-only |
| reports/driver-pay | driverPayReport | none | yes | page role only; API session-only |
| reports/aging | arAgingReport | absent | yes | page role only; API session-only |
| reports/performance | performanceReport | none | yes | page role only; API session-only |
| reports/todays-trips | performanceReport | none | **NO** | requireRole; API session-only |
| carrier/driver-pay/reports | absent | absent | no | role only, no permission |

**H1** todays-trips has no GATED_PATHS entry -> restricted MANAGER reaches it by URL.
**H2** All five `/api/v1/carrier/reports/*` handlers check only `session != null`.
Middleware covers neither role nor permission there. **Any authenticated role,
DRIVER included, can read every report's data.** Closing H1 alone leaves this open.
**H3** The mobile More menu has no `useAuth` at all — EVERY item is ungated, not
just Reports, and it lists Team Permissions which OWNER_ONLY_PATHS blocks for MANAGER.
**H4** `/carrier/driver-pay/reports` is role-gated but has no permission gate at all.

**Root cause:** five hand-written copies of the manager-permission predicate.
`hasPermission()` and `middleware.ts:177` honour `fullAccess`; `requirePermission()`,
the sidebar's `managerHasPermission()` and `PermissionGuard` do not. The
team-permissions UI greys granular toggles out WITHOUT clearing stored values, so
`fullAccess:true + revenueReport:false` is a normal state — wiring the API to a
predicate that disagrees with the middleware would ship a visible-but-403ing report.

## Step 2 decision — keep `performanceReport`, add no key

A new key ships granting nothing (`getPermissions` merges over
DEFAULT_MANAGER_PERMISSIONS and `hasPermission` is default-all-true, so every
existing manager reads as permitted) while adding a row to three hand-written
pickers, one type-checked. DEC-16's exact failure mode. The middleware gate is
prefix-based and a uniform `/carrier/reports/*` family is what makes it auditable.
Counter-argument recorded: by content Today's Trips is closer to `dispatches`;
not acted on because it would WIDEN access on my reading rather than a product
decision. If revisited, the candidate is `dispatches`, never a new key.

## Tasks

### Task 1 — one definition of the predicate
`requirePermission()` and `Sidebar/index.tsx`'s `managerHasPermission()` both
delegate to `hasPermission()`. Flagged behaviour change: a `fullAccess` MANAGER
with explicit `aiDocuments:false` currently gets PERMISSION_DENIED from
`ai-documents.ts` while middleware lets them onto the page; after this they are
allowed, which is what the master toggle and the middleware already say.

### Task 2 — close H1 and H2
- `PERMISSION_GATED_PATHS` += `/carrier/reports/todays-trips` -> `performanceReport`.
- All five `/api/v1/carrier/reports/*` handlers gain
  `hasPermission(session.permissions, key, session.role)` -> 403. ONE call closes
  both halves: it is false for every non-OWNER/MANAGER role, so the DRIVER
  exposure goes with the MANAGER gap. 403-not-throw matches the driver-pay routes.

### Task 3 — align the mobile More menu with the sidebar, per route
`permission?: keyof UserPermissions` per item + `ownerOnly` for Team Permissions,
filtered through the same `hasPermission`. ALL sections, not only Reports —
leaving Clients/Contracts/Templates/Drivers/Trucks/Facilities ungated would be
knowingly shipping the same defect. AR Aging is added so the menu matches the
sidebar; that is the one legitimate difference being REMOVED rather than kept.

### Task 4 — the test
Real `Response` objects from the real route handlers (in-repo precedent:
`lib/driver-pay/__tests__/reports-rbac.test.ts` mocks only `getSession` and
`getTenantPrisma`, calls the real handler, asserts `res.status`). Plus a pure
coverage assertion over the real exported `PERMISSION_GATED_PATHS` constant —
no mocks at all — that fails if any reports route loses its entry.

## Verification
- tsc probed in both apps.
- vitest diffed against pre-task commit 1bfe9f63.
- The new test proven red by removing the GATED_PATHS entry and by reverting a
  handler check.

## Out of scope (report only)
- `/carrier/driver-pay` has no page.tsx; two breadcrumbs point at it (step 6).
- `PermissionGuard` and `RoleGuard` in `lib/auth/guards.tsx` have ZERO consumers,
  orphaned when quick-552 deleted `navigation/sidebar.tsx`. The orphan scanner
  walks only `navigation/` and `Sidebar/`.
- H4: `/carrier/driver-pay/reports` has no permission gate. No UI entry, so no
  UI/server mismatch; adding one is a product decision about which key.
