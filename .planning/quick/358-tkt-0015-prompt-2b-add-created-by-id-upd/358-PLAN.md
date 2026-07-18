---
phase: quick
plan: 358
type: execute
wave: 1
depends_on: [quick-354, quick-356, quick-357]
autonomous: false
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave1_smoke/migration.sql
  - apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave2_fleet/migration.sql
  - apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave3_finance_crm/migration.sql
  - apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave4_driver_pay/migration.sql
  - apps/web/src/lib/db/extensions/audit-columns.ts
  - apps/web/src/lib/db/tenant-client.ts

must_haves:
  truths:
    - "Every target table from QT 354 has the appropriate audit FK columns (camelCase: createdById/updatedById; snake_case: created_by_id/updated_by_id) added as nullable with ON DELETE SET NULL"
    - "FleetMessage receives created_by_id only (no updated_by_id — messages are immutable)"
    - "Tag and ExpenseCategory smoke test passes before any other tables are touched"
    - "withAuditColumns(userId) Prisma extension exists, injects audit FKs on create/update/upsert, and composes with withTenantRLS"
    - "createTenantClient now wires both extensions: RLS first, then audit columns"
    - "Legacy rows remain NULL — no historical backfill is performed"
    - "npx tsc --noEmit exits 0 after every wave"
    - "Driver-pay tenant isolation tests pass after every wave"
    - "5 already-complete tables (Truck, Route, Load, Invoice, PayrollRecord) are NOT modified"
    - "Each wave commits its own atomic migration + schema change and STOPS for user confirmation before the next wave"
  artifacts:
    - path: "apps/web/src/lib/db/extensions/audit-columns.ts"
      provides: "withAuditColumns(userId) Prisma extension"
      exports: ["withAuditColumns"]
    - path: "apps/web/src/lib/db/tenant-client.ts"
      provides: "createTenantClient composing RLS + audit-columns extensions"
      exports: ["createTenantClient"]
    - path: "apps/web/prisma/schema.prisma"
      provides: "audit FK fields + named User relations on ~37 tenant-scoped models"
    - path: "apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave1_smoke/migration.sql"
      provides: "Wave 1 DDL: Tag + ExpenseCategory audit columns"
    - path: "apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave2_fleet/migration.sql"
      provides: "Wave 2 DDL: fleet/operations audit columns"
    - path: "apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave3_finance_crm/migration.sql"
      provides: "Wave 3 DDL: finance/CRM/compliance audit columns"
    - path: "apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave4_driver_pay/migration.sql"
      provides: "Wave 4 DDL: driver-pay remaining audit columns + final SUMMARY"
  key_links:
    - from: "apps/web/src/lib/db/tenant-client.ts"
      to: "apps/web/src/lib/db/extensions/audit-columns.ts"
      via: "prisma.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId))"
      pattern: "withAuditColumns\\("
    - from: "apps/web/src/lib/db/extensions/audit-columns.ts"
      to: "Prisma $allOperations on $allModels"
      via: "query.$allModels.$allOperations injection of createdById/updatedById"
      pattern: "createdById|created_by_id"
---

<objective>
Add nullable audit FK columns (createdById/updatedById for camelCase; created_by_id/updated_by_id for snake_case) to ~37 tenant-scoped tables identified in QT 354, and build a composable withAuditColumns(userId) Prisma extension that auto-injects these FKs on create/update/upsert operations.

This is the second half of TKT-0015 Prompt 2 (DB layer for the audit trail). Prompt 2a (QT 356) cleaned up legacy audit columns and made them nullable. QT 357 fixed downstream TypeScript widening. Now Prompt 2b adds the NEW audit columns across the target table set and ships the extension that will be wired to the request session in Prompt 3.

Purpose: Make every tenant-scoped write capable of carrying a who-created / who-last-updated identity so downstream audit-trail consumers (Prompt 3 auto-capture middleware, Prompt 4 detail-page UI) have the data to surface.

Output: 4 atomic migrations, schema.prisma edits, withAuditColumns extension, updated tenant-client composing both extensions, final SUMMARY.md.

**EXECUTION RULE — READ CAREFULLY:**
This plan is structured as 4 waves. Each wave is a separate task with a `checkpoint:human-verify` STOP gate at the end. After completing a wave's work and verifications, the executor MUST pause and wait for the user to type "approved" (or describe issues) before starting the next wave. Do NOT chain waves. Do NOT skip the STOP gates.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@.planning/quick/354-audit-audit-column-coverage-and-detail-p/354-SUMMARY.md
@.planning/quick/356-tkt-0015-prompt-2a-pre-flight-schema-cle/356-SUMMARY.md
@.planning/quick/357-fix-typescript-breakages-from-quick-task/357-SUMMARY.md
@apps/web/src/lib/db/extensions/tenant-rls.ts
@apps/web/src/lib/db/tenant-client.ts
@apps/web/src/lib/db/prisma.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/prisma/schema.prisma
</context>

<global_constraints>

**Locked decisions (do NOT revisit):**
- Nullable columns only. NO `NOT NULL`. NO historical backfill.
- ON DELETE SET NULL on both audit FKs (consistent with QT 356).
- Casing per table convention:
  - camelCase Prisma models (no `@@map`) → `createdById` / `updatedById` (Postgres column names match field names).
  - snake_case Prisma models (with `@@map(...)` and field-level `@map(...)`) → Prisma fields `createdById` / `updatedById` with `@map("created_by_id")` / `@map("updated_by_id")`.
- Named User relations. Every new audit FK must use a unique `name:` argument on `@relation` (e.g. `name: "TagCreatedBy"`, `name: "CarrierClientCreatedBy"`). User-side: add matching reverse relation arrays. Failing to name relations causes Prisma schema validation errors.

**Out of scope — DO NOT TOUCH:**
- Truck, Route, Load, Invoice, PayrollRecord — already have full audit FKs.
- Tenant model — system-provisioned, no user actor.
- withTenantRLS extension at `apps/web/src/lib/db/extensions/tenant-rls.ts` — do not modify.
- UI, API routes, server actions, business logic — Prompt 3 will wire auto-capture, Prompt 4 will surface in UI. This task is schema + extension only.
- Document model — has `uploadedBy` already (per QT 354 Flag 2 recommendation, skip). BUT add `createdById`/`updatedById` per the wave plan below — Prompt 1 owner's decision (audit trail uniformity). Re-read carefully: the wave list below includes Document with `created_by_id` ONLY. Honor that list verbatim.
- FleetMessage — has `senderId` but per the wave list below it receives `created_by_id` ONLY (no `updated_by_id` — messages are immutable). Honor that.

**Forbidden tokens:**
- `as any`
- `@ts-ignore` / `@ts-expect-error`
- `eslint-disable`
- Type widening pattern from QT 357 (`string | null`) is acceptable when needed.

