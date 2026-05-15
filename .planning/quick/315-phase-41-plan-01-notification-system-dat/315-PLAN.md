---
phase: 315-phase-41-plan-01-notification-system-dat
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/package.json
  - apps/web/prisma/migrations/{TIMESTAMP}_add_notification_system/migration.sql
  - apps/web/src/lib/notifications/types.ts
  - apps/web/src/lib/notifications/build-template.ts
  - apps/web/prisma/seeds/notification-template-data/user.ts
  - apps/web/prisma/seeds/notification-template-data/load.ts
  - apps/web/prisma/seeds/notification-template-data/driver.ts
  - apps/web/prisma/seeds/notification-template-data/truck.ts
  - apps/web/prisma/seeds/notification-template-data/message.ts
  - apps/web/prisma/seeds/notification-template-data/finance.ts
  - apps/web/prisma/seeds/notification-template-data/route.ts
  - apps/web/prisma/seeds/notification-template-data/customer.ts
  - apps/web/prisma/seeds/notification-template-data/digest.ts
  - apps/web/prisma/seeds/seed-notifications.ts
autonomous: true

must_haves:
  truths:
    - "Prisma schema validates and generates with 3 new enums and 6 new models"
    - "Migration applies cleanly to Supabase and enables RLS on 3 tenant-scoped tables using the existing tenant_isolation_policy + bypass_rls_policy pattern"
    - "UserNotificationPreference rows are visible only to their owning user"
    - "AFTER INSERT trigger on Tenant auto-creates one TenantNotificationSettings row per active NotificationTemplate"
    - "NotificationEmailConfig has a partial unique index enforcing single-row constraint"
    - "buildDefaultTemplate helper produces valid Tiptap doc JSON (type:doc, content:[...])"
    - "All ~35 notification templates seed across 9 categories with non-empty blockJson and at least one availableVariable"
    - "Every {{variable}} appearing in a default subject or body is declared in that template's availableVariables array"
    - "npm run seed:notifications is idempotent — running twice yields identical database state"
    - "TypeScript strict mode passes (npx tsc --noEmit) and npm run build passes"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "3 enums (NotificationCategory, NotificationChannel, NotificationSendStatus) + 6 models + reverse relations on Tenant and User"
      contains: "model NotificationTemplate"
    - path: "apps/web/prisma/migrations/{TIMESTAMP}_add_notification_system/migration.sql"
      provides: "Tables, RLS policies, auto-population trigger, single-row partial unique index"
      contains: "seed_tenant_notification_settings"
    - path: "apps/web/src/lib/notifications/types.ts"
      provides: "TriggerKey union, NotificationPayload mapped type, DefaultRecipientRule, VariableDef, NotificationTemplateSeed"
      exports: ["TriggerKey", "NotificationPayload", "DefaultRecipientRule", "VariableDef", "NotificationTemplateSeed"]
    - path: "apps/web/src/lib/notifications/build-template.ts"
      provides: "buildDefaultTemplate helper returning valid Tiptap doc JSON"
      exports: ["buildDefaultTemplate"]
    - path: "apps/web/prisma/seeds/notification-template-data/user.ts"
      provides: "4 user templates (welcome, invited, password_reset, role_changed)"
    - path: "apps/web/prisma/seeds/notification-template-data/load.ts"
      provides: "10 load templates"
    - path: "apps/web/prisma/seeds/notification-template-data/driver.ts"
      provides: "4 driver templates"
    - path: "apps/web/prisma/seeds/notification-template-data/truck.ts"
      provides: "3 truck templates"
    - path: "apps/web/prisma/seeds/notification-template-data/message.ts"
      provides: "2 message templates"
    - path: "apps/web/prisma/seeds/notification-template-data/finance.ts"
      provides: "4 finance templates"
    - path: "apps/web/prisma/seeds/notification-template-data/route.ts"
      provides: "3 route templates"
    - path: "apps/web/prisma/seeds/notification-template-data/customer.ts"
      provides: "2 customer templates"
    - path: "apps/web/prisma/seeds/notification-template-data/digest.ts"
      provides: "3 digest templates"
    - path: "apps/web/prisma/seeds/seed-notifications.ts"
      provides: "Master seed runner: concatenates all 9 category arrays and upserts by triggerKey"
    - path: "apps/web/package.json"
      provides: "seed:notifications script entry"
      contains: "seed:notifications"
  key_links:
    - from: "AFTER INSERT trigger on Tenant"
      to: "TenantNotificationSettings rows"
      via: "seed_tenant_notification_settings() function"
      pattern: "INSERT INTO \"TenantNotificationSettings\".*FROM \"NotificationTemplate\""
    - from: "seed-notifications.ts master runner"
      to: "9 category seed files"
      via: "imports + concat + upsert"
      pattern: "import.*notification-template-data"
    - from: "Seed entries"
      to: "buildDefaultTemplate helper"
      via: "every defaultBlockJson is built via the helper"
      pattern: "buildDefaultTemplate\\("
    - from: "TenantNotificationSettings / NotificationSubscription / UserNotificationPreference"
      to: "RLS policies"
      via: "tenant_isolation_policy + bypass_rls_policy (copied verbatim from init migration)"
      pattern: "CREATE POLICY tenant_isolation_policy"
