-- ============================================================================
-- quick-597 — RLS policy satisfiability and correctness fixes
-- ============================================================================
--
-- FIVE CHANGES, one file:
--
--   1. `audit_log.tenant_isolation_policy` — replace the raising
--      `(current_setting('app.current_tenant_id', true))::uuid` cast with
--      `current_tenant_id()`. The cast is the whole change.
--   2. `"PushToken".user_isolation_policy` — DROP. It keys on
--      `app.current_user_id`, which nothing in this repository ever sets.
--   3. `"SysAdminInvoice"` / `"SysAdminInvoiceItem"` "deny" pair — DROP. They
--      are named deny and are PERMISSIVE, so they GRANT.
--   4. `in_app_notifications_insert_policy` — `WITH CHECK (true)` becomes
--      `WITH CHECK (org_id = current_tenant_id())`.
--   5. `GRANT SELECT, UPDATE ON "Promo" TO app_user` — `onboarding/provision-tenant.ts:103`
--      issues a raw `UPDATE "Promo" SET "redemptionCount"`.
--
-- ---------------------------------------------------------------------------
-- THIS MIGRATION CHANGES NOTHING AT RUNTIME TODAY.
-- ---------------------------------------------------------------------------
-- The application connects as `postgres`, which has `rolbypassrls = true`.
-- Every policy touched below is therefore DECORATIVE until `DATABASE_URL` moves
-- to `app_user`. A GREEN DEPLOY OF THIS FILE IS NOT EVIDENCE THAT ANY OF IT
-- WORKS. Do not read it as one.
--
-- The evidence is an `app_user` connection against seeded rows on staging
-- (`wyixpgunnjmzguhggocz`), captured before and after this file was applied:
--   .planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence/
--     before.json / before.md / after.json / after.md
--   docs/audits/rls-policy-satisfiability-fixes.md
--
-- Nor is `npm run audit:rls-policy-drift` evidence. It replays this corpus and
-- diffs `(table, policy_name)` identity against live `pg_policy`. It does not
-- compare expressions, commands or the permissive flag, so it can confirm that
-- the NAME SET matches and can never validate the rewrite in change 1 or 4.
--
-- ---------------------------------------------------------------------------
-- WHY 1 MATTERS — measured, not argued.
-- ---------------------------------------------------------------------------
-- `lib/db/prisma.ts:71` writes `app.current_tenant_id = ''` on every new
-- physical connection. The live policy casts the GUC VALUE, and `''::uuid` is a
-- hard error, so at the `app_user` cutover every GUC-less read of `audit_log`
-- becomes:
--     ERROR [22P02] invalid input syntax for type uuid: ""
-- measured on staging as `app_user`, both for a SELECT and for an INSERT.
-- `audit_log.tenant_isolation_policy` is the ONLY policy in either database that
-- casts the GUC value itself; every other policy calls `current_tenant_id()`,
-- which is `SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID`
-- and so turns `''` into NULL rather than into a raise.
--
-- Also measured, and worth knowing before reading the matrix: on the Supavisor
-- transaction-mode pooler a "fresh client" is not a fresh backend. Once the
-- placeholder GUC has been set on a server connection its reset value is `''` —
-- neither `set_config(name, NULL, false)` nor `RESET` returns
-- `current_setting(name, true)` to NULL. A genuinely-unset GUC is therefore
-- unreachable in practice, which makes `''` the only case that matters.
--
-- ---------------------------------------------------------------------------
-- WHY 3 DROPS RATHER THAN REWRITES, AND WHY NOT `AS RESTRICTIVE`.
-- ---------------------------------------------------------------------------
-- Both policies read
--     USING ((current_setting('app.current_tenant_id', true) IS NULL)
--         OR (current_setting('app.current_tenant_id', true) = ''))
-- and both are PERMISSIVE, so they are OR'd with `tenant_isolation_policy`.
-- Their effect is the exact inverse of their name: an unscoped connection sees
-- EVERY tenant's invoices. Measured on staging as `app_user` with two tenants
-- seeded — 2 of 2 rows visible with the GUC at `''`, 0 after this migration.
--
-- A RESTRICTIVE replacement was considered and REJECTED. A restrictive policy is
-- AND'd with ALL permissive policies, `bypass_rls_policy` included, so a
-- restrictive tenant predicate here would silently neuter the bypass on these
-- two tables — the one thing this task must not touch. Dropping the granting
-- policy reaches the intended end state (a tenant sees its own rows via
-- `tenant_isolation_policy`; an unscoped connection sees none) without going
-- near the bypass. 86 `bypass_rls_policy` rows before, 86 after.
--
-- ---------------------------------------------------------------------------
-- WHAT BREAKS AT THE `app_user` CUTOVER BECAUSE OF CHANGE 3.
-- ---------------------------------------------------------------------------
-- The single sysadmin account (1 of 38 `auth.users`, the only one with no
-- tenant claim) has no `tenantId`, so every sysadmin billing path runs GUC-less
-- and reaches `"SysAdminInvoice"` TODAY ONLY BECAUSE the permissive "deny"
-- policy grants it. After this migration those paths see ZERO ROWS once
-- `DATABASE_URL` moves off `postgres`:
--
--   src/app/(admin)/actions/sysadmin-invoices.ts   17 statements, at lines
--       26, 106, 151, 166, 202, 242, 243, 275, 280, 300, 305, 325, 331, 356,
--       366, 399
--   src/app/(admin)/billing/[id]/page.tsx:36
--   src/app/api/cron/mark-overdue-invoices/route.ts:21
--   src/lib/email/send-sysadmin-invoice.ts:19
--
-- All four use the bare Prisma client. Their fix is the privileged ADMIN
-- CONNECTION of docs/audits/bypass-replacement-design.md §3.2 (checklist B5).
-- THAT CONNECTION DOES NOT EXIST YET. It is not built here, it is not scheduled,
-- and this file does not create it. Applying this migration to production is
-- safe today precisely because the cutover has not happened; the two must be
-- sequenced, and B5 must land before it.
--
-- ---------------------------------------------------------------------------
-- WHAT THIS FILE DELIBERATELY DOES NOT DO.
-- ---------------------------------------------------------------------------
-- * It does not split `audit_log`'s policy. `pg_policies.with_check` is NULL on
--   that policy, so under `FOR ALL` Postgres DERIVES the check from `USING` —
--   before and after. `writeAuditLog`'s documented contract is to write rows
--   whose tenant differs from the connection's, and the derived check refuses
--   exactly that (measured post-fix: SQLSTATE 42501, "new row violates
--   row-level security policy for table \"audit_log\""). Closing it means
--   `FOR SELECT USING (...)` + `FOR INSERT WITH CHECK (true)` per design doc
--   §3.1 item 4. REPORTED, not fixed here.
-- * It does not touch `bypass_rls_policy` on any table.
-- * It does not touch `"SupportTicket"`. The 7 null-tenant rows there are the
--   same 7 rows as the `submittedBy` FK orphans and point at one hard-deleted
--   user, so no policy can admit them "for their submitter". That is a PRODUCT
--   DECISION, not a migration.
-- * It does not touch `in_app_notifications_select_policy` /
--   `_update_policy`, which key on `auth.jwt() ->> 'org_id'`. A Prisma
--   connection never sets that, so both are dead — and harmless, because
--   `tenant_isolation_policy` (FOR ALL) already covers both commands.
-- * It adds no `bypass_rls_policy` and no index. None of the five changes
--   introduces a new subquery.
--
-- ---------------------------------------------------------------------------
-- IDEMPOTENCY AND THE REPLAY PARSER.
-- ---------------------------------------------------------------------------
-- Every policy statement is `DROP POLICY IF EXISTS` (optionally followed by
-- `CREATE POLICY`), AT COLUMN ZERO, in plain static SQL. The drift detector
-- (`scripts/audit/rls-policy-replay.ts`) parses with a LINE-ANCHORED regex
--   /^[ \t]*(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|[A-Za-z_]\w*)\s+ON .../gim
-- A policy statement hidden inside `DO $$ ... EXECUTE format('CREATE POLICY ...')`
-- is INVISIBLE to it, which makes the policy go live and then be reported as
-- UNEXPECTED, failing the zero-drift gate. NO `DO` BLOCK AROUND POLICY DDL IN
-- THIS FILE, ever. The commented ROLLBACK section at the end is safe for the
-- same reason a comment always is: its lines begin with `-`, not with
-- whitespace, so the anchor cannot match them.
--
-- The grant sits in a `DO` block guarded on `pg_roles` and SKIPS with a NOTICE
-- when `app_user` is absent — never `RAISE EXCEPTION`, because the chain must
-- replay from zero (quick-593).
--
-- Applied to STAGING ONLY by this task, with
--   DIRECT_URL=<staging> DATABASE_URL=<staging> node scripts/migrate.mjs
-- run from apps/web. Both variables must be pinned: `scripts/_bootstrap-env.ts`
-- repoints `DATABASE_URL` at `DIRECT_URL` unconditionally and every env file
-- points `DIRECT_URL` at PRODUCTION, and `migrate.mjs` spawns a seeder that
-- resolves a bare `DATABASE_URL`.
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- 1. audit_log — the ::uuid cast raises 22P02 on the pool's '' default.
--
-- Prior definition (verbatim from pg_policies on staging, 2026-09-14):
--   permissive PERMISSIVE, cmd ALL, roles public
--   USING      (tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid)
--   WITH CHECK NULL  -- derived from USING
--
-- `AS PERMISSIVE`, `FOR ALL`, `TO public` and the absent WITH CHECK all match
-- that snapshot exactly. The ONLY difference is the right-hand side.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS tenant_isolation_policy ON audit_log;
CREATE POLICY tenant_isolation_policy ON audit_log
  AS PERMISSIVE
  FOR ALL
  TO public
  USING (tenant_id = current_tenant_id());


