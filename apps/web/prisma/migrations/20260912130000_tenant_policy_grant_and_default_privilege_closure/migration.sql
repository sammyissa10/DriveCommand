-- ============================================================================
-- quick-595 — Close the RLS policy, grant and default-privilege gap
-- ============================================================================
--
-- BRANCH DECISION: **BRANCH A**.
--   docs/audits/bypass-call-classification.md classifies the 211 executable
--   `app.bypass_rls` call sites across 103 files as:
--       DECORATIVE   161 sites / 84 files
--       CROSS_TENANT  50 sites / 26 files
--       UNKNOWN        0
--   The tripwire is "more than 20 CROSS_TENANT". 50 > 20, so it FIRED.
--   Consequences, all deliberate:
--     * `bypass_rls_policy` is NOT dropped by this migration. The prepared,
--       UNAPPLIED drop lives in the sibling `deferred-bypass-drop.sql`.
--     * No application path is moved to a privileged connection here.
--     * None of the 211 `app.bypass_rls` calls are deleted.
--
-- WHAT THIS MIGRATION DOES
--   1. Gives the three FORCE-RLS tables that run with ZERO policies a
--      `tenant_isolation_policy` (`stops`, `route_template_stops`,
--      `carrier_documents`).
--   2. Turns on (and forces) RLS for `route_matrix_cache` and gives it a
--      policy — closing the quick-520 hazard recorded in CLAUDE.md.
--   3. Grants `app_user` the DML it will need once `DATABASE_URL` moves off
--      the `postgres` role, on the nine tables that grant it nothing today.
--   4. Sets `ALTER DEFAULT PRIVILEGES` so a future table created in schema
--      `public` does not inherit the zero-grant defect.
--   5. Gives `app_user` LOGIN and a 30s idle-in-transaction cap.
--   6. Creates the two indexes the new policy subqueries and the grid_view
--      `userId` where-clauses need.
--
-- THIS MIGRATION CHANGES NOTHING AT RUNTIME TODAY.
--   The application connects as `postgres`, which has `rolbypassrls = true`.
--   FORCE RLS and every policy below are therefore DECORATIVE until the
--   Prompt 2 cutover flips `DATABASE_URL` to `app_user`. A green deploy of
--   this migration is NOT evidence that the policies work. Do not read it
--   as one.
--
-- DEVIATION FROM THE BRIEF — `stops` is scoped via `dispatch_id`, NOT
-- `load_id`. Measured on the live database before planning:
--     stops total ....................................... 791
--     stops with load_id NULL ............................  74  (9.4%)
--     stops with dispatch_id NULL ........................   0
--     stops where load.org_id IS DISTINCT FROM dispatch.org_id .. 0
--   A policy routed through `load_id` alone DENIES 74 rows to every tenant —
--   every fuel stop, layover and Phase 7 end stop, which is precisely the row
--   that exists to stop a trip looking like it finishes at the last delivery.
--   `dispatch_id` is NOT NULL with 100% coverage and provably never in
--   disagreement with the load path (0 divergent rows).
--   An `OR` of BOTH paths is deliberately NOT written: if the two ever
--   diverge, `OR` exposes one stop to BOTH tenants — it turns a coverage fix
--   into an isolation hole.
--
-- IDEMPOTENCY. Every statement is `IF EXISTS` / `IF NOT EXISTS` or sits
--   inside a guarded `DO` block. A second run is a no-op, and the file is
--   safe to apply to production unchanged even though production's state
--   differs (`grid_preference` exists there and NOT on staging — its grant is
--   guarded on `information_schema.tables`; this migration does NOT create
--   that table).
--
-- POLICY IDEMPOTENCY IDIOM — `DROP POLICY IF EXISTS` then `CREATE POLICY`,
--   BOTH AT COLUMN 0, in plain static SQL. The drift detector
--   (`scripts/audit/rls-policy-replay.ts`) parses with a LINE-ANCHORED regex
--   `/^[ \t]*(CREATE|DROP)\s+POLICY .../gim`. A `CREATE POLICY` hidden inside
--   `DO $$ ... EXECUTE format('CREATE POLICY ...') $$` is invisible to the
--   replay, so the policy goes live and is then reported as UNEXPECTED and
--   the zero-drift gate FAILS. Never wrap a policy statement in dynamic SQL
--   in this file. The replay applies DROP then CREATE in file order and nets
--   to present.
--
-- SIBLING FILES — neither is read by `scripts/migrate.mjs` (which filters on
--   `existsSync(dir/migration.sql)`) nor by the drift detector (which
--   `statSync`s the same path), so neither can be applied by accident:
--     rollback.sql ............. statement-for-statement inverse, UNAPPLIED
--     deferred-bypass-drop.sql . the Branch A `bypass_rls_policy` drop,
--                                UNAPPLIED
--
-- `"User".id` was confirmed `uuid` against `information_schema` on staging
-- before this file was written, so `u.id = carrier_documents.uploaded_by`
-- needs no cast.
--
-- A non-blocking (concurrent) index build is ILLEGAL here — `migrate.mjs`
-- wraps each migration in BEGIN/COMMIT (SQLSTATE 25001). Plain `CREATE INDEX IF NOT
-- EXISTS` only. The tables are tiny, so the ACCESS EXCLUSIVE hold is
-- sub-millisecond.
--
-- The chain must still replay from zero (quick-593). The grant block is
-- guarded on `pg_roles` and SKIPS with `RAISE NOTICE` — never `RAISE
-- EXCEPTION` — if `app_user` does not exist.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- PART 1 — the three FORCE-RLS tables that run with zero policies
--
-- Each policy matches the canonical shape read from live `pg_policies`
-- (e.g. `loads`, `route_templates`, `carrier_truck_defects`):
--   PERMISSIVE, FOR ALL, TO public, USING = WITH CHECK.
--
-- Each subquery reads an RLS-protected parent table, so the effective
-- predicate is "parent visible AND parent's org matches". That is equivalent,
-- because each parent's own `tenant_isolation_policy` is the same predicate —
-- and it correctly DENIES when the GUC is unset, since `current_tenant_id()`
-- returns NULL and `org_id = NULL` is never true.
-- ────────────────────────────────────────────────────────────────────────────

