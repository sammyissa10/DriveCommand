---
phase: quick-9
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/emails/load-status-notification.tsx
  - src/lib/email/customer-notifications.ts
  - src/app/(owner)/actions/loads.ts
  - src/components/crm/customer-form.tsx
  - src/lib/validations/customer.schemas.ts
autonomous: true
must_haves:
  truths:
    - "When a load is dispatched, the customer receives a Dispatched email (if they have email and emailNotifications is true)"
    - "When a load status changes (Picked Up, In Transit, Delivered), the customer receives a status-specific email"
    - "Every automated email sent creates a CustomerInteraction record with isAutomated: true"
    - "Customers without email or with emailNotifications=false do NOT receive emails"
    - "Customer form includes an Email Notifications toggle"
  artifacts:
    - path: "prisma/schema.prisma"
      provides: "emailNotifications Boolean field on Customer model"
      contains: "emailNotifications"
    - path: "src/emails/load-status-notification.tsx"
      provides: "React Email template for load status notifications"
      exports: ["LoadStatusNotificationEmail"]
    - path: "src/lib/email/customer-notifications.ts"
      provides: "Email sending helper for load status changes"
      exports: ["sendLoadStatusEmail"]
    - path: "src/app/(owner)/actions/loads.ts"
      provides: "Load actions with email + CRM integration"
      exports: ["dispatchLoad", "updateLoadStatus"]
  key_links:
    - from: "src/app/(owner)/actions/loads.ts"
      to: "src/lib/email/customer-notifications.ts"
      via: "sendLoadStatusEmail call after status change"
      pattern: "sendLoadStatusEmail"
    - from: "src/lib/email/customer-notifications.ts"
      to: "src/emails/load-status-notification.tsx"
      via: "React Email template rendering"
      pattern: "LoadStatusNotificationEmail"
    - from: "src/app/(owner)/actions/loads.ts"
      to: "prisma.customerInteraction.create"
      via: "CRM interaction auto-creation"
      pattern: "customerInteraction\\.create"
---

<objective>
Build automated customer communication system that sends load status emails and creates CRM interaction records when load statuses change.

Purpose: Customers stay informed about their shipments automatically, and all communications are tracked in the CRM for relationship management visibility.
Output: Email notifications on load dispatch and status transitions, with automatic CRM interaction logging.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@prisma/schema.prisma
@src/lib/email/resend-client.ts
@src/lib/email/send-document-expiry-reminder.ts
@src/emails/document-expiry-reminder.tsx
@src/app/(owner)/actions/loads.ts
@src/app/(owner)/actions/customers.ts
@src/components/crm/customer-form.tsx
@src/lib/validations/customer.schemas.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add emailNotifications field, email template, and notification helper</name>
  <files>
    prisma/schema.prisma
    src/emails/load-status-notification.tsx
    src/lib/email/customer-notifications.ts
    src/components/crm/customer-form.tsx
    src/lib/validations/customer.schemas.ts
  </files>
  <action>
1. **Schema migration** — Add `emailNotifications Boolean @default(true)` field to the Customer model in `prisma/schema.prisma`, immediately after the `notes` field. Run `npx prisma db push` to apply.

