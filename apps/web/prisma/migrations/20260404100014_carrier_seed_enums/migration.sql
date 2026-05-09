-- Migration 014: Carrier Operations — carrier_catalog_meta table + enum seed data
-- Standalone lookup/metadata table for carrier operation enum values.
-- No FK dependencies — this table is fully self-contained.

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE carrier_catalog_meta (
    id              UUID            NOT NULL DEFAULT gen_random_uuid(),
    enum_group      VARCHAR(100)    NOT NULL,
    enum_value      VARCHAR(100)    NOT NULL,
    display_label   VARCHAR(200)    NOT NULL,
    sort_order      INTEGER         NOT NULL DEFAULT 0,
    active          BOOLEAN         NOT NULL DEFAULT true,

    CONSTRAINT carrier_catalog_meta_pkey PRIMARY KEY (id)
);

-- ─── Unique Index ──────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX carrier_catalog_meta_group_value
    ON carrier_catalog_meta (enum_group, enum_value);

-- ─── Seed Data ────────────────────────────────────────────────────────────────
-- All inserts use ON CONFLICT DO NOTHING for idempotency (safe to re-run).

-- client_status
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('client_status', 'active',   'Active',   0),
    ('client_status', 'inactive', 'Inactive', 1),
    ('client_status', 'blocked',  'Blocked',  2)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- contract_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('contract_type', 'spot_rate',      'Spot Rate',      0),
    ('contract_type', 'dedicated',      'Dedicated',      1),
    ('contract_type', 'contract_lane',  'Contract Lane',  2),
    ('contract_type', 'brokered',       'Brokered',       3)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- rate_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('rate_type', 'per_mile',   'Per Mile',    0),
    ('rate_type', 'per_load',   'Per Load',    1),
    ('rate_type', 'per_hour',   'Per Hour',    2),
    ('rate_type', 'per_stop',   'Per Stop',    3),
    ('rate_type', 'flat',       'Flat Rate',   4),
    ('rate_type', 'per_cwt',    'Per CWT',     5),
    ('rate_type', 'per_pallet', 'Per Pallet',  6),
    ('rate_type', 'hourly',     'Hourly',      7)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- fuel_surcharge_method
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('fuel_surcharge_method', 'none',           'None',            0),
    ('fuel_surcharge_method', 'doe_index',       'DOE Index',       1),
    ('fuel_surcharge_method', 'fixed_per_mile',  'Fixed Per Mile',  2),
    ('fuel_surcharge_method', 'fixed_flat',      'Fixed Flat',      3)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- schedule_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('schedule_type', 'fixed_days', 'Fixed Days', 0),
    ('schedule_type', 'frequency',  'Frequency',  1),
    ('schedule_type', 'on_call',    'On Call',    2)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- equipment_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('equipment_type', 'dry_van',   'Dry Van',       0),
    ('equipment_type', 'flatbed',   'Flatbed',       1),
    ('equipment_type', 'reefer',    'Refrigerated',  2),
    ('equipment_type', 'tanker',    'Tanker',        3),
    ('equipment_type', 'step_deck', 'Step Deck',     4),
    ('equipment_type', 'other',     'Other',         5)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- dispatch_status
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('dispatch_status', 'planned',     'Planned',     0),
    ('dispatch_status', 'in_progress', 'In Progress', 1),
    ('dispatch_status', 'completed',   'Completed',   2),
    ('dispatch_status', 'cancelled',   'Cancelled',   3),
    ('dispatch_status', 'tonu',        'TONU',        4)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- load_status
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('load_status', 'pending',    'Pending',    0),
    ('load_status', 'assigned',   'Assigned',   1),
    ('load_status', 'in_transit', 'In Transit', 2),
    ('load_status', 'delivered',  'Delivered',  3),
    ('load_status', 'invoiced',   'Invoiced',   4),
    ('load_status', 'paid',       'Paid',       5),
    ('load_status', 'cancelled',  'Cancelled',  6)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- load_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('load_type', 'ftl',     'Full Truckload (FTL)',       0),
    ('load_type', 'ltl',     'Less Than Truckload (LTL)',  1),
    ('load_type', 'partial', 'Partial',                    2),
    ('load_type', 'team',    'Team Load',                  3)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- stop_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('stop_type', 'pickup',        'Pickup',        0),
    ('stop_type', 'delivery',      'Delivery',      1),
    ('stop_type', 'fuel_stop',     'Fuel Stop',     2),
    ('stop_type', 'layover',       'Layover',       3),
    ('stop_type', 'relay_handoff', 'Relay Handoff', 4)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- stop_status
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('stop_status', 'pending',   'Pending',   0),
    ('stop_status', 'arrived',   'Arrived',   1),
    ('stop_status', 'completed', 'Completed', 2),
    ('stop_status', 'skipped',   'Skipped',   3)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- document_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('document_type', 'bol',                   'Bill of Lading',        0),
    ('document_type', 'pod',                   'Proof of Delivery',     1),
    ('document_type', 'rate_confirmation',     'Rate Confirmation',     2),
    ('document_type', 'lumper_receipt',        'Lumper Receipt',        3),
    ('document_type', 'weight_ticket',         'Weight Ticket',         4),
    ('document_type', 'inspection_report',     'Inspection Report',     5),
    ('document_type', 'expense_receipt',       'Expense Receipt',       6),
    ('document_type', 'insurance_certificate', 'Insurance Certificate', 7),
    ('document_type', 'other',                 'Other',                 8)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- expense_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('expense_type', 'fuel',                   'Fuel',                  0),
    ('expense_type', 'tolls',                  'Tolls',                 1),
    ('expense_type', 'scales',                 'Scales',                2),
    ('expense_type', 'lumper',                 'Lumper',                3),
    ('expense_type', 'parking',                'Parking',               4),
    ('expense_type', 'maintenance_emergency',  'Emergency Maintenance', 5),
    ('expense_type', 'driver_advance',         'Driver Advance',        6),
    ('expense_type', 'other',                  'Other',                 7)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- paid_by
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('paid_by', 'driver_cash',    'Driver Cash',    0),
    ('paid_by', 'company_card',   'Company Card',   1),
    ('paid_by', 'fuel_card',      'Fuel Card',      2),
    ('paid_by', 'driver_advance', 'Driver Advance', 3)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- pay_model
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('pay_model', 'per_mile',         'Per Mile',             0),
    ('pay_model', 'percentage_gross', 'Percentage of Gross',  1),
    ('pay_model', 'hourly',           'Hourly',               2),
    ('pay_model', 'flat',             'Flat Rate',            3),
    ('pay_model', 'salary',           'Salary',               4)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- pay_record_status
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('pay_record_status', 'pending',  'Pending',  0),
    ('pay_record_status', 'approved', 'Approved', 1),
    ('pay_record_status', 'paid',     'Paid',     2),
    ('pay_record_status', 'voided',   'Voided',   3)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- facility_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('facility_type', 'shipper',    'Shipper',   0),
    ('facility_type', 'receiver',   'Receiver',  1),
    ('facility_type', 'terminal',   'Terminal',  2),
    ('facility_type', 'fuel_stop',  'Fuel Stop', 3),
    ('facility_type', 'other',      'Other',     4)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- truck_type
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('truck_type', 'day_cab', 'Day Cab', 0),
    ('truck_type', 'sleeper', 'Sleeper', 1)
ON CONFLICT (enum_group, enum_value) DO NOTHING;

-- driver_status
INSERT INTO carrier_catalog_meta (enum_group, enum_value, display_label, sort_order) VALUES
    ('driver_status', 'active',     'Active',     0),
    ('driver_status', 'inactive',   'Inactive',   1),
    ('driver_status', 'terminated', 'Terminated', 2)
ON CONFLICT (enum_group, enum_value) DO NOTHING;
