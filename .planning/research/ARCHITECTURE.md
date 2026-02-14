# Architecture Research

**Domain:** Multi-Tenant Fleet Management SaaS
**Researched:** 2026-02-14
**Confidence:** HIGH

## Standard Architecture

### System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                      Presentation Layer                             │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────────┐           ┌────────────────┐                    │
│  │  Owner/Manager │           │ Driver Portal  │                    │
│  │     Portal     │           │  (Read-Only)   │                    │
│  └───────┬────────┘           └───────┬────────┘                    │
│          │                            │                             │
├──────────┴────────────────────────────┴─────────────────────────────┤
│                      API Gateway Layer                              │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Auth Middleware → Tenant Context → RBAC Enforcement         │   │
│  └──────────────────────────────────────────────────────────────┘   │
├─────────────────────────────────────────────────────────────────────┤
│                      Application Layer                              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Vehicle  │  │  Driver  │  │Maintenance│  │  User    │            │
│  │ Service  │  │ Service  │  │  Service  │  │  Mgmt    │            │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘            │
│       │             │             │             │                   │
│  ┌────┴─────────────┴─────────────┴─────────────┴─────┐            │
│  │          Tenant Provisioning Service                │            │
│  └─────────────────────────────────────────────────────┘            │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                      Integration Layer                              │
├─────────────────────────────────────────────────────────────────────┤
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐    │
│  │Email/SMS   │  │ File       │  │ Background │  │   Event    │    │
│  │Notification│  │ Storage    │  │   Jobs     │  │   Bus      │    │
│  │  Service   │  │  (S3)      │  │  (Queue)   │  │            │    │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘    │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                      Data Layer                                     │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │            Relational Database (PostgreSQL/MySQL)            │    │
│  │  ┌───────────────┐  ┌───────────────┐  ┌───────────────┐   │    │
│  │  │  Tenant A     │  │  Tenant B     │  │  Tenant C     │   │    │
│  │  │   Schema      │  │   Schema      │  │   Schema      │   │    │
│  │  └───────────────┘  └───────────────┘  └───────────────┘   │    │
│  └─────────────────────────────────────────────────────────────┘    │
│                                                                      │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │              Object Storage (S3/Blob Storage)                │    │
│  │  tenant-a/  tenant-b/  tenant-c/  (prefix-based isolation)   │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Responsibility | Typical Implementation |
|-----------|----------------|------------------------|
| **API Gateway** | Authentication, tenant context injection, rate limiting, request routing | Express.js middleware, Next.js API routes, or dedicated API gateway (Kong, AWS API Gateway) |
| **Auth Middleware** | Validates JWT tokens, extracts tenant ID, enforces tenant-scoped sessions | Passport.js, Auth0, Clerk, Supabase Auth |
| **Tenant Context** | Injects tenant ID into all requests, ensures queries are scoped | Request-scoped context/async local storage |
| **RBAC Enforcement** | Role checks (owner/manager vs driver), permission validation | Middleware or policy engine (Casbin, CASL, Permit.io) |
| **Vehicle Service** | CRUD for vehicles, assignment to drivers, status tracking | Business logic layer with repository pattern |
| **Driver Service** | Driver management, vehicle assignment, access control | Business logic layer with repository pattern |
| **Maintenance Service** | Service schedules, reminders, history tracking | Business logic + scheduler integration |
| **User Management** | Account creation, password reset, role assignment | Identity provider or custom auth service |
| **Tenant Provisioning** | Self-service signup, schema creation, admin onboarding | Automated pipeline (IaC, migration scripts) |
| **Notification Service** | Email/SMS reminders for maintenance, scheduled jobs | SendGrid/SES/Twilio + job queue (Bull/BullMQ) |
| **File Storage** | Vehicle document uploads (insurance, registration) | S3/CloudFlare R2 with presigned URLs |
| **Background Jobs** | Scheduled maintenance reminders, data exports | Redis Queue, BullMQ, or cloud-native schedulers |
| **Event Bus** | Decoupled inter-service communication | Optional for larger systems (RabbitMQ, Kafka, EventBridge) |

