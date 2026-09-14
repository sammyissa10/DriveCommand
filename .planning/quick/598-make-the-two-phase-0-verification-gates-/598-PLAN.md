---
phase: quick-598
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true

files_modified:
  - apps/web/scripts/audit/rls-policy-definitions.ts          # NEW — pure body parser + canonical compare
  - apps/web/scripts/audit/598-canonicalise-policies.ts       # NEW — staging-only deparse round-trip
  - apps/web/scripts/audit/rls-policy-canonical.json          # NEW — checked-in canonical artefact
  - apps/web/scripts/audit/rls-policy-drift.ts                # MODIFIED — additive definition layer
  - apps/web/tests-db/rls-isolation/catalogue.test.ts         # NEW
  - apps/web/tests-db/rls-isolation/behaviour.test.ts         # NEW
  - apps/web/tests-db/rls-isolation/source-facts.test.ts      # NEW
  - apps/web/tests-db/rls-isolation/coverage.test.ts          # NEW
  - apps/web/tests-db/rls-isolation/uncovered-tables.json     # NEW — checked-in expected NOT COVERED list
  - apps/web/tests-db/rls-isolation/env.ts                    # NEW — staging-only connection guard
  - apps/web/vitest.db.config.ts                              # NEW
  - apps/web/package.json                                     # MODIFIED — two npm scripts
  - .github/workflows/rls-isolation.yml                       # NEW
  - .github/workflows/rls-policy-drift.yml                    # MODIFIED — doc + canonicalise step
  - docs/audits/phase-0-verification-gates.md                 # NEW — evidence + 17-row accounting
  - apps/web/src/__tests__/isolation/group-a-isolation.test.ts  # DELETED
  - apps/web/src/__tests__/isolation/group-b-isolation.test.ts  # DELETED
  - apps/web/src/__tests__/isolation/group-c-isolation.test.ts  # DELETED

must_haves:
  truths:
    - "A policy whose USING is rewritten to `true` WITHOUT a name change is reported as drift by `npm run audit:rls-policy-drift` — quoted, both before and after restoration"
    - "A policy mutated to `USING (true)` on staging makes the DB isolation suite EXIT NON-ZERO — quoted, both before and after restoration"
    - "The detector run against PRODUCTION is pure SELECT and completes without a transaction, using the checked-in canonical artefact"
    - "With the canonical artefact absent or stale, the detector prints DEFINITION LAYER DID NOT RUN and exits non-zero — it never prints CLEAN"
    - "Every tenant-scoped table is listed BY NAME as COVERED or NOT COVERED with a reason, and the NOT COVERED list is asserted against a checked-in file in both directions"
    - "`current_setting('app.bypass_rls', TRUE) = 'on'` written by hand round-trips byte-identical to the live expression — the naive string comparator's false positive is proven absent"
    - "Staging is verified clean after the run: `597-staging-fixtures.ts --verify-clean` exits 0"
  artifacts:
    - path: "apps/web/scripts/audit/rls-policy-definitions.ts"
      provides: "Pure CREATE POLICY body parser + canonical shape comparison + anti-vacuity floors"
      exports: ["parsePolicyDefinitions", "canonicalPolicyShape", "diffPolicyDefinitions", "assertDefinitionCorpusIntegrity", "DEFINITION_FLOORS"]
      min_lines: 150
    - path: "apps/web/scripts/audit/598-canonicalise-policies.ts"
      provides: "Deparse round-trip against staging inside BEGIN…ROLLBACK; writes rls-policy-canonical.json"
      min_lines: 150
    - path: "apps/web/scripts/audit/rls-policy-canonical.json"
      provides: "Checked-in canonical expected definitions + corpus hash, so production can be compared with SELECT only"
    - path: "apps/web/tests-db/rls-isolation/coverage.test.ts"
      provides: "Per-table COVERED / NOT COVERED report asserted against uncovered-tables.json in both directions"
      min_lines: 60
    - path: "apps/web/vitest.db.config.ts"
      provides: "Separate vitest config so the DB suite is never collected by `npx vitest run` in CI"
    - path: ".github/workflows/rls-isolation.yml"
      provides: "CI gate with the rls-policy-drift.yml loud ::warning DID-NOT-RUN shape when staging secrets are absent"
    - path: "docs/audits/phase-0-verification-gates.md"
      provides: "The 17-row accounting table, both mutation transcripts, both database runs, the coverage table"
      contains: "DID NOT RUN"
  key_links:
    - from: "apps/web/scripts/audit/rls-policy-drift.ts"
      to: "apps/web/scripts/audit/rls-policy-definitions.ts"
      via: "import of diffPolicyDefinitions, run as an ADDITIVE layer beside the existing name diff"
      pattern: "rls-policy-definitions"
    - from: "apps/web/scripts/audit/rls-policy-drift.ts"
      to: "apps/web/scripts/audit/rls-policy-canonical.json"
      via: "readFileSync + corpus-hash staleness check; absent/stale => DEFINITION LAYER DID NOT RUN"
      pattern: "rls-policy-canonical"
    - from: "apps/web/tests-db/rls-isolation/behaviour.test.ts"
      to: "STAGING_DATABASE_URL_APP_USER"
      via: "pg.Client as app_user, one transaction per GUC case, fixture ids from 597-staging-fixtures.ts"
      pattern: "STAGING_DATABASE_URL_APP_USER"
    - from: "apps/web/tests-db/rls-isolation/source-facts.test.ts"
      to: "apps/web/src/lib/db/extensions/tenant-rls.ts"
      via: "CRLF-normalised source slice of the real EXEMPT_MODELS set, with found-assertion and length floor"
      pattern: "EXEMPT_MODELS"
