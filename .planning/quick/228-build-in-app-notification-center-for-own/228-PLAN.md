---
phase: quick-228
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260416000001_in_app_notifications/migration.sql
  - apps/web/src/lib/carrier/in-app-notifications.ts
  - apps/web/src/lib/carrier/notifications.ts
  - apps/web/src/app/api/v1/carrier/notifications/route.ts
  - apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts
  - apps/web/src/components/navigation/notification-bell.tsx
  - apps/web/src/components/navigation/notification-center.tsx
  - apps/web/src/components/navigation/owner-shell.tsx
autonomous: true
must_haves:
  truths:
    - "Owner sees a bell icon in the top nav bar with unread count badge"
    - "Clicking the bell opens a dropdown showing recent notifications"
    - "Clicking a notification marks it read and navigates to the entity page"
    - "Mark all read clears all unread indicators"
    - "Badge count refreshes every 60 seconds"
    - "Notifications are tenant-isolated"
  artifacts:
    - path: "apps/web/prisma/migrations/20260416000001_in_app_notifications/migration.sql"
      provides: "in_app_notifications table with RLS"
    - path: "apps/web/src/lib/carrier/in-app-notifications.ts"
      provides: "createNotification() helper"
    - path: "apps/web/src/app/api/v1/carrier/notifications/route.ts"
      provides: "GET notifications endpoint"
    - path: "apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts"
      provides: "PATCH mark-read endpoint"
    - path: "apps/web/src/components/navigation/notification-bell.tsx"
      provides: "Bell icon with polling badge"
    - path: "apps/web/src/components/navigation/notification-center.tsx"
      provides: "Notification dropdown UI"
  key_links:
    - from: "apps/web/src/lib/carrier/notifications.ts"
      to: "apps/web/src/lib/carrier/in-app-notifications.ts"
      via: "createNotification() called inside each send* function"
      pattern: "createNotification"
    - from: "apps/web/src/components/navigation/notification-bell.tsx"
      to: "/api/v1/carrier/notifications"
      via: "fetch polling every 60s"
      pattern: "api/v1/carrier/notifications"
    - from: "apps/web/src/components/navigation/owner-shell.tsx"
      to: "apps/web/src/components/navigation/notification-bell.tsx"
      via: "rendered in header next to UserMenu"
      pattern: "NotificationBell"
---

<objective>
Build an in-app notification center for the owner portal. Owners will see a bell icon in the top nav with an unread count badge, and clicking it opens a dropdown with recent actionable notifications (dispatch assigned, load delivered, pay record ready, invoice generated, compliance alerts, needs-assignment). Backed by a real database table with tenant isolation via RLS.

Purpose: Dispatchers need alerts without leaving the app; currently all alerts are email-only.
Output: Database table, API routes, notification writer, bell + dropdown UI in owner shell header.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma
@apps/web/src/lib/carrier/notifications.ts
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/app/api/v1/carrier/dispatches/route.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Database — add in_app_notifications table + RLS</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/20260416000001_in_app_notifications/migration.sql
  </files>
  <action>
1. Add a new enum `InAppNotificationType` to schema.prisma:
   - Values: `dispatch_assigned`, `load_delivered`, `pay_record_ready`, `invoice_generated`, `compliance_alert`, `needs_assignment`

2. Add a new model `InAppNotification` to schema.prisma (after CarrierCatalogMeta, before the closing of the file):
   ```
   model InAppNotification {
     id         String                @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
     orgId      String                @map("org_id") @db.Uuid
     userId     String?               @map("user_id") @db.Uuid
     type       InAppNotificationType
     title      String                @db.VarChar(200)
     message    String
     entityType String                @map("entity_type") @db.VarChar(50)
     entityId   String                @map("entity_id") @db.Uuid
     read       Boolean               @default(false)
     createdAt  DateTime              @default(now()) @map("created_at") @db.Timestamptz

     tenant Tenant @relation(fields: [orgId], references: [id])
     user   User?  @relation(fields: [userId], references: [id])

     @@index([orgId, read, createdAt(sort: Desc)])
     @@index([orgId, createdAt(sort: Desc)])
     @@map("in_app_notifications")
   }
   ```

3. Add reverse relations on Tenant: `inAppNotifications InAppNotification[]` and on User: `inAppNotifications InAppNotification[]`.

