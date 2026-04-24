---
phase: quick-238
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/emails/carrier/client-shipment-update.tsx
  - apps/web/src/emails/carrier/client-invoice-ready.tsx
  - apps/web/src/lib/carrier/notifications.ts
  - apps/web/src/lib/carrier/stop-completion.ts
  - apps/web/src/lib/carrier/loads.ts
autonomous: true
must_haves:
  truths:
    - "Client receives email when first pickup stop on their load is completed (portal_access=true only)"
    - "Client receives email when load status changes to delivered (portal_access=true only)"
    - "Client receives email when load status changes to invoiced (regardless of portal_access)"
    - "All three notifications are idempotent via NotificationLog"
    - "Notifications never block the calling action (after() + try/catch)"
  artifacts:
    - path: "apps/web/src/emails/carrier/client-shipment-update.tsx"
      provides: "Shared pickup/delivered email template"
    - path: "apps/web/src/emails/carrier/client-invoice-ready.tsx"
      provides: "Invoice ready email template for clients"
    - path: "apps/web/src/lib/carrier/notifications.ts"
      provides: "3 new client notification functions"
  key_links:
    - from: "apps/web/src/lib/carrier/stop-completion.ts"
      to: "sendClientPickupNotification"
      via: "after() in completeStop when first pickup completed"
      pattern: "after.*sendClientPickup"
    - from: "apps/web/src/lib/carrier/loads.ts"
      to: "sendClientDeliveredNotification"
      via: "after() in updateLoad when status=delivered"
      pattern: "after.*sendClientDelivered"
    - from: "apps/web/src/lib/carrier/loads.ts"
      to: "sendClientInvoiceReadyNotification"
      via: "after() in updateLoad when status=invoiced (already exists, add new call)"
      pattern: "after.*sendClientInvoiceReady"
---

<objective>
Add 3 client-facing email notifications to the Carrier Operations module: pickup confirmation, delivery confirmation, and invoice ready. These notify the client's AP contact when their shipment progresses through key milestones.

Purpose: Clients with portal access get proactive updates; all clients get invoice notifications for payment processing.
Output: 2 new email templates, 3 new notification functions, 3 trigger points wired into existing flows.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/lib/carrier/notifications.ts
@apps/web/src/lib/carrier/stop-completion.ts
@apps/web/src/lib/carrier/loads.ts
@apps/web/src/emails/carrier/invoice-generated.tsx
@apps/web/src/emails/carrier/load-delivered.tsx
@apps/web/src/lib/email/gmail-client.ts
@apps/web/src/lib/notifications/notification-deduplication.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Create client email templates</name>
  <files>
    apps/web/src/emails/carrier/client-shipment-update.tsx
    apps/web/src/emails/carrier/client-invoice-ready.tsx
  </files>
  <action>
