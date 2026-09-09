-- ============================================================================
-- Reconciliation: bring the repository into agreement with the live database
-- WITHOUT changing live state.
--
-- Phase 0, Prompt 0.5. See .planning/phase-0-revised.md §3.1 and §7, and
-- docs/diagnostics/rls-policy-drop-forensics.md §4 and §5.
--
-- Every statement in this file is a no-op against the database as it stands on
-- 2026-09-09. The 59 policies dropped below are already absent; the 8 policies
-- recreated below are already present with exactly these definitions, read out
-- of pg_policies. The file exists to move the REPOSITORY, not the database:
-- afterwards the drift detector's expected set equals the live set and its
-- suppression baseline can be deleted.
--
-- ---------------------------------------------------------------------------
-- STATUS: UNAPPLIED AS OF 2026-09-09
-- ---------------------------------------------------------------------------
--
-- This migration has not been run against any database. It will be applied by
-- `scripts/migrate.mjs` on the next deploy, like every other migration here.
--
-- It was never applied to a preview branch because Supabase branching requires
-- the Pro plan (`create_branch` returns PaymentRequiredException on this tier),
-- and production is not written from a Phase 0 session. There is no local
-- database either — DEC-3. Verification was therefore by inspection: all eight
-- Part 2 statements were diffed against the live definitions read from
-- pg_policies and match exactly on cmd, roles, USING and WITH CHECK. See
-- docs/audits/policy-drift-gate.md §7.
--
-- WHY THE DRIFT GATE ALREADY READS ZERO WITH THIS FILE UNAPPLIED — this looks
-- wrong at first glance and is not. `scripts/audit/rls-policy-drift.ts` computes
-- its EXPECTED set by parsing and replaying the migration FILES on disk, then
-- diffs that against live `pg_policy`. It never consults `_prisma_migrations`
-- and has no notion of which migrations have run. Adding this file changes the
-- expected set from 230 to 179, which equals the live count — so the detector
-- reports 0 missing / 0 unexpected immediately.
--
-- That is exactly the property that makes this file safe: the database state it
-- describes is the state the database is already in. Applying it changes
-- nothing; not applying it changes nothing. Confirm with a per-table policy
-- count before and after the next deploy — the counts must be identical, and if
-- any table's count moves, this file is wrong and should be reverted.
--
-- ---------------------------------------------------------------------------
-- PART 1 — why the 59 April / quick-410 policies are NOT restored
-- ---------------------------------------------------------------------------
--
-- They were created by:
--   20260404100013_carrier_rls_policies        (48)
--   20260527000001_quick410_advisor_rls_fix    (11)
--
-- All 59 are JWT-based. The April migration's own header states the claim
-- structure it depends on:
--
--   org_id : (auth.jwt() ->> 'org_id')::uuid
--   role   : auth.jwt() ->> 'role'
--   user   : auth.uid()
--
-- auth.jwt() and auth.uid() read request.jwt.claims, a session variable that
-- PostgREST sets when a request arrives through the Supabase API. A Prisma
-- connection is a plain Postgres connection carrying no JWT, so auth.jwt()
-- returns null there and each of these policies denies every row on every
-- Prisma query.
--
-- Verified (phase-0-revised.md §3.1): nothing in the product reads carrier
-- tables through the Supabase client. In apps/web/src only three files match
-- supabase.from( / createServerClient / createBrowserClient, all under
-- lib/supabase/ and all client construction; every other .from( hit is
-- Array.from, Buffer.from or supabase.storage.from(BUCKET). In apps/mobile,
-- 1,038 .ts/.tsx files contain zero references to any of the thirteen carrier
-- table names.
--
-- So these policies were structurally inert on the only connection the
-- application uses, before they were removed. That is why three months passed
-- with no behavioural change to notice.
--
-- They are superseded by 20260515000001_db_security_standardization, which
-- covers the ten carrier tables carrying org_id with the GUC-based
-- tenant_isolation_policy + bypass_rls_policy pair. That is the only shape
-- that evaluates on the Prisma path.
--
-- RESTORING THEM WOULD BE AN OUTAGE, NOT A FIX: JWT policies on the Prisma
-- path return zero rows across the entire carrier surface.
--
-- What is genuinely lost is role-within-tenant authorization and driver
-- self-scoping, which the April set expressed and the May set does not. Those
-- are rebuilt on GUCs as new work in Prompt 1, not restored here. Until then
-- they are enforced only by application WHERE clauses (§3.1 corollary).
--
-- NOT ADDRESSED HERE, deliberately: stops, route_template_stops and
-- carrier_documents carry no org_id, were out of the May migration's scope,
-- and therefore run FORCE RLS with zero policies. That is Prompt 1's work and
-- is untouched by this file.
--
-- ---------------------------------------------------------------------------
-- PART 2 — the 8 out-of-band Document Import policies
-- ---------------------------------------------------------------------------
--
-- Applied during Document Import Phase 1 through Supabase MCP and never
-- mirrored into a migration — the DEC-17 failure mode, where the SQL runs but
-- no repository artefact records it. Definitions below were read from
-- pg_policies on 2026-09-09 and are reproduced verbatim, so the DROP/CREATE
-- pair is a no-op that transfers ownership of the definition to this repo.
--
-- NOTE ON bypass_rls_policy: four of the eight are bypass_rls_policy rows.
-- Mirroring them is not a change to them. Prompt 1 owns dropping
-- bypass_rls_policy fleet-wide; when it does, it will drop these four with
-- the rest. Recording them here first is what makes that drop a visible,
-- reviewable diff instead of another out-of-band edit.
--
-- ---------------------------------------------------------------------------
-- PART 3 — durable DROP POLICY audit
-- ---------------------------------------------------------------------------
--
-- The forensics could not determine what removed the 59 policies, because the
-- Postgres log retains roughly 24 hours and the removal was months earlier.
-- An event trigger writing to a table is the only option that survives log
-- rotation.
--
-- PRIVILEGE CEILING, STATED RATHER THAN DISCOVERED LATER: CREATE EVENT TRIGGER
-- requires superuser, and there is no grantable privilege for it. On this
-- instance the migration runner connects as postgres, which has
-- rolsuper = false; all six pre-existing event triggers are owned by
-- supabase_admin. The DO block below therefore attempts the trigger and, if
-- the privilege is absent, raises a WARNING and continues rather than failing
-- the migration. The table and function are created either way, so activating
-- the trigger later is a single statement run by a superuser.
--
-- Whether the trigger is actually active is recorded by
-- scripts/audit/check-policy-drop-audit.ts, so this cannot report success
-- without checking.
-- ============================================================================


-- ============================================================================
-- PART 1 — record the removal of the 59 inert JWT policies (all already absent)
-- ============================================================================

-- carrier_documents (4)
DROP POLICY IF EXISTS "carrier_documents_insert" ON public.carrier_documents;
DROP POLICY IF EXISTS "carrier_documents_org_delete" ON public.carrier_documents;
DROP POLICY IF EXISTS "carrier_documents_org_update" ON public.carrier_documents;
DROP POLICY IF EXISTS "carrier_documents_select" ON public.carrier_documents;

-- carrier_drivers (5)
DROP POLICY IF EXISTS "carrier_drivers_driver_self_select" ON public.carrier_drivers;
DROP POLICY IF EXISTS "carrier_drivers_org_delete" ON public.carrier_drivers;
DROP POLICY IF EXISTS "carrier_drivers_org_insert" ON public.carrier_drivers;
DROP POLICY IF EXISTS "carrier_drivers_org_select" ON public.carrier_drivers;
DROP POLICY IF EXISTS "carrier_drivers_org_update" ON public.carrier_drivers;

-- carrier_expenses (6)
DROP POLICY IF EXISTS "carrier_expenses_driver_insert" ON public.carrier_expenses;
DROP POLICY IF EXISTS "carrier_expenses_driver_select" ON public.carrier_expenses;
DROP POLICY IF EXISTS "carrier_expenses_org_delete" ON public.carrier_expenses;
DROP POLICY IF EXISTS "carrier_expenses_org_insert" ON public.carrier_expenses;
DROP POLICY IF EXISTS "carrier_expenses_org_select" ON public.carrier_expenses;
DROP POLICY IF EXISTS "carrier_expenses_org_update" ON public.carrier_expenses;

-- carrier_trucks (4)
DROP POLICY IF EXISTS "carrier_trucks_org_delete" ON public.carrier_trucks;
DROP POLICY IF EXISTS "carrier_trucks_org_insert" ON public.carrier_trucks;
DROP POLICY IF EXISTS "carrier_trucks_org_select" ON public.carrier_trucks;
DROP POLICY IF EXISTS "carrier_trucks_org_update" ON public.carrier_trucks;

-- clients (4)
DROP POLICY IF EXISTS "clients_org_select" ON public.clients;
DROP POLICY IF EXISTS "clients_owner_delete" ON public.clients;
DROP POLICY IF EXISTS "clients_owner_insert" ON public.clients;
DROP POLICY IF EXISTS "clients_owner_manager_update" ON public.clients;

-- contracts (4)
DROP POLICY IF EXISTS "contracts_org_select" ON public.contracts;
DROP POLICY IF EXISTS "contracts_owner_delete" ON public.contracts;
DROP POLICY IF EXISTS "contracts_owner_insert" ON public.contracts;
DROP POLICY IF EXISTS "contracts_owner_update" ON public.contracts;

-- dispatches (4)
DROP POLICY IF EXISTS "dispatches_org_delete" ON public.dispatches;
DROP POLICY IF EXISTS "dispatches_org_insert" ON public.dispatches;
DROP POLICY IF EXISTS "dispatches_org_select" ON public.dispatches;
DROP POLICY IF EXISTS "dispatches_org_update" ON public.dispatches;

-- driver_pay_records (5)
DROP POLICY IF EXISTS "driver_pay_records_driver_select" ON public.driver_pay_records;
DROP POLICY IF EXISTS "driver_pay_records_org_delete" ON public.driver_pay_records;
DROP POLICY IF EXISTS "driver_pay_records_org_insert" ON public.driver_pay_records;
DROP POLICY IF EXISTS "driver_pay_records_org_select" ON public.driver_pay_records;
DROP POLICY IF EXISTS "driver_pay_records_org_update" ON public.driver_pay_records;

-- facilities (4)
DROP POLICY IF EXISTS "facilities_org_delete" ON public.facilities;
DROP POLICY IF EXISTS "facilities_org_insert" ON public.facilities;
DROP POLICY IF EXISTS "facilities_org_select" ON public.facilities;
DROP POLICY IF EXISTS "facilities_org_update" ON public.facilities;

-- loads (5)
DROP POLICY IF EXISTS "loads_driver_select" ON public.loads;
DROP POLICY IF EXISTS "loads_org_delete" ON public.loads;
DROP POLICY IF EXISTS "loads_org_insert" ON public.loads;
DROP POLICY IF EXISTS "loads_org_select" ON public.loads;
DROP POLICY IF EXISTS "loads_org_update" ON public.loads;

-- route_template_stops (4)
DROP POLICY IF EXISTS "route_template_stops_org_delete" ON public.route_template_stops;
DROP POLICY IF EXISTS "route_template_stops_org_insert" ON public.route_template_stops;
DROP POLICY IF EXISTS "route_template_stops_org_select" ON public.route_template_stops;
DROP POLICY IF EXISTS "route_template_stops_org_update" ON public.route_template_stops;

-- route_templates (4)
DROP POLICY IF EXISTS "route_templates_org_delete" ON public.route_templates;
DROP POLICY IF EXISTS "route_templates_org_insert" ON public.route_templates;
DROP POLICY IF EXISTS "route_templates_org_select" ON public.route_templates;
DROP POLICY IF EXISTS "route_templates_org_update" ON public.route_templates;

-- stops (6)
DROP POLICY IF EXISTS "stops_driver_select" ON public.stops;
DROP POLICY IF EXISTS "stops_driver_update" ON public.stops;
DROP POLICY IF EXISTS "stops_org_delete" ON public.stops;
DROP POLICY IF EXISTS "stops_org_insert" ON public.stops;
DROP POLICY IF EXISTS "stops_org_select" ON public.stops;
DROP POLICY IF EXISTS "stops_org_update" ON public.stops;


-- ============================================================================
-- PART 2 — adopt the 8 out-of-band policies (all already present, verbatim)
-- ============================================================================

-- document_import_pages
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.document_import_pages;
CREATE POLICY "tenant_isolation_policy" ON public.document_import_pages
  AS PERMISSIVE FOR ALL TO public
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());

DROP POLICY IF EXISTS "bypass_rls_policy" ON public.document_import_pages;
CREATE POLICY "bypass_rls_policy" ON public.document_import_pages
  AS PERMISSIVE FOR ALL TO public
  USING (current_setting('app.bypass_rls'::text, true) = 'on'::text);

-- document_imports
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.document_imports;
CREATE POLICY "tenant_isolation_policy" ON public.document_imports
  AS PERMISSIVE FOR ALL TO public
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());

