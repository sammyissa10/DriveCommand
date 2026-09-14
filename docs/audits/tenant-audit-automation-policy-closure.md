# Tenant / audit_log / AutomationRule dark-command policy closure (quick-599)

**Date:** 2026-09-14
**Status:** Applied to **STAGING ONLY** (`wyixpgunnjmzguhggocz`). **Production
(`oqdhberkghtnszrkdvfm`) is PENDING** — untouched by this task.
**Predecessors:** `docs/audits/policy-satisfiability-sweep.md` ·
`docs/audits/bypass-replacement-design.md` · `docs/audits/rls-policy-satisfiability-fixes.md`
(quick-597)
**Answers:** the satisfiability sweep's cutover blockers 1 (`"Tenant"`) and 4 (`AutomationRule`), and
closes the `audit_log` PARTIAL item quick-597 left open.

---

## 1. What changed

Five statements, one migration:
`apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql`.

| # | Statement | Why |
|---|---|---|
| 1 | `tenant_bootstrap_insert` ON `"Tenant"` — new `FOR INSERT WITH CHECK (NULLIF(current_setting('app.current_tenant_id', TRUE), '') IS NULL)` | `"Tenant"` had no INSERT policy at all. Self-enforcing: every `withTenantContext` unit of work sets the GUC and is therefore denied; only a bootstrap transaction (which has not set it) is admitted. |
| 2 | `tenant_self_update` ON `"Tenant"` — new `FOR UPDATE USING (id = current_tenant_id()) WITH CHECK (id = current_tenant_id())` | `"Tenant"` had no UPDATE policy. The exact twin of the existing `tenant_self_read`. No DELETE policy is added — deliberately; a tenant must never delete itself. |
| 3 | `audit_log.tenant_isolation_policy` narrowed to `FOR SELECT USING (tenant_id = current_tenant_id())` | The prior `FOR ALL` policy derived its write check from the same `USING`, which refused `writeAuditLog`'s documented cross-tenant contract. The name is **kept** (D1 — §6 below). |
| 4 | `audit_log_append_policy` ON `audit_log` — new `FOR INSERT WITH CHECK (true)` | Admits the cross-tenant write `writeAuditLog` requires by design; the SELECT half above keeps it hidden from any tenant it does not belong to. |
| 5 | `"AutomationRule".tenant_isolation_policy` replaced — `USING` **unchanged**, `WITH CHECK ("tenantId" = current_tenant_id())` added | The prior policy derived its INSERT/UPDATE check from `USING`, whose `scope = 'SYSTEM'` branch references no GUC and no tenant — any tenant-scoped connection could forge or rewrite a platform rule. The new check does not carry that branch. SELECT visibility (the sweep's §6 "defensible and intended" reading) is untouched. |
| 5b | `REVOKE UPDATE, DELETE ON audit_log FROM app_user` (guarded `DO` block) | Makes the now-absent UPDATE/DELETE policy a loud `42501` rather than a silent 0-row no-op (D3). Also the direct fix for the false claim in §5 below. |

No `AS RESTRICTIVE` anywhere (a restrictive policy ANDs with `bypass_rls_policy` and would silently
neuter it — quick-597 §8). `bypass_rls_policy` is untouched on all three tables.

---

## 2. Evidence

**This migration changes nothing at runtime today.** The application connects as `postgres`
(`rolbypassrls = true`); every policy above is decorative until `DATABASE_URL` moves to `app_user`. The
only evidence is an `app_user` connection against known rows on staging, captured before and after:
`.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/{before,after,diff}.{json,md}`.

### 2.1 Headline 1 — the `saveOperationsSettings` proof

```
Tenant.update-own@guc-A                0 rows  ->  1 row
Tenant.update-own.counter-read@guc-A   1        ->  1
```

`Tenant.update-own@guc-A` runs the exact statement `saveOperationsSettings` issues
(`SET "requirePreTripInspection" = NOT "requirePreTripInspection" WHERE id = <own tenant>`), on a
**correctly scoped** connection. Before this migration it silently updated **zero rows** — no error,
because `"Tenant"` carried no UPDATE policy and `USING` filtered the row away (D3, below) — and the
counter-read in the same transaction confirms the row was genuinely there (`= 1`) both times, so the
zero cannot be misread as "the row does not exist".

### 2.2 Headline 2 — the `writeAuditLog` cross-tenant contract

```
audit_log.insert-cross@guc-A   ERROR [42501] new row violates row-level security policy   ->   1 row
```

`writeAuditLog`'s documented contract is to insert a row for a tenant *other than* the connection's
own (an audit record of an action against tenant B, written while scoped to tenant A). Before this
migration that write was refused; after, it succeeds — the whole reason `audit_log_append_policy` is
`WITH CHECK (true)`.

### 2.3 The `audit_log` append-only pair — both directions

```
audit_log.update-own@guc-A   1 row  ->  ERROR [42501] permission denied for table audit_log
audit_log.delete-own@guc-A   1 row  ->  ERROR [42501] permission denied for table audit_log
```

Both succeeded BEFORE this migration — the direct, measured disproof of
`bypass-replacement-design.md` §3.1 item 4 and the old `src/lib/security/audit-log.ts` header claim
that `audit_log` "already carries REVOKE UPDATE, DELETE". It did not; `app_user` held both grants.
Both raise `42501` after — the revoke (statement 5b) is what makes the absent write policy loud rather
than silent.

### 2.4 The `AutomationRule` residue — D2, measured and unchanged

```
AutomationRule.select-system@guc-A     6      ->  6        (read unchanged, by design)
AutomationRule.update-system@guc-A     6 rows ->  ERROR [42501]
AutomationRule.insert-system@guc-A     accepted -> ERROR [42501]
AutomationRule.delete-system@guc-A     6 rows ->  6 rows    (RESIDUE — unchanged, reported)
```

`WITH CHECK` does not apply to DELETE. `USING` (`(scope = 'SYSTEM') OR ("tenantId" = current_tenant_id())`)
is unchanged, so a tenant-scoped connection may still DELETE all 6 SYSTEM `AutomationRule` rows after
this migration. Not closed here — see §6's closure table.

### 2.5 The bypass and the policy count — untouched, and the arithmetic

- `bypass_rls_policy`: **86 before, 86 after**, identical sorted table list (compared as a list, not a
  count — `evidence/diff.md`).
- `pg_policy` total: **180 before, 183 after**. Net +3: +2 on `"Tenant"` (statements 1, 2), +1 on
  `audit_log` (one policy became two — statements 3, 4), `"AutomationRule"` is a replace (statement 5,
  +0).
- `app_user` grants on `audit_log`: `SELECT, INSERT, UPDATE, DELETE` → `SELECT, INSERT`. Unchanged on
  `"Tenant"` and `"AutomationRule"`.

### 2.6 What is NOT evidence

- **A green deploy.** The application connects as `postgres`; every policy above is decorative against
  it.
- **The drift detector's NAME layer alone.** It diffs `(table, policy_name)` identity and cannot
  validate a rewrite (statement 5 keeps its name; a body change there would be invisible to it). This
  task regenerated `scripts/audit/rls-policy-canonical.json`, so the BODY layer (quick-598) also
  covers these five — see §4.
- **A green `npm run test:rls-isolation` for `"Tenant"` or `"AutomationRule"`.** The suite does not
  cover either: `"Tenant"` never carries a policy named `tenant_isolation_policy` and so never enters
  its enumeration at all, and `AutomationRule` is explicitly listed in `uncovered-tables.json`. The
  suite's green run is evidence for `audit_log` only. `"Tenant"` and `AutomationRule`'s evidence is
  exclusively the `599-policy-verify` matrix above.

### 2.7 One correction to this task's own plan

The plan's verification table groups `AutomationRule.insert-system@guc-A` and
`AutomationRule.insert-cross@guc-A` together as "accepted → 42501" for both. Measured: `insert-system`
was accepted before and is `42501` after, as predicted. `insert-cross` (an INSERT naming scope=TENANT,
tenantId=tenant B, under tenant A's GUC) was **already `42501` before this migration** — the prior
derived check (`scope = 'SYSTEM' OR tenantId = current_tenant_id()`) never admitted a `TENANT`-scope
row naming a foreign tenant either, so that one site was closed before quick-599 touched anything.
Recorded here per the plan's own D3 discipline ("measure first; do not correct a document on the
strength of a prose expectation") — the migration's correctness does not depend on this cell, and the
real measurement is quoted rather than the prose grouping.

---

## 3. Production apply runbook

```bash
cd apps/web
DIRECT_URL=<production connection string> \
DATABASE_URL=<the same string> \
node scripts/migrate.mjs
```

Both variables, always. `scripts/_bootstrap-env.ts:53-55` repoints `DATABASE_URL` at `DIRECT_URL`
unconditionally, and every env file points `DIRECT_URL` at production by default in this repo's
convention — so on a production apply, `DIRECT_URL` is what must be pinned deliberately, and
`DATABASE_URL` must match it or `migrate.mjs`'s spawned `seed-starter-playbooks.ts` (which resolves a
bare `DATABASE_URL`) would run against a different database than the one just migrated. Never
`prisma migrate deploy`, never the Supabase MCP `apply_migration` or `execute_sql`, never `db push`
(DEC-17 — neither MCP tool writes the `_prisma_migrations` row `migrate.mjs` writes).

Expected output: `Migrations complete (1 applied)`. More than one means the ledger and the disk corpus
disagree — stop and investigate, do not continue.

**Post-apply checks, in order:**

1. `SELECT count(*) FROM pg_policy` → expect **+3** over the pre-apply count (180 → 183 on a database
   otherwise aligned with staging; a database that already diverges from 180 should expect its own
   count +3, not literally 183).
2. `bypass_rls_policy` — same sorted table list before and after (**86** entries on a database aligned
   with staging).
3. `information_schema.role_table_grants` for `app_user` on `audit_log` → `SELECT, INSERT` only.
4. **`_prisma_migrations` read-back, per DEC-17.** First confirm a known-good sentinel row is visible
   (e.g. `20260913120000_rls_policy_satisfiability_fixes`) — the table is RLS-enabled with zero
   policies and no `app_user` grant, so a read from a non-owner role returns zero rows with no error,
   indistinguishable from "the row was never written". Then read the newest row and confirm it is
   `20260914120000_tenant_audit_automation_policy_closure` with `applied_steps_count = 1` and
   `checksum = 'manual'`.
5. `npm run audit:rls-canonicalise` **against the target database**, then
   `npm run audit:rls-policy-drift` with both variables pinned to it — expect exit 0, CLEAN, 0
   missing/unexpected, 0 definition drift.
6. Re-run `599-policy-verify.ts --phase after` pointed at the target database's `app_user` connection
   string (requires a fixture graph on that database — do not run this against production without a
   disposable fixture plan; this task deliberately never connected to production).

**Rollback:** the migration file's commented block, copied verbatim into a `psql` session — never
uncommented in place (`migrate.mjs` skips by `migration_name` and would never re-run the file; the
drift replay WOULD see uncommented statements and report the policies as expected-but-missing).

---

## 4. What breaks at the `app_user` cutover, by file and line

- **`apps/web/src/app/(admin)/actions/automations.ts:70` `toggleRuleActive`** — the ONLY
  `AutomationRule` write in the repository. Every SYSTEM row has `tenantId IS NULL`, and
  `NULL = current_tenant_id()` is NULL at EVERY GUC value including `''`. After this migration, no
  `app_user` connection — scoped or not — can toggle a platform automation rule at all.
- **`apps/web/src/app/(admin)/actions/tenants.ts:98, :190, :229, :432, :542, :625`** — sysadmin acting
  on tenants other than its own, plus tenant deletion. Deliberately unserved by any policy in this
  migration.

Both route to the privileged admin connection of `bypass-replacement-design.md` §3.2 (checklist item
**B5, which does not exist**). Not built here, not scheduled by this task.

---

## 5. Closure table — sweep §0 blockers 1 and 4, and the audit_log PARTIAL from quick-597

| Blocker | Status | Detail |
|---|---|---|
| **1 — `"Tenant"` has no INSERT/UPDATE/DELETE policy** | **PARTIAL** | 5 of 11 write sites closed (`operations/actions.ts:40`, `hydrate-tenant.ts:41`, `email-confirm/[token]/route.ts:67`, `provision-tenant.ts:59`, `tenant.repository.ts:35`), proven directly for the first. **6 sysadmin sites remain, bound to B5.** No DELETE policy — deliberately. |
| **4 — `AutomationRule` OPEN (derived write check admits `scope='SYSTEM'`)** | **PARTIAL** | INSERT and UPDATE closed with an explicit `WITH CHECK`. **DELETE REMAINS OPEN** (D2) — `WITH CHECK` does not reach it, `USING` is unchanged, measured 6 rows deletable both before and after. Fix named (a four-policy command split by `FOR SELECT`/`FOR INSERT`/`FOR UPDATE`/`FOR DELETE`), not built. |
| **quick-597 §5(b) — `audit_log` PARTIAL (contract refused the cross-tenant write)** | **CLOSED** | The SELECT/INSERT split closes the contradiction quick-597 measured but did not fix. Statement 5b (the REVOKE) is the addition beyond quick-597's three policy fixes — required because the design doc's premise that the revoke already existed was false; without it the split alone would leave UPDATE/DELETE refused by absence-of-policy (silent 0, D3) while the grant still said `app_user` could write. |

Neither blocker 1 nor blocker 4 is CLOSED. Both are named PARTIAL deliberately — the remaining sites
are real and are B5's or a future command-split migration's, not swept under this one.

---

## 6. `audit_log`'s SELECT policy keeps its name — D1

`tests-db/rls-isolation/coverage.test.ts` enumerates "every tenant-scoped table" by querying
`pg_policy` for the literal name `tenant_isolation_policy`. Had the split renamed `audit_log`'s SELECT
half, the table would have left that enumeration entirely — not become NOT COVERED, simply vanish from
`rows` — and the test `'every behaviour target is classified COVERED'`, which filters `rows` by target
key, would find nothing to check and pass VACUOUSLY, silently dropping `audit_log` from
`coverage-report.json`. The SELECT half therefore keeps the name `tenant_isolation_policy` (it IS the
tenant isolation policy for `audit_log`, now narrowed to SELECT); the INSERT half is the new name
`audit_log_append_policy`. `tests-db/rls-isolation/coverage.test.ts` now additionally asserts
`'every ISOLATION_TARGETS key appears in the enumeration AT ALL'`, ahead of the COVERED check, so a
future rename that drops a target from the enumeration entirely fails loudly instead of passing by
saying nothing.

---

## 7. Staging was returned to its pre-task state

`597-staging-fixtures.ts --teardown` (a no-op — the RLS isolation suite's own `global-setup.ts` had
already torn its fixtures down as part of its normal run) followed by `--verify-clean`:

```
--- verify-clean (staging) ---
  "Tenant"                 0
  audit_log                0
  "PushToken"              0
  in_app_notifications     0
  "SysAdminInvoice"        0
  "SysAdminInvoiceItem"    0
  stops                    0
  carrier_documents        0
  route_template_stops     0
  "SupportTicket"          0
  "Promo" (RLS597-PROMO)   0

CLEAN — every table above is empty. Exit 0.
```

`"AutomationRule"` re-read: **6** rows, all `scope='SYSTEM'`, all `tenantId IS NULL` — unchanged from
the pre-task census. The migration itself stays applied; only fixtures were removed.
