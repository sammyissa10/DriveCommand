-- ============================================================================
-- Quick-410: Apply RLS Fixes to Close Supabase Advisor Alert
-- Spec: docs/specs/DatabaseSecurity_MultiTenant_Spec_v1.md Sections 2.3, 2.5, 3, 4.12, 5.2, 7
-- Audit: apps/web/scripts/audit/verify-advisor-fix.ts
-- Closes advisor alert on: carrier_compliance_alert_log, carrier_documents,
--   route_template_stops, stops, TicketMessage, Tenant
-- ============================================================================
-- This migration is ADDITIVE and transactional: no column drops, no data loss.
-- All six target tables are wrapped in a single BEGIN/COMMIT transaction.
-- The self-validation DO $$ block at the end rolls back the whole transaction
-- if any structural assertion fails, preventing partial application.
-- ============================================================================
BEGIN;

-- ── TIER A — carrier_compliance_alert_log (column = org_id) ────────────────
-- This table has RLS disabled in production despite being flagged for fix in
-- the 20260515 migration. This block re-applies the full RLS stack.
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
CREATE INDEX IF NOT EXISTS idx_carrier_compliance_alert_log_org_id
  ON carrier_compliance_alert_log(org_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_compliance_alert_log TO app_user;

-- ── TIER B — carrier_documents ─────────────────────────────────────────────
-- SCHEMA REALITY: carrier_documents has NO org_id or tenant_id column.
-- Tenant isolation is join-based: via client_id → clients.org_id, or
-- stop_id → stops → dispatches.org_id, or dispatch_id → dispatches.org_id,
-- or load_id → loads.org_id, or contract_id → contracts.org_id.
-- FIX: Replace (auth.jwt() ->> 'org_id')::uuid with current_tenant_id()
-- in all join expressions. Do NOT modify the carrier_documents_insert policy
-- (it already uses auth.uid() which is not tenant-based and is correct).
--
-- CRITICAL: Do NOT add ENABLE RLS here (already enabled). Only add FORCE.
-- Do NOT touch the 'carrier_documents_insert' policy (uses auth.uid() correctly).
ALTER TABLE carrier_documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS carrier_documents_select ON carrier_documents;
CREATE POLICY carrier_documents_select ON carrier_documents
  FOR SELECT
  USING (
    uploaded_by = auth.uid()
    OR (
      client_id IS NOT NULL
      AND client_id IN (
        SELECT id FROM clients
        WHERE org_id = current_tenant_id()
      )
    )
    OR (
      stop_id IS NOT NULL
      AND stop_id IN (
        SELECT s.id FROM stops s
        INNER JOIN dispatches d ON s.dispatch_id = d.id
        WHERE d.org_id = current_tenant_id()
        UNION
        SELECT s.id FROM stops s
        INNER JOIN loads l ON s.load_id = l.id
        WHERE l.org_id = current_tenant_id()
      )
    )
    OR (
      dispatch_id IS NOT NULL
      AND dispatch_id IN (
        SELECT id FROM dispatches WHERE org_id = current_tenant_id()
      )
    )
    OR (
      load_id IS NOT NULL
      AND load_id IN (
        SELECT id FROM loads WHERE org_id = current_tenant_id()
      )
    )
    OR (
      contract_id IS NOT NULL
      AND contract_id IN (
        SELECT id FROM contracts WHERE org_id = current_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS carrier_documents_org_update ON carrier_documents;
CREATE POLICY carrier_documents_org_update ON carrier_documents
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        client_id IS NOT NULL
        AND client_id IN (
          SELECT id FROM clients WHERE org_id = current_tenant_id()
        )
      )
      OR (
        stop_id IS NOT NULL
        AND stop_id IN (
          SELECT s.id FROM stops s
          INNER JOIN dispatches d ON s.dispatch_id = d.id
          WHERE d.org_id = current_tenant_id()
          UNION
          SELECT s.id FROM stops s
          INNER JOIN loads l ON s.load_id = l.id
          WHERE l.org_id = current_tenant_id()
        )
      )
      OR (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches WHERE org_id = current_tenant_id()
        )
      )
      OR (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads WHERE org_id = current_tenant_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS carrier_documents_org_delete ON carrier_documents;
CREATE POLICY carrier_documents_org_delete ON carrier_documents
  FOR DELETE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        client_id IS NOT NULL
        AND client_id IN (
          SELECT id FROM clients WHERE org_id = current_tenant_id()
        )
      )
      OR (
        stop_id IS NOT NULL
        AND stop_id IN (
          SELECT s.id FROM stops s
          INNER JOIN dispatches d ON s.dispatch_id = d.id
          WHERE d.org_id = current_tenant_id()
          UNION
          SELECT s.id FROM stops s
          INNER JOIN loads l ON s.load_id = l.id
          WHERE l.org_id = current_tenant_id()
        )
      )
      OR (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches WHERE org_id = current_tenant_id()
        )
      )
      OR (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads WHERE org_id = current_tenant_id()
        )
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_documents TO app_user;

-- ── TIER B — route_template_stops ──────────────────────────────────────────
-- SCHEMA REALITY: route_template_stops has NO org_id or tenant_id column.
-- Tenant isolation is join-based: via route_template_id → route_templates.org_id.
-- FIX: Replace (auth.jwt() ->> 'org_id')::uuid with current_tenant_id().
ALTER TABLE route_template_stops FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS route_template_stops_org_select ON route_template_stops;
CREATE POLICY route_template_stops_org_select ON route_template_stops
  FOR SELECT
  USING (
    route_template_id IN (
      SELECT id FROM route_templates WHERE org_id = current_tenant_id()
    )
  );

DROP POLICY IF EXISTS route_template_stops_org_insert ON route_template_stops;
CREATE POLICY route_template_stops_org_insert ON route_template_stops
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND route_template_id IN (
      SELECT id FROM route_templates WHERE org_id = current_tenant_id()
    )
  );

