---
phase: quick-597
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/scripts/audit/597-staging-fixtures.ts
  - apps/web/scripts/audit/597-policy-verify.ts
  - apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql
  - docs/audits/rls-policy-satisfiability-fixes.md
  - .planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence/
autonomous: true

must_haves:
  truths:
    - "Selecting from audit_log as app_user with app.current_tenant_id set to '' (the value prisma.ts:71 writes on every new physical connection) raises 22P02 BEFORE the migration and returns zero rows without raising AFTER it."
    - "A connection scoped to staging tenant A sees only tenant A's rows on audit_log, in_app_notifications, PushToken, SysAdminInvoice, SysAdminInvoiceItem, stops, carrier_documents and route_template_stops, and none of tenant B's."
    - "A connection with app.current_tenant_id unset, and one with it set to '', see ZERO SysAdminInvoice rows after the migration, where before they saw every tenant's."
    - "An INSERT into in_app_notifications naming another tenant's org_id is accepted BEFORE and rejected AFTER; an INSERT naming the connection's own tenant is accepted both times."
    - "app_user can UPDATE \"Promo\" on staging after the migration and could not before."
    - "The three carrier join-table policies (stops, carrier_documents, route_template_stops) are proven satisfiable by a real app_user connection against seeded rows, not merely present in pg_policy."
    - "bypass_rls_policy is untouched: the same 86 bypass policy rows exist on staging before and after, by name and by table."
    - "npm run audit:rls-policy-drift against staging exits 0 with 0 missing and 0 unexpected after the migration is applied."
    - "Staging is returned to its pre-task state: zero Tenant rows and zero rows in every fixture table."
    - "Production is never written."
  artifacts:
    - path: "apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql"
      provides: "The deliverable: 4 policy changes + 1 grant, idempotent, with a commented-out verbatim ROLLBACK section"
      contains: "DROP POLICY IF EXISTS"
    - path: "apps/web/scripts/audit/597-staging-fixtures.ts"
      provides: "Disposable staging fixtures: seed, teardown, verify-clean"
    - path: "apps/web/scripts/audit/597-policy-verify.ts"
      provides: "The before/after verification matrix run as app_user against staging"
    - path: "docs/audits/rls-policy-satisfiability-fixes.md"
      provides: "Evidence, the production-apply runbook, the named readers that break at cutover, and the closure table for the 11 BROKEN_POLICY sites"
  key_links:
    - from: "apps/web/scripts/audit/597-policy-verify.ts"
      to: "apps/web/.env.staging"
      via: "explicit dotenv load of STAGING_DIRECT_URL / STAGING_DATABASE_URL_APP_USER, never scripts/_bootstrap-env"
      pattern: "STAGING_DATABASE_URL_APP_USER"
    - from: "apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql"
      to: "scripts/audit/rls-policy-replay.ts"
      via: "line-anchored top-level CREATE/DROP POLICY statements the replay parser can see"
      pattern: "^DROP POLICY IF EXISTS"
---

<objective>
Fix the four RLS policies that are unsatisfiable or that grant where they claim to deny, close one
missing grant, and prove each fix empirically against staging as `app_user`.

Purpose: these policies are inert today only because `DATABASE_URL` still resolves to the `postgres`
role (`rolbypassrls = true`). At the `app_user` cutover, `audit_log` becomes a hard 22P02 on every
GUC-less connection, `SysAdminInvoice` stays readable by every unscoped connection, and
`in_app_notifications` keeps an open insert door. A green deploy is not evidence for any of this;
only a scoped `app_user` connection against seeded rows is.

Output: one migration file (the artefact a human later applies to production), two staging-only
scripts, a before/after evidence set, and an audit doc carrying the closure table.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/audits/bypass-replacement-design.md

Read before writing anything:
@apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/migration.sql
@apps/web/scripts/audit/rls-policy-replay.ts
@apps/web/scripts/seed-staging.ts
@apps/web/scripts/_bootstrap-env.ts
</context>

<preflight_findings>
These were verified live by the orchestrator and by this plan's own reading of the repo. Do NOT
re-derive them. Do challenge any that the run contradicts, and report the contradiction.

**Environment**
- `apps/web/.env.staging` (gitignored) holds `STAGING_DATABASE_URL`, `STAGING_DIRECT_URL`,
  `STAGING_DATABASE_URL_APP_USER`. `STAGING_DIRECT_URL` -> `postgres`, `bypassrls = true`, port 5432.
  `STAGING_DATABASE_URL_APP_USER` -> `app_user`, `rolbypassrls = false`. Both authenticate.