DROP POLICY IF EXISTS "bypass_rls_policy" ON public.document_imports;
CREATE POLICY "bypass_rls_policy" ON public.document_imports
  AS PERMISSIVE FOR ALL TO public
  USING (current_setting('app.bypass_rls'::text, true) = 'on'::text);

-- document_profiles
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.document_profiles;
CREATE POLICY "tenant_isolation_policy" ON public.document_profiles
  AS PERMISSIVE FOR ALL TO public
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());

DROP POLICY IF EXISTS "bypass_rls_policy" ON public.document_profiles;
CREATE POLICY "bypass_rls_policy" ON public.document_profiles
  AS PERMISSIVE FOR ALL TO public
  USING (current_setting('app.bypass_rls'::text, true) = 'on'::text);

-- facility_external_references
DROP POLICY IF EXISTS "tenant_isolation_policy" ON public.facility_external_references;
CREATE POLICY "tenant_isolation_policy" ON public.facility_external_references
  AS PERMISSIVE FOR ALL TO public
  USING (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id());

DROP POLICY IF EXISTS "bypass_rls_policy" ON public.facility_external_references;
CREATE POLICY "bypass_rls_policy" ON public.facility_external_references
  AS PERMISSIVE FOR ALL TO public
  USING (current_setting('app.bypass_rls'::text, true) = 'on'::text);