4. Write migration.sql manually (do NOT run prisma migrate dev):
   - Create the enum type `InAppNotificationType` with all 6 values
   - Create the `in_app_notifications` table with all columns, PK, FKs to `"Tenant"(id)` and `"User"(id)`
   - Create the two composite indexes
   - Enable RLS: `ALTER TABLE in_app_notifications ENABLE ROW LEVEL SECURITY;`
   - Add RLS SELECT policy: users can only read where `org_id = (auth.jwt() ->> 'org_id')::uuid`
   - Add RLS INSERT policy: service role only (for the app to insert via service role connection)
   - Add RLS UPDATE policy: users can update (mark read) where `org_id = (auth.jwt() ->> 'org_id')::uuid`

5. After writing migration.sql, run: `cd apps/web && npx prisma migrate deploy` to apply, then `npx prisma generate` to update the client.
  </action>
  <verify>
    Run `cd apps/web && npx prisma validate` — exits 0.
    Run a quick SQL check: `npx prisma db execute --stdin <<< "SELECT count(*) FROM in_app_notifications;"` — returns 0 rows (table exists).
  </verify>
  <done>in_app_notifications table exists in the database with RLS policies, Prisma client is generated with the InAppNotification model.</done>
</task>

<task type="auto">
  <name>Task 2: createNotification helper + wire into existing send* functions</name>
  <files>
    apps/web/src/lib/carrier/in-app-notifications.ts
    apps/web/src/lib/carrier/notifications.ts
  </files>
  <action>
1. Create `apps/web/src/lib/carrier/in-app-notifications.ts`:

   Export an async function `createNotification(params)` that accepts:
   ```ts
   {
     orgId: string;
     userId?: string | null;  // null = visible to all owners in org
     type: InAppNotificationType;  // use the Prisma enum
     title: string;
     message: string;
     entityType: string;
     entityId: string;
   }
   ```
   Implementation:
   - Wrap entire body in try/catch — on error, `logger.error(...)` and return (NEVER throw).
   - Call `prisma.inAppNotification.create({ data: { orgId, userId, type, title, message, entityType, entityId } })`.
   - Import prisma from `@/lib/db/prisma`, logger from `@/lib/logger`.

2. Modify `apps/web/src/lib/carrier/notifications.ts` — add `createNotification` calls alongside existing email sends. Import `createNotification` from `./in-app-notifications`. Import the enum type `InAppNotificationType` from the generated Prisma client.

   In each function, call `createNotification()` AFTER the email send attempt (so email idempotency is unaffected), using `await` but still inside the existing try/catch:

   a. `sendDispatchAssignedNotification` — after the email send block (around line 158), add:
      ```ts
      // Resolve driver name for notification message
      const driver = await prisma.carrierDriver.findFirst({
        where: { id: driverId }, select: { firstName: true, lastName: true }
      });
      const driverFullName = [driver?.firstName, driver?.lastName].filter(Boolean).join(' ') || 'Driver';
      await createNotification({
        orgId,
        type: 'dispatch_assigned',
        title: 'Dispatch Assigned',
        message: `${driverFullName} assigned to ${dispatchNumber}`,
        entityType: 'dispatch',
        entityId: dispatchId,
      });
      ```

   b. `sendLoadDeliveredNotification` — after markNotificationSent (around line 262), add:
      ```ts
      await createNotification({
        orgId,
        type: 'load_delivered',
        title: 'Load Delivered',
        message: `${loadNumber} delivered to ${load.client.name}`,
        entityType: 'load',
        entityId: loadId,
      });
      ```

   c. `sendPayRecordReadyNotification` — after markNotificationSent (around line 339), add:
      ```ts
      await createNotification({
        orgId,
        type: 'pay_record_ready',
        title: 'Pay Record Ready',
        message: `${driverName} — ${dispatchNumber} — $${netPay.toFixed(2)}`,
        entityType: 'driver_pay_record',
        entityId: payRecordId,
      });
      ```

   d. `sendInvoiceGeneratedNotification` — after markNotificationSent (around line 453), add:
      ```ts
      await createNotification({
        orgId,
        type: 'invoice_generated',
        title: 'Invoice Generated',
        message: `${loadNumber} — $${invoiceTotal.toFixed(2)} due in ${paymentTermsDays} days`,
        entityType: 'load',
        entityId: loadId,
      });
      ```

   e. `sendComplianceAlertNotifications` — after markNotificationSent (around line 522), add a loop:
      ```ts
      for (const alert of alerts) {
        // Determine entityType and entityId from the alert link
        const linkParts = alert.link.split('/');
        let entityType = 'compliance';
        let entityId = orgId;
        if (alert.link.includes('/fleet/drivers/')) {
          entityType = 'driver';
          entityId = linkParts[linkParts.length - 1] || orgId;
        } else if (alert.link.includes('/fleet/trucks/')) {
          entityType = 'truck';
          entityId = linkParts[linkParts.length - 1] || orgId;
        }
        await createNotification({
          orgId,
          type: 'compliance_alert',
          title: 'Compliance Alert',
          message: alert.message,
          entityType,
          entityId,
        });
      }
      ```

   IMPORTANT: Do NOT modify the NotificationLog writes or idempotency logic. The in-app notifications are additive only.
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors in notifications.ts or in-app-notifications.ts.
  </verify>
  <done>createNotification() helper exists and is called from all 5 send* functions. Errors are caught and logged, never thrown.</done>
