---
phase: quick-599
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql
  - apps/web/scripts/audit/599-policy-verify.ts
  - apps/web/scripts/audit/rls-policy-canonical.json
  - apps/web/tests-db/rls-isolation/env.ts
  - apps/web/tests-db/rls-isolation/behaviour.test.ts
  - apps/web/tests-db/rls-isolation/coverage.test.ts
  - apps/web/tests-db/rls-isolation/uncovered-tables.json
  - apps/web/tests-db/rls-isolation/coverage-report.json
  - apps/web/src/lib/security/audit-log.ts
  - docs/audits/tenant-audit-automation-policy-closure.md
  - docs/audits/bypass-replacement-design.md
  - docs/audits/policy-satisfiability-sweep.md
  - .planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/
  - .planning/quick/599-close-the-three-dark-command-rls-policy-/599-SUMMARY.md
  - .planning/STATE.md
  - CLAUDE.md

must_haves:
  truths:
    - "A tenant-scoped app_user connection can UPDATE its own Tenant row on staging after the migration and could not before (the saveOperationsSettings proof), and still cannot touch another tenant's row."
    - "A bootstrap connection (GUC unset or '') can INSERT a Tenant; a tenant-scoped one is refused by the same policy."
    - "writeAuditLog's cross-tenant contract holds: an INSERT naming tenant B under tenant A's GUC succeeds after the migration and was 42501 before, while a SELECT of tenant B's audit rows under tenant A still returns 0."
    - "audit_log is append-only for app_user in BOTH layers: the policy set has no UPDATE/DELETE policy AND the grant is revoked, so both raise 42501 rather than returning a silent 0."
    - "AutomationRule INSERT and UPDATE can no longer name or mutate a SYSTEM/foreign-tenant row, while SELECT of the 6 SYSTEM rows is unchanged."
    - "AutomationRule DELETE of SYSTEM rows REMAINS OPEN and is measured and reported as such, not claimed closed."
    - "bypass_rls_policy is untouched: 86 rows before and after, identical sorted table list."
    - "npm run test:rls-isolation is green, and the audit_log write assertion it now carries is strictly stronger than the one it replaces."
    - "npm run audit:rls-policy-drift against staging exits 0 with 0 missing / 0 unexpected AND zero body-level definition drift."
    - "Staging is returned to its pre-task state apart from the migration itself: zero fixture tenants, and AutomationRule still holds exactly 6 SYSTEM rows."
  artifacts:
    - path: "apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql"
      provides: "the five statements, the cutover-breakage inventory, the AutomationRule DELETE residue, and a verbatim commented rollback block"
      contains: "tenant_bootstrap_insert"
    - path: "apps/web/scripts/audit/599-policy-verify.ts"
      provides: "before/after app_user probe matrix on staging, four ground rules, production-ref refusal"
    - path: "docs/audits/tenant-audit-automation-policy-closure.md"
      provides: "the evidence record, the production apply runbook, the closure table against sweep blockers 1 and 4"
    - path: ".planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/before.json"
      provides: "pre-change pg_policies snapshot and pre-change probe results"
    - path: ".planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/after.json"
      provides: "post-change snapshot and probe results"
  key_links:
    - from: "apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql"
      to: "apps/web/scripts/audit/rls-policy-canonical.json"
      via: "npm run audit:rls-canonicalise regenerates the artefact so the body-level drift gate has an entry for every new/changed body"
      pattern: "tenant_bootstrap_insert"
    - from: "apps/web/tests-db/rls-isolation/env.ts"
      to: "apps/web/tests-db/rls-isolation/behaviour.test.ts"
      via: "WRITE_PROBE_TARGETS loses audit_log and APPEND_ONLY_WRITE_PROBE_TARGETS gains it, with a union assertion so neither list can quietly lose a table"
      pattern: "APPEND_ONLY_WRITE_PROBE_TARGETS"
---

<objective>
Close three dark-command RLS gaps on the three tables the satisfiability sweep named, with one
idempotent migration applied to **STAGING ONLY**, and prove each one both directions as `app_user`
against seeded rows.

**Purpose.** `"Tenant"` has grants for INSERT/UPDATE/DELETE and no policy for any of them, so at the
`app_user` cutover eleven write sites break — one of them, `saveOperationsSettings`, is a live owner
surface already inside the wrapper migration's 456 units. `audit_log`'s derived `WITH CHECK`
contradicts `writeAuditLog`'s own documented contract. `AutomationRule`'s `scope = 'SYSTEM'` read
branch is reused as a write check, so any tenant-scoped connection may forge or rewrite every
platform automation rule.

**Output.** One migration, one verification instrument, a before/after evidence set quoted in a new
audit document, a strictly stronger `audit_log` assertion in the real RLS isolation suite, and three
false "append-only"/"not a silent zero" claims corrected in source and in the predecessor docs.

**This migration changes nothing at runtime today.** The application connects as `postgres`
(`rolbypassrls = true`), so every policy below is decorative until `DATABASE_URL` moves to `app_user`.
A green deploy is not evidence. The only evidence is an `app_user` connection against known rows.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
</execution_context>

<context>
@docs/audits/policy-satisfiability-sweep.md
@docs/audits/rls-policy-satisfiability-fixes.md
@apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql
@apps/web/scripts/audit/597-policy-verify.ts
@apps/web/scripts/audit/597-staging-fixtures.ts
@apps/web/tests-db/rls-isolation/env.ts
@apps/web/tests-db/rls-isolation/behaviour.test.ts
@apps/web/tests-db/rls-isolation/coverage.test.ts
@apps/web/src/lib/security/audit-log.ts

`docs/audits/bypass-replacement-design.md` is 963 lines — read §3.1 and §4 only, with `sed -n`.
</context>

<established_facts>

Measured by the orchestrator against live databases before this plan was written. **Do not re-derive
these**, but DO re-assert anything listed as a precondition in Task 2.

1. Production and staging are aligned: both 180 policies, 86 `bypass_rls_policy`, 91 RLS-enabled
   tables, identical digest `22617e5611ecb5fcfba56938b7dc0fa8`.
2. Both staging URLs authenticate, from `apps/web/.env.staging`:
   `STAGING_DIRECT_URL` → `postgres`, `rolbypassrls = true`, port 5432.
   `STAGING_DATABASE_URL_APP_USER` → `app_user`, `rolbypassrls = false`, port 5432.
3. Current policies on the three targets (staging, verbatim from `pg_policies`):
   - `"Tenant"`: `bypass_rls_policy` ALL `USING (current_setting('app.bypass_rls'::text, true) = 'on'::text)`;
     `tenant_self_read` SELECT `USING (id = current_tenant_id())`. `with_check` NULL on both.
   - `audit_log`: `bypass_rls_policy` ALL (same body); `tenant_isolation_policy` ALL
     `USING (tenant_id = current_tenant_id())`, `with_check` NULL.
   - `"AutomationRule"`: `bypass_rls_policy` ALL (same body); `tenant_isolation_policy` ALL
     `USING ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))`,
     `with_check` NULL.
4. `app_user` grants on all three: `SELECT, INSERT, UPDATE, DELETE`.
5. Staging row counts: `"Tenant"` 0, `audit_log` 0, `"AutomationRule"` 6 (all `scope='SYSTEM'`, all
   `tenantId IS NULL`).
