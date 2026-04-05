-- Migration 004: Carrier Operations — carrier_drivers and carrier_trucks tables
-- Depends on: 20260404100003_carrier_facilities (facilities table for home_terminal_id FK)
-- carrier_drivers = carrier-ops profile for a driver (separate from existing Driver table)
-- carrier_trucks  = carrier-ops truck records (separate from existing Truck table)

-- ─── carrier_drivers ────────────────────────────────────────────────────────

CREATE TABLE carrier_drivers (
    id                  UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id              UUID        NOT NULL,

    -- Link to platform User (optional — may be pre-hire or external)
    user_id             UUID,

    -- Identity
    first_name          TEXT        NOT NULL,
    last_name           TEXT        NOT NULL,
    email               TEXT,
    phone               TEXT,

    -- CDL
    cdl_number          TEXT,
    cdl_state           TEXT,
    cdl_class           TEXT,
    cdl_expiry          DATE,

    -- Assignment
    home_terminal_id    UUID,

    -- Compensation
    pay_model           TEXT        NOT NULL DEFAULT 'per_mile',
    pay_rate            NUMERIC(10,4),
    pay_period          TEXT        NOT NULL DEFAULT 'weekly',

    -- Status
    status              TEXT        NOT NULL DEFAULT 'active',

    -- Notes
    notes               TEXT,

    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT carrier_drivers_pkey PRIMARY KEY (id),
    CONSTRAINT carrier_drivers_user_id_unique UNIQUE (user_id),
    CONSTRAINT carrier_drivers_cdl_class_check CHECK (cdl_class IS NULL OR cdl_class IN ('A', 'B', 'C')),
    CONSTRAINT carrier_drivers_pay_model_check CHECK (pay_model IN ('per_mile', 'percentage', 'flat', 'hourly', 'salary')),
    CONSTRAINT carrier_drivers_pay_period_check CHECK (pay_period IN ('weekly', 'biweekly', 'monthly', 'per_load')),
    CONSTRAINT carrier_drivers_status_check CHECK (status IN ('active', 'inactive', 'on_leave', 'terminated')),
    CONSTRAINT carrier_drivers_user_id_fkey FOREIGN KEY (user_id) REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_drivers_home_terminal_id_fkey FOREIGN KEY (home_terminal_id) REFERENCES facilities(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_drivers_org_id_fkey FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX carrier_drivers_org_id_idx ON carrier_drivers (org_id);
CREATE INDEX carrier_drivers_status_idx ON carrier_drivers (status);

-- ─── carrier_trucks ─────────────────────────────────────────────────────────

CREATE TABLE carrier_trucks (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL,

    -- Identity
    unit_number     TEXT        NOT NULL,
    year            INTEGER,
    make            TEXT,
    model           TEXT,
    vin             TEXT,

    -- Type & capacity
    truck_type      TEXT        NOT NULL DEFAULT 'semi',
    payload_capacity_lbs INTEGER,
    gross_weight_lbs     INTEGER,

    -- Licensing
    license_plate   TEXT,
    license_state   TEXT,
    license_expiry  DATE,

    -- Registration & insurance
    registration_expiry DATE,
    insurance_expiry    DATE,

    -- Odometer
    current_odometer_miles INTEGER,
    last_odometer_date     DATE,

    -- Status
    status          TEXT        NOT NULL DEFAULT 'active',

    -- Notes
    notes           TEXT,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT carrier_trucks_pkey PRIMARY KEY (id),
    CONSTRAINT carrier_trucks_truck_type_check CHECK (truck_type IN ('semi', 'straight', 'tanker', 'flatbed', 'refrigerated', 'other')),
    CONSTRAINT carrier_trucks_status_check CHECK (status IN ('active', 'inactive', 'in_maintenance', 'out_of_service')),
    CONSTRAINT carrier_trucks_org_id_fkey FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX carrier_trucks_org_id_idx ON carrier_trucks (org_id);
CREATE INDEX carrier_trucks_status_idx ON carrier_trucks (status);
