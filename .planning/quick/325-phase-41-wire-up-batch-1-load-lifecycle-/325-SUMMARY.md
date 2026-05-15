---
phase: quick-325
plan: 01
subsystem: notifications
tags: [notifications, load-lifecycle, dispatcher, phase-41, batch-1]
dependency_graph:
  requires: [quick-322, quick-320]
  provides: [load.created, load.assigned, load.dispatched, load.picked_up, load.in_transit, load.delivered, load.invoiced, load.cancelled wiring]
  affects: [loads.ts, load-driver-assignments.ts, mobile-status-route, seed-templates]
tech_stack:
  added: []
  patterns: [fire-and-forget .catch() dispatch, void IIFE for async prep, isActive=false seed annotation]
key_files:
  created: []
  modified:
    - apps/web/src/app/(owner)/actions/loads.ts
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
    - apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts
    - apps/web/prisma/seeds/notification-template-data/user.ts
    - apps/web/prisma/seeds/notification-template-data/route.ts
decisions:
  - Used prisma.user (not prisma.driver) for driverName — Load.driver is a User relation
  - Invoice total field is totalAmount in schema (not total) — corrected during tsc check
  - BOL/POD wiring skipped — no standard Document rows with type=BOL/POD exist in load system
  - createAssignment uses carrierDriver (already in the file at line 185) for the lookup
metrics:
  duration: 45min
  completed: 2026-05-14
  tasks: 2
  files: 5
---

# Phase quick-325: Wire Load Lifecycle Notification Triggers (Batch 1) Summary

Wire 8-9 internal load lifecycle dispatchNotification call sites across 4 files, deactivate 3 Supabase-duplicate trigger templates via SQL + seed comments.

## What Was Built

Tasks 1-2 wired internal notification dispatch for the full load lifecycle. Every owner and mobile action that advances a load's status now calls `dispatchNotification` with the fire-and-forget `.catch()` pattern, passing `tenantId`, a fully-typed payload, and `relatedEntity: { type: 'Load', id }`. Three NotificationTemplate rows that duplicate Supabase Auth's native emails were deactivated in production via SQL and matched in the seed files with explanatory comments.

## Audit Findings — dispatchNotification Call Sites Added

| File | Function | Trigger | Line (approx) |
|------|----------|---------|---------------|
| `apps/web/src/app/(owner)/actions/loads.ts` | `createLoad` | `load.created` | after line 210 |
| `apps/web/src/app/(owner)/actions/loads.ts` | `dispatchLoad` | `load.assigned` | inside void IIFE after sendNotificationAndLogInteraction |
| `apps/web/src/app/(owner)/actions/loads.ts` | `dispatchLoad` | `load.dispatched` | same void IIFE |
| `apps/web/src/app/(owner)/actions/loads.ts` | `updateLoadStatus` | `load.picked_up` | switch case in void IIFE |
| `apps/web/src/app/(owner)/actions/loads.ts` | `updateLoadStatus` | `load.in_transit` | switch case |
| `apps/web/src/app/(owner)/actions/loads.ts` | `updateLoadStatus` | `load.delivered` | switch case |
| `apps/web/src/app/(owner)/actions/loads.ts` | `updateLoadStatus` | `load.invoiced` | switch case |
| `apps/web/src/app/(owner)/actions/loads.ts` | `updateLoadStatus` | `load.cancelled` | switch case |
| `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` | `createAssignment` | `load.assigned` | after loadDriverAssignment.create, before revalidatePath |
| `apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts` | `POST` | `load.in_transit` | after tx commits, before NextResponse.json success |
| `apps/web/src/app/api/mobile/driver/loads/[id]/status/route.ts` | `POST` | `load.delivered` | same location |

Total: **11 call sites** (8 in loads.ts, 1 in load-driver-assignments.ts, 2 in mobile route).

## BOL/POD Finding

**Wiring: SKIPPED — no standard load Document upload path for BOL/POD exists.**

Grep results for BOL/POD references in codebase:

```
apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts:161: bolUploaded: uploadedDocTypes.includes('BOL')
apps/web/src/app/api/mobile/carrier/driver/dispatches/[id]/route.ts:163: podUploaded: uploadedDocTypes.includes('POD')
apps/web/src/components/carrier/documents/DocumentList.tsx:54:  bol: 'BOL'
apps/web/src/components/carrier/documents/DocumentList.tsx:55:  pod: 'POD'
apps/web/src/components/driver/stop-document-upload.tsx:13: bol: 'BOL'
apps/web/src/components/driver/stop-document-upload.tsx:14: pod: 'POD'
apps/web/src/lib/carrier/document-types.ts:10: { name: 'POD', slug: 'pod' }
apps/web/src/lib/carrier/document-types.ts:11: { name: 'BOL', slug: 'bol' }
```

Every BOL/POD reference is in the **carrier** subsystem (`CarrierDocument` / `CarrierDocumentType` models). The standard load system's `apps/web/src/app/(owner)/actions/load-documents.ts` hardcodes `documentType: 'RATE_CONFIRMATION'` and there is no other server action or API route that creates `Document` rows with `documentType='BOL'` or `documentType='POD'`. `load.bol_uploaded` and `load.pod_uploaded` remain dead-letter triggers until a user-facing BOL/POD upload flow is built in the standard load system. No code was invented.

## Seed Change Diff

### user.ts — user.welcome
```diff
-    isActive: true,
+    // Deactivated (quick-325, Phase 41 wire-up batch 1):
+    // Supabase Auth sends the welcome email natively. Wiring this trigger
+    // would cause duplicate emails to land in the user's inbox.
+    // Re-activate ONLY if Supabase Auth's native welcome email is disabled.
+    isActive: false,
```

