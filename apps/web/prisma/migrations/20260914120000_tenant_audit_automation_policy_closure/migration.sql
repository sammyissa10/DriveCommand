-- ============================================================================
-- quick-599 — close the three dark-command RLS policy gaps: "Tenant",
-- audit_log, "AutomationRule"
-- ============================================================================
--
-- FIVE STATEMENTS, in this order:
--
--   1. `tenant_bootstrap_insert` ON "Tenant" — new INSERT policy. Only a
--      connection carrying NO tenant GUC may create a tenant.
--   2. `tenant_self_update` ON "Tenant" — new UPDATE policy, the exact twin
--      of the existing `tenant_self_read`.
--   3. `tenant_isolation_policy` ON audit_log, narrowed to `FOR SELECT`.
--   4. `audit_log_append_policy` ON audit_log — new `FOR INSERT WITH CHECK
--      (true)` policy.
--   5. `tenant_isolation_policy` ON "AutomationRule" — replaced, adding an
--      explicit `WITH CHECK ("tenantId" = current_tenant_id())` so INSERT and
--      UPDATE can no longer ride the `scope = 'SYSTEM'` branch of `USING`.
--
-- Plus one REVOKE (statement 5b, in its own guarded `DO` block): `REVOKE
-- UPDATE, DELETE ON audit_log FROM app_user`.
--
-- ---------------------------------------------------------------------------
-- THIS MIGRATION CHANGES NOTHING AT RUNTIME TODAY.
-- ---------------------------------------------------------------------------
-- The application connects as `postgres`, which has `rolbypassrls = true`.
-- Every policy below is DECORATIVE until `DATABASE_URL` moves to `app_user`.
-- A GREEN DEPLOY OF THIS FILE IS NOT EVIDENCE THAT ANY OF IT WORKS.
--
-- The evidence is an `app_user` connection against seeded rows on staging
-- (`wyixpgunnjmzguhggocz`), captured before and after this file was applied:
--   .planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/
--     before.json / before.md / after.json / after.md / diff.md
--   docs/audits/tenant-audit-automation-policy-closure.md
--
-- Nor is `npm run audit:rls-policy-drift` evidence on its own for the NAME
-- layer — it diffs `(table, policy_name)` identity, which cannot validate a
-- rewrite. This task also regenerates `scripts/audit/rls-policy-canonical.json`
-- so the drift gate's BODY layer (quick-598) covers these five bodies too.
--
-- ---------------------------------------------------------------------------
-- PER-STATEMENT DETAIL — prior definition verbatim from
-- evidence/before.json (staging, 2026-09-14), and why.
-- ---------------------------------------------------------------------------
--
-- 1/2. "Tenant" — PRIOR STATE: only `bypass_rls_policy` (ALL) and
--   `tenant_self_read` (SELECT, `USING (id = current_tenant_id())`). NO
--   INSERT, UPDATE or DELETE policy of any kind, while `app_user` already
--   holds SELECT/INSERT/UPDATE/DELETE grants — so at the `app_user` cutover
--   every write is refused by absence of a policy, not by a policy that says
--   no. `tenant_bootstrap_insert`'s `WITH CHECK` is satisfied only when
--   `app.current_tenant_id` is unset or empty — self-enforcing, because every
--   `withTenantContext` unit of work sets the GUC and is therefore denied;
--   only a bootstrap transaction (which by definition has not set it) is
--   admitted. `tenant_self_update` is the literal UPDATE twin of
--   `tenant_self_read`. Measured, both directions, on staging as `app_user`:
--   `Tenant.insert@guc-empty` 42501 (no policy) -> accepted;
--   `Tenant.insert@guc-A` 42501 -> 42501 (still refused, correctly, once a
--   tenant is in context); `Tenant.update-own@guc-A` 0 rows (silent — D3) ->
--   1 row, the exact `saveOperationsSettings` proof; `Tenant.update-cross@guc-A`
--   0 -> 0 (unaffected — tenant B's row was never visible to tenant A's UPDATE
--   and still is not); `Tenant.delete-own@guc-A` 0 -> 0 in BOTH phases,
--   because NO DELETE POLICY IS ADDED, deliberately (see below).
--
-- 3/4. audit_log — PRIOR STATE: single `FOR ALL` `tenant_isolation_policy`,
--   `USING (tenant_id = current_tenant_id())`, `with_check` NULL (i.e.
--   PostgreSQL DERIVES the INSERT/UPDATE check from `USING`). Measured on
--   staging as `app_user` BEFORE this migration:
--   `audit_log.insert-cross@guc-A` -> 42501 (writeAuditLog's documented
--   contract — writing a row for a tenant OTHER than the connection's own —
--   is refused); `audit_log.update-own@guc-A` -> **1 row** and
--   `audit_log.delete-own@guc-A` -> **1 row**, i.e. BOTH succeeded. That pair
--   is the direct, measured disproof of the claim in
--   `bypass-replacement-design.md` §3.1 item 4 and
--   `src/lib/security/audit-log.ts:5` that "audit_log already carries REVOKE
--   UPDATE, DELETE" — it did not; `app_user` held both grants. The split
--   keeps the SELECT half under the EXISTING name `tenant_isolation_policy`
--   (D1 — see below) and adds a new `audit_log_append_policy` for
--   `FOR INSERT WITH CHECK (true)`, admitting the cross-tenant write the
--   writer's own contract requires while the SELECT half stays tenant-scoped.
--   Statement 5b's REVOKE is what turns the now-absent UPDATE/DELETE policy
--   into a loud 42501 rather than a silent 0-row no-op — see "WHY THE REVOKE
--   IS HERE" below.
--
-- 5. "AutomationRule" — PRIOR STATE: single `FOR ALL` `tenant_isolation_policy`,
--   `USING ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" =
--   current_tenant_id()))`, `with_check` NULL — so PostgreSQL derives the
--   INSERT/UPDATE check from `USING`, and the `scope = 'SYSTEM'` branch
--   references no GUC and no tenant. Any tenant-scoped connection could
--   therefore UPDATE or INSERT a platform-wide `SYSTEM` rule. The new
--   `WITH CHECK ("tenantId" = current_tenant_id())` does NOT carry the
--   `SYSTEM` branch, so a write naming (or already sitting on) a
--   `tenantId IS NULL` row can never satisfy the new row's check. `USING` is
--   UNCHANGED — the SELECT visibility sweep §6 calls "defensible and
--   intended" (a tenant seeing the platform's SYSTEM rules) is preserved
--   exactly. Measured: `AutomationRule.select-system@guc-A` 6 -> 6 (read
--   unchanged); `AutomationRule.update-system@guc-A` 6 rows -> 42501;
--   `AutomationRule.update-system@guc-empty` 6 rows -> 42501;
--   `AutomationRule.insert-own@guc-A` (scope=TENANT, tenantId=A) accepted ->
--   accepted; `AutomationRule.insert-system@guc-A` (scope=SYSTEM,
--   tenantId=NULL) accepted -> 42501 (NULL = current_tenant_id() is NULL, not
--   true); `AutomationRule.insert-cross@guc-A` (scope=TENANT, tenantId=B) —
--   MEASURED 42501 in BOTH phases (the prior derived check's `SYSTEM` branch
--   does not cover a `TENANT`-scope row naming a foreign tenant either, so
--   this one site was already closed before this migration; recorded here so
--   a reader comparing this file to the plan's prose does not mistake the
--   unchanged 42501 for a miss — it is a measured, not an assumed, result).
--
-- ---------------------------------------------------------------------------
-- D2 — THE RESIDUE. `WITH CHECK` DOES NOT APPLY TO DELETE.
-- ---------------------------------------------------------------------------
-- PostgreSQL applies `WITH CHECK` to INSERT and to the NEW row of UPDATE.
-- DELETE is checked against `USING` alone, and statement 5 leaves `USING`
-- UNCHANGED (`(scope = 'SYSTEM') OR ("tenantId" = current_tenant_id())`), so
-- AFTER THIS MIGRATION A TENANT-SCOPED CONNECTION MAY STILL DELETE ALL 6
-- SYSTEM AutomationRule ROWS. Measured: `AutomationRule.delete-system@guc-A`
-- = 6 rows BEFORE and 6 rows AFTER — unchanged, and that unchanged number IS
-- the finding, not a failure to fix it.
--
-- It cannot be closed inside this migration's shape: permissive policies are
-- OR'd, so an extra `FOR DELETE` policy could only widen what is already
-- permitted; `AS RESTRICTIVE` is forbidden (§ below — it would AND with
-- `bypass_rls_policy` and silently neuter it); and narrowing the `FOR ALL`
-- `USING` clause would also narrow the SELECT, which the sweep calls
-- defensible and intended. The fix — named here, NOT built — is to split
-- `AutomationRule` by command: `FOR SELECT` keeping the SYSTEM branch, plus
-- separate `FOR INSERT` / `FOR UPDATE` / `FOR DELETE` policies that do not
-- carry it. Tracked as PARTIAL in
-- docs/audits/tenant-audit-automation-policy-closure.md's closure table.
--
-- ---------------------------------------------------------------------------
-- WHY THE REVOKE (5b) IS HERE AND IS NOT SCOPE CREEP.
-- ---------------------------------------------------------------------------
-- `bypass-replacement-design.md` §3.1 item 4 argues `WITH CHECK (true)` for
-- the new INSERT policy is safe BECAUSE "audit_log already carries REVOKE
-- UPDATE, DELETE" — append-only by construction. Measurement (this task, and
-- statement 3/4's paragraph above) says that premise was FALSE: `app_user`
-- held UPDATE and DELETE on staging. Without the revoke, the split above
-- would leave the two layers disagreeing — DELETE refused by the ABSENCE of a
-- policy (a SILENT 0 ROWS, D3), while the grant still says `app_user` may
-- delete. The revoke makes both layers say the same thing: append-only,
-- loudly (42501), not by omission. Nothing in the application UPDATEs or
-- DELETEs `audit_log` — the only writer is `prisma.auditLog.create` in
-- `src/lib/security/audit-log.ts` (grep over `src scripts prisma` found no
-- application UPDATE or DELETE) — and `597-staging-fixtures.ts`'s cleanup
-- connects as `postgres` via `STAGING_DIRECT_URL`, so an `app_user` revoke
-- does not affect it.
--
-- ---------------------------------------------------------------------------
-- D1 — WHY THE audit_log SELECT HALF KEEPS THE NAME `tenant_isolation_policy`.
-- ---------------------------------------------------------------------------
-- `tests-db/rls-isolation/coverage.test.ts` enumerates "every tenant-scoped
-- table" by querying `pg_policy` for the literal policy name
-- `tenant_isolation_policy`. If the split had renamed audit_log's SELECT
-- policy, `audit_log` would silently leave that enumeration, leave `rows`,
-- and the test `'every behaviour target is classified COVERED'` — which
-- filters `rows` by target key — would find nothing to check and PASS
-- VACUOUSLY, while `coverage-report.json` silently lost a table. Therefore
-- the SELECT half keeps the name `tenant_isolation_policy` (it IS the tenant
-- isolation policy for audit_log, now narrowed to SELECT) and the INSERT half
-- is the new name `audit_log_append_policy`. This is a measured consequence
-- of an existing enumeration, not a style preference. Task 3 of this quick
-- task additionally adds the assertion that makes the vacuity impossible in
-- future: every `ISOLATION_TARGETS` key must appear in `rows` at all.
--
-- ---------------------------------------------------------------------------
-- WHAT BREAKS AT THE `app_user` CUTOVER, BY FILE AND LINE.
-- ---------------------------------------------------------------------------
-- * `src/app/(admin)/actions/automations.ts:70` `toggleRuleActive` — the ONLY
--   `AutomationRule` write in the repository. Every SYSTEM row has
--   `tenantId IS NULL`, and `NULL = current_tenant_id()` is NULL at EVERY GUC
--   value including `''`, so AFTER THIS MIGRATION no `app_user` connection —
--   scoped or not — can toggle a platform automation rule at all. This
--   route's fix is the privileged admin connection of
--   `bypass-replacement-design.md` §3.2 (checklist item **B5, which does not
--   exist**). Not built here, not scheduled by this task.
-- * `src/app/(admin)/actions/tenants.ts:98, :190, :229, :432, :542, :625` —
--   sysadmin acting on tenants OTHER than its own. Deliberately unserved by
--   any policy added here; routes to B5, same as above.
-- * `"Tenant"` carries NO DELETE POLICY, deliberately (design §3.1 #3): a
--   tenant must never be able to delete itself. Deletion is
--   `(admin)/actions/tenants.ts:625` only, and is B5's, not this migration's.
--
-- ---------------------------------------------------------------------------
-- NO `AS RESTRICTIVE` ANYWHERE, AND WHY (quick-597 §8).
-- ---------------------------------------------------------------------------
-- A restrictive policy is AND'd with EVERY permissive policy on the same
-- table, `bypass_rls_policy` included, so a restrictive tenant predicate here
-- would silently neuter the bypass on these three tables — the one thing this
-- task must not touch. Every statement below is `AS PERMISSIVE`.
-- `bypass_rls_policy` is untouched on all three tables: 86 rows before this
-- migration, 86 after, identical sorted table list (asserted as a list, not a
-- count — evidence/before.md and evidence/after.md §3).
--
-- `"SupportTicket"` is untouched — its 7 null-tenant rows are a product
-- decision (quick-597 §5(c), reaffirmed by the satisfiability sweep §5.3),
-- not something this migration is in scope to fix.
--
-- ---------------------------------------------------------------------------
-- `_prisma_migrations` — UNTOUCHED, AND WHY THE DEPENDENCY IS RECORDED HERE.
-- ---------------------------------------------------------------------------
-- It carries RLS enabled with ZERO policies and NO `app_user` grant, which is
-- safe ONLY while `DIRECT_URL` (what the migration applier actually connects
-- as) stays on a privileged role. `apps/web/vercel.json`'s `buildCommand` runs
-- `node scripts/migrate.mjs`, and that script resolves
-- `DIRECT_URL || DATABASE_URL`. If a future cutover moves BOTH variables,
-- every Vercel build fails at the migration step — loud, not silent, but
-- undocumented anywhere else in the repo before this line.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCY AND THE REPLAY PARSER.
-- ---------------------------------------------------------------------------
-- Every `CREATE POLICY` / `DROP POLICY` statement below starts AT COLUMN ZERO
-- in plain static SQL. `scripts/audit/rls-policy-replay.ts`'s
-- `POLICY_STATEMENT_RE` is LINE-ANCHORED and structurally cannot see SQL
-- inside a `DO $$ ... EXECUTE format('CREATE POLICY ...')` block — a policy
-- hidden that way goes live and is then reported as UNEXPECTED by the drift
-- gate. There is no `CREATE POLICY IF NOT EXISTS` in Postgres, so every
-- `CREATE` is preceded by a `DROP POLICY IF EXISTS` on the same name — that
-- pairing IS the idempotency mechanism, and it is why this file can be
-- replayed against a from-zero database without erroring.
--
-- The REVOKE (statement 5b) sits inside a `DO $$ ... $$` block guarded on
-- `pg_roles`, and uses `RAISE NOTICE` + `RETURN` rather than
-- `RAISE EXCEPTION` when `app_user` does not exist yet, because the migration
-- chain must replay from zero (quick-593) and this migration may run before
-- `app_user` is created by `20260515000001_db_security_standardization`.
--
-- The commented ROLLBACK block at the end is safe under the same rule a
-- comment always is: its lines begin with `-`, not with whitespace, so the
-- line-anchored regex cannot match them.
--
-- ---------------------------------------------------------------------------
-- THE APPLY COMMAND ACTUALLY USED.
-- ---------------------------------------------------------------------------
-- Run from apps/web/, with BOTH variables pinned to the SAME staging string:
--
--   DIRECT_URL=<staging> DATABASE_URL=<staging> node scripts/migrate.mjs
--
-- Both are required. `scripts/_bootstrap-env.ts:53-55` repoints `DATABASE_URL`
-- at `DIRECT_URL` unconditionally and every env file points `DIRECT_URL` at
-- PRODUCTION, so pinning only `DATABASE_URL` for a script that imports it
-- would silently repoint the run at production. `migrate.mjs` additionally
-- spawns `seed-starter-playbooks.ts`, which resolves a BARE `DATABASE_URL`
-- with no dotenv load and carries its own `assertSameProjectRef()` guard —
-- pinning only `DIRECT_URL` would leave that seeder pointed elsewhere.
--
-- Never `prisma migrate deploy`, never the Supabase MCP `apply_migration` or
-- `execute_sql`, never `db push` — per DEC-17, neither MCP tool writes the
-- `_prisma_migrations` row that `migrate.mjs` writes, and "the DDL is live" is
-- evidence of the half that was never in doubt.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. "Tenant" — bootstrap INSERT. Only a connection with NO tenant GUC set
--    may create a tenant.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_bootstrap_insert ON "Tenant";
CREATE POLICY tenant_bootstrap_insert ON "Tenant"
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL);


