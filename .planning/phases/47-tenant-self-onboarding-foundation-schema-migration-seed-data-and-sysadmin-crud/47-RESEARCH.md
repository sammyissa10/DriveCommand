# Phase 47: Tenant Self-Onboarding Foundation — Research

**Researched:** 2026-04-29
**Domain:** PostgreSQL DDL migrations, Prisma schema, RLS policies, Next.js App Router SysAdmin CRUD
**Confidence:** HIGH

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Migration Strategy**
- Two separate raw SQL files in `apps/web/prisma/migrations/` (NOT `apps/web/migrations/` — see finding below)
- Format: `<timestamp>__tenant_self_onboarding.sql` (A-01) and `<timestamp>__seed_plans_and_automations.sql` (A-02)
- Do NOT use `prisma migrate dev`. Migrations apply via `scripts/migrate.mjs` at deploy time.
- Update `apps/web/prisma/schema.prisma` manually to match DDL.

**New Tables (A-01)**
Enums first: `FleetSizeBucket`, `TenantStatus`, `ProvisioningPhase`, `SubscriptionStatus`, `AutomationScope`, `AutomationRunStatus`
Extend `Tenant` table: slug (already exists — see finding below), fleetSizeBucket, status, manualTrial, emailConfirmedAt, sampleDataSeeded, provisioningPhase
Add `isSample BOOLEAN DEFAULT FALSE` to: `Truck`, `User`, `Customer`, `Load`
New tables: `Plan`, `Promo`, `Subscription`, `ActivationProgress`, `AutomationRule`, `AutomationRun`, `AppEvent`, `TenantMetricsDaily`, `TenantHealthScore`

**RLS Policies (hard rule)**
- Tenant-scoped tables (both policies): `Subscription`, `ActivationProgress`, `AutomationRun`, `AppEvent`, `TenantMetricsDaily`, `TenantHealthScore`
- Platform-level (NO RLS): `Plan`, `Promo`
- `AutomationRule` partial policy: `USING (scope = 'SYSTEM' OR tenant_id = current_tenant_id())`

**Money Columns**
- Price columns use INTEGER (cents), not DECIMAL

**Stripe Deferral**
- `stripeProductId`, `stripeCouponId`, `stripeCustomerId`, `stripeSubscriptionId` remain nullable and unwritten

**Seed Data (A-02)**
- Three Plans: Starter ($49/mo, 5 trucks, 5 users), Pro ($99/mo, 20 trucks, 20 users), Fleet ($199/mo, unlimited)
- Six SYSTEM AutomationRules per spec section 7.4

**SysAdmin UI (A-03)**
- Follow existing patterns: `/admin/tenants` and `/admin/billing` styles exactly
- No delete UI for Plans (soft disable via isActive toggle)
- Modal or separate pages — match what already exists

**TypeScript Verification**
- `npx prisma generate` must succeed
- `npx tsc --noEmit` must pass
- `npm run lint` must pass

### Claude's Discretion
- Exact migration timestamp format — match existing files
- SysAdmin page layout details — follow existing patterns
- Error handling in forms — follow existing patterns
- Modal dialog vs. separate create pages — match existing admin portal

### Deferred Ideas (OUT OF SCOPE)
- Signup flow, email templates, session creation
- Hydration / sample data seeding
- Activation tracker hooks in domain actions
- Automations engine (emitEvent, evaluator, action handlers)
- Cron routes for metrics aggregation and health scores
- SysAdmin tenant detail page enhancements
</user_constraints>

---

## Summary

Phase 47 is a pure database + SysAdmin UI phase. It adds 9 new tables and 6 new enums, extends 4 existing tables with `isSample`, and extends `Tenant` with 7 new columns. All work follows existing codebase patterns with zero deviation. The migration system, RLS pattern, SysAdmin page structure, and server action pattern are all well-established in the codebase and directly reusable.

**Critical finding:** The CONTEXT.md says migrations go in `apps/web/migrations/` but the actual system uses `apps/web/prisma/migrations/<dir>/migration.sql`. The `migrate.mjs` script reads `prisma/migrations/` subdirectories. All migration files must live in `apps/web/prisma/migrations/<timestamp_name>/migration.sql`.

**Critical finding:** `Tenant.slug` already exists in the schema as `String? @unique`. The A-01 migration must NOT add slug again — it already exists. The migration only needs to add: `fleetSizeBucket`, `status`, `manualTrial`, `emailConfirmedAt`, `sampleDataSeeded`, `provisioningPhase`.