---

<objective>
Build the database foundation for the multi-tenant Notification System: 6 Prisma models, 3 enums, RLS policies, an auto-population Postgres trigger, a Tiptap-JSON helper, TypeScript types, and ~35 seeded notification templates across 9 categories.

Purpose: Plan 01 of 5 in the Tenant-Configurable Notification System. No UI, no dispatcher logic. This is the schema/seed layer that everything else in Phase 41 builds on. The /settings/notifications page becomes fully populated on day one because every new tenant gets one TenantNotificationSettings row per active global template auto-inserted by a Postgres trigger.

Output: Prisma schema + migration applied to Supabase, idempotent seed script, TypeScript types and build-template helper, 9 category seed files covering all ~35 triggers.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/specs/Notifications System Technical Documentation.md
@apps/web/prisma/schema.prisma
@apps/web/prisma/migrations/00000000000000_init/migration.sql
@apps/web/prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql
@apps/web/prisma/seeds/seed-fleet-intelligence.ts
@apps/web/package.json
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Notification System schema, generate migration, and append RLS + trigger SQL</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/{TIMESTAMP}_add_notification_system/migration.sql
  </files>
  <action>
Read `apps/web/prisma/schema.prisma` to find the Tenant model (line ~119) and User model (line ~212), and read `apps/web/prisma/migrations/00000000000000_init/migration.sql` lines 46-73 to copy the existing RLS pattern verbatim.

**Add to schema.prisma (append at end of file):**

Three enums:
- `NotificationCategory` — values: USER, LOAD, DRIVER, TRUCK, MESSAGE, FINANCE, ROUTE, CUSTOMER, DIGEST
- `NotificationChannel` — values: EMAIL, IN_APP
- `NotificationSendStatus` — values: PENDING, SENT, FAILED, SKIPPED_DISABLED, SKIPPED_USER_PREF

Six models (all UUID PKs via `dbgenerated("gen_random_uuid()")`, all with `createdAt DateTime @default(now())` and `updatedAt DateTime @updatedAt`):

1. **NotificationTemplate** (no tenantId, system-level):
   - id, triggerKey (String @unique), category (NotificationCategory), displayName, description (String @db.Text), defaultSubject, defaultBlockJson (Json), defaultHtmlCache (String? @db.Text), availableVariables (Json), defaultRecipients (Json), isActive (Boolean @default(true)), inAppEnabled (Boolean @default(true)), createdAt, updatedAt
   - Indexes: `@@index([category])`, `@@index([isActive])`

2. **TenantNotificationSettings** (tenant-scoped):
   - id, tenantId (Uuid), triggerKey, isActive (Boolean @default(true)), customSubject (String?), customBlockJson (Json?), customHtmlCache (String? @db.Text), createdAt, updatedAt
   - Relation: `tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)`
   - `@@unique([tenantId, triggerKey])`, `@@index([tenantId])`, `@@index([triggerKey])`

3. **NotificationSubscription** (tenant-scoped):
   - id, tenantId (Uuid), triggerKey, userId (Uuid), createdAt, updatedAt
   - Relations: tenant and user (onDelete: Cascade)
   - `@@unique([tenantId, triggerKey, userId])`, `@@index([tenantId])`, `@@index([userId])`

4. **UserNotificationPreference** (user-scoped):
   - id, userId (Uuid), triggerKey, emailEnabled (Boolean @default(true)), inAppEnabled (Boolean @default(true)), createdAt, updatedAt
   - Relation: user (onDelete: Cascade)
   - `@@unique([userId, triggerKey])`, `@@index([userId])`

5. **NotificationSendLog** (no RLS, system-level audit):
   - id, tenantId (Uuid), triggerKey, recipientUserId (Uuid?), recipientEmail (String?), channel (NotificationChannel), subject (String? @db.Text), status (NotificationSendStatus), errorMessage (String? @db.Text), idempotencyKey (String), relatedEntityType (String?), relatedEntityId (String?), sentAt (DateTime?), createdAt, updatedAt
   - `@@index([tenantId])`, `@@index([triggerKey])`, `@@index([idempotencyKey])`, `@@index([status])`, `@@index([createdAt])`
   - No tenant relation FK (no cascade — audit log persists even if tenant deleted; tenantId is plain Uuid)