6. `audit_log` columns: `id` uuid default `gen_random_uuid()`, `tenant_id` uuid NOT NULL, `user_id`
   uuid NOT NULL (FK to `"User"`), `action` text NOT NULL, `resource_type` text NOT NULL,
   `resource_id` uuid NOT NULL, `field_name`/`ip_address`/`user_agent` nullable, `created_at`
   timestamptz default `now()`.
7. **DEC-14.** `audit_log_action_check` admits EXACTLY eight values: `VIEW_PII`, `VIEW_PII_DENIED`,
   `DOWNLOAD_DOCUMENT`, `DOWNLOAD_DOCUMENT_DENIED`, `UPDATE_RESTRICTED`, `DELETE_RESTRICTED`,
   `EXPORT`, `RATE_LIMIT_HIT`. Any other action string is a 23514 on insert. Probe markers go in
   `resource_type`, which carries no CHECK.
8. **The design doc is WRONG and this task corrects it.** `bypass-replacement-design.md` §3.1 item 4
   says "`audit_log` already carries `REVOKE UPDATE, DELETE`". It does not — `app_user` holds UPDATE
   and DELETE on staging (fact 4). `src/lib/security/audit-log.ts:5` asserts the same false thing.
   The design's justification for `WITH CHECK (true)` *depends* on that revoke being real, which is
   why statement 5 exists.
9. The only application writer of `audit_log` is `prisma.auditLog.create` in
   `src/lib/security/audit-log.ts`. A grep over `src scripts prisma` found **no** application UPDATE
   or DELETE. `scripts/audit/597-staging-fixtures.ts:288` deletes audit rows but connects as
   `postgres` via `STAGING_DIRECT_URL`, so an `app_user` revoke does not affect it.
10. All six `"AutomationRule"` call sites use the BARE `prisma` client, never a tenant client:
    `(admin)/actions/automations.ts:20,42,70,97` (all behind `requireAdminAccess()`),
    `api/cron/automations/route.ts:135`, `lib/automations/evaluator.ts:72`. The only write is
    `:70` `toggleRuleActive` → `prisma.automationRule.update({ data: { isActive } })`. **Zero of the
    456 `withTenantContext` units touch it.** No `create` and no `delete` anywhere in application code.
11. The eleven `"Tenant"` write sites, already enumerated and accepted by the user:
    - `tenant_self_update` serves: `(owner)/settings/operations/actions.ts:40`,
      `lib/onboarding/hydrate-tenant.ts:41`, `api/email-confirm/[token]/route.ts:67`.
    - `tenant_bootstrap_insert` serves: `lib/onboarding/provision-tenant.ts:59`,
      `lib/db/repositories/tenant.repository.ts:35`.
    - **No policy, deliberately:** `(admin)/actions/tenants.ts:98,190,229,432,542,625` — sysadmin
      acting on *other* tenants, routed by design §4.4 to the admin connection (checklist item B5,
      not built). **No DELETE policy on `"Tenant"`, deliberately.**

</established_facts>

<discovered_by_planning>

Four things the brief did not name. Each is load-bearing; none changes the five statements.

### D1. Keeping the `audit_log` SELECT policy's NAME is not cosmetic

`tests-db/rls-isolation/coverage.test.ts:82-89` enumerates "every tenant-scoped table" with

```sql
SELECT c.relname FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
 WHERE n.nspname = 'public' AND p.polname = 'tenant_isolation_policy'
```

If the split renames `audit_log`'s policy, `audit_log` leaves that list, leaves `rows`, and the test
`'every behaviour target is classified COVERED'` — which filters `rows` by target key — then finds
**nothing to check and passes vacuously**, while `coverage-report.json` silently loses a table.

**Therefore: the SELECT half KEEPS the name `tenant_isolation_policy`** (it *is* the tenant isolation
policy for audit_log, now narrowed to SELECT) and the INSERT half is a new name,
`audit_log_append_policy`. This is a measured consequence of an existing enumeration, not a style
preference, and it must be stated in the migration header so a later rename is a decision rather than
an accident. Task 3 additionally adds the one assertion that makes the vacuity impossible in future.

### D2. `WITH CHECK` does not apply to DELETE — statement 4 is PARTIAL, and must say so

PostgreSQL applies `WITH CHECK` to INSERT and to the *new* row of UPDATE. DELETE is checked against
`USING` alone. Statement 4 keeps `USING ((scope = 'SYSTEM') OR ("tenantId" = current_tenant_id()))`,
so **after this migration a tenant-scoped connection may still DELETE all 6 SYSTEM rows.** INSERT and
UPDATE are closed; DELETE is not.

It cannot be closed inside the approved shape: permissive policies are OR'd, so an extra `FOR DELETE`
policy can only widen; `AS RESTRICTIVE` is forbidden (it would AND with `bypass_rls_policy` and
silently neuter it — quick-597 §8); and narrowing the `FOR ALL` `USING` would also narrow the READ,
which sweep §6 calls defensible and intended. The fix, named but **not built here**, is to split
`AutomationRule` by command: `FOR SELECT` keeping the SYSTEM branch, plus `FOR INSERT` / `FOR UPDATE`
/ `FOR DELETE` without it.

**This must be MEASURED (a probe), reported in the migration header, and marked PARTIAL in the
closure table.** Do not describe blocker 4 as closed.

### D3. An RLS-refused UPDATE or DELETE is a SILENT ZERO, not a 42501 — and the sweep says otherwise

`policy-satisfiability-sweep.md` §4.1 states that a `"Tenant"` write under `app_user` is
"an `ERROR 42501 new row violates row-level security policy`, not a silent zero". That is true for
**INSERT** (no policy → the check fails → 42501). For **UPDATE and DELETE** with no applicable policy,
`USING` filters every row away and the statement affects **0 rows with no error**.

Two consequences:
- **Every 0-row write probe needs a counter-read in the same transaction** proving the row is there.
  Without it, "0 rows" is indistinguishable from "the row does not exist" and the probe says nothing.
- If the before-phase measurement confirms a silent 0, **correct §4.1 / §5.2 of the sweep doc in
  place**, quoting the measured SQLSTATE and row count. Measure first; do not correct a document on
  the strength of this paragraph.

### D4. No fixture-script change is needed, and `AutomationRule`'s 6 rows are NOT disposable

`597-staging-fixtures.ts` already seeds the two tenants (`"Tenant"` rows) and one `audit_log` row per
tenant. `"AutomationRule"`'s 6 SYSTEM rows are real production-parity staging data. **Do not fork or
extend the fixture script.** Every `AutomationRule` probe runs inside `BEGIN … ROLLBACK` against
those real rows, and the run must end with a positive re-read asserting **exactly 6 rows, all
`scope='SYSTEM'`, all `tenantId IS NULL`** — the same shape as the suite's "nothing was actually
written" check, and non-optional because a DELETE probe is aimed at them.

</discovered_by_planning>

<tasks>

<task type="auto">
  <name>Task 1: Build the 599 instrument, snapshot staging, capture the BEFORE matrix, and write the migration</name>

  <files>
apps/web/scripts/audit/599-policy-verify.ts
apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql
.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/before.json
.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/before.md
  </files>

  <action>
**1a. Read the column shapes off the database, never off `schema.prisma`.**

Before writing a single probe, run against `STAGING_DIRECT_URL` and record in the evidence file:

```sql
SELECT table_name, column_name, is_nullable, column_default
  FROM information_schema.columns
 WHERE table_schema='public' AND table_name IN ('Tenant','AutomationRule','audit_log')
 ORDER BY table_name, ordinal_position;

SELECT conrelid::regclass AS tbl, conname, pg_get_constraintdef(oid)
  FROM pg_constraint
 WHERE conrelid IN ('"Tenant"'::regclass,'"AutomationRule"'::regclass,'audit_log'::regclass)
   AND contype = 'c';

SELECT enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
 WHERE t.typname='AutomationScope' ORDER BY e.enumsortorder;
```

