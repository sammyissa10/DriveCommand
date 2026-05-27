---
phase: 410-apply-rls-fixes
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/migration.sql
  - apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/rollback.sql
  - docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md
  - apps/web/scripts/audit/verify-advisor-fix.ts
  - apps/web/scripts/audit/test-advisor-fix-isolation.ts
autonomous: false

must_haves:
  truths:
    - "Pre-check confirms tenant-rls.ts (or an equivalent layer) calls set_config('app.current_tenant_id', tenantId, TRUE) OR plan halts before any SQL is written"
    - "carrier_compliance_alert_log has ENABLE RLS, FORCE RLS, tenant_isolation_policy on org_id = current_tenant_id(), bypass_rls_policy, and idx_carrier_compliance_alert_log_org_id"
    - "carrier_documents, route_template_stops, stops have FORCE RLS, current_tenant_id()-based tenant_isolation_policy (replacing the broken auth.jwt() ->> 'org_id' policy), and intact service_role bypass"
    - "TicketMessage has FORCE ROW LEVEL SECURITY added (existing current_tenant_id() policies untouched)"
    - "Tenant has tenant_self_read SELECT policy (id = current_tenant_id()), FORCE RLS, and SELECT grant to app_user (existing bypass_rls_policy untouched)"
    - "Section 4.12 of DatabaseSecurity_MultiTenant_Spec_v1.md lists carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view as platform-level RLS-off (alongside the existing Plan and Promo entries)"
    - "verify-advisor-fix.ts confirms all six target tables show the spec-mandated rowsecurity, forcerowsecurity, expected policies, and indexes"
    - "test-advisor-fix-isolation.ts proves two-tenant isolation on carrier_compliance_alert_log, carrier_documents, route_template_stops, stops, TicketMessage, Tenant via current_tenant_id() set_config — tenant A sees only A's rows, tenant B sees only B's rows, no-context returns zero"
    - "Supabase advisor no longer flags the six target tables after apply_migration runs"
    - "Smoke check: /owner/loads carrier_documents page and /owner/routes stops page both still return non-zero rows for an existing tenant (rollback fires if zero)"
    - "tsc --noEmit passes after all script files are written"
  artifacts:
    - path: "apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/migration.sql"
      provides: "Transactional RLS hardening for Tiers A-D (BEGIN/COMMIT, header comment citing spec sections, self-validation DO $$ block at end)"
      contains: "BEGIN;|FORCE ROW LEVEL SECURITY|current_tenant_id()|COMMIT;"
    - path: "apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/rollback.sql"
      provides: "Inverse SQL that restores each table to its pre-migration state (drops new policies, removes FORCE RLS, removes new grants, drops new index, restores old org_id-via-JWT policies where applicable)"
      contains: "BEGIN;|DROP POLICY|NO FORCE ROW LEVEL SECURITY|COMMIT;"
    - path: "docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md"
      provides: "Updated Section 4.12 (or newly added Section 4.12) listing all seven platform-level RLS-off tables: Plan, Promo, carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view"
      contains: "4.12|carrier_catalog_meta|NotificationTemplate|NotificationEmailConfig|grid_preference|grid_view"
    - path: "apps/web/scripts/audit/verify-advisor-fix.ts"
      provides: "Read-only diagnostic that queries pg_class.relrowsecurity, pg_class.relforcerowsecurity, pg_policies, and pg_indexes for the six target tables and prints PASS/FAIL per spec expectation"
      min_lines: 80
    - path: "apps/web/scripts/audit/test-advisor-fix-isolation.ts"
      provides: "Two-tenant isolation harness following the 407b-verify-jwt-claim-key.ts style: signs in as two QA accounts, sets app.current_tenant_id per transaction, runs SELECT/INSERT/UPDATE/DELETE on each Tier A-D table, asserts cross-tenant blocking"
      min_lines: 120
  key_links:
    - from: "apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/migration.sql"
      to: "current_tenant_id() function (defined in 20260515000001 migration)"
      via: "USING (org_id = current_tenant_id()) and WITH CHECK clauses"
      pattern: "current_tenant_id\\(\\)"
    - from: "apps/web/scripts/audit/test-advisor-fix-isolation.ts"
      to: "set_config('app.current_tenant_id', $1, TRUE)"
      via: "per-transaction tenant context set inside $transaction wrapper"
      pattern: "set_config\\('app\\.current_tenant_id'"
    - from: "docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.12"
      to: "tier-E documentation-only tables"
      via: "explicit allowlist entries"
      pattern: "carrier_catalog_meta|NotificationTemplate|NotificationEmailConfig|grid_preference|grid_view"