-- ────────────────────────────────────────────────────────────────────────────
-- 2. "Tenant" — self UPDATE. The exact twin of the existing `tenant_self_read`.
--    No DELETE policy is added — deliberately; see header.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_self_update ON "Tenant";
CREATE POLICY tenant_self_update ON "Tenant"
  AS PERMISSIVE
  FOR UPDATE
  TO public
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());


-- ────────────────────────────────────────────────────────────────────────────
-- 3. audit_log — narrow the existing `tenant_isolation_policy` to SELECT only.
--    NAME KEPT DELIBERATELY (D1 — see header).
--
-- Prior definition (verbatim from evidence/before.json, staging, 2026-09-14):
--   permissive PERMISSIVE, cmd ALL, roles public
--   USING      (tenant_id = current_tenant_id())
--   WITH CHECK NULL  -- derived from USING
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation_policy ON audit_log;
CREATE POLICY tenant_isolation_policy ON audit_log
  AS PERMISSIVE
  FOR SELECT
  TO public
  USING (tenant_id = current_tenant_id());


-- ────────────────────────────────────────────────────────────────────────────
-- 4. audit_log — new append-only INSERT policy. Admits writeAuditLog's
--    documented cross-tenant contract; the SELECT half above keeps it hidden
--    from any tenant it does not belong to.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS audit_log_append_policy ON audit_log;
CREATE POLICY audit_log_append_policy ON audit_log
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (true);


