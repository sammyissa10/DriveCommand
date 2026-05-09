-- Migration 002: Carrier Operations — contracts table
-- Depends on: 20260404100001_carrier_clients (clients table)

CREATE TABLE contracts (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id                  UUID        NOT NULL,
    client_id               UUID        NOT NULL,

    -- Identity
    contract_number         TEXT        NOT NULL,
    contract_type           TEXT        NOT NULL DEFAULT 'spot',

    -- Dates
    effective_date          DATE,
    expiration_date         DATE,

    -- Rate
    rate_type               TEXT        NOT NULL DEFAULT 'per_mile',
    base_rate               NUMERIC(10,4),
    fuel_surcharge_method   TEXT        NOT NULL DEFAULT 'none',
    fuel_surcharge_rate     NUMERIC(6,4),

    -- Status
    status                  TEXT        NOT NULL DEFAULT 'active',

    -- Notes
    notes                   TEXT,

    -- Timestamps
    created_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT contracts_pkey PRIMARY KEY (id),
    CONSTRAINT contracts_contract_number_unique UNIQUE (contract_number),
    CONSTRAINT contracts_contract_type_check CHECK (contract_type IN ('spot', 'contract', 'dedicated')),
    CONSTRAINT contracts_rate_type_check CHECK (rate_type IN ('per_mile', 'flat', 'per_load', 'hourly')),
    CONSTRAINT contracts_fuel_surcharge_method_check CHECK (fuel_surcharge_method IN ('none', 'percentage', 'per_mile', 'table')),
    CONSTRAINT contracts_status_check CHECK (status IN ('active', 'expired', 'cancelled', 'draft')),
    CONSTRAINT contracts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT contracts_org_id_fkey FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX contracts_client_id_idx ON contracts (client_id);
CREATE INDEX contracts_status_idx    ON contracts (status);
CREATE INDEX contracts_org_id_idx    ON contracts (org_id);
