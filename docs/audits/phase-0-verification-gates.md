# Phase 0 verification gates — what they now check, and what they still do not

**quick-598.** Written 2026-09-14. Every number, transcript and exit code below was
measured on the run that produced this file; nothing here is predicted.

Two Phase 0 gates were passing while checking nothing, and both failure modes were already
measured before this task started:

1. **The 17 tests in `apps/web/src/__tests__/isolation/` were VACUOUS.** They contained zero
   database references. Each one declared a string literal and asserted that literal against
   itself three lines later. They passed identically with every policy in the database dropped
   (quick-597 §6).
2. **`npm run audit:rls-policy-drift` validated NAMES ONLY.** It diffed `(table, policy_name)`
   identity. A policy rewritten to `USING (true)` under its existing name was invisible to it.

A third was found by the orchestrator after the plan was written and is handled here too:

3. **The 10 tests in `apps/web/tests/isolation/` had NEVER EXECUTED.** Both files failed at
   *import* under Prisma 7. Their own header calls them *"the most critical tests in the entire
   project - failure here means data leakage."*

---

## 1. The 17-row accounting table (the deletion licence)

`src/__tests__/isolation/group-{a,b,c}-isolation.test.ts`, deleted. Replacement column names the
file in `apps/web/tests-db/rls-isolation/` that now carries the claim.

| #   | File    | Claim                                                                                                             | Covered by                                                                                                                                                                                                                                       |
| --- | ------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | group-a | `loads` policy uses `org_id = current_tenant_id()`                                                                 | **YES** — `catalogue.test.ts` (`pg_policies.qual`) + `behaviour.test.ts` (app_user row counts) + the drift detector's definition layer                                                                                                            |
| 2   | group-a | `loads` has FORCE RLS (not just ENABLE)                                                                            | **YES** — `catalogue.test.ts`, `pg_class.relrowsecurity` AND `relforcerowsecurity`                                                                                                                                                                |
| 3   | group-a | `bypass_rls_policy` admits service-role queries                                                                    | **YES** — `behaviour.test.ts` sets `app.bypass_rls='on'` as app_user and asserts cross-tenant rows BECOME visible. A positive assertion, where the old test inferred it from a string                                                              |
| 4   | group-a | Group A tables all use `org_id`                                                                                    | **YES** — `catalogue.test.ts`, `information_schema.columns` + the policy `qual`, per table, each named                                                                                                                                            |
| 5   | group-b | `driver_pay_records` policy uses `org_id = current_tenant_id()`                                                     | **YES** — `catalogue.test.ts`                                                                                                                                                                                                                    |
| 6   | group-b | `driver_pay_records` FORCE RLS                                                                                     | **YES** — `catalogue.test.ts`                                                                                                                                                                                                                    |
| 7   | group-b | `bypass_rls_policy` on `driver_pay_records`                                                                        | **YES** — `catalogue.test.ts` (exists, compares text, no `::boolean`)                                                                                                                                                                            |
| 8   | group-b | Group B tables all use `org_id`                                                                                    | **YES** — `catalogue.test.ts`                                                                                                                                                                                                                    |
| 9   | group-b | `DriverPayRecord` in `EXEMPT_MODELS`                                                                               | **YES** — `source-facts.test.ts` READS `src/lib/db/extensions/tenant-rls.ts`. The old test declared its own inline array and asserted that array contained the value it had just written into it                                                   |
| 10  | group-b | `driver_pay_records` GRANT to app_user                                                                             | **YES** — `catalogue.test.ts`, `information_schema.role_table_grants`. The old test built a `grantStatement` string literal and asserted it contained its own substrings                                                                          |
| 11  | group-c | `PushToken` policy uses `"tenantId" = current_tenant_id()`                                                          | **YES** — `catalogue.test.ts` + `behaviour.test.ts`                                                                                                                                                                                              |
| 12  | group-c | `PushToken` FORCE RLS                                                                                              | **YES** — `catalogue.test.ts`                                                                                                                                                                                                                    |
| 13  | group-c | `PushToken.tenantId` backfilled from `User.tenantId`                                                               | **PARTIAL** — the column is asserted NOT NULL and a live `COUNT(*) WHERE "tenantId" IS NULL` is asserted to be 0. **The historical backfill ACT is not observable now and nothing in this repository can make it observable.** Not claimed        |
| 14  | group-c | `PushToken` removed from `EXEMPT_MODELS`                                                                           | **YES** — `source-facts.test.ts`, as #9                                                                                                                                                                                                          |
| 15  | group-c | all 6 backfilled tables have `tenantId` NOT NULL (`PlaybookStep`, `PushToken`, `RouteDriver`, `StepInstance`, `SysAdminInvoiceItem`, `UserNotificationPreference`) | **YES** — `catalogue.test.ts`, `information_schema.columns`, one assertion per table                                                                                                                                                             |
| 16  | group-c | Group C tables use `"tenantId"`                                                                                    | **YES** — `catalogue.test.ts`, per table                                                                                                                                                                                                         |
| 17  | group-c | `bypass_rls_policy` on `PushToken` uses text comparison not `::boolean`                                             | **YES** — `catalogue.test.ts` + the definition layer's canonical compare                                                                                                                                                                         |

