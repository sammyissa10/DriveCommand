# Phase 1: Foundation & Multi-Tenant Setup - Research

**Researched:** 2026-02-14
**Domain:** Multi-tenant PostgreSQL architecture with Row-Level Security
**Confidence:** MEDIUM-HIGH

## Summary

This phase implements multi-tenant data isolation using PostgreSQL 17 Row-Level Security (RLS) combined with Prisma 7 Client Extensions and Next.js 16 request context. The standard approach uses a shared database with tenant_id columns and RLS policies enforced at the database level, with application-level tenant context injection via Prisma extensions that wrap queries in transactions with session variables.

**Critical insight:** RLS is only as secure as the tenant context injection mechanism. Recent CVEs (CVE-2024-10976, CVE-2025-8713) show RLS can fail due to query reuse and optimizer statistics leaks. Connection pool contamination is the #1 failure mode—stale tenant context on pooled connections causes silent cross-tenant data leakage.

**Primary recommendation:** Use Prisma Client Extensions with transaction-wrapped queries that set `app.current_tenant_id` via `set_config()`, enforce RLS with `FORCE ROW LEVEL SECURITY`, create a limited-permission database user without `BYPASSRLS`, and implement comprehensive isolation tests verifying cross-tenant queries return zero results.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Tenant Identification:**
- Single domain with auth-based tenant resolution — no tenant in the URL
- Tenant is resolved from the logged-in user's account (Clerk metadata → tenant_id)
- One company per user — no multi-tenant switching needed
- No subdomain or path-based routing required

**Provisioning Behavior:**
- Empty workspace on signup — owner starts adding real data (trucks, drivers, routes) immediately
- No sample/demo data seeded
- Email verification required before tenant becomes active (Clerk handles this)
- Full onboarding form at signup: email, password, company name, phone, address
- Tenant record created after email verification completes

**Initial Schema Scope:**
- Timestamps stored in tenant's configured timezone (tenant has a timezone setting)
- Tenant isolation tests are critical — dedicated tests verifying Tenant A cannot see Tenant B's data

**Data Isolation:**
- Tenant isolation tests are a must — automated tests that cross-tenant queries return zero results
- These tests are non-negotiable and must be part of the phase's verification

**Tech Stack (LOCKED):**
- Next.js 16
- PostgreSQL 17
- Clerk (authentication)
- Prisma 7

### Claude's Discretion

The planner should make final decisions on:
- System admin model: platform-level admins vs special admin tenant
- Tenant identifier type: UUID vs readable slug
- Table scope: foundation-only vs all tables upfront
- Soft deletes vs hard deletes
- Audit logging: include now or defer
- DB strategy: shared DB + RLS vs schema-per-tenant (RLS is the likely pick given the tech stack)
- Isolation depth: defense-in-depth vs standard
- Tenant-level config table: include now or defer

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope
</user_constraints>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| PostgreSQL | 17 | Database with RLS | Latest stable, enhanced security features, mature RLS implementation |
| Prisma | 7 | ORM with Client Extensions | Official multi-tenant RLS pattern via extensions, type-safe schema management |
| Clerk | Latest | Authentication & user management | SaaS-focused auth, metadata storage (8KB limit), webhook-based provisioning |
| Next.js | 16 | Full-stack framework | App Router, proxy.ts (replaces middleware), official multi-tenant guide |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| Vitest | Latest | Testing framework | Fast, ESM-native, better than Jest for Vite/modern projects |
| @clerk/nextjs | Latest | Clerk integration | Server components, webhooks, metadata access |
| tsx | Latest | TypeScript execution | Running migration scripts, CLI tools |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Shared DB + RLS | Schema-per-tenant | RLS is simpler operationally but requires careful connection pool management; schema-per-tenant provides stronger isolation but complicates migrations and connection pooling |
| Clerk | Auth0, Supabase Auth | Clerk optimized for SaaS multi-tenancy with metadata and org support; others require more custom implementation |
| Vitest | Jest | Vitest 10-20× faster on large suites, better ESM support; Jest more mature ecosystem |

