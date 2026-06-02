-- ============================================================================
-- Quick-419 Phase 1 ROLLBACK: Restore pre-migration app_user grant state
-- Inverse of: 20260602000001_phase1_grant_app_user_dml/migration.sql
-- Pre-migration state:
--   - 49 CRITICAL tables: had ZERO grants — REVOKE all 4 privileges
--   - Tenant: had SELECT only — REVOKE INSERT, UPDATE, DELETE (keep SELECT)
--   - audit_log: had SELECT + INSERT only — REVOKE UPDATE, DELETE (keep SELECT + INSERT)
-- ============================================================================
BEGIN;

-- ── Fully granted tables — revoke all 4 (restores zero-grant state) ──────────
REVOKE SELECT, INSERT, UPDATE, DELETE ON "ActivationProgress" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "AppEvent" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "AutomationRule" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "AutomationRun" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "Customer" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "CustomerInteraction" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "DocFeedback" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "Document" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON driver_bonuses FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON driver_compensation_templates FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON driver_deductions FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON driver_disputes FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON driver_pay_audit_logs FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON driver_settlements FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "DriverInvitation" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "DriverRouteJoin" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "ExpenseCategory" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "ExpenseTemplate" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "ExpenseTemplateItem" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "FleetMessage" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "FuelRecord" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "GPSLocation" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "Invoice" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "InvoiceItem" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "Load" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON load_driver_assignments FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON load_pay_components FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "MaintenanceEvent" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "NotificationLog" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "NotificationSubscription" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON pay_component_attachments FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "PayrollRecord" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "Playbook" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "PlaybookInstance" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "PlaybookNotification" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "Route" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "RouteExpense" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "RoutePayment" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "RouteStop" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "SafetyEvent" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "ScheduledService" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "StepTemplate" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "Subscription" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "TenantHealthScore" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "TenantIntegration" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "TenantMetricsDaily" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "TenantNotificationSettings" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "Truck" FROM app_user;
REVOKE SELECT, INSERT, UPDATE, DELETE ON "User" FROM app_user;

-- ── Partial grants — revoke ONLY what this migration added ───────────────────
-- Tenant: revoke INSERT, UPDATE, DELETE (SELECT remains — was pre-existing)
REVOKE INSERT, UPDATE, DELETE ON "Tenant" FROM app_user;
-- audit_log: revoke UPDATE, DELETE (SELECT + INSERT remain — were pre-existing)
REVOKE UPDATE, DELETE ON audit_log FROM app_user;

COMMIT;
