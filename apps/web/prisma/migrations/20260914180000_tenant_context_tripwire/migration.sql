-- quick-602 — the unmigrated-path TRIPWIRE
-- (docs/audits/wrapper-migration-scope.md §5, built; measurements in
--  .planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/)
--
-- WHAT THIS SHIPS
--   1. `public.tenant_context_required(text)` — a plpgsql helper that RAISES with
--      SQLSTATE `TC001`, naming the offending statement via `current_query()`.
--      EXECUTE revoked from PUBLIC and from anon/authenticated/service_role,
--      granted to `app_user` alone.
--   2. `public.current_tenant_id()` — the SAME name, signature, return type and
--      `SECURITY INVOKER`/`STABLE`/`LANGUAGE sql`, with a flag-gated branch that
--      reaches the raiser ONLY when there is no tenant context.
--   3. `tenant_isolation_policy` on "Tag" and on "TagAssignment" — the SAME policy
--      names, routed through `current_tenant_id()` instead of reading the GUC
--      inline. They are the last two inline policies; after this, 93 of 183
--      policies carry the signal and 0 read the GUC directly.
--
-- WHAT THIS DELIBERATELY DOES NOT SHIP
--   - NO `ALTER ROLE ... SET app.tenant_context_tripwire`. The flag is set NOWHERE
--     by this migration — see §4. That is what makes the file a behavioural no-op
--     the day it reaches production.
--   - No rename of any policy. `rls-policy-canonical.json` and the replay drift
--     detector find policies BY NAME, so a rename makes a policy vanish from the
--     enumeration rather than show up as changed (quick-599's rule).
--   - No `WITH CHECK` declared on either rewritten policy. Both are `FOR ALL` with
--     the check DERIVED from `USING` today; declaring one would be a second change
--     smuggled in beside the one being measured.
--   - No call site migrated. `withTenantContext` does not exist yet, and nothing in
--     `apps/web/src` changes in this migration's commit.
--
-- ============================================================================
-- §1. WHY — the silence is the whole problem
-- ============================================================================
--
-- Today an unmigrated path fails SILENTLY: the GUC is unset, `current_tenant_id()`
-- returns NULL, `"tenantId" = NULL` is unknown, the row is filtered, and the caller
-- receives an empty result with no error. That silence is the only reason the
-- `withTenantContext` cutover has to be all-or-nothing — you cannot ship half a
-- migration when the other half degrades invisibly.
--
-- This migration converts that silence into a loud, attributable, FLAG-GATED
-- database error. One function, below every call site, so it cannot be forgotten
-- at one.
--
-- ============================================================================
-- §2. WHY THE RAISE LIVES IN A SEPARATE plpgsql HELPER
-- ============================================================================
--
-- 91 policies call `current_tenant_id()`, many of them per row. Keeping it
-- `LANGUAGE sql STABLE` keeps it INLINABLE; a plpgsql body would not be. The raise
-- therefore lives in a separate plpgsql function reached only through the null
-- branch of a COALESCE.
--
-- That the fast path does NOT raise was MEASURED, not reasoned about
-- (evidence/02-mechanism.md §1, DECISION D1): as `app_user` on staging, with the
-- flag ON and a real uuid in the GUC, the function returned the uuid and a policy
-- scan calling it returned its row. `EXPLAIN (VERBOSE)` shows the whole expression
-- inlined into the scan filter with the raiser present and unreached:
--
--   Filter: ((t."tenantId" = COALESCE((NULLIF(current_setting('app.current_tenant_id'::text, true), ''::text))::uuid,
--            CASE WHEN (COALESCE(current_setting('app.tenant_context_tripwire'::text, true), 'off'::text) = 'on'::text)
--                 THEN tenant_context_required(current_setting('app.current_tenant_id'::text, true))
--                 ELSE NULL::uuid END)))
--
-- The `NULLIF` collapses BOTH the unset case and the Supavisor `''` case before the
-- check. `lib/db/prisma.ts`'s `pool.on('connect')` writes `''` on every fresh
-- physical connection, and without the NULLIF the `::uuid` cast would raise `22P02`
-- on it — a different, wrong error (the quick-597 finding, honoured here).
--
-- ============================================================================
-- §3. WHY BYPASS-FLAGGED STATEMENTS ARE EXEMPTED — a measured decision with a cost
-- ============================================================================
--
-- 86 tables carry a permissive `bypass_rls_policy` OR'd with a tenant policy.
-- PostgreSQL does not guarantee the evaluation order of an OR, so whether the
-- tenant arm still runs on a bypass-flagged statement was an OPEN QUESTION. It was
-- measured before this file was written (evidence/02-mechanism.md §2): on two probe
-- tables carrying the two policies in BOTH creation orders, with
-- `app.bypass_rls = 'on'` and no tenant context, SELECT, UPDATE and DELETE ALL
-- raised `TC001` — six probes, six raises. A permissive bypass policy does NOT
-- suppress the raise.
--
-- DECISION (evidence/02-mechanism.md, DECISIONS D2): bypass-flagged statements are
-- EXEMPTED — `tenant_context_required()` returns NULL instead of raising when
-- `current_setting('app.bypass_rls', TRUE) = 'on'`.
--
--   WHY: a bypass-flagged statement is ADMITTED by the bypass arm. It does not
--   produce the silent empty this tripwire exists to convert into an error. Firing
--   on it would turn ~211 working call sites into hard failures at once, drowning
--   the signal on the paths that DO fail silently.
--
--   COST, recorded rather than buried: ~211 bypass call sites are NOT signalled by
--   this tripwire. They remain owned and enumerated by the Phase 0 bypass programme
--   (docs/audits/bypass-call-classification.md, bypass-replacement-design.md).
--
-- ============================================================================
-- §4. THE FLAG IS A GUC READ AT CALL TIME, AND THIS MIGRATION SETS IT NOWHERE
-- ============================================================================
--
-- A settings-table read inside `current_tenant_id()` would put a QUERY inside every
-- policy evaluation on 93 policies; that query would itself be subject to RLS (a
-- recursion hazard) and would need its own grant. A GUC costs nothing.
--
--   ALTER ROLE app_user SET app.tenant_context_tripwire = 'on';   -- the lever
--   ALTER ROLE app_user RESET app.tenant_context_tripwire;        -- and its undo
--
-- flips it for every new connection in one statement, with no migration and no
-- deploy. `pg_db_role_setting` already proves role-level custom GUCs work on this
-- Supabase instance. A session-level `SET` is the per-connection escape hatch.
--
-- CONSEQUENCE, STATED PLAINLY: this migration file is committed, so
-- `scripts/migrate.mjs` will apply it to PRODUCTION on the next `vercel --prod`.
-- That is intended and it is safe, because THE FLAG IS SET NOWHERE. With the flag
-- off — unset or `'off'`, both measured — `current_tenant_id()` returns NULL
-- exactly as today, so the 91 existing policies behave identically.
--
-- The only production-visible behaviour change is the "Tag"/"TagAssignment"
-- predicate, whose full before/after matrix is in evidence/03-tag-equivalence.md.
-- Ten of its twelve GUC cases are identical in SELECT, INSERT-own and
-- INSERT-foreign. The two that are not:
--
--   * a NON-CANONICAL (uppercase) uuid in the GUC now ADMITS where text comparison
--     filtered — a widening, arguably a fix, and no application path writes one;
--   * NON-UUID garbage in the GUC now raises `22P02` instead of filtering — the
--     same class quick-597 removed from `audit_log`, and it puts these two policies
--     on the footing the other 91 have had all along.
--
-- ============================================================================
-- §5. TC001, AND HOW IT MUST BE DETECTED
-- ============================================================================
--
-- `TC` is not one of PostgreSQL's own SQLSTATE classes. Measured: the server
-- accepted the ERRCODE and returned it verbatim to the client as `code`
-- (evidence/02-mechanism.md §3). Detect it by CODE, never by message prose.
--
-- `current_query()` in DETAIL is how "name the statement" is satisfied: a policy
-- expression has no `TG_TABLE_NAME`, so the statement text is the only handle the
-- database has.
--
-- The MESSAGE distinguishes an UNSET GUC from an EMPTY one because they have
-- different causes. MEASURED CAVEAT (evidence/02-mechanism.md §4): through Supavisor
-- session mode — which is how staging AND production connect — a warm backend keeps
-- the placeholder defined, so `current_setting('app.current_tenant_id', TRUE)` reads
-- `''` and never NULL. The UNSET branch is correct code that a pooled connection
-- will essentially never reach. In practice every TC001 will say "the EMPTY STRING".

-- ---------------------------------------------------------------------------
-- §6. The raiser
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tenant_context_required(p_raw text)
  RETURNS uuid
  LANGUAGE plpgsql
  STABLE
  SECURITY INVOKER
  SET search_path = public, pg_catalog
AS $$
BEGIN
  -- §3: a bypass-flagged statement is admitted by the bypass arm and is not what
  -- this tripwire exists to catch. Returning NULL here reproduces today's
  -- behaviour exactly for those statements.
  IF COALESCE(current_setting('app.bypass_rls', TRUE), '') = 'on' THEN
    RETURN NULL::uuid;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = 'TC001',
    MESSAGE = 'tenant context is required: app.current_tenant_id is '
              || CASE WHEN p_raw IS NULL THEN 'UNSET' ELSE 'the EMPTY STRING' END,
    DETAIL  = 'statement: ' || current_query(),
    HINT    = 'This statement ran with no tenant context. Acquire one (getTenantPrisma / '
              || 'getTenantPrismaForOrg / withTenantContext) before querying, or SET '
              || 'app.tenant_context_tripwire = ''off'' on this connection.';
END;
$$;

-- §3.4 of docs/audits/policy-satisfiability-sweep.md is about schema USAGE at NAME
-- RESOLUTION, which does not apply to a stored policy node tree — but EXECUTE IS
-- checked at runtime, so `app_user` needs it explicitly. The two REVOKEs are both
-- required: quick-601 measured `ALTER DEFAULT PRIVILEGES ... GRANT EXECUTE ON
-- FUNCTIONS TO anon, authenticated, service_role` from two grantors on both
-- databases, which a PUBLIC revoke does not touch, and Supabase's PostgREST exposes
-- `public` functions to `anon` over /rpc/.
REVOKE ALL ON FUNCTION public.tenant_context_required(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tenant_context_required(text) FROM anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.tenant_context_required(text) TO app_user;

-- ---------------------------------------------------------------------------
-- §7. current_tenant_id() — same name, same signature, same volatility, same
--     security. Before:
--
--       SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
--
--     After: the identical fast path, plus a flag-gated branch that can only be
--     reached when the fast path yielded NULL.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.current_tenant_id()
  RETURNS uuid
  LANGUAGE sql
  STABLE
  SECURITY INVOKER
AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid,
    CASE WHEN COALESCE(current_setting('app.tenant_context_tripwire', TRUE), 'off') = 'on'
         THEN public.tenant_context_required(current_setting('app.current_tenant_id', TRUE))
         ELSE NULL::uuid END
  );
$$;

-- `CREATE OR REPLACE FUNCTION` preserves an existing ACL, but the pre-existing ACL
-- is read back and re-asserted rather than assumed — the reading before and after is
-- recorded in evidence/04-ledger-readback.txt.
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO app_user;

-- ---------------------------------------------------------------------------
-- §8. The last two inline policies. SAME NAMES, deliberately.
--
--   before: USING (("tenantId")::text = current_setting('app.current_tenant_id'::text, true))
--   after:  USING ("tenantId" = current_tenant_id())
--
-- Both stay FOR ALL, PERMISSIVE, TO PUBLIC, with WITH CHECK UNDECLARED so it keeps
-- being derived from USING. The full equivalence matrix is in
-- evidence/03-tag-equivalence.md and is summarised in §4 above.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS tenant_isolation_policy ON "Tag";
CREATE POLICY tenant_isolation_policy ON "Tag"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ("tenantId" = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON "TagAssignment";
CREATE POLICY tenant_isolation_policy ON "TagAssignment"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ("tenantId" = current_tenant_id());

-- ---------------------------------------------------------------------------
-- §9. Rollback, for the record — NOT executed here
--
-- CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid
--   LANGUAGE sql STABLE AS $$
--   SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;
-- $$;
--
-- DROP FUNCTION IF EXISTS public.tenant_context_required(text);
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON "Tag";
-- CREATE POLICY tenant_isolation_policy ON "Tag" AS PERMISSIVE FOR ALL TO public
--   USING (("tenantId")::text = current_setting('app.current_tenant_id'::text, true));
--
-- DROP POLICY IF EXISTS tenant_isolation_policy ON "TagAssignment";
-- CREATE POLICY tenant_isolation_policy ON "TagAssignment" AS PERMISSIVE FOR ALL TO public
--   USING (("tenantId")::text = current_setting('app.current_tenant_id'::text, true));
--
-- Dropping `tenant_context_required` WITHOUT first restoring `current_tenant_id()`
-- breaks all 93 policies: the function would reference a name that no longer
-- exists. Restore the function body first, then drop the helper.
-- ---------------------------------------------------------------------------