---

<objective>
Both Phase 0 verification gates currently pass while checking nothing, and both failure modes are
already measured:

1. **The 17 tests in `apps/web/src/__tests__/isolation/` are VACUOUS.** They contain zero database
   references and assert string literals against string literals declared three lines above. They
   pass identically with every policy in the database dropped (quick-597 §6).
2. **The drift detector validates NAMES ONLY.** It diffs `(table, policy_name)` identity. A policy
   rewritten to `USING (true)` under its existing name is invisible to it (quick-597 §6).

This plan replaces (1) with a real, staging-backed, `app_user` suite and adds (2) a definition layer
built on the **already-proven** `CREATE POLICY … ROLLBACK … pg_get_expr` deparse round-trip.

Purpose: after this, "the gate is green" means something on both gates, and the one claim each gate
cannot support is printed rather than left to be assumed.
Output: one pure module, one staging-only canonicaliser, one checked-in canonical artefact, a
four-file DB suite with its own vitest config, two CI wirings, one evidence document, and three
deleted test files.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@docs/audits/bypass-replacement-design.md
@.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/597-SUMMARY.md
@apps/web/scripts/audit/rls-policy-drift.ts
@apps/web/scripts/audit/rls-policy-replay.ts
@apps/web/scripts/audit/597-staging-fixtures.ts
@apps/web/scripts/audit/597-policy-verify.ts
@.github/workflows/rls-policy-drift.yml
@.github/workflows/ci.yml
@apps/web/vitest.config.ts
@apps/web/src/lib/db/extensions/tenant-rls.ts
</context>

<preflight_facts>
**Do not re-derive any of this. It is measured. Encode it.**

**The deparse round-trip works — proven, not proposed.** Against staging via `pg.Client` on
`STAGING_DIRECT_URL`:
`BEGIN; CREATE POLICY <probe> ON public.loads AS PERMISSIVE FOR ALL TO public USING (…) WITH CHECK (…);
SELECT pg_get_expr(…); ROLLBACK;` works and leaves **zero** probe policies (exact-name count = 0 after
rollback). Hand-written `current_setting('app.bypass_rls', TRUE) = 'on'` deparsed to
`(current_setting('app.bypass_rls'::text, true) = 'on'::text)` — **byte-identical to the live
expression**. That is precisely the case a naive string comparator reports as false drift, which is
why canonicalisation is the mechanism and normalisation-by-regex is not.
`AS RESTRICTIVE` round-trips (`polpermissive = false`); `FOR SELECT` → `polcmd = 'r'`;
`TO app_user, postgres` → `roles = {app_user,postgres}`.
**`TO public` surfaces as `polroles = {0}` with an EMPTY rolname array.** Map oid `0` to the literal
`public` or every `TO public` policy — which is most of them — shows false drift.

**CAUTION, found while probing:** `polname LIKE '__p%'` matched **86 real policies**, because `_` is a
LIKE wildcard and `bypass_rls_policy` matches. Use exact names or `LIKE … ESCAPE`. The probe-cleanup
assertion must compare against an exact name set, never a prefix LIKE.

**Environment.** `apps/web/.env.staging` (gitignored) carries `STAGING_DIRECT_URL` (postgres,
`rolbypassrls = true`, port 5432), `STAGING_DATABASE_URL_APP_USER` (app_user, `rolbypassrls = false`)
and `STAGING_DATABASE_URL`.
**TRAP — `scripts/_bootstrap-env.ts:53-55` runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
UNCONDITIONALLY, and `.env`, `.env.local` and `apps/web/.env.local` ALL point `DIRECT_URL` at
PRODUCTION (`oqdhberkghtnszrkdvfm`).** Every new file here MUST NOT import `_bootstrap-env`; copy the
explicit-dotenv + production-ref-refusal header from `597-staging-fixtures.ts:1-65` verbatim in shape.
Anything that does import it needs BOTH `DIRECT_URL` and `DATABASE_URL` pinned inline.