DROP POLICY IF EXISTS route_template_stops_org_update ON route_template_stops;
CREATE POLICY route_template_stops_org_update ON route_template_stops
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND route_template_id IN (
      SELECT id FROM route_templates WHERE org_id = current_tenant_id()
    )
  );

DROP POLICY IF EXISTS route_template_stops_org_delete ON route_template_stops;
CREATE POLICY route_template_stops_org_delete ON route_template_stops
  FOR DELETE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND route_template_id IN (
      SELECT id FROM route_templates WHERE org_id = current_tenant_id()
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON route_template_stops TO app_user;

-- ── TIER B — stops ─────────────────────────────────────────────────────────
-- SCHEMA REALITY: stops has NO org_id or tenant_id column.
-- Tenant isolation is join-based: via dispatch_id → dispatches.org_id
-- OR load_id → loads.org_id.
-- FIX: Replace (auth.jwt() ->> 'org_id')::uuid with current_tenant_id().
-- Driver-scoped policies (stops_driver_select, stops_driver_update) are
-- NOT modified — they use auth.uid() which is correct and unaffected.
ALTER TABLE stops FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS stops_org_select ON stops;
CREATE POLICY stops_org_select ON stops
  FOR SELECT
  USING (
    (
      dispatch_id IS NOT NULL
      AND dispatch_id IN (
        SELECT id FROM dispatches WHERE org_id = current_tenant_id()
      )
    )
    OR (
      load_id IS NOT NULL
      AND load_id IN (
        SELECT id FROM loads WHERE org_id = current_tenant_id()
      )
    )
  );

DROP POLICY IF EXISTS stops_org_insert ON stops;
CREATE POLICY stops_org_insert ON stops
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches WHERE org_id = current_tenant_id()
        )
      )
      OR (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads WHERE org_id = current_tenant_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS stops_org_update ON stops;
CREATE POLICY stops_org_update ON stops
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches WHERE org_id = current_tenant_id()
        )
      )
      OR (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads WHERE org_id = current_tenant_id()
        )
      )
    )
  );