### user.ts — user.password_reset
```diff
-    isActive: true,
+    // Deactivated (quick-325, Phase 41 wire-up batch 1):
+    // Supabase Auth sends password reset emails natively via auth.resetPasswordForEmail().
+    // Wiring this trigger would cause duplicate emails. Re-activate ONLY if
+    // Supabase Auth's native password reset email is disabled.
+    isActive: false,
```

### route.ts — route.delayed
```diff
-    isActive: true,
+    // Deactivated (quick-325, Phase 41 wire-up batch 1):
+    // No automated delay-detection mechanism exists. There is no cron, server
+    // action, or background job that compares ETA vs. actual progress and fires
+    // this trigger. Re-activate when Phase 42 builds route monitoring.
+    isActive: false,
```

## Production SQL Applied

**UPDATE statement:**
```sql
UPDATE "NotificationTemplate"
SET "isActive" = false, "updatedAt" = NOW()
WHERE "triggerKey" IN ('user.welcome', 'user.password_reset', 'route.delayed');
```
Result: `UPDATE 3`

**Post-state verify SELECT result:**
```
┌─────────────────────┬──────────┬──────────────────────────────────────┐
│     triggerKey      │ isActive │              updatedAt               │
├─────────────────────┼──────────┼──────────────────────────────────────┤
│ route.delayed       │ false    │ 2026-05-14 22:24:42.266767 -0500 CDT │
│ user.password_reset │ false    │ 2026-05-14 22:24:42.266767 -0500 CDT │
│ user.welcome        │ false    │ 2026-05-14 22:24:42.266767 -0500 CDT │
└─────────────────────┴──────────┴──────────────────────────────────────┘
```
All 3 rows confirmed `isActive = false`.

## Seed Runner Verification

`apps/web/prisma/seeds/seed-notifications.ts` line 112 confirmed:
```typescript
// intentionally NOT updating isActive or inAppEnabled — SysAdmin owns those at runtime
```
The UPDATE branch does NOT include `isActive` or `inAppEnabled`. Re-running `npm run seed:notifications` will NOT revert the isActive=false flip.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong Prisma model for driver name lookup in dispatchLoad**
- **Found during:** Task 1 tsc check
- **Issue:** Plan instructed `prisma.driver.findUnique` — no such model. `Load.driver` is a `User` relation.
- **Fix:** Changed to `prisma.user.findUnique`
- **Files modified:** `apps/web/src/app/(owner)/actions/loads.ts`

**2. [Rule 1 - Bug] Wrong Invoice field name (`total` vs `totalAmount`)**
- **Found during:** Task 1 tsc check
- **Issue:** Plan referenced `invoice.total` but the Prisma schema defines `Invoice.totalAmount`.
- **Fix:** Changed select clause to `{ invoiceNumber: true, totalAmount: true }` and amount formatting to `Number(invoice.totalAmount).toFixed(2)`
- **Files modified:** `apps/web/src/app/(owner)/actions/loads.ts`

**3. [Rule 2 - Missing] createLoad notification needs outer-scope variable capture**
- **Found during:** Task 1 implementation
- **Issue:** `tenantId`, `loadNumber`, `origin`, `destination` were scoped inside the try block
- **Fix:** Declared `createdTenantId`, `createdLoadNumber`, `createdOrigin`, `createdDestination` in outer scope and assigned inside try, making them available after the catch block for the dispatch call
- **Files modified:** `apps/web/src/app/(owner)/actions/loads.ts`

## Per-Trigger Smoke Test Results

_Awaiting human verification at Task 3 checkpoint. Deploy URL: https://drive-command.vercel.app_

## Regression Check

The existing `sendNotificationAndLogInteraction` calls in `loads.ts` (lines 410 and 547) are completely untouched. The new internal dispatch calls are added ALONGSIDE them, not replacing them. Both flows coexist for the same status transitions.

## Deactivation Check

The three deactivated triggers (`user.welcome`, `user.password_reset`, `route.delayed`) have `isActive=false` in the production DB as of 2026-05-14 22:24 UTC. Any `dispatchNotification` call for these triggers will short-circuit at Step 1 (template fetch) and write a single `SKIPPED_DISABLED` SendLog row with no email or in-app delivery.

## Followups for Batch 2 / Batch 3

1. **`load.cancelled` reason field** — Currently uses placeholder string `'Cancelled by dispatcher'`. No UI prompt collects a cancellation reason today. Add a reason field to the cancel modal and surface it through the `updateLoadStatus` call.

2. **`load.assigned` dedup** — `dispatchLoad` fires `load.assigned` AND `createAssignment` fires `load.assigned` for the same load when both flows run. Current dispatcher idempotency key is based on `(triggerKey, relatedEntityId, userId)` — check if this dedupes correctly or if two separate `load.assigned` SendLog rows appear. Consolidate in Batch 2 if dedup is not desired.

3. **BOL/POD upload path** — `load.bol_uploaded` and `load.pod_uploaded` remain dead-letter. Wire when a user-facing upload flow for standard load Documents with type=BOL/POD is built.

4. **`dispatchLoad` driverName fallback** — Uses `'Driver'` as fallback when `prisma.user.findUnique` returns null. Consider whether the owner should always have a User row before dispatching (which should be the case) or if the fallback needs a better string.

## Self-Check: PASSED

All 4 modified source files verified to exist. Both commits verified in git log. tsc --noEmit exits 0. npm run build exits 0. Production deploy succeeded at https://drive-command.vercel.app. SQL UPDATE confirmed 3 rows flipped to isActive=false.