Create two React Email templates matching the exact style of existing carrier emails (blue #1e40af header with "DriveCommand - {companyName}", white content area, gray details box, blue CTA button, footer).

**client-shipment-update.tsx** — Shared template for pickup and delivered events:
- Props interface `ClientShipmentUpdateEmailProps`:
  - `status`: `'picked_up' | 'delivered'`
  - `loadNumber`: string
  - `companyName`: string (carrier's Tenant.name)
  - `facilityName`: string (pickup or delivery facility name + city + state)
  - `timestamp`: string (formatted date)
  - `driverName`: string (first + last)
  - `truckUnitNumber`: string
  - `referenceNumbers`: string (BOL/PRO/PO concatenated, or empty)
  - `commodity`: string | undefined
  - `estimatedDelivery`: string | undefined (only for pickup)
  - `podNote`: string | undefined (only for delivered, e.g. "POD document uploaded")
  - `portalUrl`: string | undefined
- Greeting: "Shipment Picked Up" or "Shipment Delivered" based on status
- Message: contextual sentence per status
- Details box: load number, reference numbers (if any), commodity (if any), facility, timestamp, driver name, truck unit. For pickup: estimated delivery. For delivered: POD note if present.
- CTA button: "Track Shipment" linking to portalUrl (only render if portalUrl defined)
- Footer: "This is an automated shipment notification from {companyName}."
- Export named: `ClientShipmentUpdateEmail`

**client-invoice-ready.tsx** — Invoice notification template:
- Props interface `ClientInvoiceReadyEmailProps`:
  - `loadNumber`: string
  - `companyName`: string
  - `invoiceTotal`: number
  - `dueDate`: string
  - `lineItemsSummary`: string (e.g. "Linehaul, FSC, Detention" — joined type names)
  - `paymentInstructions`: string | undefined
  - `portalUrl`: string | undefined
- Greeting: "Invoice Ready for Payment"
- Message: "An invoice has been generated for your shipment. Please review the details and arrange payment by the due date."
- Details box: load number, invoice total (formatted USD via Intl.NumberFormat), due date, line items summary
- If paymentInstructions defined, render a second section with "Payment Instructions" heading
- CTA button: "View Invoice" linking to portalUrl (only if defined)
- Footer: "This is an automated invoice notification from {companyName}."
- Export named: `ClientInvoiceReadyEmail`

Use identical style constants as existing templates (copy the styles object from invoice-generated.tsx).
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — both templates compile with no errors.</verify>
  <done>Two email template files exist, export named components, match existing DriveCommand email style.</done>
</task>

<task type="auto">
  <name>Task 2: Add 3 client notification functions to notifications.ts</name>
  <files>apps/web/src/lib/carrier/notifications.ts</files>
  <action>
Add 3 new exported async functions to the bottom of `apps/web/src/lib/carrier/notifications.ts`. Follow the exact same pattern as existing functions (idempotency check, recordNotification, sendEmail with React.createElement, markNotificationSent/Failed, logger, try/catch never throw).

Import the two new email templates at the top alongside existing imports:
```
import { ClientShipmentUpdateEmail } from '@/emails/carrier/client-shipment-update';
import { ClientInvoiceReadyEmail } from '@/emails/carrier/client-invoice-ready';
```

**Helper — getClientEmailForLoad(orgId, loadId):**
Add a private helper that queries CarrierLoad with includes:
- `client`: select `name`, `email`, `portalAccess`, `portalEmail`, `paymentTerms`
- `contract`: select `paymentTermsOverride`
- `dispatch`: select `primaryDriverId`, `truckId`, include `primaryDriver` (select `firstName`, `lastName`), `truck` (select `unitNumber`)
- `stops`: orderBy sequenceOrder asc, include `facility` (select `name`, `city`, `state`), select also `stopType`, `appointmentStart`, `appointmentEnd`, `podNumber`, `departedAt`

Returns the full load object or null. Scoped by orgId.

**1. sendClientPickupNotification(orgId: string, loadId: string, completedStopId: string): Promise<void>**
- Idempotency key: `carrier-client-pickup-${loadId}`
- Call getClientEmailForLoad. If no load, warn and return.
- Check `load.client.portalAccess === true` — if false, return silently (no log needed).
- Recipient: `load.client.email` (the schema has `email` not `ap_contact_email`). If null, log warning + markNotificationFailed and return.
- Get tenant name: `prisma.tenant.findFirst({ where: { id: orgId }, select: { name: true } })`
- Build data:
  - loadNumber = load.referenceNumber ?? loadId.slice(0, 8)
  - Find the completed pickup stop from load.stops (match completedStopId)
  - facilityName = stop.facility.name + ", " + stop.facility.city + " " + stop.facility.state (handle nulls)
  - timestamp = new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })
  - driverName = [dispatch.primaryDriver.firstName, dispatch.primaryDriver.lastName].filter(Boolean).join(' ') || 'Driver'
  - truckUnitNumber = dispatch.truck.unitNumber
  - referenceNumbers = [load.bolNumber, load.proNumber, load.poNumber].filter(Boolean).join(' / ')
  - commodity = load.commodityDescription ?? undefined
  - estimatedDelivery = find last delivery stop with appointmentStart, format it, or undefined
  - portalUrl = `${baseUrl}/track/${loadId}` (only if portalAccess)
