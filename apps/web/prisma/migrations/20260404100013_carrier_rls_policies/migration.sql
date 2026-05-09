-- Migration 013: Carrier Operations — Row Level Security Policies
-- Purpose: Enforce tenant isolation and role-based access at the DB level for all 13 carrier tables.
--          No application bug can leak cross-org data once these policies are in place.
--
-- Tables covered:
--   WITH org_id (direct isolation):
--     clients, contracts, facilities, route_templates, dispatches, loads,
--     carrier_expenses, driver_pay_records, carrier_drivers, carrier_trucks
--   WITHOUT org_id (inherited via parent join):
--     route_template_stops  → via route_templates.org_id
--     stops                 → via dispatches.org_id OR loads.org_id
--     carrier_documents     → polymorphic: uploaded_by / client_id / stop_id
--
-- JWT claim structure:
--   org_id : (auth.jwt() ->> 'org_id')::uuid   — tenant scoping
--   role   : auth.jwt() ->> 'role'              — 'OWNER' | 'MANAGER' | 'DRIVER'
--   user   : auth.uid()                         — Supabase auth.uid()
--
-- Driver identity subquery (reused across policies):
--   (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
--
-- Role matrix summary:
--   OWNER   → full CRUD on all tables
--   MANAGER → full CRUD except: contracts (SELECT only), clients (no INSERT/DELETE)
--   DRIVER  → SELECT/limited INSERT on own dispatches/records only


-- =============================================================================
-- SECTION 1: ENABLE ROW LEVEL SECURITY
-- =============================================================================

ALTER TABLE clients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE contracts             ENABLE ROW LEVEL SECURITY;
ALTER TABLE facilities            ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_templates       ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_template_stops  ENABLE ROW LEVEL SECURITY;
ALTER TABLE dispatches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE loads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE stops                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_expenses      ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_pay_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_drivers       ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_trucks        ENABLE ROW LEVEL SECURITY;


-- =============================================================================
-- SECTION 2: POLICIES
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: facilities (standard org_id — OWNER + MANAGER full CRUD)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY facilities_org_select ON facilities
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY facilities_org_insert ON facilities
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY facilities_org_update ON facilities
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY facilities_org_delete ON facilities
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: route_templates (standard org_id — OWNER + MANAGER full CRUD)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY route_templates_org_select ON route_templates
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY route_templates_org_insert ON route_templates
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY route_templates_org_update ON route_templates
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY route_templates_org_delete ON route_templates
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: dispatches (standard org_id — OWNER + MANAGER full CRUD)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY dispatches_org_select ON dispatches
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY dispatches_org_insert ON dispatches
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY dispatches_org_update ON dispatches
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY dispatches_org_delete ON dispatches
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: carrier_drivers (standard org_id — OWNER + MANAGER full CRUD)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY carrier_drivers_org_select ON carrier_drivers
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY carrier_drivers_org_insert ON carrier_drivers
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY carrier_drivers_org_update ON carrier_drivers
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY carrier_drivers_org_delete ON carrier_drivers
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: carrier_trucks (standard org_id — OWNER + MANAGER full CRUD)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY carrier_trucks_org_select ON carrier_trucks
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY carrier_trucks_org_insert ON carrier_trucks
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY carrier_trucks_org_update ON carrier_trucks
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY carrier_trucks_org_delete ON carrier_trucks
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: carrier_expenses (standard org_id — OWNER + MANAGER full CRUD)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY carrier_expenses_org_select ON carrier_expenses
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY carrier_expenses_org_insert ON carrier_expenses
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY carrier_expenses_org_update ON carrier_expenses
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY carrier_expenses_org_delete ON carrier_expenses
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: driver_pay_records (standard org_id — OWNER + MANAGER full CRUD)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY driver_pay_records_org_select ON driver_pay_records
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY driver_pay_records_org_insert ON driver_pay_records
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY driver_pay_records_org_update ON driver_pay_records
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY driver_pay_records_org_delete ON driver_pay_records
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: clients (special: MANAGER can SELECT + UPDATE, not INSERT/DELETE)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY clients_org_select ON clients
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY clients_owner_insert ON clients
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' = 'OWNER'
  );