**Migration policy:**
- DO NOT run `prisma migrate deploy`. Use the Supabase MCP `apply_migration` tool (or `mcp__supabase__apply_migration`) to push DDL to live DB.
- Write the migration SQL file under `apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave<N>_<suffix>/migration.sql` BEFORE applying.
- Use `ADD COLUMN IF NOT EXISTS` for idempotency.
- Use `ADD CONSTRAINT IF NOT EXISTS` is not valid SQL — guard FK adds with the standard pattern:
  ```sql
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE constraint_name = '<constraint_name>' AND table_name = '<table>'
    ) THEN
      ALTER TABLE "<table>" ADD CONSTRAINT "<constraint_name>"
        FOREIGN KEY ("<col>") REFERENCES "User"(id) ON DELETE SET NULL;
    END IF;
  END $$;
  ```
- Constraint naming: `<TableName>_createdById_fkey` for camelCase tables; `<table_name>_created_by_id_fkey` for snake_case tables.
- After applying each migration: regenerate Prisma client (`npx prisma generate` from `apps/web/`) so types reflect new fields.

**Verification per wave (mandatory):**
1. `npx prisma validate` from `apps/web/` exits 0.
2. `npx prisma generate` from `apps/web/` exits 0.
3. `npx tsc --noEmit` from `apps/web/` exits 0.
4. `npm test -- driver-pay-tenant-isolation` (or run the isolation test file at `apps/web/src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts`) — all isolation assertions still pass.
5. Live DB check via Supabase MCP: for each table touched in the wave, run `SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = '<table>' AND column_name IN ('createdById','updatedById','created_by_id','updated_by_id')` — confirm columns exist and are nullable.
6. Live DB check via Supabase MCP: for each FK added, run `SELECT constraint_name, delete_rule FROM information_schema.referential_constraints rc JOIN information_schema.key_column_usage kcu USING (constraint_name) WHERE table_name = '<table>' AND column_name IN (...)` — confirm `delete_rule = 'SET NULL'`.
7. Commit the wave with message `feat(quick-358): TKT-0015 Prompt 2b — Wave <N> <suffix>`.

</global_constraints>

<tasks>