**Counts: 16 of 17 have a real replacement. 1 is PARTIAL (claim 13). 0 cover nothing.**

Claims 11 and 12 still hold. quick-597 DROPPED `PushToken.user_isolation_policy`; no old test
asserted that policy, so nothing above is invalidated, and `catalogue.test.ts` now asserts its
**absence** so it cannot be reinstated silently.

---

## 2. The 10-row accounting table for `tests/isolation/`

Measured first, reproducing CI's exact shape
(`DATABASE_URL="postgresql://ci:ci@localhost:5432/ci" npx vitest run tests/isolation/`):

```
 Test Files  2 failed (2)
      Tests  no tests
❯ tests/isolation/setup.ts:23:12
     21| if (process.env.DATABASE_URL) {
     22|   // @ts-ignore - Prisma 7 type issue with constructor
     23|   prisma = new PrismaClient();
```

`new PrismaClient()` is invalid under Prisma 7, which requires `new PrismaClient({ adapter })`.
Both files fail at import. The suite reports **"no tests"** — not a pass, not a skip. Locally
`vitest.config.ts` loads no `.env`, so `DATABASE_URL` is undefined and `describe.skip` hides
them; in CI `DATABASE_URL` is the dummy, so the import runs and throws.

### The choice: DELETED, not repaired

**(b) delete.** Three reasons, in order of weight:

1. **Repair would ARM a production-writing suite.** Every `beforeAll` here calls
   `createTestTenant()`, which does `prisma.tenant.create(...)` against whatever `DATABASE_URL`
   names. `scripts/_bootstrap-env.ts:53-55` sets `DATABASE_URL = DIRECT_URL` unconditionally and
   **`.env`, `.env.local` and `apps/web/.env.local` all point `DIRECT_URL` at PRODUCTION**. The
   only thing standing between this file and tenants written into the production database was a
   constructor that happens not to compile. Putting an adapter on it removes that.
2. **Nothing is lost, because nothing was ever gained.** These ten tests have never executed. There
   is no coverage to preserve, only a claim to re-home.
3. **They were not RLS tests.** They exercise the `withTenantRLS` Prisma extension's
   application-layer `tenantId` injection while connected as `postgres` (`rolbypassrls = true`), so
   RLS is inert for every query they make. `dropdowns.test.ts`'s own header admits this for the
   carrier models: *"These tests verify pattern (b)"* — the explicit `orgId` filter, not the policy.