---

<objective>
Apply RLS fixes per DatabaseSecurity_MultiTenant_Spec_v1.md Section 7 to close the Supabase advisor alert covering six tables across four tiers: carrier_compliance_alert_log (Tier A — add full RLS stack), carrier_documents + route_template_stops + stops (Tier B — replace broken auth.jwt() ->> 'org_id' policies with current_tenant_id()), TicketMessage (Tier C — add FORCE RLS only), and Tenant (Tier D — add SELECT policy + FORCE RLS). Tier E (five documentation-only tables) is closed via spec markdown update to Section 4.12. Tier F (_prisma_migrations) is explicitly excluded.

Purpose: The current advisor alert exists because (a) carrier_compliance_alert_log has no RLS at all, (b) three tables have policies that reference a JWT claim (`org_id`) that DriveCommand never populates — meaning the policy is silently bypassed in production, (c) TicketMessage lacks FORCE RLS so superuser-owned connections skip it, and (d) Tenant has no SELECT policy so authenticated users can't even read their own tenant row. The fix must use the canonical Section 3 resolver: `current_tenant_id()` populated by `set_config('app.current_tenant_id', $1, TRUE)` per transaction.

Output: Single dated migration directory under `apps/web/prisma/migrations/` containing `migration.sql` + `rollback.sql`, an updated spec markdown, and two new audit scripts. The migration is applied via Supabase MCP, both audit scripts confirm GREEN, and tsc passes.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Canonical tenant context source — read FIRST in Task 1
@apps/web/src/lib/db/extensions/tenant-rls.ts

# Spec authority — Sections 2.3, 2.5, 3, 4.12, 5.2, 7
@docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md

# Reference migration to match style/path (commit 1e9cd9a, quick-327)
@apps/web/prisma/migrations/20260515000001_db_security_standardization/migration.sql

# Reference audit script style (read-only diagnostic with strict types)
@apps/web/scripts/audit/407b-verify-jwt-claim-key.ts
@apps/web/scripts/audit/classify-uncertain-tables.ts
</context>

<tasks>

