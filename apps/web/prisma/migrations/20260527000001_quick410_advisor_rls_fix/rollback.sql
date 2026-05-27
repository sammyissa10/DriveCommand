-- ============================================================================
-- Quick-410 ROLLBACK: Restore pre-migration state
-- Inverse of: 20260527000001_quick410_advisor_rls_fix/migration.sql
-- Restores each table to its exact pre-quick-410 configuration.
-- ============================================================================
-- IMPORTANT: Do NOT drop current_tenant_id() function (other tables depend on it).
-- Do NOT drop the app_user role.
-- Do NOT touch any policy named 'service_role' or 'bypass'.
-- Every DROP POLICY is idempotent (IF EXISTS).
-- ============================================================================
--
-- NOTE ON TIER B LOSSY ROLLBACK:
-- Tier B restores the original auth.jwt() ->> 'org_id' policies that were in place
-- before quick-410. Those policies were broken (auth.jwt() never has 'org_id' in
-- DriveCommand's claim structure), but this rollback intentionally restores the
-- previous state — even the broken state. This is the correct semantic for a
-- database rollback: undo what was done, not fix the underlying problem.
-- If you need to re-fix after rollback, re-apply quick-410 migration.
-- ============================================================================
BEGIN;

-- ── TIER A reverse — carrier_compliance_alert_log ──────────────────────────
DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_compliance_alert_log;
DROP POLICY IF EXISTS bypass_rls_policy ON carrier_compliance_alert_log;
ALTER TABLE carrier_compliance_alert_log NO FORCE ROW LEVEL SECURITY;
ALTER TABLE carrier_compliance_alert_log DISABLE ROW LEVEL SECURITY;
DROP INDEX IF EXISTS idx_carrier_compliance_alert_log_org_id;
REVOKE SELECT, INSERT, UPDATE, DELETE ON carrier_compliance_alert_log FROM app_user;

-- ── TIER B reverse — carrier_documents ─────────────────────────────────────
-- LOSSY ROLLBACK: restores the original auth.jwt() ->> 'org_id' policies
-- (broken but original pre-410 state).
DROP POLICY IF EXISTS carrier_documents_select ON carrier_documents;
DROP POLICY IF EXISTS carrier_documents_org_update ON carrier_documents;
DROP POLICY IF EXISTS carrier_documents_org_delete ON carrier_documents;
ALTER TABLE carrier_documents NO FORCE ROW LEVEL SECURITY;

-- Restore original SELECT policy (used auth.uid() + broken org_id join)
CREATE POLICY carrier_documents_select ON carrier_documents
  FOR SELECT
  USING (
    uploaded_by = auth.uid()
    OR (
      client_id IS NOT NULL
      AND client_id IN (
        SELECT id FROM clients
        WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
      )
    )
    OR (
      stop_id IS NOT NULL
      AND stop_id IN (
        SELECT s.id FROM stops s
        INNER JOIN dispatches d ON s.dispatch_id = d.id
        WHERE d.org_id = (auth.jwt() ->> 'org_id')::uuid
        UNION
        SELECT s.id FROM stops s
        INNER JOIN loads l ON s.load_id = l.id
        WHERE l.org_id = (auth.jwt() ->> 'org_id')::uuid
      )
    )
  );

CREATE POLICY carrier_documents_org_update ON carrier_documents
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        client_id IS NOT NULL
        AND client_id IN (
          SELECT id FROM clients
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
      OR (
        stop_id IS NOT NULL
        AND stop_id IN (
          SELECT s.id FROM stops s
          INNER JOIN dispatches d ON s.dispatch_id = d.id
          WHERE d.org_id = (auth.jwt() ->> 'org_id')::uuid
          UNION
          SELECT s.id FROM stops s
          INNER JOIN loads l ON s.load_id = l.id
          WHERE l.org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
    )
  );

CREATE POLICY carrier_documents_org_delete ON carrier_documents
  FOR DELETE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        client_id IS NOT NULL
        AND client_id IN (
          SELECT id FROM clients
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
      OR (
        stop_id IS NOT NULL
        AND stop_id IN (
          SELECT s.id FROM stops s
          INNER JOIN dispatches d ON s.dispatch_id = d.id
          WHERE d.org_id = (auth.jwt() ->> 'org_id')::uuid
          UNION
          SELECT s.id FROM stops s
          INNER JOIN loads l ON s.load_id = l.id
          WHERE l.org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
    )
  );

-- ── TIER B reverse — route_template_stops ──────────────────────────────────
-- LOSSY ROLLBACK: restores the original auth.jwt() ->> 'org_id' join policies.
DROP POLICY IF EXISTS route_template_stops_org_select ON route_template_stops;
DROP POLICY IF EXISTS route_template_stops_org_insert ON route_template_stops;
DROP POLICY IF EXISTS route_template_stops_org_update ON route_template_stops;
DROP POLICY IF EXISTS route_template_stops_org_delete ON route_template_stops;
ALTER TABLE route_template_stops NO FORCE ROW LEVEL SECURITY;

CREATE POLICY route_template_stops_org_select ON route_template_stops
  FOR SELECT
  USING (
    route_template_id IN (
      SELECT id FROM route_templates
      WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

CREATE POLICY route_template_stops_org_insert ON route_template_stops
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND route_template_id IN (
      SELECT id FROM route_templates
      WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

CREATE POLICY route_template_stops_org_update ON route_template_stops
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND route_template_id IN (
      SELECT id FROM route_templates
      WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

CREATE POLICY route_template_stops_org_delete ON route_template_stops
  FOR DELETE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND route_template_id IN (
      SELECT id FROM route_templates
      WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

-- ── TIER B reverse — stops ──────────────────────────────────────────────────
-- LOSSY ROLLBACK: restores the original auth.jwt() ->> 'org_id' join policies.
-- Driver-scoped policies (stops_driver_select, stops_driver_update) were not
-- changed in quick-410 forward migration, so they are not touched here.
DROP POLICY IF EXISTS stops_org_select ON stops;
DROP POLICY IF EXISTS stops_org_insert ON stops;
DROP POLICY IF EXISTS stops_org_update ON stops;
DROP POLICY IF EXISTS stops_org_delete ON stops;
ALTER TABLE stops NO FORCE ROW LEVEL SECURITY;

CREATE POLICY stops_org_select ON stops
  FOR SELECT
  USING (
    (
      dispatch_id IS NOT NULL
      AND dispatch_id IN (
        SELECT id FROM dispatches WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
      )
    )
    OR (
      load_id IS NOT NULL
      AND load_id IN (
        SELECT id FROM loads WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
      )
    )
  );

CREATE POLICY stops_org_insert ON stops
  FOR INSERT
  WITH CHECK (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
      OR (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
    )
  );

CREATE POLICY stops_org_update ON stops
  FOR UPDATE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
      OR (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
    )
  );

CREATE POLICY stops_org_delete ON stops
  FOR DELETE
  USING (
    (auth.jwt() ->> 'role') IN ('OWNER', 'MANAGER')
    AND (
      (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
      OR (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
    )
  );

-- ── TIER C reverse — TicketMessage ──────────────────────────────────────────
ALTER TABLE "TicketMessage" NO FORCE ROW LEVEL SECURITY;

-- ── TIER D reverse — Tenant ──────────────────────────────────────────────────
DROP POLICY IF EXISTS tenant_self_read ON "Tenant";
ALTER TABLE "Tenant" NO FORCE ROW LEVEL SECURITY;
REVOKE SELECT ON "Tenant" FROM app_user;

COMMIT;