</task>

<task type="auto">
  <name>Task 3: API routes — GET notifications + PATCH mark-read</name>
  <files>
    apps/web/src/app/api/v1/carrier/notifications/route.ts
    apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts
  </files>
  <action>
1. Create `apps/web/src/app/api/v1/carrier/notifications/route.ts`:

   GET handler:
   - Import `getSession` from `@/lib/auth/supabase`, `prisma` from `@/lib/db/prisma`, `logger` from `@/lib/logger`.
   - Validate session: if no session or no tenantId, return 401/403.
   - Read query params: `unread` (boolean string), `limit` (default 20, max 50).
   - Build Prisma where clause: `{ orgId: session.tenantId }`. If `unread=true`, add `read: false`.
   - Also add `OR: [{ userId: null }, { userId: session.userId }]` to the where clause so users see org-wide notifications AND their own.
   - Query: `prisma.inAppNotification.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit })`.
   - Also query total unread count: `prisma.inAppNotification.count({ where: { orgId, read: false, OR: [{ userId: null }, { userId: session.userId }] } })`.
   - Additionally, check for needs-assignment dispatches: query `prisma.carrierDispatch.findMany({ where: { orgId, status: 'planned', needsAssignment: true } })`. Wait — the CarrierDispatch model does not have a `needsAssignment` field based on the schema. Instead, check dispatches where `primaryDriverId` might indicate unassigned status. Actually, looking at the schema, CarrierDispatch requires `primaryDriverId` (non-nullable). Skip the needs-assignment transient notification logic since the schema does not support it — dispatches always have a driver assigned. Log a note about this in code comments.
   - Return JSON: `{ notifications: [...], unreadCount: N }`.

2. Create `apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts`:

   PATCH handler:
   - Validate session same as above.
   - Parse body with zod: `{ ids?: string[], all?: boolean }`. At least one must be provided.
   - If `all: true`: `prisma.inAppNotification.updateMany({ where: { orgId: session.tenantId, read: false, OR: [{ userId: null }, { userId: session.userId }] }, data: { read: true } })`.
   - If `ids` provided: `prisma.inAppNotification.updateMany({ where: { id: { in: ids }, orgId: session.tenantId }, data: { read: true } })`. The orgId filter ensures tenant isolation.
   - Return `{ success: true, updated: result.count }`.
   - Wrap in try/catch, return 500 on error.

   Follow the same auth pattern as `apps/web/src/app/api/v1/carrier/dispatches/route.ts`: `const session = await getSession(); if (!session) return 401; const orgId = session.tenantId; if (!orgId) return 403;`
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors in the new route files.
  </verify>
  <done>GET /api/v1/carrier/notifications returns tenant-scoped notifications with unread count. PATCH /api/v1/carrier/notifications/mark-read marks specified or all notifications as read.</done>
</task>

<task type="auto">
  <name>Task 4: NotificationBell + NotificationCenter UI in owner shell header</name>
  <files>
    apps/web/src/components/navigation/notification-bell.tsx
    apps/web/src/components/navigation/notification-center.tsx
    apps/web/src/components/navigation/owner-shell.tsx
  </files>
  <action>
1. Create `apps/web/src/components/navigation/notification-bell.tsx`:
   - "use client" component.
   - State: `unreadCount` (number), `isOpen` (boolean).
   - On mount + every 60 seconds, fetch `GET /api/v1/carrier/notifications?unread=true&limit=1` to get the `unreadCount` from the response. Use `setInterval` with cleanup in useEffect.
   - Render: a `<button>` with Lucide `Bell` icon (size 20). If `unreadCount > 0`, show a red badge (absolute positioned) with the count (show "9+" if > 9). If `unreadCount === 0`, no badge.
   - On click: toggle `isOpen` state.
   - When `isOpen`, render `<NotificationCenter onClose={() => setIsOpen(false)} />` in a Popover or absolutely positioned dropdown container. Use a relative wrapper div. The dropdown should be positioned right-aligned below the bell.
   - Close dropdown when clicking outside (use a useRef + useEffect with document click listener).