## Recommended Project Structure

```
src/
├── app/                    # Next.js app directory (if using App Router)
│   ├── (auth)/            # Auth-related routes (sign-in, sign-up)
│   ├── (dashboard)/       # Protected dashboard routes
│   │   ├── owner/         # Owner/Manager portal
│   │   └── driver/        # Driver portal
│   └── api/               # API routes
│       ├── auth/          # Authentication endpoints
│       ├── vehicles/      # Vehicle CRUD
│       ├── drivers/       # Driver CRUD
│       ├── maintenance/   # Maintenance records
│       └── onboarding/    # Tenant provisioning
├── lib/                   # Core business logic
│   ├── auth/              # Auth utilities, RBAC helpers
│   ├── services/          # Business services (vehicle, driver, etc.)
│   ├── repositories/      # Data access layer
│   ├── tenant/            # Tenant context management
│   ├── notifications/     # Email/SMS service
│   └── storage/           # File upload utilities
├── db/                    # Database layer
│   ├── schema.ts          # Drizzle/Prisma schema
│   ├── migrations/        # Schema migrations
│   └── seed.ts            # Seed data for development
├── middleware/            # Next.js middleware
│   └── tenant.ts          # Tenant context injection
├── components/            # React components
│   ├── ui/                # Reusable UI components
│   ├── owner/             # Owner-specific components
│   └── driver/            # Driver-specific components
├── types/                 # TypeScript type definitions
├── config/                # Configuration files
└── jobs/                  # Background job definitions
    └── maintenance-reminders.ts
```

### Structure Rationale

- **app/ (Next.js App Router):** Modern Next.js pattern with colocation of routes, layouts, and server components. Auth and dashboard groups allow shared layouts.
- **lib/ for business logic:** Framework-agnostic core logic. Makes testing easier and allows future framework migrations.
- **services/ vs repositories/:** Services contain business logic, repositories handle data access. Clear separation of concerns.
- **tenant/ directory:** Centralized tenant context management. Every service imports from here to ensure tenant-scoped queries.
- **middleware/tenant.ts:** Extracts tenant ID from JWT or session, makes it available to all downstream requests.

## Architectural Patterns

### Pattern 1: Shared Database with Schema-Per-Tenant

**What:** All tenants share the same database instance, but each tenant gets a dedicated schema (PostgreSQL) or namespace. Each data access query is automatically scoped to the tenant's schema.

**When to use:**
- 100-10,000 tenants
- Strong data isolation required (regulatory, security)
- Balance between resource efficiency and isolation
- Each tenant has customizable schema extensions

**Trade-offs:**
- **Pros:** Strong isolation, efficient resource use, easier backups than separate DBs, allows per-tenant migrations
- **Cons:** More complex than shared schema, schema sprawl at massive scale, requires connection pooling awareness

**Example:**
```typescript
// lib/tenant/context.ts
import { AsyncLocalStorage } from 'async_hooks';

const tenantContext = new AsyncLocalStorage<{ tenantId: string }>();

export function setTenantContext(tenantId: string) {
  return tenantContext.run({ tenantId }, () => {
    // All code in this context has access to tenantId
  });
}

export function getTenantId(): string {
  const context = tenantContext.getStore();
  if (!context) throw new Error('No tenant context');
  return context.tenantId;
}

// lib/repositories/base.ts
export class BaseRepository {
  protected async query<T>(sql: string, params: any[]): Promise<T> {
    const tenantId = getTenantId();
    // Set schema for this connection
    await this.db.raw(`SET search_path TO tenant_${tenantId}`);
    return this.db.query(sql, params);
  }
}
```

### Pattern 2: Row-Level Security with Tenant ID Column

**What:** All tenants share the same database and schema. Every table has a `tenant_id` column. Application-level or database-level RLS ensures queries are automatically filtered.

**When to use:**
- 1-1,000 tenants (simpler systems)
- Minimal customization needs
- Rapid prototyping or MVP
- Cost-sensitive early stages

**Trade-offs:**
- **Pros:** Simplest to implement, easy migrations, shared indexes, fewer database objects
- **Cons:** Risk of tenant data leakage if bugs in filtering, less isolation, harder to give tenant-specific backups