-- ────────────────────────────────────────────────────────────────────────────
-- 5. "AutomationRule" — add an explicit WITH CHECK that does NOT carry the
--    scope = 'SYSTEM' branch. USING (and therefore SELECT visibility) is
--    UNCHANGED. D2 residue: DELETE is checked against USING alone and is NOT
--    closed by this statement — see header.
--
-- Prior definition (verbatim from evidence/before.json, staging, 2026-09-14):
--   permissive PERMISSIVE, cmd ALL, roles public
--   USING      ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))
--   WITH CHECK NULL  -- derived from USING
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation_policy ON "AutomationRule";
CREATE POLICY tenant_isolation_policy ON "AutomationRule"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))
  WITH CHECK ("tenantId" = current_tenant_id());


-- ────────────────────────────────────────────────────────────────────────────
-- 5b. audit_log — REVOKE UPDATE, DELETE. Makes the absence of a write policy
--     a loud 42501 rather than a silent 0-row no-op (D3). See header "WHY THE
--     REVOKE IS HERE". Guarded on pg_roles; NOTICE + RETURN, never
--     RAISE EXCEPTION, so the migration chain still replays from zero when
--     app_user does not exist yet (quick-593).
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE NOTICE 'quick-599: role app_user does not exist — skipping the audit_log REVOKE. This is expected on a from-zero replay that has not yet reached 20260515000001_db_security_standardization.';
    RETURN;
  END IF;

  REVOKE UPDATE, DELETE ON audit_log FROM app_user;
