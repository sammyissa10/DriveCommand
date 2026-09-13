# Database

DriveCommand uses PostgreSQL hosted on Supabase. The schema is managed with Prisma. All tenant-scoped tables use Row Level Security (RLS) enforced at the Supabase level.

**Key files:**

- `prisma/schema.prisma` — single schema file, all models and enums
- `src/lib/db/prisma.ts` — singleton Prisma client and connection pool
- `src/generated/prisma/` — generated Prisma client output
- `scripts/migrate.mjs` — raw SQL migration runner

---

## Prisma Setup

The Prisma client is configured in `src/lib/db/prisma.ts` using the `@prisma/adapter-pg` driver adapter with a `pg.Pool` singleton.

**Connection pool:**
- `max: 5` connections per Vercel worker instance
- Stored on `globalThis` so the pool persists across Vercel's serverless module-level warm reuse between invocations
- Without `globalThis`, each cold start would open a new TCP connection to Supabase

**`DATABASE_URL` must use Supabase's Session Mode pooler on port 6543.**
Do not use port 5432 (Transaction Mode). Transaction mode drops connections after each transaction, which defeats pooling and causes `set_config('app.tenant_id', ...)` session variables to be lost.

```
postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres
```

**Transaction options (`TX_OPTIONS`):**
```typescript
export const TX_OPTIONS = { maxWait: 15000, timeout: 30000 }
```
These are raised from Prisma's defaults (maxWait: 2000, timeout: 5000) to handle burst concurrency under parallel page renders.

**Client generation output:**
The Prisma client is generated to `src/generated/prisma/` (not the default `node_modules`). This is required for Vercel deployment. After any schema change, run:
```bash
npx prisma generate
```

---

## Schema Overview — Models

The schema has approximately 100+ models organised into logical groups below.

### Core / Legacy Models

| Model | Purpose |
|---|---|
| `Tenant` | Fleet operator account |
| `User` | Owner, Manager, or Driver |
| `Truck` | Vehicle in the fleet (legacy — carrier operations use `CarrierTruck`) |
| `DriverInvitation` | Email invite for new drivers or owners |
| `Route` | Legacy route with driver + truck (carrier operations use `Trip`) |
| `RouteStop` | Multi-stop waypoints on a legacy route |
| `RouteDriver` | Co-driver assignment on a legacy route |
| `DriverRouteJoin` | Driver-route payment assignment |
| `Document` | Uploaded file metadata (legacy — carrier operations use `CarrierDocument`) |
| `MaintenanceEvent` | Completed service record (legacy truck) |
| `ScheduledService` | Upcoming service by interval (legacy truck) |
| `GPSLocation` | Truck GPS ping (legacy) |
| `GpsReport` | Mobile app GPS ping from `expo-task-manager` background task |
| `SafetyEvent` | Harsh driving event from ELD/telematics |
| `DriverHOSEntry` | Driver hours-of-service log entry |
| `DriverIncident` | Driver-reported incident with optional photo |
| `FleetMessage` | In-app messaging between drivers and owners |
| `FuelRecord` | Fuel fill-up record |
| `NotificationLog` | Email send audit log (idempotency key, PENDING/SENT/FAILED) |
| `PushToken` | Expo push notification token per user |
| `Tag` | Color label for trucks/drivers |
| `TagAssignment` | Tag applied to a Truck or User |
| `ExpenseCategory` | Named expense bucket |
| `RouteExpense` | Expense on a legacy route (soft delete) |
| `ExpenseTemplate` | Reusable expense preset |
| `ExpenseTemplateItem` | Line item in an expense template |
| `RoutePayment` | Revenue received for a legacy route (soft delete) |
| `Customer` | CRM contact / shipper |
| `CustomerInteraction` | CRM activity log |
| `Invoice` | Invoice to a customer |
| `InvoiceItem` | Line item on an invoice |
| `SysAdminInvoice` | Invoice from DriveCommand to a tenant |
| `SysAdminInvoiceItem` | Line item on a SysAdmin invoice |
| `PayrollRecord` | Driver pay period record |
| `Load` | Dispatched load/shipment (legacy) |
| `TenantIntegration` | Third-party integration config (JSONB) |
| `SupportTicket` | Help ticket from tenant owner or driver |
| `TicketMessage` | Message thread on a support ticket |
| `AuditLog` | Immutable record of sensitive mutations |
| `GridView` | Saved column configuration for data tables |
| `GridPreference` | Per-user grid column preferences |
| `DocFeedback` | User feedback on in-app help articles |

