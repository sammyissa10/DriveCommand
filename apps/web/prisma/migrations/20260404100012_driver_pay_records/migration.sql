-- Migration 012: Carrier Operations — driver_pay_records table
-- Depends on: 20260404100004_carrier_drivers_trucks (carrier_drivers table)
--             20260404100007_carrier_dispatches (dispatches table)
--             20260404100008_carrier_loads (loads table)
--             20260404100001_carrier_clients (clients table)
--             "User" table (approved_by FK)
--             "Tenant" table (org_id FK)

CREATE TABLE driver_pay_records (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),

    -- Driver (required)
    driver_id           UUID            NOT NULL,

    -- Parent dispatch / load / client (optional links)
    dispatch_id         UUID,
    load_id             UUID,
    client_id           UUID,

    -- Pay model
    pay_model           VARCHAR(30)     NOT NULL,

    -- Per-mile pay fields
    loaded_miles        INTEGER,
    empty_miles         INTEGER,
    loaded_rate         DECIMAL(8,4),
    empty_rate          DECIMAL(8,4),

    -- Hourly pay fields
    hours_worked        DECIMAL(6,2),
    hourly_rate         DECIMAL(8,2),

    -- Percentage-of-gross fields
    gross_revenue       DECIMAL(12,2),
    percentage_applied  DECIMAL(5,4),

    -- Flat pay
    flat_amount         DECIMAL(10,2),

    -- Pay components
    base_pay            DECIMAL(10,2)   NOT NULL DEFAULT 0,
    bonuses             DECIMAL(8,2)    NOT NULL DEFAULT 0,
    tips                DECIMAL(8,2)    NOT NULL DEFAULT 0,
    deductions          DECIMAL(8,2)    NOT NULL DEFAULT 0,
    reimbursements      DECIMAL(8,2)    NOT NULL DEFAULT 0,
    net_pay             DECIMAL(10,2)   NOT NULL DEFAULT 0,

    -- Pay period
    pay_period_start    DATE,
    pay_period_end      DATE,

    -- Status workflow
    status              VARCHAR(20)     NOT NULL DEFAULT 'pending',

    -- Approval
    approved_by         UUID,
    approved_at         TIMESTAMPTZ,

    -- Notes
    notes               TEXT,

    -- Tenant scoping
    org_id              UUID            NOT NULL,

    -- Timestamps
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- ─── Constraints ──────────────────────────────────────────────────────────
    CONSTRAINT driver_pay_records_pkey PRIMARY KEY (id),
    CONSTRAINT driver_pay_records_pay_model_check CHECK (
        pay_model IN ('per_mile', 'percentage_gross', 'hourly', 'flat', 'salary')
    ),
    CONSTRAINT driver_pay_records_status_check CHECK (
        status IN ('pending', 'approved', 'paid', 'voided')
    ),

    -- ─── Foreign Keys ─────────────────────────────────────────────────────────
    CONSTRAINT driver_pay_records_driver_id_fkey
        FOREIGN KEY (driver_id) REFERENCES carrier_drivers(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT driver_pay_records_dispatch_id_fkey
        FOREIGN KEY (dispatch_id) REFERENCES dispatches(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT driver_pay_records_load_id_fkey
        FOREIGN KEY (load_id) REFERENCES loads(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT driver_pay_records_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT driver_pay_records_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT driver_pay_records_org_id_fkey
        FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_driver_pay_records_driver_id        ON driver_pay_records (driver_id);
CREATE INDEX idx_driver_pay_records_dispatch_id      ON driver_pay_records (dispatch_id);
CREATE INDEX idx_driver_pay_records_status           ON driver_pay_records (status);
CREATE INDEX idx_driver_pay_records_pay_period_start ON driver_pay_records (pay_period_start);
