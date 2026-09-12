-- ============================================================================
-- quick-595 — DEFERRED: drop `bypass_rls_policy` from every table that has one
--
-- ***  NOT APPLIED.  ***  This file has never been run against any database,
-- ***  and `scripts/migrate.mjs` cannot run it: the applier filters migration
-- ***  directories on `existsSync(dir/migration.sql)` and the drift detector
-- ***  `statSync`s the same path. A sibling file is INERT to both.
-- ============================================================================
--
-- WHY IT IS DEFERRED — THE TRIPWIRE FIRED
--
--   docs/audits/bypass-call-classification.md classified all 211 executable
--   `app.bypass_rls` call sites across 103 files:
--
--       DECORATIVE   161 sites / 84 files
--       CROSS_TENANT  50 sites / 26 files   <-- tripwire threshold was 20
--       UNKNOWN        0
--
--   50 > 20, so quick-595 took **BRANCH A**: ship the policy, grant,
--   default-privilege and index closure, and DO NOT remove the bypass path.
--   Dropping these 86 policies today would make 50 genuinely cross-tenant
--   code paths — auth/login/invitation/email-confirm/signup, public shipment
--   tracking, the cron routes, the `(admin)` sysadmin actions, sender-config,
--   tenant.repository, and the raw-SQL fleet-position queries — start
--   returning zero rows the moment `DATABASE_URL` moves to `app_user`.
--   Each of those needs a deliberate remedy first (a privileged connection
--   for the genuinely global ones, `getTenantPrismaForOrg` for the rest).
--
-- HOW TO PROMOTE THIS FILE
--
--   Copy it into a NEW migration directory as `migration.sql`. Never rename
--   this file in place and never edit the already-applied migration beside it.
--
--   *** THE DROPS AND THE EXPECTED-SET CHANGE MUST LAND IN THE SAME APPLY. ***
--   The drift detector replays the repository's `CREATE POLICY` / `DROP
--   POLICY` statements in file order and diffs the net result against live
--   `pg_policy`. Promoting this file removes 86 policies from BOTH sides at
--   once, which is correct. But if the policies are dropped out of band (by
--   hand, by `execute_sql`, by anything that is not a committed
--   `migration.sql`) the expected set stays at 86 and the gate reports
--   **86 MISSING**. And if a `DROP POLICY` here were ever hidden inside a
--   `DO $$ ... EXECUTE format(...) $$` block, the line-anchored parser
--   (`/^[ \t]*(CREATE|DROP)\s+POLICY .../gim`) could not see it, the expected
--   set would stay at 86 while the live set fell to 0, and the gate would
--   again report 86 missing. Every statement below is therefore plain static
--   SQL at column 0.
--
--   Before promoting, re-run the enumeration — this list was generated from
--   live `pg_policies` on STAGING (wyixpgunnjmzguhggocz) on 2026-09-12 and a
--   later migration may have added another table with the same companion
--   policy:
--
--     SELECT 'DROP POLICY IF EXISTS bypass_rls_policy ON '
--            || quote_ident(tablename) || ';'
--     FROM pg_policies
--     WHERE schemaname = 'public' AND policyname = 'bypass_rls_policy'
--     ORDER BY tablename;
--
-- NOT IN THIS FILE, deliberately: the four `tenant_isolation_policy` rows
--   quick-595 created (`stops`, `route_template_stops`, `carrier_documents`,
--   `route_matrix_cache`) ship WITHOUT a companion `bypass_rls_policy`, so
--   there is nothing to drop on them. They already behave the way every table
--   will behave after this file is promoted.
--
-- Count below: 86 statements, matching the 86 live instances measured on
-- staging (of 179 total policies).
-- ============================================================================

BEGIN;

DROP POLICY IF EXISTS bypass_rls_policy ON "ActivationProgress";
DROP POLICY IF EXISTS bypass_rls_policy ON "AppEvent";
DROP POLICY IF EXISTS bypass_rls_policy ON "AutomationRule";
DROP POLICY IF EXISTS bypass_rls_policy ON "AutomationRun";
DROP POLICY IF EXISTS bypass_rls_policy ON "Customer";
DROP POLICY IF EXISTS bypass_rls_policy ON "CustomerInteraction";
DROP POLICY IF EXISTS bypass_rls_policy ON "DispatchOverrideAudit";
DROP POLICY IF EXISTS bypass_rls_policy ON "DocFeedback";
DROP POLICY IF EXISTS bypass_rls_policy ON "Document";
DROP POLICY IF EXISTS bypass_rls_policy ON "DriverHOSEntry";
DROP POLICY IF EXISTS bypass_rls_policy ON "DriverIncident";
DROP POLICY IF EXISTS bypass_rls_policy ON "DriverInvitation";
DROP POLICY IF EXISTS bypass_rls_policy ON "DriverRouteJoin";
DROP POLICY IF EXISTS bypass_rls_policy ON "ExpenseCategory";
DROP POLICY IF EXISTS bypass_rls_policy ON "ExpenseTemplate";
DROP POLICY IF EXISTS bypass_rls_policy ON "ExpenseTemplateItem";
DROP POLICY IF EXISTS bypass_rls_policy ON "FleetMessage";
DROP POLICY IF EXISTS bypass_rls_policy ON "FuelRecord";
DROP POLICY IF EXISTS bypass_rls_policy ON "GPSLocation";
DROP POLICY IF EXISTS bypass_rls_policy ON "Invoice";
DROP POLICY IF EXISTS bypass_rls_policy ON "InvoiceItem";
DROP POLICY IF EXISTS bypass_rls_policy ON "Load";
DROP POLICY IF EXISTS bypass_rls_policy ON "MaintenanceEvent";
DROP POLICY IF EXISTS bypass_rls_policy ON "NotificationLog";
DROP POLICY IF EXISTS bypass_rls_policy ON "NotificationSendLog";
DROP POLICY IF EXISTS bypass_rls_policy ON "NotificationSubscription";
DROP POLICY IF EXISTS bypass_rls_policy ON "PayrollRecord";
DROP POLICY IF EXISTS bypass_rls_policy ON "Playbook";
DROP POLICY IF EXISTS bypass_rls_policy ON "PlaybookInstance";
DROP POLICY IF EXISTS bypass_rls_policy ON "PlaybookNotification";
DROP POLICY IF EXISTS bypass_rls_policy ON "PlaybookStep";
DROP POLICY IF EXISTS bypass_rls_policy ON "PlaybookTrigger";
DROP POLICY IF EXISTS bypass_rls_policy ON "PushToken";
DROP POLICY IF EXISTS bypass_rls_policy ON "Route";
DROP POLICY IF EXISTS bypass_rls_policy ON "RouteDriver";
DROP POLICY IF EXISTS bypass_rls_policy ON "RouteExpense";
DROP POLICY IF EXISTS bypass_rls_policy ON "RoutePayment";
DROP POLICY IF EXISTS bypass_rls_policy ON "RouteStop";
DROP POLICY IF EXISTS bypass_rls_policy ON "SafetyEvent";
DROP POLICY IF EXISTS bypass_rls_policy ON "ScheduledService";
DROP POLICY IF EXISTS bypass_rls_policy ON "StepInstance";
DROP POLICY IF EXISTS bypass_rls_policy ON "StepTemplate";
DROP POLICY IF EXISTS bypass_rls_policy ON "Subscription";
DROP POLICY IF EXISTS bypass_rls_policy ON "SupportTicket";
DROP POLICY IF EXISTS bypass_rls_policy ON "SysAdminInvoice";
DROP POLICY IF EXISTS bypass_rls_policy ON "SysAdminInvoiceItem";
DROP POLICY IF EXISTS bypass_rls_policy ON "Tag";
DROP POLICY IF EXISTS bypass_rls_policy ON "TagAssignment";
DROP POLICY IF EXISTS bypass_rls_policy ON "Tenant";
DROP POLICY IF EXISTS bypass_rls_policy ON "TenantHealthScore";
DROP POLICY IF EXISTS bypass_rls_policy ON "TenantIntegration";
DROP POLICY IF EXISTS bypass_rls_policy ON "TenantMetricsDaily";
DROP POLICY IF EXISTS bypass_rls_policy ON "TenantNotificationSettings";
DROP POLICY IF EXISTS bypass_rls_policy ON "TicketMessage";
DROP POLICY IF EXISTS bypass_rls_policy ON "Truck";
DROP POLICY IF EXISTS bypass_rls_policy ON "User";
DROP POLICY IF EXISTS bypass_rls_policy ON "UserNotificationPreference";
DROP POLICY IF EXISTS bypass_rls_policy ON audit_log;
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_compliance_alert_log;
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_document_types;
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_drivers;
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_expenses;
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_truck_defects;
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_trucks;
DROP POLICY IF EXISTS bypass_rls_policy ON client_contacts;
DROP POLICY IF EXISTS bypass_rls_policy ON clients;
DROP POLICY IF EXISTS bypass_rls_policy ON contracts;
DROP POLICY IF EXISTS bypass_rls_policy ON dispatches;
DROP POLICY IF EXISTS bypass_rls_policy ON document_import_pages;
DROP POLICY IF EXISTS bypass_rls_policy ON document_imports;
DROP POLICY IF EXISTS bypass_rls_policy ON document_profiles;
DROP POLICY IF EXISTS bypass_rls_policy ON driver_bonuses;
DROP POLICY IF EXISTS bypass_rls_policy ON driver_compensation_templates;
DROP POLICY IF EXISTS bypass_rls_policy ON driver_deductions;
DROP POLICY IF EXISTS bypass_rls_policy ON driver_disputes;
DROP POLICY IF EXISTS bypass_rls_policy ON driver_pay_audit_logs;
DROP POLICY IF EXISTS bypass_rls_policy ON driver_pay_records;
DROP POLICY IF EXISTS bypass_rls_policy ON driver_settlements;
DROP POLICY IF EXISTS bypass_rls_policy ON facilities;
DROP POLICY IF EXISTS bypass_rls_policy ON facility_external_references;
DROP POLICY IF EXISTS bypass_rls_policy ON in_app_notifications;
DROP POLICY IF EXISTS bypass_rls_policy ON load_driver_assignments;
DROP POLICY IF EXISTS bypass_rls_policy ON load_pay_components;
DROP POLICY IF EXISTS bypass_rls_policy ON loads;
DROP POLICY IF EXISTS bypass_rls_policy ON pay_component_attachments;
DROP POLICY IF EXISTS bypass_rls_policy ON route_templates;

COMMIT;