DEC-14 discipline: a CHECK you did not read is a 23514 waiting. Expect `"Tenant"` to need
`name`, `slug` (unique) and `"updatedAt"` supplied explicitly — `@updatedAt` is Prisma-level with no
DB default, which is exactly the trap `"PushToken"` set in quick-597. Expect `"AutomationRule"` to
need `key` (unique), `name`, `triggerEvent`, `actionsJson`, `"updatedAt"`. **Confirm, do not assume.**

**1b. Create `apps/web/scripts/audit/599-policy-verify.ts`**, modelled on `597-policy-verify.ts`.
Copy its structure and its four ground rules verbatim into the header:

1. Nothing is swallowed — every probe records `{rows:n}` or `{error:{code,message}}` with the SQLSTATE
   and the full server message.
2. Every write probe runs inside `BEGIN … ROLLBACK`. There is **no `COMMIT` statement in the file**.
3. One FRESH `pg.Client` per GUC case, each case's work inside ONE transaction (Supavisor is
   transaction-mode: outside a transaction consecutive statements may land on different backends and a
   session-scope `set_config` would not be observed). Each individual probe is fenced with a SAVEPOINT.
4. This is a REPORT, not a gate. Only a failure to connect or to read the fixture ids exits 1.

Environment handling, copied exactly: **never import `scripts/_bootstrap-env`**; load
`apps/web/.env.staging` explicitly; refuse if either resolved URL contains the production ref
`oqdhberkghtnszrkdvfm` or fails to contain the staging ref `wyixpgunnjmzguhggocz`; never print a
connection string. Read fixture ids from `apps/web/.rls-fixture-ids.json` (gitignored runtime
handshake) and **refuse if absent** rather than seeding silently.

CLI: `--phase before | after`, plus `--diff`. Writes
`.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/<phase>.{json,md}`.

**Snapshot section** (as `postgres`, read-only), recorded in both phases:
- `pg_policies` rows for `Tenant`, `audit_log`, `AutomationRule` — full
  `(policyname, permissive, roles, cmd, qual, with_check)`.
- `SELECT count(*) FROM pg_policy` — the total.
- The full `bypass_rls_policy` list as a **sorted table array**, not a count (a count alone would miss
  a swap).
- `app_user` grants on the three tables from `information_schema.role_table_grants`.
- The `AutomationRule` census: `count(*)`, `count(*) FILTER (WHERE scope='SYSTEM')`,
  `count(*) FILTER (WHERE "tenantId" IS NULL)`.

**Probe matrix** (as `app_user`). Every row below is required in BOTH phases. Two-direction rule:
each refusal is paired with the legitimate operation that must still succeed, because a rejection
test alone passes by saying nothing.

`"Tenant"` — A and B are the two fixture tenants:

| id | statement | GUC |
|---|---|---|
| `Tenant.insert@guc-empty` | `INSERT INTO "Tenant" (name, slug, "updatedAt") VALUES ('RLS599 bootstrap','rls599-bootstrap',now())` | `''` |
| `Tenant.insert@guc-A` | the same INSERT (different slug) | tenant A |
| `Tenant.update-own@guc-A` | `UPDATE "Tenant" SET "requirePreTripInspection" = NOT "requirePreTripInspection" WHERE id = <A>` | tenant A |
| `Tenant.update-own.counter-read@guc-A` | `SELECT count(*) FROM "Tenant" WHERE id = <A>` | tenant A |
| `Tenant.update-cross@guc-A` | the same UPDATE targeting `<B>` | tenant A |
| `Tenant.update-cross.counter-read@postgres` | `<B>` exists — read as `postgres`, recorded once | — |
| `Tenant.delete-own@guc-A` | `DELETE FROM "Tenant" WHERE id = <A>` | tenant A |

The counter-reads are D3: a 0-row UPDATE/DELETE under RLS is silent, so without them the zero proves
nothing. `requirePreTripInspection` is chosen because it is the exact column
`saveOperationsSettings` writes.

`audit_log` — `action` is always one of the eight legal values (use `'EXPORT'`); the marker lives in
`resource_type` as `RLS599_resource`:

| id | statement | GUC |
|---|---|---|
| `audit_log.insert-own@guc-A` | INSERT `tenant_id = <A>`, `user_id = <A owner>` | tenant A |
| `audit_log.insert-cross@guc-A` | INSERT `tenant_id = <B>`, `user_id = <B owner>` | tenant A |
| `audit_log.insert@guc-empty` | INSERT `tenant_id = <A>`, `user_id = <A owner>` | `''` |
| `audit_log.select-own@guc-A` | count over tenant A's fixture ids | tenant A |
| `audit_log.select-cross@guc-A` | count over tenant B's fixture ids | tenant A |
| `audit_log.update-own@guc-A` | `UPDATE audit_log SET user_agent = 'RLS599' WHERE id = ANY(<A ids>)` | tenant A |
| `audit_log.delete-own@guc-A` | `DELETE FROM audit_log WHERE id = ANY(<A ids>)` | tenant A |
| `audit_log.delete-cross@guc-A` | the same against `<B ids>` | tenant A |

`"AutomationRule"` — the 6 real SYSTEM rows, all probes rolled back:

| id | statement | GUC |
|---|---|---|
| `AutomationRule.select-system@guc-A` | `SELECT count(*) WHERE scope='SYSTEM'` | tenant A |
| `AutomationRule.update-system@guc-A` | `UPDATE "AutomationRule" SET "isActive" = NOT "isActive" WHERE scope='SYSTEM'` | tenant A |
| `AutomationRule.update-system@guc-empty` | the same | `''` |
| `AutomationRule.insert-own@guc-A` | INSERT with `scope='TENANT'`, `"tenantId"=<A>`, unique `key` | tenant A |
| `AutomationRule.insert-system@guc-A` | INSERT with `scope='SYSTEM'`, `"tenantId"=NULL` | tenant A |
| `AutomationRule.insert-cross@guc-A` | INSERT with `scope='TENANT'`, `"tenantId"=<B>` | tenant A |
| `AutomationRule.delete-system@guc-A` | `DELETE FROM "AutomationRule" WHERE scope='SYSTEM'` | tenant A |

`delete-system` is D2: it is expected to report 6 in BOTH phases, and that unchanged number is the
finding, not a failure.

**Post-run integrity re-read**, as `postgres`, in both phases, and a hard exit 1 if it fails:
`"AutomationRule"` holds exactly **6** rows, all `scope='SYSTEM'`, all `tenantId IS NULL`. The rows
are production-parity staging data and a DELETE probe was aimed at them; the rollback is structural,
but a loss here is unrecoverable, so it is verified rather than trusted.

Markdown rendering: mirror `597-policy-verify.ts`'s `renderMd` — verbatim policy bodies, a probe
table with `fmtProbe` showing `ERROR [SQLSTATE] message` in full.

**1c. Seed fixtures and capture BEFORE.** From `apps/web`:

```
npx tsx scripts/audit/597-staging-fixtures.ts --seed
npx tsx scripts/audit/599-policy-verify.ts --phase before
```

Do **not** modify `597-staging-fixtures.ts` (D4).

**1d. Write the migration**, only after `before.json` exists — the rollback block is copied verbatim
out of it.

Path: `apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql`
(sorts after `20260913120000`).

