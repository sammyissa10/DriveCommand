-- Phase 9 item 3: "non-critical failures start the trip and log defects against
-- the truck". `CarrierTruck` has NO defect or maintenance relation — the existing
-- `MaintenanceEvent` / `ScheduledService` models hang off the LEGACY `Truck`
-- model, not the carrier one — so there was nowhere for a defect to live. The
-- only truck-level signal was `carrier_trucks.status`, and flipping that to
-- 'maintenance' for a cracked mudflap takes a truck out of service. Wrong tool.
--
-- APPLIED TO PRODUCTION FIRST via Supabase MCP (migration name
-- `add_carrier_truck_defects`), then mirrored here and marked applied with
-- `prisma migrate resolve --applied` rather than replayed — DEC-3 rules 1 and 4.
-- There is no non-production database to replay it against.
--
-- RLS enabled + FORCED, both sibling policies, and the app_user grant are all
-- written HERE rather than deferred to the RLS Phase 2 cutover. The two ways
-- this has gone wrong before are both one line each: DEC-13 (`carrier_documents`
-- — RLS forced with ZERO policies, so the cutover turns every read into zero
-- rows) and quick-520 (`route_matrix_cache` — no `app_user` grant at all).
CREATE TABLE IF NOT EXISTS carrier_truck_defects (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES "Tenant"(id) ON DELETE CASCADE,
  truck_id            UUID NOT NULL REFERENCES carrier_trucks(id) ON DELETE CASCADE,
  dispatch_id         UUID REFERENCES dispatches(id) ON DELETE SET NULL,
  step_instance_id    UUID,
  item_name           TEXT NOT NULL,
  note                TEXT,
  photo_keys          JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_critical         BOOLEAN NOT NULL DEFAULT false,
  status              TEXT NOT NULL DEFAULT 'open',
  reported_by_user_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
  reported_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_by_user_id UUID REFERENCES "User"(id) ON DELETE SET NULL,
  resolved_at         TIMESTAMPTZ,
  resolution_note     TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT carrier_truck_defects_status_check
    CHECK (status = ANY (ARRAY['open'::text, 'resolved'::text])),
  CONSTRAINT carrier_truck_defects_resolution_check
    CHECK (status <> 'resolved' OR resolved_at IS NOT NULL)
);

-- One defect row per failed inspection item. Re-submitting the same step must
-- UPDATE its defect, never append a second one — a driver who fixes a note and
-- re-submits must not double the truck's defect count.
CREATE UNIQUE INDEX IF NOT EXISTS carrier_truck_defects_step_unique
  ON carrier_truck_defects (step_instance_id) WHERE step_instance_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS carrier_truck_defects_org_truck_idx
  ON carrier_truck_defects (org_id, truck_id, status);
CREATE INDEX IF NOT EXISTS carrier_truck_defects_dispatch_idx
  ON carrier_truck_defects (dispatch_id);

ALTER TABLE carrier_truck_defects ENABLE ROW LEVEL SECURITY;
ALTER TABLE carrier_truck_defects FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON carrier_truck_defects;
CREATE POLICY tenant_isolation_policy ON carrier_truck_defects
  FOR ALL USING (org_id = current_tenant_id()) WITH CHECK (org_id = current_tenant_id());

DROP POLICY IF EXISTS bypass_rls_policy ON carrier_truck_defects;
CREATE POLICY bypass_rls_policy ON carrier_truck_defects
  FOR ALL USING (current_setting('app.bypass_rls', true) = 'on');

GRANT SELECT, INSERT, UPDATE, DELETE ON carrier_truck_defects TO app_user;

-- Self-validation. DEC-8 is explicit that a block like this can only check what
-- its author remembered, so it is a floor and not the verification — the live
-- schema diff at phase close is.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'carrier_truck_defects'
                 AND policyname = 'tenant_isolation_policy') THEN
    RAISE EXCEPTION 'tenant_isolation_policy missing on carrier_truck_defects';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.role_table_grants
                 WHERE table_name = 'carrier_truck_defects' AND grantee = 'app_user') THEN
    RAISE EXCEPTION 'app_user grant missing on carrier_truck_defects';
  END IF;
END $$;
