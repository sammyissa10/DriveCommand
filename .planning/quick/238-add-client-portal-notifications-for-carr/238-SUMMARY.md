---
phase: quick-238
plan: "01"
subsystem: carrier-ops-notifications
tags:
  - email
  - notifications
  - carrier-ops
  - client-portal
dependency_graph:
  requires:
    - apps/web/src/lib/carrier/notifications.ts (existing notification infrastructure)
    - apps/web/src/lib/notifications/notification-deduplication.ts (idempotency)
    - apps/web/src/lib/email/gmail-client.ts (email sending)
    - apps/web/src/emails/carrier/invoice-generated.tsx (style reference)
  provides:
    - Client pickup confirmation email
    - Client delivery confirmation email
    - Client invoice ready email
  affects:
    - apps/web/src/lib/carrier/stop-completion.ts (pickup trigger)
    - apps/web/src/lib/carrier/loads.ts (delivered + invoice triggers)
tech_stack:
  added: []
  patterns:
    - React Email templates (react-email/components)
    - after() fire-and-forget notification pattern
    - NotificationLog idempotency via wasNotificationAlreadySent
key_files:
  created:
    - apps/web/src/emails/carrier/client-shipment-update.tsx
    - apps/web/src/emails/carrier/client-invoice-ready.tsx
  modified:
    - apps/web/src/lib/carrier/notifications.ts
    - apps/web/src/lib/carrier/stop-completion.ts
    - apps/web/src/lib/carrier/loads.ts
decisions:
  - "Shared ClientShipmentUpdateEmail template for both pickup and delivered events (status prop controls content)"
  - "Invoice notification always sends regardless of portalAccess; pickup/delivered require portalAccess=true"
  - "Idempotency key carrier-client-delivered-{loadId} prevents double-send when both stop-completion cascade and loads.ts updateLoad fire"
metrics:
  duration: "~20 minutes"
  completed: "2026-04-17"
  tasks_completed: 4
  files_modified: 5
---

# Phase quick-238 Plan 01: Client Portal Notifications for Carrier Ops Summary

**One-liner:** Added 3 client-facing email notifications (pickup confirmation, delivery confirmation, invoice ready) wired into carrier ops stop completion and load status flows, with idempotency and fire-and-forget delivery.

## What Was Built

Three new email notification flows for Carrier Operations clients:

1. **Pickup Confirmation** — Fires when the first pickup stop on a load is completed. Only sends to clients with `portalAccess=true`. Includes facility name, timestamp, driver, truck unit, reference numbers, and estimated delivery window. Links to the client tracking portal.

2. **Delivery Confirmation** — Fires when a load status changes to `delivered` (via `updateLoad` in loads.ts). Only sends to clients with `portalAccess=true`. Includes delivery facility, departure time from last stop, driver info, and POD note if a proof-of-delivery document was uploaded.

3. **Invoice Ready** — Fires when a load status changes to `invoiced`. Sends to ALL clients regardless of `portalAccess`. Includes invoice total, due date (computed from payment terms override or client default), and a summary of charge types (Linehaul, Fuel Surcharge, Detention, Other Charges).

## Email Templates

- `client-shipment-update.tsx` — Shared template for pickup and delivered events. Uses `status: 'picked_up' | 'delivered'` prop to switch heading, message, and field labels. Matches existing DriveCommand email style exactly (blue `#1e40af` header, white content, gray details box, blue CTA button).

- `client-invoice-ready.tsx` — Invoice notification template with optional `paymentInstructions` section and "View Invoice" CTA. Same style constants.

## Trigger Points

| Trigger | File | Condition | Notification |
|---------|------|-----------|--------------|
| First pickup stop completed | stop-completion.ts | `stop.stopType === 'pickup'` AND `completedPickups === 1` | `sendClientPickupNotification` |
| Load marked delivered | loads.ts updateLoad | `status === 'delivered'` AND `existing.status !== 'delivered'` | `sendClientDeliveredNotification` |
| Load marked invoiced | loads.ts updateLoad | `status === 'invoiced'` AND `existing.status !== 'invoiced'` | `sendClientInvoiceReadyNotification` |

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash | Description |
|------|-------------|
| 3f72dfc | feat(quick-238): add client shipment update and invoice ready email templates |
| e955f31 | feat(quick-238): add 3 client notification functions to carrier notifications |
| a3ec866 | feat(quick-238): wire client pickup notification trigger into stop-completion |
| cfb44ad | feat(quick-238): wire delivered and invoice ready client notification triggers into loads.ts |

## Self-Check: PASSED

- [x] `apps/web/src/emails/carrier/client-shipment-update.tsx` — created
- [x] `apps/web/src/emails/carrier/client-invoice-ready.tsx` — created
- [x] `apps/web/src/lib/carrier/notifications.ts` — 3 new functions added
- [x] `apps/web/src/lib/carrier/stop-completion.ts` — pickup trigger wired
- [x] `apps/web/src/lib/carrier/loads.ts` — delivered + invoice triggers wired
- [x] All 4 commits exist in git log
- [x] TypeScript compiles cleanly (`npx tsc --noEmit` — no errors outside pre-existing e2e test issues)
- [x] All 3 idempotency keys present: `carrier-client-pickup-`, `carrier-client-delivered-`, `carrier-client-invoice-`
- [x] All triggers use `after()` fire-and-forget pattern