**Primary recommendation:** Write both migrations as fully idempotent SQL using `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` for enums, `CREATE TABLE IF NOT EXISTS` for tables, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` for columns, and `CREATE INDEX IF NOT EXISTS` for indexes.

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7 | ORM + schema source of truth | Already in project |
| pg (node-postgres) | project version | Direct DB connection in migrate.mjs | migrate.mjs uses it directly |
| Next.js App Router | 15 | SysAdmin CRUD pages | Already in project |
| shadcn/ui | project version | UI components (Card, etc.) | Used in all existing admin pages |
| @tanstack/react-table | project version | Table rendering in admin | Used in tenant-list-client.tsx |
| zod | project version | Form validation in server actions | Used in all existing server actions |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| decimal.js | project version | Decimal arithmetic in forms | Used in billing forms |
| revalidatePath | Next.js | Cache invalidation after mutations | Used in all server actions |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Raw SQL DDL | prisma migrate dev | Raw SQL is locked decision — don't change |
| @tanstack/react-table | HTML table | Follow existing pattern — tenant list uses react-table |
| Separate create pages | Modal dialogs | Either works; billing/new uses separate page, follow that pattern |

---

## Architecture Patterns

### Migration Directory Structure

The migrate.mjs script reads from `prisma/migrations/`, NOT `migrations/`. Each migration is a subdirectory containing `migration.sql`:

```
apps/web/prisma/migrations/
├── 20260428100001_add_playbook_instance_triggered_by/
│   └── migration.sql                    ← most recent existing migration
├── <timestamp>__tenant_self_onboarding/
│   └── migration.sql                    ← A-01 (DDL)
└── <timestamp>__seed_plans_and_automations/
    └── migration.sql                    ← A-02 (seed data)
```

The timestamp determines sort order (applied alphabetically). Use format `YYYYMMDDHHMMSS_<name>` to match existing files. The most recent existing migration is `20260428100001` — A-01 and A-02 must have timestamps after this.

### RLS Policy Pattern (copy exactly)

From `20260226000002_add_rls_missing_tables/migration.sql`:

```sql
ALTER TABLE "TableName" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TableName" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "TableName"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "TableName"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

Column name in policy is `"tenantId"` (camelCase, quoted) for standard tables. Tables using `@map("org_id")` use `org_id` — but all new tables use `tenantId`.

### Enum Creation Pattern (idempotent)