Five statements, in this order, **every `CREATE POLICY` / `DROP POLICY` starting at column zero in
plain static SQL** — `scripts/audit/rls-policy-replay.ts`'s `POLICY_STATEMENT_RE` is line-anchored and
structurally cannot see SQL inside a `DO` block, so a hidden policy goes live and is then reported as
UNEXPECTED. Each `CREATE` is preceded by `DROP POLICY IF EXISTS` — there is no `CREATE POLICY IF NOT
EXISTS` in Postgres, so drop-then-create IS the idempotency mechanism.

```sql
DROP POLICY IF EXISTS tenant_bootstrap_insert ON "Tenant";
CREATE POLICY tenant_bootstrap_insert ON "Tenant"
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL);

DROP POLICY IF EXISTS tenant_self_update ON "Tenant";
CREATE POLICY tenant_self_update ON "Tenant"
  AS PERMISSIVE FOR UPDATE TO public
  USING (id = current_tenant_id())
  WITH CHECK (id = current_tenant_id());

DROP POLICY IF EXISTS tenant_isolation_policy ON audit_log;
CREATE POLICY tenant_isolation_policy ON audit_log
  AS PERMISSIVE FOR SELECT TO public
  USING (tenant_id = current_tenant_id());

DROP POLICY IF EXISTS audit_log_append_policy ON audit_log;
CREATE POLICY audit_log_append_policy ON audit_log
  AS PERMISSIVE FOR INSERT TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS tenant_isolation_policy ON "AutomationRule";
CREATE POLICY tenant_isolation_policy ON "AutomationRule"
  AS PERMISSIVE FOR ALL TO public
  USING ((scope = 'SYSTEM'::"AutomationScope") OR ("tenantId" = current_tenant_id()))
  WITH CHECK ("tenantId" = current_tenant_id());
```

Statement 5, the REVOKE, in a `DO` block guarded on `pg_roles` with `RAISE NOTICE` and `RETURN` —
never `RAISE EXCEPTION`, because the corpus must replay from zero (quick-593), exactly as quick-597's
grant block does:

```sql
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    RAISE NOTICE 'quick-599: role app_user does not exist — skipping the audit_log REVOKE...';
    RETURN;
  END IF;
  REVOKE UPDATE, DELETE ON audit_log FROM app_user;
END
$$;
```

**The header must carry all of the following.** It is the document a reader meets first and the one
place a later reader will look before applying this to production.

- Per-statement: what changes, the prior definition **verbatim from the before snapshot**, and why.
- **INERT TODAY** — the app connects as `postgres` with `rolbypassrls = true`; a green deploy is not
  evidence of any of it; the evidence is the `app_user` matrix, path given.
- **Why statement 5 is here and is not scope creep.** The design doc's argument for
  `WITH CHECK (true)` rests on append-only being real; `bypass-replacement-design.md` §3.1 item 4 and
  `src/lib/security/audit-log.ts:5` both assert it is; **measurement says `app_user` holds UPDATE and
  DELETE**. Without the revoke the two layers disagree — DELETE would be refused by *absence of
  policy*, a silent 0 rows, while the grant still says `app_user` may delete. Nothing in the
  application updates or deletes `audit_log` (fact 9), and `597-staging-fixtures.ts`'s cleanup
  connects as `postgres`, so it is unaffected.
- **Why the `audit_log` SELECT half keeps the name `tenant_isolation_policy`** — D1, with the
  `coverage.test.ts` enumeration quoted and the vacuous-pass consequence spelt out.
