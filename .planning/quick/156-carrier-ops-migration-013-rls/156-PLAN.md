---
phase: quick-156
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260404100013_carrier_rls_policies/migration.sql
autonomous: true
must_haves:
  truths:
    - "RLS is enabled on all 13 carrier tables"
    - "OWNER and MANAGER can read all org-scoped data"
    - "DRIVER can only read their own dispatches, loads, stops, expenses, and pay records"
    - "Only OWNER can mutate contracts; MANAGER is SELECT-only on contracts"
    - "Only OWNER can INSERT clients; MANAGER can SELECT and UPDATE clients"
    - "Cross-org data is completely invisible"
  artifacts:
    - path: "apps/web/prisma/migrations/20260404100013_carrier_rls_policies/migration.sql"
      provides: "RLS policies for all 13 carrier tables"
      contains: "ENABLE ROW LEVEL SECURITY"
  key_links:
    - from: "RLS policies"
      to: "auth.jwt() claims"
      via: "org_id, role, auth.uid()"
      pattern: "auth\\.jwt\\(\\)"
---

<objective>
Create Migration 013 — Row Level Security policies for all 13 carrier ops tables.

Purpose: Enforce tenant isolation and role-based access at the database level so no application bug can leak cross-org data.
Output: Single migration.sql file with ENABLE RLS + all CREATE POLICY statements.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/prisma/migrations/20260404100012_driver_pay_records/migration.sql
</context>

<tasks>

<task type="auto">
  <name>Task 1: Write RLS migration SQL file</name>
  <files>apps/web/prisma/migrations/20260404100013_carrier_rls_policies/migration.sql</files>
  <action>
Create the migration directory and SQL file with the following structure:

1. **Header comment block** — purpose, tables covered, JWT claim structure reference.

2. **ENABLE ROW LEVEL SECURITY** for all 13 tables in one grouped block:
   - clients, contracts, facilities, route_templates, route_template_stops, dispatches, loads, stops, carrier_documents, carrier_expenses, driver_pay_records, carrier_drivers, carrier_trucks

3. **Policies for 8 standard org_id tables** (facilities, route_templates, dispatches, loads, carrier_expenses, driver_pay_records, carrier_drivers, carrier_trucks):
   - SELECT: org_id matches JWT org_id
   - INSERT: org_id matches + role IN ('OWNER','MANAGER')
   - UPDATE: org_id matches + role IN ('OWNER','MANAGER')
   - DELETE: org_id matches + role IN ('OWNER','MANAGER')

4. **Policies for clients** (special MANAGER handling):
   - SELECT: org_id matches (all roles in org)
   - INSERT: org_id matches + role = 'OWNER' only (NOT MANAGER)
   - UPDATE: org_id matches + role IN ('OWNER','MANAGER') — non-financial field enforcement at API layer
   - DELETE: org_id matches + role = 'OWNER' only

5. **Policies for contracts** (MANAGER SELECT-only):
   - SELECT: org_id matches (all roles in org)
   - INSERT: org_id matches + role = 'OWNER' only
   - UPDATE: org_id matches + role = 'OWNER' only
   - DELETE: org_id matches + role = 'OWNER' only

6. **Policies for route_template_stops** (no org_id — join via route_template_id):
   - SELECT: route_template_id IN route_templates where org_id matches
   - INSERT: role IN ('OWNER','MANAGER') + route_template_id in org
   - UPDATE: role IN ('OWNER','MANAGER') + route_template_id in org
   - DELETE: role IN ('OWNER','MANAGER') + route_template_id in org

7. **Policies for stops** (no org_id — join via dispatch_id or load_id):
   - OWNER/MANAGER SELECT: dispatch_id in org dispatches OR load_id in org loads
   - OWNER/MANAGER INSERT/UPDATE/DELETE: same join + role check
   - DRIVER SELECT: dispatch_id in dispatches where primary_driver_id or co_driver_id matches carrier_drivers.user_id = auth.uid()
   - DRIVER UPDATE: same as DRIVER SELECT (field restriction at API layer)

8. **Policies for carrier_documents** (polymorphic, no org_id):
   - SELECT: uploaded_by = auth.uid() OR client_id in org clients OR stop_id in org stops
   - INSERT: uploaded_by = auth.uid() AND (OWNER/MANAGER role OR DRIVER with stop in their dispatch)
   - UPDATE: OWNER/MANAGER + client_id in org OR stop_id in org
   - DELETE: OWNER/MANAGER + client_id in org OR stop_id in org

9. **Additional DRIVER-specific policies**:
   - loads_driver_select: DRIVER can SELECT loads on their dispatches
   - carrier_expenses_driver_select: DRIVER can SELECT own expenses (driver_id match)
   - carrier_expenses_driver_insert: DRIVER can INSERT expenses on their dispatches + org_id match
   - driver_pay_records_driver_select: DRIVER can SELECT own pay records (driver_id match)

10. **Footer comments** with verification queries (SELECT from pg_tables for RLS status, COUNT from pg_policies).

JWT claim patterns:
- Tenant: `(auth.jwt() ->> 'org_id')::uuid`
- User: `auth.uid()`
- Role: `auth.jwt() ->> 'role'`
- Roles: 'OWNER', 'MANAGER', 'DRIVER'

Driver identity subquery (reused): `(SELECT id FROM carrier_drivers WHERE user_id = auth.uid())`
  </action>
  <verify>
1. Run `prisma migrate deploy` to apply the migration (or verify via Supabase MCP execute_sql).
2. Verify RLS enabled on all 13 tables:
   ```sql
   SELECT tablename, rowsecurity FROM pg_tables
   WHERE tablename IN ('clients','contracts','facilities','route_templates','route_template_stops','dispatches','loads','stops','carrier_documents','carrier_expenses','driver_pay_records','carrier_drivers','carrier_trucks')
   ORDER BY tablename;
   ```
   All 13 rows must show rowsecurity = true.
3. Count policies:
   ```sql
   SELECT COUNT(*) FROM pg_policies
   WHERE tablename IN ('clients','contracts','facilities','route_templates','route_template_stops','dispatches','loads','stops','carrier_documents','carrier_expenses','driver_pay_records','carrier_drivers','carrier_trucks');
   ```
   Should be 40+ policies.
  </verify>
  <done>
- Migration file exists at the correct path
- RLS enabled on all 13 carrier tables (rowsecurity = true)
- 40+ policies created covering SELECT/INSERT/UPDATE/DELETE for all tables
- contracts restricted to OWNER for mutations (MANAGER SELECT-only)
- clients INSERT restricted to OWNER only
- DRIVER policies scoped to their own dispatches/records
- Polymorphic carrier_documents policies handle client_id and stop_id scoping
  </done>
</task>

</tasks>

<verification>
- `SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN (...)` — all 13 = true
- `SELECT COUNT(*) FROM pg_policies WHERE tablename IN (...)` — 40+ policies
- Policy names follow consistent `[table]_[scope]_[operation]` convention
- No policy references a table outside the 13 carrier tables
</verification>

<success_criteria>
- Single migration file applied successfully
- All 13 carrier tables have RLS enabled
- Tenant isolation enforced via org_id JWT claim
- Role-based access: OWNER full, MANAGER restricted on contracts/clients, DRIVER read-own
- Migration is idempotent-safe (no IF NOT EXISTS needed for CREATE POLICY in Prisma migrations)
</success_criteria>

<output>
After completion, create `.planning/quick/156-carrier-ops-migration-013-rls/156-SUMMARY.md`
</output>