2. **React Email template** — Create `src/emails/load-status-notification.tsx` following the exact pattern from `src/emails/document-expiry-reminder.tsx`:
   - Props interface: `{ customerName: string; loadNumber: string; status: string; origin: string; destination: string; driverName: string; truckInfo: string; estimatedDelivery?: string; trackingUrl: string; }`
   - Use status-specific messaging:
     - DISPATCHED: "Your load has been dispatched" (blue header #1e40af)
     - PICKED_UP: "Your load has been picked up" (blue header)
     - IN_TRANSIT: "Your load is in transit" (blue header)
     - DELIVERED: "Your load has been delivered" (green header #059669)
   - Card section showing: Load number, Origin -> Destination, Driver name, Truck info, ETA (if provided)
   - CTA button: "Track Load" linking to trackingUrl
   - Footer: "DriveCommand - Fleet Management" + "This is an automated notification about your shipment."
   - Reuse the same styles object structure (body, container, header, content, card, button, footer) from document-expiry-reminder.tsx

3. **Email sending helper** — Create `src/lib/email/customer-notifications.ts` following the pattern from `send-document-expiry-reminder.ts`:
   - Import `resend, FROM_EMAIL` from `./resend-client`
   - Import `LoadStatusNotificationEmail` from `@/emails/load-status-notification`
   - Export interface `LoadStatusEmailData` with all template props
   - Export async function `sendLoadStatusEmail(toEmail: string, data: LoadStatusEmailData): Promise<{ id: string }>`:
     - Subject format: `"Load ${data.loadNumber} — ${statusLabel}"` where statusLabel maps DISPATCHED->"Dispatched", PICKED_UP->"Picked Up", IN_TRANSIT->"In Transit", DELIVERED->"Delivered"
     - Use `resend.emails.send()` with `react: LoadStatusNotificationEmail(data)`
     - Throw error if `!result.data?.id` (same pattern as existing helpers)

4. **Customer form toggle** — In `src/components/crm/customer-form.tsx`:
   - Add `emailNotifications?: boolean` to the `initialData` interface
   - Add a new section between "Address" and "Notes" sections titled "Communication Preferences"
   - Add a checkbox input: `<input type="checkbox" id="emailNotifications" name="emailNotifications" value="true" defaultChecked={initialData?.emailNotifications !== false} />` with label "Send automated load status emails to this customer"
   - Style as a flex row with gap, matching the form's existing Tailwind patterns

5. **Validation schema** — In `src/lib/validations/customer.schemas.ts`:
   - Add `emailNotifications: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true)` to `customerCreateSchema`
   - This handles the FormData checkbox value (string 'true' or absent)

6. **Customer actions** — In `src/app/(owner)/actions/customers.ts`:
   - In `createCustomer`: extract `emailNotifications` from rawData as `formData.get('emailNotifications') === 'true'`, add to the Prisma create data
   - In `updateCustomer`: same extraction, add to the Prisma update data
  </action>
  <verify>
    Run `npx prisma db push` succeeds. Run `npx next build` compiles without errors. Verify the Customer model has emailNotifications field by checking schema.
  </verify>
  <done>
    Customer model has emailNotifications boolean field. React Email template renders status-specific load notification emails. Email helper function follows existing Resend patterns. Customer form shows email notification toggle. Schema validation handles checkbox value conversion.
  </done>
</task>

<task type="auto">
  <name>Task 2: Hook email sending and CRM logging into load actions</name>
  <files>
    src/app/(owner)/actions/loads.ts
  </files>
  <action>
Modify `src/app/(owner)/actions/loads.ts` to send emails and create CRM interactions after load status changes.

1. **Add imports:**
   - `import { sendLoadStatusEmail } from '@/lib/email/customer-notifications';`
   - `import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';` (already imported)

2. **Create helper function** `sendNotificationAndLogInteraction` (private, not exported):
   ```typescript
   async function sendNotificationAndLogInteraction(
     prisma: any,
     tenantId: string,
     loadId: string,
     newStatus: string
   ): Promise<void> {
     try {
       // Fetch load with customer, driver, truck details
       const load = await prisma.load.findUnique({
         where: { id: loadId },
         include: {
           customer: true,
           driver: { select: { firstName: true, lastName: true } },
           truck: { select: { make: true, model: true, licensePlate: true } },
         },
       });

       if (!load?.customer?.email || !load.customer.emailNotifications) return;

       const driverName = load.driver
         ? `${load.driver.firstName || ''} ${load.driver.lastName || ''}`.trim() || 'Assigned Driver'
         : 'TBD';
       const truckInfo = load.truck
         ? `${load.truck.make} ${load.truck.model} (${load.truck.licensePlate})`
         : 'TBD';
       const trackingUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.drivecommand.com'}/loads/${loadId}`;

       await sendLoadStatusEmail(load.customer.email, {
         customerName: load.customer.contactName || load.customer.companyName,
         loadNumber: load.loadNumber,
         status: newStatus,
         origin: load.origin,
         destination: load.destination,
         driverName,
         truckInfo,
         estimatedDelivery: load.deliveryDate ? load.deliveryDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
         trackingUrl,
       });

       // Create CRM interaction record
       await prisma.customerInteraction.create({
         data: {
           tenantId,
           customerId: load.customer.id,
           type: 'LOAD_UPDATE',
           subject: `Load ${load.loadNumber} — ${formatStatusLabel(newStatus)}`,
           description: `Automated email sent: Load ${load.loadNumber} status changed to ${formatStatusLabel(newStatus)}. Route: ${load.origin} -> ${load.destination}.`,
           isAutomated: true,
         },
       });
     } catch (error) {
       // Log but do NOT throw — email failure should not block load status change
       console.error('Failed to send customer notification:', error);
     }
   }
   ```

3. **Add status label helper** (private):
   ```typescript
   function formatStatusLabel(status: string): string {
     const labels: Record<string, string> = {
       DISPATCHED: 'Dispatched',
       PICKED_UP: 'Picked Up',
       IN_TRANSIT: 'In Transit',
       DELIVERED: 'Delivered',
       INVOICED: 'Invoiced',
       CANCELLED: 'Cancelled',
     };
     return labels[status] || status;
   }
   ```

4. **Modify `dispatchLoad`:** After the successful `prisma.load.update()` call (line ~200-207), before the catch block, add:
   ```typescript
   // Fire-and-forget notification (non-blocking)
   const tId = await requireTenantId();
   sendNotificationAndLogInteraction(prisma, tId, id, 'DISPATCHED');
   ```
   Note: Do NOT await — email sending should not delay the redirect. The function has its own try/catch so errors won't propagate.

5. **Modify `updateLoadStatus`:** After the successful `prisma.load.update()` call (line ~246-249), before the catch block, add:
   ```typescript
   // Only send for customer-relevant statuses
   if (['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'].includes(newStatus)) {
     const tId = await requireTenantId();
     sendNotificationAndLogInteraction(prisma, tId, id, newStatus);
   }
   ```
   Skip INVOICED and CANCELLED — not relevant for customer notifications.

**Critical design decisions:**
- Email failures are caught and logged but NEVER block the load status update (try/catch inside helper)
- Fire-and-forget pattern: do NOT await the notification call — redirect should happen immediately
- Only send to customers with both `email` AND `emailNotifications === true`
- CRM interaction type is `LOAD_UPDATE` (already exists in the InteractionType enum)
- No notification for CANCELLED or INVOICED status changes
  </action>
  <verify>
    Run `npx next build` compiles without errors. Verify load actions file has sendNotificationAndLogInteraction calls in both dispatchLoad and updateLoadStatus. Verify the helper function checks customer.email and customer.emailNotifications before sending.
  </verify>
  <done>
    dispatchLoad sends "Dispatched" email to customer and logs CRM interaction. updateLoadStatus sends status-specific email for PICKED_UP, IN_TRANSIT, DELIVERED and logs CRM interaction. Email failures are non-blocking. Customers without email or with emailNotifications=false are skipped. All automated interactions are recorded with isAutomated=true in CustomerInteraction.
  </done>
</task>

</tasks>

<verification>
1. `npx prisma db push` succeeds — emailNotifications column added to Customer table
2. `npx next build` compiles without TypeScript errors
3. Customer model in schema.prisma contains `emailNotifications Boolean @default(true)`
4. Load status notification email template exists at src/emails/load-status-notification.tsx
5. Customer form renders email notification checkbox
6. dispatchLoad and updateLoadStatus both call sendNotificationAndLogInteraction
7. sendNotificationAndLogInteraction checks customer.email AND customer.emailNotifications
8. CRM interaction records created with isAutomated: true and type: LOAD_UPDATE
</verification>

<success_criteria>
- Customer model has emailNotifications field with default true
- React Email template renders load status emails for all 4 statuses (Dispatched, Picked Up, In Transit, Delivered)
- Email helper follows existing Resend patterns (resend-client.ts, FROM_EMAIL)
- Load actions fire notification + CRM logging after successful status changes
- Email failures never block load operations
- Customer form includes email notification preference toggle
- All automated emails create corresponding CustomerInteraction records
</success_criteria>

<output>
After completion, create `.planning/quick/9-build-automated-customer-communications-/9-SUMMARY.md`
</output>