- Record notification (type: 'carrier-client-pickup', entityType: 'load', entityId: loadId)
- Send email with ClientShipmentUpdateEmail, status='picked_up'
- Mark sent. Log info.

**2. sendClientDeliveredNotification(orgId: string, loadId: string): Promise<void>**
- Idempotency key: `carrier-client-delivered-${loadId}`
- Call getClientEmailForLoad. If no load, warn and return.
- Check `load.client.portalAccess === true` — if false, return silently.
- Recipient: `load.client.email`. If null, log warning + markNotificationFailed.
- Build data:
  - loadNumber, tenant name (same pattern)
  - Find last delivery stop (stopType='delivery', last by sequence)
  - facilityName from that stop's facility
  - timestamp = stop.departedAt formatted, or now()
  - driverName, truckUnitNumber from dispatch
  - referenceNumbers from load
  - podNote: check if any delivery stop has a CarrierDocument with type 'pod' — use `prisma.carrierDocument.count({ where: { stopId: lastDeliveryStop.id, documentType: 'pod' } })`. If count > 0, podNote = "Proof of Delivery document has been uploaded"
  - portalUrl = `${baseUrl}/track/${loadId}`
- Record notification (type: 'carrier-client-delivered', entityType: 'load', entityId: loadId)
- Send email with ClientShipmentUpdateEmail, status='delivered'

**3. sendClientInvoiceReadyNotification(orgId: string, loadId: string): Promise<void>**
- Idempotency key: `carrier-client-invoice-${loadId}`
- Call getClientEmailForLoad. If no load, warn and return.
- NOTE: Do NOT check portalAccess — invoice emails always send.
- Recipient: `load.client.email`. If null, log warning + markNotificationFailed.
- Build data:
  - loadNumber, tenant name
  - invoiceTotal = load.totalRevenue ? Number(load.totalRevenue) : 0
  - paymentTermsDays: contract.paymentTermsOverride ? parseInt(it, 10) || client.paymentTerms : client.paymentTerms
  - dueDate = new Date(), add paymentTermsDays, format as 'MMM D, YYYY'
  - lineItemsSummary: For now, derive from load fields — build array: always "Linehaul", if load.fuelSurcharge > 0 add "Fuel Surcharge", if load.detentionAmount > 0 add "Detention", if load.otherCharges > 0 add "Other Charges". Join with ", ".
  - portalUrl = load.client.portalAccess ? `${baseUrl}/track/${loadId}` : undefined
  - subject: `Invoice Ready - ${loadNumber} - $${invoiceTotal.toFixed(2)}`
- Record notification (type: 'carrier-client-invoice-ready', entityType: 'load', entityId: loadId)
- Send email with ClientInvoiceReadyEmail

Do NOT modify any existing functions. Only add new code.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no type errors.</verify>
  <done>Three new exported functions exist in notifications.ts. Each uses idempotency, try/catch, never throws, logs errors.</done>
</task>

<task type="auto">
  <name>Task 3: Wire pickup trigger into stop-completion.ts</name>
  <files>apps/web/src/lib/carrier/stop-completion.ts</files>
  <action>
In `apps/web/src/lib/carrier/stop-completion.ts`, add the pickup notification trigger.

1. Add import at top: `import { sendClientPickupNotification } from '@/lib/carrier/notifications';`

