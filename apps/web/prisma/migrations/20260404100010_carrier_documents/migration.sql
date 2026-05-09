-- Migration 010: Carrier Operations — carrier_documents table
-- Depends on: 20260404100001_carrier_clients (clients table)
--             20260404100009_carrier_stops (stops table)
--             "User" table (uploaded_by, verified_by FKs)
-- NOTE: parent_id is a plain UUID column with NO FK constraint (polymorphic reference).
--       parent_type indicates what entity parent_id points to:
--       'stop', 'load', 'dispatch', 'contract', 'expense'.
-- NOTE: No org_id on carrier_documents — tenant scoping is via parent_type/parent_id
--       polymorphic reference (inherited from the parent entity).

CREATE TABLE carrier_documents (
    id                  UUID            NOT NULL DEFAULT gen_random_uuid(),

    -- Polymorphic parent reference (no FK — intentionally untyped)
    parent_type         VARCHAR(20)     NOT NULL,
    parent_id           UUID            NOT NULL,

    -- Optional explicit FKs for common parent types (for efficient queries)
    stop_id             UUID,
    client_id           UUID,

    -- Document classification
    document_type       VARCHAR(30)     NOT NULL,

    -- File storage
    file_url            VARCHAR(500)    NOT NULL,
    filename            VARCHAR(255)    NOT NULL,
    file_size_bytes     INTEGER,

    -- Uploader
    uploaded_by         UUID            NOT NULL,

    -- Verification
    verified            BOOLEAN         NOT NULL DEFAULT false,
    verified_by         UUID,
    verified_at         TIMESTAMPTZ,

    -- Notes
    notes               TEXT,

    -- Timestamps
    created_at          TIMESTAMPTZ     NOT NULL DEFAULT NOW(),

    -- ─── Constraints ──────────────────────────────────────────────────────────
    CONSTRAINT carrier_documents_pkey PRIMARY KEY (id),
    CONSTRAINT carrier_documents_parent_type_check CHECK (
        parent_type IN ('stop', 'load', 'dispatch', 'contract', 'expense')
    ),
    CONSTRAINT carrier_documents_document_type_check CHECK (
        document_type IN (
            'bol', 'pod', 'rate_confirmation', 'lumper_receipt',
            'weight_ticket', 'inspection_report', 'expense_receipt',
            'insurance_certificate', 'other'
        )
    ),

    -- ─── Foreign Keys ─────────────────────────────────────────────────────────
    CONSTRAINT carrier_documents_stop_id_fkey
        FOREIGN KEY (stop_id) REFERENCES stops(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_documents_client_id_fkey
        FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT carrier_documents_uploaded_by_fkey
        FOREIGN KEY (uploaded_by) REFERENCES "User"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT carrier_documents_verified_by_fkey
        FOREIGN KEY (verified_by) REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX idx_carrier_documents_parent    ON carrier_documents (parent_type, parent_id);
CREATE INDEX idx_carrier_documents_stop_id   ON carrier_documents (stop_id);
CREATE INDEX idx_carrier_documents_client_id ON carrier_documents (client_id);
