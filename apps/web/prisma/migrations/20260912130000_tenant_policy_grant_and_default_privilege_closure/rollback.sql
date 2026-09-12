-- ============================================================================
-- quick-595 ROLLBACK — statement-for-statement inverse of
--   20260912130000_tenant_policy_grant_and_default_privilege_closure/migration.sql
--
-- ***  NOT APPLIED.  ***  This file has never been run against any database.
-- ============================================================================
--
-- WHY THIS IS A SIBLING FILE AND NOT A COMMENTED BLOCK INSIDE migration.sql
--
--   1. Precedent exists in this repo:
--      prisma/migrations/20260527000001_quick410_advisor_rls_fix/rollback.sql.
--   2. A rollback kept as a commented block inside `migration.sql` invites
--      somebody to uncomment it IN PLACE — which edits an ALREADY-APPLIED
--      migration. That is forbidden, and the checksum/replay machinery would
--      not forgive it.
--   3. Both `scripts/migrate.mjs` (which filters directories on
--      `existsSync(dir/migration.sql)`) and the drift detector (which
--      `statSync`s the same path) read ONLY `migration.sql`. A sibling file
--      is therefore INERT to both: it cannot be applied by accident and it
--      cannot perturb the detector's expected policy set.
--
-- HOW TO USE IT: paste into a psql session pointed at the target database, or
-- copy into a NEW migration directory as `migration.sql`. Never rename this
-- file, and never edit the migration it inverts.
--
-- Every statement is idempotent.
--
-- ── DELIBERATELY ABSENT: `ALTER ROLE app_user WITH NOLOGIN` ────────────────
--   Production's `rolcanlogin` was ALREADY `true` before this migration ran.
--   Reversing it would lock a role that this migration did not unlock — the
--   rollback would do strictly more damage than the migration did work. On
--   staging the value was `false` and the migration set it `true`; if you
--   genuinely need staging's prior value back, run
--   `ALTER ROLE app_user WITH NOLOGIN;` by hand, with that asymmetry in mind.
--
-- ── ALSO DELIBERATELY UNTOUCHED ───────────────────────────────────────────
--   * `current_tenant_id()` — other tables depend on it.
--   * The `app_user` role itself — not created by this migration.
--   * Any `bypass_rls_policy` — the migration created none and dropped none.
--   * `grid_preference` — never created, so never dropped.
-- ============================================================================

BEGIN;

-- ── PART 1/2 reverse — the four tenant_isolation_policy rows ───────────────
-- Returns stops, route_template_stops and carrier_documents to FORCE RLS with
-- ZERO policies, which is the pre-migration state (and is what the drift
-- detector's standing WARNING reports).
DROP POLICY IF EXISTS tenant_isolation_policy ON stops;
DROP POLICY IF EXISTS tenant_isolation_policy ON route_template_stops;
DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_documents;
DROP POLICY IF EXISTS tenant_isolation_policy ON route_matrix_cache;

-- ── PART 2 reverse — route_matrix_cache RLS ────────────────────────────────
-- NO FORCE first, then DISABLE. Pre-migration state was rls=false, force=false.
ALTER TABLE route_matrix_cache NO FORCE ROW LEVEL SECURITY;
ALTER TABLE route_matrix_cache DISABLE ROW LEVEL SECURITY;

-- ── PART 4/5/6 reverse — grants, default privileges, role settings ─────────
-- Guarded the same way as the migration: skip with a NOTICE if app_user is
-- absent, never RAISE EXCEPTION.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE NOTICE 'quick-595 rollback: role app_user does not exist — nothing to revoke.';
    RETURN;
  END IF;

  REVOKE SELECT, INSERT, UPDATE, DELETE ON route_matrix_cache FROM app_user;
  REVOKE SELECT ON "Plan" FROM app_user;
  REVOKE SELECT ON "Promo" FROM app_user;
  REVOKE SELECT ON "NotificationTemplate" FROM app_user;
  REVOKE SELECT ON "NotificationEmailConfig" FROM app_user;
  REVOKE SELECT ON carrier_catalog_meta FROM app_user;
  REVOKE SELECT, INSERT, UPDATE, DELETE ON grid_view FROM app_user;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'grid_preference'
  ) THEN
    EXECUTE 'REVOKE SELECT, INSERT, UPDATE, DELETE ON grid_preference FROM app_user';
  END IF;

  -- Must be run as the SAME role that issued the ALTER DEFAULT PRIVILEGES
  -- (postgres) — default privileges are per creating role.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    REVOKE SELECT, INSERT, UPDATE, DELETE ON TABLES FROM app_user;

  ALTER ROLE app_user RESET idle_in_transaction_session_timeout;

  -- ALTER ROLE app_user WITH NOLOGIN;  -- deliberately NOT here; see header.
END
$$;

-- ── PART 7 reverse — the two new indexes ───────────────────────────────────
DROP INDEX IF EXISTS carrier_documents_uploaded_by_idx;
DROP INDEX IF EXISTS "grid_view_userId_idx";

COMMIT;
