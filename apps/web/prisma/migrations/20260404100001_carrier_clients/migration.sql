-- Migration 001: Carrier Operations — clients table
-- New table for carrier client/customer management (does NOT modify any existing tables)

CREATE TABLE clients (
    id              UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id          UUID        NOT NULL,

    -- Identity
    name            TEXT        NOT NULL,
    dba_name        TEXT,
    mc_number       TEXT,
    dot_number      TEXT,
    tax_id          TEXT,

    -- Contact
    primary_contact TEXT,
    email           TEXT,
    phone           TEXT,
    website         TEXT,

    -- Address
    address_line1   TEXT,
    address_line2   TEXT,
    city            TEXT,
    state           TEXT,
    zip             TEXT,
    country         TEXT        NOT NULL DEFAULT 'US',

    -- Status
    status          TEXT        NOT NULL DEFAULT 'active',

    -- Portal access
    portal_access   BOOLEAN     NOT NULL DEFAULT false,
    portal_email    TEXT,

    -- Notes
    notes           TEXT,

    -- Timestamps
    created_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT clients_pkey PRIMARY KEY (id),
    CONSTRAINT clients_status_check CHECK (status IN ('active', 'inactive', 'blocked')),
    CONSTRAINT clients_portal_check CHECK (portal_access = false OR portal_email IS NOT NULL),
    CONSTRAINT clients_org_id_fkey FOREIGN KEY (org_id) REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX clients_org_id_idx  ON clients (org_id);
CREATE INDEX clients_status_idx  ON clients (status);