6. **NotificationEmailConfig** (single-row global):
   - id (Uuid PK), singletonKey (String @default("singleton") — used by partial unique index in migration), fromName, fromEmail, replyTo (String?), createdAt, updatedAt

**Add reverse relations to existing models:**
- Tenant: `notificationSettings TenantNotificationSettings[]`, `notificationSubscriptions NotificationSubscription[]`
- User: `notificationSubscriptions NotificationSubscription[]`, `notificationPreferences UserNotificationPreference[]`

**Generate the migration:**
```
cd apps/web && npx prisma migrate dev --name add_notification_system --create-only
```

The --create-only flag lets you append SQL before applying. After creation, **append** the following to the generated migration.sql (do NOT remove anything Prisma generated):

```sql
-- ==============================================
-- RLS for tenant-scoped notification tables
-- ==============================================

-- TenantNotificationSettings
ALTER TABLE "TenantNotificationSettings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TenantNotificationSettings" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "TenantNotificationSettings"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "TenantNotificationSettings"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- NotificationSubscription
ALTER TABLE "NotificationSubscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationSubscription" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "NotificationSubscription"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "NotificationSubscription"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- User-scoped RLS for UserNotificationPreference
-- ==============================================
ALTER TABLE "UserNotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserNotificationPreference" FORCE ROW LEVEL SECURITY;

-- Users see/edit only their own rows (auth.uid() from Supabase JWT)
CREATE POLICY user_isolation_policy ON "UserNotificationPreference"
  FOR ALL
  USING ("userId" = auth.uid())
  WITH CHECK ("userId" = auth.uid());

CREATE POLICY bypass_rls_policy ON "UserNotificationPreference"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- ==============================================
-- Single-row constraint on NotificationEmailConfig
-- ==============================================
CREATE UNIQUE INDEX "NotificationEmailConfig_singleton_idx"
  ON "NotificationEmailConfig" ("singletonKey")
  WHERE "singletonKey" = 'singleton';

-- ==============================================
-- Auto-populate TenantNotificationSettings on new Tenant
-- ==============================================
CREATE OR REPLACE FUNCTION seed_tenant_notification_settings()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO "TenantNotificationSettings" ("id", "tenantId", "triggerKey", "isActive", "createdAt", "updatedAt")
  SELECT gen_random_uuid(), NEW."id", t."triggerKey", TRUE, NOW(), NOW()
  FROM "NotificationTemplate" t
  WHERE t."isActive" = TRUE
  ON CONFLICT ("tenantId", "triggerKey") DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_tenant_notification_settings ON "Tenant";
CREATE TRIGGER trg_seed_tenant_notification_settings
AFTER INSERT ON "Tenant"
FOR EACH ROW
EXECUTE FUNCTION seed_tenant_notification_settings();
```

