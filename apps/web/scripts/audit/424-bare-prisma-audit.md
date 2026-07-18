# Quick-424 — Comprehensive Bare-Prisma Audit

**Date:** 2026-06-02  
**Scope:** `apps/web/src/` (every bare `prisma.` usage via `import ... from '@/lib/db/prisma'` or `import ... from 'lib/db/prisma'`)  
**Source files scanned:** 188 `.ts` files + 29 `.tsx` files = **217 files with bare-prisma imports**  
**Files excluded from category counts:** `apps/web/src/lib/db/prisma.ts` (definition), `apps/web/src/lib/context/tenant-context.ts` (intentional helper wrapping bare prisma), `apps/web/src/lib/db/tenant-client.ts` (builds on bare prisma), test files (`__tests__/`, `*.test.ts`) — these have test-specific patterns outside the RLS production concern  
**Total distinct bare-prisma call sites found (non-test, non-excluded):** ~430 across ~140 production source files

---

## Summary

| Category | Count (approx) | Action (fix phase) |
|----------|----------------|--------------------|
| A — Tenant-scoped, tenantId in scope | ~220 | Replace bare `prisma` with `await getTenantPrisma()` or wrap in `$transaction` + `set_config` |
| B — Tenant-scoped, pre-context (no bypass yet) | 2 | Wrap in `$transaction` + `set_config('app.current_tenant_id', tenantId, TRUE)` (Quick-423 pattern) |
| C — Platform table (RLS not applicable) | ~30 | No change |
| D — Auth/health/system (intentional bypass, already has `bypass_rls` or is cross-tenant) | ~165 | No change |
| E — UNCERTAIN (needs human review) | 5 | Skip; surface for review |

> **Note on counting:** Many files shadow the module-level `prisma` import with `const prisma = await getTenantPrisma()`. These shadowed calls are NOT bare-prisma calls — they go through the RLS-scoped client. The counts above reflect only calls on the **module-level** import. Because the shadowing is common (e.g., `actions/loads.ts`, `actions/routes.ts`, `settlements/[id]/route.ts`), the actual number of unfixed bare calls in production is lower than the raw grep count of `prisma.\w+.\w+` lines suggests.

---

## Category A — Tenant-scoped, tenantId in scope

These files use bare `prisma` directly on tenant-scoped models while `tenantId` (or `orgId`, which equals `tenantId`) is provably in scope at the call site. Fix: replace the module-level `prisma` with the local `await getTenantPrisma()` client, or (for carrier-ops tables that use `orgId`) pass the tenant-filtered `prisma.$transaction + set_config` pattern.

### `apps/web/src/actions/carrier/soft-delete.ts`
- **Lines 30–37, 42–49:** `prisma.carrierClient`, `prisma.carrierContract`, `prisma.carrierDriver`, `prisma.carrierTruck`, `prisma.route`, `prisma.trip`, `prisma.carrierLoad` — `updateMany`
  - Model: various Carrier Ops tenant-scoped models · Method: `updateMany` (via dynamic model reference)
  - tenantId source: `const orgId = session.tenantId` at line 22 via `getSession()`
  - Fix: These carrier models use `orgId` (not `tenantId`) as the FK column. Wrap the updateMany in a bypass_rls transaction (same as other carrier ops server actions) with `orgId` filter already present.

### `apps/web/src/app/api/driver/gps-ping/route.ts`
- **Line 92:** `prisma.gPSLocation.create({ data: { tenantId, ... } })`
  - Model: `gPSLocation` · Method: `create`
  - tenantId source: `const { userId, tenantId } = session` at line 30 via `getSession()`
  - Fix: Wrap in `$transaction` + `set_config('app.current_tenant_id', tenantId, TRUE)` (tenant_id column exists on GPSLocation).

### `apps/web/src/app/api/driver/notifications/route.ts`
- **Lines 38, 48:** `prisma.inAppNotification.findMany`, `prisma.inAppNotification.count`
  - Model: `inAppNotification` · Methods: `findMany`, `count`
  - tenantId source: `const orgId = session.tenantId` at line 21 via `getSession()`
  - Fix: Replace with `getTenantPrisma()` or wrap in `set_config` transaction.

### `apps/web/src/app/api/driver/notifications/mark-read/route.ts`
- (Contains bare `prisma` import, mark-read calls on `inAppNotification`)
  - tenantId source: session
  - Fix: Same as above.

### `apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts`
- **Lines 32, 39, 45, 53:** `prisma.carrierLoad.count`, `prisma.driverPayRecord.count`, `prisma.carrierLoad.count`, `prisma.carrierLoad.findMany`
  - Model: `carrierLoad`, `driverPayRecord` · Methods: `count`, `findMany`
  - tenantId source: `const orgId = session.tenantId` at line 19 via `getSession()`
  - Fix: Wrap in `$transaction + set_config` (carrier ops tables use `orgId`).

### `apps/web/src/app/api/v1/carrier/dashboard/alerts/route.ts`
- **Lines 44, 48, 56, 64, 72, 80, 88:** `prisma.driverPayRecord.count`, `prisma.carrierDriver.count` (x2), `prisma.carrierTruck.count` (x2), `prisma.carrierContract.count`, `prisma.trip.count`
  - Model: `driverPayRecord`, `carrierDriver`, `carrierTruck`, `carrierContract`, `trip` · Method: `count`
  - tenantId source: `const orgId = session.tenantId` at line 24
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/dashboard/activity/route.ts`
- **Lines 43, 54, 73, 80, 87, 99:** `prisma.trip.findMany` (x2), `prisma.carrierStop.findMany`, `prisma.carrierLoad.findMany`, `prisma.driverPayRecord.findMany`, `prisma.carrierDocument.findMany`
  - Model: various carrier ops models · Method: `findMany`
  - tenantId source: `const orgId = session.tenantId` at line 28
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/dashboard/messages/route.ts`
- **Lines 19, 31, 80:** `prisma.fleetMessage.findMany`, `prisma.user.findMany`, `prisma.fleetMessage.create`
  - Model: `fleetMessage`, `user` · Methods: `findMany`, `create`
  - tenantId source: `getSession()` → session with tenantId
  - Fix: Replace with `getTenantPrisma()`.

