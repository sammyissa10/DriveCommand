-- Migration 005: Carrier Operations — route_templates table
-- Depends on: 20260404100001_carrier_clients (clients table)
--             20260404100002_carrier_contracts (contracts table)
--             20260404100004_carrier_drivers_trucks (carrier_drivers, carrier_trucks tables)

CREATE TABLE route_templates (
    id                          UUID            NOT NULL DEFAULT gen_random_uuid(),
    org_id                      UUID            NOT NULL,

    -- Identity
    template_name               VARCHAR(200)    NOT NULL,

    -- Client & contract links
    client_id                   UUID            NOT NULL,
    contract_id                 UUID,

    -- Schedule
    schedule_type               VARCHAR(20)     NOT NULL,
    recurrence_rule             VARCHAR(500),
    recurrence_timezone         VARCHAR(100)    NOT NULL DEFAULT 'America/Chicago',
    scheduled_departure_time    TIME,

    -- Equipment
    equipment_type              VARCHAR(30)     NOT NULL,
    temp_min_f                  INTEGER,
    temp_max_f                  INTEGER,
    max_weight_lbs              INTEGER,
    commodity_description       TEXT,
    estimated_miles             INTEGER,

    -- Default assignments
    default_driver_id           UUID,
    default_truck_id            UUID,

    -- Auto-generation
    auto_generate_days_ahead    INTEGER         NOT NULL DEFAULT 7,

    -- Status & notes
    active                      BOOLEAN         NOT NULL DEFAULT true,
    notes                       TEXT,

    -- Timestamps
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT route_templates_pkey PRIMARY KEY (id),
    CONSTRAINT route_templates_schedule_type_check CHECK (schedule_type IN ('fixed_days', 'frequency', 'on_call')),
    CONSTRAINT route_templates_equipment_type_check CHECK (equipment_type IN ('dry_van', 'flatbed', 'reefer', 'tanker', 'step_deck', 'other')),
    CONSTRAINT route_templates_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT route_templates_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT route_templates_default_driver_id_fkey FOREIGN KEY (default_driver_id) REFERENCES carrier_drivers(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT route_templates_default_truck_id_fkey FOREIGN KEY (default_truck_id) REFERENCES carrier_trucks(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT route_templates_org_id_fkey FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_route_templates_client_id   ON route_templates (client_id);
CREATE INDEX idx_route_templates_contract_id ON route_templates (contract_id);
CREATE INDEX idx_route_templates_active      ON route_templates (active);
CREATE INDEX idx_route_templates_org_id      ON route_templates (org_id);
