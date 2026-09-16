-- quick-615 — the grant delta that makes the 44 newly-routed sysadmin and cron
-- statements work on the `app_admin` connection.
--
-- ─── WHICH SITES THIS SERVES, BY FUNCTION NAME ─────────────────────────────
--
--   "ActivationProgress"  SELECT
--     ActivationProgressSection            (admin)/tenants/[id]/activation-progress-section.tsx :20
--     the three activation candidate sweeps  api/cron/automations/route.ts :53 :71 :89
--
--   "DriverInvitation"    INSERT
--     createTenant                         (admin)/actions/tenants.ts :123
--                         UPDATE
--     resendOwnerInvitation                (admin)/actions/tenants.ts :376
--
--   "NotificationSendLog" SELECT
--     listNotificationSendLog              (admin)/actions/notifications.ts :250 :256
--     getDeliveryStatistics                (admin)/actions/notifications.ts :346-:369  (7 statements)
--
--   "Route"               SELECT
--     getAllTenants                        (admin)/actions/tenants.ts :32
--     getTenantById                        (admin)/actions/tenants.ts :297
--     — reached ONLY through `_count: { select: { users, trucks, routes } }`,
--       which Prisma emits as real correlated sub-selects. A `_count` is a
--       statement against another table and it appears in NO `prisma.<model>.`
--       grep of either file. This is the table the planning audit missed.
--
--   "User"                UPDATE
--     updateOwnerEmail                     (admin)/actions/tenants.ts :480
--     updateUserProfile (write + rollback) (admin)/actions/users.ts     :115 :130
--
-- ─── THE HELD SET WAS MEASURED, NOT COPIED ─────────────────────────────────
--
-- Against `information_schema.role_table_grants` on STAGING, before this file
-- was written (`scripts/audit/615-routing-verify.ts --grants`). The full
-- 14-table delta as measured:
--
--   table                 needed                   app_admin held           missing
--   ActivationProgress    SELECT                   (none)                   SELECT
--   AppEvent              SELECT                   INSERT, SELECT           --
--   AutomationRule        SELECT                   SELECT, UPDATE           --
--   AutomationRun         SELECT                   INSERT, SELECT, UPDATE   --
--   DriverInvitation      SELECT, INSERT, UPDATE   SELECT                   INSERT, UPDATE
--   Load                  SELECT                   SELECT                   --
--   NotificationSendLog   SELECT                   (none)                   SELECT
--   Route                 SELECT                   (none)                   SELECT
--   Subscription          SELECT                   SELECT, UPDATE           --
--   SupportTicket         SELECT                   SELECT, UPDATE           --
--   Tenant                SELECT                   SELECT/INSERT/UPDATE/DEL --
--   TicketMessage         SELECT                   INSERT, SELECT           --
--   Truck                 SELECT                   SELECT                   --
--   User                  SELECT, UPDATE           SELECT                   UPDATE
--
-- `admin-connection.md` §2's prose list is STALE and was NOT used as the
-- authority: it names 17 tables, omits `AutomationRule` entirely (quick-613
-- added it), omits `ActivationProgress`, `NotificationSendLog` and `Route`, and
-- understates `DriverInvitation` and `User` as SELECT-only. CLAUDE.md repeats
-- the same stale list. Read the catalog, never a comment about it — the same
-- rule as DEC-14 and the medical-card column.
--
-- ─── WHY THESE OPERATIONS AND NO MORE ──────────────────────────────────────
--
-- `app_admin` carries `BYPASSRLS`, so no policy constrains it and GRANTs are
-- the entire remaining control surface. Least privilege per routed site, never
-- `GRANT ALL`.
--
-- Deliberately NOT granted, each because no routed statement exercises it:
--   * DELETE on anything here. No sysadmin surface in this task deletes an
--     invitation, a send-log row, a route or an activation record.
--   * INSERT on "ActivationProgress", "NotificationSendLog", "Route", "User".
--     Those rows are written by tenant paths and by the notification
--     dispatcher, never by a routed admin statement.
--   * SELECT on "DriverInvitation" and "User" — already held, and re-granting
--     a held privilege would hide which half of this file is the change.
-- Naming the exclusions is what makes their absence a decision rather than an
-- oversight.
--
-- No sequence grant: every id in this set is a uuid/cuid default, checked via
-- `information_schema.columns.column_default LIKE 'nextval%'` over the union.
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Six privileges across five tables, to ONE role. NO POLICY DDL — this
-- migration changes no policy, so `npm run audit:rls-policy-drift` must stay
-- zero and `rls-policy-canonical.json` is NOT regenerated. Nothing
-- schema-level, no `ALL TABLES IN SCHEMA`, no `ALTER DEFAULT PRIVILEGES`, no
-- role membership, nothing granted to `app_user` (which already holds full DML
-- on all of these from the Phase 1 grants).
--
-- ─── THIS FILE WILL REACH PRODUCTION ───────────────────────────────────────
--
-- `apps/web/vercel.json` runs `scripts/migrate.mjs` as its `buildCommand`, so
-- this migration IS applied to production on the next `vercel --prod`. That is
-- intended: the grants are missing on production too, and every statement this
-- task routed would fail there for the same reason. It is applied to STAGING by
-- hand here so the fix can be measured before it ships.
--
-- Guarded on `pg_roles` so it is a no-op wherever the role has not been created
-- (a fresh local database, a restored snapshot predating 20260914140000).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT SELECT ON TABLE public."ActivationProgress" TO app_admin;
    GRANT INSERT, UPDATE ON TABLE public."DriverInvitation" TO app_admin;
    GRANT SELECT ON TABLE public."NotificationSendLog" TO app_admin;
    GRANT SELECT ON TABLE public."Route" TO app_admin;
    GRANT UPDATE ON TABLE public."User" TO app_admin;
  END IF;
END
$$;