**Staging is EMPTY** (0 `Tenant`, 0 `loads`, 0 `PushToken`, 0 `driver_pay_records`).
`scripts/audit/597-staging-fixtures.ts` (`--seed` / `--teardown` / `--verify-clean`) wraps the
idempotent `scripts/seed-staging.ts` (tenants `staging-alpha` / `staging-beta`, each with
user/driver/client/truck/facilities/trip/load/2 stops/route template/2 template stops/document) and
adds `audit_log`, `in_app_notifications`, `PushToken`, `SysAdminInvoice(Item)`, `Promo` rows, writing
`evidence/fixture-ids.json`. **REUSE IT. Do not rebuild the fixture graph.**

**A genuinely-unset `app.current_tenant_id` is NOT REACHABLE** on the app_user pooler connection —
neither `set_config(…, NULL, false)` nor `RESET` returns `current_setting` to NULL once the
placeholder has been set; the reset value is `''`. **Test `''` and state this**; do not fake an unset
case.

**Counts.** Staging: **180** policies. Production: **183** policies, 151 ledger rows. They now DIFFER
because `20260913120000_rls_policy_satisfiability_fixes` is **staging-only**. Part 4 must expect and
explain that, not report it as a surprise (see Task 3).

**CI.** `.github/workflows/ci.yml:35` runs `npx vitest run` with a DUMMY `DATABASE_URL`
(`postgresql://ci:ci@localhost:5432/ci`). `vitest.config.ts` includes `tests/**/*.test.ts` AND
`src/__tests__/**/*.test.ts` — **a DB-backed suite left under either path breaks CI.** That is why the
new suite lives at `apps/web/tests-db/`, a path no default include glob matches, with its own config.
`.github/workflows/rls-policy-drift.yml` is the precedent for the credential-absent shape: check for
the secret, run when present, and when absent emit a loud `::warning` — *"A green tick on this job
does NOT mean … it means nothing was checked."* **Never a silent pass.**

**The name-level parser is line-anchored and records `(kind, policy, table)` ONLY.** It deliberately
excludes two dynamic-SQL lines inside a `DO $$ … EXECUTE format('CREATE POLICY …')` block in
`20260802120000_document_import_phase1`. `INTEGRITY_FLOORS` and the 328/230 reproduction numbers are
**load-bearing**. The definition layer is a **NEW, ADDITIVE layer beside the name diff, never a
rewrite of it** — `POLICY_STATEMENT_RE`, `INTEGRITY_FLOORS` and every existing count must be
byte-unchanged at the end of this task.
Confirmed by grep for this plan: the migration corpus contains **zero `ALTER POLICY`** statements, so
the last `CREATE POLICY` for a key fully determines its expected body.

**The 17 old claims, and whether a real gate can carry each.** This table is the deletion licence; it
must be reproduced verbatim in the summary and in `docs/audits/phase-0-verification-gates.md`.

| # | File | Claim | Covered by |
|---|---|---|---|
| 1 | group-a | `loads` policy uses `org_id = current_tenant_id()` | YES — definition layer + DB behaviour suite |
| 2 | group-a | `loads` has FORCE RLS (not just ENABLE) | YES — `pg_class.relforcerowsecurity` |
| 3 | group-a | `bypass_rls_policy` admits service-role queries | YES — DB suite sets `app.bypass_rls='on'`, asserts rows |
| 4 | group-a | Group A tables all use `org_id` | YES — `information_schema.columns` + policy definition |
| 5 | group-b | `driver_pay_records` policy uses `org_id = current_tenant_id()` | YES |
| 6 | group-b | `driver_pay_records` FORCE RLS | YES |
| 7 | group-b | `bypass_rls_policy` on `driver_pay_records` | YES |
| 8 | group-b | Group B tables all use `org_id` | YES |
| 9 | group-b | `DriverPayRecord` in `EXEMPT_MODELS` | **The old test declared its OWN inline array and asserted that array contains the value it had just written.** Real source is `src/lib/db/extensions/tenant-rls.ts:71`. Cover by READING that file — CRLF-normalise, assert the slice was FOUND, carry a length floor (a bad slice fails GREEN, not red). |
| 10 | group-b | `driver_pay_records` GRANT to app_user | **The old test built a `grantStatement` string literal and asserted it contains its own substrings.** Cover via `information_schema.role_table_grants`. |
| 11 | group-c | `PushToken` policy uses `"tenantId" = current_tenant_id()` | YES |
| 12 | group-c | `PushToken` FORCE RLS | YES |
| 13 | group-c | `PushToken.tenantId` backfilled from `User.tenantId` | **PARTIAL** — assert column NOT NULL and zero NULL rows live. The historical backfill ACT is not observable now. Say so in the table; do not claim it. |
| 14 | group-c | `PushToken` removed from `EXEMPT_MODELS` | As #9 — read the real file |
| 15 | group-c | all 6 backfilled tables have `tenantId` NOT NULL (`PlaybookStep`, `PushToken`, `RouteDriver`, `StepInstance`, `SysAdminInvoiceItem`, `UserNotificationPreference`) | YES — `information_schema.columns` |
| 16 | group-c | Group C tables use `"tenantId"` | YES |
| 17 | group-c | `bypass_rls_policy` on `PushToken` uses text comparison not `::boolean` | YES — definition compare |