**Example:**
```typescript
// lib/repositories/vehicle.ts
export class VehicleRepository {
  async findAll(): Promise<Vehicle[]> {
    const tenantId = getTenantId();
    // Every query MUST include tenant_id filter
    return db.query.vehicles.findMany({
      where: eq(vehicles.tenantId, tenantId)
    });
  }

  async findById(id: string): Promise<Vehicle | null> {
    const tenantId = getTenantId();
    return db.query.vehicles.findFirst({
      where: and(
        eq(vehicles.id, id),
        eq(vehicles.tenantId, tenantId) // Critical: prevents cross-tenant access
      )
    });
  }
}

// Or use Postgres RLS (database-enforced)
// CREATE POLICY tenant_isolation ON vehicles
// USING (tenant_id = current_setting('app.tenant_id')::uuid);
```

### Pattern 3: Prefix-Based File Storage Isolation

**What:** All tenant files stored in a shared S3 bucket with tenant ID as prefix (`tenant-{id}/vehicles/{vehicleId}/insurance.pdf`). IAM policies or application logic enforces access control.

**When to use:**
- Any multi-tenant SaaS with file uploads
- Centralized storage management
- Cost optimization (avoid bucket limits)

**Trade-offs:**
- **Pros:** Scales to thousands of tenants, centralized management, lower cost than bucket-per-tenant
- **Cons:** Requires strict application-level filtering, risk of misconfigured access policies

**Example:**
```typescript
// lib/storage/upload.ts
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export async function generateUploadUrl(
  vehicleId: string,
  filename: string
): Promise<string> {
  const tenantId = getTenantId();
  const key = `tenant-${tenantId}/vehicles/${vehicleId}/${filename}`;

  const command = new PutObjectCommand({
    Bucket: process.env.S3_BUCKET,
    Key: key,
    // Enforce tenant context in metadata
    Metadata: { tenantId }
  });

  return getSignedUrl(s3Client, command, { expiresIn: 3600 });
}

// When retrieving, always verify tenant ownership
export async function getFileUrl(key: string): Promise<string> {
  const tenantId = getTenantId();
  if (!key.startsWith(`tenant-${tenantId}/`)) {
    throw new Error('Unauthorized: File does not belong to tenant');
  }
  // Return signed URL
}
```

### Pattern 4: Middleware-Based Tenant Context Injection

**What:** Next.js middleware intercepts all requests, extracts tenant ID from JWT or session, injects it into request context, and makes it available to all downstream code.

**When to use:**
- Always for multi-tenant Next.js apps
- Prevents manual tenant ID passing through function chains
- Ensures tenant context is never forgotten

**Trade-offs:**
- **Pros:** Automatic context propagation, reduces boilerplate, catches missing tenant checks
- **Cons:** AsyncLocalStorage overhead (minimal), requires understanding of Node.js context

**Example:**
```typescript
// middleware.ts (Next.js middleware)
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verifyJWT } from '@/lib/auth/jwt';

export async function middleware(request: NextRequest) {
  const token = request.cookies.get('auth-token')?.value;

  if (!token) {
    return NextResponse.redirect(new URL('/sign-in', request.url));
  }

  const payload = await verifyJWT(token);

  // Inject tenant context into headers for downstream use
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-id', payload.tenantId);
  requestHeaders.set('x-user-id', payload.userId);
  requestHeaders.set('x-user-role', payload.role);

  return NextResponse.next({
    request: {
      headers: requestHeaders
    }
  });
}

export const config = {
  matcher: ['/api/:path*', '/dashboard/:path*']
};

// lib/tenant/context.ts
import { headers } from 'next/headers';

export function getTenantContext() {
  const headersList = headers();
  const tenantId = headersList.get('x-tenant-id');
  const userId = headersList.get('x-user-id');
  const role = headersList.get('x-user-role') as 'owner' | 'manager' | 'driver';

  if (!tenantId) throw new Error('Missing tenant context');

  return { tenantId, userId, role };
}
```

