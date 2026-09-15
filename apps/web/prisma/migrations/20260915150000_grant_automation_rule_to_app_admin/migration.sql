-- quick-613 — the grant that makes the five routed sysadmin `AutomationRule`
-- statements work on the `app_admin` connection.
--
-- ─── WHICH SITES THIS SERVES ───────────────────────────────────────────────
--
-- `apps/web/src/app/(admin)/actions/automations.ts`, all five statements moved
-- off the bare (tenant) client in the same task:
--
--   getAutomationRules    findMany + _count.runs            -> SELECT
--   getRuleWithRuns       findUnique + include runs.tenant  -> SELECT
--   toggleRuleActive      update { isActive }               -> UPDATE
--   manualTriggerRule     tenant.findUnique                 -> (Tenant, already granted)
--   manualTriggerRule     automationRule.findUnique         -> SELECT
--
-- ─── app_admin HAD NO GRANT AT ALL ON THIS TABLE ───────────────────────────
--
-- Measured against `information_schema.role_table_grants` on STAGING before this
-- file was written. The only grantee row for `"AutomationRule"` was:
--
--   app_user   AutomationRule   DELETE, INSERT, SELECT, UPDATE
--   app_admin  AutomationRule   — NO GRANT —
--
-- `app_admin` carries `BYPASSRLS`, so no policy constrains it and **GRANTs are
-- the only control left on that connection** (`admin-connection.md` §2).
-- Routing these statements without this grant does not fix anything — it moves
-- the `42501` from the tenant role to the admin role. That transition is
-- measured directly: `scripts/audit/613-routing-verify.ts --before` records the
-- routed UPDATE as `ERROR [42501]` on `app_admin`, and `--after` records it as
-- one row affected.
--
-- ─── WHY SELECT AND UPDATE ONLY ────────────────────────────────────────────
--
-- Least privilege per routed site, never `GRANT ALL` (`admin-connection.md` §2).
-- No routed path creates a rule and no routed path removes one: the sysadmin
-- automation surface lists rules, reads one with its runs, and flips `isActive`.
-- The two write verbs deliberately excluded here are therefore exactly the two
-- capabilities no sysadmin screen in this repository exercises — naming them is
-- what makes their absence a decision rather than an oversight.
--
-- Every other table the five routed statements touch is already granted by
-- `20260914140000_admin_connection_role`: `AutomationRun` (SELECT, INSERT,
-- UPDATE) for the `_count.runs` aggregate and the run list, and `Tenant`
-- (SELECT, INSERT, UPDATE, DELETE) for the manual trigger's tenant lookup and
-- the `runs.tenant.name` join.
--
-- ─── SCOPE ─────────────────────────────────────────────────────────────────
--
-- Two privileges, on ONE table, to ONE role. No policy DDL — this migration
-- changes no policy, so `npm run audit:rls-policy-drift` must be unchanged from
-- quick-612's post-state and `rls-policy-canonical.json` is NOT regenerated.
-- Nothing schema-level, no `ALL TABLES IN SCHEMA`, no `ALTER DEFAULT
-- PRIVILEGES`, no role membership, no sequence grant (`AutomationRule.id` is a
-- cuid/uuid default, not a serial).
--
-- ─── THIS FILE WILL REACH PRODUCTION ───────────────────────────────────────
--
-- `apps/web/vercel.json` runs `scripts/migrate.mjs` as its `buildCommand`, so
-- this migration IS applied to production on the next `vercel --prod`. That is
-- intended: the grant is MISSING ON PRODUCTION TOO, and `toggleRuleActive`
-- breaks there for the same reason it breaks on staging once the routing lands.
-- It is applied to STAGING by hand here so the fix can be measured before it
-- ships.
--
-- Guarded on `pg_roles` so it is a no-op wherever the role has not been created
-- (a fresh local database, a restored snapshot predating 20260914140000) — the
-- same guard as `20260915130000_grant_playbook_notification_to_app_admin`.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_admin') THEN
    GRANT SELECT, UPDATE ON TABLE public."AutomationRule" TO app_admin;
  END IF;
END
$$;