**Claims 11 and 12 still hold. quick-597 DROPPED `PushToken.user_isolation_policy`; no old test
asserted that policy, so nothing above is invalidated. Do not reintroduce it.**
</preflight_facts>

<tasks>

<task type="auto">
  <name>Task 1: The definition layer — pure body parser, staging canonicaliser, additive drift comparison</name>
  <files>
apps/web/scripts/audit/rls-policy-definitions.ts        (new, pure — no DB, no I/O, no console)
apps/web/scripts/audit/598-canonicalise-policies.ts     (new, staging-only)
apps/web/scripts/audit/rls-policy-canonical.json        (new, generated + committed)
apps/web/scripts/audit/rls-policy-drift.ts              (modified, additive only)
apps/web/package.json                                   (one new script)
  </files>
  <action>
**A. `rls-policy-definitions.ts` — pure, mirroring `rls-policy-replay.ts`'s discipline (no database,
no filesystem, no network, no `console.log`, no `process.exit`).**

- `parsePolicyDefinitions(migration, sql): PolicyDefinition[]` — find statement START offsets with the
  SAME line-anchored rule the name parser uses (`/^[ \t]*CREATE\s+POLICY/gim` on CRLF-normalised text,
  so the two `EXECUTE format(…)` lines stay excluded exactly as they are today), then scan forward to
  the terminating `;` at paren depth 0, respecting `'…'`, `"…"` and `$tag$…$tag$`. Capture
  `{ table, policy, permissive: boolean, cmd: 'ALL'|'SELECT'|'INSERT'|'UPDATE'|'DELETE',
  roles: string[], using: string|null, withCheck: string|null, migration }`.
  Default `AS PERMISSIVE`, default `FOR ALL`, default `TO public` when the clause is absent.
- `replayPolicyDefinitions(files)` — same DROP/CREATE net-set replay as the name layer, keyed on
  `policyKey`. Import `policyKey` and `parsePolicyStatements` from `rls-policy-replay.ts`; **do not
  modify that file.** DROPs come from the existing parser so the two layers can never disagree about
  presence.
- `canonicalPolicyShape(row)` → the comparison key:
  `{ cmd, permissive, roles: sorted, using, withCheck }`. `roles` maps oid `0` → `'public'`; sort so
  `TO app_user, postgres` and `TO postgres, app_user` are the same shape.
- `diffPolicyDefinitions(expectedCanonical, live)` → `{ definitionDrift: Array<{ key, field,
  expected, live }>, notCanonicalised: string[] }`. **Compare ONLY keys present in BOTH sets** —
  presence is the name layer's job, and duplicating it would double-report every finding.
- `DEFINITION_FLOORS` + `assertDefinitionCorpusIntegrity` — its OWN anti-vacuity floors, calibrated
  from the executor's measured run with the same margin logic the existing `INTEGRITY_FLOORS` comment
  spells out (a floor equal to the current value teaches people to edit the floor). At minimum:
  minimum definitions parsed, minimum canonicalised, minimum compared. A comparison over an empty
  intersection must fail LOUD, never print CLEAN.

**B. `598-canonicalise-policies.ts` — staging-only, writes the artefact.**

Header shape copied from `597-staging-fixtures.ts:1-65`: explicit `dotenv` load of
`apps/web/.env.staging`, refuse on `oqdhberkghtnszrkdvfm`, require `wyixpgunnjmzguhggocz`,
**never import `_bootstrap-env`**, never print a connection string.

Connect with `pg.Client` on `STAGING_DIRECT_URL`. `BEGIN`. For each expected definition, create it
under a deterministic probe name from a fixed, collision-proof prefix (record the exact names in a
`Set`; the probe list is the cleanup oracle). Fence every `CREATE POLICY` with a `SAVEPOINT` so a
policy whose body no longer type-checks against the live schema is recorded as
`notCanonicalised: [{ key, sqlstate, message }]` rather than aborting the whole run. Read back
`polpermissive`, `polcmd`, `polroles` (→ rolnames, oid `0` → `public`),
`pg_get_expr(polqual, polrelid)`, `pg_get_expr(polwithcheck, polrelid)`. `ROLLBACK`.

**Then, in a fresh statement after the rollback, assert `SELECT count(*) FROM pg_policy WHERE polname
= ANY($1)` with the exact probe-name array returns 0, and exit non-zero if not.** Exact names — the
`__p%` finding above is why. This script performs no COMMIT anywhere; grep the file to prove it.

