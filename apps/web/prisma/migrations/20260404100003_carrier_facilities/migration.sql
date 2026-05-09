-- Migration 003: Carrier Operations — facilities table
-- Terminal / yard / warehouse locations for carrier operations

CREATE TABLE facilities (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL,

    -- Identity
    name            TEXT        NOT NULL,
    facility_type   TEXT        NOT NULL DEFAULT 'terminal',

    -- Address
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    state           TEXT,
    zip             TEXT,
    country         TEXT        NOT NULL DEFAULT 'US',

    -- Coordinates
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,

    -- Contact
    contact_name    TEXT,
    contact_phone   TEXT,
    contact_email   TEXT,

    -- Notes
    notes           TEXT,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT facilities_pkey PRIMARY KEY (id),
    CONSTRAINT facilities_facility_type_check CHECK (facility_type IN ('terminal', 'yard', 'warehouse', 'drop_yard', 'customer_site')),
    CONSTRAINT facilities_org_id_fkey FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX facilities_org_id_idx       ON facilities (org_id);
CREATE INDEX facilities_facility_type_idx ON facilities (facility_type);