<task type="checkpoint:decision" gate="blocking">
  <name>Task 1: CRITICAL pre-check — verify tenant-rls.ts uses set_config</name>
  <files>apps/web/src/lib/db/extensions/tenant-rls.ts (read-only)</files>
  <action>
    Read `apps/web/src/lib/db/extensions/tenant-rls.ts` end-to-end. Search the file for the exact substring `set_config('app.current_tenant_id'`. The user's task spec is explicit: "If it does NOT call set_config('app.current_tenant_id', tenantId, TRUE), STOP — do not write the migration."

    Why this matters: every policy this migration creates is of the form `USING (org_id = current_tenant_id())`. If the application layer never executes `set_config(...)`, then `current_tenant_id()` returns NULL inside every Prisma query, the policy evaluates to `org_id = NULL` (always false), and the tables become unreadable from the application side — a worse outcome than the current advisor alert. The smoke-check constraint at the end of the task ("rollback immediately if pages return zero rows") is the safety net, but a pre-check prevents the wasted apply/rollback cycle entirely.

    Important nuance: the current header comment of tenant-rls.ts explicitly documents that set_config was REMOVED in a prior pass because per-query $transaction wrapping deadlocked the Session Pooler. The comment also says: "IF RLS POLICIES ARE RE-ADDED IN FUTURE: Do not re-introduce per-query $transaction wrapping here. Instead, set app.current_tenant_id at connection checkout time (e.g. via a pg.Pool 'connect' event handler or a Prisma middleware that runs SET LOCAL outside of query-level transactions)." This is highly relevant.

    Execute these checks:
    1. grep for `set_config\(['\"]app\.current_tenant_id` in `apps/web/src/lib/db/` (entire directory, not just extensions/)
    2. grep for `SET LOCAL app.current_tenant_id` across `apps/web/src/lib/db/`
    3. grep for pg.Pool `.on('connect'` or similar in `apps/web/src/lib/db/`
    4. Read the full body of tenant-rls.ts to confirm whether the documented "set at connection checkout" mechanism was ever wired up

    Three possible outcomes — surface to user as a decision:

    OUTCOME A — set_config IS present somewhere (pool checkout, middleware, or the extension was re-wired):
      Capture the exact file:line where it lives. Document it in the checkpoint resume note. Recommend: proceed.

    OUTCOME B — set_config is NOT present anywhere, but a pool 'connect' handler / SET LOCAL pattern exists at a different layer that achieves the same effect:
      Document the alternative mechanism (file:line) and confirm whether it sets the GUC at a scope that any Prisma query will see (TRANSACTION vs SESSION vs LOCAL). Only if it definitively sets app.current_tenant_id before queries run, recommend: proceed.

    OUTCOME C — neither set_config nor any equivalent mechanism is wired:
      Recommend: BLOCK. Do not proceed to Task 2. The user must first re-add the tenant context plumbing (a separate quick task per the spec's existing guidance). Return decision: "blocked — tenant context plumbing missing, see {paths inspected}".

    Decision to surface to user: "Can this migration proceed? It depends on whether the Prisma extension (or equivalent layer) actually sets the `app.current_tenant_id` GUC that the new RLS policies will read."

    Options:
      - proceed — set_config (or equivalent) confirmed present. Migration policies will resolve current_tenant_id() to a real UUID; advisor alert closes safely.
      - block — set_config plumbing absent. Prevents apply/rollback churn and a brief production outage on carrier_documents + stops pages. Quick task halts; user must schedule the tenant-context wiring as a separate quick task first.
  </action>
  <verify>
    Output of the three greps + a one-paragraph summary of the tenant-rls.ts current state must be included in the resume message. Do not invent the presence of set_config — only declare OUTCOME A if the substring literally appears in code (not in a comment that says it was removed).
  </verify>
  <done>User responds with `proceed` (Task 2 executes) or `block` (plan halts with a clear summary message for the user).</done>
  <resume-signal>Type "proceed" or "block — {reason}"</resume-signal>
</task>

<task type="auto">
  <name>Task 2: Write migration.sql for Tiers A through D</name>
  <files>apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/migration.sql</files>
  <action>
    Create the dated migration directory `apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/` and write `migration.sql` inside it. Match the header-comment style of `20260515000001_db_security_standardization/migration.sql` (cite spec sections, audit reference, additive guarantee).

    Wrap the entire body in `BEGIN;` / `COMMIT;` (unlike the 327 migration which used CONCURRENT indexes outside a transaction, this migration uses only DDL and a single non-concurrent index, so it can and SHOULD be transactional per Section 7).

    Structure:

    -- ============================================================================
    -- Quick-410: Apply RLS Fixes to Close Supabase Advisor Alert
    -- Spec: docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md Sections 2.3, 2.5, 3, 4.12, 5.2, 7
    -- Closes advisor alert on: carrier_compliance_alert_log, carrier_documents,
    --   route_template_stops, stops, TicketMessage, Tenant
    -- ============================================================================
    BEGIN;

    -- ── TIER A — carrier_compliance_alert_log (column = org_id) ────────────────
    ALTER TABLE carrier_compliance_alert_log ENABLE ROW LEVEL SECURITY;
    ALTER TABLE carrier_compliance_alert_log FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_compliance_alert_log;
    CREATE POLICY tenant_isolation_policy ON carrier_compliance_alert_log
      FOR ALL
      USING (org_id = current_tenant_id())
      WITH CHECK (org_id = current_tenant_id());
    DROP POLICY IF EXISTS bypass_rls_policy ON carrier_compliance_alert_log;
    CREATE POLICY bypass_rls_policy ON carrier_compliance_alert_log
      FOR ALL
      USING (current_setting('app.bypass_rls', TRUE) = 'on');
    CREATE INDEX IF NOT EXISTS idx_carrier_compliance_alert_log_org_id
      ON carrier_compliance_alert_log(org_id);
    GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_compliance_alert_log TO app_user;

    -- ── TIER B — carrier_documents (column = org_id) ───────────────────────────
    -- Drop ONLY the broken tenant_isolation_policy that reads auth.jwt() ->> 'org_id'.
    -- DO NOT touch any policy whose name contains 'service_role' or 'bypass'.
    ALTER TABLE carrier_documents FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_documents;
    CREATE POLICY tenant_isolation_policy ON carrier_documents
      FOR ALL
      USING (org_id = current_tenant_id())
      WITH CHECK (org_id = current_tenant_id());
    GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_documents TO app_user;

    -- ── TIER B — route_template_stops (column = org_id) ────────────────────────
    ALTER TABLE route_template_stops FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON route_template_stops;
    CREATE POLICY tenant_isolation_policy ON route_template_stops
      FOR ALL
      USING (org_id = current_tenant_id())
      WITH CHECK (org_id = current_tenant_id());
    GRANT SELECT, INSERT, UPDATE, DELETE ON route_template_stops TO app_user;

    -- ── TIER B — stops (column = org_id) ───────────────────────────────────────
    ALTER TABLE stops FORCE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON stops;
    CREATE POLICY tenant_isolation_policy ON stops
      FOR ALL
      USING (org_id = current_tenant_id())
      WITH CHECK (org_id = current_tenant_id());
    GRANT SELECT, INSERT, UPDATE, DELETE ON stops TO app_user;

    -- ── TIER C — TicketMessage (policies already use current_tenant_id()) ──────
    -- Per spec: add FORCE only, do not modify policies.
    ALTER TABLE "TicketMessage" FORCE ROW LEVEL SECURITY;

    -- ── TIER D — Tenant (add SELECT policy + FORCE RLS) ────────────────────────
    -- Existing bypass_rls_policy is untouched. Create self-read SELECT policy.
    DROP POLICY IF EXISTS tenant_self_read ON "Tenant";
    CREATE POLICY tenant_self_read ON "Tenant"
      FOR SELECT
      USING (id = current_tenant_id());
    ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
    GRANT SELECT ON "Tenant" TO app_user;

    -- ── Self-validation block ──────────────────────────────────────────────────
    DO $$
    DECLARE
      missing_count INT;
    BEGIN
      -- Confirm FORCE RLS is on for all six tables
      SELECT COUNT(*) INTO missing_count
      FROM pg_class
      WHERE relname IN (
        'carrier_compliance_alert_log','carrier_documents',
        'route_template_stops','stops','TicketMessage','Tenant'
      )
      AND relforcerowsecurity = FALSE;
      IF missing_count > 0 THEN
        RAISE EXCEPTION 'quick-410: FORCE RLS missing on % target tables', missing_count;
      END IF;

      -- Confirm tenant_isolation_policy exists on the four tenant tables
      SELECT COUNT(*) INTO missing_count
      FROM (VALUES
        ('carrier_compliance_alert_log'),('carrier_documents'),
        ('route_template_stops'),('stops')
      ) AS t(tbl)
      WHERE NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename=t.tbl AND policyname='tenant_isolation_policy'
      );
      IF missing_count > 0 THEN
        RAISE EXCEPTION 'quick-410: tenant_isolation_policy missing on % tier A/B tables', missing_count;
      END IF;

      -- Confirm tenant_self_read on Tenant
      IF NOT EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname='public' AND tablename='Tenant' AND policyname='tenant_self_read'
      ) THEN
        RAISE EXCEPTION 'quick-410: tenant_self_read policy missing on Tenant';
      END IF;

      -- Confirm the new index exists
      IF NOT EXISTS (
        SELECT 1 FROM pg_indexes
        WHERE schemaname='public' AND indexname='idx_carrier_compliance_alert_log_org_id'
      ) THEN
        RAISE EXCEPTION 'quick-410: idx_carrier_compliance_alert_log_org_id missing';
      END IF;
    END$$;

    COMMIT;

    Constraints — read carefully:
    - Do NOT include `CREATE OR REPLACE FUNCTION current_tenant_id()` (it already exists from migration 327).
    - Do NOT include `CREATE ROLE app_user` (already exists from 327).
    - Do NOT touch the five Section 4.12 allowlist tables (Plan, Promo, carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view) at the SQL level — they are handled by Tier E (docs only).
    - Do NOT touch _prisma_migrations (Tier F — explicit exclusion).
    - Do NOT drop or modify any policy whose name contains `service_role` or `bypass` (these are the carrier_documents/stops service-role bypass policies that must remain intact).
    - Quote PascalCase table names (`"TicketMessage"`, `"Tenant"`) since they were created via Prisma. Use unquoted snake_case for the rest.
    - The `carrier_compliance_alert_log` table may not yet have RLS enabled, so it gets ENABLE + FORCE. The three Tier B tables already have RLS enabled (with broken policies), so they only need FORCE added — but `ALTER TABLE ... FORCE ROW LEVEL SECURITY` is idempotent so it is safe to call even if already forced.
    - Use `DROP POLICY IF EXISTS` before every `CREATE POLICY` to keep the migration re-runnable.
  </action>
  <verify>
    File exists at the expected path. `cat` confirms BEGIN/COMMIT wrap, six target tables touched, no allowlist or _prisma_migrations references, and the DO $$ self-validation block at the end. No accidental references to `service_role` policies (search the file for `service_role` — must return zero matches).
  </verify>
  <done>migration.sql exists, is syntactically a transactional script, contains all four tiers, and contains the self-validation DO $$ block.</done>