### Pattern 5: Job Queue for Scheduled Maintenance Reminders

**What:** Background job queue (BullMQ, Inngest) processes scheduled tasks like sending maintenance reminder emails. Jobs are tenant-scoped and idempotent.

**When to use:**
- Any feature requiring scheduled actions
- Email/SMS notifications
- Data exports, reports, cleanup tasks

**Trade-offs:**
- **Pros:** Decouples long-running tasks from HTTP requests, retries on failure, scales horizontally
- **Cons:** Adds infrastructure complexity, eventual consistency, requires monitoring

**Example:**
```typescript
// jobs/maintenance-reminders.ts
import { Queue, Worker } from 'bullmq';

interface ReminderJob {
  tenantId: string;
  maintenanceId: string;
  vehicleId: string;
  dueDate: string;
}

export const reminderQueue = new Queue<ReminderJob>('maintenance-reminders', {
  connection: redisConnection
});

// Schedule reminder when maintenance record is created
export async function scheduleMaintenanceReminder(
  maintenance: Maintenance
) {
  await reminderQueue.add(
    'send-reminder',
    {
      tenantId: maintenance.tenantId,
      maintenanceId: maintenance.id,
      vehicleId: maintenance.vehicleId,
      dueDate: maintenance.dueDate
    },
    {
      delay: calculateDelayUntilReminder(maintenance.dueDate), // e.g., 7 days before
      removeOnComplete: true
    }
  );
}

// Worker processes jobs
const worker = new Worker<ReminderJob>(
  'maintenance-reminders',
  async (job) => {
    // Set tenant context for this job
    return setTenantContext(job.data.tenantId, async () => {
      const maintenance = await maintenanceRepo.findById(job.data.maintenanceId);
      const vehicle = await vehicleRepo.findById(job.data.vehicleId);

      await emailService.sendMaintenanceReminder({
        to: vehicle.ownerEmail,
        vehicle,
        maintenance
      });
    });
  },
  { connection: redisConnection }
);
```

## Data Flow

### Request Flow

```
[User Action: Manager creates vehicle]
    ↓
[Browser] → POST /api/vehicles with JWT
    ↓
[Next.js Middleware] → Verify JWT → Extract tenant_id, user_id, role
    ↓
[API Route Handler] → getTenantContext() → { tenantId, userId, role }
    ↓
[Vehicle Service] → Validate permissions (role check)
    ↓
[Vehicle Repository] → INSERT with tenant_id column/schema
    ↓
[Database] → Store record in tenant-scoped location
    ↓
[Response] ← Return created vehicle (tenant-filtered)
    ↓
[Browser] ← 201 Created with vehicle data
```

### Authentication & Tenant Context Flow

```
[User Login]
    ↓
[Auth Provider (Clerk/Auth0)] → Verify credentials
    ↓
[JWT Created] → { userId, tenantId, role, email }
    ↓
[Cookie Set] → httpOnly, secure, sameSite
    ↓
[Subsequent Requests]
    ↓
[Middleware] → Decode JWT → Extract tenantId
    ↓
[Request Headers] → x-tenant-id, x-user-id, x-user-role
    ↓
[All Services] → Access via getTenantContext()
```

### Tenant Onboarding Flow

```
[Self-Service Signup Form]
    ↓
POST /api/onboarding/signup
    ↓
[Tenant Provisioning Service]
    ↓
1. Create tenant record in tenants table
    ↓
2. Create database schema (tenant_{id}) OR initialize tenant_id row
    ↓
3. Run migrations for tenant schema
    ↓
4. Create admin user for tenant
    ↓
5. Initialize S3 folder prefix (tenant-{id}/)
    ↓
6. Send welcome email
    ↓
[Return auth token] → User logged into new tenant
```

### Maintenance Reminder Flow