Write `rls-policy-canonical.json`: `{ generatedAt, projectRef, corpusHash, definitionCount,
notCanonicalised: [...], policies: { "<table>.<policy>": <canonicalShape> } }` where `corpusHash` is
a SHA-256 over the **sorted parsed definition set** (stable against unrelated migration edits, and
changes the moment a policy body changes). Commit the artefact.

npm script: `"audit:rls-canonicalise": "tsx scripts/audit/598-canonicalise-policies.ts"`.

**C. `rls-policy-drift.ts` — additive only.**

Leave the name diff, its output, `INTEGRITY_FLOORS`, `assertCorpusIntegrity` and the zero-policy
warning untouched. After the name section, add a DEFINITION section:

- Read `rls-policy-canonical.json`. Recompute the corpus hash from the migrations already on disk.
- **Artefact missing OR hash mismatch → print, loudly and by name, `DEFINITION LAYER DID NOT RUN`,
  state why (absent / stale — a migration changed a policy body and `npm run audit:rls-canonicalise`
  was not re-run), and exit with a NEW distinct code `EXIT_DEFINITIONS_NOT_CHECKED = 3`.** The RESULT
  line must never read CLEAN in this state. This is the constraint's "if canonicalisation is
  unavailable, say the definition layer DID NOT RUN".
- Otherwise read live `pg_policy` **with SELECT only** (extend the existing `queryLivePolicies` with
  `polpermissive`, `polcmd`, roles via `LEFT JOIN LATERAL unnest(p.polroles)` → `pg_roles.rolname`
  with oid `0` mapped to `public`, and both `pg_get_expr` columns). **No transaction, no DDL** — this
  is the path that runs against production.
- Print definition drift per finding: key, field, expected, live. Print `notCanonicalised` by name as
  a standing warning (as the zero-policy classification already does). Gate on definition drift:
  exit 1.
- Extend the `--json` summary with `definitionLayer: { ran, reason, corpusHash, compared, drift[],
  notCanonicalised[] }`.

Document at the top of the new section, in the file, the sentence this task exists for: **a policy
rewritten to `USING (true)` under its own name is invisible to the name diff and is exactly what this
layer catches.**
  </action>
  <verify>
```
cd apps/web
npx tsc --noEmit          # PROBE IT — inject `const __probe598: number = 'y'` into
                          # rls-policy-definitions.ts, confirm tsc reports THAT error and it is
                          # not drowned by syntax errors elsewhere, then delete the probe and
                          # grep to confirm 0 occurrences remain (CLAUDE.md "gate is blind" rule)
npm run audit:rls-canonicalise            # exit 0; prints probe-cleanup count = 0
git diff --stat scripts/audit/rls-policy-replay.ts   # MUST be empty — the name layer is untouched
npm run audit:rls-policy-drift            # against staging: name layer numbers IDENTICAL to
                                          # quick-597's (expected 180 / live 180 / 0 / 0)
mv scripts/audit/rls-policy-canonical.json /tmp/ && npm run audit:rls-policy-drift; echo "exit=$?"
                                          # MUST print DEFINITION LAYER DID NOT RUN and exit 3,
                                          # and MUST NOT print CLEAN. Restore the file.
grep -c COMMIT scripts/audit/598-canonicalise-policies.ts   # 0
```
  </verify>
  <done>
`npm run audit:rls-canonicalise` produces a committed artefact and leaves zero probe policies (proven
by exact-name count, not LIKE). `npm run audit:rls-policy-drift` reports the SAME name-level numbers
as before plus a definition verdict. With the artefact absent the run says DID NOT RUN and exits 3
without the word CLEAN. `rls-policy-replay.ts` is byte-unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Replace the 17 vacuous tests with a real staging DB suite, with per-table coverage reported by name</name>
  <files>
apps/web/tests-db/rls-isolation/env.ts
apps/web/tests-db/rls-isolation/catalogue.test.ts
apps/web/tests-db/rls-isolation/behaviour.test.ts
apps/web/tests-db/rls-isolation/source-facts.test.ts
apps/web/tests-db/rls-isolation/coverage.test.ts
apps/web/tests-db/rls-isolation/uncovered-tables.json
apps/web/vitest.db.config.ts
apps/web/package.json
apps/web/src/__tests__/isolation/group-a-isolation.test.ts   (DELETE)
apps/web/src/__tests__/isolation/group-b-isolation.test.ts   (DELETE)
apps/web/src/__tests__/isolation/group-c-isolation.test.ts   (DELETE)
  </files>
  <action>
**Placement — the CI trap comes first.** The suite lives at `apps/web/tests-db/`, which **no glob in
`vitest.config.ts` matches** (`tests/**`, `src/__tests__/**`, `src/**`). Do **not** edit
`vitest.config.ts`'s `include`/`exclude` — overriding `exclude` silently drops
`configDefaults.exclude` and is a worse landmine than the one being avoided. Add
`apps/web/vitest.db.config.ts` with `include: ['tests-db/**/*.test.ts']`, `environment: 'node'`,
`testTimeout: 60000` (quick-549: a cold vitest run in `apps/web` imports for ~82s).