2. Create `apps/web/src/components/navigation/notification-center.tsx`:
   - "use client" component. Props: `onClose: () => void`.
   - On mount, fetch `GET /api/v1/carrier/notifications?limit=20`.
   - State: `notifications` array, `loading` boolean.
   - Container: `w-[380px] max-h-[480px]` with `overflow-y-auto`, `bg-popover border rounded-lg shadow-lg z-50`.
   - Header: sticky top, "Notifications" title (font-semibold), "Mark all read" button (text-sm text-muted-foreground hover:text-foreground). On click, PATCH `/api/v1/carrier/notifications/mark-read` with `{ all: true }`, then re-fetch list and call parent to refresh badge count.
   - Each notification row — a clickable div/button:
     - Icon based on `type`:
       - `dispatch_assigned` → Lucide `Truck` icon
       - `load_delivered` → Lucide `Package` icon
       - `pay_record_ready` → Lucide `DollarSign` icon
       - `invoice_generated` → Lucide `FileText` icon
       - `compliance_alert` → Lucide `AlertTriangle` icon
       - `needs_assignment` → Lucide `UserPlus` icon
     - Title: bold text-sm
     - Message: text-xs text-muted-foreground, `line-clamp-2` for 2-line truncation
     - Timestamp: use relative time format ("5m ago", "2h ago", "3d ago") — reuse the `relativeTime` helper pattern from `apps/web/src/components/dashboard/notifications-panel.tsx`
     - Unread indicator: `border-l-2 border-primary` on the left side when `read === false`, else `border-l-2 border-transparent`
     - On click: (a) PATCH mark-read with `{ ids: [notification.id] }`, (b) navigate using `router.push()` based on deep link map:
       - `dispatch` → `/carrier/dispatches/${entityId}`
       - `load` → `/carrier/loads/${entityId}`
       - `driver_pay_record` → `/carrier/reports/driver-pay`
       - `compliance` or `driver` → `/carrier/fleet/drivers`
       - `truck` → `/carrier/fleet/trucks`
       - `invoice` → `/carrier/loads/${entityId}`
     - (c) call `onClose()`.
   - Empty state: centered "No notifications" text with muted Bell icon when list is empty.
   - If notifications.length === 20 (hit limit), show a "View all" link at the bottom (for now just a placeholder — no dedicated notifications page yet, so just show the text without a link).

3. Modify `apps/web/src/components/navigation/owner-shell.tsx`:
   - Import `NotificationBell` from `./notification-bell`.
   - In the header, add `<NotificationBell />` between the tenant name span and the `<div className="ml-auto"><UserMenu /></div>`. Specifically, change the `ml-auto` div to include both:
     ```tsx
     <div className="ml-auto flex items-center gap-2">
       <NotificationBell />
       <UserMenu />
     </div>
     ```
  </action>
  <verify>
    Run `cd apps/web && npx tsc --noEmit` — no type errors.
    Run `cd apps/web && npx next build` or check that the dev server starts without errors.
  </verify>
  <done>Bell icon appears in the owner portal top nav header. Clicking it opens a notification dropdown with real data. Clicking a notification marks it read and navigates to the entity. Badge shows unread count and polls every 60 seconds. Mark all read works.</done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` — zero type errors
2. `cd apps/web && npx prisma validate` — schema valid
3. Database table exists: `SELECT count(*) FROM in_app_notifications;` returns 0
4. RLS policies: `SELECT polname FROM pg_policies WHERE tablename = 'in_app_notifications';` shows select/insert/update policies
5. Visual: navigate to any carrier page as owner — bell icon visible in top right of header
6. Functional: trigger a notification (e.g., assign a dispatch) — bell badge shows count, dropdown shows the notification, clicking navigates correctly
</verification>

<success_criteria>
- in_app_notifications table exists with RLS tenant isolation
- createNotification() is called from all 5 existing send* functions (dispatch_assigned, load_delivered, pay_record_ready, invoice_generated, compliance_alert)
- GET /api/v1/carrier/notifications returns tenant-scoped notifications with unreadCount
- PATCH /api/v1/carrier/notifications/mark-read supports both { ids } and { all: true }
- Bell icon with unread badge visible in owner portal header, polls every 60s
- NotificationCenter dropdown renders up to 20 notifications with type icons, relative timestamps, unread indicators
- Clicking a notification marks it read and deep-links to the correct page
- No new npm packages added
- TypeScript compiles clean
</success_criteria>

<output>
After completion, create `.planning/quick/228-build-in-app-notification-center-for-own/228-SUMMARY.md`
</output>