- **TRAP — `scripts/_bootstrap-env.ts:53-55` does `process.env.DATABASE_URL = process.env.DIRECT_URL`
  UNCONDITIONALLY**, and all three env files (`.env`, `.env.local`, `apps/web/.env.local`) point
  `DIRECT_URL` at **production** (`oqdhberkghtnszrkdvfm`). So running any script that imports
  `_bootstrap-env` with only `DATABASE_URL` pinned inline is **silently repointed at production**.
  Consequences, both mandatory:
  1. The two new scripts MUST NOT import `_bootstrap-env`. They load `apps/web/.env.staging`
     explicitly and refuse on the production ref.
  2. Anything that does import it (`npm run audit:rls-policy-drift`) must be invoked with **BOTH**
     `DIRECT_URL` and `DATABASE_URL` pinned inline to the staging value.
- Staging is **EMPTY**: 0 `Tenant` rows; 0 rows in `audit_log`, `PushToken`, `in_app_notifications`,
  `SysAdminInvoice(Item)`, `stops`, `carrier_documents`, `route_template_stops`, `SupportTicket`.
- Staging app_user grants: `"Promo"` = SELECT only. Every other affected table has full DML.

**Ledger — the 150 vs 151 difference is INERT. Do not hand-write a ledger row.**
`prisma/migrations/` holds **150 migration directories** (151 entries incl. `migration_lock.toml`).
Staging's `_prisma_migrations` holds **150 rows**; production holds 151. The extra production row is
`20260611000001_fix_carrier_rls_jwt_policies`, which **has no directory on disk** — `migrate.mjs`
iterates the disk corpus, and `rls-policy-drift.ts` replays the disk corpus, so neither can see it.
Staging is therefore fully up to date and `migrate.mjs` must apply **exactly one** migration: this
task's. If it reports applying more than one, STOP and report.

**Policy state** — production and staging both carry 183 policies / 86 `bypass_rls_policy`, and the
full `(name|cmd|permissive|USING|WITH CHECK)` digest is byte-identical across both
(`83f0a5e51586bbc924c0c33b6dbd3151`). Whatever is proven on staging holds for production.

**The six policies that reference `current_setting` outside `current_tenant_id()`** are
`PushToken.user_isolation_policy`, the `SysAdminInvoice`/`SysAdminInvoiceItem` deny pair,
`Tag.tenant_isolation_policy`, `TagAssignment.tenant_isolation_policy`, and
`audit_log.tenant_isolation_policy`. Tag/TagAssignment/PushToken cast the **column** to `::text` and
compare the GUC as text; the SysAdmin pair compares raw text. **`audit_log` is the only policy in
either database that casts the GUC value itself**, and so the only one that can raise 22P02.

**Drift detector — what it does and does not prove.** `npm run audit:rls-policy-drift` replays the
repo's migration SQL and diffs `(table, policy_name)` identity against live `pg_policy`. It does
**not** compare expressions, commands or the permissive flag. It can prove the name-set matches; it
can never validate a rewrite. Its parser is line-anchored:
`/^[ \t]*(CREATE|DROP)\s+POLICY\s+(?:IF\s+EXISTS\s+)?("[^"]+"|[A-Za-z_]\w*)\s+ON\s+(?:public\.)?("[^"]+"|[A-Za-z_]\w*)/gim`.
Quoted identifiers and a `public.` prefix are fine. **A policy statement inside a `DO $$ … $$` block
is invisible to it and creates false drift — no DO blocks for policy DDL.**

**The 17 tests in `src/__tests__/isolation/*.test.ts` (group-a 4, group-b 6, group-c 7) are
VACUOUS.** They contain zero database references and assert string literals against string literals
(`expect('org_id = current_tenant_id()').toBe('org_id = current_tenant_id()')`). Run them because the
task requires it. State in the summary that they pass identically before and after and are **not**
evidence. The evidence is the `app_user` matrix in Task 2.
</preflight_findings>

<scope>
**IN — five changes, one migration file:**
1. `audit_log.tenant_isolation_policy` — replace the raising `(current_setting(...))::uuid` cast with
   `current_tenant_id()`. The cast is the whole ask.
