-- ============================================================================
-- quick-600 — B5: the privileged admin connection role, `app_admin`
-- ============================================================================
--
-- STAGING ONLY AT THE TIME THIS MIGRATION WAS WRITTEN. This file creates the
-- role and its grants; it does NOT touch `DATABASE_URL`, does NOT perform any
-- part of the cutover, and grants nothing beyond the tables the ROUTING
-- MANIFEST names.
--   .planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md
--
-- ---------------------------------------------------------------------------
-- WHY A DEDICATED ROLE, `app_admin`, AND NOT `postgres`.
-- ---------------------------------------------------------------------------
-- `postgres` (today's `DATABASE_URL`) is far more than "a role that bypasses
-- RLS": rolsuper=false but rolcreaterole=true, rolcreatedb=true, and it is a
-- member of {app_user, service_role, authenticated, anon, pg_read_all_data,
-- pg_signal_backend, supabase_privileged_role, ...}. The admin connection this
-- task builds needs BYPASSRLS plus DML on the tables the routed paths touch,
-- and nothing else.
--
-- THE DECISIVE REASON IS THE BOOT GUARD. With `postgres` on the admin pool,
-- after a future cutover `DATABASE_URL_ADMIN` and today's `DATABASE_URL` would
-- be the SAME credential — `current_user` identical on both pools, so nothing
-- could distinguish a correct deployment from one where `DATABASE_URL` was
-- mistakenly pointed at the admin string. A naming convention is not a
-- control. With a dedicated role, `getAdminDb`'s two-direction boot guard
-- (apps/web/src/lib/db/admin-prisma.ts) becomes a real assertion: the admin
-- pool must report `current_user = 'app_admin'` AND `rolbypassrls = true`,
-- and — once `DB_ROLE_EXPECT_TENANT_ROLE` is armed post-cutover — the tenant
-- pool must report a DIFFERENT current_user with `rolbypassrls = false`.
--
-- It is also separately revocable (`ALTER ROLE app_admin NOLOGIN`) without
-- touching whatever role migrations themselves run as, and separately visible
-- in `pg_stat_activity` and the Supabase logs — `postgres` traffic today is
-- everything, so nothing there is currently attributable to "the privileged
-- surface" as opposed to "the app".
--
-- ---------------------------------------------------------------------------
-- THE PASSWORD IS NEVER IN THIS FILE, OR ANYWHERE IN GIT.
-- ---------------------------------------------------------------------------
-- This migration creates `app_admin` NOLOGIN. A human (or this task's
-- executor, for staging only) runs, OUT OF BAND, as a one-off statement never
-- committed:
--   ALTER ROLE app_admin LOGIN PASSWORD '<minted>';
-- The resulting connection string is written ONLY into the gitignored
-- `apps/web/.env.staging` as `STAGING_DATABASE_URL_ADMIN`, port 5432 session
-- mode. Production's value has the same shape and is set the same way, by a
-- human, directly against the production database — this migration, applied
-- to production later, does not grant LOGIN there either. See
-- docs/audits/admin-connection.md's "production runbook" section for exactly
-- who does that and where the resulting string is stored (Vercel env, never
-- git).
--
-- ---------------------------------------------------------------------------
-- THE GRANT SCOPE — EXACTLY THE ROUTING MANIFEST'S TABLE UNION, NOTHING ELSE.
-- ---------------------------------------------------------------------------
-- `app_admin` has BYPASSRLS, so policies do not constrain it at all — GRANTs
-- are the ONLY remaining control on this connection, which is the whole
-- argument for the narrow, explicit, alphabetised list below (never
-- `ALL TABLES IN SCHEMA`).
--
-- 15 tables, least-privilege per the routed sites that actually touch them
-- (ROUTING-MANIFEST.md §1–5). Every table that receives INSERT/UPDATE/DELETE
-- also receives SELECT: Postgres requires SELECT on any column referenced by
-- an UPDATE/DELETE's WHERE clause or by a RETURNING list (which Prisma's
-- `.create()`/`.update()` always issue), so SELECT-less write grants would
-- make the routed code fail on staging, not merely be needlessly generous.
--
--   AppEvent             INSERT, SELECT           -- extendTrial's appEvent.create
--   AutomationRun        SELECT, INSERT, UPDATE    -- automations.ts x3, evaluator.ts sweep-1 create path is DECORATIVE (left on bare prisma — not this role's concern) but the sweep write path (:107/:141/:151) needs all three
--   DriverInvitation     SELECT                    -- accept-invitation GET/POST invitation lookup
--   GPSLocation          SELECT                    -- track/[token] GPS lookup
--   Load                 SELECT                    -- track/[token] load-by-trackingToken lookup
--   PlaybookInstance     SELECT                    -- workflow-digest / workflow-notifications sweep 2
--   StepInstance         SELECT                    -- workflow-notifications sweep 1
--   Subscription         SELECT, UPDATE            -- extendTrial (read + update)
--   SupportTicket        SELECT, UPDATE            -- auto-close-tickets sweep, updateTicketStatus, addAdminReply
--   SysAdminInvoice      SELECT, INSERT, UPDATE    -- sysadmin-invoices.ts, billing/[id], mark-overdue-invoices, send-sysadmin-invoice
--   SysAdminInvoiceItem  SELECT, INSERT, DELETE    -- sysadmin-invoices.ts create/update-then-recreate
--   Tenant               SELECT, INSERT, UPDATE, DELETE -- digest/reminder sweeps (S), tenants.ts x6 (I/U/U/U/U/D), tenant.repository listAllTenants (S) + findTenantByUserId (S, via User include)
--   TicketMessage        SELECT, INSERT            -- getTicketMessages, addAdminReply's message create
--   Truck                SELECT                    -- track/[token]'s truck relation
--   User                 SELECT                    -- findTenantByUserId, addAdminReply's raw email lookup, sysadmin-invoices/send-sysadmin-invoice owner lookups, track/[token]'s driver relation, billing/[id]'s createdBy/updatedBy relations
--
-- DELIBERATELY NOT IN THIS MIGRATION, each excluded on purpose:
--   * `GRANT ALL` on any table — the whole point is a countable, narrow surface.
--   * `ALTER DEFAULT PRIVILEGES` — a table added later must NOT be automatically
--     reachable by `app_admin`; adding an admin path is always its own migration.
--   * `CREATE` on schema `public` — app_admin never creates objects.
--   * Any role membership (no `GRANT app_user TO app_admin` or the reverse).
--   * `LOGIN` and any password — granted out of band, never in a migration file.
--   * `_prisma_migrations`, `"Plan"`, `"Promo"` — untouched by any routed site.
--   * Every table no routed site touches — verified against
--     ROUTING-MANIFEST.md's table union, which this migration's grant list
--     equals exactly (both directions — apps/web/scripts/audit/600-admin-verify.ts
--     and this task's Task 1 verify step assert the diff is empty).
--   * `GRANT USAGE, SELECT ON SEQUENCE` — checked via
--     `information_schema.columns.column_default LIKE 'nextval%'` over every
--     table in the union above (evidence/00-baseline.md); every id in this
--     set is cuid/uuid, none is a Postgres serial/identity column, so no
--     sequence grant is needed anywhere in this migration.
--
-- ---------------------------------------------------------------------------
-- STATEMENT_TIMEOUT.
-- ---------------------------------------------------------------------------
-- A privileged connection with no ceiling is a privileged connection that can
-- take the database down. `ALTER ROLE app_admin SET statement_timeout = '30s'`
-- — the same order of magnitude as `TX_OPTIONS.timeout` (30000ms) already used
-- by every `prisma.$transaction` in this codebase (apps/web/src/lib/db/prisma.ts),
-- so routed admin transactions are not newly constrained relative to what they
-- ran under today.
--
-- ---------------------------------------------------------------------------
-- `bypass_rls_policy` IS UNTOUCHED BY THIS MIGRATION.
-- ---------------------------------------------------------------------------
-- Nothing below is `CREATE POLICY` or `DROP POLICY` — this migration only
-- creates a role and issues GRANTs. 86 `bypass_rls_policy` rows before, 86
-- after, identical sorted table list — asserted in Task 1's verify step
-- (evidence/00-baseline.md vs. a post-apply read-back), not merely counted.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCY.
-- ---------------------------------------------------------------------------
-- Role creation follows the established guarded pattern
-- (20260515000001_db_security_standardization:17-22) exactly: a `DO $$ BEGIN
-- IF NOT EXISTS (...) THEN CREATE ROLE ... END IF; END$$;` block, followed by
-- a separate idempotent `ALTER ROLE app_admin BYPASSRLS;` so a pre-existing
-- role without the attribute is corrected rather than silently accepted. Every
-- `GRANT` below is naturally idempotent (Postgres does not error on a
-- re-granted privilege). `CREATE ROLE` sits inside the `DO` block, which is
-- the established, permitted pattern — no policy DDL is inside any `DO` block
-- here, and there is no `CREATE`/`DROP POLICY` in this file at all, so the
-- line-anchored drift-replay parser (scripts/audit/rls-policy-replay.ts) has
-- nothing in this file to see either way.
--
-- ---------------------------------------------------------------------------
-- THE APPLY COMMAND ACTUALLY USED.
-- ---------------------------------------------------------------------------
-- Run from apps/web/, with BOTH variables pinned to the SAME staging string:
--
--   DIRECT_URL=<staging> DATABASE_URL=<staging> node scripts/migrate.mjs
--
-- Never `prisma migrate deploy`, never Supabase MCP `apply_migration` or
-- `execute_sql`, never `db push` — per DEC-17.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. Role creation — guarded, idempotent, NOLOGIN. LOGIN and the password are
--    granted out of band, by a human, never in this file.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    CREATE ROLE app_admin BYPASSRLS NOLOGIN;
  END IF;
END$$;

-- Idempotent correction: if a role named app_admin already existed without
-- BYPASSRLS (should never happen given the guard above, but this makes the
-- attribute itself declarative rather than "whatever CREATE ROLE happened to
-- set the first time").
ALTER ROLE app_admin BYPASSRLS;

-- A privileged connection with no ceiling can take the database down.
ALTER ROLE app_admin SET statement_timeout = '30s';


-- ────────────────────────────────────────────────────────────────────────────
-- 2. Schema usage — required before any table-level grant is usable.
-- ────────────────────────────────────────────────────────────────────────────

GRANT USAGE ON SCHEMA public TO app_admin;


-- ────────────────────────────────────────────────────────────────────────────
-- 3. Table grants — exactly the ROUTING-MANIFEST.md table union, least
--    privilege per table (see the per-table comment above for which routed
--    site needs which verb). One explicit, alphabetised list — never
--    `GRANT ... ON ALL TABLES IN SCHEMA public`.
-- ────────────────────────────────────────────────────────────────────────────

GRANT INSERT, SELECT                    ON "AppEvent"            TO app_admin;
GRANT SELECT, INSERT, UPDATE            ON "AutomationRun"       TO app_admin;
GRANT SELECT                            ON "DriverInvitation"    TO app_admin;
GRANT SELECT                            ON "GPSLocation"         TO app_admin;
GRANT SELECT                            ON "Load"                TO app_admin;
GRANT SELECT                            ON "PlaybookInstance"    TO app_admin;
GRANT SELECT                            ON "StepInstance"        TO app_admin;
GRANT SELECT, UPDATE                    ON "Subscription"        TO app_admin;
GRANT SELECT, UPDATE                    ON "SupportTicket"       TO app_admin;
GRANT SELECT, INSERT, UPDATE            ON "SysAdminInvoice"     TO app_admin;
GRANT SELECT, INSERT, DELETE            ON "SysAdminInvoiceItem" TO app_admin;
GRANT SELECT, INSERT, UPDATE, DELETE    ON "Tenant"               TO app_admin;
GRANT SELECT, INSERT                    ON "TicketMessage"       TO app_admin;
GRANT SELECT                            ON "Truck"               TO app_admin;
GRANT SELECT                            ON "User"                TO app_admin;

-- No `GRANT USAGE, SELECT ON SEQUENCE ...` — see header. Every id column on
-- every table above is cuid/uuid; none has a Postgres serial/identity default.

-- ────────────────────────────────────────────────────────────────────────────
-- 4. FOUND VIA BOTH-DIRECTIONS TESTING (Task 3), not anticipated by the
--    routing manifest's static read of application code — recorded here
--    rather than silently folded into section 3 above, per CLAUDE.md's rule
--    that a found gap is reported, not quietly absorbed.
--
--    `INSERT INTO "Tenant"` (the `sysadmin tenant create` routed site) fires
--    an EXISTING `AFTER INSERT` trigger, `trg_seed_tenant_notification_settings`
--    (20260514200001_add_notification_system), which runs
--    `seed_tenant_notification_settings()` — NOT `SECURITY DEFINER`, so it
--    executes with the INVOKING role's privileges, i.e. `app_admin`'s. That
--    function reads `"NotificationTemplate"` and inserts into
--    `"TenantNotificationSettings"`. `app_admin` had grants on neither, so
--    every admin-side `Tenant` create failed with `42501` the first time it
--    was actually exercised on staging (evidence/03-routed-sites.json, S10)
--    — a green migration apply proves nothing about a trigger's OWN
--    permission needs, only about the statements this file states directly.
--
--    `TenantNotificationSettings` carries RLS (`bypass_rls_policy` +
--    `tenant_isolation_policy`) — irrelevant to `app_admin`, which bypasses
--    RLS regardless of grants; the blocker was the GRANT layer only.
--    `NotificationTemplate` carries NO RLS at all (`relrowsecurity = false`).
--
--    `SELECT` on `TenantNotificationSettings` is ALSO required, not merely
--    `INSERT` — the trigger's statement is `INSERT ... ON CONFLICT
--    ("tenantId","triggerKey") DO NOTHING`, and Postgres requires `SELECT`
--    on the conflict target's columns to evaluate the `ON CONFLICT` clause,
--    independent of the `INSERT` privilege. Measured directly: granting
--    `INSERT` alone still raised `42501 permission denied for table
--    TenantNotificationSettings`; only adding `SELECT` resolved it.
-- ────────────────────────────────────────────────────────────────────────────

GRANT SELECT                        ON "NotificationTemplate"       TO app_admin;
GRANT SELECT, INSERT                ON "TenantNotificationSettings" TO app_admin;


-- ============================================================================
-- ROLLBACK — COMMENTED OUT. NOT APPLIED BY ANYTHING.
-- ============================================================================
-- To revert on staging, run by hand (do NOT uncomment in place — migrate.mjs
-- skips by migration_name and would never re-run this file; the drift replay
-- only reads CREATE/DROP POLICY lines, so uncommenting here is inert to it,
-- but the block is kept commented for the same discipline as every other
-- migration in this repo):
--
-- REVOKE ALL PRIVILEGES ON "AppEvent", "AutomationRun", "DriverInvitation",
--   "GPSLocation", "Load", "PlaybookInstance", "StepInstance", "Subscription",
--   "SupportTicket", "SysAdminInvoice", "SysAdminInvoiceItem", "Tenant",
--   "TicketMessage", "Truck", "User"
-- FROM app_admin;
-- REVOKE USAGE ON SCHEMA public FROM app_admin;
-- ALTER ROLE app_admin NOLOGIN;
-- -- DROP ROLE app_admin; -- only after confirming no session anywhere holds it
-- ============================================================================
