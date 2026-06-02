-- ============================================================================
-- Quick-419 Phase 1: Grant app_user DML on all tenant-scoped FORCE-RLS tables
-- Spec: docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md Section 2.4
-- Audit script: apps/web/scripts/audit/app-user-grant-audit.ts
-- Live audit run: 2026-06-02 — 83 FORCE-RLS tables total, 51 with gaps
--   - 49 tables: CRITICAL — missing all 4 grants (SELECT, INSERT, UPDATE, DELETE)
--   - Tenant: partial — missing INSERT, UPDATE, DELETE (SELECT already granted)
--   - audit_log: partial — missing UPDATE, DELETE (SELECT + INSERT already granted)
-- ============================================================================
-- ADDITIVE — no behavior change:
--   Production continues to connect as the postgres superuser (BYPASSRLS=true).
--   This migration only GRANTs missing privileges so the DB is ready for a future
--   Phase 2 cutover to app_user without application-level changes.
-- ============================================================================
-- Section 4.12 allowlist tables — EXCLUDED (not FORCE-RLS, zero grants added):
--   _prisma_migrations  — excluded by audit query (c.relname != '_prisma_migrations')
--   Plan                — not FORCE-RLS, not in audit results
--   Promo               — not FORCE-RLS, not in audit results
--   carrier_catalog_meta — not FORCE-RLS, not in audit results
--   NotificationTemplate — not FORCE-RLS, not in audit results
--   NotificationEmailConfig — not FORCE-RLS, not in audit results
--   grid_preference     — not FORCE-RLS, not in audit results
--   grid_view           — not FORCE-RLS, not in audit results
-- ============================================================================
BEGIN;

-- ── Fully missing (49 CRITICAL tables — grant all 4) ─────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON "ActivationProgress" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AppEvent" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AutomationRule" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "AutomationRun" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Customer" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "CustomerInteraction" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DocFeedback" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Document" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_bonuses TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_compensation_templates TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_deductions TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_disputes TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_pay_audit_logs TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_settlements TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DriverInvitation" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DriverRouteJoin" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ExpenseCategory" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ExpenseTemplate" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ExpenseTemplateItem" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FleetMessage" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "FuelRecord" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "GPSLocation" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Invoice" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "InvoiceItem" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Load" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON load_driver_assignments TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON load_pay_components TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "MaintenanceEvent" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "NotificationLog" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "NotificationSubscription" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON pay_component_attachments TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PayrollRecord" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Playbook" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookInstance" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookNotification" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Route" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RouteExpense" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RoutePayment" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "RouteStop" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SafetyEvent" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "ScheduledService" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "StepTemplate" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Subscription" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TenantHealthScore" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TenantIntegration" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TenantMetricsDaily" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TenantNotificationSettings" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Truck" TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON "User" TO app_user;

-- ── Partial grants — add ONLY the missing privileges ─────────────────────────
-- Tenant: SELECT already granted (Quick-410); add INSERT, UPDATE, DELETE
GRANT INSERT, UPDATE, DELETE ON "Tenant" TO app_user;
-- audit_log: SELECT + INSERT already granted; add UPDATE, DELETE
GRANT UPDATE, DELETE ON audit_log TO app_user;

-- ── Self-validation block ─────────────────────────────────────────────────────
-- Raises an exception (rolling back the whole transaction) if any tenant-scoped
-- FORCE-RLS table (excluding Section 4.12 allowlist) still has missing grants.
DO $$
DECLARE
  missing_count INT;
BEGIN
  SELECT COUNT(*) INTO missing_count
  FROM (
    SELECT
      c.relname,
      COALESCE(bool_or(g.privilege_type = 'SELECT'), false) AS has_select,
      COALESCE(bool_or(g.privilege_type = 'INSERT'), false) AS has_insert,
      COALESCE(bool_or(g.privilege_type = 'UPDATE'), false) AS has_update,
      COALESCE(bool_or(g.privilege_type = 'DELETE'), false) AS has_delete
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    LEFT JOIN information_schema.role_table_grants g
      ON  g.table_schema   = 'public'
      AND g.table_name     = c.relname
      AND g.grantee        = 'app_user'
      AND g.privilege_type IN ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
    WHERE n.nspname              = 'public'
      AND c.relkind              = 'r'
      AND c.relrowsecurity       = true
      AND c.relforcerowsecurity  = true
      AND c.relname NOT IN (
        '_prisma_migrations',
        'Plan', 'Promo', 'carrier_catalog_meta',
        'NotificationTemplate', 'NotificationEmailConfig',
        'grid_preference', 'grid_view'
      )
    GROUP BY c.relname
    HAVING NOT (
      COALESCE(bool_or(g.privilege_type = 'SELECT'), false)
      AND COALESCE(bool_or(g.privilege_type = 'INSERT'), false)
      AND COALESCE(bool_or(g.privilege_type = 'UPDATE'), false)
      AND COALESCE(bool_or(g.privilege_type = 'DELETE'), false)
    )
  ) incomplete;

  IF missing_count > 0 THEN
    RAISE EXCEPTION 'quick-419: % tenant-scoped table(s) still missing app_user grants after migration', missing_count;
  END IF;
END$$;

COMMIT;