END
$$;


-- ============================================================================
-- ROLLBACK — COMMENTED OUT. NOT APPLIED BY ANYTHING.
-- ============================================================================
-- Every definition below is copied VERBATIM out of
-- evidence/before.json (pg_policies on staging, 2026-09-14, before this file
-- was applied). To revert, copy this block into a psql session — do NOT
-- uncomment it in place: `scripts/migrate.mjs` skips by `migration_name` and
-- would never re-run this file anyway, while the drift replay WOULD see the
-- uncommented statements and report the five policies as expected-but-missing.
--
-- -- 1/2. "Tenant" — drop both new policies; tenant_self_read is untouched by
-- -- this migration and needs no restoration.
-- DROP POLICY IF EXISTS tenant_bootstrap_insert ON "Tenant";
-- DROP POLICY IF EXISTS tenant_self_update ON "Tenant";
--
-- -- 3/4. audit_log — restore the single FOR ALL policy, drop the INSERT split.
-- DROP POLICY IF EXISTS audit_log_append_policy ON audit_log;
-- DROP POLICY IF EXISTS tenant_isolation_policy ON audit_log;
-- CREATE POLICY tenant_isolation_policy ON audit_log
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING (tenant_id = current_tenant_id());
--
-- -- 5. "AutomationRule" — restore the derived (no explicit) WITH CHECK.
-- DROP POLICY IF EXISTS tenant_isolation_policy ON "AutomationRule";
-- CREATE POLICY tenant_isolation_policy ON "AutomationRule"
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()));
--
-- -- 5b. audit_log — restore the UPDATE, DELETE grant.
-- GRANT UPDATE, DELETE ON audit_log TO app_user;
-- ============================================================================