<task type="auto">
  <name>Wave 1 — Smoke test: Tag + ExpenseCategory + withAuditColumns extension</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/&lt;timestamp&gt;_tkt0015_2b_wave1_smoke/migration.sql
    apps/web/src/lib/db/extensions/audit-columns.ts
    apps/web/src/lib/db/tenant-client.ts
  </files>
  <action>
    Goal: Prove the end-to-end pipeline on 2 low-risk tables BEFORE rolling out broadly.

    **Step 1 — schema.prisma edits (camelCase pattern):**

    Tag model (around line 658):
    ```prisma
    model Tag {
      id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      tenantId    String   @db.Uuid
      name        String
      color       String   @default("#3b82f6")
      createdById String?  @db.Uuid                       // NEW
      updatedById String?  @db.Uuid                       // NEW
      createdAt   DateTime @default(now()) @db.Timestamptz
      updatedAt   DateTime @updatedAt @db.Timestamptz

      tenant      Tenant          @relation(fields: [tenantId], references: [id])
      createdBy   User?           @relation(name: "TagCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)  // NEW
      updatedBy   User?           @relation(name: "TagUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)  // NEW
      assignments TagAssignment[]

      @@unique([tenantId, name])
      @@index([tenantId])
    }
    ```

    ExpenseCategory model (around line 694):
    ```prisma
    model ExpenseCategory {
      id              String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
      tenantId        String   @db.Uuid
      name            String
      isSystemDefault Boolean  @default(false)
      createdById     String?  @db.Uuid                       // NEW
      updatedById     String?  @db.Uuid                       // NEW
      createdAt       DateTime @default(now()) @db.Timestamptz
      updatedAt       DateTime @updatedAt @db.Timestamptz

      tenant        Tenant                @relation(fields: [tenantId], references: [id])
      createdBy     User?                 @relation(name: "ExpenseCategoryCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)  // NEW
      updatedBy     User?                 @relation(name: "ExpenseCategoryUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)  // NEW
      expenses      RouteExpense[]
      templateItems ExpenseTemplateItem[]

      @@unique([tenantId, name])
      @@index([tenantId])
    }
    ```

    User model — add 4 reverse relation arrays (locate the existing audit reverse-relation block around line 260-270):
    ```prisma
      tagsCreated              Tag[]              @relation(name: "TagCreatedBy")              // NEW
      tagsUpdated              Tag[]              @relation(name: "TagUpdatedBy")              // NEW
      expenseCategoriesCreated ExpenseCategory[]  @relation(name: "ExpenseCategoryCreatedBy")  // NEW
      expenseCategoriesUpdated ExpenseCategory[]  @relation(name: "ExpenseCategoryUpdatedBy")  // NEW
    ```

    Run `npx prisma validate` from `apps/web/`. MUST exit 0 before continuing.

    **Step 2 — Write migration SQL:**

    Create `apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave1_smoke/migration.sql`. Use a real timestamp (UTC, format YYYYMMDDHHMMSS). Contents:
    ```sql
    -- TKT-0015 Prompt 2b — Wave 1 Smoke Test
    -- Tag + ExpenseCategory audit FKs (nullable, ON DELETE SET NULL)

    ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "createdById" UUID;
    ALTER TABLE "Tag" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Tag_createdById_fkey' AND table_name = 'Tag'
      ) THEN
        ALTER TABLE "Tag" ADD CONSTRAINT "Tag_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'Tag_updatedById_fkey' AND table_name = 'Tag'
      ) THEN
        ALTER TABLE "Tag" ADD CONSTRAINT "Tag_updatedById_fkey"
          FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;
    END $$;

    ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "createdById" UUID;
    ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "updatedById" UUID;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'ExpenseCategory_createdById_fkey' AND table_name = 'ExpenseCategory'
      ) THEN
        ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_createdById_fkey"
          FOREIGN KEY ("createdById") REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'ExpenseCategory_updatedById_fkey' AND table_name = 'ExpenseCategory'
      ) THEN
        ALTER TABLE "ExpenseCategory" ADD CONSTRAINT "ExpenseCategory_updatedById_fkey"
          FOREIGN KEY ("updatedById") REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;
    END $$;
    ```

    Apply via Supabase MCP `apply_migration` with name `tkt0015_2b_wave1_smoke`. DO NOT run `prisma migrate deploy`.

    **Step 3 — Build withAuditColumns extension:**

    Create `apps/web/src/lib/db/extensions/audit-columns.ts`:

    ```ts
    import { Prisma } from '../../../generated/prisma/client';

    /**
     * Prisma Client Extension — Audit Column Injection (TKT-0015 Prompt 2b)
     *
     * Auto-injects createdById / updatedById (camelCase) or created_by_id / updated_by_id
     * (snake_case) onto every write operation on tenant-scoped models.
     *
     * COMPOSITION ORDER:
     *   client.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId))
     * RLS first (injects tenantId), audit second (injects user FKs). This order keeps
     * tenant isolation as the outer-most guarantee.
     *
     * BEHAVIOUR:
     *   - create / createMany / createManyAndReturn:
     *       if args.data.{createdBy*Field} is missing AND userId is non-null → inject it.
     *       same rule for updatedBy*Field (initial value on create).
     *   - update / updateMany:
     *       if args.data.{updatedBy*Field} is missing AND userId is non-null → inject it.
     *       NEVER touch createdBy*Field on update.
     *   - upsert:
     *       on create branch: inject both createdBy* and updatedBy* (same rule as create).
     *       on update branch: inject updatedBy* only.
     *   - read / delete operations: pass through untouched.
     *
     * USERID NULL HANDLING:
     *   - When userId is null (e.g. system cron jobs, anonymous flows, seeding):
     *       extension performs NO injection. Caller may pass explicit value in args.data.
     *   - Caller-supplied value (args.data already has the field) is always preserved.
     *
     * CASING DETECTION:
     *   - Each model is classified by inspecting whether its mapped DB table is snake_case.
     *     Use the SNAKE_CASE_MODELS set below (mirrors @@map'd Prisma models from QT 354).
     *   - camelCase models → fields createdById, updatedById
     *   - snake_case models → fields createdById, updatedById in Prisma (with @map),
     *     but the INJECTED key name in args.data still uses the Prisma field name
     *     (Prisma maps it to the snake_case column automatically). So in practice the
     *     extension can inject 'createdById' / 'updatedById' uniformly for all models that
     *     follow Prisma convention. The QT 358 schema MUST use Prisma field name
     *     createdById/updatedById for ALL models (only the @map'd column name differs).
     *   - EXCEPTION — FleetMessage: skip updatedById injection entirely (immutable msgs).
     *   - EXCEPTION — models without these fields (system tables, append-only logs):
     *     use the EXEMPT_AUDIT_MODELS set below to pass through without injection.
     *
     * NOTE ON UNIFORM FIELD NAMES:
     *   All ~37 new audit fields in QT 358 use Prisma field names createdById / updatedById,
     *   regardless of DB casing. snake_case models use @map to translate at the column
     *   level. This means the extension never needs runtime casing branches for the
     *   field-name layer — it can blindly write data.createdById and data.updatedById.
     */

    // Models that participate in audit-column injection but have a quirk:
    // FleetMessage: created-only (no updatedBy injection ever).
    const CREATE_ONLY_AUDIT_MODELS = new Set([
      'FleetMessage',
    ]);

    // Models that do NOT have createdById / updatedById fields after QT 358.
    // The extension must pass these through without attempting injection.
    // Build this set conservatively — start with the EXEMPT_MODELS from withTenantRLS
    // plus append-only/system models from QT 354 Section 5.
    const EXEMPT_AUDIT_MODELS = new Set([
      'Tenant',
      'TicketMessage',
      'AuditLog',
      'DriverPayAuditLog',
      'DispatchOverrideAudit',
      'NotificationLog',
      'NotificationSendLog',
      'AutomationRun',
      'AppEvent',
      'PlaybookNotification',
      'GPSLocation',
      'GpsReport',
      'SafetyEvent',
      'FuelRecord',
      'ActivationProgress',
      'TenantHealthScore',
      'TenantMetricsDaily',
      'Subscription',
      'TagAssignment',
      'DriverRouteJoin',
      // Add others as the wave rollout decides — keep this conservative.
      // The 5 already-complete tables (Truck, Route, Load, Invoice, PayrollRecord)
      // also have createdById/updatedById, so injection works on them too — they
      // should NOT be in this set.
    ]);

    export function withAuditColumns(userId: string | null) {
      return Prisma.defineExtension((client) =>
        client.$extends({
          query: {
            $allModels: {
              async $allOperations({ operation, model, args, query }) {
                // No session user → never inject (caller supplies explicitly if needed).
                if (userId == null) {
                  return query(args);
                }

                if (EXEMPT_AUDIT_MODELS.has(model ?? '')) {
                  return query(args);
                }

                const a = args as Record<string, unknown>;
                const createOnly = CREATE_ONLY_AUDIT_MODELS.has(model ?? '');

                const injectOnData = (
                  data: Record<string, unknown>,
                  fields: Array<'createdById' | 'updatedById'>,
                ): Record<string, unknown> => {
                  const next: Record<string, unknown> = { ...data };
                  for (const f of fields) {
                    if (next[f] === undefined) {
                      next[f] = userId;
                    }
                  }
                  return next;
                };

                switch (operation) {
                  case 'create': {
                    const data = (a.data ?? {}) as Record<string, unknown>;
                    const fields: Array<'createdById' | 'updatedById'> = createOnly
                      ? ['createdById']
                      : ['createdById', 'updatedById'];
                    a.data = injectOnData(data, fields);
                    break;
                  }

                  case 'createMany':
                  case 'createManyAndReturn': {
                    const data = a.data;
                    const fields: Array<'createdById' | 'updatedById'> = createOnly
                      ? ['createdById']
                      : ['createdById', 'updatedById'];
                    if (Array.isArray(data)) {
                      a.data = data.map((item) =>
                        injectOnData(item as Record<string, unknown>, fields),
                      );
                    } else if (data && typeof data === 'object') {
                      a.data = injectOnData(data as Record<string, unknown>, fields);
                    }
                    break;
                  }

                  case 'update': {
                    if (createOnly) break;
                    const data = (a.data ?? {}) as Record<string, unknown>;
                    a.data = injectOnData(data, ['updatedById']);
                    break;
                  }

                  case 'updateMany': {
                    if (createOnly) break;
                    const data = (a.data ?? {}) as Record<string, unknown>;
                    a.data = injectOnData(data, ['updatedById']);
                    break;
                  }

                  case 'upsert': {
                    const createData = (a.create ?? {}) as Record<string, unknown>;
                    const updateData = (a.update ?? {}) as Record<string, unknown>;
                    const createFields: Array<'createdById' | 'updatedById'> = createOnly
                      ? ['createdById']
                      : ['createdById', 'updatedById'];
                    a.create = injectOnData(createData, createFields);
                    if (!createOnly) {
                      a.update = injectOnData(updateData, ['updatedById']);
                    }
                    break;
                  }

                  default:
                    // findMany / findUnique / delete / aggregate / etc. — pass through.
                    return query(args);
                }

                return query(args);
              },
            },
          },
        }),
      );
    }
    ```

    **Step 4 — Update tenant-client.ts to compose both extensions:**

    Modify `apps/web/src/lib/db/tenant-client.ts` to accept optional userId and compose audit:

    ```ts
    import { PrismaClient } from '../../generated/prisma/client';
    import { prisma } from './prisma';
    import { withTenantRLS } from './extensions/tenant-rls';
    import { withAuditColumns } from './extensions/audit-columns';

    /**
     * Create a tenant-scoped Prisma client with full type inference + audit-column injection.
     *
     * Composition order:
     *   1. withTenantRLS(tenantId)  — injects tenantId on every read/write (outer guarantee).
     *   2. withAuditColumns(userId) — injects createdById/updatedById on writes.
     *
     * If userId is null/undefined (e.g. system contexts), audit injection is a no-op
     * and callers may still provide explicit createdById/updatedById in args.data.
     *
     * The double cast back to PrismaClient is required for the same reason documented
     * in the original file: Prisma 7's $extends loses model-level type inference, but
     * neither extension changes the API surface (both are query-layer interceptors).
     */
    export function createTenantClient(tenantId: string, userId?: string | null): PrismaClient {
      return prisma
        .$extends(withTenantRLS(tenantId))
        .$extends(withAuditColumns(userId ?? null)) as unknown as PrismaClient;
    }
    ```

    NOTE: This change to `createTenantClient` signature is BACKWARDS COMPATIBLE — `userId` is optional and defaults to null (no injection). Prompt 3 will wire the actual session userId at the call site.

    **Step 5 — Verifications:**

    Run from `apps/web/`:
    - `npx prisma validate` → must exit 0
    - `npx prisma generate` → must exit 0
    - `npx tsc --noEmit` → must exit 0
    - Run isolation tests: `npx vitest run src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` → all pass

    Then via Supabase MCP, run:
    ```sql
    SELECT table_name, column_name, is_nullable
    FROM information_schema.columns
    WHERE table_name IN ('Tag','ExpenseCategory')
      AND column_name IN ('createdById','updatedById')
    ORDER BY table_name, column_name;
    ```
    → must return 4 rows, all `is_nullable = YES`.

    ```sql
    SELECT tc.constraint_name, rc.delete_rule
    FROM information_schema.table_constraints tc
    JOIN information_schema.referential_constraints rc USING (constraint_name)
    WHERE tc.table_name IN ('Tag','ExpenseCategory')
      AND tc.constraint_name LIKE '%createdById_fkey' OR tc.constraint_name LIKE '%updatedById_fkey';
    ```
    → must show 4 constraints with `delete_rule = 'SET NULL'`.

    **Step 6 — Commit:**

    Stage and commit ONLY:
    - apps/web/prisma/schema.prisma
    - apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave1_smoke/migration.sql
    - apps/web/src/lib/db/extensions/audit-columns.ts
    - apps/web/src/lib/db/tenant-client.ts
    - apps/web/src/generated/prisma/** (regenerated client, if tracked)

    Commit message:
    ```
    feat(quick-358): TKT-0015 Prompt 2b Wave 1 — smoke test Tag+ExpenseCategory and add withAuditColumns extension
    ```
  </action>
  <verify>
    1. `npx prisma validate` exits 0
    2. `npx prisma generate` exits 0
    3. `npx tsc --noEmit` exits 0
    4. Isolation tests pass
    5. DB column inspection returns 4 nullable audit columns on Tag + ExpenseCategory
    6. FK delete_rule check returns 4 SET NULL constraints
    7. `audit-columns.ts` exists at the documented path and exports `withAuditColumns`
    8. `tenant-client.ts` composes both extensions
    9. Git log shows commit `feat(quick-358): ... Wave 1`
  </verify>
  <done>
    Wave 1 succeeds: 2 tables migrated, extension built and composed, all verifications green, commit landed.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>STOP — Wave 1 user confirmation</name>
  <what-built>
    Wave 1 complete: Tag and ExpenseCategory have new nullable audit FK columns with ON DELETE SET NULL. The `withAuditColumns(userId)` Prisma extension is built and composed with `withTenantRLS` in `createTenantClient`. All verifications passed.
  </what-built>
  <how-to-verify>
    1. Inspect the diff: `git show HEAD` — confirm only schema.prisma, the wave1 migration.sql, audit-columns.ts, tenant-client.ts (and generated client) are in the commit.
    2. Run `cd apps/web && npx tsc --noEmit` locally → exits 0.
    3. (Optional spot check) Inspect Tag and ExpenseCategory in Supabase dashboard → confirm the 4 new columns and 4 FK constraints.
    4. Read `apps/web/src/lib/db/extensions/audit-columns.ts` and confirm the inject logic matches your expectations (especially the FleetMessage create-only carve-out and EXEMPT_AUDIT_MODELS set).
  </how-to-verify>
  <resume-signal>Type "approved" to proceed to Wave 2 (fleet domain). Or describe any issues with the smoke test before continuing.</resume-signal>
</task>

<task type="auto">
  <name>Wave 2 — Fleet domain: 11 tables (CarrierDriver/Truck/Facility/Client/Contract/Dispatch/Stop/Load/Expense + Document + FleetMessage)</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/&lt;timestamp&gt;_tkt0015_2b_wave2_fleet/migration.sql
  </files>
  <action>
    Goal: Roll the now-proven pattern across the carrier-operations / fleet-domain tables.

    **Tables in scope (11 total):**

    | Prisma Model | DB Table | Casing | Columns to Add |
    |---|---|---|---|
    | CarrierDriver | carrier_drivers | snake_case | created_by_id, updated_by_id |
    | CarrierTruck | carrier_trucks | snake_case | created_by_id, updated_by_id |
    | CarrierFacility | facilities | snake_case | created_by_id, updated_by_id |
    | CarrierClient | clients | snake_case | created_by_id, updated_by_id |
    | CarrierContract | contracts | snake_case | created_by_id, updated_by_id |
    | CarrierDispatch | dispatches | snake_case | created_by_id, updated_by_id |
    | CarrierStop | stops | snake_case | created_by_id, updated_by_id |
    | CarrierLoad | loads (carrier) | snake_case | created_by_id, updated_by_id |
    | CarrierExpense | carrier_expenses | snake_case | created_by_id, updated_by_id |
    | Document | Document | camelCase | createdById, updatedById |
    | FleetMessage | FleetMessage | camelCase | **createdById ONLY (no updatedById)** |

    **Step 1 — schema.prisma edits:**

    For each snake_case model, add the FK fields with `@map`:
    ```prisma
    // Example: CarrierClient
    createdById String?  @map("created_by_id") @db.Uuid    // NEW
    updatedById String?  @map("updated_by_id") @db.Uuid    // NEW

    // (in the relations section)
    createdBy   User?    @relation(name: "CarrierClientCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)  // NEW
    updatedBy   User?    @relation(name: "CarrierClientUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)  // NEW
    ```

    Use these unique relation names (one createdBy + one updatedBy per model, EXCEPT FleetMessage which gets createdBy only):
    - CarrierDriverCreatedBy / CarrierDriverUpdatedBy
    - CarrierTruckCreatedBy / CarrierTruckUpdatedBy
    - CarrierFacilityCreatedBy / CarrierFacilityUpdatedBy
    - CarrierClientCreatedBy / CarrierClientUpdatedBy
    - CarrierContractCreatedBy / CarrierContractUpdatedBy
    - CarrierDispatchCreatedBy / CarrierDispatchUpdatedBy
    - CarrierStopCreatedBy / CarrierStopUpdatedBy
    - CarrierLoadCreatedBy / CarrierLoadUpdatedBy
    - CarrierExpenseCreatedBy / CarrierExpenseUpdatedBy
    - DocumentCreatedBy / DocumentUpdatedBy  (camelCase pattern, no @map)
    - FleetMessageCreatedBy  (createdById only, no updatedBy* on this model)

    For Document (camelCase) — preserve existing `uploadedBy` field and its `uploader` relation, just add the new audit FK pair alongside.

    For FleetMessage (camelCase) — preserve existing `senderId` and its `sender` relation, add ONLY `createdById` + `createdBy` relation. Do NOT add `updatedById`.

    **User model — add 21 reverse relation arrays** (locate the existing audit-relations block):
    ```prisma
      carrierDriversCreated    CarrierDriver[]   @relation(name: "CarrierDriverCreatedBy")
      carrierDriversUpdated    CarrierDriver[]   @relation(name: "CarrierDriverUpdatedBy")
      carrierTrucksCreated     CarrierTruck[]    @relation(name: "CarrierTruckCreatedBy")
      carrierTrucksUpdated     CarrierTruck[]    @relation(name: "CarrierTruckUpdatedBy")
      carrierFacilitiesCreated CarrierFacility[] @relation(name: "CarrierFacilityCreatedBy")
      carrierFacilitiesUpdated CarrierFacility[] @relation(name: "CarrierFacilityUpdatedBy")
      carrierClientsCreated    CarrierClient[]   @relation(name: "CarrierClientCreatedBy")
      carrierClientsUpdated    CarrierClient[]   @relation(name: "CarrierClientUpdatedBy")
      carrierContractsCreated  CarrierContract[] @relation(name: "CarrierContractCreatedBy")
      carrierContractsUpdated  CarrierContract[] @relation(name: "CarrierContractUpdatedBy")
      carrierDispatchesCreated CarrierDispatch[] @relation(name: "CarrierDispatchCreatedBy")
      carrierDispatchesUpdated CarrierDispatch[] @relation(name: "CarrierDispatchUpdatedBy")
      carrierStopsCreated      CarrierStop[]     @relation(name: "CarrierStopCreatedBy")
      carrierStopsUpdated      CarrierStop[]     @relation(name: "CarrierStopUpdatedBy")
      carrierLoadsCreated      CarrierLoad[]     @relation(name: "CarrierLoadCreatedBy")
      carrierLoadsUpdated      CarrierLoad[]     @relation(name: "CarrierLoadUpdatedBy")
      carrierExpensesCreated   CarrierExpense[]  @relation(name: "CarrierExpenseCreatedBy")
      carrierExpensesUpdated   CarrierExpense[]  @relation(name: "CarrierExpenseUpdatedBy")
      documentsCreated         Document[]        @relation(name: "DocumentCreatedBy")
      documentsUpdated         Document[]        @relation(name: "DocumentUpdatedBy")
      fleetMessagesCreated     FleetMessage[]    @relation(name: "FleetMessageCreatedBy")
    ```

    Run `npx prisma validate`. MUST exit 0.

    **Step 2 — Migration SQL:**

    Create `apps/web/prisma/migrations/<timestamp>_tkt0015_2b_wave2_fleet/migration.sql`. For each snake_case table, follow this pattern (example for `clients`):
    ```sql
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS created_by_id UUID;
    ALTER TABLE clients ADD COLUMN IF NOT EXISTS updated_by_id UUID;

    DO $$
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'clients_created_by_id_fkey' AND table_name = 'clients'
      ) THEN
        ALTER TABLE clients ADD CONSTRAINT clients_created_by_id_fkey
          FOREIGN KEY (created_by_id) REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;

      IF NOT EXISTS (
        SELECT 1 FROM information_schema.table_constraints
        WHERE constraint_name = 'clients_updated_by_id_fkey' AND table_name = 'clients'
      ) THEN
        ALTER TABLE clients ADD CONSTRAINT clients_updated_by_id_fkey
          FOREIGN KEY (updated_by_id) REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;
    END $$;
    ```

    Repeat for: `carrier_drivers`, `carrier_trucks`, `facilities`, `contracts`, `dispatches`, `stops`, `loads` (carrier — note `loads` is the carrier-operations table, NOT the legacy `Load` PascalCase table; double-check `@@map("loads")` is on CarrierLoad), `carrier_expenses`.

    For Document (camelCase):
    ```sql
    ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "createdById" UUID;
    ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "updatedById" UUID;
    -- FK guards using Document_createdById_fkey and Document_updatedById_fkey
    ```

    For FleetMessage (camelCase, createdById ONLY):
    ```sql
    ALTER TABLE "FleetMessage" ADD COLUMN IF NOT EXISTS "createdById" UUID;
    -- ONLY ONE FK guard: FleetMessage_createdById_fkey. Do NOT add updatedById.
    ```

    Apply via Supabase MCP `apply_migration` with name `tkt0015_2b_wave2_fleet`.

    **Step 3 — Verifications (same protocol as Wave 1):**

    - `npx prisma validate` → 0
    - `npx prisma generate` → 0
    - `npx tsc --noEmit` → 0 (no type widening should be necessary — only NEW nullable fields, no existing columns changed)
    - Isolation tests pass
    - DB inspection per table:
      ```sql
      SELECT table_name, column_name, is_nullable
      FROM information_schema.columns
      WHERE (table_name IN ('clients','contracts','facilities','carrier_drivers','carrier_trucks',
                            'dispatches','stops','loads','carrier_expenses')
             AND column_name IN ('created_by_id','updated_by_id'))
         OR (table_name IN ('Document','FleetMessage')
             AND column_name IN ('createdById','updatedById'))
      ORDER BY table_name, column_name;
      ```
      → 9 snake_case tables × 2 cols = 18 rows + Document 2 rows + FleetMessage 1 row = **21 rows total**, all `is_nullable = YES`.

    - FK delete_rule check returns 21 SET NULL constraints (same arithmetic).

    **Step 4 — Commit:**

    Stage and commit ONLY the schema, migration, and regenerated Prisma client.

    Commit message:
    ```
    feat(quick-358): TKT-0015 Prompt 2b Wave 2 — fleet domain audit FKs (11 tables)
    ```

    **CRITICAL — DO NOT TOUCH:**
    - withAuditColumns extension or tenant-client (those landed in Wave 1).
    - Any tables outside the 11 listed above.
    - Any UI, API route, server action, or business logic.
  </action>
  <verify>
    1. prisma validate / generate / tsc --noEmit all exit 0
    2. Isolation tests pass
    3. DB column inspection: 21 new nullable audit columns across the 11 fleet tables
    4. FK delete_rule: 21 constraints SET NULL (10 created_by + 9 updated_by snake; FleetMessage has only created)
    5. Git log shows commit `feat(quick-358): ... Wave 2`
    6. `git diff HEAD~1 HEAD -- apps/web/src/lib/db/extensions/audit-columns.ts apps/web/src/lib/db/tenant-client.ts` returns empty (extension untouched in Wave 2)
  </verify>
  <done>
    Wave 2 succeeds: 11 fleet tables migrated, all verifications green, commit landed, extension untouched.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>STOP — Wave 2 user confirmation</name>
  <what-built>
    Wave 2 complete: 11 fleet-domain tables (9 snake_case carrier tables + Document + FleetMessage) have new nullable audit FK columns. FleetMessage has createdById ONLY (per immutability rule). Document keeps its uploadedBy field alongside new audit FKs.
  </what-built>
  <how-to-verify>
    1. Run `cd apps/web && npx tsc --noEmit` locally → exits 0.
    2. Spot check one snake_case table and one camelCase table in Supabase dashboard.
    3. Confirm FleetMessage has createdById but NOT updatedById in both schema.prisma and the live DB.
    4. Confirm `audit-columns.ts` and `tenant-client.ts` are unchanged from Wave 1 (no extension drift mid-rollout).
  </how-to-verify>
  <resume-signal>Type "approved" to proceed to Wave 3 (finance/CRM + compliance). Or describe issues.</resume-signal>
</task>

<task type="auto">
  <name>Wave 3 — Finance/CRM/compliance: ~12 tables</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/&lt;timestamp&gt;_tkt0015_2b_wave3_finance_crm/migration.sql
  </files>
  <action>
    Goal: Audit FKs on customer-facing finance and CRM tables plus compliance/notification settings.

    **Tables in scope (12 total — all camelCase except where noted):**

    | Prisma Model | DB Table | Casing | Notes |
    |---|---|---|---|
    | Customer | Customer | camelCase | createdById + updatedById |
    | CustomerInteraction | CustomerInteraction | camelCase | createdById + updatedById; note: existing bare `createdBy` UUID field (no FK) is from legacy proto-audit — leave it untouched in this wave, just add the new pair |
    | FuelRecord | FuelRecord | camelCase | createdById ONLY (no updatedAt, append-only) — same create-only rule as FleetMessage |
    | MaintenanceEvent | MaintenanceEvent | camelCase | createdById + updatedById |
    | ScheduledService | ScheduledService | camelCase | createdById + updatedById |
    | InvoiceItem | InvoiceItem | camelCase | First add createdAt/updatedAt (per QT 354 — missing all 4 columns), then audit FKs |
    | SysAdminInvoice | SysAdminInvoice | camelCase | createdById + updatedById |
    | RouteExpense | RouteExpense | camelCase | createdById + updatedById |
    | RoutePayment | RoutePayment | camelCase | createdById + updatedById |
    | RouteStop | RouteStop | camelCase | createdById + updatedById |
    | ExpenseTemplate | ExpenseTemplate | camelCase | createdById + updatedById |
    | TenantIntegration | TenantIntegration | camelCase | createdById + updatedById |
    | DriverHOSEntry | DriverHOSEntry | camelCase | createdById + updatedById |
    | DriverIncident | DriverIncident | camelCase | createdById + updatedById |

    Note: This wave hits 14 tables, slightly over the planning_context's "~12". The 14 are the natural finance + CRM + driver-compliance grouping. Acceptable.

    **InvoiceItem special handling (missing createdAt/updatedAt):**
    Add timestamps first, then audit FKs. Schema:
    ```prisma
    createdAt   DateTime @default(now()) @db.Timestamptz   // NEW
    updatedAt   DateTime @updatedAt @db.Timestamptz         // NEW
    createdById String?  @db.Uuid                          // NEW
    updatedById String?  @db.Uuid                          // NEW
    ```

    Migration SQL for InvoiceItem:
    ```sql
    ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now();
    ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "createdById" UUID;
    ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "updatedById" UUID;
    -- + 2 FK guards
    ```

    **FuelRecord create-only handling:**
    - Schema: only add `createdById String? @db.Uuid` + `createdBy` relation.
    - Migration: only add `createdById` + 1 FK guard.
    - Extension: add `'FuelRecord'` to `CREATE_ONLY_AUDIT_MODELS` set in `apps/web/src/lib/db/extensions/audit-columns.ts`. This is the ONLY extension edit allowed in this wave — purely to extend the create-only set.

    **Step 1 — Schema edits + reverse relation arrays on User.**

    Use named relations: `CustomerCreatedBy`, `CustomerUpdatedBy`, `CustomerInteractionCreatedBy`, `CustomerInteractionUpdatedBy`, `FuelRecordCreatedBy`, `MaintenanceEventCreatedBy`, `MaintenanceEventUpdatedBy`, `ScheduledServiceCreatedBy`, `ScheduledServiceUpdatedBy`, `InvoiceItemCreatedBy`, `InvoiceItemUpdatedBy`, `SysAdminInvoiceCreatedBy`, `SysAdminInvoiceUpdatedBy`, `RouteExpenseCreatedBy`, `RouteExpenseUpdatedBy`, `RoutePaymentCreatedBy`, `RoutePaymentUpdatedBy`, `RouteStopCreatedBy`, `RouteStopUpdatedBy`, `ExpenseTemplateCreatedBy`, `ExpenseTemplateUpdatedBy`, `TenantIntegrationCreatedBy`, `TenantIntegrationUpdatedBy`, `DriverHOSEntryCreatedBy`, `DriverHOSEntryUpdatedBy`, `DriverIncidentCreatedBy`, `DriverIncidentUpdatedBy`.

    Add 27 reverse relation arrays on User (13 pairs + FuelRecordCreatedBy single = 27).

    Run `npx prisma validate`. MUST exit 0.

    **Step 2 — Write migration SQL** with the same per-table `ALTER TABLE ADD COLUMN IF NOT EXISTS` + DO-block FK guard pattern. Apply via Supabase MCP `apply_migration` with name `tkt0015_2b_wave3_finance_crm`.

    **Step 3 — Extension edit (single targeted change):**

    Edit `apps/web/src/lib/db/extensions/audit-columns.ts`:
    ```ts
    const CREATE_ONLY_AUDIT_MODELS = new Set([
      'FleetMessage',
      'FuelRecord',     // NEW — added in Wave 3
    ]);
    ```

    **Step 4 — Verifications** (same protocol; expect 14 tables × varies = approximately 27 columns + 27 FKs, plus 2 timestamp columns on InvoiceItem).

    **Step 5 — Commit:**
    ```
    feat(quick-358): TKT-0015 Prompt 2b Wave 3 — finance/CRM/compliance audit FKs (14 tables)
    ```

    **CRITICAL — DO NOT TOUCH:**
    - tenant-client.ts (already composed in Wave 1).
    - withTenantRLS extension (forbidden).
    - Tables from Waves 1, 2, or 4.
    - UI / API / server actions.
  </action>
  <verify>
    1. prisma validate / generate / tsc --noEmit exit 0
    2. Isolation tests pass
    3. DB inspection: all 14 tables have correct audit columns (with InvoiceItem also gaining createdAt/updatedAt, FuelRecord only gaining createdById)
    4. FK delete_rule check returns SET NULL on every new constraint
    5. Git log shows Wave 3 commit
    6. Diff confirms ONLY schema.prisma, the wave3 migration, and audit-columns.ts (FuelRecord addition only) changed
  </verify>
  <done>
    Wave 3 succeeds: 14 finance/CRM/compliance tables migrated, FuelRecord registered as create-only, all verifications green.
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>STOP — Wave 3 user confirmation</name>
  <what-built>
    Wave 3 complete: 14 finance + CRM + driver-compliance tables now carry nullable audit FKs. InvoiceItem additionally gained createdAt/updatedAt (it had neither before). FuelRecord is registered as create-only in the extension.
  </what-built>
  <how-to-verify>
    1. `cd apps/web && npx tsc --noEmit` → 0.
    2. Inspect InvoiceItem in Supabase dashboard — confirm createdAt, updatedAt, createdById, updatedById all present.
    3. Confirm FuelRecord has createdById but NOT updatedById in DB and schema.
    4. Confirm CREATE_ONLY_AUDIT_MODELS in audit-columns.ts now contains both FleetMessage and FuelRecord.
  </how-to-verify>
  <resume-signal>Type "approved" to proceed to Wave 4 (remaining tables + final SUMMARY). Or describe issues.</resume-signal>
</task>

<task type="auto">
  <name>Wave 4 — Remaining tables + final SUMMARY</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/&lt;timestamp&gt;_tkt0015_2b_wave4_remaining/migration.sql
    .planning/quick/358-tkt-0015-prompt-2b-add-created-by-id-upd/358-SUMMARY.md
  </files>
  <action>
    Goal: Sweep the long tail — driver-pay tables (add `updated_by_id` to those already carrying nullable `created_by`), checklists/workflows tables, and any other QT 354 targets not yet covered.

    **Tables in scope:**

    Driver Pay snake_case models (already have nullable `created_by` from QT 356 — they now need `updated_by_id` added, AND the existing `created_by` field should be renamed to `created_by_id` if QT 356 used the suffix-less name, OR left alone if QT 356 already used `created_by_id`).

    **IMPORTANT — first confirm the QT 356 naming:**
    Before writing schema edits for this wave, inspect schema.prisma for these models and verify the actual field/column names:
    - DriverCompensationTemplate, LoadDriverAssignment, LoadPayComponent, DriverBonus, DriverDeduction, DriverSettlement, DriverDispute, PayComponentAttachment, DriverPayRecord (if applicable).

    Per QT 356 SUMMARY, these now have `created_by` (nullable) with a `creator User?` relation. QT 354 Section 6 anticipated renaming to `created_by_id`. **Decision for this wave (since it's not locked):** Leave existing `created_by` columns as-is (avoid risky rename). ADD a new `updated_by` nullable column + `updater User?` relation alongside. Use relation names `<Model>UpdatedBy` (matches QT 356's `<Model>CreatedBy` convention).

    Concretely for each of the 8 driver-pay tables, schema edit:
    ```prisma
    updatedBy   String?  @map("updated_by") @db.Uuid                                                        // NEW
    updater     User?    @relation(name: "<Model>UpdatedBy", fields: [updatedBy], references: [id], onDelete: SetNull)  // NEW
    ```

    Migration SQL per driver-pay table:
    ```sql
    ALTER TABLE <table> ADD COLUMN IF NOT EXISTS updated_by UUID;
    DO $$
    BEGIN
      IF NOT EXISTS (... constraint check ...) THEN
        ALTER TABLE <table> ADD CONSTRAINT <table>_updated_by_fkey
          FOREIGN KEY (updated_by) REFERENCES "User"(id) ON DELETE SET NULL;
      END IF;
    END $$;
    ```

    **Audit extension exception:** The driver-pay models use field names `created_by` / `updated_by` (NOT `createdById` / `updatedById`). This DEVIATES from the uniform-field-name assumption in `withAuditColumns`. To keep the extension simple, **add a SNAKE_CREATED_FIELD_MODELS set to the extension** that lists these 8 models and uses the alternate field-name pair when injecting:

    Edit `apps/web/src/lib/db/extensions/audit-columns.ts`:
    ```ts
    /**
     * Driver-pay snake_case models that use field names `createdBy` / `updatedBy`
     * (mapped to columns `created_by` / `updated_by`) — NOT createdById / updatedById.
     * For these, the extension injects 'createdBy' / 'updatedBy' instead of the
     * default 'createdById' / 'updatedById'.
     */
    const LEGACY_SNAKE_AUDIT_MODELS = new Set([
      'DriverCompensationTemplate',
      'LoadDriverAssignment',
      'LoadPayComponent',
      'DriverBonus',
      'DriverDeduction',
      'DriverSettlement',
      'DriverDispute',
      'PayComponentAttachment',
      // Also include any from QT 356 Flag 8 that use the same naming:
      'PlaybookStep',
      'StepInstance',
      'RouteDriver',
      'PushToken',
      'UserNotificationPreference',
      'SysAdminInvoiceItem',
    ]);
    ```

    Then update the inner `injectOnData` invocation in each switch case to use the alternate field names when the model is in LEGACY_SNAKE_AUDIT_MODELS:
    ```ts
    const fieldPair: { created: string; updated: string } = LEGACY_SNAKE_AUDIT_MODELS.has(model ?? '')
      ? { created: 'createdBy', updated: 'updatedBy' }
      : { created: 'createdById', updated: 'updatedById' };
    ```
    Refactor `injectOnData` to accept the field names dynamically rather than the hard-coded `'createdById' | 'updatedById'` literal union.

    Suggested refactor:
    ```ts
    const injectOnData = (
      data: Record<string, unknown>,
      fields: string[],
    ): Record<string, unknown> => {
      const next: Record<string, unknown> = { ...data };
      for (const f of fields) {
        if (next[f] === undefined) {
          next[f] = userId;
        }
      }
      return next;
    };
    ```
    Then in each case, choose the fields based on the fieldPair:
    ```ts
    const createFields = createOnly ? [fieldPair.created] : [fieldPair.created, fieldPair.updated];
    const updateFields = [fieldPair.updated];
    ```

    Run `npx prisma validate`. MUST exit 0.

    **Other tables to sweep in Wave 4** (anything from QT 354 Section 6 not yet covered):
    - SupportTicket (camelCase): createdById + updatedById
    - PlaybookInstance (camelCase): createdById + updatedById (note: PlaybookStep already handled in QT 356)
    - StepTemplate (camelCase): createdById + updatedById
    - Playbook (camelCase): createdById + updatedById
    - DriverInvitation (camelCase): createdById + updatedById
    - PlaybookTrigger (camelCase): createdById + updatedById
    - Promo (camelCase): SKIP — confirmed in QT 354 as global, not tenant-scoped
    - RouteTemplate (snake_case `route_templates`): created_by_id + updated_by_id (uses standard pattern)
    - RouteTemplateStop (snake_case): created_by_id ONLY (no updated_at — append-only)

    **Step 1 — Schema edits:**
    Apply the patterns above. Add reverse relation arrays on User for every new named relation.

    **Step 2 — Migration SQL** for all Wave 4 tables in a single migration file: `<timestamp>_tkt0015_2b_wave4_remaining`.

    **Step 3 — Extension edit:** Refactor injectOnData to accept dynamic field names; add LEGACY_SNAKE_AUDIT_MODELS set; add RouteTemplateStop to CREATE_ONLY_AUDIT_MODELS.

    **Step 4 — Verifications** (full protocol per global_constraints).

    **Step 5 — Final SUMMARY.md:**
    Write `.planning/quick/358-tkt-0015-prompt-2b-add-created-by-id-upd/358-SUMMARY.md` with sections:
    - **What was done** — table count per wave, total columns added, total FK constraints added.
    - **Files modified** — schema.prisma, 4 migrations, audit-columns.ts, tenant-client.ts, SUMMARY.md.
    - **Commits** — list all 4 wave commits + final SUMMARY commit.
    - **Verification matrix** — tsc/validate/generate/isolation tests results per wave.
    - **Extension shape** — final inject behavior, EXEMPT_AUDIT_MODELS, CREATE_ONLY_AUDIT_MODELS, LEGACY_SNAKE_AUDIT_MODELS.
    - **Tables NOT touched** — explicit list (Truck, Route, Load, Invoice, PayrollRecord, Tenant, Promo, AuditLog, system tables, etc.).
    - **Carry-overs / known limitations** — driver-pay legacy `created_by` field name was preserved rather than renamed to `created_by_id`; document this so Prompt 3 can wire correctly.
    - **Ready for Prompt 3** — confirm extension is composable, accepts userId, no UI/API touched.

    **Step 6 — Commit:**
    ```
    feat(quick-358): TKT-0015 Prompt 2b Wave 4 — remaining tables + final SUMMARY
    ```

    Push to GitHub: `git push origin master`.

    **Final-line requirement:**
    The last line of executor output for this task MUST be exactly:
    ```
    Ready for TKT-0015 Prompt 3 (auto-capture middleware)
    ```
  </action>
  <verify>
    1. prisma validate / generate / tsc --noEmit exit 0
    2. Isolation tests pass
    3. DB inspection of all Wave 4 tables shows correct audit columns
    4. FK delete_rule check returns SET NULL on every Wave 4 constraint
    5. audit-columns.ts refactor: injectOnData accepts dynamic field names; LEGACY_SNAKE_AUDIT_MODELS set populated; CREATE_ONLY_AUDIT_MODELS includes RouteTemplateStop
    6. 358-SUMMARY.md exists at `.planning/quick/358-tkt-0015-prompt-2b-add-created-by-id-upd/358-SUMMARY.md` and contains all required sections
    7. Git log shows 4 wave commits + summary commit
    8. Final executor output line is `Ready for TKT-0015 Prompt 3 (auto-capture middleware)`
  </verify>
  <done>
    Wave 4 succeeds: remaining tables migrated, extension refactored to handle legacy field names, SUMMARY.md complete, ready for Prompt 3.
  </done>
</task>

</tasks>

<verification>

**End-to-end verification (after all 4 waves):**

1. **Schema completeness:** `grep -c "createdBy.*User?.*@relation" apps/web/prisma/schema.prisma` shows ~37+ named createdBy relations (5 existing + ~32 new + driver-pay creators from QT 356).

2. **Extension shape:** `apps/web/src/lib/db/extensions/audit-columns.ts` exports `withAuditColumns(userId: string | null)` and handles:
   - camelCase field names (createdById / updatedById) by default
   - LEGACY_SNAKE_AUDIT_MODELS using createdBy / updatedBy
   - CREATE_ONLY_AUDIT_MODELS skipping updatedBy* injection
   - EXEMPT_AUDIT_MODELS bypassing entirely

3. **Composition:** `apps/web/src/lib/db/tenant-client.ts` shows `prisma.$extends(withTenantRLS(tenantId)).$extends(withAuditColumns(userId ?? null))`.

4. **TypeScript health:** `cd apps/web && npx tsc --noEmit` exits 0.

5. **Forbidden tokens check:** `git diff master HEAD -- apps/web | grep -E "as any|@ts-ignore|@ts-expect-error|eslint-disable"` returns empty.

6. **Untouched files check:**
   - `apps/web/src/lib/db/extensions/tenant-rls.ts` unchanged from pre-358 master.
   - Truck, Route, Load, Invoice, PayrollRecord, Tenant models in schema.prisma unchanged from pre-358 master.
   - No diffs in `apps/web/src/app/` (UI/API/server actions).

7. **Isolation tests:** `npx vitest run src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` from `apps/web/` — all pass.

8. **Migration ordering:** All 4 migrations are present in `apps/web/prisma/migrations/` in timestamp order. Each was applied via Supabase MCP `apply_migration` (NOT `prisma migrate deploy`).

</verification>

<success_criteria>

- All 4 waves committed with the documented commit messages.
- ~37 target tables (from QT 354 Section 6) have new nullable audit FKs.
- 5 already-complete tables (Truck/Route/Load/Invoice/PayrollRecord) untouched.
- FleetMessage has createdById only; FuelRecord has createdById only; RouteTemplateStop has created_by_id only.
- All FKs use `ON DELETE SET NULL`.
- withAuditColumns(userId) extension exists, handles 3 model categories, composes with withTenantRLS.
- createTenantClient signature now `(tenantId, userId?)` — backwards compatible.
- No `as any`, no `@ts-ignore`, no `eslint-disable` in the diff.
- `npx tsc --noEmit` from `apps/web/` exits 0 after every wave.
- Driver-pay isolation tests pass after every wave.
- Final SUMMARY.md exists at the documented path.
- Final executor output line: `Ready for TKT-0015 Prompt 3 (auto-capture middleware)`.

</success_criteria>

<output>
After all 4 waves complete (and only after each STOP gate is approved), write summary at:
`.planning/quick/358-tkt-0015-prompt-2b-add-created-by-id-upd/358-SUMMARY.md`

Final executor output line MUST be exactly:
```
Ready for TKT-0015 Prompt 3 (auto-capture middleware)
```
</output>
