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

The schema has 37 models covering all platform features.

| Model | Purpose | Key Fields |
|---|---|---|
| `Tenant` | Fleet operator account | `id`, `name`, `slug`, `isActive`, `profitMarginThreshold` |
| `User` | Owner, Manager, or Driver | `id`, `tenantId`, `email`, `passwordHash`, `role`, `isSystemAdmin`, `isActive` |
| `Truck` | Vehicle in the fleet | `id`, `tenantId`, `make`, `model`, `year`, `vin`, `licensePlate`, `odometer`, `documentMetadata` (JSONB), `createdById?` |
| `DriverInvitation` | Email invite for new drivers or owners | `id`, `tenantId`, `email`, `role` (defaults DRIVER), `status` (PENDING/ACCEPTED/EXPIRED/CANCELLED), `expiresAt` |
| `Route` | Assigned trip with driver + truck | `id`, `tenantId`, `driverId`, `truckId`, `origin`, `destination`, `status` (PLANNED/IN_PROGRESS/COMPLETED), `version` (optimistic locking), `createdById?` |
| `RouteStop` | Multi-stop waypoints on a route | `id`, `routeId`, `tenantId`, `position` (1-based), `type` (PICKUP/DELIVERY), `status` (PENDING/ARRIVED/DEPARTED), `geofenceHit` |
| `RouteDriver` | Co-driver assignment on a route | `id`, `routeId`, `driverId`, `role` (default "co-driver") |
| `DriverRouteJoin` | Driver-route payment assignment | `id`, `tenantId`, `routeId`, `driverId`, `isMainDriver`, `paymentMethod`, `fixedAmount?`, `hourlyRate?`, `perMileRate?` |
| `Document` | Uploaded file metadata | `id`, `tenantId`, `truckId?`, `routeId?`, `driverId?`, `s3Key`, `documentType?`, `expiryDate?` |
| `MaintenanceEvent` | Completed service record | `id`, `tenantId`, `truckId`, `serviceType`, `serviceDate`, `odometerAtService`, `cost` |
| `ScheduledService` | Upcoming service by interval | `id`, `tenantId`, `truckId`, `intervalDays?`, `intervalMiles?`, `isCompleted` |
| `GPSLocation` | Truck GPS ping | `id`, `tenantId`, `truckId`, `latitude`, `longitude`, `speed`, `timestamp` |
| `SafetyEvent` | Harsh driving event from ELD/telematics | `id`, `tenantId`, `truckId`, `driverId?`, `eventType`, `severity`, `gForce?`, `speed?`, `timestamp` |
| `DriverHOSEntry` | Driver hours-of-service log entry | `id`, `tenantId`, `driverId`, `status` (OFF_DUTY/SLEEPER_BERTH/DRIVING/ON_DUTY), `startTime`, `endTime?`, `notes?` |
| `DriverIncident` | Driver-reported incident | `id`, `tenantId`, `driverId`, `category`, `severity`, `description`, `latitude?`, `longitude?`, `photoS3Key?`, `reportedAt` |
| `FleetMessage` | In-app messaging between drivers and owners | `id`, `tenantId`, `routeId?`, `loadId?`, `senderId`, `senderRole`, `body`, `recipientId?`, `isBroadcast` |
| `FuelRecord` | Fuel fill-up record | `id`, `tenantId`, `truckId`, `fuelType`, `quantity`, `totalCost?`, `odometer`, `timestamp` |
| `NotificationLog` | Email send audit log | `id`, `tenantId`, `idempotencyKey` (unique), `notificationType`, `status` (PENDING/SENT/FAILED) |
| `PushToken` | Mobile push notification token | `id`, `userId`, `token`, `platform` (ios/android) |
| `Tag` | Color label for trucks/drivers | `id`, `tenantId`, `name`, `color` |
| `TagAssignment` | Tag applied to a Truck or User | `id`, `tenantId`, `tagId`, `truckId?`, `userId?` |
| `ExpenseCategory` | Named expense bucket | `id`, `tenantId`, `name`, `isSystemDefault` |
| `RouteExpense` | Expense on a route (soft delete) | `id`, `tenantId`, `routeId`, `categoryId`, `amount`, `deletedAt?` |
| `ExpenseTemplate` | Reusable expense preset | `id`, `tenantId`, `name` |
| `ExpenseTemplateItem` | Line item in an expense template | `id`, `templateId`, `categoryId`, `tenantId`, `amount`, `description` |
| `RoutePayment` | Revenue received for a route (soft delete) | `id`, `tenantId`, `routeId`, `amount`, `status` (PENDING/PAID), `paidAt?` |
| `Customer` | CRM contact / shipper | `id`, `tenantId`, `companyName`, `priority`, `status`, `totalRevenue`, `emailNotifications` |
| `CustomerInteraction` | CRM activity log | `id`, `tenantId`, `customerId`, `type`, `subject`, `isAutomated` |
| `Invoice` | Invoice to a customer | `id`, `tenantId`, `customerId?`, `routeId?`, `loadId?`, `invoiceNumber`, `amount`, `status` (DRAFT/SENT/PAID/OVERDUE/CANCELLED), `createdById?` |
| `InvoiceItem` | Line item on an invoice | `id`, `invoiceId`, `tenantId`, `description`, `quantity`, `unitPrice`, `amount` |
| `SysAdminInvoice` | Invoice from DriveCommand to a tenant | `id`, `tenantId`, `invoiceNumber` (unique), `status` (DRAFT/SENT/PAID/OVERDUE/CANCELLED), `issueDate`, `dueDate`, `subtotal`, `total`, `isRecurring` |
| `SysAdminInvoiceItem` | Line item on a SysAdmin invoice | `id`, `invoiceId`, `chargeType?`, `description`, `quantity`, `unitPrice`, `amount` |
| `PayrollRecord` | Driver pay period record | `id`, `tenantId`, `driverId`, `periodStart`, `periodEnd`, `totalPay`, `status` (DRAFT/APPROVED/PAID), `createdById?` |
| `Load` | Dispatched load/shipment | `id`, `tenantId`, `loadNumber`, `customerId`, `routeId?`, `status` (PENDING→DISPATCHED→PICKED_UP→IN_TRANSIT→DELIVERED→INVOICED), `trackingToken?`, `createdById?` |
| `TenantIntegration` | Third-party integration config | `id`, `tenantId`, `provider`, `category`, `enabled`, `configJson` (JSONB) |
| `SupportTicket` | Help ticket from tenant owner or driver | `id`, `ticketNumber` (unique, TKT-NNNN), `tenantId`, `category`, `priority`, `status` |
| `TicketMessage` | Message thread on a support ticket | `id`, `ticketId`, `senderType` (OWNER/ADMIN), `body` |

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