**IMPORTANT verbatim pattern rules:**
- Do NOT redefine `current_tenant_id()` — it already exists from the init migration.
- Copy the `tenant_isolation_policy` and `bypass_rls_policy` text exactly as in the init migration.
- For the user-scoped policy, use `auth.uid()` (this is Supabase's built-in function for the JWT subject; check `apps/web/prisma/migrations/` for any prior usage; if no prior `auth.uid()` usage exists, fall back to comparing `"userId" = current_setting('app.current_user_id', TRUE)::UUID` and document the choice in a SQL comment).

After appending SQL, apply the migration:
```
npx prisma migrate dev
npx prisma generate
```

The migration auto-deploy hook will apply to Supabase. Then verify schema validates:
```
npx prisma validate
```
  </action>
  <verify>
Run in apps/web:
- `npx prisma validate` — exits 0
- `npx prisma generate` — exits 0 and regenerates client
- `npx prisma migrate status` — shows the new migration as applied
- Inspect generated migration.sql contains: `CREATE POLICY tenant_isolation_policy ON "TenantNotificationSettings"`, `CREATE POLICY tenant_isolation_policy ON "NotificationSubscription"`, `CREATE POLICY user_isolation_policy ON "UserNotificationPreference"`, `seed_tenant_notification_settings`, `trg_seed_tenant_notification_settings`, `NotificationEmailConfig_singleton_idx`
- Quick sanity check by querying Supabase:
  ```sql
  SELECT tablename FROM pg_tables WHERE tablename IN
    ('NotificationTemplate','TenantNotificationSettings','NotificationSubscription',
     'UserNotificationPreference','NotificationSendLog','NotificationEmailConfig');
  ```
  returns 6 rows.
- RLS check:
  ```sql
  SELECT relname, relrowsecurity FROM pg_class
  WHERE relname IN ('TenantNotificationSettings','NotificationSubscription','UserNotificationPreference');
  ```
  all three rows show `relrowsecurity = true`.
  </verify>
  <done>
- 3 enums + 6 models in schema.prisma
- Reverse relations added to Tenant and User models
- Migration file created and applied to Supabase
- RLS enabled on TenantNotificationSettings, NotificationSubscription, UserNotificationPreference (with the correct policy variant per table)
- NotificationSendLog and NotificationEmailConfig do NOT have RLS
- Partial unique index enforces single-row NotificationEmailConfig
- Postgres trigger seed_tenant_notification_settings + AFTER INSERT ON Tenant trigger created
- `npx prisma validate` and `npx prisma generate` both pass
  </done>
</task>

<task type="auto">
  <name>Task 2: Create TypeScript types, buildDefaultTemplate helper, and 9 category seed files</name>
  <files>
    apps/web/src/lib/notifications/types.ts
    apps/web/src/lib/notifications/build-template.ts
    apps/web/prisma/seeds/notification-template-data/user.ts
    apps/web/prisma/seeds/notification-template-data/load.ts
    apps/web/prisma/seeds/notification-template-data/driver.ts
    apps/web/prisma/seeds/notification-template-data/truck.ts
    apps/web/prisma/seeds/notification-template-data/message.ts
    apps/web/prisma/seeds/notification-template-data/finance.ts
    apps/web/prisma/seeds/notification-template-data/route.ts
    apps/web/prisma/seeds/notification-template-data/customer.ts
    apps/web/prisma/seeds/notification-template-data/digest.ts
  </files>
  <action>
**1. Create `apps/web/src/lib/notifications/types.ts`:**

```ts
import type { NotificationCategory } from '@prisma/client';

// Union of all 35 trigger keys (must match exactly the seed data)
export type TriggerKey =
  // User (4)
  | 'user.welcome' | 'user.invited' | 'user.password_reset' | 'user.role_changed'
  // Load (10)
  | 'load.created' | 'load.assigned' | 'load.dispatched' | 'load.picked_up'
  | 'load.in_transit' | 'load.delivered' | 'load.invoiced' | 'load.cancelled'
  | 'load.bol_uploaded' | 'load.pod_uploaded'
  // Driver (4)
  | 'driver.invited' | 'driver.hos_violation'
  | 'driver.license_expiring' | 'driver.incident_reported'
  // Truck (3)
  | 'truck.maintenance_due' | 'truck.document_expiring' | 'truck.inspection_due'
  // Message (2)
  | 'message.received' | 'message.broadcast'
  // Finance (4)
  | 'invoice.created' | 'invoice.paid' | 'invoice.overdue' | 'payroll.processed'
  // Route (3)
  | 'route.assigned' | 'route.completed' | 'route.delayed'
  // Customer (2)
  | 'customer.tracking_link_sent' | 'customer.delivered_notification'
  // Digest (3)
  | 'digest.daily_driver' | 'digest.weekly_owner' | 'digest.compliance_30day';

// Mapped type — typed payload shape per trigger.
// Define just enough fields to make payloads useful; expand in Plan 02.
export type NotificationPayload = {
  'user.welcome': { userId: string; firstName: string; email: string };
  'user.invited': { invitedEmail: string; inviterName: string; tenantName: string; inviteUrl: string };
  'user.password_reset': { userId: string; firstName: string; resetUrl: string };
  'user.role_changed': { userId: string; firstName: string; oldRole: string; newRole: string };

  'load.created': { loadId: string; loadNumber: string; originCity: string; destCity: string };
  'load.assigned': { loadId: string; loadNumber: string; driverId: string; driverName: string; originCity: string; destCity: string };
  'load.dispatched': { loadId: string; loadNumber: string; driverName: string };
  'load.picked_up': { loadId: string; loadNumber: string; driverName: string; pickupTime: string };
  'load.in_transit': { loadId: string; loadNumber: string; driverName: string };
  'load.delivered': { loadId: string; loadNumber: string; driverName: string; deliveryTime: string };
  'load.invoiced': { loadId: string; loadNumber: string; invoiceNumber: string; amount: string };
  'load.cancelled': { loadId: string; loadNumber: string; reason: string };
  'load.bol_uploaded': { loadId: string; loadNumber: string; uploadedBy: string };
  'load.pod_uploaded': { loadId: string; loadNumber: string; uploadedBy: string };

  'driver.invited': { driverEmail: string; driverFirstName: string; tenantName: string; inviteUrl: string };
  'driver.hos_violation': { driverId: string; driverName: string; violationType: string; timestamp: string };
  'driver.license_expiring': { driverId: string; driverName: string; licenseType: string; expiresAt: string; daysUntilExpiry: string };
  'driver.incident_reported': { driverId: string; driverName: string; incidentType: string; severity: string; reportUrl: string };

  'truck.maintenance_due': { truckId: string; unitNumber: string; maintenanceType: string; dueAt: string };
  'truck.document_expiring': { truckId: string; unitNumber: string; documentType: string; expiresAt: string };
  'truck.inspection_due': { truckId: string; unitNumber: string; inspectionType: string; dueAt: string };

  'message.received': { senderId: string; senderName: string; preview: string; threadUrl: string };
  'message.broadcast': { senderName: string; preview: string; recipientCount: string };

  'invoice.created': { invoiceId: string; invoiceNumber: string; customerName: string; amount: string };
  'invoice.paid': { invoiceId: string; invoiceNumber: string; customerName: string; amount: string; paidAt: string };
  'invoice.overdue': { invoiceId: string; invoiceNumber: string; customerName: string; amount: string; daysOverdue: string };
  'payroll.processed': { payrollId: string; driverName: string; payPeriod: string; amount: string };

  'route.assigned': { routeId: string; routeName: string; driverName: string; stopCount: string };
  'route.completed': { routeId: string; routeName: string; driverName: string; completedAt: string };
  'route.delayed': { routeId: string; routeName: string; driverName: string; reason: string };

  'customer.tracking_link_sent': { customerEmail: string; customerName: string; loadNumber: string; trackingUrl: string };
  'customer.delivered_notification': { customerEmail: string; customerName: string; loadNumber: string; deliveredAt: string };

  'digest.daily_driver': { driverName: string; date: string; loadCount: string; summaryHtml: string };
  'digest.weekly_owner': { ownerName: string; weekRange: string; loadCount: string; revenue: string; summaryHtml: string };
  'digest.compliance_30day': { ownerName: string; expiringDocCount: string; summaryHtml: string };
};

// Default recipient rules — resolved at dispatch time. Plan 02 implements resolution.
export type DefaultRecipientRule =
  | { type: 'role'; role: 'OWNER' | 'MANAGER' | 'DRIVER' }
  | { type: 'tenant_owners' }
  | { type: 'related'; payloadKey: keyof NotificationPayload[TriggerKey] & string };

export type VariableDef = {
  name: string;         // e.g. "driverName"
  description: string;  // shown in the variable picker
  sampleValue: string;  // shown in preview
};

// Used by every seed file
export type NotificationTemplateSeed = {
  triggerKey: TriggerKey;
  category: NotificationCategory;
  displayName: string;
  description: string;
  defaultSubject: string;
  defaultBlockJson: unknown;       // valid Tiptap doc JSON; built via buildDefaultTemplate
  availableVariables: VariableDef[];
  defaultRecipients: DefaultRecipientRule[];
  isActive: boolean;               // always true for shipped defaults
  inAppEnabled: boolean;           // always true for shipped defaults
};
```

**2. Create `apps/web/src/lib/notifications/build-template.ts`:**

```ts
/**
 * Builds a valid Tiptap document JSON for default notification templates.
 *
 * Tiptap doc shape: { type: "doc", content: [<block>...] }
 * Supported blocks here: heading (h2), paragraph with optional inline {{vars}},
 * a CTA paragraph rendered as a link, and a small footer paragraph.
 *
 * Inline `{{varName}}` strings stay as literal text — the dispatcher substitutes
 * them at send time AFTER Tiptap JSON is converted to HTML. This means a single
 * paragraph can contain multiple variables without special mention nodes.
 */
export type BuildDefaultTemplateInput = {
  headerText: string;
  paragraphTextWithVars: string;   // may contain {{varName}} segments
  ctaLabel?: string;
  ctaUrl?: string;                 // may contain {{varName}}
  footerNote?: string;
};

export function buildDefaultTemplate(input: BuildDefaultTemplateInput) {
  const content: unknown[] = [
    {
      type: 'heading',
      attrs: { level: 2 },
      content: [{ type: 'text', text: input.headerText }],
    },
    {
      type: 'paragraph',
      content: [{ type: 'text', text: input.paragraphTextWithVars }],
    },
  ];

  if (input.ctaLabel && input.ctaUrl) {
    content.push({
      type: 'paragraph',
      content: [
        {
          type: 'text',
          text: input.ctaLabel,
          marks: [{ type: 'link', attrs: { href: input.ctaUrl, target: '_blank' } }],
        },
      ],
    });
  }

  if (input.footerNote) {
    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: input.footerNote }],
    });
  }

  return { type: 'doc', content };
}
```

**3. Create 9 category seed files at `apps/web/prisma/seeds/notification-template-data/`.**

Each file follows this shape (illustrated with user.ts):

```ts
import { NotificationCategory } from '@prisma/client';
import { buildDefaultTemplate } from '../../../src/lib/notifications/build-template';
import type { NotificationTemplateSeed } from '../../../src/lib/notifications/types';

export const userTemplates: NotificationTemplateSeed[] = [
  {
    triggerKey: 'user.welcome',
    category: NotificationCategory.USER,
    displayName: 'Welcome Email',
    description: 'Sent to a user after they complete signup or accept an invite.',
    defaultSubject: 'Welcome to DriveCommand, {{firstName}}',
    defaultBlockJson: buildDefaultTemplate({
      headerText: 'Welcome to DriveCommand',
      paragraphTextWithVars: 'Hi {{firstName}}, your account is ready. Log in to start managing loads, drivers, and trucks.',
      ctaLabel: 'Open DriveCommand',
      ctaUrl: 'https://app.drivecommand.com',
      footerNote: 'Questions? Reply to this email and we will help.',
    }),
    availableVariables: [
      { name: 'firstName', description: "The user's first name", sampleValue: 'Sammy' },
      { name: 'email', description: "The user's email", sampleValue: 'sammy@example.com' },
    ],
    defaultRecipients: [{ type: 'related', payloadKey: 'userId' }],
    isActive: true,
    inAppEnabled: true,
  },
  // ...user.invited, user.password_reset, user.role_changed
];
```

Create all 9 category arrays. Coverage required:
- **user.ts**: user.welcome, user.invited, user.password_reset, user.role_changed (4)
- **load.ts**: load.created, load.assigned, load.dispatched, load.picked_up, load.in_transit, load.delivered, load.invoiced, load.cancelled, load.bol_uploaded, load.pod_uploaded (10)
- **driver.ts**: driver.invited, driver.hos_violation, driver.license_expiring, driver.incident_reported (4)
- **truck.ts**: truck.maintenance_due, truck.document_expiring, truck.inspection_due (3)
- **message.ts**: message.received, message.broadcast (2)
- **finance.ts**: invoice.created, invoice.paid, invoice.overdue, payroll.processed (4)
- **route.ts**: route.assigned, route.completed, route.delayed (3)
- **customer.ts**: customer.tracking_link_sent, customer.delivered_notification (2)
- **digest.ts**: digest.daily_driver, digest.weekly_owner, digest.compliance_30day (3)

**CRITICAL constraints for every seed entry:**
- Build `defaultBlockJson` ONLY via `buildDefaultTemplate(...)` — never hand-write.
- Every `{{var}}` token in `defaultSubject` OR inside the paragraph/CTA URL text MUST appear in `availableVariables` with a `name`, `description`, and `sampleValue`.
- Use sensible `defaultRecipients` per trigger:
  - User events: `[{ type: 'related', payloadKey: 'userId' }]`
  - Load.assigned: `[{ type: 'related', payloadKey: 'driverId' }, { type: 'role', role: 'OWNER' }]`
  - Driver events to owner: `[{ type: 'role', role: 'OWNER' }]`
  - Truck/compliance events: `[{ type: 'role', role: 'OWNER' }, { type: 'role', role: 'MANAGER' }]`
  - Customer events: `[]` (recipient is the external customer email itself; resolution handled by Plan 02 using the payload's customerEmail)
  - Digests: `[{ type: 'role', role: 'DRIVER' }]` for daily_driver, `[{ type: 'role', role: 'OWNER' }]` for weekly_owner and compliance_30day
- `isActive: true` and `inAppEnabled: true` on every entry.

Keep template copy concise and professional — trucking domain voice, no marketing fluff. Examples for headers: "Load #{{loadNumber}} assigned to you", "Maintenance due for {{unitNumber}}", "{{driverName}} reported an incident".
  </action>
  <verify>
- `npx tsc --noEmit` from `apps/web` exits 0
- Each category file exports a typed array named `{category}Templates`
- Count check: user=4, load=10, driver=4, truck=3, message=2, finance=4, route=3, customer=2, digest=3 → 35 total
- Spot-check with grep: every `{{var}}` in a subject OR paragraphTextWithVars OR ctaUrl has a matching `name:` entry in availableVariables for that seed (visually inspect each file)
- `buildDefaultTemplate` invoked for every seed entry (no raw `{ type: 'doc' ...}` literals outside the helper)
  </verify>
  <done>
- types.ts exports TriggerKey, NotificationPayload, DefaultRecipientRule, VariableDef, NotificationTemplateSeed
- build-template.ts exports buildDefaultTemplate returning valid Tiptap doc JSON
- 9 category seed files exist, each with a typed exported array
- Exactly 35 templates across all files combined
- Every {{var}} in any subject/body/ctaUrl appears in that template's availableVariables
- Every defaultBlockJson is built via buildDefaultTemplate
- TypeScript compiles cleanly
  </done>
</task>

<task type="auto">
  <name>Task 3: Write idempotent master seed runner and register npm script</name>
  <files>
    apps/web/prisma/seeds/seed-notifications.ts
    apps/web/package.json
  </files>
  <action>
**1. Create `apps/web/prisma/seeds/seed-notifications.ts`:**

```ts
/**
 * Notification Templates Seed Runner
 *
 * Imports all 9 category arrays, concatenates, and upserts each template
 * by triggerKey. Idempotent: running twice produces identical state.
 *
 * Upsert semantics:
 *   - subject, blockJson, availableVariables, defaultRecipients → updated on every run
 *   - isActive, inAppEnabled → set on INSERT only (never overwrite SysAdmin runtime toggles)
 *
 * Usage:
 *   npm run seed:notifications
 */

import { PrismaClient } from '@prisma/client';
import { userTemplates } from './notification-template-data/user';
import { loadTemplates } from './notification-template-data/load';
import { driverTemplates } from './notification-template-data/driver';
import { truckTemplates } from './notification-template-data/truck';
import { messageTemplates } from './notification-template-data/message';
import { financeTemplates } from './notification-template-data/finance';
import { routeTemplates } from './notification-template-data/route';
import { customerTemplates } from './notification-template-data/customer';
import { digestTemplates } from './notification-template-data/digest';
import type { NotificationTemplateSeed } from '../../src/lib/notifications/types';

const prisma = new PrismaClient();

const ALL_TEMPLATES: NotificationTemplateSeed[] = [
  ...userTemplates,
  ...loadTemplates,
  ...driverTemplates,
  ...truckTemplates,
  ...messageTemplates,
  ...financeTemplates,
  ...routeTemplates,
  ...customerTemplates,
  ...digestTemplates,
];

// Validation: every {{var}} declared in availableVariables
function validateSeed(seed: NotificationTemplateSeed): string[] {
  const errors: string[] = [];
  const declared = new Set(seed.availableVariables.map((v) => v.name));
  const subjectTokens = [...seed.defaultSubject.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const bodyText = JSON.stringify(seed.defaultBlockJson);
  const bodyTokens = [...bodyText.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
  const used = new Set([...subjectTokens, ...bodyTokens]);
  for (const token of used) {
    if (!declared.has(token)) {
      errors.push(`Template ${seed.triggerKey}: uses {{${token}}} but it is not in availableVariables`);
    }
  }
  return errors;
}

async function main() {
  console.log('Notification Templates Seed');
  console.log('===========================\n');
  console.log(`Total templates to seed: ${ALL_TEMPLATES.length}`);

  // Validate all seeds before writing anything
  const errors = ALL_TEMPLATES.flatMap(validateSeed);
  if (errors.length > 0) {
    console.error('Seed validation failed:');
    for (const e of errors) console.error('  - ' + e);
    process.exit(1);
  }

  // Validate uniqueness of trigger keys
  const seen = new Set<string>();
  for (const t of ALL_TEMPLATES) {
    if (seen.has(t.triggerKey)) {
      console.error(`Duplicate triggerKey: ${t.triggerKey}`);
      process.exit(1);
    }
    seen.add(t.triggerKey);
  }

  let inserted = 0;
  let updated = 0;

  for (const seed of ALL_TEMPLATES) {
    const existing = await prisma.notificationTemplate.findUnique({
      where: { triggerKey: seed.triggerKey },
    });

    if (existing) {
      await prisma.notificationTemplate.update({
        where: { triggerKey: seed.triggerKey },
        data: {
          category: seed.category,
          displayName: seed.displayName,
          description: seed.description,
          defaultSubject: seed.defaultSubject,
          defaultBlockJson: seed.defaultBlockJson as object,
          availableVariables: seed.availableVariables as object,
          defaultRecipients: seed.defaultRecipients as object,
          // intentionally NOT updating isActive or inAppEnabled — SysAdmin owns those at runtime
        },
      });
      updated++;
    } else {
      await prisma.notificationTemplate.create({
        data: {
          triggerKey: seed.triggerKey,
          category: seed.category,
          displayName: seed.displayName,
          description: seed.description,
          defaultSubject: seed.defaultSubject,
          defaultBlockJson: seed.defaultBlockJson as object,
          availableVariables: seed.availableVariables as object,
          defaultRecipients: seed.defaultRecipients as object,
          isActive: seed.isActive,
          inAppEnabled: seed.inAppEnabled,
        },
      });
      inserted++;
    }
  }

  console.log(`\nInserted: ${inserted}`);
  console.log(`Updated:  ${updated}`);
  console.log(`Total:    ${inserted + updated}`);

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
```

**2. Register the npm script in `apps/web/package.json`:**

Find the `scripts` block and add (alongside existing `seed:fleet`):
```json
"seed:notifications": "tsx prisma/seeds/seed-notifications.ts"
```

**Idempotency proof:** running twice → first run inserts 35, updates 0. Second run inserts 0, updates 35 (with identical values). Database row count stays at 35. isActive/inAppEnabled values are untouched on update.
  </action>
  <verify>
From `apps/web`:
- `npx tsc --noEmit` exits 0
- `npm run seed:notifications` first run: logs `Inserted: 35  Updated: 0`
- `npm run seed:notifications` second run: logs `Inserted: 0  Updated: 35`
- Database check:
  ```sql
  SELECT COUNT(*) FROM "NotificationTemplate";  -- 35
  SELECT category, COUNT(*) FROM "NotificationTemplate" GROUP BY category;
  -- USER=4, LOAD=10, DRIVER=4, TRUCK=3, MESSAGE=2, FINANCE=4, ROUTE=3, CUSTOMER=2, DIGEST=3
  ```
- Manually toggle one template's `isActive` to false via SQL, re-run seed, confirm it stays false (proves we don't overwrite runtime toggles)
- `npm run build` (in apps/web) passes
- Auto-population trigger smoke test:
  ```sql
  -- in a test environment only; using bypass_rls
  SELECT set_config('app.bypass_rls', 'on', TRUE);
  INSERT INTO "Tenant" ("id", "name", "createdAt", "updatedAt") VALUES (gen_random_uuid(), 'TriggerTest', NOW(), NOW()) RETURNING id;
  -- then:
  SELECT COUNT(*) FROM "TenantNotificationSettings" WHERE "tenantId" = '<the returned id>';  -- expect 35
  -- cleanup:
  DELETE FROM "Tenant" WHERE "name" = 'TriggerTest';
  ```
  </verify>
  <done>
- seed-notifications.ts validates every seed before writing
- Trigger keys are unique across the combined array (enforced)
- Upsert updates subject/blockJson/availableVariables/defaultRecipients on every run
- Upsert sets isActive and inAppEnabled on INSERT only
- npm script `seed:notifications` registered
- Re-running the script is a no-op on data (idempotent)
- TypeScript build passes; database has exactly 35 NotificationTemplate rows after seeding
- Auto-population trigger verified end-to-end: inserting a new Tenant creates 35 TenantNotificationSettings rows
  </done>
</task>

</tasks>

<verification>
Run from the repo root or `apps/web` as appropriate:

1. `cd apps/web && npx prisma validate` — exits 0
2. `cd apps/web && npx prisma generate` — exits 0
3. `cd apps/web && npx prisma migrate status` — new migration is applied
4. `cd apps/web && npm run seed:notifications` — exits 0, idempotent on second run
5. `cd apps/web && npx tsc --noEmit` — exits 0
6. `cd apps/web && npm run build` — exits 0
7. SQL: `SELECT COUNT(*) FROM "NotificationTemplate";` → 35
8. SQL: `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('TenantNotificationSettings','NotificationSubscription','UserNotificationPreference');` → all 3 true
9. SQL: `SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('NotificationTemplate','NotificationSendLog','NotificationEmailConfig');` → all 3 false (no RLS on these)
10. SQL trigger smoke test (create a throwaway Tenant under bypass_rls, confirm 35 rows in TenantNotificationSettings, delete)
11. Spot-check 3 random seed entries: every `{{var}}` in subject and body appears in availableVariables
</verification>

<success_criteria>
- Prisma schema has 3 new enums, 6 new models, and reverse relations on Tenant + User
- Migration applied to Supabase with RLS on the correct 3 tables using the verbatim init-migration pattern
- UserNotificationPreference has a user-scoped policy (auth.uid() or documented fallback) + bypass_rls policy
- NotificationEmailConfig has a partial unique index enforcing single-row
- AFTER INSERT trigger on Tenant auto-populates TenantNotificationSettings for every active template
- TypeScript types file exports TriggerKey, NotificationPayload, DefaultRecipientRule, VariableDef, NotificationTemplateSeed
- buildDefaultTemplate helper exists and is used for every seed's defaultBlockJson
- 9 category seed files exist; combined count is exactly 35
- Master seed runner is idempotent; second run produces identical state and never overwrites isActive/inAppEnabled
- npm script `seed:notifications` is registered
- Existing NotificationLog model, src/emails/, and src/lib/email/send* functions are untouched
- pg_net and pg_cron extensions are NOT added
- No new ORM, query builder, migration tool, or validation library introduced
- `npx tsc --noEmit` and `npm run build` both pass
</success_criteria>

<output>
After completion, create `.planning/quick/315-phase-41-plan-01-notification-system-dat/315-SUMMARY.md` capturing:
- Files added/modified (full list with brief description)
- Migration file name + path
- Confirmation that 35 templates seeded across 9 categories (counts per category)
- Confirmation of idempotency (second-run output)
- Confirmation of trigger smoke test result
- Any deviations from the plan and why
- Open questions or follow-ups for Plan 02 (dispatcher library)
</output>