-- ============================================================================
-- PART 3 — durable DROP POLICY audit
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.policy_drop_audit (
  id           bigserial PRIMARY KEY,
  dropped_at   timestamptz NOT NULL DEFAULT now(),
  object_type  text        NOT NULL,
  object_name  text,
  schema_name  text,
  statement    text,
  current_role_name text   NOT NULL,
  session_role_name text   NOT NULL,
  application_name  text,
  client_addr       inet
);

COMMENT ON TABLE public.policy_drop_audit IS
  'Durable record of DROP POLICY events. Written by the policy_drop_audit_fn '
  'sql_drop event trigger. Exists because the Postgres log retains ~24h and the '
  '2026 policy loss was discovered months later with no surviving evidence.';

CREATE OR REPLACE FUNCTION public.policy_drop_audit_fn()
RETURNS event_trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $fn$
DECLARE
  obj record;
BEGIN
  FOR obj IN SELECT * FROM pg_event_trigger_dropped_objects()
  LOOP
    IF obj.object_type = 'policy' THEN
      INSERT INTO public.policy_drop_audit (
        object_type, object_name, schema_name, statement,
        current_role_name, session_role_name, application_name, client_addr
      )
      VALUES (
        obj.object_type,
        obj.object_identity,
        obj.schema_name,
        current_query(),
        current_user,
        session_user,
        current_setting('application_name', true),
        inet_client_addr()
      );
    END IF;
  END LOOP;
END;
$fn$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_event_trigger WHERE evtname = 'policy_drop_audit_trigger') THEN
    RAISE NOTICE 'policy_drop_audit_trigger already exists — leaving it in place.';
  ELSE
    BEGIN
      EXECUTE 'CREATE EVENT TRIGGER policy_drop_audit_trigger '
           || 'ON sql_drop EXECUTE FUNCTION public.policy_drop_audit_fn()';
      RAISE NOTICE 'policy_drop_audit_trigger created.';
    EXCEPTION
      WHEN insufficient_privilege OR OTHERS THEN
        RAISE WARNING
          'policy_drop_audit_trigger NOT created (%). CREATE EVENT TRIGGER requires '
          'superuser and this role is not one. The audit table and function exist; '
          'a superuser must run: CREATE EVENT TRIGGER policy_drop_audit_trigger ON '
          'sql_drop EXECUTE FUNCTION public.policy_drop_audit_fn(); '
          'Until then DROP POLICY is NOT recorded. See docs/audits/'
          'policy-drift-gate.md.', SQLERRM;
    END;
  END IF;
END
$do$;