```
[Manager creates maintenance schedule]
    ↓
[Maintenance Service] → Save to DB
    ↓
[Schedule reminder job] → BullMQ.add({ tenantId, maintenanceId, dueDate })
    ↓
[Job Queue] → Stores job with delay (e.g., 7 days before due date)
    ↓
... time passes ...
    ↓
[Worker picks up job] → setTenantContext(tenantId)
    ↓
[Fetch maintenance record] → tenantRepo.findMaintenanceById(maintenanceId)
    ↓
[Fetch vehicle & owner] → vehicleRepo.findById(vehicleId)
    ↓
[Send email] → emailService.send({ to: owner.email, template: 'reminder' })
    ↓
[Mark job complete]
```

### File Upload Flow

```
[Manager clicks "Upload Insurance Document"]
    ↓
[Frontend] → Request presigned upload URL
    ↓
POST /api/vehicles/:id/documents/upload-url
    ↓
[API Handler] → getTenantContext() → Verify vehicle ownership
    ↓
[Storage Service] → Generate presigned URL for tenant-{id}/vehicles/{id}/insurance.pdf
    ↓
[Return URL] ← Presigned S3 URL (expires in 1 hour)
    ↓
[Frontend] → PUT file directly to S3 using presigned URL
    ↓
[S3] ← File stored at tenant-{id}/vehicles/{id}/insurance.pdf
    ↓
[Frontend] → POST /api/vehicles/:id/documents with { key, filename, size }
    ↓
[API Handler] → Save document metadata to database with tenant_id
    ↓
[Response] ← 201 Created
```

### Key Data Flows

1. **Tenant-Scoped Query Pattern:** Every database query must either filter by `tenant_id` (row-level) or set the schema context (schema-per-tenant) before executing. This is enforced at the repository layer.

2. **Role-Based Authorization:** After tenant context is established, role checks determine access level. Owners/Managers get full CRUD, Drivers get read-only access to their assigned vehicle only.

3. **File Storage Isolation:** All file operations use tenant-prefixed paths. Upload URLs are generated with tenant context, and download URLs verify tenant ownership before serving.

4. **Background Job Context:** Jobs inherit tenant context from the data they're processing. Job payload always includes `tenantId` to re-establish context in the worker.

## Scaling Considerations

| Scale | Architecture Adjustments |
|-------|--------------------------|
| **0-100 tenants** | Shared database with row-level tenant_id filtering. Single Next.js deployment. S3 with prefix-based isolation. Simple email service (SendGrid). No caching needed. |
| **100-1,000 tenants** | Move to schema-per-tenant for better isolation. Add Redis for session caching. Implement database read replicas. Add CDN for static assets. Consider managed queue service (Inngest, Upstash QStash). |
| **1,000-10,000 tenants** | Implement database connection pooling (PgBouncer). Add full-page caching with Redis/Vercel KV. Separate notification service. Implement tenant-aware rate limiting. Consider multi-region deployment. Monitor per-tenant resource usage. |
| **10,000+ tenants** | Shard database by tenant ID ranges. Consider hybrid isolation (premium = schema-per-tenant, standard = shared schema). Implement tenant tiering. Add separate analytics database. Consider microservices split (notifications, file processing). Implement cost allocation and per-tenant billing. |

### Scaling Priorities

1. **First bottleneck: Database connections**
   - **Symptom:** Connection pool exhaustion, slow queries
   - **Fix:** Implement PgBouncer for connection pooling. Move to schema-per-tenant to allow better query optimization. Add read replicas for reporting queries.

2. **Second bottleneck: File storage costs**
   - **Symptom:** High S3 costs, slow upload/download
   - **Fix:** Implement lifecycle policies (archive old documents to Glacier). Add CloudFront CDN for frequently accessed files. Consider per-tenant storage quotas with soft/hard limits.

3. **Third bottleneck: Background job queue**
   - **Symptom:** Delayed maintenance reminders, queue backlog
   - **Fix:** Scale worker instances horizontally. Implement job priority queues (premium tenants first). Add job batching for bulk operations.

## Anti-Patterns

### Anti-Pattern 1: Manual Tenant ID Passing Through Function Chains

**What people do:** Pass `tenantId` as a parameter to every function call throughout the application.