-- ────────────────────────────────────────────────────────────────────────────
-- 2. "PushToken".user_isolation_policy — a dead policy.
--
-- Prior definition:
--   permissive PERMISSIVE, cmd ALL, roles public
--   USING      (("userId")::text = current_setting('app.current_user_id'::text, true))
--   WITH CHECK NULL
--
-- `app.current_user_id` is never set anywhere in this repository (4 grep hits:
-- two comments, one doc line, and the CREATE POLICY itself), so
-- `current_setting(..., true)` is NULL and `"userId"::text = NULL` is NULL —
-- never true. The policy is permissive and has therefore never matched a row,
-- which is why dropping it can neither narrow nor widen visibility.
-- `"PushToken"."tenantId"` is NOT NULL and `tenant_isolation_policy` already
-- scopes the table; measured after the drop, tenant A still sees its own token
-- and none of tenant B's.
--
-- WHAT IS LOST: nothing that was ever in force. Per-user scoping on
-- `"PushToken"` was never enforced by this policy, so the drop does not remove
-- an enforcement — it removes the appearance of one. If per-user scoping is
-- wanted it has to be built, with a GUC something actually writes.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS user_isolation_policy ON "PushToken";


-- ────────────────────────────────────────────────────────────────────────────
-- 3. The SysAdmin "deny" pair — named deny, PERMISSIVE, therefore granting.
--
-- Prior definitions (both identical):
--   permissive PERMISSIVE, cmd ALL, roles public
--   USING      ((current_setting('app.current_tenant_id'::text, true) IS NULL)
--            OR (current_setting('app.current_tenant_id'::text, true) = ''::text))
--   WITH CHECK NULL
--
-- Names read off `pg_policies` on staging, not guessed.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS sysadmin_invoices_deny_tenant_users ON "SysAdminInvoice";
DROP POLICY IF EXISTS sysadmin_invoice_items_deny_tenant_users ON "SysAdminInvoiceItem";


