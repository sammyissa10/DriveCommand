# DB Standardization Migration Runbook (quick-327)

## Summary
This migration (`20260515000001_db_security_standardization`) brings 77 tenant-scoped tables to the standard in `docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md` Sections 2, 5, 7. It is additive — no column drops, no column renames, no data loss.

## Order of operations
1. `current_tenant_id()` function + `app_user` role bootstrap (idempotent).
2. Group A — UI dropdown high-risk tables (loads, dispatches, clients, facilities, carrier_drivers, carrier_trucks, route_templates, contracts) — RLS+FORCE+policies+GRANT+audit columns+indexes.
3. Group B — Driver Pay (driver_pay_records) — same.
4. Group C — Everything else (carrier_compliance_alert_log, carrier_document_types, carrier_expenses, DispatchOverrideAudit, DriverHOSEntry, DriverIncident, in_app_notifications, NotificationSendLog, PlaybookTrigger, SupportTicket, SysAdminInvoice, Tag, TagAssignment) — same.
5. Audit-column-only adds for 50+ already-RLS-compliant tables (idempotent `ADD COLUMN IF NOT EXISTS`).
6. tenant_id backfill for 6 tables: PlaybookStep, PushToken, RouteDriver, StepInstance, SysAdminInvoiceItem, UserNotificationPreference. Each: add nullable → backfill from parent → assert zero NULLs → SET NOT NULL → add FK → enable RLS/policies → index.

## Applied via
`npx prisma migrate deploy` from `apps/web/`. Applied 2026-05-15.

**Note on indexes:** The original plan called for `CREATE INDEX CONCURRENTLY` (non-locking). Prisma's `migrate deploy` wraps migrations in a transaction block, which is incompatible with CONCURRENTLY. The migration uses `CREATE INDEX IF NOT EXISTS` (non-concurrent) instead. Tables are small enough in production that locking duration was acceptable. For future large-table index additions, use `execute_sql` outside a transaction.

## Expected duration
- RLS enable + policies: <1s per table (metadata-only).
- `ADD COLUMN IF NOT EXISTS` for nullable columns: <1s per table (PostgreSQL 11+ skip-table-rewrite).
- Backfill UPDATEs for 6 tables: depends on row count. PushToken/PlaybookStep likely <10s on prod. SysAdminInvoiceItem and UserNotificationPreference likely <1s.
- `CREATE INDEX` (non-concurrent): 1-10s each depending on table size. Largest expected: loads, in_app_notifications, dispatches.
- Total wall clock: 2-10 minutes on production-sized data.

## Rollback
Each table's RLS+policies can be reverted with:
```sql
ALTER TABLE <t> NO FORCE ROW LEVEL SECURITY;
ALTER TABLE <t> DISABLE ROW LEVEL SECURITY;  -- only if it was disabled before
DROP POLICY IF EXISTS tenant_isolation_policy ON <t>;
DROP POLICY IF EXISTS bypass_rls_policy ON <t>;
```

Audit columns can be left in place (they are nullable and defaulted to NULL).

The tenant_id columns added in Task 3 CAN be dropped, but rolling back the FK first:
```sql
ALTER TABLE "PushToken" DROP CONSTRAINT "PushToken_tenantId_fkey";
ALTER TABLE "PushToken" DROP COLUMN "tenantId";
-- repeat for the other 5: PlaybookStep, RouteDriver, StepInstance, SysAdminInvoiceItem, UserNotificationPreference
```
Then revert `apps/web/src/lib/db/extensions/tenant-rls.ts` to re-add the 3 models (PushToken, RouteDriver, SysAdminInvoiceItem) back to EXEMPT_MODELS.

Also revert the Prisma schema changes (remove the 6 new tenantId fields + reverse relations from Tenant) and re-run `npx prisma generate`.

## Smoke tests after apply

Run each from Supabase SQL editor as the app_user role (or `SET ROLE app_user;`):