```typescript
// ANTI-PATTERN
async function getVehicles(tenantId: string) {
  return vehicleRepo.findAll(tenantId);
}

async function getVehicleWithDriver(vehicleId: string, tenantId: string) {
  const vehicle = await vehicleRepo.findById(vehicleId, tenantId);
  const driver = await driverRepo.findById(vehicle.driverId, tenantId);
  return { vehicle, driver };
}
```

**Why it's wrong:**
- Easy to forget tenant ID in a function, causing data leakage
- Verbose and error-prone
- Testing becomes harder (must mock tenant ID everywhere)

**Do this instead:** Use AsyncLocalStorage or middleware headers to inject tenant context once at the request boundary.

```typescript
// CORRECT PATTERN
import { getTenantContext } from '@/lib/tenant/context';

async function getVehicles() {
  // Tenant context automatically available
  return vehicleRepo.findAll();
}

// Repository internally uses getTenantContext()
class VehicleRepository {
  async findAll() {
    const { tenantId } = getTenantContext();
    return db.query.vehicles.findMany({
      where: eq(vehicles.tenantId, tenantId)
    });
  }
}
```

### Anti-Pattern 2: Trusting Client-Provided Tenant ID

**What people do:** Accept tenant ID from request body or query params and use it directly.

```typescript
// ANTI-PATTERN
app.post('/api/vehicles', async (req, res) => {
  const { tenantId, ...vehicleData } = req.body; // DANGEROUS!
  const vehicle = await vehicleService.create(tenantId, vehicleData);
  return res.json(vehicle);
});
```

**Why it's wrong:**
- Any user can impersonate another tenant by changing the tenant ID
- Massive security vulnerability
- Violates zero-trust principles

**Do this instead:** Extract tenant ID only from authenticated session/JWT, never from client input.

```typescript
// CORRECT PATTERN
app.post('/api/vehicles', async (req, res) => {
  const { tenantId } = getTenantContext(); // From JWT, set by middleware
  const vehicleData = req.body; // No tenantId in body
  const vehicle = await vehicleService.create(vehicleData);
  return res.json(vehicle);
});
```

### Anti-Pattern 3: Bucket-Per-Tenant for File Storage

**What people do:** Create a separate S3 bucket for each tenant.

**Why it's wrong:**
- AWS has a soft limit of 100 buckets per account (hard limit 1,000)
- Managing thousands of buckets is operationally complex
- Higher costs (bucket lifecycle policies must be set per bucket)
- Harder to implement cross-tenant analytics or backups

**Do this instead:** Use a shared bucket with prefix-based isolation (`tenant-{id}/`).

### Anti-Pattern 4: Running Migrations Synchronously During Signup

**What people do:** When a new tenant signs up, run database migrations synchronously before returning the response.

```typescript
// ANTI-PATTERN
app.post('/api/onboarding/signup', async (req, res) => {
  const tenant = await createTenant(req.body);
  await runMigrationsForTenant(tenant.id); // SLOW! Blocks response
  return res.json({ success: true });
});
```

**Why it's wrong:**
- Slow signup experience (migrations can take 10-30 seconds)
- HTTP request timeouts
- Poor user experience

**Do this instead:** Offload provisioning to a background job, return immediately, and notify when ready.

```typescript
// CORRECT PATTERN
app.post('/api/onboarding/signup', async (req, res) => {
  const tenant = await createTenant(req.body);
  await provisioningQueue.add('provision-tenant', { tenantId: tenant.id });
  return res.json({
    success: true,
    status: 'provisioning',
    message: 'Your account is being set up. You will receive an email shortly.'
  });
});
```

### Anti-Pattern 5: Shared Global State for Tenant Context

**What people do:** Use a global variable to store current tenant ID.

```typescript
// ANTI-PATTERN
let currentTenantId: string;

export function setCurrentTenant(id: string) {
  currentTenantId = id;
}

export function getCurrentTenant() {
  return currentTenantId;
}
```

**Why it's wrong:**
- Node.js is single-threaded but handles multiple concurrent requests
- Global state gets overwritten by concurrent requests
- Tenant A's request could read Tenant B's data

