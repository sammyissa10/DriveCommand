-- Migration 011: Carrier Operations — carrier_expenses table
-- Depends on: 20260404100007_carrier_dispatches (dispatches table)
--             20260404100008_carrier_loads (loads table)
--             20260404100009_carrier_stops (stops table)
--             20260404100001_carrier_clients (clients table)
--             20260404100004_carrier_drivers_trucks (carrier_drivers table)
--             20260404100010_carrier_documents (carrier_documents table)
--             "User" table (approved_by FK)
--             "Tenant" table (org_id FK)
-- NOTE: TABLE-LEVEL CHECK requires at least one of dispatch_id or load_id to be non-null.

CREATE TABLE carrier_expenses (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),

    -- Parent dispatch / load (at least one required — enforced by CHECK below)
    dispatch_id         UUID,
    load_id             UUID,

    -- Optional stop and client links
    stop_id             UUID,
    client_id           UUID,

    -- Expense classification
    expense_type        VARCHAR(30)     NOT NULL,

    -- Amount
    amount              DECIMAL(10,2)   NOT NULL,
    currency            CHAR(3)         NOT NULL DEFAULT 'USD',

    -- Payment method
    paid_by             VARCHAR(20)     NOT NULL,

    -- Driver (optional — who incurred the expense)
    driver_id           UUID,

    -- Receipt document
    receipt_document_id UUID,

    -- Submission and approval
    submitted_at        TIMESTAMPTZ,
    approved_by         UUID,
    approved_at         TIMESTAMPTZ,

    -- Reimbursability
    reimbursable        BOOLEAN         NOT NULL DEFAULT true,

    -- Notes
    notes               TEXT,

    -- Tenant scoping
    org_id              UUID            NOT NULL,

    -- Timestamps
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- ─── Constraints ──────────────────────────────────────────────────────────
    CONSTRAINT carrier_expenses_pkey PRIMARY KEY (id),
    CONSTRAINT carrier_expenses_expense_type_check CHECK (
        expense_type IN (
            'fuel', 'tolls', 'scales', 'lumper', 'parking',
            'maintenance_emergency', 'driver_advance', 'other'
        )
    ),
    CONSTRAINT carrier_expenses_paid_by_check CHECK (
        paid_by IN ('driver_cash', 'company_card', 'fuel_card', 'driver_advance')
    ),
    CONSTRAINT carrier_expenses_dispatch_or_load_check CHECK (
        dispatch_id IS NOT NULL OR load_id IS NOT NULL
    ),

    -- ─── Foreign Keys ─────────────────────────────────────────────────────────
    CONSTRAINT carrier_expenses_dispatch_id_fkey
        FOREIGN KEY (dispatch_id) REFERENCES dispatches(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_expenses_load_id_fkey
        FOREIGN KEY (load_id) REFERENCES loads(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_expenses_stop_id_fkey
        FOREIGN KEY (stop_id) REFERENCES stops(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_expenses_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_expenses_driver_id_fkey
        FOREIGN KEY (driver_id) REFERENCES carrier_drivers(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_expenses_receipt_document_id_fkey
        FOREIGN KEY (receipt_document_id) REFERENCES carrier_documents(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_expenses_approved_by_fkey
        FOREIGN KEY (approved_by) REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_expenses_org_id_fkey
        FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_carrier_expenses_dispatch_id ON carrier_expenses (dispatch_id);
CREATE INDEX idx_carrier_expenses_load_id     ON carrier_expenses (load_id);
CREATE INDEX idx_carrier_expenses_driver_id   ON carrier_expenses (driver_id);
CREATE INDEX idx_carrier_expenses_client_id   ON carrier_expenses (client_id);
CREATE INDEX idx_carrier_expenses_org_id      ON carrier_expenses (org_id);