```sql
-- 1. Without tenant context, no rows visible (FORCE RLS works)
SELECT COUNT(*) FROM loads;  -- expect 0
SELECT COUNT(*) FROM "PushToken";  -- expect 0
SELECT COUNT(*) FROM clients;  -- expect 0

-- 2. With tenant context, only that tenant's rows
SET LOCAL app.current_tenant_id = '<known-tenant-uuid>';
SELECT COUNT(*) FROM loads;  -- expect > 0 if that tenant has loads
SELECT DISTINCT org_id FROM loads;  -- expect single row matching the set tenant

-- 3. Verify all 77 tenant-scoped tables have RLS+FORCE
SELECT c.relname FROM pg_class c
JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity AND NOT c.relforcerowsecurity;
-- expect 0 rows (every RLS-enabled table is also forced)

-- 4. Verify the 6 backfilled tables have zero NULL tenant_id
SELECT 'PushToken', COUNT(*) FROM "PushToken" WHERE "tenantId" IS NULL
UNION ALL SELECT 'RouteDriver', COUNT(*) FROM "RouteDriver" WHERE "tenantId" IS NULL
UNION ALL SELECT 'PlaybookStep', COUNT(*) FROM "PlaybookStep" WHERE "tenantId" IS NULL
UNION ALL SELECT 'StepInstance', COUNT(*) FROM "StepInstance" WHERE "tenantId" IS NULL
UNION ALL SELECT 'SysAdminInvoiceItem', COUNT(*) FROM "SysAdminInvoiceItem" WHERE "tenantId" IS NULL
UNION ALL SELECT 'UserNotificationPreference', COUNT(*) FROM "UserNotificationPreference" WHERE "tenantId" IS NULL;
-- expect all counts = 0

-- 5. Verify all Group A/B/C tables have FORCE RLS
SELECT c.relname FROM pg_class c JOIN pg_namespace n ON c.relnamespace = n.oid
WHERE n.nspname = 'public' AND c.relkind = 'r'
  AND c.relname IN ('loads','dispatches','clients','facilities','carrier_drivers',
                    'carrier_trucks','route_templates','contracts','driver_pay_records',
                    'carrier_compliance_alert_log','carrier_document_types','carrier_expenses',
                    '"DispatchOverrideAudit"','"DriverHOSEntry"','"DriverIncident"',
                    'in_app_notifications','"NotificationSendLog"','"PlaybookTrigger"',
                    '"PushToken"','"RouteDriver"','"SupportTicket"','"SysAdminInvoice"',
                    '"SysAdminInvoiceItem"','"Tag"','"TagAssignment"','"UserNotificationPreference"',
                    '"PlaybookStep"','"StepInstance"')
  AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);
-- Expected: zero rows
```

## Deferred items (NOT in this migration)
- Per-FK indexes per spec Section 5.2 step "(tenant_id, <foreign_key>) for every FK on the table" — pure performance, would add ~120+ indexes. Tracked as quick-XXX follow-up.
- `created_by` / `updated_by` backfill — columns are added nullable. Backfill to a system user UUID is deferred until a system user exists in Tenant config. Future migration.
- Field-level encryption (spec Section 4) — Prompt 4 in the spec, separate PR.
- Restricted document RBAC (spec Section 4.3, 4.4) — Prompt 5 in the spec, separate PR.
- Column naming convention unification — older tables use `tenantId`/`createdAt` (camelCase), newer carrier_* and dp_* tables use `org_id`/`created_at` (snake_case). Renaming would require a full app-wide find/replace + multi-PR migration. Deferred.

## Spot-checked decisions
- Mixed naming convention is preserved (`org_id` for carrier_* and Driver Pay tables, `tenantId` for older PascalCase tables). Spec mandates DB column = `snake_case`, but renaming would require a full app-wide find/replace and a multi-PR migration. Decision: standardize naming in a separate phase. RLS works with both.
- `bypass_rls_policy` uses `current_setting('app.bypass_rls', TRUE) = 'on'` (text comparison, no cast) to match the existing pattern in `00000000000000_init/migration.sql` line 69.
- `CREATE INDEX CONCURRENTLY` was replaced with `CREATE INDEX` because Prisma `migrate deploy` wraps everything in a transaction block. Non-concurrent indexing is acceptable for these table sizes.

## Raw Prisma usage gate (quick-328)

After the standardization migration, any new feature code that calls `prisma.$queryRaw`, `$executeRaw`, `$queryRawUnsafe`, or instantiates `new PrismaClient(` bypasses the tenant-scoped client and reopens the dropdown-leak class of bugs. To prevent regression:

- Static gate: `npm run audit:raw-prisma` (from `apps/web/`) — writes `docs/audits/raw-prisma-usage.md` and exits non-zero on any `LEAK_RISK` finding.
- CI: runs on every PR after Vitest.
- Allowlist: infrastructure files (`lib/db/*`, `lib/context/tenant-context.ts`), migrations, scripts/, and reporting endpoints that explicitly call `requireTenantContext` first. See `scripts/audit/raw-prisma-usage.ts` for the canonical list.
- If a new file legitimately needs raw SQL (reporting/analytics): place it under `src/lib/reports/` or `src/app/api/reports/`, call `requireTenantId()` / `tenantRawQuery()` first, and the audit will classify it as `INTENTIONAL_ALLOWED`. Do not edit the allowlist to whitelist feature code.

Dropdown regression coverage: `apps/web/tests/isolation/dropdowns.test.ts` seeds 3 rows per tenant in Load, Truck, CarrierDriver, CarrierClient, CarrierFacility and asserts the tenant-scoped query returns exactly 3, all belonging to the calling tenant. Spec §6.3.

**Dependency on FORCE RLS:** This gate intentionally excludes `prisma.<model>` method calls from the LEAK_RISK classification, because FORCE ROW LEVEL SECURITY at the database layer is the defense for those calls. If FORCE RLS is ever disabled on a tenant-scoped table (whether by an intentional migration or by accident), the scanner will not catch the resulting leak. Before disabling FORCE RLS on any table, revisit this scanner and the dropdown regression tests in `apps/web/tests/isolation/dropdowns.test.ts`. The regression tests are the second line of defense and must continue to pass.
