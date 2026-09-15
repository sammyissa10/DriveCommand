-- quick-606 — the ONE genuine missing table grant behind `/api/cron/workflow-notifications`.
--
-- ─── THIS FILE WILL REACH PRODUCTION ───────────────────────────────────────
--
-- `apps/web/vercel.json` runs `scripts/migrate.mjs` as its `buildCommand`, so
-- this migration IS applied to production on the next `vercel --prod`. That is
-- intended: the grant is MISSING ON PRODUCTION TOO, and the route fails there for
-- the same reason it failed on staging. It is applied to STAGING by hand here so
-- the fix can be measured before it ships.
--
-- ─── WHICH ROLE, AND WHY IT IS NOT app_user ────────────────────────────────
--
-- quick-604 classified this `MISSING_GRANT` and quick-606 re-measured it as
-- `42501` at `workflow-notifications/route.ts:145`. That line is
-- `getAdminDb('workflow blocked-instance sweep')`, so the statement runs as
-- **app_admin**, not app_user. Confirmed against `information_schema.role_table_grants`
-- on BOTH databases before this file was written
-- (`.planning/quick/606-…/evidence/07-grants.json`):
--
--   app_user  PlaybookNotification   DELETE,INSERT,SELECT,UPDATE   <- already fine
--   app_admin PlaybookNotification   — NO GRANT —                  <- the defect
--
-- The statement is a `findMany` on `PlaybookInstance` whose `where` carries
-- `notifications: { none: { notificationType: 'INSTANCE_BLOCKED', channel: 'EMAIL' } }`.
-- That nested filter compiles to a read of `PlaybookNotification`, and it is
-- load-bearing rather than over-broad: it excludes instances that already had an
-- EMAIL escalation, which is what stops the 48-hour sweep re-mailing the same
-- blocked instance every day. Read off the route, not assumed.
--
-- `20260914140000_admin_connection_role` granted app_admin SELECT on
-- `PlaybookInstance` and `StepInstance` — the two tables a static read of the
-- route names. The nested filter's table was missed. This is the class
-- `admin-connection.md` §5 records: grants only a real exercise of the path finds.
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- SELECT, on ONE table, to ONE role. Nothing schema-level, no DDL right, no
-- `ALL TABLES IN SCHEMA`, no policy touched. Every other table on both workflow
-- sweeps was checked against `role_table_grants` for app_admin and this is the
-- only one missing.
--
-- Guarded on `pg_roles` so it is a no-op wherever the role has not been created
-- (a fresh local database, a restored snapshot predating 20260914140000).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT SELECT ON TABLE public."PlaybookNotification" TO app_admin;
  END IF;
END
$$;
