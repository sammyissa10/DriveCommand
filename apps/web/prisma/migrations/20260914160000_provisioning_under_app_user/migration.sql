-- quick-601 (B3 / docs/audits/bypass-replacement-design.md §4.1)
-- Make tenant provisioning work under `app_user`.
--
-- WHAT THIS SHIPS
--   1. `tenant_bootstrap_insert` ON "Tenant" — the SAME policy name, a new body.
--        WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL)
--      becomes
--        WITH CHECK (id = current_tenant_id())
--   2. Three SECURITY DEFINER functions for the three genuinely GLOBAL reads on the
--      provisioning path, each returning ONE scalar, EXECUTE revoked from PUBLIC and
--      granted to `app_user` alone.
--
-- WHAT THIS DELIBERATELY DOES NOT SHIP
--   - No change to `Tenant.id`'s column default. `gen_random_uuid()` stays. The
--     application supplies an explicit id at ONE call site; Prisma accepts that
--     alongside a dbgenerated default, so there is no DDL on the column.
--   - No change to `seed_tenant_notification_settings()`. It stays SECURITY INVOKER.
--   - No revoke of `app_admin`'s SELECT on "TenantNotificationSettings" — see §4.
--   - No change to `tenant_self_read` or `tenant_self_update`.
--
-- ============================================================================
-- §1. WHY THE POLICY BODY HAD TO CHANGE — two measured failures, not one
-- ============================================================================
--
-- `docs/audits/trigger-grant-sweep.md` §4 derived ONE failure. Executed as
-- `app_user` on staging, with active "NotificationTemplate" rows present so the
-- AFTER INSERT trigger actually writes, there are TWO — and the derived one fires
-- SECOND:
--
--   INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES (…)
--     -> 42501 new row violates row-level security policy
--                for table "TenantNotificationSettings"
--
--   INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES (…) RETURNING id
--     -> 42501 new row violates row-level security policy for table "Tenant"
--
-- The two probes differ in NOTHING but the RETURNING clause and fail on different
-- tables. A RETURNING clause makes PostgreSQL apply the table's SELECT policies as
-- an insert-time check on the new row, and that check runs BEFORE the AFTER trigger
-- fires. "Tenant"'s SELECT policy is `tenant_self_read`, USING (id =
-- current_tenant_id()) — NULL exactly when `tenant_bootstrap_insert` demanded the
-- GUC be unset.
--
-- Prisma's `tx.tenant.create()` ALWAYS emits RETURNING. So sign-up dies one
-- statement earlier than the sweep says, on a different table.
--
-- THIS IS WHY THE TRIGGER WAS NOT MADE `SECURITY DEFINER`. That option was on the
-- table and is genuinely narrower — but it closes the first failure and leaves the
-- second untouched, so it does not make sign-up work.
--
-- ============================================================================
-- §2. WHAT THE NEW POLICY PERMITS, AND WHAT IT STOPS PERMITTING
-- ============================================================================
--
--   caller state                                              | before | after
--   ----------------------------------------------------------|--------|-------
--   no tenant GUC, inserting ANY "Tenant" row                  |  YES   |  no
--   GUC = a uuid that is not yet a tenant, row id = that uuid  |  no    |  YES
--   GUC = a uuid that is not yet a tenant, row id = anything   |  no    |  no
--     else                                                     |        |
--   GUC = an EXISTING tenant id, row id = that id              |  no    |  Tenant_pkey
--                                                              |        |  (23505)
--   GUC = an EXISTING tenant id, row id = anything else        |  no    |  no
--
-- This is a NARROWING. Today any connection that simply declines to set the GUC may
-- insert an arbitrary tenant. After this change a caller must NAME the id it is
-- about to create, in the GUC, before it creates it. The only thing admitted after
-- that was refused before is the exact self-naming case the sign-up transaction
-- performs.
--
-- What it costs, stated rather than discovered: a bare-client "Tenant" INSERT with
-- no GUC is no longer possible under `app_user`. The only such site is
-- `lib/db/repositories/tenant.repository.ts`'s `provisionTenant`, which has zero
-- callers and is updated in the same commit. The sysadmin create path
-- ((admin)/actions/tenants.ts) runs on `app_admin`, which has BYPASSRLS and never
-- consults this policy in either direction.
--
-- THE NAME IS DELIBERATELY UNCHANGED. `rls-policy-canonical.json` and the
-- replay-based drift detector both find this policy BY NAME; renaming it would make
-- it vanish from those enumerations rather than show up as changed (quick-599's
-- rule about a name-keyed enumeration).
--
-- ============================================================================
-- §3. WHY `SECURITY DEFINER` FUNCTIONS AND NOT `getAdminDb`
-- ============================================================================
--
-- Three reads on this path are genuinely global and cannot be tenant-scoped,
-- because the uniqueness they guard is global:
--
--   "User".email                 — User_email_tenantId_key is (email, "tenantId"),
--                                  NOT globally unique, so this Prisma-side probe is
--                                  the only global email guard below auth.users
--   "Tenant".slug                — Tenant_slug_key IS global
--   carrier_trucks.vehicle_id    — carrier_trucks_vehicle_id_key IS global
--
-- `bypass-replacement-design.md` §4.1 item 4 names both remedies: hoist them onto
-- the admin connection, or a SECURITY DEFINER function granted to `app_user`. This
-- migration takes the second, because the first puts a BYPASSRLS Prisma client on
-- the unauthenticated sign-up surface — the highest-traffic pre-auth path in the
-- product — where a function returning one boolean leaks strictly less.
--
-- EVERY ONE REVOKES EXECUTE FROM PUBLIC **AND FROM THREE NAMED ROLES**, AND THE
-- SECOND HALF IS THE HALF THAT MATTERS. PostgreSQL grants EXECUTE to PUBLIC by
-- default, and Supabase's PostgREST exposes public-schema functions to `anon` and
-- `authenticated` over /rpc/. Left at the default, `provisioning_email_taken` is an
-- UNAUTHENTICATED EMAIL-ENUMERATION ORACLE reachable from the internet.
--
-- `REVOKE ... FROM PUBLIC` ALONE DOES NOT CLOSE IT, and that was MEASURED rather
-- than reasoned. After the first apply of this migration — which carried the PUBLIC
-- revoke and nothing else — has_function_privilege('anon', ..., 'EXECUTE') still
-- returned TRUE. Both databases carry, from TWO separate grantors (`postgres` and
-- `supabase_admin`, read from pg_default_acl):
--
--   ALTER DEFAULT PRIVILEGES IN SCHEMA public
--     GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role
--
-- Those are EXPLICIT per-role ACL entries stamped onto the function at CREATE time.
-- They are a different entry from PUBLIC's and revoking PUBLIC does not touch them.
-- Check a new SECURITY DEFINER function with has_function_privilege() PER ROLE;
-- reading the REVOKE statement proves nothing.
--
-- The owner must carry `rolbypassrls`, or a SECURITY DEFINER function still cannot
-- read a FORCE-RLS table. `migrate.mjs` applies as `postgres`, which does. That is
-- not left as a comment — §5 asserts it and raises if it is ever false.
--
-- ============================================================================
-- §4. `app_admin`'s SELECT ON "TenantNotificationSettings" IS REQUIRED — MEASURED
-- ============================================================================
--
-- `trigger-grant-sweep.md` §3.1 reported it as a PROBABLE over-grant, on the
-- reasoning that PostgreSQL attaches the SELECT requirement to ON CONFLICT DO
-- UPDATE and says nothing for DO NOTHING, and that quick-600's observed 42501 was
-- fully explained by the missing INSERT alone.
--
-- Measured on staging, which is what §8 item 2 of that sweep asked for. With two
-- active templates present so the trigger genuinely writes:
--
--   grants = INSERT,SELECT  -> INSERT INTO "Tenant" … RETURNING id  -> OK, 2 seeded
--   grants = INSERT         -> INSERT INTO "Tenant" … RETURNING id
--                                -> 42501 permission denied for table
--                                   "TenantNotificationSettings"
--
-- The hypothesis is WRONG and the grant stays. `ON CONFLICT (cols) DO NOTHING`
-- carries an arbiter-index inference over the target's columns, and that needs
-- SELECT independently of INSERT. The grant was restored immediately after the
-- probe and this migration does not touch it.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- §5. Preconditions
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = current_user AND rolbypassrls) THEN
    RAISE EXCEPTION
      'quick-601: this migration must be applied by a role with rolbypassrls (got %). '
      'The three SECURITY DEFINER functions below run as their owner and read '
      'FORCE-RLS tables; an owner without rolbypassrls makes them silently return '
      'zero rows, which is worse than failing.', current_user;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- §6. The policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_bootstrap_insert ON "Tenant";
