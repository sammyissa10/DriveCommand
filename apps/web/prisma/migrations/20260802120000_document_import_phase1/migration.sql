-- ============================================================================
-- Document Import — Phase 1: data model
-- Spec:  docs/specs/DocumentImport_TechnicalSpec_v1.md Sections 5, 6, 14, 15
-- Audit: .planning/document-import/00-AUDIT.md
--
-- ADDITIVE ONLY. No DROP, no rename, no ALTER COLUMN TYPE.
-- Every ALTER below is ADD COLUMN IF NOT EXISTS with a default, so existing
-- rows keep working untouched.
--
-- Tenant column follows the carrier sibling convention: org_id (NOT tenantId),
-- per the header note on 20260722000004_add_client_contacts.
-- ============================================================================
BEGIN;

-- ─── 1. document_imports — one row per upload session ───────────────────────
CREATE TABLE IF NOT EXISTS document_imports (
    id                    UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id                UUID        NOT NULL,
    status                TEXT        NOT NULL DEFAULT 'UPLOADED',

    source_file_keys      TEXT[]      NOT NULL DEFAULT '{}',
    source_mime_type      TEXT,
    original_name         TEXT,

    content_hash          TEXT        NOT NULL,
    document_number       TEXT,
    document_date         DATE,
    document_type         TEXT,

    client_id             UUID,
    contract_id           UUID,
    route_template_id     UUID,
    document_profile_id   UUID,

    raw_extraction        JSONB,
    reviewed_extraction   JSONB,
    extraction_warnings   JSONB       NOT NULL DEFAULT '[]'::jsonb,

    model_identifier      TEXT,
    input_tokens          INTEGER,
    output_tokens         INTEGER,
    cost_usd              NUMERIC(10,6),

    page_count            INTEGER,
    cached_pages          INTEGER     NOT NULL DEFAULT 0,
    failure_code          TEXT,
    failure_message       TEXT,

    created_trip_id       UUID,
    created_entity_ids    JSONB       NOT NULL DEFAULT '{}'::jsonb,
    committed_at          TIMESTAMPTZ,

    created_by_id         UUID,
    updated_by_id         UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by_id         UUID,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT document_imports_pkey PRIMARY KEY (id),
    CONSTRAINT document_imports_org_id_fkey   FOREIGN KEY (org_id)   REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT document_imports_client_id_fkey   FOREIGN KEY (client_id)   REFERENCES clients(id)   ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT document_imports_contract_id_fkey FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE SET NULL ON UPDATE CASCADE,
    -- Spec Section 6 lifecycle. Illegal transitions are additionally rejected in
    -- app code (lib/document-import/lifecycle.ts); this is the backstop.
    CONSTRAINT document_imports_status_check CHECK (
        status IN ('UPLOADED','EXTRACTING','NEEDS_REVIEW','READY','COMMITTING','COMMITTED','FAILED','CANCELLED')
    )
);

CREATE INDEX IF NOT EXISTS document_imports_org_id_idx     ON document_imports (org_id);
CREATE INDEX IF NOT EXISTS document_imports_status_idx     ON document_imports (status);
CREATE INDEX IF NOT EXISTS document_imports_client_id_idx  ON document_imports (client_id);
CREATE INDEX IF NOT EXISTS document_imports_deleted_at_idx ON document_imports (deleted_at);
CREATE INDEX IF NOT EXISTS document_imports_org_created_idx ON document_imports (org_id, created_at DESC);

-- Deduplication (spec Section 14): SHA-256 over source bytes + tenant + document
-- number + document date, enforced at the DATABASE level so two dispatchers
-- uploading the same manifest concurrently cannot both get through.
--
-- COALESCE rather than NULLS NOT DISTINCT: in a plain unique index NULL <> NULL,
-- so two imports that both lack a document number would not collide. Sentinels
-- make the comparison total on every supported Postgres version.
--
-- Partial on deleted_at IS NULL so a soft-deleted import never blocks a
-- legitimate re-import, which is what "import as a correction" needs.
CREATE UNIQUE INDEX IF NOT EXISTS document_imports_dedupe_key
  ON document_imports (
      org_id,
      content_hash,
      COALESCE(document_number, ''),
      COALESCE(document_date, DATE '1900-01-01')
  )
  WHERE deleted_at IS NULL;