| #   | File         | Claim                                                     | Covered by                                                                                                                                                                                                |
| --- | ------------ | --------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | cross-tenant | Tenant A can only see their own users                     | **YES** — `behaviour.test.ts`, `User` under `GUC = tenant A`: 4 own rows visible, 0 of tenant B's. At the DATABASE layer, as app_user, which is strictly stronger than the app-layer version                |
| 2   | cross-tenant | Tenant B can only see their own users                     | **YES** — same, mirrored                                                                                                                                                                                  |
| 3   | cross-tenant | Query without tenant context returns zero results         | **YES** — `behaviour.test.ts` `GUC = ''` case, 0 rows on all 16 targets, and it distinguishes "returned 0" from "raised" (see §6)                                                                          |
| 4   | cross-tenant | Cross-tenant update fails                                 | **PARTIAL** — `behaviour.test.ts` asserts a cross-tenant **DELETE** affects zero rows on 4 leaf tables, with the own-tenant DELETE as counter-assertion. UPDATE specifically is not probed; the RLS `USING` clause that blocks one blocks the other |
| 5   | cross-tenant | Cross-tenant delete fails                                 | **YES** — `behaviour.test.ts`, cross-tenant DELETE probes (rolled back twice over, then verified intact)                                                                                                   |
| 6   | dropdowns    | Loads dropdown: tenant A sees exactly 3 loads             | **PARTIAL** — the legacy `Load` table (PascalCase, `tenantId`) is NOT seeded and is listed NOT COVERED in §5. The carrier `loads` table IS covered                                                          |
| 7   | dropdowns    | Trucks dropdown: tenant A sees exactly 3 trucks           | **PARTIAL** — legacy `Truck` NOT COVERED; carrier `carrier_trucks` COVERED                                                                                                                                |
| 8   | dropdowns    | Carrier drivers dropdown                                  | **YES** — `carrier_drivers` COVERED, 2 rows per tenant                                                                                                                                                    |
| 9   | dropdowns    | Clients dropdown                                          | **YES** — `clients` COVERED                                                                                                                                                                               |
| 10  | dropdowns    | Facilities dropdown                                       | **YES** — `facilities` COVERED, 2 rows per tenant                                                                                                                                                         |

**Counts: 6 of 10 fully replaced, 3 PARTIAL, 1 (claim 4) PARTIAL. 0 cover nothing.**

**What genuinely is not carried forward, stated rather than buried:** these ten tested the
`withTenantRLS` Prisma EXTENSION. The replacement tests the DATABASE. Those are different
mechanisms with different guarantees, and the extension's injection logic now has no dedicated
test of its own. It was never actually tested before either — the tests that claimed to had
never run — so this is a pre-existing gap made visible, not one created here. The nearest live
coverage is `src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts`, which carries the same
`describe.skip`-on-missing-`DATABASE_URL` shape and the same production-write hazard, and is
**reported here, not touched**, because it is outside this task's scope.

### Was `ci.yml`'s Vitest step red before this task?

**Yes — measured, and not because of `tests/isolation/` alone.** Same command as CI, same JSON
reporter both times:

| Run                   | Tests    | Passed   | Failed | Skipped | Failed files |
| --------------------- | -------- | -------- | ------ | ------- | ------------ |
| BEFORE (at HEAD)      | 1925     | 1801     | **69** | 52      | **36**       |
| AFTER (this task)     | 1940     | 1793     | **69** | 75      | **34**       |

The failed-file count drops by exactly 2 — `tests/isolation/cross-tenant.test.ts` and
`tests/isolation/dropdowns.test.ts` — and the failed-TEST count is unchanged at 69, because those
two files contributed zero failing tests (they contributed "no tests"). **Zero newly-failing
files.**