npm script: `"test:rls-isolation": "vitest run --config vitest.db.config.ts"`.
Leave `"test": "vitest run"` alone.

**`env.ts`** — the shared guard, shape copied from `597-staging-fixtures.ts:1-65`: explicit dotenv of
`apps/web/.env.staging`, refuse the production ref, require the staging ref, **never import
`_bootstrap-env`**, never print a connection string. Exports `directUrl()`, `appUserUrl()`, and
`loadFixtureIds()` reading `597`'s `evidence/fixture-ids.json` (refusing if `projectRef` is not
staging). **If the env file or fixtures are absent the suite must FAIL, not skip** — the existing
`tests/isolation/setup.ts` skip-on-absent-DATABASE_URL pattern is the very shape that produces a
green tick meaning nothing, and it is not to be copied.

**`catalogue.test.ts`** — pure SELECT on `STAGING_DIRECT_URL`. Covers claims 1, 2, 4, 5, 6, 7, 8, 11,
12, 13(partial), 15, 16, 17:
- `pg_class.relrowsecurity` AND `relforcerowsecurity` for every table named in the table above, each
  asserted individually so a failure names the table.
- policy definitions (reuse Task 1's live-read query) for `loads`, `driver_pay_records`, `PushToken`:
  `org_id = current_tenant_id()` / `"tenantId" = current_tenant_id()`, and `bypass_rls_policy`
  containing `= 'on'` and NOT containing `::boolean`.
- `information_schema.columns` — the tenant column exists for each Group A/B/C table; the 6
  backfilled tables have `is_nullable = 'NO'`; plus a live `COUNT(*) WHERE "tenantId" IS NULL = 0` on
  `PushToken` (claim 13, and label it PARTIAL in the report — the historical backfill act is not
  observable).
- `information_schema.role_table_grants` — `app_user` privileges on `driver_pay_records` (claim 10).

**`behaviour.test.ts`** — as `app_user` on `STAGING_DATABASE_URL_APP_USER`, following
`597-policy-verify.ts`'s four ground rules verbatim: nothing swallowed (record SQLSTATE + full server
message), every write inside `BEGIN … ROLLBACK`, **one fresh `pg.Client` per GUC case** with all work
in ONE transaction (Supavisor transaction-mode pins the backend), each probe fenced with a SAVEPOINT.
GUC cases: tenant A, tenant B, `''`. **Do not attempt an "unset" case** — record in the file and in
the report that it is not reachable on this connection and that `''` is both what `prisma.ts:71`
writes and what a RESET leaves behind.
For every covered table, three assertions with the counter-assertion attached:
own-tenant rows > 0 **and** other-tenant rows = 0 **and** GUC `''` returns 0 without error.
Claim 3/7: in its own case, `set_config('app.bypass_rls','on',TRUE)` inside the transaction and
assert the cross-tenant count becomes > 0 — the bypass policy admitting rows is a positive assertion,
not an inference.

**`source-facts.test.ts`** — claims 9 and 14, the two that LOOK like source facts and were literal
self-assertions. Read `src/lib/db/extensions/tenant-rls.ts` from disk, `.replace(/\r\n/g,'\n')`
(quick-546: this repo is `i/lf w/crlf`, a slice that fails returns null and the assertion then passes
against an empty string), slice the real `const EXEMPT_MODELS = new Set([ … ]);` block,
**assert the slice was found (not null, not empty)**, carry a **length floor**, then assert
`DriverPayRecord` IS present and `PushToken` is NOT. A found-assertion and a floor are both required —
the failure mode of a bad slice is green, not red.