**Do this instead:** Use AsyncLocalStorage (Node.js 12+) for request-scoped context.

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| **Email (SendGrid/AWS SES)** | Server-side API calls from notification service | Use tenant-specific templates, track per-tenant sending quotas |
| **SMS (Twilio)** | Server-side API for optional SMS reminders | Consider as premium feature, store tenant opt-in preferences |
| **Auth (Clerk/Auth0/Supabase)** | OAuth2/OIDC with custom JWT claims for tenant ID | Ensure tenant ID is in JWT payload for middleware extraction |
| **File Storage (S3/R2)** | Presigned URLs for direct client uploads | Always verify tenant ownership before generating URLs |
| **Payment (Stripe)** | Subscription management with Stripe Customer ID per tenant | Store `stripe_customer_id` in tenants table, webhook handlers must validate tenant |
| **Monitoring (Sentry/Datadog)** | Tag all errors with tenant ID for filtering | Add tenant context to error boundaries |

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| **Frontend ↔ API** | REST/GraphQL over HTTPS with JWT auth | All requests include tenant context in token |
| **API ↔ Database** | Direct connection via ORM/query builder | Repository layer enforces tenant-scoped queries |
| **API ↔ Job Queue** | Message queue (Redis/RabbitMQ) | Job payloads include tenant ID for context restoration |
| **API ↔ File Storage** | S3 SDK with presigned URLs | Application enforces prefix-based isolation |
| **Job Worker ↔ Notification Service** | Direct API calls or queue | Workers restore tenant context from job data |

## Build Order Implications

### Phase 1 Foundation Dependencies
**Build these first (no dependencies):**
1. Database schema design with tenant isolation strategy (shared DB with schema-per-tenant)
2. Auth system with tenant ID in JWT
3. Middleware for tenant context injection
4. Base repository pattern with tenant-scoped queries

**Why:** These are foundational. Everything else depends on tenant context being established correctly.

### Phase 2 Core Entities
**Build after Phase 1:**
1. Tenant provisioning (signup flow, schema creation)
2. User management (admin user creation, role assignment)
3. Vehicle service (depends on tenant context)
4. Driver service (depends on vehicle for assignment)

**Why:** Core domain entities. Maintenance and reminders depend on vehicles/drivers existing.

### Phase 3 Advanced Features
**Build after Phase 2:**
1. Maintenance service (depends on vehicles)
2. File upload system (depends on vehicles for documents)
3. Notification service (depends on maintenance for reminders)
4. Background jobs (depends on notification service)

**Why:** These are enhancement features that require core entities to be in place.

### Phase 4 Polish & Scaling
**Build after Phase 3:**
1. Dashboard analytics
2. Email reminders (scheduled jobs)
3. Reporting/exports
4. Caching layer
5. Multi-region support (if needed)

**Why:** These are performance and UX improvements that can wait until core functionality is proven.

## Recommended Technology Decisions

Based on the multi-tenant SaaS fleet management requirements, the recommended stack would be:

- **Framework:** Next.js 14+ with App Router (handles SSR, API routes, middleware)
- **Database:** PostgreSQL with schema-per-tenant isolation (Neon, Supabase, or self-hosted)
- **ORM:** Drizzle ORM (type-safe, supports schema-per-tenant patterns)
- **Auth:** Clerk or Auth0 (multi-tenant aware, includes RBAC)
- **File Storage:** AWS S3 or Cloudflare R2 with prefix-based isolation
- **Job Queue:** Inngest or BullMQ (scheduled reminders, async provisioning)
- **Email:** Resend or SendGrid (transactional emails, templates)
- **Deployment:** Vercel (Next.js optimized) or Railway/Render

## Sources