2. In the `completeStop` function, after the existing load cascade block (around line 153-178), add a new check BEFORE the load-delivered cascade. Specifically, right after the stop is updated (after line 148 `return { data: updatedStop }` — wait, that's not right. The cascade is at line 153+).

The trigger should fire when:
- The stop being completed is a PICKUP stop (`stop.stopType === 'pickup'`)
- It is the FIRST pickup stop on this load to be completed
- The stop has a loadId

Add this logic right after the stop update (line 148) and before the load cascade (line 153):

```typescript
// Fire client pickup notification when first pickup stop is completed
if (stop.loadId && stop.stopType === 'pickup') {
  const completedPickups = await prisma.carrierStop.count({
    where: {
      loadId: stop.loadId,
      stopType: 'pickup',
      status: 'completed',
    },
  });
  // Only notify on the FIRST completed pickup (count=1 means this one just completed)
  if (completedPickups === 1) {
    after(() => sendClientPickupNotification(orgId, stop.loadId!, stopId));
  }
}
```

Place this block between the stop completion log line (line 148) and the load cascade check (line 153). Keep existing code untouched.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no errors. Read the file to confirm the block is in the right place.</verify>
  <done>First pickup completion on a load triggers sendClientPickupNotification via after().</done>
</task>

<task type="auto">
  <name>Task 4: Wire delivered and invoice triggers into loads.ts</name>
  <files>apps/web/src/lib/carrier/loads.ts</files>
  <action>
In `apps/web/src/lib/carrier/loads.ts`, add two new notification triggers.

1. Add import at top alongside existing notification import:
```typescript
import { sendInvoiceGeneratedNotification, sendClientDeliveredNotification, sendClientInvoiceReadyNotification } from '@/lib/carrier/notifications';
```
(Update the existing import line to include the two new functions.)

2. In the `updateLoad` function, find the existing invoiced trigger block (lines 376-378):
```typescript
if (data.status === 'invoiced' && existing.status !== 'invoiced') {
  after(() => sendInvoiceGeneratedNotification(orgId, id));
}
```

Add the delivered trigger BEFORE this block:
```typescript
// Notify client when load is marked as delivered
if (data.status === 'delivered' && existing.status !== 'delivered') {
  after(() => sendClientDeliveredNotification(orgId, id));
}
```

Add the client invoice trigger AFTER the existing invoiced block (so both the owner invoice notification and client invoice notification fire):
```typescript
// Notify client that invoice is ready for payment
if (data.status === 'invoiced' && existing.status !== 'invoiced') {
  after(() => sendClientInvoiceReadyNotification(orgId, id));
}
```

Note: The delivered notification is ALSO triggered from stop-completion.ts when the last delivery stop completes and the load status is set to 'delivered' there. However, that code path uses `prisma.carrierLoad.update` directly, not `updateLoad()`. So the trigger in loads.ts catches manual status changes via the UI, while stop-completion catches the automatic cascade. The sendClientDeliveredNotification function's idempotency key (`carrier-client-delivered-${loadId}`) ensures only one email is sent even if both paths fire.

Do NOT modify the existing `sendInvoiceGeneratedNotification` call or any other existing code.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no errors. Read the updateLoad function to confirm both triggers are wired correctly.</verify>
  <done>Delivered status change triggers sendClientDeliveredNotification. Invoiced status change triggers both existing owner notification and new client notification. All via after().</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — zero type errors
2. Grep for all 3 idempotency keys to confirm they exist in notifications.ts:
   - `carrier-client-pickup-`
   - `carrier-client-delivered-`
   - `carrier-client-invoice-`
3. Grep for `sendClientPickupNotification` in stop-completion.ts — confirms wiring
4. Grep for `sendClientDeliveredNotification` and `sendClientInvoiceReadyNotification` in loads.ts — confirms wiring
5. Grep for `after(` in both trigger files — confirms fire-and-forget pattern
6. Verify no existing functions were modified (git diff should show only additions)
</verification>

<success_criteria>
- Two new email templates compile and export named components
- Three new notification functions in notifications.ts follow existing patterns exactly
- Pickup notification fires on first pickup stop completion (stop-completion.ts)
- Delivered notification fires on load status change to 'delivered' (loads.ts + stop-completion.ts cascade, deduplicated)
- Invoice notification fires on load status change to 'invoiced' (loads.ts)
- Pickup/delivered only send when client.portalAccess=true
- Invoice always sends regardless of portalAccess
- All use after() pattern, try/catch, NotificationLog idempotency
- No existing notification functions modified
- No schema changes
- TypeScript compiles cleanly
</success_criteria>

<output>
After completion, create `.planning/quick/238-add-client-portal-notifications-for-carr/238-SUMMARY.md`
</output>