-- stops — scoped via dispatch_id -> dispatches.org_id. `dispatches` is the
-- @@map of the `Trip` model. Never load_id. Never an OR of both. See the
-- deviation note in the header for the four measured numbers.
DROP POLICY IF EXISTS tenant_isolation_policy ON stops;
CREATE POLICY tenant_isolation_policy ON stops
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM dispatches d
      WHERE d.id = stops.dispatch_id
        AND d.org_id = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM dispatches d
      WHERE d.id = stops.dispatch_id
        AND d.org_id = current_tenant_id()
    )
  );

-- route_template_stops — scoped via route_template_id -> route_templates.org_id.
-- 0 orphan template stops measured.
DROP POLICY IF EXISTS tenant_isolation_policy ON route_template_stops;
CREATE POLICY tenant_isolation_policy ON route_template_stops
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM route_templates rt
      WHERE rt.id = route_template_stops.route_template_id
        AND rt.org_id = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM route_templates rt
      WHERE rt.id = route_template_stops.route_template_id
        AND rt.org_id = current_tenant_id()
    )
  );

-- carrier_documents — scoped via uploaded_by -> "User"."tenantId".
-- "User" and "tenantId" are camelCase and MUST stay quoted (DEC-14: read the
-- catalogue, never infer a name from the convention around it).
-- NO tenant column is added and NO backfill is written for this table:
-- 0 documents have a missing uploader and 0 have an uploader with a NULL
-- "tenantId".
DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_documents;
CREATE POLICY tenant_isolation_policy ON carrier_documents
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = carrier_documents.uploaded_by
        AND u."tenantId" = current_tenant_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM "User" u
      WHERE u.id = carrier_documents.uploaded_by
        AND u."tenantId" = current_tenant_id()
    )
  );


