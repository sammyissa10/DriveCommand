---
phase: quick-598
plan: 01
subsystem: database-security
tags: [rls, multi-tenancy, verification-gates, ci, staging]
requires:
  - quick-597 staging fixtures and the app_user matrix discipline
  - apps/web/scripts/audit/rls-policy-replay.ts (name layer, byte-unchanged)
provides:
  - RLS policy DEFINITION drift detection (bodies, not just names)
  - a real staging-backed app_user isolation suite with per-table coverage
  - two CI wirings that cannot pass silently without credentials
affects:
  - .github/workflows/rls-policy-drift.yml
  - .github/workflows/rls-isolation.yml
  - apps/web/tests/security/* (helper move, collateral)
tech-stack:
  added: []
  patterns:
    - Postgres deparse round-trip as canonicaliser instead of regex normalisation
    - a third exit code for "the check did not run", distinct from clean and drift
    - shrinking-baseline coverage list asserted in both directions
key-files:
  created:
    - apps/web/scripts/audit/rls-policy-definitions.ts
    - apps/web/scripts/audit/598-canonicalise-policies.ts
    - apps/web/scripts/audit/rls-policy-canonical.json
    - apps/web/tests-db/rls-isolation/{env,catalogue,behaviour,source-facts,coverage}.ts
    - apps/web/tests-db/rls-isolation/{uncovered-tables,coverage-report}.json
    - apps/web/vitest.db.config.ts
    - apps/web/tests/security/db-fixture-setup.ts
    - .github/workflows/rls-isolation.yml
    - docs/audits/phase-0-verification-gates.md
  modified:
    - apps/web/scripts/audit/rls-policy-drift.ts
    - apps/web/package.json
    - .github/workflows/rls-policy-drift.yml
    - apps/web/tests/security/{audit-log-isolation,carrier-driver-pii,restricted-documents}.test.ts
  deleted:
    - apps/web/src/__tests__/isolation/group-{a,b,c}-isolation.test.ts
    - apps/web/tests/isolation/{cross-tenant,dropdowns}.test.ts
    - apps/web/tests/isolation/setup.ts
decisions:
  - "tests/isolation/ DELETED rather than repaired: repair would arm a production-writing suite"
  - "one mutation observed by both gates rather than two separate mutations"
  - "the helper the three security suites shared was moved and hardened, not deleted"
metrics:
  duration: ~3h
  completed: 2026-09-14
---

# Phase quick-598: Make the two Phase 0 verification gates actually verify — Summary

**Both Phase 0 gates passed while checking nothing; both now fail on a real mutation, and the one
claim each still cannot support is printed rather than assumed.**

Full evidence document, with every transcript at length:
`docs/audits/phase-0-verification-gates.md`.

---

## 1. The 17-row accounting table — the deletion licence

`apps/web/src/__tests__/isolation/group-{a,b,c}-isolation.test.ts`, deleted. They contained zero
database references; each declared a string literal and asserted it against itself three lines
later, and all 17 passed with every policy in the database dropped (quick-597 §6).

| #   | File    | Claim                                                            | Covered by                                                                                                                                                                                     |
| --- | ------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | group-a | `loads` policy uses `org_id = current_tenant_id()`                | **YES** — `catalogue.test.ts` (`pg_policies.qual`) + `behaviour.test.ts` (app_user row counts) + the definition layer                                                                            |
| 2   | group-a | `loads` has FORCE RLS (not just ENABLE)                           | **YES** — `pg_class.relrowsecurity` AND `relforcerowsecurity`                                                                                                                                   |
| 3   | group-a | `bypass_rls_policy` admits service-role queries                   | **YES** — `behaviour.test.ts` sets `app.bypass_rls='on'` as app_user and asserts cross-tenant rows BECOME visible. A positive assertion                                                          |
| 4   | group-a | Group A tables all use `org_id`                                   | **YES** — `information_schema.columns` + the policy `qual`, one assertion per named table                                                                                                       |
| 5   | group-b | `driver_pay_records` policy uses `org_id = current_tenant_id()`    | **YES** — `catalogue.test.ts`                                                                                                                                                                   |
| 6   | group-b | `driver_pay_records` FORCE RLS                                    | **YES** — `catalogue.test.ts`                                                                                                                                                                   |
| 7   | group-b | `bypass_rls_policy` on `driver_pay_records`                       | **YES** — exists, compares text, no `::boolean`                                                                                                                                                 |
| 8   | group-b | Group B tables all use `org_id`                                   | **YES** — `catalogue.test.ts`                                                                                                                                                                   |
| 9   | group-b | `DriverPayRecord` in `EXEMPT_MODELS`                              | **YES** — `source-facts.test.ts` READS `src/lib/db/extensions/tenant-rls.ts`. The old test declared its own inline array and asserted it contained the value it had just written into it          |
| 10  | group-b | `driver_pay_records` GRANT to app_user                            | **YES** — `information_schema.role_table_grants`. The old test built a `grantStatement` string and asserted it contained its own substrings                                                      |
| 11  | group-c | `PushToken` policy uses `"tenantId" = current_tenant_id()`         | **YES** — catalogue + behaviour                                                                                                                                                                 |
| 12  | group-c | `PushToken` FORCE RLS                                             | **YES** — `catalogue.test.ts`                                                                                                                                                                   |
| 13  | group-c | `PushToken.tenantId` backfilled from `User.tenantId`              | **PARTIAL** — column asserted NOT NULL and a live `COUNT(*) WHERE "tenantId" IS NULL` asserted 0. **The historical backfill ACT is not observable and is not claimed**                           |
| 14  | group-c | `PushToken` removed from `EXEMPT_MODELS`                          | **YES** — `source-facts.test.ts`, as #9                                                                                                                                                         |
| 15  | group-c | all 6 backfilled tables have `tenantId` NOT NULL                  | **YES** — `information_schema.columns`, one assertion per table                                                                                                                                 |
| 16  | group-c | Group C tables use `"tenantId"`                                   | **YES** — per table                                                                                                                                                                             |
| 17  | group-c | `bypass_rls_policy` on `PushToken` uses text not `::boolean`       | **YES** — catalogue + the canonical compare                                                                                                                                                     |

**16 of 17 have a real replacement. 1 is PARTIAL (claim 13). 0 cover nothing.**

`catalogue.test.ts` additionally asserts the ABSENCE of `PushToken.user_isolation_policy` and of
the SysAdmin "deny" pair (quick-597's drops), so they cannot be reinstated silently.

---

## 2. The 10-row accounting table for `tests/isolation/` — the third blind gate

Measured first, reproducing CI's exact shape:

```
 Test Files  2 failed (2)
      Tests  no tests
❯ tests/isolation/setup.ts:23:12
     23|   prisma = new PrismaClient();
```

Both files fail at IMPORT under Prisma 7. **The ten tests have never executed once** — the suite
reports "no tests", not a pass and not a skip.

### Choice: (b) DELETE. Justification, in order of weight

1. **Repair would ARM a production-writing suite.** Every `beforeAll` calls `createTestTenant()`,
   which does `prisma.tenant.create(...)` against whatever `DATABASE_URL` names.
   `scripts/_bootstrap-env.ts:53-55` sets `DATABASE_URL = DIRECT_URL` unconditionally and `.env`,
   `.env.local` and `apps/web/.env.local` ALL point `DIRECT_URL` at PRODUCTION. The only thing
   standing between this file and tenants written into the production database was a constructor
   that happens not to compile.
2. **Nothing is lost, because nothing was gained.** Zero executions, zero coverage.
3. **They were not RLS tests.** They exercise the `withTenantRLS` Prisma extension while connected
   as `postgres` (`rolbypassrls = true`), so RLS is inert for every query they make.
   `dropdowns.test.ts`'s own header admits it for the carrier models: *"These tests verify pattern
   (b)"* — the explicit `orgId` filter, not the policy.

| #   | File         | Claim                                              | Covered by                                                                                                                                                             |
| --- | ------------ | -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | cross-tenant | Tenant A can only see their own users              | **YES** — `behaviour.test.ts`, `User` under `GUC = tenant A`: 4 own rows, 0 of tenant B's, at the DATABASE layer as app_user (strictly stronger than the app-layer version) |
| 2   | cross-tenant | Tenant B can only see their own users              | **YES** — mirrored                                                                                                                                                     |
| 3   | cross-tenant | Query without tenant context returns zero results  | **YES** — the `GUC = ''` case, 0 rows on all 16 targets, and it distinguishes "returned 0" from "raised"                                                                |
| 4   | cross-tenant | Cross-tenant **update** fails                      | **PARTIAL** — a cross-tenant **DELETE** is probed on 4 leaf tables with the own-tenant DELETE as counter-assertion. UPDATE specifically is not probed                    |
| 5   | cross-tenant | Cross-tenant **delete** fails                      | **YES** — cross-tenant DELETE probes, rolled back twice over and then verified intact                                                                                   |
| 6   | dropdowns    | Loads dropdown: tenant A sees exactly 3 loads      | **PARTIAL** — legacy `Load` (PascalCase, `tenantId`) is NOT seeded and is listed NOT COVERED; the carrier `loads` table IS covered                                      |
| 7   | dropdowns    | Trucks dropdown                                    | **PARTIAL** — legacy `Truck` NOT COVERED; `carrier_trucks` COVERED                                                                                                     |
| 8   | dropdowns    | Carrier drivers dropdown                           | **YES** — `carrier_drivers` COVERED, 2 rows per tenant                                                                                                                 |
| 9   | dropdowns    | Clients dropdown                                   | **YES** — `clients` COVERED                                                                                                                                            |
| 10  | dropdowns    | Facilities dropdown                                | **YES** — `facilities` COVERED, 2 rows per tenant                                                                                                                      |

**6 of 10 fully replaced, 4 PARTIAL, 0 cover nothing.**

**What is genuinely NOT carried forward:** these ten tested the `withTenantRLS` Prisma EXTENSION;
the replacement tests the DATABASE. The extension's injection logic now has no dedicated test.
It had none before either — the tests that claimed to had never run — so this is a pre-existing
gap made visible, not one created here.

### Was `ci.yml`'s Vitest red before this task? YES — measured

Same command as CI, same JSON reporter both times:

| Run               | Tests | Passed | Failed | Skipped | Failed files |
| ----------------- | ----- | ------ | ------ | ------- | ------------ |
| BEFORE (at HEAD)  | 1925  | 1801   | **69** | 52      | **36**       |
| AFTER             | 1940  | 1793   | **69** | 75      | **34**       |

`tests/isolation/` was 2 of the 36 failing files and contributed **0** of the 69 failing tests.
Zero newly-failing files. CI stays red for 34 pre-existing reasons unrelated to this task.

`+15` decomposes exactly: `-17` deleted vacuous tests, `+32` newly COLLECTED in the three
`tests/security/` suites (see §7).

---

## 3. Both mutation transcripts, both directions

Staging digest (SHA-256 over every public policy's table/name/permissive/cmd/qual/with_check,
sorted) **before**: `policyCount=180`, `digest=dbd4a8537cb050485b74b953afa1d8f5e3a1d29c8da464677027ad2103096623`.

Captured `loads.tenant_isolation_policy`:
`using = "(org_id = current_tenant_id())"`, `with_check = "(org_id = current_tenant_id())"`,
`permissive = true`, `cmd = "*"`, `roles = ["public"]`.
Mutated to `using = "true"`, `with_check = "true"` (DROP + CREATE — the corpus has zero
`ALTER POLICY`; this momentarily leaves staging's `loads` unprotected, stated rather than hidden).

**(a) The DB suite FAILS — exit 1**

```
     × loads: GUC = tenant A sees A rows and ZERO B rows 13ms
     × loads: GUC = tenant B sees B rows and ZERO A rows 1ms
     × loads: GUC = '' returns zero rows WITHOUT raising 1ms
     × claim 1: loads.tenant_isolation_policy uses org_id = current_tenant_id() 10ms
     × claim 4: loads isolation policy scopes by org_id 1ms
 Test Files  2 failed | 2 passed (4)
      Tests  5 failed | 145 passed (150)

AssertionError: loads: CROSS-TENANT LEAK - tenant A can see tenant B rows: expected 1 to be +0 // Object.is equality
- Expected
+ Received
- 0
+ 1
 ❯ tests-db/rls-isolation/behaviour.test.ts:238:83
```

**(b) The NAME layer is blind; the DEFINITION layer is not** — same mutation, same run of
`npm run audit:rls-policy-drift`:

```
  Policies expected (net)  : 180
  Policies live            : 180
  Missing (expected−live)  : 0
  Unexpected (live−expect) : 0

MISSING: none.

UNEXPECTED: none.
```

```
DEFINITION LAYER (quick-598) — policy BODIES, not just names:
  Policies compared        : 180
  Definition drift         : 2

DEFINITION DRIFT (live body differs from the migration-declared body):
  - loads.tenant_isolation_policy [using]
      expected: (org_id = current_tenant_id())
      live    : true
  - loads.tenant_isolation_policy [withCheck]
      expected: (org_id = current_tenant_id())
      live    : true

RESULT: DRIFT DETECTED (exit 1)
```

**(c) Restored, and VERIFIED by reading `pg_policy` back**

```
CAPTURED : {"table_name":"loads","policy_name":"tenant_isolation_policy","permissive":true,"cmd":"*","roles":["public"],"using":"(org_id = current_tenant_id())","with_check":"(org_id = current_tenant_id())"}
LIVE NOW : {"table_name":"loads","policy_name":"tenant_isolation_policy","permissive":true,"cmd":"*","roles":["public"],"using":"(org_id = current_tenant_id())","with_check":"(org_id = current_tenant_id())"}
BYTE-FOR-BYTE IDENTICAL: true
```

**(d) Both gates clean again**

```
 Test Files  4 passed (4)
      Tests  150 passed (150)
```
```
  Policies compared        : 180
  Definition drift         : 0
RESULT: CLEAN (exit 0) — repo and database agree on policy NAMES and BODIES.
```

Staging digest **after** everything including teardown: `policyCount=180`,
`digest=dbd4a8537cb050485b74b953afa1d8f5e3a1d29c8da464677027ad2103096623` — **identical**.

**Artefact absent and artefact stale** both print `**DEFINITION LAYER DID NOT RUN**`, exit **3**,
and the word `CLEAN` appears **zero** times in either output (grep-counted).

---

## 4. The coverage table

89 tables on staging carry a `tenant_isolation_policy`. **16 COVERED, 73 NOT COVERED**, every one
named on every run and pinned both ways against `uncovered-tables.json` via `diffAgainstBaseline`.

| Table                  | Status  | Basis                                                              |
| ---------------------- | ------- | ------------------------------------------------------------------ |
| `User`                 | COVERED | 4 tenant-A / 4 tenant-B fixture rows (direct)                       |
| `PushToken`            | COVERED | 1 / 1 (direct)                                                      |
| `SysAdminInvoice`      | COVERED | 1 / 1 (direct)                                                      |
| `SysAdminInvoiceItem`  | COVERED | 1 / 1 (direct)                                                      |
| `audit_log`            | COVERED | 1 / 1 (direct)                                                      |
| `in_app_notifications` | COVERED | 1 / 1 (direct)                                                      |
| `loads`                | COVERED | 1 / 1 (direct)                                                      |
| `dispatches`           | COVERED | 1 / 1 (direct)                                                      |
| `clients`              | COVERED | 1 / 1 (direct)                                                      |
| `facilities`           | COVERED | 2 / 2 (direct)                                                      |
| `carrier_drivers`      | COVERED | 2 / 2 (direct)                                                      |
| `carrier_trucks`       | COVERED | 1 / 1 (direct)                                                      |
| `route_templates`      | COVERED | 1 / 1 (direct)                                                      |
| `stops`                | COVERED | 2 / 2 (**derived** — EXISTS through `dispatches`)                    |
| `carrier_documents`    | COVERED | 1 / 1 (**derived** — EXISTS through `"User"`)                        |
| `route_template_stops` | COVERED | 2 / 2 (**derived** — EXISTS through `route_templates`)               |

NOT COVERED (73), by reason kind:

| Reason                                                                                              | Count | Examples                                                            |
| --------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------------- |
| Not seeded by the quick-597 fixture graph, so no behaviour probe reaches it                         | 69    | `Load`, `Truck`, `Invoice`, `driver_pay_records`, `SupportTicket`, … |
| Not seeded **and** its policy compares the GUC TEXT directly rather than calling `current_tenant_id()` | 2     | `Tag`, `TagAssignment`                                              |
| Not seeded **and** its policy also admits non-tenant-scoped rows                                    | 1     | `AutomationRule` (`scope = 'SYSTEM' OR …`)                          |
| No tenant column — EXISTS through a parent — **and** not seeded                                     | 1     | `TicketMessage`                                                     |

Full per-table list: `apps/web/tests-db/rls-isolation/uncovered-tables.json` and
`coverage-report.json`.

---

## 5. Staging vs production — the 180/183 difference, by cause

**Staging** (`wyixpgunnjmzguhggocz`), exit 0: 151 migration files, 418 statements, 180 expected,
180 live, 0 missing, 0 unexpected, 180 compared, 0 definition drift.

**Production** (`oqdhberkghtnszrkdvfm`), READ-ONLY, exit 1:

```
  Policies expected (net)  : 180
  Policies live            : 183
  Missing (expected−live)  : 0
  Unexpected (live−expect) : 3

MISSING: none.

UNEXPECTED (live, no migration creates it):
  - PushToken.user_isolation_policy
  - SysAdminInvoice.sysadmin_invoices_deny_tenant_users
  - SysAdminInvoiceItem.sysadmin_invoice_items_deny_tenant_users

DEFINITION LAYER (quick-598) — policy BODIES, not just names:
  Policies compared        : 180
  Definition drift         : 2

DEFINITION DRIFT (live body differs from the migration-declared body):
  - audit_log.tenant_isolation_policy [using]
      expected: (tenant_id = current_tenant_id())
      live    : (tenant_id = (current_setting('app.current_tenant_id'::text, true))::uuid)
  - in_app_notifications.in_app_notifications_insert_policy [withCheck]
      expected: (org_id = current_tenant_id())
      live    : true

  NOT CANONICALISED (live, no canonical entry — body unchecked): 3
    - PushToken.user_isolation_policy
    - SysAdminInvoice.sysadmin_invoices_deny_tenant_users
    - SysAdminInvoiceItem.sysadmin_invoice_items_deny_tenant_users

RESULT: DRIFT DETECTED (exit 1)
```

**One cause.** `20260913120000_rls_policy_satisfiability_fixes` (quick-597) is applied to staging
only. Its five changes are, in order: the `audit_log` cast rewrite (drift 1), the
`PushToken.user_isolation_policy` DROP (unexpected 1), the SysAdmin deny-pair DROP (unexpected 2
and 3), and the `in_app_notifications_insert_policy` `WITH CHECK` rewrite (drift 2). **The observed
set matched the prediction exactly; nothing else differed.**

**Named definition-drift list: `audit_log.tenant_isolation_policy` [using] and
`in_app_notifications.in_app_notifications_insert_policy` [withCheck]. Those two, and no others.**

This is the definition layer catching a real, known-cause divergence on its first production run,
and the `audit_log` finding is the literal expression quick-597 measured raising
`ERROR [22P02] invalid input syntax for type uuid: ""` as `app_user` — which the name layer
reported, and will keep reporting, as clean. Neither drift is a regression and neither is fixed
here; applying the migration is a deploy, not an audit.

---

## 6. What is NOT evidence

1. **A green drift run with a STALE canonical artefact proves nothing about bodies** — which is why
   that state exits 3 and never prints CLEAN. Change a policy body in a migration and
   `npm run audit:rls-canonicalise` + the regenerated artefact belong in the same commit.
2. **The suite covers 16 of 89 tenant-scoped tables.** A pass says nothing about the other 73. The
   limit is the fixture graph, not the policies, and the list is printed every run.
3. **The application still connects as `postgres` (`rolbypassrls = true`).** Every policy tested is
   INERT in production today. A green run says what WILL happen at the `app_user` cutover.
4. **Claim 13's historical backfill act remains unobservable.** The outcome is asserted; the act is
   not claimed.
5. **`rls-isolation.yml` has no credentials and checks nothing today.** `STAGING_DIRECT_URL` and
   `STAGING_DATABASE_URL_APP_USER` do not exist as repository secrets. The job emits a loud
   `::warning`. A green tick there means nothing was checked. Minting a DB credential is a human step.
6. **The `''` GUC case is not an "unset GUC" case and is not claimed to be.** A genuinely unset
   `app.current_tenant_id` is unreachable on the app_user pooler (quick-597 §7.3): after the
   placeholder is set, neither `set_config(name, NULL, false)` nor `RESET` returns
   `current_setting(name, true)` to NULL — the reset value is `''`, which is also what
   `lib/db/prisma.ts:71` writes on every new physical connection.
7. **The definition layer compares only keys present in BOTH sets.** A live policy with no canonical
   entry is `NOT CANONICALISED` — printed by name, does not gate. Production has three.
8. **`stops`, `carrier_documents` and `route_template_stops` carry no `bypass_rls_policy`.** Under
   `app.bypass_rls='on'` they return zero rows — measured, and asserted, so adding one becomes a
   visible failure. Do not read "the bypass mechanism works" as covering these three.
9. **CI's `npx vitest run` is red and was red before this task** (34 failing files remain), for
   reasons outside this task.
10. **`src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` still carries the deleted pattern** —
    `describe.skip` on a missing `DATABASE_URL` plus a `beforeAll` that writes tenants. Reported,
    not fixed.
11. **The three `tests/security/` suites still skip rather than fail without a database.** Their
    unit sections now run; their database claims are still unchecked on a green tick.

---

## 7. Deviations from plan

### Auto-fixed

**1. [Rule 3 — Blocking] Deleting `tests/isolation/setup.ts` broke `npx tsc --noEmit` with three
TS2307 errors**
- **Found during:** Task 3, by the mandated tsc probe (the probe reported its own injected error
  AND three TS2307s that had not been there before).
- **Issue:** `tests/security/{audit-log-isolation,carrier-driver-pii,restricted-documents}.test.ts`
  all import `../isolation/setup`. The tsc baseline must be 0 (CLAUDE.md).
- **Fix:** moved the helper to `apps/web/tests/security/db-fixture-setup.ts` beside its only
  consumers, repointed the three imports, and — because the fix would otherwise have *armed* the
  hazard that justified deleting the suite — gave it the Prisma 7 adapter constructor **and a hard
  refusal on the production project ref**. It creates tenants; every env file here points
  `DATABASE_URL` at production.
- **Measured effect:** those three files went from 0 collected tests each to 5 / 3 / 24, of which 9
  genuinely pass (`restricted-documents.test.ts`'s pure unit section, which had never executed).
  Failed tests unchanged at 69; failed files 36 → 34.
- **Commit:** b45ecbb9

### Corrections to the plan

1. **`grep -c COMMIT scripts/audit/598-canonicalise-policies.ts` cannot be 0 and the check is
   wrong.** It returns **3**, and all three are prose about committing the artefact to git. The
   file's own header now states the correct check —
   `grep -nE "query\(\s*'COMMIT"`, which returns nothing — and explains why a bare word-count guard
   would be "fixed" by deleting a sentence. The real proof is not textual: the probe-cleanup
   assertion re-reads `pg_policy` after the rollback and fails the run if one probe survived
   (measured: 0 of 180, by exact name, plus a belt-and-braces `LIKE 'q598%'` also 0).
2. **The name layer's numbers are 418 statements / 180 expected / 151 files, not 328/230/141.**
   Those are quick-584's historical reproduction numbers, still correct as comments in
   `rls-policy-replay.ts` (which is byte-unchanged) but not the current corpus. `DEFINITION_FLOORS`
   is calibrated against the real measured values: 265 definitions parsed, 180 expected, 180
   canonicalised, 180 compared.
3. **Proof A and Proof B were run against ONE mutation rather than two.** Deliberate: the name layer
   and the definition layer then look at the *identical* change, so "blind" and "caught" cannot be
   attributed to different inputs — and it halves the time a staging table spends unprotected.
   Restoration was still verified byte-for-byte by reading `pg_policy` back before re-running.
4. **The bypass assertion could not be uniform across the 16 targets.** Measured: `stops`,
   `carrier_documents` and `route_template_stops` carry ONLY `tenant_isolation_policy`, so under
   `app.bypass_rls='on'` they return 0. The test derives the expectation from the catalogue and
   asserts BOTH branches, with a floor so that deleting every bypass policy cannot send all 16 down
   the permissive branch and stay green.
5. **Cross-tenant WRITE probes were added** beyond the plan's read-only behaviour matrix, to carry
   claims 4 and 5 of the `tests/isolation/` ten. Rolled back at the savepoint AND at the
   transaction, then verified intact by a fresh `postgres` read.

---

## 8. Cleanliness

- `npx tsx scripts/audit/597-staging-fixtures.ts --teardown` then `--verify-clean`: **exit 0**,
  eleven tables at 0 rows.
- Staging policy digest identical before and after: `dbd4a853…096623`, 180 policies.
- Canonicaliser probe policies remaining, by **exact-name array** over all 180 names: **0**
  (a prefix `LIKE '__p%'` matched **86 real policies** during design — `_` is a LIKE wildcard).
- `npx tsc --noEmit` in `apps/web`: **0 errors, probed live** three times (into
  `rls-policy-definitions.ts`, `tests-db/rls-isolation/env.ts` and `rls-policy-drift.ts`); each
  probe was reported by tsc and then removed, `grep -rn "__probe598"` returns nothing.
- `git diff package-lock.json`: empty. **No package installed.**
- `git diff scripts/audit/rls-policy-replay.ts`: **empty**. The name layer's parser, floors and
  reproduction numbers are byte-unchanged.
- `npx vitest list` under the default config: **0** `tests-db` paths — CI cannot collect the DB suite.
- **PRODUCTION WAS NEVER WRITTEN TO.** Every connection this task made, named:
  | Target | Role | Purpose | Writes |
  | --- | --- | --- | --- |
  | staging `STAGING_DIRECT_URL` | `postgres` | canonicaliser deparse round-trip | DDL inside `BEGIN…ROLLBACK`, 0 survivors |
  | staging `STAGING_DIRECT_URL` | `postgres` | fixture seed / teardown / verify-clean | yes, on disposable tenants, all removed |
  | staging `STAGING_DIRECT_URL` | `postgres` | catalogue + coverage reads, drift runs | none |
  | staging `STAGING_DIRECT_URL` | `postgres` | the two Part-3 policy mutations | DROP/CREATE, restored and verified |
  | staging `STAGING_DATABASE_URL_APP_USER` | `app_user` | the behaviour matrix | SELECTs + DELETEs rolled back twice over |
  | **production `DIRECT_URL`** | `postgres` | **one detector run, §5** | **none — three `$queryRawUnsafe` SELECTs against `pg_catalog`, no transaction, no DDL** |

## Self-Check: PASSED
All created files verified present on disk; all three commit hashes verified present in
`git log --all`.