- **What breaks at the `app_user` cutover, by file and line:**
  - `(admin)/actions/automations.ts:70` `toggleRuleActive` — the only `AutomationRule` write in the
    repo. Every SYSTEM row has `tenantId IS NULL`, and `NULL = current_tenant_id()` is NULL at **every**
    GUC value including `''`, so after this migration no `app_user` connection can toggle a platform
    rule at all. Routes to the admin connection, checklist **B5, which does not exist**.
  - `(admin)/actions/tenants.ts:98,190,229,432,542,625` — deliberately unserved by any policy; B5.
  - No DELETE policy on `"Tenant"`, deliberately (design §3.1 #3): a tenant must not delete itself.
- **The residue, stated as a residue (D2):** `WITH CHECK` does not apply to DELETE, so a
  tenant-scoped connection may still DELETE all 6 SYSTEM `AutomationRule` rows through the
  `scope = 'SYSTEM'` branch of `USING`. Measured, both phases, probe `AutomationRule.delete-system`.
  It cannot be closed here — a permissive `FOR DELETE` policy can only widen, `AS RESTRICTIVE` is
  forbidden, and narrowing the `FOR ALL` `USING` would narrow the intended read. The fix is a
  four-policy command split, named and not built.
- **No `AS RESTRICTIVE` anywhere, and why** (quick-597 §8): a restrictive policy ANDs with
  `bypass_rls_policy` and would neuter it while still appearing in `pg_policies` at 86.
- **`bypass_rls_policy` is untouched** on every table; asserted as a sorted table list, not a count.
- **`"SupportTicket"` is untouched** — the 7 null-tenant rows are a product decision.
- **`_prisma_migrations` is untouched, and the dependency is recorded here so whoever moves
  `DIRECT_URL` finds it:** it carries RLS enabled with zero policies and no `app_user` grant, which is
  safe ONLY while `DIRECT_URL` stays on a privileged role. `apps/web/vercel.json`'s `buildCommand`
  runs `node scripts/migrate.mjs`, and that script resolves `DIRECT_URL || DATABASE_URL`; if the
  cutover moves both, every build fails at the migration step.
- **Idempotency and the replay parser** — the `DROP … IF EXISTS` mechanism, the line-anchored regex,
  and the fact that the commented rollback block is safe because its lines begin with `-`.
- **The apply command actually used**, with both variables pinned, and why both:
  `scripts/_bootstrap-env.ts:53-55` repoints `DATABASE_URL` at `DIRECT_URL` unconditionally and every
  env file points `DIRECT_URL` at PRODUCTION; `migrate.mjs` spawns `seed-starter-playbooks.ts`, which
  resolves a bare `DATABASE_URL` and carries an `assertSameProjectRef()` guard.

Finally, a **commented rollback block** at the end, every definition copied **verbatim** out of
`evidence/before.json`, restoring: `audit_log.tenant_isolation_policy` as `FOR ALL USING (tenant_id =
current_tenant_id())` with the new `audit_log_append_policy` dropped; `AutomationRule
.tenant_isolation_policy` as `FOR ALL` with no `WITH CHECK`; the two `"Tenant"` policies dropped;
`GRANT UPDATE, DELETE ON audit_log TO app_user`. Prefixed with the standing warning: copy it into a
psql session, do **NOT** uncomment it in place — `migrate.mjs` skips by `migration_name` and would
never re-run the file, while the drift replay WOULD see the uncommented statements and report the
policies as expected-but-missing.
  </action>

  <verify>
- `evidence/before.json` and `before.md` exist and contain, for each of the three tables, the verbatim
  `pg_policies` bodies from established fact 3, a total `pg_policy` count of **180**, and **86**
  `bypass_rls_policy` entries.
- The before matrix shows, at minimum: `Tenant.update-own@guc-A` = **0 rows or 42501** (record which —
  D3) with its counter-read = **1**; `audit_log.insert-cross@guc-A` = **ERROR [42501]**;
  `audit_log.delete-own@guc-A` = **1 row** and `audit_log.update-own@guc-A` = **1 row** (this pair is
  the direct disproof of the design doc's REVOKE claim); `AutomationRule.update-system@guc-A` =
  **6 rows**; `AutomationRule.insert-system@guc-A` = **accepted**.
- `grep -nE "query\(\s*'COMMIT" apps/web/scripts/audit/599-policy-verify.ts` returns nothing.
- `grep -n "_bootstrap-env" apps/web/scripts/audit/599-policy-verify.ts` returns nothing.
- `grep -cE "^[ \t]*(CREATE|DROP) POLICY" migration.sql` returns **10** (5 drops + 5 creates), and
  `grep -n "DO \$\$" migration.sql` shows the `DO` block contains only the REVOKE.
- `grep -n "AS RESTRICTIVE" migration.sql` returns nothing.
- The migration has NOT been applied yet — `_prisma_migrations`' newest row is still
  `20260913120000_rls_policy_satisfiability_fixes`.
  </verify>

  <done>
The instrument exists, refuses production, and has produced a before matrix in which every probe
listed above carries a concrete row count or a full SQLSTATE + message. The migration file exists with
five statements, the full header, and a verbatim rollback block, and has not been applied.
  </done>
</task>

<task type="auto">
  <name>Task 2: Apply to staging, capture the AFTER matrix, and run every gate</name>

  <files>
.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/after.json
.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/after.md
.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/diff.md
.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/drift-after.txt
.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/ledger-readback.txt
.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/isolation-suite-before-fix.txt
.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/verify-clean-after.txt
apps/web/scripts/audit/rls-policy-canonical.json
  </files>

  <action>
**2a. Re-assert the preconditions** (they were measured at plan time; re-assert them at apply time as
`postgres` on staging, and record the output):

- `SELECT current_user, (SELECT rolbypassrls FROM pg_roles WHERE rolname=current_user)` on
  `STAGING_DIRECT_URL` → `postgres`, true; and on `STAGING_DATABASE_URL_APP_USER` → `app_user`, false.
- `SELECT count(*) FROM pg_policy` → **180**.
- `bypass_rls_policy` sorted table list → **86** entries; save it for the after-comparison.
- Newest `_prisma_migrations` row → `20260913120000_rls_policy_satisfiability_fixes`.

**2b. Apply — STAGING ONLY, `migrate.mjs` ONLY.** From `apps/web`:

```bash
DIRECT_URL="<staging session-mode string>" \
DATABASE_URL="<the same string>" \
node scripts/migrate.mjs
```

**Both variables, every time.** Not `prisma migrate deploy`, not the Supabase MCP `apply_migration`,
not `execute_sql` for DDL, not `db push`. Expected output: **`Migrations complete (1 applied)`**.
More than one means the ledger and the disk corpus disagree — **stop and investigate**, do not
continue.

Note that fixtures are seeded at this point, so `migrate.mjs`'s spawned `seed-starter-playbooks.ts`
will create `Playbook`/`PlaybookStep`/`PlaybookTrigger`/`StepTemplate` rows for the two disposable
tenants. That is expected; `597-staging-fixtures.ts --teardown` removes them.

**2c. Capture AFTER, and diff:**

```
npx tsx scripts/audit/599-policy-verify.ts --phase after
npx tsx scripts/audit/599-policy-verify.ts --diff
```

**2d. Assert the arithmetic against the LIVE count, not against this plan.**

- `SELECT count(*) FROM pg_policy` → expect **183**. Net +3: +2 on `"Tenant"`, +1 from the `audit_log`
  split (one policy became two), and `AutomationRule` is a replace (+0). **If the live number is not
  183, report the discrepancy and stop** — do not adjust the expectation to match the reading.
- `bypass_rls_policy`: **86 before, 86 after, identical sorted table list.** Compare the lists, not
  the counts.
- `app_user` grants on `audit_log` → `SELECT, INSERT` only. On `"Tenant"` and `"AutomationRule"` →
  unchanged at `SELECT, INSERT, UPDATE, DELETE`.

**2e. `_prisma_migrations` read-back, per DEC-17.** Do **not** assume `migrate.mjs` wrote it.

First confirm a **known-good sentinel row is visible** (e.g. `20260913120000_rls_policy_satisfiability_fixes`)
so an empty result cannot be misread as absence — `_prisma_migrations` is RLS-enabled with zero
policies and no `app_user` grant, and a read from a non-owner role returns zero rows with no error.
Then read the newest row and confirm it is
`20260914120000_tenant_audit_automation_policy_closure` with `applied_steps_count = 1` and
`checksum = 'manual'` — the signature of a row `migrate.mjs` actually executed, as opposed to a
hand-mirrored resolved row (`applied_steps_count = 0`, real SHA-256). Save to
`evidence/ledger-readback.txt`.

**2f. Regenerate the canonical artefact — mandatory.** From `apps/web`:

```
npm run audit:rls-canonicalise
```

This script loads `.env.staging` itself and never imports `_bootstrap-env`, so no inline pinning is
needed. It must rewrite `scripts/audit/rls-policy-canonical.json`. Without it the corpus hash on disk
no longer matches the corpus, and `rls-policy-drift.ts` prints **DEFINITION LAYER DID NOT RUN** and
exits 3 — it never prints CLEAN in that state. Confirm the artefact now contains entries keyed for
`tenant_bootstrap_insert`, `tenant_self_update`, `audit_log_append_policy` and the rewritten
`audit_log` / `AutomationRule` `tenant_isolation_policy` bodies, and that `notCanonicalised` is empty.

**Do not modify** `scripts/audit/rls-policy-replay.ts`'s `POLICY_STATEMENT_RE`, `INTEGRITY_FLOORS`,
the 328/230 reproduction numbers, or `rls-policy-definitions.ts`'s `DEFINITION_FLOORS`. Every floor is
a lower bound and adding policies only raises counts.

**2g. Run the drift gate**, both variables pinned (this script DOES import `_bootstrap-env`):

```bash
DIRECT_URL="<staging>" DATABASE_URL="<staging>" npm run audit:rls-policy-drift
```

Expect **exit 0**, `RESULT: CLEAN`, `Missing 0 / Unexpected 0`, **zero definition drift**, and
`NOT CANONICALISED: none`. Tee to `evidence/drift-after.txt`. Exit 3 means the artefact is stale — go
back to 2f. Exit 1 means real drift — investigate, do not regenerate the baseline to make it go away.

**2h. Record the isolation suite failing, BEFORE it is fixed.** From `apps/web`:

```
npm run test:rls-isolation
```

The suite seeds and tears down its own fixtures, so it is safe to run now. It is **expected to fail**,
in `behaviour.test.ts` `'cross-tenant writes as app_user'` for `audit_log`: the own-tenant DELETE now
raises `42501 permission denied for table audit_log`, and `probeRows` throws rather than returning a
count. **Tee the exact failure text to `evidence/isolation-suite-before-fix.txt`.** This is the
recorded red that Task 3's fix is measured against — a fix asserted without a witnessed failure is the
quick-549 shape.

Expect the other three write-probe targets (`in_app_notifications`, `PushToken`,
`SysAdminInvoiceItem`) to still pass, and every `audit_log` READ probe to still pass — the SELECT
split preserves read behaviour exactly.

**2i. Return staging to its pre-task state** (fixtures only; the migration stays applied):

```
npx tsx scripts/audit/597-staging-fixtures.ts --teardown
npx tsx scripts/audit/597-staging-fixtures.ts --verify-clean
```

Tee `--verify-clean` to `evidence/verify-clean-after.txt`; it must exit 0 with every listed table at
zero. Then the D4 integrity re-read: `"AutomationRule"` holds exactly **6** rows, all
`scope='SYSTEM'`, all `tenantId IS NULL`.

Note that `npm run test:rls-isolation` in 2h leaves its own fixtures torn down; if the suite was
killed mid-run, the teardown above clears whatever survived.
  </action>

  <verify>
- `Migrations complete (1 applied)` in the apply output.
- `pg_policy` count **180 → 183**, read live; `bypass_rls_policy` **86 → 86** with an identical sorted
  table list.
- `evidence/after.md` shows, quoted verbatim:
  - `Tenant.insert@guc-empty` **accepted (1 row)** and `Tenant.insert@guc-A` **ERROR [42501] new row
    violates row-level security policy for table "Tenant"** — the self-enforcing pair.
  - `Tenant.update-own@guc-A` **1 row** (it was 0 or 42501 before — the `saveOperationsSettings`
    proof) with its counter-read at 1; `Tenant.update-cross@guc-A` **0 rows** with tenant B confirmed
    present as `postgres`.
  - `Tenant.delete-own@guc-A` **0 rows** in BOTH phases, counter-read 1 — no DELETE policy,
    deliberately.
  - `audit_log.insert-cross@guc-A` **42501 → 1 row** (the `writeAuditLog` contract, the headline);
    `audit_log.insert-own@guc-A` **1 → 1**; `audit_log.insert@guc-empty` **42501 → 1 row**;
    `audit_log.select-cross@guc-A` **0 → 0**; `audit_log.select-own@guc-A` **1 → 1**.
  - `audit_log.update-own@guc-A` and `audit_log.delete-own@guc-A` **1 row → ERROR [42501] permission
    denied for table audit_log**.
  - `AutomationRule.select-system@guc-A` **6 → 6** (read deliberately unchanged);
    `AutomationRule.update-system@guc-A` **6 rows → 42501**; `AutomationRule.update-system@guc-empty`
    **6 rows → 42501**; `AutomationRule.insert-own@guc-A` **accepted → accepted**;
    `AutomationRule.insert-system@guc-A` and `insert-cross@guc-A` **accepted → 42501**.
  - `AutomationRule.delete-system@guc-A` **6 → 6** — the D2 residue, unchanged and reported.
- `evidence/ledger-readback.txt` shows a visible sentinel row plus the newest row =
  `20260914120000_tenant_audit_automation_policy_closure`, `applied_steps_count = 1`,
  `checksum = 'manual'`.
- `evidence/drift-after.txt` ends `RESULT: CLEAN (exit 0)` with 0 missing / 0 unexpected / 0 definition
  drift / 0 not-canonicalised.
- `apps/web/scripts/audit/rls-policy-canonical.json` is modified and contains the five new/changed
  bodies.
- `evidence/isolation-suite-before-fix.txt` contains the `audit_log` own-tenant DELETE failure text.
- `evidence/verify-clean-after.txt` exits 0; `"AutomationRule"` count = 6, all SYSTEM, all null tenant.
  </verify>

  <done>
The migration is applied to staging and to staging only; the after matrix proves each of the five
statements in both directions; the policy count, bypass set, ledger row, canonical artefact and drift
gate all check out; the isolation suite's expected failure is recorded verbatim; staging carries zero
fixtures and its six real `AutomationRule` rows.
  </done>
</task>

<task type="auto">
  <name>Task 3: Replace the audit_log write assertion with the append-only contract, correct the three false claims, and document</name>

  <files>
apps/web/tests-db/rls-isolation/env.ts
apps/web/tests-db/rls-isolation/behaviour.test.ts
apps/web/tests-db/rls-isolation/coverage.test.ts
apps/web/tests-db/rls-isolation/uncovered-tables.json
apps/web/tests-db/rls-isolation/coverage-report.json
apps/web/src/lib/security/audit-log.ts
docs/audits/tenant-audit-automation-policy-closure.md
docs/audits/bypass-replacement-design.md
docs/audits/policy-satisfiability-sweep.md
.planning/quick/599-close-the-three-dark-command-rls-policy-/599-SUMMARY.md
.planning/STATE.md
CLAUDE.md
  </files>

  <action>
**3a. The isolation suite — a strictly stronger assertion, never a weaker one.**

`audit_log` must NOT simply be deleted from `WRITE_PROBE_TARGETS`. Weakening a guard to make a run
green is a task failure in this repo. Replace it with an assertion of the NEW contract.

In `tests-db/rls-isolation/env.ts`:
- Reduce `WRITE_PROBE_TARGETS` to `['in_app_notifications', 'PushToken', 'SysAdminInvoiceItem']` —
  these three keep the existing cross/own DELETE contract **unchanged**.
- Add `export const APPEND_ONLY_WRITE_PROBE_TARGETS = ['audit_log'] as const;` with a comment stating
  why the table moved: after `20260914120000` it has a `FOR SELECT` policy, a `FOR INSERT` policy, no
  UPDATE or DELETE policy, and no UPDATE or DELETE grant.
- Add an exported constant naming the union, and in `behaviour.test.ts` assert it equals the four
  original names sorted. **This is what makes the move a move and not a deletion** — dropping
  `audit_log` from both lists becomes a test failure rather than a silent loss of coverage.

In `tests-db/rls-isolation/behaviour.test.ts`:
- Keep the existing `cross-tenant writes as app_user` describe block untouched, now iterating three
  targets.
- Add a new describe block, `audit_log is append-only for app_user`, driven by a new write case that
  opens one `app_user` client under tenant A's GUC inside `BEGIN … ROLLBACK` and probes:
  - cross-tenant DELETE (tenant B's ids) → **refused**, SQLSTATE `42501`
  - own-tenant DELETE (tenant A's ids) → **refused**, SQLSTATE `42501`
  - own-tenant UPDATE → **refused**, SQLSTATE `42501`
  - own-tenant INSERT (`tenant_id = A`, `action = 'EXPORT'`, marker in `resource_type`) →
    **succeeds, 1 row**
  - cross-tenant INSERT (`tenant_id = B`) → **succeeds, 1 row**

  Assert the SQLSTATE explicitly (`42501`) rather than merely "it errored", and assert the two
  INSERTs succeed. The double refusal alone would pass identically on a table with no grants at all,
  or on a table that does not exist; the two INSERTs are the counter-assertion that removes that. The
  cross-tenant INSERT is also the `writeAuditLog` contract itself — the whole reason
  `audit_log_append_policy` is `WITH CHECK (true)` — so it belongs in the gate, not only in the
  evidence file.
- Extend the `nothing was actually written` describe block to iterate the **union** of both target
  lists, so `audit_log`'s fixture rows are still re-counted after the probes. As written it iterates
  `WRITE_PROBE_TARGETS` only and would quietly stop checking `audit_log`.

In `tests-db/rls-isolation/coverage.test.ts`, add one assertion (D1): **every `ISOLATION_TARGETS` key
appears in `rows` at all**, before the existing `'every behaviour target is classified COVERED'`
check. That existing test filters `rows` by target key, so a target absent from the enumeration
yields an empty filter and passes saying nothing. This migration does not trigger it — the SELECT half
deliberately keeps the name `tenant_isolation_policy` — but the enumeration is exactly one policy
rename away from it, and this change is what revealed the hole.

Update `tests-db/rls-isolation/uncovered-tables.json`'s `AutomationRule` reason: its policy still
admits non-tenant-scoped rows on **SELECT and DELETE**, and no longer on INSERT or UPDATE. Re-commit
`coverage-report.json` as the suite regenerates it.

Then run, from `apps/web`:

```
npm run test:rls-isolation
```

All green, and the run must show more tests than before the edit (three targets in the old block plus
five new append-only assertions plus the union and coverage guards). Tee to
`evidence/isolation-suite-after-fix.txt`.

**State plainly in the summary, do not paper over:** `"Tenant"` and `"AutomationRule"` are **NOT**
covered by this suite. `AutomationRule` is explicitly listed in
`tests-db/rls-isolation/uncovered-tables.json`, and `"Tenant"` never enters the enumeration at all
because it carries no policy named `tenant_isolation_policy`. A green suite is **not** evidence for
either of them; their evidence is the `599-policy-verify` matrix and nothing else.

**3b. Correct the three false claims.**

1. `src/lib/security/audit-log.ts:1-14` — the header asserts "The audit_log table has FORCE RLS +
   REVOKE UPDATE/DELETE — it is append-only by construction". Measurement says `app_user` held UPDATE
   and DELETE. Rewrite it to state what is true and where: the REVOKE is shipped by
   `20260914120000_tenant_audit_automation_policy_closure`, applied to **staging** and **pending on
   production**; and today the insert succeeds because the connection is `postgres` with
   `rolbypassrls`, with `audit_log_append_policy`'s `WITH CHECK (true)` becoming the mechanism at the
   cutover. Do not change the function's behaviour — the `set_config('app.bypass_rls','on',TRUE)` line
   stays; removing it belongs to the wrapper migration.
2. `docs/audits/bypass-replacement-design.md` §3.1 item 4 — add a dated inline correction next to
   "already carries `REVOKE UPDATE, DELETE`": measured false on 2026-09-14, `app_user` held both,
   and the revoke ships in this migration. The design's argument for `WITH CHECK (true)` was sound
   and its premise was not.
3. `docs/audits/policy-satisfiability-sweep.md`:
   - §0 blockers table: mark blocker 1 (`"Tenant"`) and blocker 4 (`AutomationRule`) as addressed on
     staging by this migration, with a link to the new doc, **and name the residues**: `"Tenant"`
     sysadmin writes and DELETE still need B5; `AutomationRule` DELETE of SYSTEM rows is still open
     (D2).
   - §4.1 / §5.2: **only if the before measurement confirms it** (D3), correct "an `ERROR 42501 …`,
     not a silent zero" — that holds for INSERT; UPDATE and DELETE with no applicable policy affect
     0 rows silently. Quote the measured row count and SQLSTATE. If the measurement contradicts this
     paragraph instead, say so and leave the doc alone.

**3c. Write `docs/audits/tenant-audit-automation-policy-closure.md`**, following the structure of
`docs/audits/rls-policy-satisfiability-fixes.md`:

1. **What changed** — the five statements in a table, with the "why" for each.
2. **Evidence** — the before→after probe matrix, quoted verbatim from `after.md`, with the
   `saveOperationsSettings` proof and the `writeAuditLog` cross-tenant insert as the two headlines;
   the bypass set unchanged at 86 as a sorted list; the policy count 180 → 183 with the arithmetic
   shown.
3. **What is NOT evidence** — a green deploy (the app is `postgres`); the drift detector's name layer
   alone; a green `test:rls-isolation` for `"Tenant"` and `"AutomationRule"`, which it does not cover.
4. **Production apply runbook** — the exact two-variable command, the expected
   `Migrations complete (1 applied)`, the six post-apply checks including the DEC-17 ledger read-back
   with its sentinel-row precaution, and the rollback instruction (copy into psql, never uncomment in
   place).
5. **What breaks at the `app_user` cutover, by file and line** — `toggleRuleActive` at
   `(admin)/actions/automations.ts:70`; the six `(admin)/actions/tenants.ts` sites; `"Tenant"` DELETE.
   All three route to **B5, which does not exist and is not started by this task.**
6. **Closure table** against sweep §0's blockers: blocker 1 `"Tenant"` → **PARTIAL** (3 of 11 sites
   served by `tenant_self_update`, 2 by `tenant_bootstrap_insert`, 6 remain on B5, DELETE deliberately
   unserved); blocker 4 `AutomationRule` → **PARTIAL** (INSERT and UPDATE closed, **DELETE remains
   open**, with the four-policy split named as the fix); quick-597 §5(b) `audit_log` → **CLOSED**,
   with statement 5 recorded as the addition beyond the three policy fixes and its justification.
7. **Staging was returned to its pre-task state** — the `--verify-clean` output and the
   `AutomationRule` 6-row re-read; the migration stays applied.

**3d. Housekeeping.**

- `.planning/quick/599-close-the-three-dark-command-rls-policy-/599-SUMMARY.md` — the standard quick
  summary, with the residues (D2, B5, production not applied) in a "what is still open" section.
- `.planning/STATE.md` — add the quick-599 row to the task table, matching the existing column shape.
- `CLAUDE.md` — add the durable rules this task establishes, in the existing voice:
  - **`WITH CHECK` never applies to DELETE**, so adding one to a `FOR ALL` policy closes INSERT and
    UPDATE and leaves DELETE exactly as open as `USING` leaves it. Closing all three without a
    RESTRICTIVE policy needs a per-command split.
  - **An RLS-refused UPDATE or DELETE is a SILENT 0 ROWS, not a 42501** — 42501 is what a failed
    `WITH CHECK` produces, i.e. INSERT and the new row of UPDATE. Every 0-row write probe therefore
    needs a counter-read in the same transaction, or it is indistinguishable from "the row is not
    there" and proves nothing.
  - **`coverage.test.ts` enumerates tenant-scoped tables by the POLICY NAME `tenant_isolation_policy`**,
    so renaming a policy silently drops its table out of the coverage report AND makes the
    "every behaviour target is COVERED" assertion pass vacuously. Keep the name when narrowing a
    policy's command.
  - **`audit_log` is append-only in two layers** — no UPDATE/DELETE policy *and* no UPDATE/DELETE
    grant. Policy-absence alone gives a silent 0; the grant is what makes it a loud 42501. The two
    layers must agree, and two source comments asserted the revoke for months while it was false.

**3e. Gates and commit.**

- `npx tsc --noEmit` in `apps/web` — and **check it is not lying**. If the only errors are syntax
  errors, or are all in files you did not touch, the gate is blind. **Probe it**: inject
  `const x: number = 'y'` into a file you actually edited (e.g. `behaviour.test.ts`), confirm tsc
  reports THAT error, then delete the probe and re-run. Note that `tests-db/` is outside the default
  vitest include globs but IS in the tsconfig program.
- `apps/web` has **no working lint entry point** (`next lint` no longer accepts `--dir`; ESLint 9
  finds no flat config). Report that; do not claim a lint pass from a command that errored.
- Full default suite, before and after, **with the same invocation and the same reporter**, read from
  the `Test Files … | Tests …` summary line — a run whose output carries no test counts is not a run.
  Measure the "before" with `git stash` in the **main tree**, not in a worktree: a worktree does not
  carry the untracked `apps/web/.env.local` and the skew reads exactly like a regression
  (quick-567). Stop `next dev` first. This task touches no file under `tests/` or `src/__tests__`,
  so the expected delta is **zero**; report the two numbers rather than asserting it.
- Commit. **Do NOT push** — the user pushes and deploys. Suggested split:
  `feat(599): close the Tenant, audit_log and AutomationRule dark-command policy gaps` for the
  migration + instrument + canonical artefact; `test(599): assert audit_log's append-only contract in
  the real RLS suite` for the suite change; `docs(599): …` for the doc corrections and the summary.
  </action>

  <verify>
- `npm run test:rls-isolation` exits 0, and its `Tests` count is **higher** than the count in
  `evidence/isolation-suite-before-fix.txt`. Tee to `evidence/isolation-suite-after-fix.txt`.
- `grep -n "audit_log" apps/web/tests-db/rls-isolation/env.ts` shows it in
  `APPEND_ONLY_WRITE_PROBE_TARGETS` and **not** in `WRITE_PROBE_TARGETS`; the union assertion in
  `behaviour.test.ts` names all four tables.
- Deliberately break the new guard to prove it fires: temporarily remove `audit_log` from
  `APPEND_ONLY_WRITE_PROBE_TARGETS` and confirm the union assertion FAILS; restore it. Record the
  failure text. A guard asserted without a witnessed red is the quick-549 shape.
- `grep -n "REVOKE UPDATE/DELETE" apps/web/src/lib/security/audit-log.ts` no longer returns an
  unqualified claim; the header names the migration and the pending-on-production state.
- `docs/audits/tenant-audit-automation-policy-closure.md` exists and its closure table marks
  `AutomationRule` **PARTIAL** with DELETE named as open.
- `npx tsc --noEmit` in `apps/web` → 0 errors, **after** the injected-probe check confirmed the gate
  is live.
- Default vitest suite: before and after counts recorded and equal.
- `git status` is clean apart from the intended files; `git log --oneline -3` shows the commits;
  **nothing is pushed**.
  </verify>

  <done>
The isolation suite asserts `audit_log`'s append-only contract in both directions and is green; the
three false claims are corrected in source and in both predecessor docs; the new audit document
records the evidence, the runbook, the cutover breakage and an honest PARTIAL closure table; STATE.md
and CLAUDE.md carry the durable findings; work is committed and unpushed.
  </done>
</task>

</tasks>

<verification>

**Staging only.** Production (`oqdhberkghtnszrkdvfm`) must never be connected to by this task, for a
read or a write. Every instrument refuses on the production ref. Every command that touches the
database pins **both** `DIRECT_URL` and `DATABASE_URL` inline to the staging string, because
`apps/web/scripts/_bootstrap-env.ts:53-55` does `process.env.DATABASE_URL = process.env.DIRECT_URL`
unconditionally and every env file points `DIRECT_URL` at production.

**The migration is applied by `node scripts/migrate.mjs` and by nothing else.** Not
`prisma migrate deploy`, not the Supabase MCP `apply_migration` or `execute_sql`, not `db push`.
DEC-17: neither MCP tool writes the `_prisma_migrations` row, and "the DDL is live" is evidence of the
half that was never in doubt.

**Untouched, and asserted as untouched:** `bypass_rls_policy` on every table (86 → 86, same sorted
list); `"SupportTicket"`; `_prisma_migrations`; `POLICY_STATEMENT_RE`, `INTEGRITY_FLOORS`,
`DEFINITION_FLOORS` and the 328/230 reproduction numbers. No package is installed. No
`AS RESTRICTIVE` policy anywhere. No policy DDL inside a `DO` block.

**Both directions, every probe.** A rejection test alone passes by saying nothing. Each refusal below
is paired with the legitimate operation that must still succeed:

| Probe | Before | After |
|---|---|---|
| `"Tenant"` INSERT, GUC `''` | — | **accepted** |
| `"Tenant"` INSERT, GUC = tenant A | — | **42501** |
| `"Tenant"` UPDATE own, GUC = own id | 0 rows (or 42501 — measure) | **1 row** |
| `"Tenant"` UPDATE tenant B, GUC = A | 0 rows | **0 rows**, B confirmed present |
| `"Tenant"` DELETE own, GUC = own id | 0 rows | **0 rows**, row confirmed present |
| `audit_log` INSERT naming B, GUC = A | 42501 | **1 row** |
| `audit_log` INSERT own, GUC = A | 1 row | **1 row** |
| `audit_log` SELECT B's rows, GUC = A | 0 | **0** |
| `audit_log` UPDATE / DELETE, GUC = A | 1 row each | **42501 each** |
| `"AutomationRule"` SELECT SYSTEM, GUC = A | 6 | **6** |
| `"AutomationRule"` UPDATE SYSTEM, GUC = A | 6 rows | **42501** |
| `"AutomationRule"` INSERT naming A, GUC = A | accepted | **accepted** |
| `"AutomationRule"` INSERT SYSTEM / naming B, GUC = A | accepted | **42501** |
| `"AutomationRule"` DELETE SYSTEM, GUC = A | 6 rows | **6 rows — residue, reported** |

**Gates:** `npm run audit:rls-policy-drift` (both vars pinned) exit 0, CLEAN, 0 missing / 0 unexpected
/ 0 definition drift; `pg_policy` 180 → 183 verified against the live count; `_prisma_migrations`
newest row read back with `applied_steps_count = 1` and `checksum = 'manual'` after a sentinel row is
confirmed visible; `npm run test:rls-isolation` green with a higher test count than the recorded red;
`npx tsc --noEmit` 0 errors with the blind-gate probe performed and removed; default vitest counts
equal before and after.

**Staging returned to its pre-task state** — `597-staging-fixtures.ts --verify-clean` exits 0, and
`"AutomationRule"` still holds exactly 6 SYSTEM rows. The migration stays applied; only fixtures are
removed.

</verification>

<success_criteria>

1. `apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql`
   exists with five statements, a header covering every item listed in Task 1d, and a verbatim
   commented rollback block; applied to staging via `migrate.mjs` with `Migrations complete (1 applied)`.
2. `pg_policy` 180 → 183, `bypass_rls_policy` 86 → 86 with an identical sorted table list, `app_user`
   grants on `audit_log` reduced to `SELECT, INSERT`.
3. Every probe in the verification table above is recorded in `evidence/before.md` and
   `evidence/after.md` with a row count or a full SQLSTATE and message, and quoted in the new audit
   doc.
4. `scripts/audit/rls-policy-canonical.json` regenerated on staging and committed;
   `npm run audit:rls-policy-drift` exits 0 with zero name drift and zero body drift.
5. `_prisma_migrations` newest row read back and confirmed per DEC-17.
6. `npm run test:rls-isolation` green, with `audit_log` moved from `WRITE_PROBE_TARGETS` to a new
   append-only block that asserts three 42501 refusals **and** two successful inserts, a union
   assertion that makes the move un-deletable, the post-probe re-read extended to the union, and the
   coverage vacuity guard added — with the pre-fix red and the guard's own red both recorded.
7. The three false claims corrected: `src/lib/security/audit-log.ts`'s header,
   `bypass-replacement-design.md` §3.1 item 4, and `policy-satisfiability-sweep.md` §0 blockers 1 and
   4 (plus §4.1/§5.2 if the measurement confirms D3).
8. `docs/audits/tenant-audit-automation-policy-closure.md` exists with the closure table marking
   `"Tenant"` and `AutomationRule` **PARTIAL** — the `AutomationRule` DELETE residue and the six
   B5-bound `"Tenant"` sites named, not glossed.
9. `tsc --noEmit` clean with a probed (not assumed) gate; default vitest counts unchanged; staging
   clean of fixtures; `AutomationRule` intact at 6 rows.
10. Committed, **not pushed**. Production is untouched and the doc says so.

</success_criteria>

<output>
After completion, create
`.planning/quick/599-close-the-three-dark-command-rls-policy-/599-SUMMARY.md`.
</output>