</task>

<task type="auto">
  <name>Task 3: Write rollback.sql in the same migration directory</name>
  <files>apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/rollback.sql</files>
  <action>
    Create `rollback.sql` in the same directory. Wrap in `BEGIN;` / `COMMIT;`. Header comment must name the forward migration and state that this restores the pre-quick-410 state.

    Tier-by-tier inverse:

    -- TIER A reverse — carrier_compliance_alert_log
    DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_compliance_alert_log;
    DROP POLICY IF EXISTS bypass_rls_policy ON carrier_compliance_alert_log;
    ALTER TABLE carrier_compliance_alert_log NO FORCE ROW LEVEL SECURITY;
    ALTER TABLE carrier_compliance_alert_log DISABLE ROW LEVEL SECURITY;
    DROP INDEX IF EXISTS idx_carrier_compliance_alert_log_org_id;
    REVOKE SELECT, INSERT, UPDATE, DELETE ON carrier_compliance_alert_log FROM app_user;

    -- TIER B reverse — carrier_documents, route_template_stops, stops
    -- Drop the current_tenant_id() policy and restore the prior (broken-but-original)
    -- auth.jwt() ->> 'org_id' policy so the schema returns to its pre-410 shape.
    -- Restoring the original policy is what makes this a true rollback (not a "leave as-is").
    DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_documents;
    CREATE POLICY tenant_isolation_policy ON carrier_documents
      FOR ALL
      USING (org_id = (auth.jwt() ->> 'org_id')::uuid)
      WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);
    ALTER TABLE carrier_documents NO FORCE ROW LEVEL SECURITY;
    -- (do not REVOKE — the grant may have pre-existed)

    -- Repeat the same pattern for route_template_stops and stops.

    -- TIER C reverse — TicketMessage
    ALTER TABLE "TicketMessage" NO FORCE ROW LEVEL SECURITY;

    -- TIER D reverse — Tenant
    DROP POLICY IF EXISTS tenant_self_read ON "Tenant";
    ALTER TABLE "Tenant" NO FORCE ROW LEVEL SECURITY;
    REVOKE SELECT ON "Tenant" FROM app_user;

    Constraints:
    - Do NOT drop the `current_tenant_id()` function (other tables still depend on it).
    - Do NOT drop the `app_user` role.
    - Do NOT touch any `service_role` / `bypass` policy.
    - Make every drop idempotent (`DROP POLICY IF EXISTS`).
    - The rollback is intentionally LOSSY for Tier B: it re-installs the broken auth.jwt() policy. That is correct — rollback restores the previous state, even if the previous state was the broken state. Add a comment to that effect at the top of the Tier B block.
  </action>
  <verify>
    File exists. `cat` confirms BEGIN/COMMIT wrap, every Tier A-D forward action has an inverse, no `service_role` references, no DROP FUNCTION, no DROP ROLE.
  </verify>
  <done>rollback.sql exists and is the complete inverse of migration.sql.</done>