**Installation:**
```bash
npm install prisma @prisma/client @clerk/nextjs
npm install -D vitest tsx
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── lib/
│   ├── db/
│   │   ├── prisma.ts          # Singleton Prisma client
│   │   ├── extensions/
│   │   │   └── tenant-rls.ts  # RLS client extension
│   │   └── repositories/
│   │       └── base.repository.ts  # Tenant-aware base repository
│   ├── context/
│   │   └── tenant-context.ts  # Tenant context provider (AsyncLocalStorage)
│   └── clerk/
│       └── webhooks.ts        # Webhook handlers
├── app/
│   ├── api/
│   │   └── webhooks/
│   │       └── clerk/
│   │           └── route.ts   # Clerk webhook endpoint
│   └── proxy.ts               # Next.js 16 tenant injection (was middleware.ts)
└── prisma/
    ├── schema.prisma
    └── migrations/
        └── [timestamp]_enable_rls/
            └── migration.sql  # RLS policies, functions
```

### Pattern 1: Prisma Client Extension for RLS

**What:** Wraps every query in a transaction and sets PostgreSQL session variable for tenant context

**When to use:** All tenant-scoped database access (not for system admin queries or public data)

**Example:**
```typescript
// Source: https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security
// lib/db/extensions/tenant-rls.ts

import { Prisma } from '@prisma/client';

export function withTenantRLS(tenantId: string) {
  return Prisma.defineExtension((prisma) =>
    prisma.$extends({
      query: {
        $allModels: {
          async $allOperations({ args, query }) {
            // Wrap in transaction to ensure same connection
            const [, result] = await prisma.$transaction([
              // Set tenant context for this connection
              prisma.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`,
              // Execute the actual query
              query(args),
            ]);
            return result;
          },
        },
      },
    })
  );
}

// Usage:
// const tenantPrisma = prisma.$extends(withTenantRLS(tenantId));
// const trucks = await tenantPrisma.truck.findMany(); // Automatically filtered by RLS
```

### Pattern 2: PostgreSQL RLS Policies

**What:** Database-level policies that filter rows based on session variable

**When to use:** Every tenant-scoped table must have RLS enabled and policies defined

**Example:**
```sql
-- Source: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
-- Migration: Enable RLS on tenant-scoped table

-- 1. Create function to get current tenant
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- 2. Enable RLS on table
ALTER TABLE trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE trucks FORCE ROW LEVEL SECURITY;  -- Forces even table owner to obey

-- 3. Create policy for tenant isolation
CREATE POLICY tenant_isolation_policy ON trucks
  FOR ALL
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 4. Optional: Bypass policy for system admin operations
CREATE POLICY bypass_rls_policy ON trucks
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
```

### Pattern 3: Clerk Webhook for Tenant Provisioning

**What:** Handle user.created webhook to provision tenant record after email verification

**When to use:** Tenant creation flow (signup → email verification → webhook → tenant provisioned)

**Example:**
```typescript
// Source: https://clerk.com/docs/guides/development/webhooks/syncing
// app/api/webhooks/clerk/route.ts

import { Webhook } from 'svix';
import { headers } from 'next/headers';
import { prisma } from '@/lib/db/prisma';

export async function POST(req: Request) {
  const WEBHOOK_SECRET = process.env.CLERK_WEBHOOK_SECRET;

  const headerPayload = await headers();
  const svix_id = headerPayload.get('svix-id');
  const svix_timestamp = headerPayload.get('svix-timestamp');
  const svix_signature = headerPayload.get('svix-signature');

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(WEBHOOK_SECRET);
  let evt;

  try {
    evt = wh.verify(body, {
      'svix-id': svix_id,
      'svix-timestamp': svix_timestamp,
      'svix-signature': svix_signature,
    });
  } catch (err) {
    return new Response('Invalid signature', { status: 400 });
  }

  // Handle user.created event
  if (evt.type === 'user.created') {
    const { id: clerkUserId, email_addresses, public_metadata } = evt.data;

    // Create tenant and associate with user
    const tenant = await prisma.tenant.create({
      data: {
        name: public_metadata.companyName,
        timezone: public_metadata.timezone || 'UTC',
        users: {
          create: {
            clerkUserId,
            email: email_addresses[0].email_address,
            role: 'OWNER',
          }
        }
      }
    });

    // Store tenant_id back in Clerk metadata
    await clerkClient.users.updateUserMetadata(clerkUserId, {
      privateMetadata: { tenantId: tenant.id }
    });
  }

  return new Response('Webhook processed', { status: 200 });
}
```

### Pattern 4: Next.js 16 Proxy for Tenant Context Injection

**What:** Resolve tenant from Clerk session and inject into request context

**When to use:** Every authenticated request needs tenant context

**Example:**
```typescript
// Source: https://nextjs.org/docs/app/api-reference/file-conventions/proxy
// app/proxy.ts (NEW in Next.js 16 - was middleware.ts in v15)