The `+15` total decomposes exactly: `-17` deleted vacuous tests, `+32` newly COLLECTED tests in
the three `tests/security/` suites. Those three imported the deleted `tests/isolation/setup.ts`.
Deleting it broke `npx tsc --noEmit` with three `TS2307` errors against a baseline that must be
zero, so the helper was moved to `tests/security/db-fixture-setup.ts` — and while moving it, the
Prisma 7 constructor was fixed and a **hard refusal on the production project ref** was added
(see §2's reason 1: the helper writes tenants, and every env file in this repo points
`DATABASE_URL` at production). Consequence, measured: those three files previously failed at
import and contributed 0 tests each; they now contribute 5 / 3 / 24, of which 9 genuinely pass
(`restricted-documents.test.ts`'s pure unit section, which had never executed) and 23 skip
because no reachable database is configured. The three files still fail at the hook level, which
is where they were before.

CI's Vitest step remains red for 34 pre-existing reasons that have nothing to do with this task.

---

## 3. Proof that the gates fire — both mutations, both directions, quoted

Staging policy digest **before** anything below (SHA-256 over every public policy's
table/name/permissive/cmd/qual/with_check, sorted):

```
policyCount=180
digest=dbd4a8537cb050485b74b953afa1d8f5e3a1d29c8da464677027ad2103096623
```

### 3.1 Capture

`loads.tenant_isolation_policy`, read from `pg_policy` before any change:

```json
{
  "table_name": "loads",
  "policy_name": "tenant_isolation_policy",
  "permissive": true,
  "cmd": "*",
  "roles": ["public"],
  "using": "(org_id = current_tenant_id())",
  "with_check": "(org_id = current_tenant_id())"
}
```

### 3.2 Mutate

There is no `ALTER POLICY` convention in this corpus (grep-verified: zero occurrences), so the
mutation is `DROP POLICY` + `CREATE POLICY` under the same name. **That momentarily leaves the
staging `loads` table without its tenant isolation policy**, which is stated rather than hidden;
staging held two disposable fixture tenants and nothing else at the time.

```json
{
  "table_name": "loads",
  "policy_name": "tenant_isolation_policy",
  "permissive": true,
  "cmd": "*",
  "roles": ["public"],
  "using": "true",
  "with_check": "true"
}
```

### 3.3 Proof A — the DB suite FAILS (exit 1)

```
     × loads: GUC = tenant A sees A rows and ZERO B rows 13ms
     × loads: GUC = tenant B sees B rows and ZERO A rows 1ms
     × loads: GUC = '' returns zero rows WITHOUT raising 1ms
     × claim 1: loads.tenant_isolation_policy uses org_id = current_tenant_id() 10ms
     × claim 4: loads isolation policy scopes by org_id 1ms
 Test Files  2 failed | 2 passed (4)
      Tests  5 failed | 145 passed (150)
```

The failing assertion, verbatim:

```
AssertionError: loads: CROSS-TENANT LEAK - tenant A can see tenant B rows: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ tests-db/rls-isolation/behaviour.test.ts:238:83
```

and the no-tenant-context case:

```
AssertionError: loads: rows visible with no tenant context: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1
```

### 3.4 Proof B — the NAME layer is blind, the DEFINITION layer is not

`npm run audit:rls-policy-drift` against staging with the same mutation still live. **Both halves
of the output, unedited.** The first half is the demonstration that the old gate was blind:

```
  Policies expected (net)  : 180
  Policies live            : 180
  Missing (expected−live)  : 0
  Unexpected (live−expect) : 0

MISSING: none.

UNEXPECTED: none.
```

The second half is the new layer catching it:

```
DEFINITION LAYER (quick-598) — policy BODIES, not just names:
  Canonical artefact hash  : 3905db0b79c9bfccd82c7eb698286e30eb27335e18b0fad309e0b663a11cc02e
  Corpus hash (from disk)  : 3905db0b79c9bfccd82c7eb698286e30eb27335e18b0fad309e0b663a11cc02e
  Policies compared        : 180
  Definition drift         : 2

DEFINITION DRIFT (live body differs from the migration-declared body):
  - loads.tenant_isolation_policy [using]
      expected: (org_id = current_tenant_id())
      live    : true
  - loads.tenant_isolation_policy [withCheck]
      expected: (org_id = current_tenant_id())
      live    : true

========================================================================
RESULT: DRIFT DETECTED (exit 1)
```

**One mutation, observed by both gates.** The plan called for two separate mutations with a
restoration between them; running one mutation past both gates is the stronger arrangement (the
name layer and the definition layer are looking at the *identical* change, so "blind" and "caught"
cannot be attributed to different inputs) and it halves the time a staging table spends
unprotected. Recorded as a deliberate deviation.

### 3.5 Restore, and VERIFY by reading `pg_policy` back

```
RESTORED with:
CREATE POLICY "tenant_isolation_policy" ON public."loads"
  AS PERMISSIVE
  FOR ALL
  TO public
  USING ((org_id = current_tenant_id()))
  WITH CHECK ((org_id = current_tenant_id()))
```

```
CAPTURED : {"table_name":"loads","policy_name":"tenant_isolation_policy","permissive":true,"cmd":"*","roles":["public"],"using":"(org_id = current_tenant_id())","with_check":"(org_id = current_tenant_id())"}
LIVE NOW : {"table_name":"loads","policy_name":"tenant_isolation_policy","permissive":true,"cmd":"*","roles":["public"],"using":"(org_id = current_tenant_id())","with_check":"(org_id = current_tenant_id())"}
BYTE-FOR-BYTE IDENTICAL: true
```

### 3.6 Both gates clean again

```
 Test Files  4 passed (4)
      Tests  150 passed (150)
```

```
DEFINITION LAYER (quick-598) — policy BODIES, not just names:
  Canonical artefact hash  : 3905db0b79c9bfccd82c7eb698286e30eb27335e18b0fad309e0b663a11cc02e
  Corpus hash (from disk)  : 3905db0b79c9bfccd82c7eb698286e30eb27335e18b0fad309e0b663a11cc02e
  Policies compared        : 180
  Definition drift         : 0

  NOT CANONICALISED (live, no canonical entry — body unchecked): none

========================================================================
RESULT: CLEAN (exit 0) — repo and database agree on policy NAMES and BODIES.
```

Staging digest **after** everything, including teardown:

```
policyCount=180
digest=dbd4a8537cb050485b74b953afa1d8f5e3a1d29c8da464677027ad2103096623
```

**Identical to the before digest.** Staging ends where it started.

### 3.7 The artefact-absent and artefact-stale states

With `rls-policy-canonical.json` moved away, and again with its `corpusHash` corrupted, the
detector exits **3** and the word `CLEAN` appears **zero** times in either output:

```
DEFINITION LAYER (quick-598) — policy BODIES, not just names:

  **DEFINITION LAYER DID NOT RUN**
  Reason: the canonical artefact is ABSENT at …/scripts/audit/rls-policy-canonical.json. Nothing has been compared and no body has been checked.

  The name diff above checked which policies EXIST. Nothing has checked
  what any of them DO. A policy rewritten to USING (true) under its own
  name would not appear anywhere in this report.

========================================================================
RESULT: DEFINITION LAYER DID NOT RUN (exit 3) — policy bodies were NOT checked.
```

```
  Reason: the canonical artefact is STALE. A migration on disk changed a policy BODY since it was generated (artefact 0000000000000000..., corpus 3905db0b79c9bfcc...) and `npm run audit:rls-canonicalise` was not re-run.
```

---

## 4. The detector against BOTH databases

### 4.1 Staging (`wyixpgunnjmzguhggocz`) — exit 0

```
  Migration files read     : 151
  Statements parsed        : 418
  Policies expected (net)  : 180
  Policies live            : 180
  Missing (expected−live)  : 0
  Unexpected (live−expect) : 0
MISSING: none.
UNEXPECTED: none.
  Policies compared        : 180
  Definition drift         : 0
RESULT: CLEAN (exit 0) — repo and database agree on policy NAMES and BODIES.
```

### 4.2 Production (`oqdhberkghtnszrkdvfm`) — READ-ONLY, exit 1

The detector's entire database access is three `$queryRawUnsafe` SELECTs against `pg_catalog`.
There is no `$executeRaw`, no `pool.query`, no `BEGIN`, no DDL, and the expected side comes from
the checked-in `rls-policy-canonical.json` — which is the whole reason the definition layer can
be pointed at production at all.

```
  Migration files read     : 151
  Statements parsed        : 418
  Policies expected (net)  : 180
  Policies live            : 183
  Missing (expected−live)  : 0
  Unexpected (live−expect) : 3

MISSING: none.

UNEXPECTED (live, no migration creates it):
  - PushToken.user_isolation_policy
  - SysAdminInvoice.sysadmin_invoices_deny_tenant_users
  - SysAdminInvoiceItem.sysadmin_invoice_items_deny_tenant_users

ZERO-POLICY TABLES (reported, not gating — Prompt 1 owns these):
  FORCE RLS + zero policies (severe)     : none
  RLS enabled, not forced, zero policies : _prisma_migrations

DEFINITION LAYER (quick-598) — policy BODIES, not just names:
  Canonical artefact hash  : 3905db0b79c9bfccd82c7eb698286e30eb27335e18b0fad309e0b663a11cc02e
  Corpus hash (from disk)  : 3905db0b79c9bfccd82c7eb698286e30eb27335e18b0fad309e0b663a11cc02e
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

### 4.3 Why 183 vs 180 — one cause, five consequences, all predicted

`prisma/migrations/20260913120000_rls_policy_satisfiability_fixes` (quick-597) has been applied to
**staging only**. It makes five changes, and every difference above is one of them:

| Observed on production                                                  | Cause                                                             |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------- |
| 183 live vs 180 expected                                                | the three policies below are still live                           |
| UNEXPECTED `PushToken.user_isolation_policy`                             | 597 change 2 — DROP (it keyed on `app.current_user_id`, which nothing in this repository ever sets) |
| UNEXPECTED `SysAdminInvoice.sysadmin_invoices_deny_tenant_users`         | 597 change 3 — DROP (named *deny*, declared PERMISSIVE, so it GRANTED) |
| UNEXPECTED `SysAdminInvoiceItem.sysadmin_invoice_items_deny_tenant_users`| 597 change 3 — DROP, same pair                                    |
| DEFINITION DRIFT `audit_log.tenant_isolation_policy` [using]             | 597 change 1 — the raising `''::uuid` cast replaced by `current_tenant_id()` |
| DEFINITION DRIFT `in_app_notifications_insert_policy` [withCheck]        | 597 change 4 — `WITH CHECK (true)` replaced by `org_id = current_tenant_id()` |

The observed set matched the prediction exactly; nothing else differed. **This is the definition
layer catching a real, known-cause divergence on its first production run, and it is the
strongest available evidence that it works.** In particular, the `audit_log` finding is the
literal expression quick-597 measured raising `ERROR [22P02] invalid input syntax for type uuid: ""`
as `app_user` — the name layer reported that table clean, and will keep reporting it clean, for
as long as the policy exists under its name.

**Neither drift is a regression and neither is fixed here.** They are the correct, expected
report of a migration that has not yet been deployed. Applying it is a deploy, not an audit.

---

## 5. Per-table coverage — every tenant-scoped table, by name

89 tables on staging carry a `tenant_isolation_policy`. **16 COVERED, 73 NOT COVERED.** The NOT
COVERED list is pinned against `apps/web/tests-db/rls-isolation/uncovered-tables.json` in BOTH
directions by `coverage.test.ts` (via `diffAgainstBaseline`): a new uncovered table fails because
coverage shrank, and a stale entry fails because a table is covered but still listed.

### COVERED (16)

| Table                   | Status  | Basis                                                                                 |
| ----------------------- | ------- | ------------------------------------------------------------------------------------- |
| `User`                  | COVERED | behaviour probe, 4 tenant-A and 4 tenant-B fixture rows (direct ownership)             |
| `PushToken`             | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `SysAdminInvoice`       | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `SysAdminInvoiceItem`   | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `audit_log`             | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `in_app_notifications`  | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `loads`                 | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `dispatches`            | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `clients`               | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `facilities`            | COVERED | behaviour probe, 2 and 2 (direct)                                                      |
| `carrier_drivers`       | COVERED | behaviour probe, 2 and 2 (direct)                                                      |
| `carrier_trucks`        | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `route_templates`       | COVERED | behaviour probe, 1 and 1 (direct)                                                      |
| `stops`                 | COVERED | behaviour probe, 2 and 2 (**derived** — EXISTS through `dispatches`)                    |
| `carrier_documents`     | COVERED | behaviour probe, 1 and 1 (**derived** — EXISTS through `"User"`)                        |
| `route_template_stops`  | COVERED | behaviour probe, 2 and 2 (**derived** — EXISTS through `route_templates`)               |

### NOT COVERED (73)

All 73 are listed by name with a reason in
`apps/web/tests-db/rls-isolation/uncovered-tables.json` and reprinted, by name, on every run of
`npm run test:rls-isolation`. The reasons collapse to three kinds:

| Kind                                                                                                        | Count | Example                                                       |
| ----------------------------------------------------------------------------------------------------------- | ----- | ------------------------------------------------------------- |
| Not seeded by the quick-597 fixture graph, so no behaviour probe reaches it                                 | 69    | `Load`, `Truck`, `Invoice`, `driver_pay_records`, `SupportTicket` |
| Not seeded, **and** its policy compares the GUC TEXT directly rather than calling `current_tenant_id()`     | 2     | `Tag`, `TagAssignment`                                        |
| Not seeded, **and** its policy also admits non-tenant-scoped rows                                           | 1     | `AutomationRule` (`scope = 'SYSTEM' OR "tenantId" = …`)        |
| No tenant column at all — ownership is an EXISTS subquery through a parent — **and** not seeded             | 1     | `TicketMessage`                                               |

The three in the last three rows are flagged deliberately: they are the shapes least likely to
behave the way a reader assumes, and they are the ones to seed first if this suite is extended.

---

## 6. What is NOT evidence

In the style of quick-597 §6, because the whole point of this task is that a green tick has to
mean something specific.

1. **A green `npm run audit:rls-policy-drift` with a STALE canonical artefact proves nothing about
   policy bodies — which is why that state exits 3 and never prints the word CLEAN.** The corpus
   hash is recomputed from the migrations on disk on every run precisely so this cannot be
   overlooked. If you change a policy body in a migration, `npm run audit:rls-canonicalise` and the
   regenerated artefact belong in the same commit.

2. **The isolation suite covers 16 of 89 tenant-scoped tables.** A pass says the sixteen named in
   §5 isolate correctly under the three GUC cases tested. It says NOTHING about the other 73. The
   limit is the fixture graph, not the policies, and the NOT COVERED list is printed every run so
   that nobody has to infer it.

3. **The application still connects as `postgres`, which has `rolbypassrls = true`.** Every policy
   this suite tests is INERT in production today. It is measuring what will happen at the
   `app_user` cutover, not what is happening now. A green run is not evidence that any production
   query is being filtered by RLS — it is evidence that it would be.

4. **Claim 13's historical backfill act remains unobservable.** `PushToken.tenantId IS NOT NULL`
   with zero NULL rows is the OUTCOME. Whether it arrived by the documented
   `UPDATE … FROM "User"` or some other route cannot be recovered from the database, and this
   document does not claim it can.

5. **`.github/workflows/rls-isolation.yml` has no credentials and therefore checks nothing today.**
   `STAGING_DIRECT_URL` and `STAGING_DATABASE_URL_APP_USER` do not exist as repository secrets;
   they live only in the gitignored `apps/web/.env.staging`. The job emits a loud `::warning` in
   that state. **A green tick on that job means nothing was checked.** Minting a database
   credential is a human step.

6. **The `''` GUC case is not an "unset GUC" case, and no test here claims it is.** A genuinely
   unset `app.current_tenant_id` is unreachable on the `app_user` pooler connection (quick-597
   §7.3): once the placeholder has been set on a backend, neither `set_config(name, NULL, false)`
   nor `RESET` returns `current_setting(name, true)` to NULL — the reset value is `''`. `''` is
   also what `lib/db/prisma.ts:71` writes on every new physical connection, so it is the case that
   actually occurs. The suite tests `''` and says so.

7. **The definition layer compares only keys present in BOTH sets.** A policy that is live but has
   no canonical entry is reported as `NOT CANONICALISED` by name and does **not** gate — it is
   "cannot be judged", which is a third answer, not a clean one. Production currently has three.

8. **`stops`, `carrier_documents` and `route_template_stops` carry no `bypass_rls_policy`.** Under
   `app.bypass_rls = 'on'` they return zero rows — measured, and asserted, so that adding a bypass
   policy to one of them becomes a visible test failure rather than a silent widening. Do not read
   "the bypass mechanism works" as covering these three.

9. **CI's `npx vitest run` is red and was red before this task** (34 failing files remain). A red
   CI that everyone has learned to ignore protects nothing; those 34 are outside this task's
   scope and are named in §2 only so nobody attributes them here.

10. **`src/lib/db/__tests__/driver-pay-tenant-isolation.test.ts` still carries the pattern this
    task deleted twice** — `describe.skip` on a missing `DATABASE_URL`, and a `beforeAll` that
    would write test tenants into whatever `DATABASE_URL` names. It is reported, not fixed.

11. **The three `tests/security/` suites still skip rather than fail when no database is
    configured.** `tests/security/db-fixture-setup.ts` now refuses the production ref and
    constructs its client correctly, so they COLLECT and their unit sections run — but a green
    tick on `audit-log-isolation`, `carrier-driver-pii` or `restricted-documents` still does not
    mean their database claims were checked. Converting them to the fail-not-skip discipline of
    `tests-db/rls-isolation/` is a separate task.

---

## 7. Cleanliness

- Staging teardown ran: `597-staging-fixtures.ts --teardown` then `--verify-clean`, **exit 0**,
  eleven tables reported 0 rows each.
- Staging policy digest is byte-identical before and after: `dbd4a853…096623`, 180 policies.
- Canonicaliser probe policies remaining, counted by **exact name array** over all 180 probe
  names: **0**. (A prefix `LIKE '__p%'` matched **86 real policies** while this was being
  designed, because `_` is a LIKE wildcard and `bypass_rls_policy` matches. Exact names only.)
- **Production was never written to.** The only production connection made by this task was the
  read-only detector run in §4.2 — three `SELECT`s against `pg_catalog`, no transaction, no DDL.
