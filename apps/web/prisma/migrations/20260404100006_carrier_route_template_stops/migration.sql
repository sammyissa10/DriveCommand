-- Migration 006: Carrier Operations — route_template_stops table
-- Depends on: 20260404100005_carrier_route_templates (route_templates table)
--             20260404100003_carrier_facilities (facilities table)
-- Tenant scoping is inherited through route_template_id → route_templates.org_id

CREATE TABLE route_template_stops (
    id                              UUID            NOT NULL DEFAULT gen_random_uuid(),
    route_template_id               UUID            NOT NULL,
    sequence_order                  INTEGER         NOT NULL,

    -- Stop type
    stop_type                       VARCHAR(20)     NOT NULL,

    -- Facility link
    facility_id                     UUID            NOT NULL,

    -- Contact
    contact_name                    VARCHAR(200),
    contact_phone                   VARCHAR(30),

    -- Appointment window (offsets in minutes from scheduled_departure_time)
    appt_window_start_offset_min    INTEGER,
    appt_window_end_offset_min      INTEGER,
    expected_dwell_minutes          INTEGER,

    -- Freight
    commodity_description           TEXT,
    bol_required                    BOOLEAN         NOT NULL DEFAULT true,
    pod_required                    BOOLEAN         NOT NULL DEFAULT true,

    -- Notes
    special_instructions            TEXT,

    -- Timestamp
    created_at                      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    CONSTRAINT route_template_stops_pkey PRIMARY KEY (id),
    CONSTRAINT route_template_stops_stop_type_check CHECK (stop_type IN ('pickup', 'delivery', 'fuel_stop', 'layover')),
    CONSTRAINT route_template_stops_unique_sequence UNIQUE (route_template_id, sequence_order),
    CONSTRAINT route_template_stops_route_template_id_fkey FOREIGN KEY (route_template_id) REFERENCES route_templates(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT route_template_stops_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX idx_route_template_stops_route_template_id ON route_template_stops (route_template_id);