</task>

<task type="auto">
  <name>Task 4: Update DatabaseSecurity spec — Section 4.12 platform-level allowlist</name>
  <files>docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md</files>
  <action>
    Open the spec. Search for the existing Section 4.12 (`### 4.12` or similar). Two cases:

    CASE 1 — Section 4.12 already exists with Plan and Promo listed:
      Append carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view to the existing list. Use the same bullet format already in use. Add a one-line rationale for each:
      - `carrier_catalog_meta` — catalog of carrier-document categories shared across all tenants
      - `NotificationTemplate` — notification template definitions are platform-wide
      - `NotificationEmailConfig` — global SMTP / outbound email defaults
      - `grid_preference` — user-scoped grid preferences (scoped by user_id, not tenant)
      - `grid_view` — user-scoped saved grid views (scoped by user_id, not tenant)

    CASE 2 — Section 4.12 does not yet exist (the visible headings stop at Section 4.5):
      Add a new `### 4.12 Platform-level tables (RLS off)` subsection inside Section 4. Place it logically — either at the end of Section 4 (just before `## Section 4A`) or wherever Plan/Promo are currently mentioned in body text. The body of the new subsection must:
      1. State the rule: "These tables are platform-level metadata, not tenant-scoped. RLS is intentionally OFF. Adding them to this list is the explicit, audited exception to Section 2.3."
      2. List all seven tables: Plan, Promo, carrier_catalog_meta, NotificationTemplate, NotificationEmailConfig, grid_preference, grid_view (each with the one-line rationale above).
      3. Reference quick-410 as the task that codified this list.

    Also: search the spec for any existing prose that says "Plan and Promo are platform-level" and update it to reference this expanded list rather than just two tables.

    Do NOT renumber any other section. Do NOT modify Section 2.3, 2.5, 3, 5.2, or 7 (cited only — not changed).
  </action>
  <verify>
    grep -n "carrier_catalog_meta\|NotificationTemplate\|NotificationEmailConfig\|grid_preference\|grid_view" on the file shows all five table names appear in the same section. grep -n "^### 4.12" returns a single line.
  </verify>
  <done>The spec lists all seven platform-level RLS-off tables in Section 4.12.</done>