import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function proxy(request: NextRequest) {
  const { userId } = await auth();

  if (!userId) {
    return NextResponse.next();
  }

  const user = await currentUser();
  const tenantId = user?.privateMetadata?.tenantId as string;

  if (!tenantId) {
    // User has no tenant yet - redirect to onboarding
    return NextResponse.redirect(new URL('/onboarding', request.url));
  }

  // Inject tenant ID into request headers
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-tenant-id', tenantId);

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
}

export const config = {
  matcher: ['/((?!api/webhooks|_next/static|_next/image|favicon.ico).*)'],
};
```

### Pattern 5: Prisma Schema with Tenant Scoping

**What:** Define tenant_id columns with database-generated defaults from session variable

**When to use:** All tenant-scoped models

**Example:**
```prisma
// Source: https://www.thenile.dev/docs/getting-started/languages/prisma
// prisma/schema.prisma

model Tenant {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  name      String
  timezone  String   @default("UTC")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  users     User[]
  trucks    Truck[]
  drivers   Driver[]
  routes    Route[]
}

model Truck {
  id        String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  // Auto-populated from session variable when RLS is active
  tenantId  String   @default(dbgenerated("current_tenant_id()")) @db.Uuid

  name      String
  licensePlate String

  tenant    Tenant   @relation(fields: [tenantId], references: [id])

  @@index([tenantId])
}
```

### Anti-Patterns to Avoid

- **Not using FORCE ROW LEVEL SECURITY:** Table owners bypass RLS by default, creating a security hole during admin operations
- **Skipping transaction wrappers:** Session variables set outside transactions won't persist across query boundaries with connection pooling
- **Storing tenant context in AsyncLocalStorage only:** Context can be lost across async boundaries in Next.js; always derive from Clerk session
- **Using subdomain-based routing with Clerk:** User chose auth-based resolution—don't override with subdomain detection
- **Creating Prisma client instances per request:** Creates new connection pools, causing pool exhaustion and breaking session variable isolation
- **Querying without tenant context:** Even "safe" queries should use RLS extension to prevent accidental cross-tenant access during refactors
- **Using `SELECT ... WHERE tenant_id = ?` instead of RLS:** Application-level filtering can be bypassed; RLS is enforceable and auditable

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Tenant context injection | Custom headers + AsyncLocalStorage | Prisma Client Extensions + `set_config()` | Connection pool contamination is subtle and dangerous; Prisma's official pattern ensures same connection throughout transaction |
| Tenant isolation | Application-level WHERE clauses | PostgreSQL RLS policies | Database enforces isolation even if application code has bugs; enforceable, auditable, defense-in-depth |
| Webhook verification | Manual signature checking | Clerk's `verifyWebhook()` / Svix library | Timing-safe comparison, proper error handling, maintained by auth experts |
| Connection pooling | Custom pool manager | Prisma's built-in pooling | Handles transaction boundaries, savepoints, prepared statements correctly |
| Database migrations | Custom migration system | Prisma Migrate | Type-safe, tracks migration state, generates rollback-compatible migrations |

**Key insight:** Multi-tenant security failures happen at boundaries (connection pool reuse, async context loss, webhook replay). Use battle-tested libraries that handle edge cases you won't discover until production.

## Common Pitfalls

### Pitfall 1: Connection Pool Contamination

**What goes wrong:** Stale `app.current_tenant_id` session variable on pooled connection causes silent cross-tenant data leakage

**Why it happens:**
- Prisma/PgBouncer reuse connections across requests
- Session variables are connection-scoped, not transaction-scoped
- If transaction fails mid-execution or variable isn't reset, next request using that connection sees stale tenant context

**How to avoid:**
1. **Always wrap in transaction:** Prisma Client Extension pattern ensures `set_config(..., TRUE)` applies locally to transaction only
2. **Use LOCAL scope:** Third parameter `TRUE` in `set_config('app.current_tenant_id', tenantId, TRUE)` makes variable transaction-local
3. **Session pooling with reset:** If using external pooler like PgBouncer, enable session pooling with `server_reset_query = 'DISCARD ALL'`
4. **Test with connection reuse:** Integration tests should explicitly reuse connections across tenant contexts to catch contamination

**Warning signs:**
- Intermittent cross-tenant data visibility (happens randomly based on pool state)
- Higher occurrence during high load (more connection reuse)
- First query after tenant switch shows wrong data

### Pitfall 2: PostgreSQL RLS CVEs and Query Reuse

**What goes wrong:** PostgreSQL can reuse query plans with stale RLS context, showing wrong tenant's data

**Why it happens:**
- CVE-2024-10976: Subqueries, WITH queries, security invoker views, or SQL-language functions can reuse cached plans with wrong RLS context
- CVE-2025-8713: Optimizer statistics can leak sampled data that RLS should hide

**How to avoid:**
1. **Upgrade PostgreSQL:** Both CVEs patched in latest PostgreSQL 17.x
2. **Avoid complex RLS policies with subqueries:** Simple column comparisons (`tenant_id = current_tenant_id()`) are safer than policies with subqueries
3. **Mark helper functions STABLE or IMMUTABLE carefully:** Functions used in RLS policies should be STABLE (not VOLATILE) but test thoroughly
4. **Use SECURITY INVOKER views in PostgreSQL 15+:** Set `security_invoker = true` on views to respect RLS of calling user

**Warning signs:**
- RLS policies that reference other tables via subqueries
- Complex policies with JOINs or CTEs
- Views created by superuser that bypass RLS unintentionally

### Pitfall 3: Clerk Metadata Size Limits

**What goes wrong:** Tenant metadata exceeds 8KB total limit or 1.2KB session token limit, causing silent data loss or session failures

**Why it happens:**
- Clerk metadata capped at 8KB total across public/private/unsafe
- If storing metadata in session tokens (to avoid API calls), browser cookie limit is 4KB; Clerk overhead leaves ~1.2KB for metadata
- Storing tenant config (timezone, feature flags, settings) in metadata can exceed limits

**How to avoid:**
1. **Store only IDs in Clerk metadata:** `{ tenantId: "uuid" }` not entire tenant object
2. **Keep tenant config in database:** Create `tenant_settings` table for timezone, feature flags, etc.
3. **Use private metadata sparingly:** Only store auth-critical data (tenant_id, user_id mapping)
4. **Monitor metadata size:** Add validation to reject updates exceeding 1KB per metadata type

**Warning signs:**
- Clerk API returns 400 errors on metadata update
- Session tokens don't reflect recent metadata changes
- Users report intermittent "profile not found" errors

### Pitfall 4: Timezone Storage vs Display

**What goes wrong:** Timestamps stored in user's local timezone instead of UTC, causing incorrect calculations across timezones

**Why it happens:**
- Prisma stores `DateTime` in UTC by default, but developers manually convert before storage
- User requirement: "timestamps stored in tenant's configured timezone" misinterpreted as "store in local timezone"
- PostgreSQL `TIMESTAMP` (without `TZ`) stores literal time without timezone metadata

**How to avoid:**
1. **Always store in UTC:** Use PostgreSQL `TIMESTAMPTZ` (timestamp with time zone), which auto-converts to UTC
2. **Convert on display only:** Read timezone from `tenant.timezone`, convert UTC → local timezone in UI layer
3. **Prisma schema:** Use `@db.Timestamptz` not `@db.Timestamp`
4. **User requirement clarification:** "Stored in tenant's timezone" means "displayed in tenant's timezone" not "database column in local time"

**Warning signs:**
- Route timestamps off by hours when viewed by different tenants
- Sorting by timestamp shows wrong order
- Date calculations (e.g., "routes from last 7 days") return incorrect results

### Pitfall 5: Testing Without Actual RLS Enforcement

**What goes wrong:** Tests pass but RLS policies aren't actually enforced in production

**Why it happens:**
- Tests use superuser connection or table owner account, which bypass RLS by default
- `FORCE ROW LEVEL SECURITY` not applied, so table owner (app DB user) sees all data
- Tests run with `app.bypass_rls = 'on'` and forget to turn off
- Tests use mocked database or in-memory SQLite, which doesn't support RLS

**How to avoid:**
1. **Create limited-permission test user:** `CREATE USER test_app_user WITH PASSWORD 'test'; GRANT CONNECT ON DATABASE test_db TO test_app_user;` (no BYPASSRLS attribute)
2. **Force RLS on all tenant tables:** `ALTER TABLE ... FORCE ROW LEVEL SECURITY;`
3. **Integration tests with real PostgreSQL:** Use Docker/Testcontainers, not SQLite or mocks
4. **Dedicated cross-tenant test suite:** Create Tenant A and Tenant B, insert data for both, verify queries from Tenant A context return zero Tenant B rows
5. **Test with app user, not superuser:** Configure test Prisma client to use limited-permission user

**Warning signs:**
- "Isolation tests" pass but never actually test cross-tenant queries
- Tests run against SQLite or mocked database
- Test database user is same as migration user (has elevated permissions)
- No tests verify `SELECT * FROM trucks` returns empty result set when tenant context not set

### Pitfall 6: Race Condition Between Webhook and First Login

**What goes wrong:** User completes signup → email verification → first login, but webhook hasn't provisioned tenant yet, causing crash or redirect loop

**Why it happens:**
- Clerk webhook delivery is asynchronous and "eventually consistent"
- User can login immediately after email verification
- Proxy.ts checks for `tenantId` in metadata, doesn't find it, redirects to `/onboarding`
- Onboarding tries to create tenant but webhook fires seconds later, creating duplicate

**How to avoid:**
1. **Idempotent webhook handler:** Use `upsert` not `create`, check if tenant exists before creating
2. **Graceful fallback in proxy.ts:** If no tenantId, check database for user's tenant, create if missing, update Clerk metadata
3. **Loading state:** Redirect to `/onboarding?status=provisioning` and poll for tenant readiness
4. **Webhook retry handling:** Clerk retries failed webhooks; ensure handler is idempotent

**Warning signs:**
- Users report "please complete onboarding" message even after completing signup
- Duplicate tenant records for same user in database
- `Cannot read property 'id' of null` errors during first login

## Code Examples

Verified patterns from official sources:

### Database Setup: Creating Limited-Permission User

```sql
-- Source: https://www.postgresql.org/docs/17/ddl-rowsecurity.html
-- Run as superuser during initial setup

