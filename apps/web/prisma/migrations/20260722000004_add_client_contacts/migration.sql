-- ============================================================================
-- Quick-492: Add client_contacts (one-to-many contacts per carrier client)
-- Spec: .planning/quick/492-add-multiple-contacts-per-client-client-/492-PLAN.md
-- Tenant column follows the carrier sibling convention: org_id (NOT tenantId).
-- Legacy CarrierClient single-contact columns (primary_contact/email/phone/
-- website) are left in place as a fallback — this table is purely additive.
-- ============================================================================
BEGIN;

CREATE TABLE IF NOT EXISTS client_contacts (
    id         UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id     UUID        NOT NULL,
    client_id  UUID        NOT NULL,
    name       TEXT        NOT NULL,
    role       TEXT,
    phone      TEXT,
    email      TEXT,
    is_main    BOOLEAN     NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT client_contacts_pkey PRIMARY KEY (id),
    CONSTRAINT client_contacts_org_id_fkey    FOREIGN KEY (org_id)    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT client_contacts_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id)   ON DELETE CASCADE   ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS client_contacts_org_id_idx    ON client_contacts (org_id);
CREATE INDEX IF NOT EXISTS client_contacts_client_id_idx ON client_contacts (client_id);

-- At most ONE main contact per client (DB guard). "Exactly one when any exist"
-- is enforced in the app layer (normalizeContacts in lib/carrier/client-contacts.ts).
CREATE UNIQUE INDEX IF NOT EXISTS client_contacts_one_main_per_client
  ON client_contacts (client_id) WHERE is_main = true;

ALTER TABLE client_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_contacts FORCE  ROW LEVEL SECURITY;

DO $$
BEGIN
  CREATE POLICY tenant_isolation_policy ON client_contacts
    FOR ALL USING (org_id = current_tenant_id()) WITH CHECK (org_id = current_tenant_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  CREATE POLICY bypass_rls_policy ON client_contacts
    FOR ALL USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON client_contacts TO app_user;

-- ── Self-validation block ────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'client_contacts'
      AND c.relrowsecurity = TRUE AND c.relforcerowsecurity = TRUE
  ) THEN
    RAISE EXCEPTION 'quick-492: client_contacts missing FORCE RLS after migration';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'client_contacts' AND policyname = 'tenant_isolation_policy'
  ) THEN
    RAISE EXCEPTION 'quick-492: tenant_isolation_policy missing on client_contacts';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'client_contacts_one_main_per_client'
  ) THEN
    RAISE EXCEPTION 'quick-492: client_contacts_one_main_per_client index missing';
  END IF;
END $$;

COMMIT;