CREATE POLICY tenant_bootstrap_insert ON "Tenant"
  FOR INSERT
  WITH CHECK (id = current_tenant_id());

-- ---------------------------------------------------------------------------
-- §7. provisioning_email_taken — the global email probe
--
-- Replaces `tx.user.findFirst({ where: { email } })` at
-- lib/onboarding/provision-tenant.ts. Returns a boolean and never a row, so a
-- caller learns "taken" and nothing else — no tenant, no name, no id.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provisioning_email_taken(p_email text)
  RETURNS boolean
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM "User" WHERE email = lower(btrim(p_email))
  );
$$;

REVOKE ALL ON FUNCTION public.provisioning_email_taken(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provisioning_email_taken(text) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisioning_email_taken(text) TO app_user;

-- ---------------------------------------------------------------------------
-- §8. provisioning_next_slug — the global slug loop
--
-- Replaces the `while (await tx.tenant.findFirst({ where: { slug } }))` loop. The
-- loop moves INSIDE the function because that is the only place it can see every
-- tenant; the caller gets back one string.
--
-- The 1000-iteration cap is a real bound, not decoration: without it a corrupted
-- p_base (empty string, say) plus a dense slug space is an unbounded loop holding
-- a connection on the sign-up path. Raising instead of returning a colliding slug
-- keeps the failure loud — Tenant_slug_key would refuse it one statement later
-- anyway, with a worse message.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.provisioning_next_slug(p_base text)
  RETURNS text
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
DECLARE
  v_base   text := NULLIF(btrim(p_base), '');
  v_slug   text;
  v_suffix integer := 2;
BEGIN
  IF v_base IS NULL THEN
    RAISE EXCEPTION 'provisioning_next_slug: base slug must not be empty';
  END IF;

  v_slug := v_base;
  WHILE EXISTS (SELECT 1 FROM "Tenant" WHERE slug = v_slug) LOOP
    IF v_suffix > 1000 THEN
      RAISE EXCEPTION 'provisioning_next_slug: no free slug for base % after 1000 attempts', v_base;
    END IF;
    v_slug   := v_base || '-' || v_suffix;
    v_suffix := v_suffix + 1;
  END LOOP;

  RETURN v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.provisioning_next_slug(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.provisioning_next_slug(text) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.provisioning_next_slug(text) TO app_user;

-- ---------------------------------------------------------------------------
-- §9. carrier_max_vehicle_id — the global vehicle-id read
--
-- Replaces `prisma.$queryRawUnsafe` in lib/carrier/fleet-trucks.ts
-- (generateVehicleIds), which is a global read on carrier_trucks with NO tenant
-- predicate, NO bypass flag and NO @bypass_rls marker — so it is outside the
-- 211-site grep the bypass migration is scoped to, and it breaks SILENTLY:
-- carrier_trucks_vehicle_id_key is a GLOBALLY unique index, so under a
-- non-bypassing role the max is invisible, every tenant is handed
-- VH-<year>-00001, and the second sign-up of the year dies on 23505.
--
-- The body mirrors the existing query BYTE FOR BYTE (ORDER BY vehicle_id DESC
-- LIMIT 1, parsed by the caller) rather than being rewritten as MAX(...), so this
-- is a privilege change and NOT a behaviour change. The zero-padded 5-digit suffix
-- makes lexicographic and numeric order agree below 100000; changing that ordering
-- here would be a second, unrelated decision.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.carrier_max_vehicle_id(p_prefix text)
  RETURNS text
  LANGUAGE sql
  STABLE
  SECURITY DEFINER
  SET search_path = public, pg_catalog
AS $$
  SELECT vehicle_id
  FROM carrier_trucks
  WHERE vehicle_id LIKE p_prefix || '%'
  ORDER BY vehicle_id DESC
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.carrier_max_vehicle_id(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.carrier_max_vehicle_id(text) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.carrier_max_vehicle_id(text) TO app_user;

-- ---------------------------------------------------------------------------
-- §10. Rollback, for the record — NOT executed here
--
-- DROP FUNCTION IF EXISTS public.carrier_max_vehicle_id(text);
-- DROP FUNCTION IF EXISTS public.provisioning_next_slug(text);
-- DROP FUNCTION IF EXISTS public.provisioning_email_taken(text);
-- DROP POLICY IF EXISTS tenant_bootstrap_insert ON "Tenant";
-- CREATE POLICY tenant_bootstrap_insert ON "Tenant" FOR INSERT
--   WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL);
--
-- Reverting the policy WITHOUT reverting the application code leaves sign-up
-- broken in the other direction: provision-tenant.ts sets the GUC before the
-- insert, which the old body forbids. The two revert together or not at all.
-- ---------------------------------------------------------------------------