DROP POLICY IF EXISTS stops_org_delete ON stops;
CREATE POLICY stops_org_delete ON stops
  FOR DELETE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches WHERE org_id = current_tenant_id()
        )
      )
      OR (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads WHERE org_id = current_tenant_id()
        )
      )
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON stops TO app_user;

-- ── TIER C — TicketMessage (policies already use current_tenant_id()) ───────
-- Per spec Section 7: add FORCE only. Existing policies reference
-- current_tenant_id() via SupportTicket join — do not modify them.
ALTER TABLE "TicketMessage" FORCE ROW LEVEL SECURITY;

-- ── TIER D — Tenant (add SELECT policy + FORCE RLS) ─────────────────────────
-- Existing bypass_rls_policy is untouched. Create self-read SELECT policy
-- so tenant rows are accessible to app_user within their own tenant context.
DROP POLICY IF EXISTS tenant_self_read ON "Tenant";
CREATE POLICY tenant_self_read ON "Tenant"
  FOR SELECT
  USING (id = current_tenant_id());
ALTER TABLE "Tenant" FORCE ROW LEVEL SECURITY;
GRANT SELECT ON "Tenant" TO app_user;

-- ── Self-validation block ────────────────────────────────────────────────────
-- Raises an exception (rolling back the whole transaction) if any assertion fails.
DO $$
DECLARE
  missing_force INT;
  missing_comp_rls INT;
BEGIN
  -- Confirm FORCE RLS is on for all six target tables
  SELECT COUNT(*) INTO missing_force
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname IN (
      'carrier_compliance_alert_log', 'carrier_documents',
      'route_template_stops', 'stops', 'TicketMessage', 'Tenant'
    )
    AND c.relforcerowsecurity = FALSE;
  IF missing_force > 0 THEN
    RAISE EXCEPTION 'quick-410: FORCE RLS missing on % target tables after migration', missing_force;
  END IF;

  -- Confirm carrier_compliance_alert_log has RLS enabled (Tier A only)
  SELECT COUNT(*) INTO missing_comp_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'carrier_compliance_alert_log'
    AND c.relrowsecurity = FALSE;
  IF missing_comp_rls > 0 THEN
    RAISE EXCEPTION 'quick-410: RLS not enabled on carrier_compliance_alert_log';
  END IF;

  -- Confirm tenant_isolation_policy exists on carrier_compliance_alert_log (Tier A)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'carrier_compliance_alert_log'
      AND policyname = 'tenant_isolation_policy'
  ) THEN
    RAISE EXCEPTION 'quick-410: tenant_isolation_policy missing on carrier_compliance_alert_log';
  END IF;

  -- Confirm tenant_self_read on Tenant (Tier D)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'Tenant' AND policyname = 'tenant_self_read'
  ) THEN
    RAISE EXCEPTION 'quick-410: tenant_self_read policy missing on Tenant';
  END IF;

  -- Confirm the new index exists (Tier A)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = 'idx_carrier_compliance_alert_log_org_id'
  ) THEN
    RAISE EXCEPTION 'quick-410: idx_carrier_compliance_alert_log_org_id index missing';
  END IF;

  -- Confirm Tier B policies now reference current_tenant_id() (spot-check one per table)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'route_template_stops'
      AND policyname = 'route_template_stops_org_select'
      AND qual LIKE '%current_tenant_id%'
  ) THEN
    RAISE EXCEPTION 'quick-410: route_template_stops_org_select does not reference current_tenant_id()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'stops'
      AND policyname = 'stops_org_select'
      AND qual LIKE '%current_tenant_id%'
  ) THEN
    RAISE EXCEPTION 'quick-410: stops_org_select does not reference current_tenant_id()';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'carrier_documents'
      AND policyname = 'carrier_documents_select'
      AND qual LIKE '%current_tenant_id%'
  ) THEN
    RAISE EXCEPTION 'quick-410: carrier_documents_select does not reference current_tenant_id()';
  END IF;

END$$;

COMMIT;