### `apps/web/src/app/api/v1/carrier/dashboard/drivers-status/route.ts`
- **Line 36:** `prisma.carrierDriver.findMany({ where: { orgId, status: 'active' } })`
  - Model: `carrierDriver` · Method: `findMany`
  - tenantId source: `const orgId = session.tenantId` at line 31
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts`
- **Lines 21, 28, 33, 36, 39, 42, 45:** `prisma.carrierDocument.findFirst`, `prisma.carrierStop.findFirst`, `prisma.carrierLoad.findFirst`, `prisma.trip.findFirst`, `prisma.carrierContract.findFirst`, `prisma.carrierClient.findFirst`, `prisma.carrierExpense.findFirst`
  - Model: various · Method: `findFirst`
  - tenantId source: `orgId` resolved from session at route start
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/dispatches/[id]/remove-load/route.ts`
- **Lines 34, 49, 61, 77, 84:** `prisma.trip.findFirst`, `prisma.carrierLoad.findFirst`, `prisma.carrierStop.findFirst`, `prisma.carrierLoad.update`, `prisma.carrierStop.deleteMany`
  - Model: `trip`, `carrierLoad`, `carrierStop` · Methods: `findFirst`, `update`, `deleteMany`
  - tenantId source: `orgId` from session
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/loads/[id]/cancel/route.ts`
- **Line 44:** `prisma.carrierLoad.findFirst({ where: { id: loadId, orgId } })`
  - Model: `carrierLoad` · Method: `findFirst`
  - tenantId source: `const orgId = session.tenantId` at line 24
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/contracts/[id]/documents/route.ts`
- **Lines 19, 22:** `prisma.carrierContract.findFirst`, `prisma.carrierDocument.findMany`
  - Model: `carrierContract`, `carrierDocument` · Methods: `findFirst`, `findMany`
  - tenantId source: `orgId` from session/params
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/clients/[id]/documents/route.ts`
- **Lines 19, 22:** `prisma.carrierClient.findFirst`, `prisma.carrierDocument.findMany`
  - Model: `carrierClient`, `carrierDocument` · Methods: `findFirst`, `findMany`
  - tenantId source: `orgId` from session
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/contracts/route.ts`
- **Line 69:** `prisma.carrierClient.findFirst({ where: { id: clientId, orgId } })`
  - Model: `carrierClient` · Method: `findFirst`
  - tenantId source: `orgId` from session
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/notifications/route.ts`
- **Lines 22, 31:** `prisma.inAppNotification.findMany`, `prisma.inAppNotification.count`
  - Model: `inAppNotification` · Methods: `findMany`, `count`
  - tenantId source: `const orgId = session.tenantId` at line 9
  - Fix: Replace with `getTenantPrisma()`.

### `apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts`
- (bare `prisma` on `inAppNotification.updateMany` with `orgId` filter)
  - tenantId source: session
  - Fix: Replace with `getTenantPrisma()`.

### `apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-view-url/route.ts`
- **Line 18:** `prisma.carrierTruck.findFirst({ where: { id, orgId } })`
  - Model: `carrierTruck` · Method: `findFirst`
  - tenantId source: `orgId` from session
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/photo-upload-url/route.ts`
- **Line 26:** `prisma.carrierTruck.findFirst({ where: { id, orgId } })`
  - Model: `carrierTruck` · Method: `findFirst`
  - tenantId source: `orgId` from session
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/route-templates/active/route.ts`
- **Line 19:** `prisma.routeTemplate.findMany({ where: { orgId, active: true } })`
  - Model: `routeTemplate` · Method: `findMany`
  - tenantId source: `orgId` from session
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/pay-records/route.ts`
- **Lines 37, 49:** `prisma.driverPayRecord.findMany`, `prisma.driverPayRecord.count`
  - Model: `driverPayRecord` · Methods: `findMany`, `count`
  - tenantId source: `orgId` from session
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts`, `mark-paid/route.ts`, `void/route.ts`
- (bare `prisma` on `driverPayRecord.update` / `findFirst` with `orgId` filter)
  - tenantId source: session
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/v1/carrier/stops/[id]/messages/route.ts`
- (bare `prisma` on `fleetMessage` or `carrierStop`)
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/v1/messages/thread/route.ts`, `send/route.ts`, `[id]/audio-url/route.ts`, `broadcast/route.ts`, `conversations/route.ts`
- (bare `prisma` on `fleetMessage`, `user` models with `tenantId` filter)
  - tenantId source: session via `getSession()`
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver/stops/[stopId]/messages/route.ts`
- (bare `prisma` on `fleetMessage`)
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver/stops/[stopId]/documents/route.ts`
- (bare `prisma` on `carrierStop`, `carrierDocument`)
  - tenantId source: session
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/route.ts`
- **Lines 111, 133, 174, 237:** `prisma.loadDriverAssignment.findFirst`, `prisma.loadPayComponent.findMany`, `prisma.loadDriverAssignment.findFirst`, `prisma.loadPayComponent.create`
  - Model: `loadDriverAssignment`, `loadPayComponent` · Methods: `findFirst`, `findMany`, `create`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/route.ts`
- **Lines 130, 145, 200, 240, 267, 274:** Various bare calls on `loadDriverAssignment`, `loadPayComponent`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/route.ts`
- **Lines 78, 89, 124, 286:** `prisma.loadDriverAssignment`, `prisma.loadPayComponent`, `prisma.payComponentAttachment` — `findFirst`, `findMany`, `create`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/route.ts`
- **Lines 33, 41, 69:** `prisma.payComponentAttachment.findFirst`, `prisma.loadDriverAssignment.findFirst`, `prisma.payComponentAttachment.update`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/[componentId]/attachments/[attachmentId]/download-url/route.ts`
- **Lines 37, 45, 52:** `prisma.payComponentAttachment.findFirst`, `prisma.loadPayComponent.findFirst`, `prisma.loadDriverAssignment.findFirst`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/components/suggest-detention/route.ts`
- **Lines 34, 51:** `prisma.loadDriverAssignment.findFirst`, `prisma.carrierStop.findFirst`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/corrections/route.ts`
- **Lines 160, 180, 210, 234, 238:** `prisma.loadDriverAssignment.findFirst`, `prisma.loadPayComponent.findFirst`, `prisma.loadPayComponent.create`, `prisma.loadDriverAssignment.update`, `prisma.driverPayAuditLog.create`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/assignments/[assignmentId]/transitions/route.ts`
- **Lines 157, 188, 247, 251:** `prisma.loadDriverAssignment.findFirst`, `prisma.loadPayComponent.findMany`, `prisma.loadDriverAssignment.update`, `prisma.driverPayAuditLog.create`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/settlements/route.ts`
- **Lines 136, 162, 173:** `prisma.carrierDriver.findFirst`, `prisma.driverSettlement.findMany`, `prisma.driverSettlement.count`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/settlements/[settlementId]/void/route.ts`
- (bare `prisma` on `driverSettlement`, `loadDriverAssignment`, `driverBonus` with tenantId in scope)
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/settlements/[settlementId]/pdf/route.ts`
- **Lines 54, 74, 95:** `prisma.driverSettlement.findFirst`, `prisma.carrierDriver.findFirst`, `prisma.tenant.findFirst`
  - tenantId source: session (`{ tenantId: session.tenantId }` filter)
  - Fix: For `tenant.findFirst` see Category B note; for settlement/driver — `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/settlements/[settlementId]/mark-paid/route.ts`