```sql
DO $$ BEGIN
  CREATE TYPE "EnumName" AS ENUM ('VALUE1', 'VALUE2');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### Column Addition Pattern (idempotent)

```sql
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "fleetSizeBucket" "FleetSizeBucket";
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "status" "TenantStatus" NOT NULL DEFAULT 'TRIAL';
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "manualTrial" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "emailConfirmedAt" TIMESTAMPTZ;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "sampleDataSeeded" BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE "Tenant" ADD COLUMN IF NOT EXISTS "provisioningPhase" "ProvisioningPhase" NOT NULL DEFAULT 'MINIMAL';
```

Note: `fleetSizeBucket` will be nullable initially for existing tenants (no NOT NULL without DEFAULT that makes sense for them). Use nullable or DEFAULT 'OWNER_OPERATOR' — planner decides.

### Table Creation Pattern (idempotent)

```sql
CREATE TABLE IF NOT EXISTS "Plan" (
    "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
    "key"               TEXT        NOT NULL,
    -- ... columns ...
    CONSTRAINT "Plan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Plan_key_key" ON "Plan"("key");
CREATE INDEX IF NOT EXISTS "Plan_isActive_idx" ON "Plan"("isActive");

DO $$ BEGIN
  ALTER TABLE "SomeTable" ADD CONSTRAINT "SomeTable_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "Plan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### FK Constraint Pattern (idempotent)

Newer migrations (like `20260424120001_workflow_engine_automation`) use `IF NOT EXISTS` check:

```sql
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'TableName_columnName_fkey'
  ) THEN
    ALTER TABLE "TableName" ADD CONSTRAINT "TableName_columnName_fkey"
      FOREIGN KEY ("columnId") REFERENCES "OtherTable"("id") ON DELETE CASCADE;
  END IF;
END$$;
```

Either pattern is acceptable — the `EXCEPTION WHEN duplicate_object` pattern is also used.

### SysAdmin Page Pattern

From `/admin/billing/page.tsx` and `/admin/tenants/page.tsx`:

```
apps/web/src/app/(admin)/
├── plans/
│   ├── page.tsx              ← server component: fetch + render table
│   ├── plans-list-client.tsx ← client component with @tanstack/react-table
│   ├── new/
│   │   └── page.tsx          ← server component wrapper
│   └── [id]/
│       └── page.tsx          ← edit form
└── promos/
    ├── page.tsx
    ├── promos-list-client.tsx
    └── new/
        └── page.tsx
```

Auth guard is in the layout — all pages under `(admin)` already require admin. No per-page auth needed.

### SysAdmin Server Action Pattern

From `/admin/actions/tenants.ts`:

```typescript
'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) throw new Error('Unauthorized: Admin access required');
}

export async function createPlan(formData: FormData) {
  await requireAdminAccess();
  // zod validate → prisma create → revalidatePath → return { success: true } | { success: false, error: string }
}
```

Return shape is always `{ success: boolean; error?: string }` or `{ success: boolean; emailWarning?: string }`.

### Prisma Schema Update Pattern

For new tables, add the model block at the end of the relevant section. For enums, add at the enum section (lines 13–117 in current schema). For new Tenant columns, add after `updatedAt` (line 130).

Existing Tenant model fields to be aware of:
- `slug String? @unique` — ALREADY EXISTS, do not add again
- `isActive Boolean @default(true)` — existing field, do not rename
- `plan String @default("starter")` — legacy string plan field, coexists with new `Plan` relation

The new `Plan` table creates a proper FK relation; the legacy `Tenant.plan` string column stays for backward compatibility (deferred migration).

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Migration tracking | Custom version table | Existing `_prisma_migrations` table | migrate.mjs already uses it |
| Idempotent enum creation | `DROP TYPE IF EXISTS; CREATE TYPE` | `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` | Drop-and-recreate breaks existing columns that use the enum |
| RLS policy text | Custom USING clause | Exact copy from `20260226000002` migration | Must match existing `current_tenant_id()` function signature |
| Admin auth check | Per-page middleware | `requireAdminAccess()` pattern from tenants.ts | Layout already gates the route group |
| Table pagination | Custom cursor | `@tanstack/react-table` `getFilteredRowModel` | Already in use, consistent UX |

**Key insight:** Every pattern needed for this phase already exists in the codebase. This phase is pattern application, not pattern invention.

---

## Common Pitfalls

### Pitfall 1: Wrong Migration Directory
**What goes wrong:** Writing migration to `apps/web/migrations/` (doesn't exist) instead of `apps/web/prisma/migrations/<name>/migration.sql`
**Why it happens:** CONTEXT.md says `apps/web/migrations/` — this appears to be a spec inconsistency
**How to avoid:** Always use `apps/web/prisma/migrations/<timestamp_name>/migration.sql` — that's where migrate.mjs reads from
**Warning signs:** `migrate.mjs` logs "Database up to date" when it should be applying a migration

### Pitfall 2: Adding slug to Tenant Again
**What goes wrong:** `ALTER TABLE "Tenant" ADD COLUMN "slug"` fails with duplicate column error
**Why it happens:** `Tenant.slug String? @unique` already exists in schema.prisma (line 122) and was added in migration `20260422200001_add_tenant_contact_email_plan`
**How to avoid:** Use `ADD COLUMN IF NOT EXISTS` for every column addition. Check schema before adding.
**Warning signs:** Migration fails with "column already exists"

### Pitfall 3: Enum Enum Conflict — AutomationScope vs. AutomationRunStatus
**What goes wrong:** None of the 6 new enum names conflict with existing enums
**Existing enums verified:** `UserRole`, `InvitationStatus`, `RouteStatus`, `NotificationStatus`, `SafetyEventType`, `SafetyEventSeverity`, `FuelType`, `PaymentStatus`, `DocumentType`, `IntegrationProvider`, `IntegrationCategory`, `RouteStopType`, `RouteStopStatus`, `InAppNotificationType`, `CustomerPriority`, `CustomerStatus`, `InteractionType`, `SysAdminInvoiceStatus`, `InvoiceStatus`, `InvoiceItemType`, `InvoiceItemUnit`, `PayrollStatus`, `LoadStatus`, `SupportTicketStatus`, `SupportTicketCategory`, `SupportTicketPriority`, `TicketMessageSenderType`, `DriverPaymentMethod`, `HOSDutyStatus`, `IncidentCategory`, `IncidentSeverity`, `PlaybookEntityType`, `PlaybookCategory`, `InstanceStatus`, `StepStatus`, `NotifType`, `OverdueRecipient`, `NotifChannel`, `PhaseType`, `StepType`, `AssigneeRole`, `TriggerEvent`
**New enums:** `FleetSizeBucket`, `TenantStatus`, `ProvisioningPhase`, `SubscriptionStatus`, `AutomationScope`, `AutomationRunStatus` — NONE conflict
**How to avoid:** All idempotent anyway via `EXCEPTION WHEN duplicate_object THEN NULL`

### Pitfall 4: TenantStatus vs. CustomerStatus Name Conflict
**What goes wrong:** `TenantStatus` has values `TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED`. `CustomerStatus` has values `ACTIVE, INACTIVE, PROSPECT`. No value-level conflict but both exist.
**How to avoid:** Always reference enum by full type name in SQL DDL. No issue at Postgres level since they are separate types.

### Pitfall 5: Seed Migration Runs Before DDL Migration
**What goes wrong:** A-02 references `Plan` and `AutomationRule` tables that don't exist yet if sort order is wrong
**Why it happens:** migrate.mjs sorts directories alphabetically — timestamps must guarantee DDL runs first
**How to avoid:** Give A-01 a timestamp strictly before A-02. E.g., `20260429000001__tenant_self_onboarding` and `20260429000002__seed_plans_and_automations`

### Pitfall 6: Not Wrapping in Transaction
**What goes wrong:** migrate.mjs wraps each migration in BEGIN/COMMIT. You should NOT add BEGIN/COMMIT inside migration.sql — that nests transactions.
**Evidence:** Migration header comment: "Do NOT wrap in BEGIN/COMMIT — migrate.mjs wraps each migration in its own transaction."
**How to avoid:** Never add BEGIN/COMMIT inside migration files.

### Pitfall 7: Missing Admin Nav Link
**What goes wrong:** Plans and Promos pages are unreachable from admin nav
**Why it happens:** The admin layout.tsx hardcodes nav links — new pages need to be added there
**How to avoid:** Add "Plans" and "Promos" links to `apps/web/src/app/(admin)/layout.tsx` nav

### Pitfall 8: Prisma Schema Missing New Relations
**What goes wrong:** `npx prisma generate` fails or produces wrong types because schema.prisma isn't updated to match DDL
**How to avoid:** Update schema.prisma simultaneously with writing the DDL migration. Add Tenant reverse relations for all new models that have tenantId FK.

---

## Code Examples

### Exact RLS Two-Policy Block (from 20260226000002)

```sql
-- Source: apps/web/prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql
ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Subscription" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "Subscription"
    FOR ALL
    USING ("tenantId" = current_tenant_id())
    WITH CHECK ("tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "Subscription"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

### AutomationRule Partial RLS (from spec section 4.12)

```sql
ALTER TABLE "AutomationRule" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AutomationRule" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation_policy ON "AutomationRule"
    FOR ALL
    USING (scope = 'SYSTEM' OR "tenantId" = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY bypass_rls_policy ON "AutomationRule"
    FOR ALL
    USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

Note: AutomationRule has no WITH CHECK clause on `tenant_isolation_policy` since SYSTEM rules can be inserted by sysadmin (bypass_rls covers writes from sysadmin context).

### Seed INSERT Pattern (for A-02)

```sql
-- Source: spec section 3 + 7.4
-- Plans are platform-level (no tenantId), INSERT with ON CONFLICT DO NOTHING for idempotency

INSERT INTO "Plan" ("id", "key", "name", "description", "defaultTrialDays", "monthlyPriceCents",
                    "maxTrucks", "maxUsers", "isActive", "sortOrder", "createdAt", "updatedAt")
VALUES
  (gen_random_uuid(), 'starter', 'Starter', 'For owner-operators and small fleets',
   14, 4900, 5, 5, TRUE, 1, NOW(), NOW()),
  (gen_random_uuid(), 'pro', 'Pro', 'For growing fleets',
   14, 9900, 20, 20, TRUE, 2, NOW(), NOW()),
  (gen_random_uuid(), 'fleet', 'Fleet', 'For large fleets',
   14, 19900, NULL, NULL, TRUE, 3, NOW(), NOW())
ON CONFLICT ("key") DO NOTHING;
```

### SysAdmin Action Shell

```typescript
// Source: apps/web/src/app/(admin)/actions/tenants.ts pattern
'use server';

import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';

async function requireAdminAccess() {
  await requireAuth();
  const admin = await isSystemAdmin();
  if (!admin) throw new Error('Unauthorized: Admin access required');
}

export async function createPlan(data: unknown): Promise<{ success: boolean; error?: string }> {
  await requireAdminAccess();
  const schema = z.object({ key: z.string(), name: z.string(), ... });
  const validation = schema.safeParse(data);
  if (!validation.success) return { success: false, error: validation.error.issues[0].message };
  await prisma.plan.create({ data: validation.data });
  revalidatePath('/plans');
  return { success: true };
}
```

### Prisma Schema — New Enum Block Example

```prisma
// Add to enum section (after line 117 in current schema)
enum FleetSizeBucket {
  OWNER_OPERATOR
  SMALL
  MEDIUM
  LARGE
}

enum TenantStatus {
  TRIAL
  ACTIVE
  PAST_DUE
  SUSPENDED
  CANCELLED
}

enum ProvisioningPhase {
  MINIMAL
  HYDRATED
}

enum SubscriptionStatus {
  TRIALING
  ACTIVE
  PAST_DUE
  CANCELLED
  SUSPENDED
}

enum AutomationScope {
  SYSTEM
  TENANT
}

enum AutomationRunStatus {
  FIRED
  SKIPPED_CONDITION
  SKIPPED_ALREADY_RAN
  FAILED
}
```

---

## Findings: Key Codebase Facts

### Fact 1: Correct Migration Location
**Confirmed:** `apps/web/prisma/migrations/<dir>/migration.sql` — NOT `apps/web/migrations/`
The `migrate.mjs` script at line 42: `const migrationsDir = join(process.cwd(), 'prisma', 'migrations');`
Migration directories are sorted alphabetically, each containing `migration.sql`.

### Fact 2: Tenant.slug Already Exists
**Confirmed:** `schema.prisma` line 122: `slug String? @unique`
Migration `20260422200001_add_tenant_contact_email_plan` added `contactEmail` and `plan` but not slug — slug was added elsewhere. Current schema.prisma definitively shows it exists.
**Action:** A-01 must NOT add slug. Only add the 6 new columns.

### Fact 3: Customer Table Name
**Confirmed:** The CRM customer table is named `Customer` (Prisma model name) mapping to `"Customer"` in SQL. It has `tenantId`, `id`, `companyName`, etc.
**Action:** `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "isSample" BOOLEAN NOT NULL DEFAULT FALSE;`

### Fact 4: Existing Enums — No Conflicts
**Confirmed:** All 6 new enum names (`FleetSizeBucket`, `TenantStatus`, `ProvisioningPhase`, `SubscriptionStatus`, `AutomationScope`, `AutomationRunStatus`) are absent from `schema.prisma`. Safe to create.

### Fact 5: TriggerEvent Enum Already Exists
**Confirmed:** `TriggerEvent` already exists in schema.prisma (lines 1325–1334) with values `ON_DRIVER_CREATE`, `ON_VEHICLE_CREATE`, `ON_DISPATCH_CREATE`, `ON_DISPATCH_DEPART`, `ON_DISPATCH_DELIVER`, `ON_PARTNER_CREATE`, `MANUAL_ONLY`, `RECURRING`.
**This is a different enum from AutomationRule.triggerEvent** — the `AutomationRule.triggerEvent` column is a TEXT field (not the `TriggerEvent` enum type), since automation trigger events are strings like `"tenant.created"`, `"cron.daily"`, etc.

### Fact 6: Migration Transaction Model
**Confirmed:** `migrate.mjs` wraps each migration in `BEGIN` / `COMMIT` / `ROLLBACK`. Migration files must NOT include their own transaction wrappers. They are run atomically by the script.

### Fact 7: SysAdmin Page Pattern
**Confirmed:** Two patterns exist:
- List pages: server component that fetches + passes to client component (react-table or inline table)
- Create pages: separate route (`/billing/new`) with a client-component form
- No modal-based CRUD in existing admin portal — use separate pages for new/edit
- Admin nav links are hardcoded in `apps/web/src/app/(admin)/layout.tsx`

### Fact 8: Admin Auth Pattern
**Confirmed:** `requireAdminAccess()` in server actions calls `requireAuth()` + `isSystemAdmin()` from `@/lib/auth/supabase`. The layout already redirects non-admins but server actions must also validate (defense in depth).

### Fact 9: validation Package Does Not Have Onboarding Schemas
**Confirmed:** `packages/validation/src/index.ts` exports customer, document, driver, expense, invoice, load, maintenance, notification, payment, payroll, route, tag, truck, workflows. No onboarding/plan/promo schemas yet.
**Action:** New validation schemas for Plans and Promos belong in `apps/web/src/lib/validations/` (local, per-feature), consistent with how the spec describes it (section 5.3). Do not add to the shared packages/validation for Phase A — that's a Phase B+ concern.

### Fact 10: Tenant.plan Legacy Column
**Confirmed:** `Tenant.plan String @default("starter")` exists and is used in `updateTenantSettings` action. The new `Plan` model coexists. Do NOT remove the legacy `plan` string column in this phase — the SysAdmin "Update Tenant Settings" form currently writes to it.

### Fact 11: Existing migrations use two FK patterns
**Old pattern** (from `20260226000002`): `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;`
**Newer pattern** (from `20260424120001`): `IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '...')` block
Both are acceptable. Use the `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` pattern consistently since it's shorter and used throughout.

---

## State of the Art

| Old Approach | Current Approach | Impact |
|--------------|------------------|--------|
| `migrations/` at web root | `prisma/migrations/<dir>/migration.sql` | All migrations must go in the prisma subdirectory |
| Inline BEGIN/COMMIT | migrate.mjs wraps transactions | Never add BEGIN/COMMIT in migration.sql |
| Prisma migrate dev | migrate.mjs custom script | Use the custom script; it tracks applied migrations in `_prisma_migrations` |

---

## Open Questions

1. **fleetSizeBucket nullability for existing tenants**
   - What we know: Existing Tenant rows have no fleetSizeBucket value
   - What's unclear: Should the column be nullable (existing tenants get NULL) or have a DEFAULT?
   - Recommendation: Add as `NULLABLE` — existing tenants represent manually-created SysAdmin tenants, not self-signup tenants. NULL is semantically correct. Schema.prisma field: `fleetSizeBucket FleetSizeBucket?`

2. **Tenant.status column vs. Tenant.isActive**
   - What we know: `isActive` already exists and is used in suspend/reactivate flows. The new `status` enum covers `TRIAL, ACTIVE, PAST_DUE, SUSPENDED, CANCELLED`.
   - What's unclear: When a tenant is suspended via `suspendTenant()`, does the new `status` field also update?
   - Recommendation: For Phase A (DDL only), add `status` column with DEFAULT 'ACTIVE' for existing tenants (they are active). Phase B signup sets status = TRIAL. SysAdmin suspend/reactivate actions updating both `isActive` and `status` is a Phase D concern.

3. **AutomationRun.ruleId FK — delete behavior**
   - What we know: AutomationRun references AutomationRule.id
   - What's unclear: Should deleting an AutomationRule cascade-delete its runs (losing audit trail) or restrict?
   - Recommendation: `ON DELETE SET NULL` — preserve audit history even if rule is deleted. Make `ruleId` nullable in AutomationRun.

4. **Plans create page vs. modal**
   - What we know: billing/new uses a separate page; billing/[id] uses separate page too
   - Recommendation: Use separate `/plans/new` page consistent with billing pattern, not a modal

---

## Sources

### Primary (HIGH confidence)
- `apps/web/prisma/schema.prisma` — full current schema, all existing enums and models verified
- `apps/web/scripts/migrate.mjs` — migration system fully read, paths confirmed
- `apps/web/prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql` — RLS pattern source of truth
- `apps/web/prisma/migrations/20260424120001_workflow_engine_automation/migration.sql` — recent FK pattern
- `apps/web/prisma/migrations/20260428100001_add_playbook_instance_triggered_by/migration.sql` — most recent migration
- `apps/web/src/app/(admin)/actions/tenants.ts` — server action pattern, admin auth pattern
- `apps/web/src/app/(admin)/tenants/page.tsx` and `tenant-list-client.tsx` — list page pattern
- `apps/web/src/app/(admin)/billing/page.tsx` and `billing/new/page.tsx` — create page pattern
- `apps/web/src/app/(admin)/layout.tsx` — nav structure, must be updated for new links
- `packages/validation/src/index.ts` — confirmed no onboarding schemas exist yet
- `docs/specs/tenant-self-onboarding/01-TECHNICAL-SPEC.md` — spec sections 4, 7.4 read in full

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all dependencies already in project
- Architecture: HIGH — all patterns directly read from codebase
- Pitfalls: HIGH — sourced from reading actual files, not assumptions
- Migration system: HIGH — migrate.mjs read in full
- RLS patterns: HIGH — exact SQL copied from existing migration

**Research date:** 2026-04-29
**Valid until:** 2026-05-29 (stable — patterns won't change)