-- ────────────────────────────────────────────────────────────────────────────
-- PART 2 — route_matrix_cache
--
-- CLAUDE.md (quick-520): "`route_matrix_cache` has RLS off and no `app_user`
-- grant — when that role flips it returns zero rows and silently stops
-- caching, visible only as provider volume." Both halves are closed here:
-- RLS + policy now, the grant in Part 4.
--
-- `org_id` is uuid NOT NULL, so this is the plain canonical predicate.
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE route_matrix_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_matrix_cache FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON route_matrix_cache;
CREATE POLICY tenant_isolation_policy ON route_matrix_cache
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());


-- ────────────────────────────────────────────────────────────────────────────
-- PART 3 — no companion bypass_rls_policy, deliberately
--
-- The four policies above ship WITHOUT a companion `bypass_rls_policy`,
-- diverging on purpose from the shape of the 86 tables that carry one. The
-- direction of travel is to REMOVE those 86 (see deferred-bypass-drop.sql),
-- so adding an 87th, 88th, 89th and 90th would be work done in order to undo
-- it.
--
-- Stated consequence, so nobody discovers it: after the Prompt 2 cutover
-- these four tables IGNORE `app.bypass_rls` while the other 86 still honour
-- it. Any code path that relies on the bypass to reach `stops`,
-- `route_template_stops`, `carrier_documents` or `route_matrix_cache` must
-- set `app.current_tenant_id` instead (i.e. `getTenantPrisma` /
-- `getTenantPrismaForOrg`), not the bypass.
-- ────────────────────────────────────────────────────────────────────────────