### Multi-Tenant Architecture Patterns
- [Designing Multi-tenant SaaS Architecture on AWS: The Complete Guide for 2026](https://www.clickittech.com/software-development/multi-tenant-architecture/)
- [The developer's guide to SaaS multi-tenant architecture — WorkOS](https://workos.com/blog/developers-guide-saas-multi-tenant-architecture)
- [Let's Architect! Building multi-tenant SaaS systems | AWS Architecture Blog](https://aws.amazon.com/blogs/architecture/lets-architect-building-multi-tenant-saas-systems/)
- [SaaS and Multitenant Solution Architecture - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/guide/saas-multitenant-solution-architecture/)
- [Multi-Tenant SaaS Explained: Architecture, Benefits, and Best Practices | Medium](https://medium.com/@pawannanaware3115/multi-tenant-saas-explained-architecture-benefits-and-best-practices-4cb77a064286)

### Fleet Management System Components
- [Fleet Management Software Development Guide 2025 — Features, Architecture & Cost](https://www.inexture.com/fleet-management-software-for-logistics-and-delivery-operations/)
- [Reference architecture for connected fleets - Microsoft for Mobility reference architecture | Microsoft Learn](https://learn.microsoft.com/en-us/industry/mobility/architecture/ra-mobility-connected-fleets)
- [Fleet Management Software Development in 2026: Full Guide](https://www.cleveroad.com/blog/fleet-management-software-development/)
- [How to Design Database for Fleet Management Systems - GeeksforGeeks](https://www.geeksforgeeks.org/dbms/how-to-design-database-for-fleet-management-systems/)

### Data Isolation Strategies
- [Architectural Approaches for Storage and Data in Multitenant Solutions - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/approaches/storage-data)
- [The Multi-Tenant Performance Crisis: Advanced Isolation Strategies for 2026 - AddWeb Solution](https://www.addwebsolution.com/blog/multi-tenant-performance-crisis-advanced-isolation-2026)
- [Multi-Tenant Database Architecture Patterns Explained](https://www.bytebase.com/blog/multi-tenant-database-architecture-patterns-explained/)
- [Tenant isolation in multi-tenant systems: What you need to know — WorkOS](https://workos.com/blog/tenant-isolation-in-multi-tenant-systems)

### Role-Based Access Control
- [Building Role-Based Access Control for a Multi-Tenant SaaS Startup | Medium](https://medium.com/@my_journey_to_be_an_architect/building-role-based-access-control-for-a-multi-tenant-saas-startup-26b89d603fdb)
- [Best Practices for Multi-Tenant Authorization](https://www.permit.io/blog/best-practices-for-multi-tenant-authorization)
- [How to Choose the Right Authorization Model for Your Multi-Tenant SaaS Application](https://auth0.com/blog/how-to-choose-the-right-authorization-model-for-your-multi-tenant-saas-application/)

### Tenant Provisioning & Onboarding
- [Tenant Onboarding Best Practices in SaaS with the AWS Well-Architected SaaS Lens | Amazon Web Services](https://aws.amazon.com/blogs/apn/tenant-onboarding-best-practices-in-saas-with-the-aws-well-architected-saas-lens/)
- [Multi-Tenant Deployment: 2026 Complete Guide & Examples | Qrvey](https://qrvey.com/blog/multi-tenant-deployment/)
- [Tenant Onboarding - SaaS Lens](https://docs.aws.amazon.com/wellarchitected/latest/saas-lens/tenant-onboarding.html)

### File Storage Architecture
- [Design patterns for multi-tenant access control on Amazon S3 | AWS Storage Blog](https://aws.amazon.com/blogs/storage/design-patterns-for-multi-tenant-access-control-on-amazon-s3/)
- [Partitioning and Isolating Multi-Tenant SaaS Data with Amazon S3 | AWS Partner Network (APN) Blog](https://aws.amazon.com/blogs/apn/partitioning-and-isolating-multi-tenant-saas-data-with-amazon-s3/)
- [Multitenancy and Azure Storage - Azure Architecture Center | Microsoft Learn](https://learn.microsoft.com/en-us/azure/architecture/guide/multitenant/service/storage)

### Notification Systems
- [Notification System Design: Architecture & Best Practices](https://www.magicbell.com/blog/notification-system-design)
- [Best Notification Infrastructure Tool for SAAS and B2B Developers](https://www.suprsend.com/post/best-notification-infrastructure-tool-for-saas-and-b2b-developers)

---
*Architecture research for: Multi-Tenant Fleet Management SaaS (DriveCommand)*
*Researched: 2026-02-14*
*Confidence: HIGH*