</task>

<task type="auto">
  <name>Task 5: Write verify-advisor-fix.ts read-only diagnostic</name>
  <files>apps/web/scripts/audit/verify-advisor-fix.ts</files>
  <action>
    Create a read-only diagnostic script that mirrors the strict-typed, no-write style of `apps/web/scripts/audit/407b-verify-jwt-claim-key.ts` and `apps/web/scripts/audit/classify-uncertain-tables.ts`. Header docblock must declare: "GUARD-RAILS — this script performs NO writes" and list zero INSERT/UPDATE/DELETE/ALTER/CREATE/DROP statements.

    The script uses the default Prisma client (or a direct pg connection) and runs the following read-only queries:

    1. For each of the six target tables, query `pg_class`:
       - `relrowsecurity` must be TRUE
       - `relforcerowsecurity` must be TRUE

    2. For each of carrier_compliance_alert_log, carrier_documents, route_template_stops, stops, query `pg_policies`:
       - `tenant_isolation_policy` must exist
       - The policy `qual` text must contain `current_tenant_id()` and must NOT contain `auth.jwt() ->> 'org_id'`

    3. For carrier_compliance_alert_log, additionally:
       - `bypass_rls_policy` must exist
       - `idx_carrier_compliance_alert_log_org_id` must exist in `pg_indexes`

    4. For TicketMessage:
       - `relforcerowsecurity` must be TRUE
       - Existing policies must be unchanged (just confirm at least one policy referencing `current_tenant_id()` exists, do not enumerate by name)

    5. For Tenant:
       - `tenant_self_read` policy must exist with `qual` containing `id = current_tenant_id()`
       - `relforcerowsecurity` must be TRUE
       - `bypass_rls_policy` must still exist (regression guard)

    6. For app_user role privileges on each tenant-scoped target: query `information_schema.role_table_grants` and confirm SELECT/INSERT/UPDATE/DELETE present (SELECT-only for Tenant).

    Output: print one line per table with PASS / FAIL and a count of failures at the bottom. Exit code 0 if all PASS, 1 if any FAIL.

    Use the same run command convention as 407b: `npx tsx --env-file=.env.local scripts/audit/verify-advisor-fix.ts`.

    Strict mode — no `any`, no implicit any. Define types for query rows. Use `prisma.$queryRaw<RowType[]>` with explicit row type parameter.
  </action>
  <verify>
    File exists. `grep -E "INSERT|UPDATE|DELETE|ALTER|CREATE|DROP" apps/web/scripts/audit/verify-advisor-fix.ts` returns zero matches (other than inside string literals describing what's NOT in the file — the guard-rail comment). `tsc --noEmit` passes (run in Task 9).
  </verify>
  <done>verify-advisor-fix.ts compiles, is read-only, and validates all six tables against the spec.</done>
</task>

<task type="auto">
  <name>Task 6: Write test-advisor-fix-isolation.ts two-tenant harness</name>
  <files>apps/web/scripts/audit/test-advisor-fix-isolation.ts</files>
  <action>
    Create a two-tenant isolation harness. This script WRITES (it inserts and deletes test rows) so the docblock must clearly say so and must run inside a single transaction per assertion that is ROLLED BACK at the end of each block to leave the database clean.

    Structure follows the spec's Section 6.1 two-tenant test pattern.

    Setup:
    - Use two existing QA tenant IDs from .env.local (or hardcode if the audit folder convention does so — check classify-uncertain-tables.ts for the pattern).
    - Acquire a direct pg.Pool client (not Prisma) so we can run `SET LOCAL app.current_tenant_id = '...'` inside an explicit transaction. Prisma's connection pooling makes per-transaction GUC setting awkward; raw pg is the right tool here.
    - Run as the `app_user` role if possible (use a separate connection string env var like `DATABASE_URL_APP_USER`); if that env var is missing, log a clear "skipping — app_user URL not configured" and exit 0 with a warning rather than running as the privileged role (which would silently bypass RLS).

    Per-table assertions (run for each Tier A/B/D target — carrier_compliance_alert_log, carrier_documents, route_template_stops, stops, Tenant):

    Block 1 — SELECT isolation:
      BEGIN;
      SET LOCAL app.current_tenant_id = '<tenant_A_uuid>';
      SELECT count(*) FROM <table> WHERE org_id = '<tenant_B_uuid>';
      -- assert: count = 0
      ROLLBACK;

    Block 2 — No-context guard:
      BEGIN;
      -- intentionally do NOT call SET LOCAL
      SELECT count(*) FROM <table>;
      -- assert: count = 0 (because current_tenant_id() returns NULL and the policy fails)
      ROLLBACK;

    Block 3 — Cross-tenant write block:
      BEGIN;
      SET LOCAL app.current_tenant_id = '<tenant_A_uuid>';
      -- attempt to INSERT a row with org_id = tenant_B
      -- assert: error thrown (RLS WITH CHECK violation)
      ROLLBACK;

    For TicketMessage:
      Same three blocks but column is `tenantId` (PascalCase Prisma model).

    For Tenant:
      Block 1: SET tenant_A, SELECT count(*) FROM "Tenant" — must equal 1 (only A's own row visible).
      Block 2: No context, SELECT count(*) FROM "Tenant" — must equal 0.
      Block 3 N/A (Tenant has SELECT-only policy from this migration; no INSERT test).

    Output: PASS/FAIL per table per block, summary at end, exit 0 only if all PASS.

    Strict types. No `any`. Use pg's typed query helpers. Wrap each block in try/catch so one failing block does not abort the whole run.
  </action>
  <verify>
    File exists. `grep "SET LOCAL app.current_tenant_id"` returns matches inside transaction blocks. `grep "ROLLBACK"` returns matches at the end of each test block. `tsc --noEmit` passes (in Task 9).
  </verify>
  <done>test-advisor-fix-isolation.ts compiles and exercises SELECT isolation, no-context guard, and cross-tenant write block per spec Section 6.1/6.2.</done>
</task>

<task type="auto">
  <name>Task 7: Apply migration via Supabase MCP</name>
  <files>(none — Supabase remote state change only)</files>
  <action>
    Apply the migration using the Supabase MCP `apply_migration` tool. Migration name: `quick410_advisor_rls_fix`. Migration body: the contents of `apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/migration.sql`.

    If apply_migration fails for any reason:
    1. Capture the full error message.
    2. Apply the rollback.sql immediately using the Supabase MCP `execute_sql` tool (rollback.sql is intentionally NOT registered as a migration — it is a recovery script).
    3. Surface the failure to the user with the captured error and the rollback confirmation.
    4. Do NOT proceed to Task 8.

    If apply_migration succeeds, immediately run a Supabase MCP `get_advisors --type security` call. Capture the output. Confirm the six target tables are no longer flagged. If any of the six still appears in advisor output, do NOT auto-rollback (the migration was syntactically valid and may need investigation) — surface the advisor output to the user and pause.
  </action>
  <verify>
    Supabase MCP apply_migration returns success. Supabase MCP get_advisors output no longer lists the six target tables under the relevant RLS warnings.
  </verify>
  <done>Migration is live in Supabase. Advisor alert is cleared for the six target tables.</done>
</task>

<task type="auto">
  <name>Task 8: Run both audit scripts and the smoke check</name>
  <files>(none — read-only execution)</files>
  <action>
    From `apps/web/`:

    1. Run verify-advisor-fix.ts:
       `npx tsx --env-file=.env.local scripts/audit/verify-advisor-fix.ts`
       Capture output. Must exit 0 with all PASS.

    2. Run test-advisor-fix-isolation.ts:
       `npx tsx --env-file=.env.local scripts/audit/test-advisor-fix-isolation.ts`
       Capture output. Must exit 0 with all PASS. If the script reports "skipping — app_user URL not configured", note this and add a follow-up item to the summary (the isolation test should still be runnable; user must add DATABASE_URL_APP_USER to .env.local).

    3. Smoke check — query (via Prisma or direct SQL with the regular DATABASE_URL) the carrier_documents and stops tables for an existing tenant. Both must return > 0 rows.

       If EITHER returns 0 rows:
         - Apply rollback.sql immediately via Supabase MCP execute_sql.
         - Surface the zero-row table and the rollback confirmation.
         - STOP. Do not proceed to Task 9.

       If both return > 0 rows, proceed.
  </action>
  <verify>
    Both scripts exit 0. Smoke-check row counts are non-zero. If any check fails, the rollback ran cleanly and is reported.
  </verify>
  <done>verify-advisor-fix.ts PASS, test-advisor-fix-isolation.ts PASS, smoke-check row counts > 0.</done>
</task>

<task type="auto">
  <name>Task 9: Run tsc --noEmit and finalize</name>
  <files>(none — type check only)</files>
  <action>
    From `apps/web/`:
    1. `npx tsc --noEmit` — must exit 0. The two new audit scripts are TypeScript; any type errors block completion.
    2. If tsc reports errors in the new scripts, fix them in place (do not skip with @ts-ignore — this codebase has a zero-@ts-ignore policy per Phase quick-150 audit).
    3. Re-run tsc until clean.

    Then write the standard summary to `.planning/quick/410-apply-rls-fixes-per-databasesecurity-spe/410-SUMMARY.md` covering:
    - Pre-check outcome (which OUTCOME A/B/C, what was confirmed)
    - Migration applied at: <timestamp>
    - Advisor output before vs after
    - Audit script results
    - Smoke check row counts (carrier_documents, stops)
    - Any deferred items (e.g., DATABASE_URL_APP_USER follow-up)
  </action>
  <verify>
    `npx tsc --noEmit` exits 0. Summary file exists at the documented path.
  </verify>
  <done>tsc clean, summary written.</done>
</task>

</tasks>

<verification>
End-state checks (all must pass):
- Supabase advisor no longer flags carrier_compliance_alert_log, carrier_documents, route_template_stops, stops, TicketMessage, Tenant.
- verify-advisor-fix.ts exits 0 with all PASS.
- test-advisor-fix-isolation.ts exits 0 with all PASS (or reports app_user URL skip cleanly).
- /owner/loads carrier_documents and /owner/routes stops sections return non-zero rows for an existing tenant.
- `npx tsc --noEmit` in apps/web exits 0.
- docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md Section 4.12 lists all seven platform-level tables.
- migration.sql and rollback.sql both exist under apps/web/prisma/migrations/20260527000001_quick410_advisor_rls_fix/.
- No Section 4.12 allowlist table or _prisma_migrations was modified at the SQL level.
- No `service_role` or `bypass` named policy was dropped or modified.
</verification>

<success_criteria>
- Pre-check (Task 1) explicitly confirmed set_config plumbing is in place, OR the plan halted gracefully with a clear unblock path.
- Six target tables have spec-mandated RLS shape: ENABLE + FORCE + current_tenant_id()-based tenant_isolation_policy + bypass_rls_policy where applicable.
- Tier E spec update committed.
- Both audit scripts compile and exit 0 against the live database.
- Rollback.sql exists and is a true inverse of migration.sql (re-installing the original auth.jwt() ->> 'org_id' policy on Tier B).
- Smoke check confirms application pages still return rows for an existing tenant.
- tsc clean.
- Summary captures pre-check OUTCOME, advisor before/after, and any deferred items.
</success_criteria>

<output>
After completion, create `.planning/quick/410-apply-rls-fixes-per-databasesecurity-spe/410-SUMMARY.md` documenting:
1. Task 1 pre-check OUTCOME (A, B, or C) with the file:line evidence
2. Migration application timestamp and Supabase MCP response
3. Supabase advisor output before vs after (delta listing the six tables clearing)
4. verify-advisor-fix.ts full output
5. test-advisor-fix-isolation.ts full output (or skip notice)
6. Smoke-check row counts for carrier_documents and stops
7. tsc --noEmit result
8. Section 4.12 spec change diff summary
9. Any follow-up items (DATABASE_URL_APP_USER configuration, etc.)
</output>