-- ────────────────────────────────────────────────────────────────────────────
-- PART 4/5/6 — grants, default privileges, role settings
--
-- One guarded block. If `app_user` does not exist — which is the case on a
-- from-zero replay before 20260515000001_db_security_standardization runs, or
-- on any fresh project where that migration has not yet been reached — this
-- SKIPS with a NOTICE. Never raise an exception: quick-593 exists because the
-- chain must replay from zero.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE NOTICE 'quick-595: role app_user does not exist — skipping grants, default privileges and role settings. This is expected on a from-zero replay that has not yet reached 20260515000001_db_security_standardization.';
    RETURN;
  END IF;

  -- ── PART 4 — grants ────────────────────────────────────────────────────

  -- route_matrix_cache — full DML. The L2 optimisation-matrix cache is read
  -- and written on the mutation paths (quick-520: `persist: true` is passed
  -- from exactly two places, both `apply*` mutations).
  GRANT SELECT, INSERT, UPDATE, DELETE ON route_matrix_cache TO app_user;

  -- SELECT ONLY on the five reference tables. This is the evidence answering
  -- the brief's "plus any write the sysadmin path provably needs" — the
  -- answer is NONE:
  --   Plan                    reads 3  / writes 2
  --   Promo                   reads 2  / writes 1
  --   NotificationTemplate    reads 15 / writes 2
  --   NotificationEmailConfig reads 3  / writes 2
  --   carrier_catalog_meta    reads 0  / writes 0
  -- Every write to the first four lives in
  -- `src/app/(admin)/actions/{plans,promos,notifications}.ts` — the sysadmin
  -- path, which per docs/audits/role-guard-storage-audit.md §4 runs on the
  -- privileged DATABASE_URL and NOT as app_user.
  -- `carrier_catalog_meta` has 0 reads and 0 writes in application code; it
  -- is granted SELECT to close the zero-grant CLASS, not because anything
  -- reads it.
  GRANT SELECT ON "Plan" TO app_user;
  GRANT SELECT ON "Promo" TO app_user;
  GRANT SELECT ON "NotificationTemplate" TO app_user;
  GRANT SELECT ON "NotificationEmailConfig" TO app_user;
  GRANT SELECT ON carrier_catalog_meta TO app_user;

  -- grid_view — full DML (5 reads / 5 writes in application code).
  GRANT SELECT, INSERT, UPDATE, DELETE ON grid_view TO app_user;

  -- grid_preference — full DML (1 read / 1 write), but the table exists on
  -- PRODUCTION and NOT on staging: it is absent from the migration chain
  -- entirely. Guarded so this file is a no-op where the table is missing.
  -- DO NOT CREATE IT HERE — that is a separate, deliberate decision.
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'grid_preference'
  ) THEN
    EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON grid_preference TO app_user';
  ELSE
    RAISE NOTICE 'quick-595: grid_preference is absent (expected on staging and on any from-zero replay) — grant skipped.';
  END IF;

  -- _prisma_migrations — NO GRANT, deliberately. The migration ledger is
  -- written by `scripts/migrate.mjs` running as `postgres`, never by the
  -- application. It therefore remains in the drift detector's "RLS enabled,
  -- not forced, zero policies" bucket BY DESIGN, and that is not a
  -- regression. (DEC-17: a read-back of this table from a non-owner role
  -- returns zero rows with no error, which is indistinguishable from "the row
  -- was never written" — another reason not to hand it to app_user.)
  --
  -- policy_drop_audit — NO GRANT, deliberately. It is the quick-584 DDL
  -- forensics sink (dropped_at / object_name / statement / session_role_name /
  -- client_addr), written by an event trigger running as the DDL-issuing role.
  -- It is not tenant-scoped and the application neither reads nor writes it.

  -- ── PART 5 — default privileges ────────────────────────────────────────
  --
  -- Closes the class rather than the instance: without this, EVERY future
  -- table created in schema `public` inherits the zero-grant defect and has
  -- to be remembered individually.
  --
  -- No `FOR ROLE` clause, so this attaches to the CURRENT role — which is
  -- `postgres`, the role `scripts/migrate.mjs` connects as on both staging
  -- and production. Default privileges are PER CREATING ROLE: a table created
  -- by any OTHER role still needs an explicit grant. That is a real limit and
  -- is stated rather than left to be discovered.
  ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_user;

  -- ── PART 6 — role settings ─────────────────────────────────────────────

  -- The instance-wide `idle_in_transaction_session_timeout` is 0 (no limit).
  -- 30s is ~6x Prisma's 5s default interactive-transaction timeout, so it
  -- cannot cut a legitimate transaction, and it bounds a leaked one against a
  -- 60-connection ceiling. Reversible with one `ALTER ROLE ... RESET`.
  ALTER ROLE app_user SET idle_in_transaction_session_timeout = '30s';

  -- Staging has rolcanlogin = false; production is already true, so this is a
  -- no-op there. It grants NO access on its own: the role still has no
  -- password, which Prompt 2 sets. Without it the Prompt 2 cutover cannot
  -- even open a connection on staging.
  ALTER ROLE app_user WITH LOGIN;
END
$$;


-- ────────────────────────────────────────────────────────────────────────────
-- PART 7 — indexes
--
-- Plain index builds, never the non-blocking form (see the header: migrate.mjs
-- wraps each migration in BEGIN/COMMIT, so a concurrent build is SQLSTATE 25001).
--
-- Already present, so the other three policy subqueries are covered:
--   stops_dispatch_id_idx ....................... YES
--   route_template_stops_route_template_id_idx .. YES
--   route_matrix_cache_org_idx .................. YES
-- ────────────────────────────────────────────────────────────────────────────

-- Covers the new carrier_documents policy subquery. Measured absent.
CREATE INDEX IF NOT EXISTS carrier_documents_uploaded_by_idx
  ON carrier_documents (uploaded_by);

-- grid_view already has (gridId, userId), which CANNOT serve a userId-leading
-- lookup — and `userId` is the column the application's where clauses use.
CREATE INDEX IF NOT EXISTS "grid_view_userId_idx"
  ON grid_view ("userId");
