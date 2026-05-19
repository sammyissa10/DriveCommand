-- TKT-0016 — Align carrier_catalog_meta facility_type rows with DB CHECK constraint.
-- Replaces stale (shipper, receiver, terminal, fuel_stop, other) with canonical
-- (terminal, yard, warehouse, drop_yard, customer_site).
-- Data-only change; no schema modification.
-- Idempotent: DELETE + INSERT pattern ensures safe re-runs.

BEGIN;

DELETE FROM carrier_catalog_meta WHERE enum_group = 'facility_type';

INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('facility_type', 'terminal',      'Terminal',      0),
    ('facility_type', 'yard',          'Yard',          1),
    ('facility_type', 'warehouse',     'Warehouse',     2),
    ('facility_type', 'drop_yard',     'Drop Yard',     3),
    ('facility_type', 'customer_site', 'Customer Site', 4)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

COMMIT;
