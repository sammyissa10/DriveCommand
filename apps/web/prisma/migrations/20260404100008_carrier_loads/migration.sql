-- Migration 008: Carrier Operations — loads table
-- Depends on: 20260404100007_carrier_dispatches (dispatches table)
--             20260404100002_carrier_contracts (contracts table)
--             20260404100001_carrier_clients (clients table)
--             "Tenant" table (org_id FK)
-- NOTE: client_id is NOT NULL — every load must be associated with a client.
--       Tenant scoping is via org_id (direct) and dispatch_id → dispatches.org_id.

CREATE TABLE loads (
    id                      UUID            NOT NULL DEFAULT gen_random_uuid(),
    org_id                  UUID            NOT NULL,

    -- Parent dispatch (optional — load may be pre-assigned before dispatch is created)
    dispatch_id             UUID,

    -- Contract & client
    contract_id             UUID,
    client_id               UUID            NOT NULL,

    -- Load classification
    load_type               VARCHAR(20)     NOT NULL DEFAULT 'ftl',

    -- Reference numbers
    reference_number        TEXT,
    bol_number              TEXT,
    pro_number              TEXT,
    po_number               TEXT,

    -- Commodity
    commodity_description   TEXT,
    commodity_weight_lbs    NUMERIC(10,2),
    commodity_pieces        INTEGER,
    commodity_pallets       INTEGER,
    hazmat                  BOOLEAN         NOT NULL DEFAULT false,
    hazmat_class            TEXT,

    -- Rate
    rate_type               VARCHAR(20)     NOT NULL DEFAULT 'flat',
    rate_amount             DECIMAL(12,2),
    currency                VARCHAR(3)      NOT NULL DEFAULT 'USD',

    -- Broker / carrier cost
    broker_flag             BOOLEAN         NOT NULL DEFAULT false,
    carrier_cost            DECIMAL(12,2),

    -- Accessorials
    fuel_surcharge          DECIMAL(12,2),
    detention_amount        DECIMAL(12,2),
    other_charges           DECIMAL(12,2),
    total_revenue           DECIMAL(12,2),

    -- Status
    status                  VARCHAR(20)     NOT NULL DEFAULT 'pending',

    -- Notes
    special_instructions    TEXT,
    notes                   TEXT,

    -- Timestamps
    created_at              TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ     NOT NULL DEFAULT CURRENT_TIMESTAMP,

    -- ─── Constraints ──────────────────────────────────────────────────────────
    CONSTRAINT loads_pkey PRIMARY KEY (id),
    CONSTRAINT loads_load_type_check CHECK (load_type IN ('ftl', 'ltl', 'partial', 'team')),
    CONSTRAINT loads_status_check CHECK (status IN ('pending', 'assigned', 'in_transit', 'delivered', 'invoiced', 'paid', 'cancelled')),
    CONSTRAINT loads_rate_type_check CHECK (rate_type IN ('per_mile', 'flat', 'per_cwt', 'per_pallet', 'per_stop', 'hourly')),
    CONSTRAINT loads_broker_flag_check CHECK (broker_flag = false OR carrier_cost IS NOT NULL),

    -- ─── Foreign Keys ─────────────────────────────────────────────────────────
    CONSTRAINT loads_org_id_fkey
        FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT loads_dispatch_id_fkey
        FOREIGN KEY (dispatch_id) REFERENCES dispatches(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT loads_contract_id_fkey
        FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT loads_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_loads_client_id    ON loads (client_id);
CREATE INDEX idx_loads_dispatch_id  ON loads (dispatch_id);
CREATE INDEX idx_loads_status       ON loads (status);
CREATE INDEX idx_loads_created_at   ON loads (created_at);
CREATE INDEX idx_loads_org_id       ON loads (org_id);
