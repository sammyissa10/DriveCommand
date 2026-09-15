-- ============================================================================
-- quick-612 — close the "AutomationRule" DELETE gap (and the CAPTURE gap) with
-- a per-command policy split
-- ============================================================================
--
-- WHAT WAS WRONG
-- ---------------------------------------------------------------------------
-- Before this file, "AutomationRule" carried ONE policy for every command:
--
--   tenant_isolation_policy  FOR ALL
--     USING      ((scope = 'SYSTEM') OR ("tenantId" = current_tenant_id()))
--     WITH CHECK ("tenantId" = current_tenant_id())
--
-- The `USING` clause must keep the `scope = 'SYSTEM'` branch, because tenants
-- have to READ the 6 platform rules. But PostgreSQL applies, for a FOR ALL
-- policy:
--
--   SELECT -> USING                    INSERT -> WITH CHECK
--   UPDATE -> USING (old) + WITH CHECK (new)
--   DELETE -> USING ONLY
--
-- so that one `USING` was doing two incompatible jobs, and TWO holes followed.
--
--   HOLE 1 — DELETE. `WITH CHECK` never applies to DELETE; DELETE is governed
--   by `USING` alone. quick-599 added the `WITH CHECK` and closed INSERT and
--   UPDATE-in-place, but could not reach DELETE and recorded the table as
--   PARTIAL. Measured on staging as `app_user`:
--       DELETE FROM "AutomationRule" WHERE scope='SYSTEM'  ->  6 rows
--
--   HOLE 2 — CAPTURE, found by quick-612 and in no prior audit. `WITH CHECK`
--   inspects only the NEW row. `USING` admits a SYSTEM row for UPDATE. So a
--   tenant-scoped connection could TAKE OWNERSHIP of all six platform rules:
--       UPDATE "AutomationRule" SET "tenantId" = <own> WHERE scope='SYSTEM'
--         USING       admits  (scope = 'SYSTEM' branch)
--         WITH CHECK  admits  (the new row's "tenantId" IS the caller's own)
--       ->  6 rows
--   quick-599 tested only an UPDATE touching a NON-`tenantId` column, which
--   returns 42501 because `tenantId` stays NULL, and so never saw this. The
--   capture is arguably worse than the delete: the rules keep running, now
--   owned by one tenant, and nothing looks broken.
--
-- THE FIX — four per-command policies replacing the one FOR ALL
-- ---------------------------------------------------------------------------
--   tenant_isolation_policy         FOR SELECT  USING (SYSTEM OR own)
--   automation_rule_insert_policy   FOR INSERT              WITH CHECK (own)
--   automation_rule_update_policy   FOR UPDATE  USING (own) WITH CHECK (own)
--   automation_rule_delete_policy   FOR DELETE  USING (own)
--
-- Only SELECT keeps the `scope = 'SYSTEM'` branch. That is the entire point:
-- the branch exists so tenants can READ platform rules, and it was never meant
-- to authorise writing or deleting them.
--
-- `USING` IS THE ONLY LEVER ON THE OLD ROW, which is why closing the capture
-- REQUIRES dropping SYSTEM from UPDATE's `USING`. There is no `WITH CHECK`
-- formulation that can do it — `WITH CHECK` cannot see the row being replaced.
--
-- THE NAME `tenant_isolation_policy` IS RETAINED, ON THE SELECT HALF
-- ---------------------------------------------------------------------------
-- quick-599 §6's rule, and it is load-bearing rather than cosmetic:
-- `tests-db/rls-isolation/coverage.test.ts` enumerates "every tenant-scoped
-- table" by querying `pg_policy` for that literal policy NAME, and the drift
-- detector keys on `(table, policy_name)`. Had all four halves been renamed,
-- the table would not have become "NOT COVERED" — it would have VANISHED from
-- the enumeration, and a test that filters by target key would then pass
-- VACUOUSLY over an empty set. The half closest to the table's original read
-- shape keeps the original name; the three new ones get new names.
--
-- STATED COST, NOT HIDDEN
-- ---------------------------------------------------------------------------
-- `UPDATE ... SET <non-tenantId column> WHERE scope='SYSTEM'` under a tenant
-- connection changes from a LOUD 42501 to a SILENT 0 rows, because the row is
-- now filtered by `USING` before `WITH CHECK` is ever reached. That is a real
-- loss of observability and it is accepted deliberately: a silent refusal beats
-- an open capture. It is also the general shape of RLS — quick-599's D3 rule:
-- an RLS-refused UPDATE or DELETE is a silent zero, and only `WITH CHECK`
-- raises. Any probe of this table must therefore carry a COUNTER-READ, or
-- "refused" and "already gone" are the same observation.
--
-- NO `AS RESTRICTIVE` ANYWHERE. A restrictive policy ANDs with EVERY permissive
-- policy on the table, including `bypass_rls_policy`, and would silently neuter
-- the bypass here (quick-597 §8). All four below are PERMISSIVE.
--
-- `bypass_rls_policy` IS NOT TOUCHED — 86 policies of that name before and
-- after, compared as a sorted table LIST and not merely a count.
--
-- NO POLICY DDL INSIDE A `DO` BLOCK. `rls-policy-replay.test.ts`'s parser is
-- line-anchored and cannot see inside one, so every statement below starts at
-- column zero.
--
-- ---------------------------------------------------------------------------
-- THIS MIGRATION CHANGES NOTHING AT RUNTIME TODAY.
-- ---------------------------------------------------------------------------
-- The application connects as `postgres` (`rolbypassrls = true`). Every policy
-- below is DECORATIVE until `DATABASE_URL` moves to `app_user`. A GREEN DEPLOY
-- OF THIS FILE IS NOT EVIDENCE THAT ANY OF IT WORKS.
--
-- The evidence is an `app_user` connection against real rows on staging
-- (`wyixpgunnjmzguhggocz`), captured before and after:
--   .planning/quick/612-close-the-automationrule-delete-gap-with/evidence/
--   docs/audits/tenant-audit-automation-policy-closure.md
--
-- ---------------------------------------------------------------------------
-- KNOWN, PRE-EXISTING, AND NOT FIXED HERE (it needs an application change):
-- ---------------------------------------------------------------------------
-- `(admin)/actions/automations.ts:71 toggleRuleActive` updates a SYSTEM rule on
-- the BARE prisma client — NOT on `getAdminDb` — so a policy IS consulted. It
-- ALREADY fails under `app_user` today with 42501, with and without a tenant
-- GUC (measured). This migration does not break it; it changes the failure from
-- 42501 to a silent 0 rows. Routing that one call to `getAdminDb` is a cutover
-- prerequisite and is reported, not done here.
-- ============================================================================

DROP POLICY IF EXISTS "tenant_isolation_policy" ON "AutomationRule";

CREATE POLICY "tenant_isolation_policy" ON "AutomationRule"
FOR SELECT
USING ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()));

CREATE POLICY "automation_rule_insert_policy" ON "AutomationRule"
FOR INSERT
WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY "automation_rule_update_policy" ON "AutomationRule"
FOR UPDATE
USING ("tenantId" = current_tenant_id())
WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY "automation_rule_delete_policy" ON "AutomationRule"
FOR DELETE
USING ("tenantId" = current_tenant_id());