### Carrier Operations Models

The core operational data model for the Document Import and Trip Dispatch features.

| Model | Purpose |
|---|---|
| `CarrierClient` | Customer / shipper in the carrier's book of business |
| `CarrierClientContact` | Contact person at a carrier client |
| `CarrierContract` | Rate agreement between carrier and client |
| `CarrierFacility` | Physical location (warehouse, dealership, yard, etc.) |
| `CarrierDriver` | Driver profile linked to a `User` |
| `CarrierTruck` | Carrier-model truck with expiry dates (`licenseExpiry`, `registrationExpiry`, `insuranceExpiry`) |
| `CarrierTruckDefect` | Defect recorded during a pre-trip inspection (partial unique index on `step_instance_id`) |
| `Trip` (table: `dispatches`) | Active or completed dispatch/trip linking driver, truck, and a route template |
| `CarrierLoad` | Individual load on a trip |
| `CarrierStop` | Stop on a trip with pickup/delivery/fuel/layover type |
| `CarrierDocument` | Document attached to a carrier entity (driver, truck, load) |
| `CarrierDocumentType` | Tenant-configurable document type catalogue |
| `CarrierExpense` | Expense tied to a dispatch, load, or stop |
| `RouteTemplate` | Saved route template matching a regular lane |
| `RouteTemplateStop` | Stop definition within a route template |
| `RouteMatrixCache` | L2 distance-matrix cache keyed by sorted facility-id set |
| `CarrierCatalogMeta` | Tenant-configurable display labels for enum values |

### Document Import Models

| Model | Purpose |
|---|---|
| `DocumentImport` | A single document import job (rate confirmation, invoice, load tender) with 8-state lifecycle |
| `DocumentImportPage` | Per-page extraction cache with SHA-256 dedup |
| `FacilityExternalReference` | Learned external reference (`tenant × client × source_code → facility`) for silent T1 resolution |
| `DocumentProfile` | Per-tenant, per-client extraction hints and commit defaults |

### Workflow Engine Models

| Model | Purpose |
|---|---|
| `StepTemplate` | Reusable step definition (INSPECTION_ITEM, DOCUMENT_UPLOAD, SIGNATURE, etc.) |
| `Playbook` | Named checklist/workflow (VEHICLE_INSPECTION, DRIVER_ONBOARDING, etc.) |
| `PlaybookStep` | Ordered step within a playbook with `isDispatchBlocker` flag |
| `PlaybookTrigger` | Auto-start rule: fires a playbook on `TriggerEvent` (ON_DRIVER_CREATE, ON_DISPATCH_CREATE, etc.) |
| `PlaybookInstance` | Live run of a playbook against a specific entity (driver, dispatch) |
| `StepInstance` | Single step answer within a playbook instance |
| `PlaybookNotification` | Notification sent during a playbook run |
| `DispatchOverrideAudit` | Immutable record of an owner overriding a blocked dispatch |

### Notification System Models

| Model | Purpose |
|---|---|
| `NotificationTemplate` | Tiptap-editable email/push template per trigger type |
| `NotificationEmailConfig` | Per-tenant SMTP override |
| `NotificationSendLog` | Per-send delivery record with dedup key |
| `NotificationSubscription` | User opt-in for subscriber-only triggers |
| `UserNotificationPreference` | Per-user, per-trigger channel preferences (email, push, in-app) |
| `TenantNotificationSettings` | Tenant-level notification defaults |
| `InAppNotification` | In-app notification record (bell icon) |

### Driver Pay Models

| Model | Purpose |
|---|---|
| `DriverCompensationTemplate` | Pay rate template per driver (CPM, percentage, hourly, flat) |
| `LoadDriverAssignment` | Driver assignment to a load with pay details and status (DRAFT→APPROVED→PAID) |
| `LoadPayComponent` | Individual pay line item on an assignment (linehaul, FSC, detention, bonus, etc.) |
| `DriverBonus` | One-time or installment bonus record |
| `DriverDeduction` | Recurring deduction (loan, equipment, etc.) |
| `DriverSettlement` | Pay period settlement grouping assignments and bonuses |
| `PayComponentAttachment` | File attachment on a pay component |
| `DriverDispute` | Driver-raised dispute on a pay component |
| `DriverPayAuditLog` | Immutable audit trail for pay mutations |
| `DriverPayRecord` | Simplified pay summary per dispatch/load |

### SaaS Platform Models (Phase 47)

