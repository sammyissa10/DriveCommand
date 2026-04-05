-- Migration 007: Carrier Operations — dispatches table
-- Depends on: 20260404100005_carrier_route_templates (route_templates table)
--             20260404100004_carrier_drivers_trucks (carrier_drivers, carrier_trucks tables)
--             "User" table (dispatcher_id FK)
--             "Tenant" table (org_id FK)
-- NOTE: dispatches has NO client_id column — clients are linked via loads, not dispatches.
--       This is an architectural rule: dispatch = movement of equipment; load = commercial agreement.

CREATE TABLE dispatches (
    id                          UUID            NOT NULL DEFAULT gen_random_uuid(),
    org_id                      UUID            NOT NULL,

    -- Route template (optional — dispatch may be ad-hoc)
    route_template_id           UUID,

    -- Crew
    primary_driver_id           UUID            NOT NULL,
    co_driver_id                UUID,

    -- Equipment
    truck_id                    UUID            NOT NULL,
    trailer_id                  UUID,

    -- Dispatcher
    dispatcher_id               UUID,

    -- Schedule
    scheduled_departure         TIMESTAMPTZ     NOT NULL,
    actual_departure            TIMESTAMPTZ,
    scheduled_arrival           TIMESTAMPTZ,
    actual_arrival              TIMESTAMPTZ,

    -- Status
    status                      VARCHAR(20)     NOT NULL DEFAULT 'planned',

    -- Relay / team drive
    -- relay_handoff_stop_id is a plain UUID with NO foreign key constraint.
    -- A FK here would create a circular reference: dispatches → stops → dispatches.
    -- Application code is responsible for maintaining referential integrity.
    relay_handoff_stop_id       UUID,

    -- Miles & HOS
    planned_miles               NUMERIC(10,2),
    actual_miles                NUMERIC(10,2),
    hos_cycle                   VARCHAR(20)     NOT NULL DEFAULT 'us_70',

    -- Notes
    notes                       TEXT,

    -- Timestamps
    created_at                  TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at                  TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ─── Constraints ──────────────────────────────────────────────────────────
    CONSTRAINT dispatches_pkey PRIMARY KEY (id),
    CONSTRAINT dispatches_status_check CHECK (status IN ('planned', 'in_progress', 'completed', 'cancelled', 'tonu')),
    CONSTRAINT dispatches_hos_cycle_check CHECK (hos_cycle IN ('us_70', 'us_60', 'canada_70', 'canada_80')),

    -- ─── Foreign Keys ─────────────────────────────────────────────────────────
    CONSTRAINT dispatches_org_id_fkey
        FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT dispatches_route_template_id_fkey
        FOREIGN KEY (route_template_id) REFERENCES route_templates(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT dispatches_primary_driver_id_fkey
        FOREIGN KEY (primary_driver_id) REFERENCES carrier_drivers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT dispatches_co_driver_id_fkey
        FOREIGN KEY (co_driver_id) REFERENCES carrier_drivers(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT dispatches_truck_id_fkey
        FOREIGN KEY (truck_id) REFERENCES carrier_trucks(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT dispatches_trailer_id_fkey
        FOREIGN KEY (trailer_id) REFERENCES carrier_trucks(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT dispatches_dispatcher_id_fkey
        FOREIGN KEY (dispatcher_id) REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_dispatches_primary_driver_id    ON dispatches (primary_driver_id);
CREATE INDEX idx_dispatches_truck_id             ON dispatches (truck_id);
CREATE INDEX idx_dispatches_status               ON dispatches (status);
CREATE INDEX idx_dispatches_scheduled_departure  ON dispatches (scheduled_departure);
CREATE INDEX idx_dispatches_org_id               ON dispatches (org_id);
