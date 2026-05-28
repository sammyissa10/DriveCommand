# Quick Task 414 — Audit app_user DML Grants vs Tenant-Scoped Table List

**Date:** 2026-05-28
**Status:** In Progress

## Goal

Build a read-only audit script that checks whether `app_user` has all four DML grants
(SELECT, INSERT, UPDATE, DELETE) on every tenant-scoped (FORCE RLS) table in the public schema.
Surface missing grants sorted by severity, flag CRITICAL for tables with zero grants.

## Tasks

### Task 1 — Create apps/web/scripts/audit/app-user-grant-audit.ts

**File:** `apps/web/scripts/audit/app-user-grant-audit.ts`

**Connection pattern:** match `audit-rls-gaps.ts` exactly:
```ts
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });
```

**Table selection query:** public schema, `relrowsecurity=true AND relforcerowsecurity=true`, exclude `_prisma_migrations`.

**Grant query:** LEFT JOIN `information_schema.role_table_grants` WHERE `grantee='app_user'` and
`privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')`. Use `bool_or` aggregate to collapse
multiple grant rows per table into four boolean columns.

**Output columns:** table_name | has_select | has_insert | has_update | has_delete | missing_count

**Sort:** missing_count DESC, then table_name ASC within ties.

**Summary block:**
- Total tenant-scoped tables checked
- Total tables with ALL four grants
- Total tables with at least one missing grant
- Action list (table + which privileges are missing)
- CRITICAL block for tables missing all four grants

**Run command:**
```bash
cd apps/web && npx tsx --env-file=.env.local scripts/audit/app-user-grant-audit.ts
```

**Constraints:** Read-only. No GRANT, no DDL, no DML. TypeScript strict mode (no `any`).