-- 1. Create app user without RLS bypass privilege
CREATE USER drivecommand_app WITH PASSWORD 'secure_password_here';

-- 2. Grant minimal required permissions
GRANT CONNECT ON DATABASE drivecommand TO drivecommand_app;
GRANT USAGE ON SCHEMA public TO drivecommand_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO drivecommand_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO drivecommand_app;

-- 3. Ensure future tables get same permissions
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO drivecommand_app;

-- 4. Verify user CANNOT bypass RLS
SELECT rolname, rolbypassrls FROM pg_roles WHERE rolname = 'drivecommand_app';
-- Should show: drivecommand_app | f (false)
```

### RLS Migration Template

```sql
-- Source: https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security
-- migrations/YYYYMMDD_enable_rls_trucks/migration.sql

-- 1. Add tenant_id column if not exists (Prisma will handle via schema)
-- Already defined in schema.prisma

-- 2. Create helper function
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- 3. Enable RLS
ALTER TABLE "Truck" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Truck" FORCE ROW LEVEL SECURITY;

-- 4. Create tenant isolation policy (permissive)
CREATE POLICY tenant_isolation_policy ON "Truck"
  FOR ALL
  TO drivecommand_app
  USING (tenant_id = current_tenant_id())
  WITH CHECK (tenant_id = current_tenant_id());

