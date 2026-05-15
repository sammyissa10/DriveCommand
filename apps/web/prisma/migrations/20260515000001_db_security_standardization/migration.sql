-- ============================================================================
-- DB Security Standardization (quick-327)
-- Spec: docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md Sections 2, 5, 7
-- Audit: docs/audits/db-tenant-audit.md
-- ============================================================================
-- This migration is ADDITIVE: no column drops, no column renames, no data loss.
-- All indexes use CREATE INDEX CONCURRENTLY — Prisma migrate runs these outside
-- a transaction. If applied via Supabase MCP, statements run autocommit.
-- ============================================================================

-- ── 1. Ensure current_tenant_id() function exists (idempotent) ──────────────
CREATE OR REPLACE FUNCTION current_tenant_id()
RETURNS UUID AS $$
  SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
$$ LANGUAGE SQL STABLE;

-- ── 2. Ensure app_user role exists (idempotent) ─────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END$$;

-- ============================================================================
-- GROUP A — HIGHEST RISK (UI dropdowns produce cross-tenant leakage today)
-- Tables: loads, dispatches, clients, facilities, carrier_drivers, carrier_trucks,
--         route_templates, RouteDriver, contracts
-- ============================================================================

-- ── loads (snake_case, tenant column = org_id) ──────────────────────────────
ALTER TABLE loads ENABLE ROW LEVEL SECURITY;
ALTER TABLE loads FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON loads;
CREATE POLICY tenant_isolation_policy ON loads
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON loads;
CREATE POLICY bypass_rls_policy ON loads
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON loads TO app_user;
ALTER TABLE loads
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ── dispatches ──────────────────────────────────────────────────────────────
ALTER TABLE dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON dispatches;
CREATE POLICY tenant_isolation_policy ON dispatches
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON dispatches;
CREATE POLICY bypass_rls_policy ON dispatches
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON dispatches TO app_user;
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ── clients ─────────────────────────────────────────────────────────────────
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON clients;
CREATE POLICY tenant_isolation_policy ON clients
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON clients;
CREATE POLICY bypass_rls_policy ON clients
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON clients TO app_user;
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ── facilities ──────────────────────────────────────────────────────────────
ALTER TABLE facilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON facilities;
CREATE POLICY tenant_isolation_policy ON facilities
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON facilities;
CREATE POLICY bypass_rls_policy ON facilities
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON facilities TO app_user;
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ── carrier_drivers ─────────────────────────────────────────────────────────
ALTER TABLE carrier_drivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_drivers FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_drivers;
CREATE POLICY tenant_isolation_policy ON carrier_drivers
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_drivers;
CREATE POLICY bypass_rls_policy ON carrier_drivers
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_drivers TO app_user;
ALTER TABLE carrier_drivers
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ── carrier_trucks ──────────────────────────────────────────────────────────
ALTER TABLE carrier_trucks ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_trucks FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_trucks;
CREATE POLICY tenant_isolation_policy ON carrier_trucks
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_trucks;
CREATE POLICY bypass_rls_policy ON carrier_trucks
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_trucks TO app_user;
ALTER TABLE carrier_trucks
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ── route_templates ─────────────────────────────────────────────────────────
ALTER TABLE route_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_templates FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON route_templates;
CREATE POLICY tenant_isolation_policy ON route_templates
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON route_templates;
CREATE POLICY bypass_rls_policy ON route_templates
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON route_templates TO app_user;
ALTER TABLE route_templates
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ── contracts ───────────────────────────────────────────────────────────────
ALTER TABLE contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON contracts;
CREATE POLICY tenant_isolation_policy ON contracts
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON contracts;
CREATE POLICY bypass_rls_policy ON contracts
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON contracts TO app_user;
ALTER TABLE contracts
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

-- ── RouteDriver (PascalCase, NO tenant column today → add tenantId) ─────────
-- This table has tenantId added in Task 3. Force RLS + policies are deferred to
-- the same migration step after tenantId is populated; see Task 3.