| Model | Purpose |
|---|---|
| `Plan` | Subscription tier definition (limits, pricing, Stripe product) |
| `Promo` | Promotional code (bonus trial days, discount %) |
| `Subscription` | Tenant subscription (TRIALING/ACTIVE/PAST_DUE/CANCELLED) |
| `ActivationProgress` | Tracks onboarding milestone events for a tenant |
| `AutomationRule` | System or tenant-scoped event-driven automation rule |
| `AutomationRun` | Execution record for an automation rule |
| `AppEvent` | General analytics event log |
| `TenantMetricsDaily` | Daily roll-up metrics per tenant (DAU, loads, storage) |
| `TenantHealthScore` | Computed engagement health score per tenant |

---

## Row Level Security (RLS)

All tenant-scoped tables have RLS enabled in Supabase. The enforcement pattern:

1. A Supabase RLS policy is applied to the table:
   ```sql
   CREATE POLICY tenant_isolation_policy ON "Truck"
   USING (
     current_setting('app.bypass_rls', TRUE) = 'on'
     OR "tenantId"::text = current_setting('app.tenant_id', TRUE)
   );
   ```

2. At the start of each API route or server action, the tenant ID is set:
   ```typescript
   await prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`;
   ```
   The `TRUE` parameter scopes this setting to the current transaction.

3. All subsequent Prisma queries on the connection run through the RLS filter automatically. An explicit `WHERE tenantId = ?` is still included in most queries as defense-in-depth, but RLS ensures that even if a query omits the filter, no cross-tenant data leaks.

**Tables without RLS:**
- `SupportTicket` and `TicketMessage` — sysadmin needs cross-tenant visibility; tenant-scoped queries use explicit `WHERE tenantId = ?` in server actions
- `PushToken` — keyed by `userId` (not `tenantId`); no RLS policy; access controlled at the application layer by matching the authenticated user's ID

---

## bypass_rls Pattern

Some operations must access data without a tenant context filter:

- **Login** — no session exists yet; the `User` record must be fetched by email across all tenants to validate credentials
- **Sysadmin operations** — span multiple tenants
- **`getCurrentUser()`** — the user may need to fetch their own record before tenant context is set

```typescript
// In a Prisma transaction, set bypass_rls=on before the query:
const [, user] = await prisma.$transaction([
  prisma.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`,
  prisma.user.findUnique({ where: { id: session.userId } }),
]);
```

The `TRUE` parameter on `set_config` scopes the bypass flag to the current transaction. It does not leak across requests or connections.

For `$queryRaw` calls (outside a Prisma `$transaction`), RLS is bypassed entirely because `$queryRaw` runs as the database superuser in Supabase. This is used in `isSystemAdmin()`:

```typescript
const rows = await prisma.$queryRaw<{ isSystemAdmin: boolean }[]>`
  SELECT "isSystemAdmin" FROM "User" WHERE id = ${session.userId}::uuid LIMIT 1
`;
```

---

## Migrations

Prisma migrations are NOT used in production. Instead, raw SQL migration files from a `migrations/` directory are applied by `scripts/migrate.mjs` as part of the Vercel build command:

```
node scripts/migrate.mjs && prisma generate && next build
```

The migration script runs each SQL file in alphabetical order inside an atomic transaction. If any migration fails, the build fails with a non-zero exit code and Vercel aborts the deployment.

**For local development**, apply schema changes directly with:
```bash
npx prisma db push
```

This pushes the `schema.prisma` state directly to the database without creating migration files. Do not use `prisma migrate dev` — the project uses the manual migration runner pattern.

---

## Common Query Patterns

**Standard tenant-scoped query in a server action:**

```typescript
const session = await getSession();
const tenantId = session!.tenantId;

const [, trucks] = await prisma.$transaction([
  prisma.$executeRaw`SELECT set_config('app.tenant_id', ${tenantId}, TRUE)`,
  prisma.truck.findMany({ where: { tenantId } }),
]);
```

The `where: { tenantId }` clause is defense-in-depth — RLS already filters by `app.tenant_id`, but the explicit clause makes the intent clear and protects against future policy misconfiguration.

**All money amounts** use `Decimal` (Prisma's `@db.Decimal(10, 2)`) and are calculated using `Prisma.Decimal` or `Decimal.js` in application code. Never convert to JavaScript `number` for financial calculations.

**Soft delete** is used for financial records (`RouteExpense.deletedAt`, `RoutePayment.deletedAt`). Queries filter with `where: { deletedAt: null }`. Hard delete is used for non-financial configuration records (expense templates, tags, loads, invoices with DRAFT status).