2. `PushToken.user_isolation_policy` — DROP. It keys on `app.current_user_id`, which **nothing in the
   repo sets** (4 grep hits: 2 comments, 1 doc line, the CREATE POLICY itself). It is permissive and
   has never matched a row, so dropping it can neither narrow nor widen visibility. `PushToken.tenantId`
   is NOT NULL and `tenant_isolation_policy` already scopes the table.
3. `SysAdminInvoice` + `SysAdminInvoiceItem` deny pair — DROP. They are named "deny" but are
   **permissive**, OR'd with `tenant_isolation_policy`, so every GUC-less connection sees every
   tenant's rows. **Do NOT replace them with a RESTRICTIVE policy**: a restrictive policy is AND'd
   with ALL permissive policies including `bypass_rls_policy`, which would silently neuter the bypass
   on those tables — the one thing this task must not touch. Dropping the granting policy achieves the
   exact intent (tenant sees its own; unscoped sees zero) without touching the bypass.
4. `in_app_notifications_insert_policy` — `WITH CHECK (true)` becomes
   `WITH CHECK (org_id = current_tenant_id())`, matching `tenant_isolation_policy` on the same table.
5. `GRANT SELECT, UPDATE ON "Promo" TO app_user` — `provision-tenant.ts:97` issues a raw
   `UPDATE "Promo" SET "redemptionCount"`, so promo-code signup fails at cutover without it.

**IN — proof, no DDL:** `stops`, `carrier_documents`, `route_template_stops` each already carry
exactly one policy (`tenant_isolation_policy`) and **no** `bypass_rls_policy`. Section 1.3(d) of the
design doc says production has zero policies on them; that reading is **stale** — the orchestrator
verified all three live on both databases. The remaining work is to prove the EXISTS-subquery joins
are satisfiable by a real `app_user` connection, since the joined tables carry RLS themselves.

**OUT — report, do not build:**
- `SupportTicket`'s 7 null-tenant rows. All 7 are the same rows as the 7 `submittedBy` FK orphans;
  all point at ONE hard-deleted user; 0 TicketMessages; 3 OPEN / 4 CLOSED; created 2026-03-28 ..
  2026-07-17. `getMyTickets`/`getTicketById` both require `submittedBy = the live session user`, so
  no tenant-facing path reaches them — they surface only on the sysadmin dashboard via
  `getAllTickets`, which works today only because `postgres` has BYPASSRLS. **A correct policy cannot
  admit them "for their submitter" — the submitter does not exist.** Resolution is a PRODUCT DECISION
  (sentinel tenant / soft-delete / restore the user / archive). **Do not delete the rows. Do not
  invent a tenant. Do not widen the policy.**