CREATE POLICY clients_owner_manager_update ON clients
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY clients_owner_delete ON clients
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' = 'OWNER'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: contracts (MANAGER SELECT-only — all mutations restricted to OWNER)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY contracts_org_select ON contracts
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY contracts_owner_insert ON contracts
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' = 'OWNER'
  );

CREATE POLICY contracts_owner_update ON contracts
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' = 'OWNER'
  );

CREATE POLICY contracts_owner_delete ON contracts
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' = 'OWNER'
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: loads (standard org_id for OWNER/MANAGER + DRIVER add-on via dispatch)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY loads_org_select ON loads
  FOR SELECT
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE POLICY loads_org_insert ON loads
  FOR INSERT
  WITH CHECK (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY loads_org_update ON loads
  FOR UPDATE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

CREATE POLICY loads_org_delete ON loads
  FOR DELETE
  USING (
    org_id = (auth.jwt() ->> 'org_id')::uuid
    AND auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
  );

-- DRIVER: SELECT own loads via dispatch_id FK (loads.dispatch_id → dispatches.id)
CREATE POLICY loads_driver_select ON loads
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'DRIVER'
    AND dispatch_id IS NOT NULL
    AND dispatch_id IN (
      SELECT id FROM dispatches
      WHERE primary_driver_id = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
         OR co_driver_id      = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: route_template_stops (no org_id — join via route_templates)
-- ─────────────────────────────────────────────────────────────────────────────

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
    auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
    AND route_template_id IN (
      SELECT id FROM route_templates
      WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

CREATE POLICY route_template_stops_org_update ON route_template_stops
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
    AND route_template_id IN (
      SELECT id FROM route_templates
      WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );

CREATE POLICY route_template_stops_org_delete ON route_template_stops
  FOR DELETE
  USING (
    auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
    AND route_template_id IN (
      SELECT id FROM route_templates
      WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: stops (no org_id — join via dispatches.org_id OR loads.org_id)
-- ─────────────────────────────────────────────────────────────────────────────

-- OWNER + MANAGER: SELECT via dispatch OR load org join
CREATE POLICY stops_org_select ON stops
  FOR SELECT
  USING (
    (
      dispatch_id IS NOT NULL
      AND dispatch_id IN (
        SELECT id FROM dispatches
        WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
      )
    )
    OR
    (
      load_id IS NOT NULL
      AND load_id IN (
        SELECT id FROM loads
        WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
      )
    )
  );

-- OWNER + MANAGER: INSERT via dispatch OR load org join + role check
CREATE POLICY stops_org_insert ON stops
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
    AND (
      (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
      OR
      (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
    )
  );

-- OWNER + MANAGER: UPDATE
CREATE POLICY stops_org_update ON stops
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
    AND (
      (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
      OR
      (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
    )
  );

-- OWNER + MANAGER: DELETE
CREATE POLICY stops_org_delete ON stops
  FOR DELETE
  USING (
    auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
    AND (
      (
        dispatch_id IS NOT NULL
        AND dispatch_id IN (
          SELECT id FROM dispatches
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
      OR
      (
        load_id IS NOT NULL
        AND load_id IN (
          SELECT id FROM loads
          WHERE org_id = (auth.jwt() ->> 'org_id')::uuid
        )
      )
    )
  );

-- DRIVER: SELECT stops on their dispatches
CREATE POLICY stops_driver_select ON stops
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'DRIVER'
    AND dispatch_id IS NOT NULL
    AND dispatch_id IN (
      SELECT id FROM dispatches
      WHERE primary_driver_id = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
         OR co_driver_id      = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
    )
  );

-- DRIVER: UPDATE stops on their dispatches (field restriction enforced at API layer)
CREATE POLICY stops_driver_update ON stops
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' = 'DRIVER'
    AND dispatch_id IS NOT NULL
    AND dispatch_id IN (
      SELECT id FROM dispatches
      WHERE primary_driver_id = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
         OR co_driver_id      = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: carrier_documents (polymorphic: client_id / stop_id / uploaded_by)
-- ─────────────────────────────────────────────────────────────────────────────

-- SELECT: own uploads OR client in org OR stop in org stops
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

-- INSERT: any authenticated user can upload for their own records;
--         OWNER/MANAGER for org-scoped client/stop docs;
--         DRIVER for their own stops
CREATE POLICY carrier_documents_insert ON carrier_documents
  FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND (
      -- OWNER or MANAGER: can attach to any org client or stop
      auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
      OR
      -- DRIVER: can attach to stops on their dispatches
      (
        auth.jwt() ->> 'role' = 'DRIVER'
        AND (
          stop_id IS NULL
          OR stop_id IN (
            SELECT s.id FROM stops s
            INNER JOIN dispatches d ON s.dispatch_id = d.id
            WHERE d.primary_driver_id = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
               OR d.co_driver_id      = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
          )
        )
      )
    )
  );

-- UPDATE: OWNER + MANAGER only, scoped to org client or stop
CREATE POLICY carrier_documents_org_update ON carrier_documents
  FOR UPDATE
  USING (
    auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
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

-- DELETE: OWNER + MANAGER only, same org scope
CREATE POLICY carrier_documents_org_delete ON carrier_documents
  FOR DELETE
  USING (
    auth.jwt() ->> 'role' IN ('OWNER', 'MANAGER')
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


-- ─────────────────────────────────────────────────────────────────────────────
-- DRIVER ADD-ON: carrier_expenses
-- ─────────────────────────────────────────────────────────────────────────────

-- DRIVER: SELECT own expenses (driver_id matches their carrier_drivers row)
CREATE POLICY carrier_expenses_driver_select ON carrier_expenses
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'DRIVER'
    AND driver_id = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
  );

-- DRIVER: INSERT expenses on their dispatches
CREATE POLICY carrier_expenses_driver_insert ON carrier_expenses
  FOR INSERT
  WITH CHECK (
    auth.jwt() ->> 'role' = 'DRIVER'
    AND org_id = (auth.jwt() ->> 'org_id')::uuid
    AND driver_id = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
    AND (
      dispatch_id IS NULL
      OR dispatch_id IN (
        SELECT id FROM dispatches
        WHERE primary_driver_id = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
           OR co_driver_id      = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
      )
    )
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- DRIVER ADD-ON: driver_pay_records
-- ─────────────────────────────────────────────────────────────────────────────

-- DRIVER: SELECT own pay records only (no INSERT/UPDATE/DELETE — payroll is OWNER/MANAGER managed)
CREATE POLICY driver_pay_records_driver_select ON driver_pay_records
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'DRIVER'
    AND driver_id = (SELECT id FROM carrier_drivers WHERE user_id = auth.uid())
  );


-- ─────────────────────────────────────────────────────────────────────────────
-- DRIVER ADD-ON: carrier_drivers (self-read)
-- ─────────────────────────────────────────────────────────────────────────────

-- DRIVER: SELECT own carrier_drivers record (needed for subquery resolution)
CREATE POLICY carrier_drivers_driver_self_select ON carrier_drivers
  FOR SELECT
  USING (
    auth.jwt() ->> 'role' = 'DRIVER'
    AND user_id = auth.uid()
  );


-- =============================================================================
-- SECTION 3: VERIFICATION QUERIES (reference — run via Supabase MCP or psql)
-- =============================================================================

-- Query 1: RLS enabled on all 13 tables (all rows must show rowsecurity = true)
--
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE tablename IN (
--   'clients','contracts','facilities','route_templates','route_template_stops',
--   'dispatches','loads','stops','carrier_documents','carrier_expenses',
--   'driver_pay_records','carrier_drivers','carrier_trucks'
-- )
-- ORDER BY tablename;

-- Query 2: Total policy count (must be > 40)
--
-- SELECT COUNT(*) AS policy_count
-- FROM pg_policies
-- WHERE tablename IN (
--   'clients','contracts','facilities','route_templates','route_template_stops',
--   'dispatches','loads','stops','carrier_documents','carrier_expenses',
--   'driver_pay_records','carrier_drivers','carrier_trucks'
-- );

-- Query 3: Per-table policy breakdown
--
-- SELECT tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN (
--   'clients','contracts','facilities','route_templates','route_template_stops',
--   'dispatches','loads','stops','carrier_documents','carrier_expenses',
--   'driver_pay_records','carrier_drivers','carrier_trucks'
-- )
-- ORDER BY tablename, cmd;