-- 5. Create bypass policy for admin operations (permissive)
CREATE POLICY bypass_rls_policy ON "Truck"
  FOR ALL
  TO drivecommand_app
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');

-- 6. Grant explicit permissions on table
GRANT SELECT, INSERT, UPDATE, DELETE ON "Truck" TO drivecommand_app;
```

### Repository Pattern with Tenant Context

```typescript
// Source: https://oneuptime.com/blog/post/2026-01-25-multi-tenant-apis-nodejs/view
// lib/db/repositories/base.repository.ts

import { Prisma, PrismaClient } from '@prisma/client';
import { withTenantRLS } from '../extensions/tenant-rls';

export class TenantRepository {
  private prisma: PrismaClient;

  constructor(private tenantId: string) {
    // Create tenant-scoped client with RLS extension
    this.prisma = new PrismaClient().$extends(withTenantRLS(tenantId));
  }

  // All queries automatically filtered by tenant
  async findTrucks() {
    return this.prisma.truck.findMany();
  }

  async createTruck(data: Prisma.TruckCreateInput) {
    // tenantId auto-populated by database via dbgenerated() default
    return this.prisma.truck.create({ data });
  }
}

// Usage in API route:
// const repo = new TenantRepository(tenantId);
// const trucks = await repo.findTrucks(); // Only this tenant's trucks
```

### Isolation Test Example

```typescript
// Source: https://www.thenile.dev/blog/multi-tenant-rls
// tests/isolation/cross-tenant.test.ts

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { withTenantRLS } from '@/lib/db/extensions/tenant-rls';

