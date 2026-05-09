-- Migration 009: Carrier Operations — stops table
-- Depends on: 20260404100007_carrier_dispatches (dispatches table)
--             20260404100008_carrier_loads (loads table)
--             20260404100001_carrier_clients (clients table)
--             20260404100003_carrier_facilities (facilities table)
-- NOTE: stops has NO org_id column — tenant scoping is inherited via
--       dispatch_id → dispatches.org_id and load_id → loads.org_id.
-- NOTE: ordering is EXCLUSIVELY by sequence_order — never by stop_type.
--       Pickup and delivery stops may appear in any order based on the route.

CREATE TABLE stops (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),

    -- Parent dispatch and load
    dispatch_id         UUID            NOT NULL,
    load_id             UUID,

    -- Sequence (ordering is EXCLUSIVELY by this field — never by stop_type)
    sequence_order      INTEGER         NOT NULL,

    -- Stop classification
    stop_type           VARCHAR(20)     NOT NULL,

    -- Facility (required — every stop must be at a known facility)
    facility_id         UUID            NOT NULL,

    -- Client link (optional — for client-specific stops)
    client_id           UUID,

    -- Appointment
    appointment_start   TIMESTAMPTZ,
    appointment_end     TIMESTAMPTZ,
    arrived_at          TIMESTAMPTZ,
    departed_at         TIMESTAMPTZ,

    -- Status
    status              VARCHAR(20)     NOT NULL DEFAULT 'pending',
    skip_reason         TEXT,

    -- Freight at this stop
    commodity_description   TEXT,
    pieces              INTEGER,
    weight_lbs          NUMERIC(10,2),

    -- Documents
    bol_number          TEXT,
    pod_number          TEXT,
    seal_number         TEXT,

    -- Contact
    contact_name        VARCHAR(200),
    contact_phone       VARCHAR(30),

    -- Notes
    special_instructions    TEXT,
    notes               TEXT,

    -- Timestamps
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ─── Constraints ──────────────────────────────────────────────────────────
    CONSTRAINT stops_pkey PRIMARY KEY (id),
    CONSTRAINT stops_stop_type_check CHECK (stop_type IN ('pickup', 'delivery', 'fuel_stop', 'layover', 'relay_handoff')),
    CONSTRAINT stops_status_check CHECK (status IN ('pending', 'arrived', 'completed', 'skipped')),
    CONSTRAINT stops_skip_reason_check CHECK (status != 'skipped' OR skip_reason IS NOT NULL),
    CONSTRAINT stops_unique_sequence UNIQUE (dispatch_id, sequence_order),

    -- ─── Foreign Keys ─────────────────────────────────────────────────────────
    CONSTRAINT stops_dispatch_id_fkey
        FOREIGN KEY (dispatch_id) REFERENCES dispatches(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT stops_load_id_fkey
        FOREIGN KEY (load_id) REFERENCES loads(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT stops_facility_id_fkey
        FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT stops_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_stops_dispatch_id      ON stops (dispatch_id);
CREATE INDEX idx_stops_load_id          ON stops (load_id);
CREATE INDEX idx_stops_client_id        ON stops (client_id);
CREATE INDEX idx_stops_status           ON stops (status);
CREATE INDEX idx_stops_sequence_order   ON stops (dispatch_id, sequence_order);