-- ────────────────────────────────────────────────────────────────────────────
-- 4. in_app_notifications_insert_policy — WITH CHECK (true) is an open door in.
--
-- Prior definition:
--   permissive PERMISSIVE, cmd INSERT, roles public
--   USING      NULL           -- FOR INSERT policies carry no USING
--   WITH CHECK true
--
-- Because it is permissive and FOR INSERT, it is OR'd with the FOR ALL
-- `tenant_isolation_policy` on the same table for INSERT, and `true` wins every
-- time: a connection scoped to tenant A could insert a notification owned by
-- tenant B. Measured before — accepted. Measured after — 42501.
--
-- The new check is the SAME predicate `tenant_isolation_policy` already uses on
-- this table (`org_id = current_tenant_id()`), so the legitimate own-tenant
-- insert is unaffected. That counter-assertion is measured too: accepted before
-- AND after. Without it the rejection above would pass by saying nothing.
-- ────────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS in_app_notifications_insert_policy ON in_app_notifications;
CREATE POLICY in_app_notifications_insert_policy ON in_app_notifications
  AS PERMISSIVE
  FOR INSERT
  TO public
  WITH CHECK (org_id = current_tenant_id());


-- ────────────────────────────────────────────────────────────────────────────
-- 5. "Promo" — the missing UPDATE grant.
--
-- `src/lib/onboarding/provision-tenant.ts:103` issues a raw
--   UPDATE "Promo" SET "redemptionCount" = "redemptionCount" + 1 ...
-- on the promo-code signup path. 20260912130000 granted SELECT only, on the
-- stated reasoning that every `"Promo"` write lives in the sysadmin path — true
-- of `(admin)/actions/promos.ts`, and this raw statement is the exception that
-- was missed. Measured as `app_user`: SELECT succeeds and the UPDATE is
-- `42501 permission denied for table Promo` before, 1 row after.
--
-- SELECT is re-granted alongside UPDATE so this statement states the whole
-- intended grant rather than a delta onto another migration's.
-- ────────────────────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE NOTICE 'quick-597: role app_user does not exist — skipping the "Promo" grant. This is expected on a from-zero replay that has not yet reached 20260515000001_db_security_standardization.';
    RETURN;
  END IF;

  GRANT SELECT, UPDATE ON "Promo" TO app_user;
