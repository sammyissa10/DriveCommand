-- ADDITIVE ONLY. Widens CHECK to admit 'driver_residence'; no rows affected.
-- Already applied to production 2026-08-02 via Supabase MCP (migration name:
-- widen_facilities_facility_type_check_driver_residence). Written idempotently.
ALTER TABLE facilities DROP CONSTRAINT IF EXISTS facilities_facility_type_check;
ALTER TABLE facilities ADD CONSTRAINT facilities_facility_type_check
  CHECK (facility_type = ANY (ARRAY['terminal'::text, 'yard'::text, 'warehouse'::text, 'drop_yard'::text, 'customer_site'::text, 'driver_residence'::text]));
