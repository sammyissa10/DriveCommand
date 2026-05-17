# QT-358 Wave 1 Report — TKT-0015 Prompt 2b Smoke Test

**Status:** COMPLETE — awaiting user confirmation to proceed to Wave 2
**Commit:** `5ad81f28`
**Date:** 2026-05-17

---

## Migration SQL Applied

File: `apps/web/prisma/migrations/20260517100001_tkt0015_2b_wave1_smoke_audit_columns/migration.sql`

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

Applied via direct `pg` client to Supabase DIRECT_URL (not `prisma migrate deploy`).

---

## withAuditColumns Extension

File: `apps/web/src/lib/db/extensions/audit-columns.ts`

Key behaviors:
- `withAuditColumns(userId: string | null)` — null userId = no-op passthrough
- `CREATE_ONLY_AUDIT_MODELS` set: `{ 'FleetMessage' }` — skips `updatedById` injection
- `EXEMPT_AUDIT_MODELS` set: 20 system/append-only models bypassed entirely
- Handles `create`, `createMany`, `createManyAndReturn`, `update`, `updateMany`, `upsert`
- Read/delete/aggregate operations pass through untouched
- Caller-supplied values in `args.data` are always preserved (only injects when field is `undefined`)

---

## tenant-client.ts Change

```ts
export function createTenantClient(tenantId: string, userId?: string | null): PrismaClient {
  return prisma
    .$extends(withTenantRLS(tenantId))
    .$extends(withAuditColumns(userId ?? null)) as unknown as PrismaClient;
}
```

Backwards compatible — `userId` is optional. Existing call sites with only `tenantId` continue to work (audit injection is a no-op when userId is null).

---

## Verification Results

### tsc --noEmit
**PASS** — exits 0, no errors, no type widenings needed

### prisma validate
**PASS** — exits 0

### prisma generate
**PASS** — exits 0, Prisma Client v7.6.0 regenerated

### Isolation tests
**SKIPPED (9 tests)** — tests exist at `src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` but are skipped (require live DB integration setup). No failures.

### DB Column Verification
```
4 rows returned — all is_nullable = YES:
- ExpenseCategory.createdById  YES
- ExpenseCategory.updatedById  YES
- Tag.createdById               YES
- Tag.updatedById               YES
```

### FK Constraint Verification
```
4 constraints returned — all delete_rule = SET NULL:
- ExpenseCategory_createdById_fkey  SET NULL
- ExpenseCategory_updatedById_fkey  SET NULL
- Tag_createdById_fkey              SET NULL
- Tag_updatedById_fkey              SET NULL
```

---

## TypeScript Widenings

None required. The new fields (`createdById`, `updatedById`) were added as `String?` (nullable) in schema.prisma, which generates as `string | null` in the Prisma client automatically. No manual widening needed.

---

## Commit

```
5ad81f28  feat(quick-358): TKT-0015 Prompt 2b Wave 1 — smoke test Tag+ExpenseCategory and add withAuditColumns extension
```

Files in commit:
- `apps/web/prisma/schema.prisma` — Tag + ExpenseCategory models + User reverse relations
- `apps/web/prisma/migrations/20260517100001_tkt0015_2b_wave1_smoke_audit_columns/migration.sql` — Wave 1 DDL
- `apps/web/src/lib/db/extensions/audit-columns.ts` — new withAuditColumns extension
- `apps/web/src/lib/db/tenant-client.ts` — updated to compose both extensions
- `apps/web/src/generated/prisma/**` — regenerated client

---

## What Was NOT Done (Per Constraints)

- Truck, Route, Load, Invoice, PayrollRecord — untouched
- Tenant model — untouched
- `apps/web/src/lib/db/extensions/tenant-rls.ts` — untouched
- UI, API routes, server actions — untouched
- No `as any`, `@ts-ignore`, `@ts-expect-error`, or `eslint-disable` used
- No `prisma migrate deploy` run — used direct pg client
- No historical backfill

---

WAVE 1 COMPLETE — Awaiting user confirmation to proceed to Wave 2