**`coverage.test.ts`** — the constraint's per-table report.
Enumerate every tenant-scoped table live (those carrying a `tenant_isolation_policy`). For each,
classify COVERED (a fixture row exists for BOTH tenants, so the behaviour probe ran) or NOT COVERED
with a **reason string** ("no fixture row — 597 fixture graph does not seed this table", "global
lookup table, no tenant column", …). Print the full list by name, in both the human output and a
JSON artefact written beside the suite.
Assert the NOT COVERED list against the checked-in `uncovered-tables.json` **in both directions** —
reuse `diffAgainstBaseline` from `rls-policy-replay.ts`: a NEW uncovered table fails (coverage
silently shrank) **and** a STALE entry fails (a table now covered but still listed). Add an
anti-vacuity floor: covered count must exceed a measured minimum, so an empty enumeration cannot pass.

**Delete the three old files** and stage the 17-row accounting table (from `<preflight_facts>`) for
Task 3's evidence document. Deletion is licensed by that table and nothing else.
  </action>
  <verify>
```
cd apps/web
npx tsx scripts/audit/597-staging-fixtures.ts --seed
npm run test:rls-isolation                 # ALL PASS. Read the `Test Files … | Tests …` summary
                                           # line — quick-557: a run whose output carries no test
                                           # counts is not a green run.
npx vitest list | grep -c "tests-db"       # MUST be 0 — the default config cannot collect the suite
DATABASE_URL=postgresql://ci:ci@localhost:5432/ci npx vitest run --reporter=default 2>&1 | tail -20
                                           # the CI shape: record the result and compare it to the
                                           # same command on a stashed tree, so any change is
                                           # attributable. Report tests/isolation/* separately —
                                           # it connects to DATABASE_URL and is pre-existing.
mv .env.staging .env.staging.bak && npm run test:rls-isolation; echo "exit=$?"
                                           # MUST be non-zero (FAIL, never skip). Restore.
npx tsc --noEmit                           # 0 errors, probed
```
  </verify>
  <done>
`npm run test:rls-isolation` passes against seeded staging and prints a per-table COVERED/NOT COVERED
list by name. The NOT COVERED list is pinned in both directions against `uncovered-tables.json`. With
`.env.staging` absent the suite exits non-zero rather than skipping. `npx vitest list` under the
default config returns zero `tests-db` paths, so CI cannot collect it. The three vacuous files are
deleted and the 17-row table is written down.
  </done>
</task>

<task type="auto">
  <name>Task 3: Prove both gates fire, run the detector against both databases, wire CI, tear down</name>
  <files>
docs/audits/phase-0-verification-gates.md   (new)
.github/workflows/rls-isolation.yml         (new)
.github/workflows/rls-policy-drift.yml      (modified)
apps/web/tests-db/rls-isolation/uncovered-tables.json  (final values)
  </files>
  <action>
**Part 3 is mandatory and BOTH directions must be QUOTED. Restoration must be VERIFIED, not assumed —
capture the original `pg_get_expr` text BEFORE mutating and diff it back byte-for-byte afterwards.**

**Proof A — the DB suite fires.** On staging, as `postgres` via `STAGING_DIRECT_URL`:
1. Capture the original definition of `loads.tenant_isolation_policy` (both `pg_get_expr` columns,
   `polcmd`, `polpermissive`, roles). Save the raw text to the evidence file.
2. Mutate it to `USING (true)` (DROP + CREATE, since there is no `ALTER POLICY` convention in this
   corpus — and note the drop/create in the evidence, because it momentarily leaves the table
   unprotected on staging).
3. `npm run test:rls-isolation` → **MUST exit non-zero.** Quote the failing assertion verbatim: the
   cross-tenant count that should be 0 and is not.
4. Restore the captured definition. Re-read `pg_get_expr` and assert it equals the captured text
   byte-for-byte; quote both.
5. Re-run the suite → passes. Quote the summary line.

**Proof B — the definition layer fires where the name layer is blind.** Same table or another:
1. Capture, then mutate a policy's `USING` **without changing its name**.
2. Run `npm run audit:rls-policy-drift`. Quote **both** halves: the name layer reporting
   `MISSING: none / UNEXPECTED: none` — *this is the demonstration that the old gate was blind* — and
   the definition layer reporting the drift with expected vs live.
3. Restore, verify byte-for-byte, re-run → both layers clean. Quote it.

**Part 4 — run the detector against BOTH databases.**
- **Staging** (`STAGING_DIRECT_URL`): name + definition, expect clean.
- **Production**: **READ-ONLY, pure SELECT, no transaction, using the checked-in canonical artefact.**
  Pin the connection inline; do **not** import `_bootstrap-env`.
  **Expect and explain, do not report as a surprise:** production carries **183** policies to
  staging's **180** because `20260913120000_rls_policy_satisfiability_fixes` is staging-only. The
  corpus (which contains that migration) therefore expects 180, so production is predicted to show
  **3 UNEXPECTED** at the name layer — `"PushToken".user_isolation_policy` and the two SysAdmin deny
  policies, all three still live on production and dropped in the corpus — **and** definition-layer
  drift on `audit_log.tenant_isolation_policy` and `in_app_notifications_insert_policy`, whose bodies
  the same migration rewrote on staging only. Confirm each against the actual run; if the observed set
  differs from this prediction, **report the difference as a finding rather than adjusting the
  prediction.** Say plainly that this is the definition layer catching a real, known-cause divergence
  on its first production run — which is the strongest available evidence it works.

**CI wiring.**
- `.github/workflows/rls-isolation.yml` — new job, credential-gated on the staging secrets, following
  `rls-policy-drift.yml`'s shape exactly: check the secret, run `npm run test:rls-isolation` when
  present, and when absent emit a loud `::warning title=RLS isolation suite DID NOT RUN::` saying a
  green tick means nothing was checked. **Never a silent pass. Do NOT add it to `ci.yml`'s
  `npx vitest run`.** State in the header that the secret does not exist today and that minting a
  database credential is a human step.
- `.github/workflows/rls-policy-drift.yml` — add an explanatory block for the definition layer, the
  new exit code 3, and that `npm run audit:rls-canonicalise` must be re-run when a migration changes a
  policy body. The job itself needs no new credential (the artefact is checked in).

**Teardown and cleanliness.**
```
npx tsx scripts/audit/597-staging-fixtures.ts --teardown
npx tsx scripts/audit/597-staging-fixtures.ts --verify-clean     # exit 0
npm run audit:rls-policy-drift                                    # staging: still clean post-teardown
```
Confirm the staging policy count is back to **180** and that the mutated policies match their captured
originals. Quote the final counts.

**`docs/audits/phase-0-verification-gates.md`** — carries: the 17-row accounting table verbatim; both
mutation transcripts with the before/after `pg_get_expr` text; the coverage table (COVERED / NOT
COVERED with reasons); both database runs with the 180-vs-183 explanation; a **"What is NOT evidence"**
section in quick-597 §6's style naming, at minimum — that a passing run with the canonical artefact
stale proves nothing (hence exit 3); that the suite covers only tables the 597 fixture graph seeds;
that the app still connects as `postgres`, so every policy under test is inert until the `app_user`
cutover; and that claim 13's historical backfill act remains unobservable.
  </action>
  <verify>
```
cd apps/web
# both proofs produce quoted transcripts in docs/audits/phase-0-verification-gates.md
grep -c "USING (true)" ../../docs/audits/phase-0-verification-gates.md      # >= 2
grep -c "MISSING: none" ../../docs/audits/phase-0-verification-gates.md     # >= 1 (the blind name layer)
npx tsx scripts/audit/597-staging-fixtures.ts --verify-clean                # exit 0
npm run audit:rls-policy-drift                                              # exit 0 against staging
npm run test:rls-isolation                                                  # passes on the restored policies
npx tsc --noEmit                                                            # 0 errors, probed
git status --porcelain                                                      # only intended files
```
  </verify>
  <done>
Both gates are proven to fail on a real mutation and to pass after a byte-verified restoration, both
quoted. The detector has been run against staging and production, and the 183-vs-180 difference is
explained by name and by cause rather than reported as a surprise. Two CI wirings exist, neither can
pass silently without a credential, and neither is inside `ci.yml`'s `npx vitest run`. Staging is torn
down and `--verify-clean` exits 0.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` in `apps/web` is 0 errors **and probed** — inject `const x: number = 'y'` into a
  file this task actually edited, confirm tsc reports THAT error, delete the probe, grep to confirm
  it is gone. If the only errors are syntax errors or sit in files nobody touched, the gate is blind,
  not green (CLAUDE.md).
- `git diff scripts/audit/rls-policy-replay.ts` is EMPTY. The name layer's parser, floors and
  328/230 reproduction numbers are untouched.
- `npm run audit:rls-policy-drift` against staging reports the same name-level numbers quick-597
  recorded, plus a definition verdict.
- `npx vitest list` under the default config returns zero `tests-db` paths.
- `npx tsx scripts/audit/597-staging-fixtures.ts --verify-clean` exits 0 at the end.
- **Nothing was written to production.** State this explicitly, naming every connection made.
- No package installed: `git diff package-lock.json` is empty.
</verification>

<success_criteria>
- The definition layer catches a same-name body rewrite; the name layer is quoted reporting clean on
  the same mutation.
- The DB suite exits non-zero on a `USING (true)` mutation and passes after a byte-verified restore.
- The detector's production run is pure SELECT and uses the checked-in canonical artefact.
- Absent/stale artefact → `DEFINITION LAYER DID NOT RUN`, exit 3, the word CLEAN never printed.
- Per-table coverage is reported BY NAME and the NOT COVERED list is pinned in both directions.
- The 17 old tests are deleted and the 17-row accounting table is reproduced in the summary and in
  `docs/audits/phase-0-verification-gates.md`.
- No assertion was weakened to make a test pass. If one could not be made to pass, it is reported.
</success_criteria>

<output>
After completion, create `.planning/quick/598-make-the-two-phase-0-verification-gates-/598-SUMMARY.md`.

It must carry, in full:
1. The **17-row accounting table** — claim, old file, and what now covers it (or that nothing does).
2. Both **mutation transcripts**, both directions, with the byte-for-byte restoration evidence.
3. The **coverage table** — every tenant-scoped table as COVERED or NOT COVERED with its reason.
4. The **staging vs production** detector runs, with the 180/183 difference explained by cause.
5. A **"What is NOT evidence"** section in quick-597 §6's style.
6. Confirmation that staging was torn down and `--verify-clean` exits 0, and that **production was
   never written to** — naming every connection made.
</output>