END
$$;


-- ============================================================================
-- ROLLBACK — COMMENTED OUT. NOT APPLIED BY ANYTHING.
-- ============================================================================
-- Every definition below is copied VERBATIM out of
-- evidence/before.json (pg_policies on staging, 2026-09-14, before this file was
-- applied), including the two policies this migration only drops. To revert,
-- copy this block into a psql session — do NOT uncomment it in place, because
-- `scripts/migrate.mjs` skips by `migration_name` and would never re-run this
-- file anyway, while the drift replay WOULD see the uncommented statements and
-- report the four policies as expected-but-missing.
--
-- -- 1. audit_log
-- DROP POLICY IF EXISTS tenant_isolation_policy ON audit_log;
-- CREATE POLICY tenant_isolation_policy ON audit_log
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING (tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid);
--
-- -- 2. "PushToken"
-- CREATE POLICY user_isolation_policy ON "PushToken"
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING ((("userId")::text = current_setting('app.current_user_id'::text, true)));
--
-- -- 3. the SysAdmin deny pair
-- CREATE POLICY sysadmin_invoices_deny_tenant_users ON "SysAdminInvoice"
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING (((current_setting('app.current_tenant_id'::text, true) IS NULL) OR (current_setting('app.current_tenant_id'::text, true) = ''::text)));
--
-- CREATE POLICY sysadmin_invoice_items_deny_tenant_users ON "SysAdminInvoiceItem"
--   AS PERMISSIVE
--   FOR ALL
--   TO public
--   USING (((current_setting('app.current_tenant_id'::text, true) IS NULL) OR (current_setting('app.current_tenant_id'::text, true) = ''::text)));
--
-- -- 4. in_app_notifications
-- DROP POLICY IF EXISTS in_app_notifications_insert_policy ON in_app_notifications;
-- CREATE POLICY in_app_notifications_insert_policy ON in_app_notifications
--   AS PERMISSIVE
--   FOR INSERT
--   TO public
--   WITH CHECK (true);
--
-- -- 5. "Promo" — SELECT is left in place; 20260912130000 granted it.
-- REVOKE UPDATE ON "Promo" FROM app_user;
-- ============================================================================