- **Lines 63, 85, 94, 102:** `prisma.driverSettlement.findFirst`, `prisma.driverSettlement.update`, `prisma.loadDriverAssignment.updateMany`, `prisma.driverBonus.updateMany`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/settlements/[settlementId]/finalize/route.ts`
- **Lines 45, 114, 175:** `prisma.driverSettlement.findFirst`, `prisma.tenant.findFirst`, `prisma.driverSettlement.update`
  - tenantId source: session (`tenantId: session.tenantId`)
  - Fix: `getTenantPrisma()`. (Note: `tenant.findFirst` — see note under Category B.)

### `apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/route.ts`
- **Lines 129, 136, 194, 282:** `prisma.carrierDriver.findFirst`, `prisma.driverBonus.findMany`, `prisma.carrierDriver.findFirst`, `prisma.driverBonus.create`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/drivers/[driverId]/bonuses/[bonusId]/route.ts`
- **Lines 150, 158, 203, 252, 260, 273:** `prisma.carrierDriver.findFirst`, `prisma.driverBonus.findFirst`, `prisma.driverBonus.update` (x2 paths)
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/route.ts`
- **Lines 129, 136, 211, 218:** `prisma.carrierDriver.findFirst`, `prisma.driverDeduction.findMany`, `prisma.carrierDriver.findFirst`, `prisma.driverDeduction.create`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/drivers/[driverId]/deductions/[deductionId]/route.ts`
- **Lines 156, 164, 231, 276, 284, 291:** Various `prisma.carrierDriver.findFirst`, `prisma.driverDeduction.findFirst/update`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/pending-queue/route.ts`
- **Lines 78, 88:** `prisma.loadDriverAssignment.count`, `prisma.loadDriverAssignment.findMany`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/reports/settlements/route.ts`
- **Lines 101, 112:** `prisma.driverSettlement.findMany`, `prisma.driverSettlement.count`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/driver-pay/reports/drivers/[driverId]/route.ts`
- **Line 42:** `prisma.carrierDriver.findFirst`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/api/reports/payroll-export/route.ts`
- **Lines 144, 182, 197:** `prisma.driverSettlement.findMany`, `prisma.loadDriverAssignment.findMany`, `prisma.loadPayComponent.findMany`
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`
- **Lines 247, 261:** `defaultPrisma.carrierLoad.findUnique`, `defaultPrisma.carrierDriver.findUnique` (imported as `prisma as defaultPrisma`)
  - Model: `carrierLoad`, `carrierDriver` · Method: `findUnique`
  - tenantId source: `const tenantId = await requireTenantId()` at line 183
  - Fix: Replace `defaultPrisma` with tenant-scoped client (carrier ops path needs `$transaction + set_config`).

### `apps/web/src/app/(owner)/actions/my-notifications.ts`
- **Lines 38, 44, 119:** `prisma.notificationTemplate.findMany` (Category C — see below), `prisma.userNotificationPreference.findMany`, `prisma.userNotificationPreference.upsert`
  - **Line 38 (`notificationTemplate`):** Category C — platform table, see Category C section.
  - **Lines 44, 119 (`userNotificationPreference`):** Model is user-scoped (not tenant RLS enforced in the same way — userId filter used). Category E — uncertain; the table may or may not have RLS.

### `apps/web/src/app/(owner)/actions/tenant-notification-settings.ts`
- **Lines 131, 173, 293, 383:** `prisma.notificationTemplate.findMany` (x2), `prisma.notificationTemplate.findUniqueOrThrow` (x2)
  - Model: `notificationTemplate` · Methods: `findMany`, `findUniqueOrThrow`
  - **All four are Category C** — `notificationTemplate` is in the platform table allowlist (spec 4.12). These reads are correct as bare prisma.

### `apps/web/src/app/(driver)/actions/driver-dashboard.ts`
- **Line 73:** `prisma.$transaction(async (tx) => { await tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\`; ... })`
  - Already uses `bypass_rls` pattern. Category D.
- **Lines 168, 174:** These appear in `getRecentUnreadMessages` which uses local `prisma = await getTenantPrisma()`. Not bare.

### `apps/web/src/app/(driver)/actions/driver-hos.ts`
- **Lines 17, 57, 67:** `prisma.driverHOSEntry.findFirst`, `prisma.driverHOSEntry.updateMany`, `prisma.driverHOSEntry.create`
  - Model: `driverHOSEntry` · Methods: `findFirst`, `updateMany`, `create`
  - tenantId source: `session.tenantId` at line ~14 via `getSession()`
  - Fix: Replace with `getTenantPrisma()`.

### `apps/web/src/app/(driver)/actions/driver-tasks.ts`
- **Line 58:** `prisma.stepInstance.update({ where: { id: stepInstanceId, playbookInstance: { tenantId: session.tenantId } } })`
  - Model: `stepInstance` · Method: `update`
  - tenantId source: `session.tenantId` at line 31 via `getSession()`
  - Fix: Replace with `getTenantPrisma()`.

### `apps/web/src/lib/carrier/trips.ts`
- **Lines 113, 130, 136, 150, 171, 179, 188, 199, 210, 223, 246, 299, 382, 391, 398, 410, 431, 462, 465, 546, 576, 616, 632, 662, 688, 707, 784, 880, 885, 897, 920, 925, 940:** All `prisma.*` calls on carrier ops models (`trip`, `carrierDriver`, `carrierTruck`, `carrierStop`, `carrierLoad`, `routeTemplate`, etc.)
  - tenantId source: `orgId` parameter passed to every function (e.g., `listTrips(orgId, filters)`, `getTrip(orgId, id)`)
  - Fix: Wrap in `$transaction + set_config(orgId)` at function level, or refactor callers to pass a pre-configured client.

### `apps/web/src/lib/carrier/loads.ts`
- **Lines 101, 111, 130, 165, 177, 193, 255, 272, 282, 294, 372, 453, 484, 556, 622, 640:** All `prisma.*` on `carrierLoad`, `carrierStop`, `carrierClient`, `carrierContract`, `carrierFacility`
  - tenantId source: `orgId` parameter to every exported function
  - Fix: Same as trips.ts — wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/stops.ts`
- **Lines 68, 74, 81, 98, 107, 118, 128, 189:** `prisma.carrierStop.*`, `prisma.trip.*`, `prisma.carrierLoad.*`, `prisma.carrierClient.*`, `prisma.carrierFacility.*`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/stop-completion.ts`
- **Lines 25, 37, 58, 139, 157, 177, 191, 200, 221, 229, 260, 278:** All `prisma.carrierStop.*`, `prisma.carrierLoad.*`, `prisma.trip.*`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/fleet-trucks.ts`
- **Lines 110, 128, 184:** `prisma.carrierTruck.findMany`, `prisma.carrierTruck.count`, `prisma.carrierTruck.findFirst`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/fleet-drivers.ts`
- **Lines 113, 123, 131, 184, 192, 215, 258, 313, 317, 330, 377, 383, 420, 461, 475, 482, 492, 583:** All `prisma.carrierDriver.*`, `prisma.trip.*`, `prisma.carrierFacility.*`, `prisma.user.*`, `prisma.tenant.*`, `prisma.driverInvitation.*`, `prisma.driverPayRecord.*`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`. Note: `prisma.tenant.findUnique` (lines 258, 420) is a tenant-row self-read; same pattern as login route.

### `apps/web/src/lib/carrier/expenses.ts`
- **Lines 48, 57, 68, 97, 108, 119, 131, 141, 173, 176, 204, 207, 221, 224, 234:** All carrier expense models with `orgId` parameter
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/documents.ts`
- **Lines 61, 79, 96, 101, 113, 128, 134, 144, 170, 202, 207, 210, 213, 216, 227, 278, 284, 289, 292, 295, 298, 316, 331, 337, 342, 345, 348, 351, 357:** All `prisma.carrierDocument.*`, `prisma.carrierStop.*`, `prisma.carrierLoad.*`, `prisma.trip.*`, `prisma.carrierContract.*`, `prisma.carrierClient.*`, `prisma.carrierExpense.*`, `prisma.carrierDocumentType.*`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/clients.ts`
- **Lines 175, 181, 188, 195, 202, 231, 248:** `prisma.carrierClient.*`, `prisma.carrierLoad.*` (aggregate/count)
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/contracts.ts`
- **Lines 57, 66, 82, 92, 133, 184, 226, 245, 251, 256, 260, 264:** `prisma.carrierContract.*`, `prisma.carrierLoad.*`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/facilities.ts`
- **Lines 77, 83, 111, 124:** `prisma.carrierFacility.*`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/compliance.ts`
- **Lines 53, 79, 105, 131, 157:** `prisma.carrierDriver.findMany`, `prisma.carrierTruck.findMany` (x2), `prisma.carrierContract.findMany`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/route-templates.ts`
- **Lines 183, 192, 224, 234, 245, 256, 278, 290:** `prisma.routeTemplate.*`, `prisma.carrierClient.*`, `prisma.carrierContract.*`, `prisma.carrierDriver.*`, `prisma.carrierTruck.*`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/dispatch-generator.ts`
- **Lines 217, 257, 266, 295, 302:** `prisma.routeTemplate.findFirst`, `prisma.trip.count`, `prisma.trip.findFirst` (x3)
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/document-types.ts`
- **Lines 28, 43, 82, 93, 113, 130, 142, 149, 157:** `prisma.carrierDocumentType.*`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/pay-calculator.ts`
- **Lines 65, 145, 166, 281, 296, 342, 361, 387, 407, 435:** `prisma.trip.findFirst`, `prisma.carrierExpense.findMany`, `prisma.driverPayRecord.create` (x2), `prisma.driverPayRecord.findMany`, `prisma.driverPayRecord.findFirst`, `prisma.driverPayRecord.count`, `prisma.trip.findFirst`, `prisma.driverPayRecord.update`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/revenue-calculator.ts`
- **Lines 136, 147, 187:** `prisma.carrierLoad.findFirst`, `prisma.carrierStop.count`, `prisma.carrierLoad.update`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/reports.ts`
- **Line 221:** `prisma.driverPayRecord.findMany`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/carrier/notifications.ts`
- **Lines 48–51, 85, 130, 166, 182, 226, 242, 335, 380, 429, 471, 482, 549, 585, 686, 842, 973, 1023, 1108, 1188:** `prisma.user.findFirst`, `prisma.trip.findFirst`, `prisma.tenant.findFirst`, `prisma.carrierDriver.findFirst`, `prisma.carrierLoad.findFirst`, `prisma.carrierStop.findFirst`, `prisma.carrierDocument.count`
  - tenantId source: `orgId` parameter for most calls (e.g., `where: { tenantId: orgId }`, `where: { id: dispatchId, orgId }`)
  - Exception — **Line 56** (`getDriverEmail`): filters only by `driverId` with no `orgId`. Category E below.
  - Fix: Wrap each function in `$transaction + set_config(orgId)`.

### `apps/web/src/lib/carrier/in-app-notifications.ts`
- **Line 64:** `prisma.inAppNotification.create({ data: { orgId, ... } })`
  - Model: `inAppNotification` · Method: `create`
  - tenantId source: `orgId` parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/driver-pay/snapshot.ts`
- **Line 21:** `prisma.driverCompensationTemplate.findFirst`
  - tenantId source: `driverId` parameter (need to verify if tenant filter exists in where clause)
  - Fix: Tentatively Category A if caller guarantees same-tenant driverId; otherwise Category E.

### `apps/web/src/lib/driver-pay/auto-base-pay.ts`
- **Lines 40, 59, 98:** `prisma.loadPayComponent.findFirst`, `prisma.loadDriverAssignment.findFirst`, `prisma.loadPayComponent.create`
  - tenantId source: parameters (needs verification)
  - Fix: `getTenantPrisma()` or bypass_rls.

### `apps/web/src/lib/driver-pay/reporting.ts`
- **Lines 241, 251, 378, 410, 437, 508, 528, 556, 570, 601, 632, 648, 693, 811:** All `prisma.driverSettlement.*`, `prisma.carrierDriver.*`, `prisma.loadDriverAssignment.*`, `prisma.driverDispute.*`, `prisma.driverDeduction.*`
  - tenantId source: parameters passed to report functions
  - Fix: `getTenantPrisma()` or bypass_rls.

### `apps/web/src/lib/driver-pay/settlement-anomaly.ts`
- **Line 46:** `prisma.driverSettlement.findMany`
  - tenantId source: parameters
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/driver-pay/reports/component-type-breakdown.ts`
- **Lines 38, 71:** `prisma.loadPayComponent.groupBy` (x2)
  - tenantId source: parameters
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/driver-pay/reports/accessorial-spend.ts`
- **Lines 43, 116:** `prisma.loadPayComponent.findMany` (x2)
  - tenantId source: parameters
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/driver-pay/reports/deduction-balances.ts`
- **Line 43:** `prisma.driverDeduction.findMany`
  - tenantId source: parameters
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/driver-pay/reports/load-profitability.ts`
- **Lines 114, 183:** `prisma.carrierLoad.findMany` (x2)
  - tenantId source: parameters
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/driver-pay/reports/settlement-history.ts`
- **Lines 95, 104, 142, 153, 164:** `prisma.driverSettlement.findMany` (x3), `prisma.driverSettlement.count`
  - tenantId source: parameters
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/driver-pay/reports/override-audit.ts`
- **Lines 52, 99:** `prisma.loadDriverAssignment.findMany` (x2)
  - tenantId source: parameters
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/driver-pay/reports/overtime-exposure.ts`
- **Lines 47, 103:** `prisma.loadPayComponent.findMany` (x2)
  - tenantId source: parameters
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/notifications/in-app-writer.ts`
- **Line 73:** `prisma.inAppNotification.create`
  - tenantId source: `tenantId` parameter in notification payload
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/notifications/idempotency.ts`
- **Line 55:** `prisma.notificationSendLog.findFirst`
  - tenantId source: idempotency key contains tenantId (needs verification of RLS applicability)
  - Fix: Likely `getTenantPrisma()`.

### `apps/web/src/lib/notifications/notification-deduplication.ts`
- **Lines 31, 55, 80, 98:** `prisma.notificationLog.*` — `findUnique`, `create`, `update` (x2)
  - tenantId source: `tenantId` field in the log record
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/automations/actions/send-email.ts`
- **Lines 37, 46, 82, 103:** `prisma.user.findFirst`, `prisma.tenant.findUnique`, `prisma.notificationLog.upsert` (x2)
  - tenantId source: `tenantId` passed as param
  - Fix: `getTenantPrisma()`.

### `apps/web/src/actions/carrier/save-route-template.ts`
- **Lines 79, 89, 100, 111, 123:** `prisma.carrierClient.findFirst`, `prisma.carrierContract.findFirst`, `prisma.carrierDriver.findFirst`, `prisma.carrierTruck.findFirst`, `prisma.carrierFacility.findMany`
  - tenantId source: `orgId` from session (server action)
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/actions/support-tickets.ts`
- (bare `prisma` on `supportTicket` with tenantId from session)
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/actions/doc-feedback.ts`
- (bare `prisma` on `docFeedback` or similar)
  - tenantId source: session
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/geofencing/geofence-check.ts`
- (bare `prisma` on `gPSLocation` or related tables with tenantId from params)
  - tenantId source: tenant parameter
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/lib/email/send-fleet-message-notifications.ts`
- **Lines 58, 131:** `prisma.user.findFirst`, `prisma.user.findUnique`
  - tenantId source: tenantId param passed in
  - Fix: `getTenantPrisma()`.

### `apps/web/src/lib/integrations/samsara.ts`, `motive.ts`
- (bare `prisma` with tenantId from params for syncing GPS/ELD data)
  - tenantId source: params
  - Fix: Wrap in `$transaction + set_config`.

### `apps/web/src/server/services/workflows/generatePlaybookInstance.ts`
- **Lines 28, 45, 104, 115, 224, 231, 238, 259:** `prisma.playbook.findFirst`, `prisma.playbookInstance.findFirst`, `prisma.stepInstance.findMany`, `prisma.stepInstance.update`, `prisma.user.findFirst`, `prisma.carrierTruck.findFirst`, `prisma.customer.findFirst`, `prisma.user.findMany`
  - tenantId source: `tenantId` parameter in function signature
  - Fix: Use `getTenantPrisma()` or wrap in `$transaction + set_config`.

### `apps/web/src/server/services/workflows/completeStep.ts`
- **Lines 29, 56, 172, 193:** `prisma.stepInstance.findFirst`, `prisma.stepInstance.update`, `prisma.document.create`, `prisma.stepInstance.findFirst`
  - tenantId source: `tenantId` from step context
  - Fix: `getTenantPrisma()`.

### `apps/web/src/server/services/workflows/skipStep.ts`
- **Lines 20, 31:** `prisma.stepInstance.findFirst`, `prisma.stepInstance.update`
  - tenantId source: `tenantId` param
  - Fix: `getTenantPrisma()`.

### `apps/web/src/server/services/workflows/failInspectionItem.ts`
- **Lines 25, 56, 70, 91, 107:** `prisma.stepInstance.findFirst`, `prisma.stepInstance.update`, `prisma.stepInstance.create`, `prisma.playbookInstance.update`, `prisma.user.findMany`
  - tenantId source: `tenantId` param
  - Fix: `getTenantPrisma()`.

### `apps/web/src/server/services/workflows/playbookStepService.ts`
- **Lines 19, 28:** `prisma.playbook.findFirst`, `prisma.playbookStep.findMany`
  - tenantId source: `tenantId` param
  - Fix: `getTenantPrisma()`.

### `apps/web/src/server/services/workflows/computeDispatchReadiness.ts`
- **Lines 24, 54, 98, 106:** `prisma.playbookInstance.findUniqueOrThrow`, `prisma.playbookInstance.update`, `prisma.playbookInstance.findMany`, `prisma.user.update`
  - tenantId source: `tenantId` param
  - Fix: `getTenantPrisma()`.

### `apps/web/src/server/services/workflows/fireEvent.ts`
- (bare `prisma` on workflow models with tenantId from event)
  - tenantId source: event payload
  - Fix: `getTenantPrisma()`.

### `apps/web/src/server/services/workflows/notifications.ts`
- (bare `prisma` on user/workflow models with tenantId from context)
  - tenantId source: context params
  - Fix: `getTenantPrisma()`.

### `apps/web/src/server/api/routers/workflows/trigger.ts`
- **Lines 29, 69, 75, 111, 130, 146, 173, 203, 208, 218:** `prisma.playbookTrigger.*`, `prisma.playbook.*`, `prisma.playbookInstance.*`
  - tenantId source: `ctx.tenantId` (tRPC context — tenant is always present in adminProcedure)
  - Fix: `getTenantPrisma()` or pass a tenant-scoped client through tRPC context.

### `apps/web/src/server/api/routers/workflows/playbook.ts`
- **Lines 43, 76, 91, 97, 107, 151, 159, 169, 194, 202, 210, 218, 226:** All `prisma.playbook.*`, `prisma.stepTemplate.*`, `prisma.playbookStep.*`
  - tenantId source: `ctx.tenantId`
  - Fix: Same as trigger router.

### `apps/web/src/server/api/routers/workflows/stepTemplate.ts`
- **Lines 41, 65, 80, 86:** `prisma.stepTemplate.*`
  - tenantId source: `ctx.tenantId`
  - Fix: Same.

### `apps/web/src/server/api/routers/workflows/instance.ts`
- **Lines 44, 83, 135, 161, 174, 186:** `prisma.playbookInstance.*`, `prisma.carrierDriver.*`, `prisma.user.*`
  - tenantId source: `ctx.tenantId`
  - Fix: Same.

### `apps/web/src/server/api/routers/workflows/stepInstance.ts`
- **Lines 58, 102, 107, 113, 131, 139:** `prisma.stepInstance.*`, `prisma.user.*`
  - tenantId source: `ctx.tenantId`
  - Fix: Same.

### `apps/web/src/server/api/routers/workflows/analytics.ts`
- (bare `prisma` on workflow analytics tables with tenantId from ctx)
  - tenantId source: `ctx.tenantId`
  - Fix: Same.

### `apps/web/src/app/(owner)/checklists/instances/[id]/_components/actions.ts`
- **Line 12:** `prisma.stepInstance.findFirst`
  - tenantId source: session (server action in owner portal)
  - Fix: `getTenantPrisma()`.

---

## Category B — Tenant-scoped, pre-context (no GUC set, no bypass_rls, no tenantId available at query time)

These are routes where the query hits a tenant-scoped model but there is no `app.current_tenant_id` GUC set and no `app.bypass_rls` guard either — they will return zero rows under `app_user`.

### `apps/web/src/app/api/auth/login/route.ts`

- **Line 111:** `prisma.user.findUnique({ where: { id: authUserId }, select: { id: true, isActive: true } })`
  - Model: `user` · Method: `findUnique`
  - Pre-context reason: At this point in the login flow, `appMeta.tenantId` IS in scope (line 68 guard), but the query at line 111 is made with bare `prisma` WITHOUT a `$transaction + set_config` wrapper — unlike the `tenant` query at lines 73–79 which is correctly wrapped. The `user` query is exposed to RLS under `app_user` and will return `null`, causing spurious "Account setup incomplete" errors.
  - Fix: Wrap in `prisma.$transaction(async (tx) => { await tx.$executeRaw\`SELECT set_config('app.current_tenant_id', ${appMeta.tenantId}, TRUE)\`; return tx.user.findUnique({ where: { id: authUserId }, ... }); }, TX_OPTIONS)` — matching the pattern used for the `tenant` query just above.

### `apps/web/src/app/api/track/[token]/route.ts`

- **Lines 22, 44:** `prisma.load.findUnique({ where: { trackingToken: token } })`, `prisma.gPSLocation.findFirst({ where: { truckId: load.truckId } })`
  - Model: `load`, `gPSLocation` · Methods: `findUnique`, `findFirst`
  - Pre-context reason: This is a **public** route — no auth, no session, no tenant context. The `trackingToken` is the only identifier; no `tenantId` is known until after the load is fetched. The route comment explicitly says "no RLS, no tenant context." Under `app_user`, these queries return no rows, breaking the public customer tracking page.
  - Fix: Wrap both queries in `prisma.$transaction(async (tx) => { await tx.$executeRaw\`SELECT set_config('app.bypass_rls', 'on', TRUE)\`; ... }, TX_OPTIONS)` — justification: public tracking endpoint intentionally has no tenant scope; bypass_rls is the correct mechanism. Add `@bypass_rls reason: public-tracking-token` comment.

---

## Category C — Platform table (no change needed)

These models are on the RLS spec Section 4.12 allowlist: `Plan`, `Promo`, `carrier_catalog_meta`, `NotificationTemplate`, `NotificationEmailConfig`, `grid_preference`, `grid_view`. Bare prisma is correct here.

### `notificationTemplate`
- `apps/web/src/app/(admin)/actions/notifications.ts` — lines 33, 49, 72, 100 — `prisma.notificationTemplate.*` — platform table, RLS not applicable per spec 4.12
- `apps/web/src/app/(owner)/actions/my-notifications.ts` — line 38 — `prisma.notificationTemplate.findMany` — platform table, OK
- `apps/web/src/app/(owner)/actions/tenant-notification-settings.ts` — lines 131, 173, 293, 383 — all `prisma.notificationTemplate.*` — platform table, OK
- `apps/web/src/lib/notifications/dispatcher.ts` — line 66 (`db.notificationTemplate.findUnique` — where `db` defaults to `defaultPrisma`) — platform table, OK

### `notificationEmailConfig`
- `apps/web/src/app/(admin)/actions/notifications.ts` — lines 130, 169, 176, 185 — `prisma.notificationEmailConfig.*` — platform table, OK

### `notificationSendLog` (platform audit table — no tenant RLS)
- `apps/web/src/app/(admin)/actions/notifications.ts` — lines 250, 256, 321, 324, 327, 330, 334 — `prisma.notificationSendLog.*` — platform audit table, OK

### `plan`
- `apps/web/src/app/(admin)/actions/plans.ts` — lines 21, 45, 71 — `prisma.plan.findUnique`, `prisma.plan.create`, `prisma.plan.update` — platform table, OK

### `promo`
- `apps/web/src/app/(admin)/actions/promos.ts` — lines 16, 35 — `prisma.promo.findMany`, `prisma.promo.create` — platform table, OK

### `gridPreference`
- `apps/web/src/app/api/user/grid-preferences/[gridId]/route.ts` — lines 48, 121 — `prisma.gridPreference.findUnique`, `prisma.gridPreference.upsert` — platform table per spec 4.12, OK

### `gridView`
- `apps/web/src/app/api/user/grid-views/[gridId]/route.ts` — lines 30, 91, 110, 123 — `prisma.gridView.*` — platform table per spec 4.12, OK
- `apps/web/src/app/api/user/grid-views/[gridId]/[viewId]/route.ts` — lines 38, 52, 72, 86, 123, 136 — all `prisma.gridView.*` — platform table, OK

---

## Category D — Auth/health/system (intentional bypass or correct cross-tenant operation)

These files use bare `prisma` with deliberate justification — they either use `$transaction + set_config('app.bypass_rls', 'on', TRUE)`, are sysadmin cross-tenant readers, or are infrastructure routes with no tenant context.

### Pre-auth / signup / invitation routes (already use bypass_rls)
- `apps/web/src/app/api/auth/login/route.ts` — lines 73–79 (tenant check), 149–155 (activationProgress check) — both already wrapped in `$transaction + bypass_rls`. **Correctly handled.** (The `user.findUnique` at line 111 is **not** wrapped — that is the Category B entry above.)
- `apps/web/src/app/api/auth/accept-invitation/route.ts` — lines 41–46, 118–123, 153–161, 210–250 — all use `$transaction + bypass_rls`. Correctly handled.
- `apps/web/src/app/(auth)/sign-up/actions.tsx` — line 188 — `$transaction + bypass_rls`. Correctly handled.
- `apps/web/src/app/api/email-confirm/[token]/route.ts` — line 51 — `$transaction + bypass_rls`. Correctly handled.
- `apps/web/src/lib/onboarding/provision-tenant.ts` — line 28 — `$transaction + bypass_rls`. Correctly handled.
- `apps/web/src/lib/onboarding/activation-tracker.ts` — bypass_rls documented in module header. Correctly handled.
- `apps/web/src/lib/onboarding/hydrate-tenant.ts` — (bypass_rls pattern)

### Auth helpers
- `apps/web/src/lib/auth/supabase.ts` — line 145 — `prisma.$transaction([prisma.$executeRaw..., prisma.user.findUnique(...)])` — bypass_rls for `getCurrentUser()`. Correctly handled.

### Mobile API routes (all use bypass_rls or withMobileAuth bypass)
All files under `apps/web/src/app/api/mobile/` use either `withMobileAuth()` with `bypass_rls` inside `$transaction`, or `validateMobileToken()` followed by `$transaction + bypass_rls`. The following are all **Category D** (intentional mobile-api bypass, already correctly implemented):
- `apps/web/src/app/api/mobile/owner/dashboard/route.ts`
- `apps/web/src/app/api/mobile/owner/trucks/route.ts`
- `apps/web/src/app/api/mobile/owner/trucks/[id]/route.ts`
- `apps/web/src/app/api/mobile/owner/trucks/[id]/maintenance/route.ts`
- `apps/web/src/app/api/mobile/owner/trucks/[id]/scheduled-service/route.ts`
- `apps/web/src/app/api/mobile/owner/drivers/route.ts`
- `apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts`
- `apps/web/src/app/api/mobile/owner/drivers/active/route.ts`
- `apps/web/src/app/api/mobile/owner/drivers/invite/route.ts`
- `apps/web/src/app/api/mobile/owner/loads/route.ts`
- `apps/web/src/app/api/mobile/owner/loads/[id]/route.ts`
- `apps/web/src/app/api/mobile/owner/loads/[id]/assign-truck/route.ts`
- `apps/web/src/app/api/mobile/owner/routes/route.ts`
- `apps/web/src/app/api/mobile/owner/routes/[id]/route.ts`
- `apps/web/src/app/api/mobile/owner/invoices/route.ts`
- `apps/web/src/app/api/mobile/owner/invoices/[id]/route.ts`
- `apps/web/src/app/api/mobile/owner/payroll/route.ts`
- `apps/web/src/app/api/mobile/owner/payroll/[id]/route.ts`
- `apps/web/src/app/api/mobile/owner/crm/route.ts`
- `apps/web/src/app/api/mobile/owner/crm/[id]/route.ts`
- `apps/web/src/app/api/mobile/owner/dashboard/route.ts`
- `apps/web/src/app/api/mobile/owner/compliance/route.ts`
- `apps/web/src/app/api/mobile/owner/safety/route.ts`
- `apps/web/src/app/api/mobile/owner/maintenance/route.ts`
- `apps/web/src/app/api/mobile/owner/fuel/route.ts`
- `apps/web/src/app/api/mobile/owner/profit-predictor/route.ts`
- `apps/web/src/app/api/mobile/owner/map/vehicles/route.ts`
- `apps/web/src/app/api/mobile/owner/fleet-positions/route.ts`
- `apps/web/src/app/api/mobile/owner/customers/route.ts`
- `apps/web/src/app/api/mobile/owner/fleet/messages/route.ts`
- `apps/web/src/app/api/mobile/owner/fleet/messages/[recipientId]/route.ts`
- `apps/web/src/app/api/mobile/driver/dashboard/route.ts`
- `apps/web/src/app/api/mobile/driver/loads/route.ts`
- `apps/web/src/app/api/mobile/driver/loads/[id]/route.ts`
- `apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts`
- `apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts`
- `apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts`
- `apps/web/src/app/api/mobile/driver/documents/route.ts`
- `apps/web/src/app/api/mobile/driver/documents/[id]/url/route.ts`
- `apps/web/src/app/api/mobile/driver/messages/route.ts`
- `apps/web/src/app/api/mobile/driver/messages/unread-count/route.ts`
- `apps/web/src/app/api/mobile/driver/messages/route-thread/route.ts`
- `apps/web/src/app/api/mobile/driver/hos/route.ts`
- `apps/web/src/app/api/mobile/driver/incidents/route.ts`
- `apps/web/src/app/api/mobile/driver/route/route.ts`
- `apps/web/src/app/api/mobile/driver/tracking-token/route.ts`
- `apps/web/src/app/api/mobile/driver/tasks/route.ts`
- `apps/web/src/app/api/mobile/support/ticket/route.ts`
- `apps/web/src/app/api/mobile/carrier/driver/dispatches/route.ts`
- `apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts`
- `apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/expenses/route.ts`
- `apps/web/src/app/api/mobile/carrier/driver/stops/[stopId]/documents/route.ts`
- `apps/web/src/app/api/push-tokens/route.ts`

### Driver server actions (already use bypass_rls)
- `apps/web/src/app/(driver)/actions/driver-routes.ts` — bypass_rls documented. Correctly handled.
- `apps/web/src/app/(driver)/actions/driver-load.ts` — bypass_rls documented. Correctly handled.
- `apps/web/src/app/(driver)/actions/driver-dashboard.ts` — line 73 already uses bypass_rls for carrierDriver lookup. The `getRecentUnreadMessages` function uses local `prisma = await getTenantPrisma()`. Correctly handled.

### Cron routes (cross-tenant, bypass_rls)
- `apps/web/src/app/api/cron/send-reminders/route.ts` — bypass_rls for tenant fan-out. Correctly handled.
- `apps/web/src/app/api/cron/carrier-compliance-alerts/route.ts` — bypass_rls + `$executeRawUnsafe`. Correctly handled.
- `apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts` — bypass_rls for tenant fan-out. Correctly handled.
- `apps/web/src/app/api/cron/purge-deleted/route.ts` — cross-tenant purge, no user context. Correctly handled (no bypass_rls annotation, but cron pattern — Category D).
- `apps/web/src/app/api/cron/mark-overdue-invoices/route.ts` — `prisma.sysAdminInvoice.updateMany` — platform/billing table, cross-tenant cron. Correctly handled.
- `apps/web/src/app/api/cron/digest-compliance-30day/route.ts`, `digest-weekly-owner/route.ts`, `digest-daily-driver/route.ts` — cross-tenant cron.
- `apps/web/src/app/api/cron/workflow-notifications/route.ts`, `workflow-digest/route.ts`, `automations/route.ts`, `auto-close-tickets/route.ts` — cross-tenant cron.
- `apps/web/src/app/api/cron/workflow-notifications/route.ts` — bypass_rls pattern.

### Sysadmin actions (intentional cross-tenant reads)
- `apps/web/src/app/(admin)/actions/users.ts` — cross-tenant read documented ("Uses bare Prisma client — intentional cross-tenant read for sysadmin"). Correctly handled.
- `apps/web/src/app/(admin)/actions/tenants.ts` — all operations documented as intentional cross-tenant. Correctly handled.
- `apps/web/src/app/(admin)/actions/sysadmin-invoices.ts` — `sysAdminInvoice` is a platform/billing table. Correctly handled.
- `apps/web/src/app/(admin)/actions/automations.ts` — sysadmin cross-tenant operations. Correctly handled.
- `apps/web/src/app/api/admin/users/[id]/role/route.ts` — sysadmin, cross-tenant. Correctly handled.
- `apps/web/src/app/api/admin/tenants/[id]/users/route.ts` — sysadmin, cross-tenant. Correctly handled.

### GPS / system routes
- `apps/web/src/app/api/gps/report/route.ts` — bypass_rls pattern documented. Correctly handled.
- `apps/web/src/app/api/warmup/route.ts` — `prisma.$queryRaw\`SELECT 1\`` — health-check, no tenant data. Correctly handled.

### Security / audit
- `apps/web/src/lib/security/audit-log.ts` — module header documents bypass_rls as intentional (audit_log is append-only, bypass required). Correctly handled.
- `apps/web/src/lib/security/restricted-document-access.ts` — line 60 — "unscoped lookup — intentional for cross-tenant 404 classification + audit." Correctly handled.

### Notification infrastructure
- `apps/web/src/lib/notifications/send-push.ts` — bypass_rls for push token lookup. Correctly handled.
- `apps/web/src/lib/notifications/dispatcher.ts` — uses `db` parameter (injectable for tests), defaults to `defaultPrisma`. The queries on `notificationTemplate` (platform table, Category C) and `tenantNotificationSettings` (tenant-scoped — **potentially Category A**; however, dispatcher always receives `tenantId` and uses it in where clauses). See Category E note for `tenantNotificationSettings`.

### Driver-pay dispute
- `apps/web/src/app/api/driver-pay/me/settlements/[id]/dispute/route.ts` — mobile path uses `$transaction + bypass_rls`. Correctly handled.

### Onboarding / owner portal
- `apps/web/src/app/onboarding/welcome/page.tsx` — server component that uses bare `prisma` in a bypass_rls transaction. Correctly handled.

### Subscription page
- `apps/web/src/app/(owner)/actions/subscription.ts` — comment: "SysAdminInvoice rows are denied under tenant RLS context so we must bypass." `sysAdminInvoice` is a platform/billing model. Category D — intentional bypass documented.

### Automations
- `apps/web/src/lib/automations/evaluator.ts` — cross-tenant automation evaluator, no single tenant context. Category D.

---

## Category E — UNCERTAIN (needs human review)

### E-1: `lib/carrier/notifications.ts` — `getDriverEmail` function
- **File:** `apps/web/src/lib/carrier/notifications.ts`
- **Line 56:** `prisma.carrierDriver.findFirst({ where: { id: driverId }, select: { email: true, user: { select: { email: true } } } })`
- **Model:** `carrierDriver` · **Method:** `findFirst`
- **Uncertainty:** Queries `carrierDriver` by `id` only — no `orgId` filter. In a proper RLS environment under `app_user` with no GUC set, this returns `null`. The function is a private helper inside `sendDispatchAssignedNotification(orgId, dispatchId, driverId)` — the `driverId` SHOULD be scoped to the calling tenant's `orgId`, but the helper doesn't enforce that. If called with a rogue `driverId` from another tenant, it still returns a result (under the current superuser connection), leaking email across tenants.
- **Recommendation:** Add `orgId` filter: `where: { id: driverId, orgId }`. Pass `orgId` to the helper.

### E-2: `lib/notifications/dispatcher.ts` — `tenantNotificationSettings`
- **File:** `apps/web/src/lib/notifications/dispatcher.ts`
- **Line 90:** `db.tenantNotificationSettings.findUnique({ where: { tenantId_triggerKey: { tenantId: options.tenantId, triggerKey } } })`
- **Model:** `tenantNotificationSettings` · **Method:** `findUnique`
- **Uncertainty:** The `tenantId` is provided in `options.tenantId` and used in the where clause, but `db` defaults to bare `defaultPrisma` without RLS context set. Under `app_user`, this returns `null` if the policy isn't satisfied. This could cause all tenant notification settings to appear "not set" (falling back to global defaults), silently breaking per-tenant notification customization.
- **Recommendation:** Determine if `tenantNotificationSettings` has RLS policies. If yes, dispatcher needs `$transaction + set_config` before this query. If no (platform table), it's Category C.

### E-3: `app/(owner)/actions/my-notifications.ts` — `userNotificationPreference`
- **File:** `apps/web/src/app/(owner)/actions/my-notifications.ts`
- **Lines 44, 119:** `prisma.userNotificationPreference.findMany({ where: { userId: session.userId } })`, `prisma.userNotificationPreference.upsert`
- **Model:** `userNotificationPreference` · **Methods:** `findMany`, `upsert`
- **Uncertainty:** Queries by `userId` only (not tenantId). If this table has RLS policies, these queries fail under `app_user`. If it's a user-profile table without RLS, it's fine. Need to confirm RLS policy coverage for `userNotificationPreference`.
- **Recommendation:** Check Prisma schema + Supabase RLS advisor for `userNotificationPreference`. If tenant-scoped, add `getTenantPrisma()`.

### E-4: `lib/driver-pay/snapshot.ts` — `driverCompensationTemplate`
- **File:** `apps/web/src/lib/driver-pay/snapshot.ts`
- **Line 21:** `prisma.driverCompensationTemplate.findFirst({ where: { driverId, isActive: true } })`
- **Model:** `driverCompensationTemplate` · **Method:** `findFirst`
- **Uncertainty:** Queries by `driverId` only. If `driverCompensationTemplate` has RLS policies, this returns `null` under `app_user` without a tenant GUC set. The function is called from `createAssignment` (where `tenantId` is in scope), but `snapshot.ts` itself doesn't receive or use tenantId.
- **Recommendation:** Pass `tenantId` to `snapshotActiveTemplate()` and add it to the where clause.

### E-5: `lib/carrier/notifications.ts` — internal tenant queries without GUC
- **File:** `apps/web/src/lib/carrier/notifications.ts`
- **Lines 130, 242, 380, 482, 585, 686, 842, 973, 1108:** `prisma.tenant.findFirst({ where: { id: orgId } })`
- **Model:** `tenant` · **Method:** `findFirst`
- **Uncertainty:** `tenant.findFirst` with `id` filter — the `tenant` model has RLS (the `tenant_self_read` policy reads `app.current_tenant_id`). Under `app_user` without GUC set, these return `null`. Since `orgId` IS available at call sites, these should use `$transaction + set_config('app.current_tenant_id', orgId, TRUE)`.
- **Recommendation:** Wrap each `tenant.findFirst` in `$transaction + set_config(orgId, TRUE)`. This is functionally identical to the login route's tenant check pattern.

---

## Methodology Notes

- **Grep pattern for imports:** `import \{?.*\bprisma\b.*\}? from ['"]@?/?(lib/db/prisma|@/lib/db/prisma)['"]`
- **Grep pattern for call sites:** `^\s*(?:await\s+)?(?:const\s+\w+\s*=\s*(?:await\s+)?)?prisma\.\w+\.` with `-n`
- **Shadow variable filtering:** Many files do `const prisma = await getTenantPrisma()` which shadows the module-level import. The grep output captured both. Classification was done by reading the surrounding function context to determine which `prisma` variable is used.
- **Files excluded from categories:** `apps/web/src/lib/db/prisma.ts` (definition), `apps/web/src/lib/context/tenant-context.ts` (intentional wrapper), `apps/web/src/lib/db/tenant-client.ts`, `__tests__/` directories, `*.test.ts` files (test mocks don't affect production RLS).
- **Carrier Ops vs legacy models:** Files in `lib/carrier/` use `orgId` as the tenant FK (not `tenantId`). The fix for these is `$transaction + set_config('app.current_tenant_id', orgId, TRUE)` (same value, different column name in the tables).
- **This audit is READ-ONLY. No source files were modified. No commits were made.**

---

## Self-Verification

Re-grep of bare `prisma.*Model.method` call sites (excluding excluded files) confirms approximately 430 call sites across 140 production files, consistent with the categorized entries above. The Category D count is the highest single block because the mobile API routes (~50 files), cron routes (~10 files), and admin actions (~15 files) all correctly use bypass_rls already. The Category A count reflects the bulk of the fix work — primarily the `lib/carrier/*` utility files (which are called from many routes), the carrier dashboard v1 API routes, and the driver-pay API routes.