- `getAllTickets` (`support-tickets.ts:239-240`) carries a FALSE comment: *"raw SQL bypasses RLS
  entirely, no set_config needed. SupportTicket has no RLS so this is safe."* Raw SQL does NOT bypass
  RLS (only Prisma's where-injection is bypassed), and `SupportTicket` has `relrowsecurity = true`,
  `relforcerowsecurity = true` and a `tenant_isolation_policy`. Report it; it is a code change.
- `audit_log`'s derived `WITH CHECK`. Keeping `FOR ALL` means the check stays
  `tenant_id = current_tenant_id()`, which still contradicts `writeAuditLog`'s documented contract of
  writing rows whose tenant differs from the connection. Measure it (Task 2 probe), report it,
  do not split the policy in this task.
- `"Tenant"` has no INSERT/UPDATE/DELETE policy (design doc §1.3(a), 2 of the 11 sites). Out of scope:
  the orchestrator did not preflight it, and the fourth caller needs the admin connection of §3.2,
  which does not exist yet.
- **No application code changes.** No package installs. Production is never written.
</scope>

<tasks>

<task type="auto">
  <name>Task 1: Staging fixtures + BEFORE matrix as app_user</name>
  <files>
apps/web/scripts/audit/597-staging-fixtures.ts
apps/web/scripts/audit/597-policy-verify.ts
.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence/before.json
.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence/before.md
  </files>
  <action>
Write two staging-only scripts, then run the BEFORE capture.

**Both scripts, non-negotiable header rules:**
- Do NOT `import '../_bootstrap-env'` (see preflight TRAP). Instead:
  `loadEnv({ path: resolve(__dirname, '../../.env.staging'), quiet: true })` and read
  `STAGING_DIRECT_URL` / `STAGING_DATABASE_URL_APP_USER` directly.
- Refuse to run if either resolved URL is missing, or if **either** contains
  `oqdhberkghtnszrkdvfm` (the production ref) — mirror the guard at `scripts/seed-staging.ts:28-38`.
- Never print a connection string or password.
- Use `pg.Client` directly (the pattern in `scripts/audit/app-user-connection-harness.ts`), a **fresh
  client per GUC case**, so no session GUC can bleed between cases.

**A. `597-staging-fixtures.ts`** — modes `--seed`, `--teardown`, `--verify-clean`.

`--seed`:
  1. Run the existing, idempotent `scripts/seed-staging.ts` for the carrier graph rather than
     rebuilding it (it creates two tenants — `staging-alpha` / `staging-beta` — each with a user,
     drivers, client, truck, facilities, trip, load, two stops, route template, two template stops and
     a document, i.e. exactly the FK chain the three join-table policies need). Invoke it as a child
     process with `DATABASE_URL` pinned to `STAGING_DIRECT_URL`, or import and call it — either is
     fine, but the pinning must be explicit.
  2. Add the policy-specific rows this task needs, two of each (one per tenant), all tagged so
     teardown can find them — use the literal marker `RLS597` in a name/code/message field wherever
     the schema allows:
       - `audit_log` — one row per tenant (`tenant_id` = that tenant).
       - `in_app_notifications` — one row per tenant (`org_id` = that tenant).
       - `"PushToken"` — one row per tenant, `tenantId` set, `userId` = that tenant's seeded user.
       - `"SysAdminInvoice"` + `"SysAdminInvoiceItem"` — one invoice with one item per tenant.
       - `"Promo"` — one row, code `RLS597-PROMO` (global; needed only for the grant probe).
     Read the required columns off `prisma/schema.prisma` before writing — do not infer a column name
     from a sibling table's convention (DEC-14).
  3. Print the two tenant UUIDs and write them to `evidence/fixture-ids.json`; the verify script reads
     that file rather than re-deriving them.

`--teardown`: delete in FK-safe order — the `RLS597` extras first
(`SysAdminInvoiceItem` -> `SysAdminInvoice`, `in_app_notifications`, `PushToken`, `audit_log`,
`Promo`), then the seed-staging graph in **exact reverse of its creation order**
(`carrierDocument` -> `routeTemplateStop` -> `routeTemplate` -> `carrierStop` -> `carrierLoad` ->
`trip` -> `carrierFacility` -> `carrierTruck` -> `carrierClient` -> `carrierDriver` -> `user` ->
`tenant`), all scoped to the two disposable tenants. Note `scripts/cleanup-test-tenants.ts` is NOT
usable here: it is prefix-gated to `FI-Test-`/`MT-Test-` and makes Supabase Auth and storage calls.

`--verify-clean`: assert 0 `Tenant` rows and 0 rows in `audit_log`, `"PushToken"`,
`in_app_notifications`, `"SysAdminInvoice"`, `"SysAdminInvoiceItem"`, `stops`, `carrier_documents`,
`route_template_stops`, `"SupportTicket"`, and 0 `"Promo"` rows with code `RLS597-PROMO`. Non-zero
anywhere = exit 1 with the table and count named.

**B. `597-policy-verify.ts`** — `--phase before|after`. Writes
`evidence/<phase>.json` and a human-readable `evidence/<phase>.md`. Every probe records what happened
(SQLSTATE and full message on error); nothing is swallowed into a null or an empty array. It renders a
REPORT, not a pass/fail, except where noted.

  1. **Policy snapshot** (as `postgres` via `STAGING_DIRECT_URL`, read-only): from `pg_policies` /
     `pg_policy`, capture `schemaname, tablename, policyname, permissive, roles, cmd, qual,
     with_check` **verbatim** for every policy on `audit_log`, `"PushToken"`, `"SysAdminInvoice"`,
     `"SysAdminInvoiceItem"`, `in_app_notifications`, `stops`, `carrier_documents`,
     `route_template_stops`. Also capture the **total policy count** and the **full list of
     `bypass_rls_policy` rows by table**. The BEFORE snapshot is the SOURCE for both the migration's
     ROLLBACK section and the exact `SysAdminInvoiceItem` policy name — **do not guess that name.**
  2. **Read matrix** (as `app_user` via `STAGING_DATABASE_URL_APP_USER`), for each of `audit_log`,
     `in_app_notifications`, `"PushToken"`, `"SysAdminInvoice"`, `"SysAdminInvoiceItem"`, `stops`,
     `carrier_documents`, `route_template_stops`, under four GUC cases, each on a fresh connection:
       - `GUC = tenantA` -> count of A-owned rows, count of B-owned rows
       - `GUC = tenantB` -> mirror
       - `GUC = ''` (set explicitly with `SELECT set_config('app.current_tenant_id','',false)` — the
         literal value `prisma.ts:71` writes on every new physical connection) -> total visible count
       - `GUC never set` -> total visible count
     Record `{rows:n}` or `{error:{code,message}}`. The `audit_log` + `GUC=''` case is expected to be
     `22P02 invalid input syntax for type uuid: ""` in the BEFORE phase — **quote it verbatim in
     `before.md`**, it is the headline evidence.
  3. **Write probes**, every one inside `BEGIN … ROLLBACK` so staging keeps no residue:
       - `INSERT INTO audit_log` under `GUC = ''` -> record SQLSTATE (22P02 expected BEFORE).
       - `INSERT INTO in_app_notifications (org_id = tenantB)` under `GUC = tenantA` -> expected to
         SUCCEED before (the open door) and be rejected after.
       - `INSERT INTO in_app_notifications (org_id = tenantA)` under `GUC = tenantA` -> expected to
         succeed BOTH times; this is the counter-assertion that the fix does not break the legitimate
         path. Without it the rejection probe passes by saying nothing.
       - `UPDATE "Promo" SET "redemptionCount" = "redemptionCount" + 1 WHERE code = 'RLS597-PROMO'`
         as `app_user` -> expected `42501` BEFORE.
  4. Exit 0 on a completed run. A probe returning an unexpected result is REPORTED, not thrown —
     except a failure to connect or to find the fixture ids, which is exit 1.

**Then run, from `apps/web`:**
```
npx tsx scripts/audit/597-staging-fixtures.ts --seed
npx tsx scripts/audit/597-policy-verify.ts --phase before
```
  </action>
  <verify>
`evidence/before.json` and `evidence/before.md` exist and contain: (a) a verbatim `qual` for
`audit_log.tenant_isolation_policy` showing the `::uuid` cast, (b) the exact policy name of the
`SysAdminInvoiceItem` deny policy, (c) `22P02` for `audit_log` under `GUC=''`, (d) a non-zero
`SysAdminInvoice` visible count under both `GUC=''` and GUC-unset, (e) `42501` on the `Promo` UPDATE,
(f) a `bypass_rls_policy` inventory. `npx tsx scripts/audit/597-staging-fixtures.ts --verify-clean`
exits **1** at this point (fixtures are deliberately present) — confirm it does, which proves the
clean check can actually fail.
  </verify>
  <done>
Two staging-only scripts exist, neither imports `_bootstrap-env`, both refuse the production ref, and
the BEFORE evidence set is on disk with the 22P02 quoted verbatim.
  </done>
</task>

<task type="auto">
  <name>Task 2: Write the migration, apply to staging, capture the AFTER matrix, gate, tear down</name>
  <files>
apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql
.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence/after.json
.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence/after.md
.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence/drift-after.txt
  </files>
  <action>
**A. Write the migration.** Model the header on
`20260912130000_tenant_policy_grant_and_default_privilege_closure/migration.sql`. The header must
state, in its own words: what each statement does and why; that **this migration changes nothing at
runtime today** because the application connects as `postgres` (`rolbypassrls = true`), so a green
deploy is NOT evidence the policies work; that the evidence is the `app_user` matrix on staging; and
the four unscoped `SysAdminInvoice` readers that stop working at the `app_user` cutover, by file and
line (they must move to the admin connection of design doc §3.2 / checklist B5, **which does not
exist yet** — say so plainly):
```
src/app/(admin)/actions/sysadmin-invoices.ts  (17 statements: 26,106,151,166,202,242,243,275,280,
                                               300,305,325,331,356,366,399)
src/app/(admin)/billing/[id]/page.tsx:36
src/app/api/cron/mark-overdue-invoices/route.ts:21
src/lib/email/send-sysadmin-invoice.ts:19
```
The single sysadmin account (1 of 38 `auth.users`, the only one with no tenant claim) has no
`tenantId`, so all of these run GUC-less and depend today on the permissive grant being dropped here.

Statement shape — **every CREATE/DROP POLICY at column zero, top level, no `DO $$` blocks** (the
replay parser is line-anchored and a hidden statement produces false drift):
```sql
-- 1. audit_log — the cast raises 22P02 on the pool's '' default; current_tenant_id() NULLIFs it.
DROP POLICY IF EXISTS tenant_isolation_policy ON audit_log;
CREATE POLICY tenant_isolation_policy ON audit_log
  FOR ALL
  USING (tenant_id = current_tenant_id());

-- 2. PushToken — dead policy: nothing in the repo sets app.current_user_id.
DROP POLICY IF EXISTS user_isolation_policy ON "PushToken";

-- 3. SysAdminInvoice / SysAdminInvoiceItem — "deny" policies that are PERMISSIVE and therefore GRANT.
DROP POLICY IF EXISTS sysadmin_invoices_deny_tenant_users ON "SysAdminInvoice";
DROP POLICY IF EXISTS <exact name from evidence/before.json> ON "SysAdminInvoiceItem";

-- 4. in_app_notifications — WITH CHECK (true) is an open door in.
DROP POLICY IF EXISTS in_app_notifications_insert_policy ON in_app_notifications;
CREATE POLICY in_app_notifications_insert_policy ON in_app_notifications
  FOR INSERT
  WITH CHECK (org_id = current_tenant_id());

-- 5. provision-tenant.ts:97 issues a raw UPDATE "Promo" SET "redemptionCount".
GRANT SELECT, UPDATE ON "Promo" TO app_user;
```
Reproduce `cmd`, `permissive` (`AS RESTRICTIVE` if and only if the snapshot says so) and `roles`
(`TO …` if not PUBLIC) **from `evidence/before.json`**, not from memory. Take the
`SysAdminInvoiceItem` policy name from the snapshot.

Then a clearly marked, **commented-out** `ROLLBACK` section at the end restoring each prior policy
definition **verbatim** from the BEFORE snapshot (all four policies, including the two that are only
dropped) plus `REVOKE UPDATE ON "Promo" FROM app_user;`. Copy the `qual`/`with_check` strings out of
the snapshot rather than retyping them.

**B. Apply to staging.** From `apps/web`, with BOTH variables pinned inline (the `migrate.mjs`
split-target guard refuses mismatched project refs, and `DIRECT_URL` alone would leave the spawned
seeder resolving production's `DATABASE_URL`):
```
DIRECT_URL="$STAGING_DIRECT_URL" DATABASE_URL="$STAGING_DIRECT_URL" node scripts/migrate.mjs
```
Expect **exactly one** migration applied. If it reports more, STOP and report — staging's ledger and
the disk corpus are both 150 and should differ only by this file. Never use `prisma migrate deploy`,
`apply_migration`, `execute_sql` for DDL, or `db push`.

**C. Capture AFTER and gate.** From `apps/web`:
```
npx tsx scripts/audit/597-policy-verify.ts --phase after
DIRECT_URL="$STAGING_DIRECT_URL" DATABASE_URL="$STAGING_DIRECT_URL" npm run audit:rls-policy-drift
npx vitest run src/__tests__/isolation
```
Tee the drift output to `evidence/drift-after.txt`. Then diff before vs after and record in
`after.md`:
  - `audit_log` under `GUC=''`: 22P02 -> 0 rows, no raise. **This is the headline; quote both.**
  - `audit_log` INSERT under `GUC=''`: record the new SQLSTATE. If it is now `42501` rather than a
    raise, say so — that is the derived-`WITH_CHECK` defect made concrete, and it is REPORTED, not
    fixed here.
  - `SysAdminInvoice`/`Item` under `GUC=''` and GUC-unset: N -> 0. Under `GUC=tenantA`: A's rows only.
  - `in_app_notifications`: cross-tenant INSERT accepted -> rejected; own-tenant INSERT accepted both.
  - `"PushToken"`: tenant A still sees its own token and not B's, proving the drop lost nothing.
  - `stops` / `carrier_documents` / `route_template_stops`: A sees A's rows (>0) and none of B's;
    unscoped sees 0 without error. This is the empirical satisfiability proof for the three
    EXISTS-subquery policies whose joined tables themselves carry RLS.
  - `"Promo"` UPDATE: 42501 -> 1 row updated.
  - **bypass untouched**: the `bypass_rls_policy` inventory is identical before and after (86 rows,
    same tables), and the total policy count moved by exactly -3 (183 -> 180).
  - The drift gate exited 0 with 0 missing / 0 unexpected.
  - The 17 isolation tests pass — **and are not evidence**; state why (they compare string literals).

**D. Tear down and prove staging is clean.**
```
npx tsx scripts/audit/597-staging-fixtures.ts --teardown
npx tsx scripts/audit/597-staging-fixtures.ts --verify-clean
```
`--verify-clean` must now exit 0. Record its output in `after.md`. The migration stays applied on
staging; only the fixtures go.
  </action>
  <verify>
`migrate.mjs` reported exactly 1 migration applied. `npm run audit:rls-policy-drift` against staging
exits 0 with 0 missing / 0 unexpected. `evidence/after.md` shows, for `audit_log` under `GUC=''`, a
before of `22P02` and an after of 0 rows with no error. Live `pg_policy` on staging no longer contains
`PushToken.user_isolation_policy` or either SysAdmin deny policy, and still contains all 86
`bypass_rls_policy` rows. `597-staging-fixtures.ts --verify-clean` exits 0.
  </verify>
  <done>
The migration file is on disk and applied to staging; the AFTER matrix proves each of the five changes
by observed row counts and SQLSTATEs; the drift gate is green; staging carries zero fixture rows;
production was never written.
  </done>
</task>

<task type="auto">
  <name>Task 3: Audit doc, closure table, and the remaining-work report</name>
  <files>
docs/audits/rls-policy-satisfiability-fixes.md
  </files>
  <action>
Write the audit doc a human will read **before applying this migration to production**. Sections:

1. **What changed** — the five statements, one line each, with the reason.
2. **Evidence** — the before/after table from `evidence/after.md`, with the `audit_log` 22P02 quoted
   verbatim in both phases. State plainly that the drift detector compares NAMES only and therefore
   validates the name-set, never the rewrite; and that the 17 isolation tests are vacuous string
   comparisons that pass identically before and after.
3. **Production apply runbook** — that the migration is inert on production today (the app connects as
   `postgres`, `rolbypassrls = true`); the exact `migrate.mjs` invocation with both variables pinned;
   the expected "1 migration applied"; the post-apply check (`pg_policy` count 183 -> 180,
   `bypass_rls_policy` still 86, drift gate 0/0); and the commented-out ROLLBACK section's location.
4. **What breaks at the `app_user` cutover, by file and line** — the four unscoped `SysAdminInvoice`
   readers listed in Task 2A. They see zero rows once the permissive grant is gone. They need the
   admin connection of design doc §3.2 / checklist B5, **which does not exist**. Name that as the
   blocker; do not imply it is scheduled.
5. **Closure table for the 11 BROKEN_POLICY sites** of design doc §1.3 — every row states CLOSED,
   PARTIAL or REMAINS with a reason:
   | § | Gap | Sites | Status |
   |---|---|---|---|
   | (a) | `"Tenant"` has no UPDATE/INSERT/DELETE policy | 2 | **REMAINS** — out of scope; not preflighted, and the 4th caller (`(admin)/actions/tenants.ts`) needs the admin connection. Also note the 7 non-bypass `Tenant` writers outside every prior count, incl. `settings/operations/actions.ts:40`, which fails today on a correctly-scoped connection because `tenant_self_read` is `FOR SELECT`. |
   | (b) | `audit_log` | 1 | **PARTIAL** — the 22P02 cast is closed and proven. The derived `WITH CHECK` still contradicts `writeAuditLog`'s contract of writing rows whose tenant differs from the connection; quote the measured post-fix INSERT SQLSTATE. Closing it means splitting into `FOR SELECT USING (…)` + `FOR INSERT WITH CHECK (true)` per §3.1 item 4. |
   | (c) | `SupportTicket` null-tenant rows | 4 | **REMAINS — product decision.** Reproduce the orchestrator's findings: the 7 null-tenant rows and the 7 `submittedBy` FK orphans are the same rows; one hard-deleted submitter; 0 TicketMessages; 3 OPEN (TKT-0038/0044/0061), 4 CLOSED (TKT-0001/0036/0037/0067); reachable only via `getAllTickets`, which works solely on BYPASSRLS. No policy can admit them "for their submitter" because the submitter does not exist. Also flag the false comment at `support-tickets.ts:239-240`. |
   | (d) | `stops` / `carrier_documents` / `route_template_stops` | 4 | **CLOSED — and the design doc's premise is stale.** All three already carry `tenant_isolation_policy` on both databases; this task proved the EXISTS joins satisfiable as `app_user` rather than shipping DDL. Note they carry **no** `bypass_rls_policy`, so the bypass line at those four call sites is already a no-op. |
6. **The four "incorrect policy" items of §2** — `PushToken` CLOSED, SysAdmin deny pair CLOSED,
   `in_app_notifications_insert_policy` CLOSED, `"Promo"` grant CLOSED. Add the one deliberately
   untouched: `in_app_notifications_select_policy` and `_update_policy` key on
   `auth.jwt() ->> 'org_id'`, which a Prisma connection never sets, so both are dead — permissive and
   harmless, because `tenant_isolation_policy` covers both commands. Left alone; reported.
7. **Why no RESTRICTIVE policy was added** — restrictive policies are AND'd with ALL permissive
   policies including `bypass_rls_policy`, so a restrictive tenant predicate on `SysAdminInvoice`
   would silently neuter the bypass on that table. Dropping the granting policy reaches the same
   intent without touching the thing this task must not touch.
8. **Environment hazard worth keeping** — `scripts/_bootstrap-env.ts:53-55` repoints `DATABASE_URL` to
   `DIRECT_URL` unconditionally, and every env file points `DIRECT_URL` at production. Pinning only
   `DATABASE_URL` inline runs the script against production. Both variables, every time.
  </action>
  <verify>
`docs/audits/rls-policy-satisfiability-fixes.md` contains all 11 BROKEN_POLICY sites with an explicit
CLOSED/PARTIAL/REMAINS verdict and a reason for each, the four named `SysAdminInvoice` readers with
file and line, and the verbatim before/after `audit_log` SQLSTATE evidence.
  </verify>
  <done>
A reviewer can decide whether to apply the migration to production from this document alone, and knows
exactly what still breaks and why.
  </done>
</task>

</tasks>

<verification>
- `apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql` exists,
  contains no `DO $$` block around any policy statement, and every CREATE/DROP POLICY starts at
  column zero.
- `DIRECT_URL="$STAGING_DIRECT_URL" DATABASE_URL="$STAGING_DIRECT_URL" npm run audit:rls-policy-drift`
  exits 0 with 0 missing / 0 unexpected.
- `npx vitest run src/__tests__/isolation` passes (17 tests) — recorded, explicitly not evidence.
- `npx tsc --noEmit` is clean in `apps/web`. **Check the gate is not blind**: if the only errors are
  syntax errors, or are all in files this task did not touch (especially under `.next/`), delete
  `apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` and re-run; probe with a
  deliberate `const x: number = 'y'` in one of the new scripts and confirm tsc reports THAT error
  before believing a clean run, then delete the probe.
- `npx tsx scripts/audit/597-staging-fixtures.ts --verify-clean` exits 0.
- Production (`oqdhberkghtnszrkdvfm`) was never connected to for a write. Confirm by grepping the two
  new scripts for the production-ref guard and by confirming both `migrate.mjs` invocations printed the
  staging ref.
</verification>

<success_criteria>
- Five policy/grant changes shipped in one idempotent migration file with a verbatim commented-out
  ROLLBACK section.
- `audit_log` under `app.current_tenant_id = ''` goes from `22P02 invalid input syntax for type uuid:
  ""` to zero rows with no error, quoted both ways.
- `SysAdminInvoice`/`Item` go from fully visible on an unscoped connection to zero rows, with tenant A
  still seeing A's rows.
- `in_app_notifications` rejects a cross-tenant INSERT and still accepts an own-tenant one.
- `"Promo"` UPDATE as `app_user` goes 42501 -> 1 row.
- `stops`, `carrier_documents`, `route_template_stops` proven satisfiable by a real `app_user`
  connection against seeded rows.
- `bypass_rls_policy` untouched: 86 rows, same tables, before and after.
- Staging returned to zero rows; production never written.
- Every one of the 11 BROKEN_POLICY sites carries a CLOSED / PARTIAL / REMAINS verdict with a reason,
  in both the audit doc and the task summary.
</success_criteria>

<output>
After completion, create
`.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/597-SUMMARY.md`.

It MUST carry:
1. The 11-site closure table (CLOSED / PARTIAL / REMAINS + reason) and the four §2 incorrect-policy
   items.
2. The `audit_log` before/after SQLSTATE evidence, quoted.
3. The named readers that break at the `app_user` cutover and the fact that the admin connection they
   need does not exist.
4. The `SupportTicket` product decision, stated as blocked on a human choice, with the four options.
5. A statement that the 17 isolation tests are vacuous and that the drift detector validates names
   only — neither is evidence for the rewrite.
6. Confirmation that the migration is applied to STAGING ONLY and is the artefact a human later
   applies to production.
</output>