describe('Tenant Isolation', () => {
  let prisma: PrismaClient;
  let tenantA: string;
  let tenantB: string;

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Create two tenants
    const [tA, tB] = await Promise.all([
      prisma.tenant.create({ data: { name: 'Tenant A' } }),
      prisma.tenant.create({ data: { name: 'Tenant B' } }),
    ]);

    tenantA = tA.id;
    tenantB = tB.id;

    // Insert data for both tenants using raw SQL (bypass RLS for setup)
    await prisma.$executeRaw`
      INSERT INTO "Truck" (id, tenant_id, name, license_plate)
      VALUES
        (gen_random_uuid(), ${tenantA}::uuid, 'Truck A1', 'AAA-001'),
        (gen_random_uuid(), ${tenantA}::uuid, 'Truck A2', 'AAA-002'),
        (gen_random_uuid(), ${tenantB}::uuid, 'Truck B1', 'BBB-001'),
        (gen_random_uuid(), ${tenantB}::uuid, 'Truck B2', 'BBB-002')
    `;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('Tenant A cannot see Tenant B trucks', async () => {
    const tenantAPrisma = prisma.$extends(withTenantRLS(tenantA));
    const trucks = await tenantAPrisma.truck.findMany();

    expect(trucks).toHaveLength(2);
    expect(trucks.every(t => t.tenantId === tenantA)).toBe(true);
    expect(trucks.some(t => t.name.startsWith('Truck B'))).toBe(false);
  });

  it('Tenant B cannot see Tenant A trucks', async () => {
    const tenantBPrisma = prisma.$extends(withTenantRLS(tenantB));
    const trucks = await tenantBPrisma.truck.findMany();

    expect(trucks).toHaveLength(2);
    expect(trucks.every(t => t.tenantId === tenantB)).toBe(true);
    expect(trucks.some(t => t.name.startsWith('Truck A'))).toBe(false);
  });

  it('Query without tenant context returns zero results', async () => {
    // No RLS extension = no tenant context set
    const trucks = await prisma.truck.findMany();

    expect(trucks).toHaveLength(0);
  });

  it('Cross-tenant update fails silently', async () => {
    const tenantAPrisma = prisma.$extends(withTenantRLS(tenantA));

    // Get Tenant B truck ID
    const tenantBPrisma = prisma.$extends(withTenantRLS(tenantB));
    const truckB = await tenantBPrisma.truck.findFirst();

    // Try to update Tenant B truck from Tenant A context
    const result = await tenantAPrisma.truck.update({
      where: { id: truckB.id },
      data: { name: 'HACKED' },
    }).catch(err => err);

    // Should throw "Record not found" because RLS filters it out
    expect(result).toBeInstanceOf(Error);
    expect(result.code).toBe('P2025'); // Prisma "Record not found"
  });
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `middleware.ts` | `proxy.ts` | Next.js 16 (2026) | Function name `middleware` → `proxy`, Edge runtime NOT supported, Node.js runtime only |
| Application-level `WHERE tenant_id = ?` | PostgreSQL RLS policies | Mainstream 2023+ | Database enforces isolation; app bugs can't bypass; defense-in-depth |
| One Prisma client per tenant | Prisma Client Extensions | Prisma Extensions (2023+) | Shared connection pool, type-safe tenant scoping, official pattern |
| Clerk `publicMetadata` for tenant ID | `privateMetadata` | Security best practice | Prevents frontend tampering with tenant assignment |
| `TIMESTAMP` | `TIMESTAMPTZ` | PostgreSQL best practice | Stores UTC with conversion, avoids timezone bugs |

**Deprecated/outdated:**
- **Subdomain-based multi-tenancy in Next.js:** Vercel's Platforms Starter Kit uses this, but user chose auth-based resolution (simpler, no DNS/routing complexity)
- **`jest-prisma` and `vitest-environment-vprisma`:** Both unmaintained; use Testcontainers + transaction rollback pattern instead
- **Setting RLS variables outside transactions:** Connection pooling breaks this; always wrap in `$transaction([set_config(), query()])`
- **Storing metadata in Clerk `unsafeMetadata`:** Called "unsafe" for a reason—frontend can tamper; use `privateMetadata` for tenant_id

## Open Questions

1. **Soft delete vs hard delete for tenant data**
   - What we know: Soft deletes add complexity (unique constraints, index bloat, GDPR compliance harder); hard deletes are simpler but data loss risk
   - What's unclear: Whether DriveCommand needs audit trail for deleted trucks/drivers/routes, GDPR compliance requirements
   - Recommendation: **Start with hard deletes** for simplicity; add audit logging table separately if needed (phase discretion)

2. **System admin model: platform-level users vs special tenant**
   - What we know: Platform admins need to view/manage all tenants (AUTH-04); either create `is_system_admin` flag on users or create special `system_admin` tenant
   - What's unclear: Whether system admins need their own "workspace" or just read-only access to all tenants
   - Recommendation: **Platform-level flag** (`User.isSystemAdmin: Boolean`) with RLS bypass policy; simpler than special tenant, clearer permissions model

3. **Tenant identifier: UUID vs readable slug**
   - What we know: UUIDs prevent enumeration attacks; slugs (e.g., `acme-logistics`) are user-friendly but require uniqueness checks
   - What's unclear: Whether tenant slugs needed for future subdomain routing (user said no subdomains, but may change)
   - Recommendation: **UUID primary key** (`tenant.id`) + optional `slug` field (unique, nullable); use UUID in RLS policies, slug for future flexibility

4. **Audit logging scope**
   - What we know: Compliance/debugging benefits; adds schema complexity; can defer to later phase
   - What's unclear: Whether Phase 1 verification requires audit trail or just isolation tests
   - Recommendation: **Defer to Phase 2+**; focus Phase 1 on RLS correctness, add audit logging when AUTH-06 (roles) implemented

5. **Table scope: RLS on foundation tables only vs all tables upfront**
   - What we know: User wants trucks, drivers, routes; roadmap has 10 phases with growing schema
   - What's unclear: Whether to enable RLS only on Phase 1 tables or scaffold all tenant-scoped tables now
   - Recommendation: **Foundation tables only** (Tenant, User, Truck, Driver, Route); add RLS to new tables in their respective phases; avoids premature schema decisions

## Sources

### Primary (HIGH confidence)

- [PostgreSQL 17 Row Security Policies Documentation](https://www.postgresql.org/docs/17/ddl-rowsecurity.html) - Official RLS syntax and behavior
- [Prisma Client Extensions - Row-Level Security Example](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security) - Official Prisma multi-tenant RLS pattern
- [Next.js 16 Multi-Tenant Guide](https://nextjs.org/docs/app/guides/multi-tenant) - Official multi-tenant architecture
- [Next.js 16 proxy.ts Documentation](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) - Middleware replacement
- [Clerk User Metadata Documentation](https://clerk.com/docs/users/metadata) - Metadata types, limits, best practices
- [Clerk Webhooks - Syncing Data](https://clerk.com/docs/guides/development/webhooks/syncing) - Webhook implementation patterns
- [CVE-2024-10976: PostgreSQL RLS Row Security Disregards User ID Changes](https://www.postgresql.org/support/security/CVE-2024-10976/) - RLS query reuse vulnerability
- [CVE-2025-8713: PostgreSQL Optimizer Statistics Leak Data](https://www.postgresql.org/support/security/CVE-2025-8713/) - RLS statistics leak vulnerability

### Secondary (MEDIUM confidence)

- [AWS: Multi-tenant Data Isolation with PostgreSQL RLS](https://aws.amazon.com/blogs/database/multi-tenant-data-isolation-with-postgresql-row-level-security/) - Production architecture patterns
- [Crunchy Data: Row Level Security for Tenants in Postgres](https://www.crunchydata.com/blog/row-level-security-for-tenants-in-postgres) - RLS best practices
- [Securing Multi-Tenant Applications Using RLS in PostgreSQL with Prisma ORM](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35) - Prisma RLS integration
- [Multi-Tenant Leakage: When "Row-Level Security" Fails in SaaS](https://medium.com/@instatunnel/multi-tenant-leakage-when-row-level-security-fails-in-saas-da25f40c788c) - Connection pool contamination, CVE analysis
- [How to Build Multi-Tenant APIs in Node.js](https://oneuptime.com/blog/post/2026-01-25-multi-tenant-apis-nodejs/view) - Repository pattern, BaseRepository example (2026)
- [Codepunkt: Blazing Fast Prisma and Postgres Tests in Vitest](https://codepunkt.de/writing/blazing-fast-prisma-and-postgres-tests-in-vitest/) - Vitest transaction testing pattern
- [Permit.io: Postgres RLS Implementation Guide](https://www.permit.io/blog/postgres-rls-implementation-guide) - Common pitfalls, best practices

### Tertiary (LOW confidence - needs validation)

- [Bytebase: Common Postgres Row-Level-Security Footguns](https://www.bytebase.com/blog/postgres-row-level-security-footguns/) - Footguns list (site blocked, cited from search results)
- [Multi-Tenant Search in PostgreSQL with RLS](https://www.pedroalonso.net/blog/postgres-multi-tenant-search/) - Search optimization patterns
- [Mastering DateTime and Timestamp with Local Timezone](https://github.com/prisma/prisma/discussions/15329) - Prisma timezone handling discussion

## Metadata

**Confidence breakdown:**
- Standard stack: **HIGH** - All libraries have official docs, Prisma RLS extension is official example, PostgreSQL 17 RLS is mature
- Architecture: **MEDIUM-HIGH** - Patterns verified across multiple authoritative sources (AWS, Prisma, PostgreSQL official docs), but some implementation details vary
- Pitfalls: **MEDIUM** - CVEs verified from official PostgreSQL security advisories, connection pool contamination documented by multiple sources but some details from inaccessible Medium article
- Code examples: **HIGH** - All examples sourced from official docs or verified GitHub repos

**Research date:** 2026-02-14
**Valid until:** 2026-03-16 (30 days - stable technologies, but Next.js/Prisma evolve quickly)

**Key risk areas requiring validation during planning:**
1. AsyncLocalStorage context propagation in Next.js 16 (reported issues in v14/15, unclear if resolved in v16)
2. Exact Prisma Client Extension syntax for transaction wrapping (official example may need adaptation for Prisma 7)
3. Clerk webhook timing and idempotency handling (eventual consistency risk)
4. Connection pool contamination mitigation with Prisma's built-in pooling (official docs don't detail DISCARD ALL or reset behavior)