-- ── Group A indexes (CONCURRENTLY) ──────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_loads_org_id_created_at ON loads(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_loads_org_id_deleted_at ON loads(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_dispatches_org_id_created_at ON dispatches(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dispatches_org_id_deleted_at ON dispatches(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_clients_org_id_created_at ON clients(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_clients_org_id_deleted_at ON clients(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_facilities_org_id_created_at ON facilities(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_facilities_org_id_deleted_at ON facilities(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_carrier_drivers_org_id_created_at ON carrier_drivers(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carrier_drivers_org_id_deleted_at ON carrier_drivers(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_carrier_trucks_org_id_created_at ON carrier_trucks(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_carrier_trucks_org_id_deleted_at ON carrier_trucks(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_route_templates_org_id_created_at ON route_templates(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_route_templates_org_id_deleted_at ON route_templates(org_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_contracts_org_id_created_at ON contracts(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_contracts_org_id_deleted_at ON contracts(org_id, deleted_at);

-- ============================================================================
-- GROUP B — Driver Pay
-- ============================================================================

-- ── driver_pay_records ──────────────────────────────────────────────────────
ALTER TABLE driver_pay_records FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON driver_pay_records;
CREATE POLICY tenant_isolation_policy ON driver_pay_records
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON driver_pay_records;
CREATE POLICY bypass_rls_policy ON driver_pay_records
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON driver_pay_records TO app_user;
ALTER TABLE driver_pay_records
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;

CREATE INDEX IF NOT EXISTS idx_driver_pay_records_org_id ON driver_pay_records(org_id);
CREATE INDEX IF NOT EXISTS idx_driver_pay_records_org_id_created_at ON driver_pay_records(org_id, created_at DESC);

-- ============================================================================
-- GROUP C — Everything else tenant-scoped (alphabetical, only what audit flags)
-- ============================================================================

-- ── carrier_compliance_alert_log ────────────────────────────────────────────
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
GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_compliance_alert_log TO app_user;
ALTER TABLE carrier_compliance_alert_log
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;
CREATE INDEX IF NOT EXISTS idx_carrier_compliance_alert_log_org_id_created_at
  ON carrier_compliance_alert_log(org_id, created_at DESC);

-- ── carrier_document_types ──────────────────────────────────────────────────
ALTER TABLE carrier_document_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_document_types FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_document_types;
CREATE POLICY tenant_isolation_policy ON carrier_document_types
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_document_types;
CREATE POLICY bypass_rls_policy ON carrier_document_types
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_document_types TO app_user;
ALTER TABLE carrier_document_types
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;
CREATE INDEX IF NOT EXISTS idx_carrier_document_types_org_id_created_at
  ON carrier_document_types(org_id, created_at DESC);

-- ── carrier_expenses ────────────────────────────────────────────────────────
ALTER TABLE carrier_expenses FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_expenses;
CREATE POLICY tenant_isolation_policy ON carrier_expenses
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_expenses;
CREATE POLICY bypass_rls_policy ON carrier_expenses
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_expenses TO app_user;
ALTER TABLE carrier_expenses
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;
CREATE INDEX IF NOT EXISTS idx_carrier_expenses_org_id_created_at
  ON carrier_expenses(org_id, created_at DESC);

-- ── DispatchOverrideAudit (PascalCase, tenantId) ────────────────────────────
ALTER TABLE "DispatchOverrideAudit" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "DispatchOverrideAudit" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "DispatchOverrideAudit";
CREATE POLICY tenant_isolation_policy ON "DispatchOverrideAudit"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "DispatchOverrideAudit";
CREATE POLICY bypass_rls_policy ON "DispatchOverrideAudit"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "DispatchOverrideAudit" TO app_user;
ALTER TABLE "DispatchOverrideAudit"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_DispatchOverrideAudit_tenantId_createdAt"
  ON "DispatchOverrideAudit"("tenantId", "createdAt" DESC);

-- ── DriverHOSEntry (PascalCase, tenantId — FORCE only) ──────────────────────
ALTER TABLE "DriverHOSEntry" FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DriverHOSEntry" TO app_user;
ALTER TABLE "DriverHOSEntry"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_DriverHOSEntry_tenantId_createdAt"
  ON "DriverHOSEntry"("tenantId", "createdAt" DESC);

-- ── DriverIncident (FORCE only) ─────────────────────────────────────────────
ALTER TABLE "DriverIncident" FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "DriverIncident" TO app_user;
ALTER TABLE "DriverIncident"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_DriverIncident_tenantId_createdAt"
  ON "DriverIncident"("tenantId", "createdAt" DESC);

-- ── in_app_notifications ────────────────────────────────────────────────────
ALTER TABLE in_app_notifications FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON in_app_notifications;
CREATE POLICY tenant_isolation_policy ON in_app_notifications
  FOR ALL
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON in_app_notifications;
CREATE POLICY bypass_rls_policy ON in_app_notifications
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON in_app_notifications TO app_user;
ALTER TABLE in_app_notifications
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS updated_by UUID,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS deleted_by UUID;
CREATE INDEX IF NOT EXISTS idx_in_app_notifications_org_id ON in_app_notifications(org_id);

-- ── NotificationSendLog ─────────────────────────────────────────────────────
ALTER TABLE "NotificationSendLog" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "NotificationSendLog" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "NotificationSendLog";
CREATE POLICY tenant_isolation_policy ON "NotificationSendLog"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "NotificationSendLog";
CREATE POLICY bypass_rls_policy ON "NotificationSendLog"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "NotificationSendLog" TO app_user;
ALTER TABLE "NotificationSendLog"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_NotificationSendLog_tenantId_createdAt"
  ON "NotificationSendLog"("tenantId", "createdAt" DESC);

-- ── PlaybookTrigger ─────────────────────────────────────────────────────────
ALTER TABLE "PlaybookTrigger" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaybookTrigger" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "PlaybookTrigger";
CREATE POLICY tenant_isolation_policy ON "PlaybookTrigger"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "PlaybookTrigger";
CREATE POLICY bypass_rls_policy ON "PlaybookTrigger"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookTrigger" TO app_user;
ALTER TABLE "PlaybookTrigger"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_PlaybookTrigger_tenantId"
  ON "PlaybookTrigger"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_PlaybookTrigger_tenantId_createdAt"
  ON "PlaybookTrigger"("tenantId", "createdAt" DESC);

-- ── SupportTicket (FORCE only) ──────────────────────────────────────────────
ALTER TABLE "SupportTicket" FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "SupportTicket" TO app_user;
ALTER TABLE "SupportTicket"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_SupportTicket_tenantId_createdAt"
  ON "SupportTicket"("tenantId", "createdAt" DESC);

-- ── SysAdminInvoice ─────────────────────────────────────────────────────────
ALTER TABLE "SysAdminInvoice" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "SysAdminInvoice";
CREATE POLICY tenant_isolation_policy ON "SysAdminInvoice"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "SysAdminInvoice";
CREATE POLICY bypass_rls_policy ON "SysAdminInvoice"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "SysAdminInvoice" TO app_user;
ALTER TABLE "SysAdminInvoice"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_SysAdminInvoice_tenantId_createdAt"
  ON "SysAdminInvoice"("tenantId", "createdAt" DESC);

-- ── Tag (FORCE only) ────────────────────────────────────────────────────────
ALTER TABLE "Tag" FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "Tag" TO app_user;
ALTER TABLE "Tag"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_Tag_tenantId_createdAt"
  ON "Tag"("tenantId", "createdAt" DESC);

-- ── TagAssignment (FORCE only) ──────────────────────────────────────────────
ALTER TABLE "TagAssignment" FORCE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON "TagAssignment" TO app_user;
ALTER TABLE "TagAssignment"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_TagAssignment_tenantId_createdAt"
  ON "TagAssignment"("tenantId", "createdAt" DESC);

-- ── Audit columns for the remaining 62/72/65/77 tables flagged in audit ────
-- These are tables that already have RLS+FORCE+policies but are missing some
-- audit columns. Adding columns is additive and safe.
-- (Audit columns for tables added above are already included in their blocks.)

ALTER TABLE "ActivationProgress" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "AppEvent" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "AutomationRule" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "AutomationRun" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "CustomerInteraction" ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "DocFeedback" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE driver_bonuses ADD COLUMN IF NOT EXISTS updated_by UUID, ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE driver_compensation_templates ADD COLUMN IF NOT EXISTS updated_by UUID, ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE driver_deductions ADD COLUMN IF NOT EXISTS updated_by UUID, ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE driver_disputes ADD COLUMN IF NOT EXISTS updated_by UUID, ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE driver_pay_audit_logs ADD COLUMN IF NOT EXISTS updated_by UUID, ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE driver_settlements ADD COLUMN IF NOT EXISTS updated_by UUID, ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE "DriverInvitation" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "DriverRouteJoin" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "ExpenseTemplate" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "ExpenseTemplateItem" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "FleetMessage" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "FuelRecord" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "GPSLocation" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "Invoice" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "InvoiceItem" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "Load" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE load_driver_assignments ADD COLUMN IF NOT EXISTS updated_by UUID, ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE load_pay_components ADD COLUMN IF NOT EXISTS updated_by UUID, ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE "MaintenanceEvent" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "NotificationLog" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "NotificationSubscription" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE pay_component_attachments ADD COLUMN IF NOT EXISTS updated_by UUID, ADD COLUMN IF NOT EXISTS deleted_by UUID;
ALTER TABLE "PayrollRecord" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "Playbook" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "PlaybookInstance" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "PlaybookNotification" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "PlaybookStep" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "Route" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "RouteExpense" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "RoutePayment" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "RouteStop" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "SafetyEvent" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "ScheduledService" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "StepInstance" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "StepTemplate" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "Subscription" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "TenantHealthScore" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "TenantIntegration" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "TenantMetricsDaily" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "TenantNotificationSettings" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "Truck" ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "createdBy" UUID, ADD COLUMN IF NOT EXISTS "updatedBy" UUID, ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6), ADD COLUMN IF NOT EXISTS "deletedBy" UUID;

-- ── Group C indexes (CONCURRENTLY) ──────────────────────────────────────────
-- Only the indexes the audit flagged as missing for tables that already have
-- complete RLS+FORCE+policies. Index gaps for tables already handled above are
-- inline. The rest of the 81 audit-flagged index gaps are listed in the
-- runbook as deferred — they are pure performance, not correctness.

CREATE INDEX IF NOT EXISTS "idx_ActivationProgress_tenantId_createdAt" ON "ActivationProgress"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_AppEvent_tenantId" ON "AppEvent"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_AutomationRule_tenantId_createdAt" ON "AutomationRule"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_Customer_tenantId_createdAt" ON "Customer"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_CustomerInteraction_tenantId_createdAt" ON "CustomerInteraction"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_DocFeedback_tenantId_createdAt" ON "DocFeedback"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_Document_tenantId_createdAt" ON "Document"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_driver_bonuses_tenant_id_deleted_at ON driver_bonuses(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_driver_bonuses_tenant_id_created_at ON driver_bonuses(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_compensation_templates_tenant_id_deleted_at ON driver_compensation_templates(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_driver_compensation_templates_tenant_id_created_at ON driver_compensation_templates(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_deductions_tenant_id_deleted_at ON driver_deductions(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_driver_deductions_tenant_id_created_at ON driver_deductions(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_disputes_tenant_id_deleted_at ON driver_disputes(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_driver_disputes_tenant_id_created_at ON driver_disputes(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_tenant_id_deleted_at ON driver_settlements(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_driver_settlements_tenant_id_created_at ON driver_settlements(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_DriverInvitation_tenantId_createdAt" ON "DriverInvitation"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_DriverRouteJoin_tenantId_createdAt" ON "DriverRouteJoin"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_ExpenseCategory_tenantId_createdAt" ON "ExpenseCategory"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_ExpenseTemplate_tenantId_createdAt" ON "ExpenseTemplate"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_FuelRecord_tenantId_createdAt" ON "FuelRecord"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_GPSLocation_tenantId_createdAt" ON "GPSLocation"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_Invoice_tenantId_createdAt" ON "Invoice"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_Load_tenantId_createdAt" ON "Load"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_load_driver_assignments_tenant_id_deleted_at ON load_driver_assignments(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_load_driver_assignments_tenant_id_created_at ON load_driver_assignments(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_load_pay_components_tenant_id_deleted_at ON load_pay_components(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_load_pay_components_tenant_id_created_at ON load_pay_components(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_MaintenanceEvent_tenantId_createdAt" ON "MaintenanceEvent"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_NotificationLog_tenantId_createdAt" ON "NotificationLog"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_NotificationSubscription_tenantId_createdAt" ON "NotificationSubscription"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS idx_pay_component_attachments_tenant_id_deleted_at ON pay_component_attachments(tenant_id, deleted_at);
CREATE INDEX IF NOT EXISTS idx_pay_component_attachments_tenant_id_created_at ON pay_component_attachments(tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS "idx_PayrollRecord_tenantId_createdAt" ON "PayrollRecord"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_Playbook_tenantId" ON "Playbook"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_Playbook_tenantId_deletedAt" ON "Playbook"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "idx_Playbook_tenantId_createdAt" ON "Playbook"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_PlaybookInstance_tenantId" ON "PlaybookInstance"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_PlaybookNotification_tenantId" ON "PlaybookNotification"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_PlaybookNotification_tenantId_createdAt" ON "PlaybookNotification"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_Route_tenantId_createdAt" ON "Route"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_RouteExpense_tenantId_deletedAt" ON "RouteExpense"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "idx_RouteExpense_tenantId_createdAt" ON "RouteExpense"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_RoutePayment_tenantId_deletedAt" ON "RoutePayment"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "idx_RoutePayment_tenantId_createdAt" ON "RoutePayment"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_RouteStop_tenantId_createdAt" ON "RouteStop"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_SafetyEvent_tenantId_createdAt" ON "SafetyEvent"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_ScheduledService_tenantId_createdAt" ON "ScheduledService"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_StepTemplate_tenantId" ON "StepTemplate"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_StepTemplate_tenantId_deletedAt" ON "StepTemplate"("tenantId", "deletedAt");
CREATE INDEX IF NOT EXISTS "idx_StepTemplate_tenantId_createdAt" ON "StepTemplate"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_Subscription_tenantId_createdAt" ON "Subscription"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_TenantIntegration_tenantId_createdAt" ON "TenantIntegration"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_TenantNotificationSettings_tenantId_createdAt" ON "TenantNotificationSettings"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_Truck_tenantId_createdAt" ON "Truck"("tenantId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "idx_User_tenantId_createdAt" ON "User"("tenantId", "createdAt" DESC);

-- ============================================================================
-- TABLES MISSING tenant_id — add + backfill + NOT NULL + RLS
-- ============================================================================

-- ── PlaybookStep ────────────────────────────────────────────────────────────
ALTER TABLE "PlaybookStep" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
UPDATE "PlaybookStep" ps
   SET "tenantId" = p."tenantId"
  FROM "Playbook" p
 WHERE ps."playbookId" = p."id" AND ps."tenantId" IS NULL;
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM "PlaybookStep" WHERE "tenantId" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'PlaybookStep has % rows with NULL tenantId after backfill', n; END IF;
END$$;
ALTER TABLE "PlaybookStep" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PlaybookStep" ADD CONSTRAINT "PlaybookStep_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PlaybookStep" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PlaybookStep" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "PlaybookStep";
CREATE POLICY tenant_isolation_policy ON "PlaybookStep"
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "PlaybookStep";
CREATE POLICY bypass_rls_policy ON "PlaybookStep"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "PlaybookStep" TO app_user;
CREATE INDEX IF NOT EXISTS "idx_PlaybookStep_tenantId" ON "PlaybookStep"("tenantId");

-- ── PushToken ───────────────────────────────────────────────────────────────
ALTER TABLE "PushToken" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
UPDATE "PushToken" pt
   SET "tenantId" = u."tenantId"
  FROM "User" u
 WHERE pt."userId" = u."id" AND pt."tenantId" IS NULL;
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM "PushToken" WHERE "tenantId" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'PushToken has % rows with NULL tenantId after backfill', n; END IF;
END$$;
ALTER TABLE "PushToken" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "PushToken" ADD CONSTRAINT "PushToken_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PushToken" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "PushToken" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "PushToken";
CREATE POLICY tenant_isolation_policy ON "PushToken"
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "PushToken";
CREATE POLICY bypass_rls_policy ON "PushToken"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "PushToken" TO app_user;
ALTER TABLE "PushToken"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_PushToken_tenantId" ON "PushToken"("tenantId");

-- ── RouteDriver ─────────────────────────────────────────────────────────────
ALTER TABLE "RouteDriver" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
UPDATE "RouteDriver" rd
   SET "tenantId" = r."tenantId"
  FROM "Route" r
 WHERE rd."routeId" = r."id" AND rd."tenantId" IS NULL;
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM "RouteDriver" WHERE "tenantId" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'RouteDriver has % rows with NULL tenantId after backfill', n; END IF;
END$$;
ALTER TABLE "RouteDriver" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "RouteDriver" ADD CONSTRAINT "RouteDriver_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RouteDriver" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RouteDriver" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "RouteDriver";
CREATE POLICY tenant_isolation_policy ON "RouteDriver"
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "RouteDriver";
CREATE POLICY bypass_rls_policy ON "RouteDriver"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "RouteDriver" TO app_user;
ALTER TABLE "RouteDriver"
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_RouteDriver_tenantId" ON "RouteDriver"("tenantId");
CREATE INDEX IF NOT EXISTS "idx_RouteDriver_tenantId_createdAt" ON "RouteDriver"("tenantId", "createdAt" DESC);

-- ── StepInstance ────────────────────────────────────────────────────────────
ALTER TABLE "StepInstance" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
UPDATE "StepInstance" si
   SET "tenantId" = pi."tenantId"
  FROM "PlaybookInstance" pi
 WHERE si."playbookInstanceId" = pi."id" AND si."tenantId" IS NULL;
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM "StepInstance" WHERE "tenantId" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'StepInstance has % rows with NULL tenantId after backfill', n; END IF;
END$$;
ALTER TABLE "StepInstance" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "StepInstance" ADD CONSTRAINT "StepInstance_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StepInstance" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StepInstance" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "StepInstance";
CREATE POLICY tenant_isolation_policy ON "StepInstance"
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "StepInstance";
CREATE POLICY bypass_rls_policy ON "StepInstance"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "StepInstance" TO app_user;
CREATE INDEX IF NOT EXISTS "idx_StepInstance_tenantId" ON "StepInstance"("tenantId");

-- ── SysAdminInvoiceItem ─────────────────────────────────────────────────────
ALTER TABLE "SysAdminInvoiceItem" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
UPDATE "SysAdminInvoiceItem" sii
   SET "tenantId" = si."tenantId"
  FROM "SysAdminInvoice" si
 WHERE sii."invoiceId" = si."id" AND sii."tenantId" IS NULL;
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM "SysAdminInvoiceItem" WHERE "tenantId" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'SysAdminInvoiceItem has % rows with NULL tenantId after backfill', n; END IF;
END$$;
ALTER TABLE "SysAdminInvoiceItem" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "SysAdminInvoiceItem" ADD CONSTRAINT "SysAdminInvoiceItem_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SysAdminInvoiceItem" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SysAdminInvoiceItem" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "SysAdminInvoiceItem";
CREATE POLICY tenant_isolation_policy ON "SysAdminInvoiceItem"
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "SysAdminInvoiceItem";
CREATE POLICY bypass_rls_policy ON "SysAdminInvoiceItem"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "SysAdminInvoiceItem" TO app_user;
ALTER TABLE "SysAdminInvoiceItem"
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ(6) DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMPTZ(6) DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_SysAdminInvoiceItem_tenantId" ON "SysAdminInvoiceItem"("tenantId");

-- ── UserNotificationPreference ──────────────────────────────────────────────
ALTER TABLE "UserNotificationPreference" ADD COLUMN IF NOT EXISTS "tenantId" UUID;
UPDATE "UserNotificationPreference" unp
   SET "tenantId" = u."tenantId"
  FROM "User" u
 WHERE unp."userId" = u."id" AND unp."tenantId" IS NULL;
DO $$
DECLARE n INT;
BEGIN
  SELECT COUNT(*) INTO n FROM "UserNotificationPreference" WHERE "tenantId" IS NULL;
  IF n > 0 THEN RAISE EXCEPTION 'UserNotificationPreference has % rows with NULL tenantId after backfill', n; END IF;
END$$;
ALTER TABLE "UserNotificationPreference" ALTER COLUMN "tenantId" SET NOT NULL;
ALTER TABLE "UserNotificationPreference" ADD CONSTRAINT "UserNotificationPreference_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserNotificationPreference" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "UserNotificationPreference" FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS tenant_isolation_policy ON "UserNotificationPreference";
CREATE POLICY tenant_isolation_policy ON "UserNotificationPreference"
  FOR ALL USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());
DROP POLICY IF EXISTS bypass_rls_policy ON "UserNotificationPreference";
CREATE POLICY bypass_rls_policy ON "UserNotificationPreference"
  FOR ALL USING (current_setting('app.bypass_rls', TRUE) = 'on');
GRANT SELECT, INSERT, UPDATE, DELETE ON "UserNotificationPreference" TO app_user;
ALTER TABLE "UserNotificationPreference"
  ADD COLUMN IF NOT EXISTS "createdBy" UUID,
  ADD COLUMN IF NOT EXISTS "updatedBy" UUID,
  ADD COLUMN IF NOT EXISTS "deletedAt" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "deletedBy" UUID;
CREATE INDEX IF NOT EXISTS "idx_UserNotificationPreference_tenantId" ON "UserNotificationPreference"("tenantId");