-- ─── 2. document_import_pages — per-page extraction cache ───────────────────
CREATE TABLE IF NOT EXISTS document_import_pages (
    id                UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id            UUID        NOT NULL,
    import_id         UUID        NOT NULL,

    page_number       INTEGER     NOT NULL,
    page_hash         TEXT        NOT NULL,
    storage_key       TEXT,

    extraction        JSONB,
    was_cached        BOOLEAN     NOT NULL DEFAULT false,

    model_identifier  TEXT,
    input_tokens      INTEGER,
    output_tokens     INTEGER,

    failure_code      TEXT,
    failure_message   TEXT,

    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT document_import_pages_pkey PRIMARY KEY (id),
    CONSTRAINT document_import_pages_org_id_fkey    FOREIGN KEY (org_id)    REFERENCES "Tenant"(id)      ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT document_import_pages_import_id_fkey FOREIGN KEY (import_id) REFERENCES document_imports(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT document_import_pages_import_page_key UNIQUE (import_id, page_number)
);

CREATE INDEX IF NOT EXISTS document_import_pages_org_id_idx    ON document_import_pages (org_id);
CREATE INDEX IF NOT EXISTS document_import_pages_import_id_idx ON document_import_pages (import_id);
-- The cache lookup: "have we already extracted a page with these bytes, for this
-- tenant?" Scoped by org_id so one tenant can never read another's extraction.
CREATE INDEX IF NOT EXISTS document_import_pages_org_hash_idx  ON document_import_pages (org_id, page_hash);

-- ─── 3. facility_external_references ────────────────────────────────────────
-- The highest-value table in the module: "43775" resolves silently forever once
-- a human has confirmed it (spec Sections 1.5, 7).
CREATE TABLE IF NOT EXISTS facility_external_references (
    id                UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id            UUID        NOT NULL,
    client_id         UUID        NOT NULL,
    source_code       TEXT        NOT NULL,
    facility_id       UUID        NOT NULL,

    resolved_via      TEXT,
    source_import_id  UUID,
    source_name       TEXT,

    confirmed_by_id   UUID,
    created_by_id     UUID,
    updated_by_id     UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT facility_external_references_pkey PRIMARY KEY (id),
    CONSTRAINT facility_external_references_org_id_fkey      FOREIGN KEY (org_id)      REFERENCES "Tenant"(id)  ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT facility_external_references_client_id_fkey   FOREIGN KEY (client_id)   REFERENCES clients(id)   ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT facility_external_references_facility_id_fkey FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT facility_external_references_source_import_fkey FOREIGN KEY (source_import_id) REFERENCES document_imports(id) ON DELETE SET NULL ON UPDATE CASCADE,
    -- Tier 1 of the ladder is an exact lookup on this triple.
    CONSTRAINT facility_external_references_org_client_code_key UNIQUE (org_id, client_id, source_code),
    CONSTRAINT facility_external_references_resolved_via_check CHECK (
        resolved_via IS NULL OR resolved_via IN ('T1','T2','T3','T4')
    )
);

CREATE INDEX IF NOT EXISTS facility_external_references_org_id_idx      ON facility_external_references (org_id);
CREATE INDEX IF NOT EXISTS facility_external_references_client_id_idx   ON facility_external_references (client_id);
CREATE INDEX IF NOT EXISTS facility_external_references_facility_id_idx ON facility_external_references (facility_id);

-- ─── 4. document_profiles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS document_profiles (
    id                      UUID        NOT NULL DEFAULT gen_random_uuid(),
    org_id                  UUID        NOT NULL,
    client_id               UUID        NOT NULL,
    document_type           TEXT        NOT NULL,

    name                    TEXT,
    extraction_hints        JSONB       NOT NULL DEFAULT '{}'::jsonb,
    column_mapping          JSONB       NOT NULL DEFAULT '{}'::jsonb,

    commit_strategy         TEXT,
    default_end_stop_policy TEXT,
    pinned_contract_id      UUID,

    created_by_id           UUID,
    updated_by_id           UUID,
    deleted_at              TIMESTAMPTZ,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT document_profiles_pkey PRIMARY KEY (id),
    CONSTRAINT document_profiles_org_id_fkey    FOREIGN KEY (org_id)    REFERENCES "Tenant"(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT document_profiles_client_id_fkey FOREIGN KEY (client_id) REFERENCES clients(id)  ON DELETE CASCADE  ON UPDATE CASCADE,
    CONSTRAINT document_profiles_pinned_contract_fkey FOREIGN KEY (pinned_contract_id) REFERENCES contracts(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT document_profiles_org_client_type_key UNIQUE (org_id, client_id, document_type)
);

CREATE INDEX IF NOT EXISTS document_profiles_org_id_idx    ON document_profiles (org_id);
CREATE INDEX IF NOT EXISTS document_profiles_client_id_idx ON document_profiles (client_id);

-- Deferred FKs that reference tables created above, added after all four exist.
ALTER TABLE document_imports
  ADD CONSTRAINT document_imports_document_profile_id_fkey
  FOREIGN KEY (document_profile_id) REFERENCES document_profiles(id) ON DELETE SET NULL ON UPDATE CASCADE;

-- ─── 5. Tenant settings (spec Section 6) ────────────────────────────────────
-- No TenantSettings table exists; these follow the precedent of truckCount /
-- heardAbout, added the same way ten days earlier (audit B3).
ALTER TABLE "Tenant"
  ADD COLUMN IF NOT EXISTS "autoCreateRouteTemplatesFromImports" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "defaultEndStopPolicy"                TEXT    NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "homeBaseFacilityId"                  UUID,
  ADD COLUMN IF NOT EXISTS "requirePreTripInspection"            BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "blockTripStartOnFailedInspection"    BOOLEAN NOT NULL DEFAULT true;

DO $$
BEGIN
  ALTER TABLE "Tenant"
    ADD CONSTRAINT "Tenant_homeBaseFacilityId_fkey"
    FOREIGN KEY ("homeBaseFacilityId") REFERENCES facilities(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE "Tenant"
    ADD CONSTRAINT "Tenant_defaultEndStopPolicy_check"
    CHECK ("defaultEndStopPolicy" IN ('RETURN_TO_ORIGIN','HOME_BASE','DESIGNATED_PARKING','DRIVER_RESIDENCE','NONE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 6. facilities — driver residence (spec Sections 6 + 9) ─────────────────
ALTER TABLE facilities
  ADD COLUMN IF NOT EXISTS is_driver_residence BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS resident_driver_id  UUID;

DO $$
BEGIN
  ALTER TABLE facilities
    ADD CONSTRAINT facilities_resident_driver_id_fkey
    FOREIGN KEY (resident_driver_id) REFERENCES carrier_drivers(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Supports the server-side privacy filter in Section 9. A driver residence must
-- never appear in the general picker or in exports.
CREATE INDEX IF NOT EXISTS facilities_org_driver_residence_idx
  ON facilities (org_id, is_driver_residence);

-- ─── 7. route_templates (spec Sections 6 + 8) ───────────────────────────────
ALTER TABLE route_templates
  ADD COLUMN IF NOT EXISTS end_stop_policy    TEXT,
  ADD COLUMN IF NOT EXISTS source_import_id   UUID,
  ADD COLUMN IF NOT EXISTS is_suggested       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_applied_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS application_count  INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  ALTER TABLE route_templates
    ADD CONSTRAINT route_templates_source_import_id_fkey
    FOREIGN KEY (source_import_id) REFERENCES document_imports(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE route_templates
    ADD CONSTRAINT route_templates_end_stop_policy_check
    CHECK (end_stop_policy IS NULL OR end_stop_policy IN ('RETURN_TO_ORIGIN','HOME_BASE','DESIGNATED_PARKING','DRIVER_RESIDENCE','NONE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS route_templates_org_suggested_idx ON route_templates (org_id, is_suggested);

-- ─── 8. dispatches (Trip) (spec Sections 6 + 9 + 12) ────────────────────────
ALTER TABLE dispatches
  ADD COLUMN IF NOT EXISTS source_import_id             UUID,
  ADD COLUMN IF NOT EXISTS end_stop_policy              TEXT,
  ADD COLUMN IF NOT EXISTS inspection_required          BOOLEAN,
  ADD COLUMN IF NOT EXISTS inspection_overridden_by_id  UUID,
  ADD COLUMN IF NOT EXISTS inspection_overridden_reason TEXT,
  ADD COLUMN IF NOT EXISTS inspection_overridden_at     TIMESTAMPTZ;

DO $$
BEGIN
  ALTER TABLE dispatches
    ADD CONSTRAINT dispatches_source_import_id_fkey
    FOREIGN KEY (source_import_id) REFERENCES document_imports(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE dispatches
    ADD CONSTRAINT dispatches_inspection_overridden_by_fkey
    FOREIGN KEY (inspection_overridden_by_id) REFERENCES "User"(id) ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  ALTER TABLE dispatches
    ADD CONSTRAINT dispatches_end_stop_policy_check
    CHECK (end_stop_policy IS NULL OR end_stop_policy IN ('RETURN_TO_ORIGIN','HOME_BASE','DESIGNATED_PARKING','DRIVER_RESIDENCE','NONE'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── 9. stops (CarrierStop) (spec Sections 6 + 10) ──────────────────────────
-- JSONB rather than three child tables (audit B6). The scalar bol_number /
-- pieces / weight_lbs columns stay populated in parallel so existing invoicing
-- and reports keep reading what they already read.
--
-- stop_references, not references: REFERENCES is a reserved word in Postgres.
ALTER TABLE stops
  ADD COLUMN IF NOT EXISTS stop_references   JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS line_items        JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS page_numbers      JSONB   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS is_end_stop       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rollup_overridden BOOLEAN NOT NULL DEFAULT false;

-- ─── 10. RLS on the four new tables ─────────────────────────────────────────
ALTER TABLE document_imports              ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_imports              FORCE  ROW LEVEL SECURITY;
ALTER TABLE document_import_pages         ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_import_pages         FORCE  ROW LEVEL SECURITY;
ALTER TABLE facility_external_references  ENABLE ROW LEVEL SECURITY;
ALTER TABLE facility_external_references  FORCE  ROW LEVEL SECURITY;
ALTER TABLE document_profiles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_profiles             FORCE  ROW LEVEL SECURITY;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_imports','document_import_pages','facility_external_references','document_profiles']
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I FOR ALL USING (org_id = current_tenant_id()) WITH CHECK (org_id = current_tenant_id())',
        t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;

    BEGIN
      EXECUTE format(
        'CREATE POLICY bypass_rls_policy ON %I FOR ALL USING (current_setting(''app.bypass_rls'', TRUE)::text = ''on'')',
        t
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END;
  END LOOP;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON document_imports             TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_import_pages        TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON facility_external_references TO app_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_profiles            TO app_user;

-- ─── Self-validation block ──────────────────────────────────────────────────
DO $$
DECLARE
  t TEXT;
  missing TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['document_imports','document_import_pages','facility_external_references','document_profiles']
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relname = t
        AND c.relrowsecurity = TRUE AND c.relforcerowsecurity = TRUE
    ) THEN
      RAISE EXCEPTION 'document-import p1: % missing FORCE RLS after migration', t;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'tenant_isolation_policy'
    ) THEN
      RAISE EXCEPTION 'document-import p1: tenant_isolation_policy missing on %', t;
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t AND policyname = 'bypass_rls_policy'
    ) THEN
      RAISE EXCEPTION 'document-import p1: bypass_rls_policy missing on %', t;
    END IF;
  END LOOP;

  -- The dedupe constraint is the whole point of Section 14; assert it exists.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'document_imports_dedupe_key'
  ) THEN
    RAISE EXCEPTION 'document-import p1: document_imports_dedupe_key index missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'facility_external_references_org_client_code_key'
  ) THEN
    RAISE EXCEPTION 'document-import p1: external reference uniqueness constraint missing';
  END IF;

  -- Every additive column landed.
  SELECT string_agg(x, ', ') INTO missing FROM (
    SELECT 'Tenant.' || c AS x FROM unnest(ARRAY[
      'autoCreateRouteTemplatesFromImports','defaultEndStopPolicy','homeBaseFacilityId',
      'requirePreTripInspection','blockTripStartOnFailedInspection']) AS c
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'Tenant' AND column_name = c)
    UNION ALL
    SELECT 'stops.' || c FROM unnest(ARRAY[
      'stop_references','line_items','page_numbers','is_end_stop','rollup_overridden']) AS c
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'stops' AND column_name = c)
    UNION ALL
    SELECT 'dispatches.' || c FROM unnest(ARRAY[
      'source_import_id','end_stop_policy','inspection_required',
      'inspection_overridden_by_id','inspection_overridden_reason','inspection_overridden_at']) AS c
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'dispatches' AND column_name = c)
    UNION ALL
    SELECT 'route_templates.' || c FROM unnest(ARRAY[
      'end_stop_policy','source_import_id','is_suggested','last_applied_at','application_count']) AS c
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'route_templates' AND column_name = c)
    UNION ALL
    SELECT 'facilities.' || c FROM unnest(ARRAY['is_driver_residence','resident_driver_id']) AS c
    WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_name = 'facilities' AND column_name = c)
  ) q;

  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'document-import p1: missing columns after migration: %', missing;
  END IF;
END $$;

COMMIT;
