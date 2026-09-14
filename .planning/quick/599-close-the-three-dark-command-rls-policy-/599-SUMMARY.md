---
phase: quick-599
plan: 01
subsystem: database
tags: [rls, postgres, policy, multi-tenant, app_user, staging, prisma, tenant, audit-log, automation-rule]

requires:
  - phase: quick-597
    provides: "the app_user probe instrument shape (four ground rules), the disposable staging fixture graph, and the audit_log/AutomationRule findings this task closes"
  - phase: quick-598
    provides: "the real RLS isolation suite (env.ts / behaviour.test.ts / coverage.test.ts) this task extends, and the body-level drift gate this task's canonical-artefact regen keeps green"
provides:
  - "One idempotent migration closing two of the satisfiability sweep's four cutover blockers (Tenant PARTIAL, AutomationRule PARTIAL), plus the audit_log PARTIAL item quick-597 left open (now CLOSED)"
  - "A staging-only app_user before/after verification matrix for all three tables, both directions, every probe"
  - "audit_log's append-only contract asserted in the real RLS isolation suite, replacing the deleted own-tenant-DELETE assertion with a strictly stronger one (2 refusals + 2 counter-assertion inserts)"
  - "Three corrected false claims: audit_log.ts's header, bypass-replacement-design.md §3.1 item 4, policy-satisfiability-sweep.md's blockers 1/4 and its §4.1 D3 claim"
affects: [app_user cutover, admin connection B5, toggleRuleActive, sysadmin tenant actions]

tech-stack:
  added: []
  patterns:
    - "A dark-command close for a FOR ALL policy is an explicit WITH CHECK, never a narrowed USING — narrowing USING also narrows the intended SELECT"
    - "WITH CHECK never applies to DELETE; closing INSERT+UPDATE this way leaves a DELETE residue that must be measured and reported, not assumed closed"
    - "A policy split that keeps a table in an existing name-keyed test enumeration must keep the ORIGINAL policy's name on whichever half stayed closest to its original semantics (D1)"

key-files:
  created:
    - apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql
    - apps/web/scripts/audit/599-policy-verify.ts
    - docs/audits/tenant-audit-automation-policy-closure.md
    - .planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/
  modified:
    - apps/web/tests-db/rls-isolation/env.ts
    - apps/web/tests-db/rls-isolation/behaviour.test.ts
    - apps/web/tests-db/rls-isolation/coverage.test.ts
    - apps/web/tests-db/rls-isolation/uncovered-tables.json
    - apps/web/tests-db/rls-isolation/coverage-report.json
    - apps/web/scripts/audit/rls-policy-canonical.json
    - apps/web/src/lib/security/audit-log.ts
    - docs/audits/bypass-replacement-design.md
    - docs/audits/policy-satisfiability-sweep.md

key-decisions:
  - "Add an explicit WITH CHECK to AutomationRule rather than narrow USING — preserves the sweep's 'defensible and intended' SELECT visibility of platform rules, at the cost of leaving DELETE open (D2, reported)"
  - "REVOKE UPDATE, DELETE ON audit_log — scope creep the design doc assumed was already done; without it the SELECT/INSERT split leaves the two layers disagreeing (policy says no by absence, grant still says yes)"
  - "Keep audit_log's SELECT policy name tenant_isolation_policy rather than give both halves new names — the existing coverage.test.ts enumeration is keyed on that literal name and a rename would silently drop the table from it (D1)"
  - "No DELETE policy on Tenant — deliberate, matches bypass-replacement-design.md §3.1 item 3"
  - "No AS RESTRICTIVE anywhere — would AND with bypass_rls_policy and silently neuter it (quick-597 §8)"

patterns-established:
  - "A 0-row UPDATE/DELETE under RLS with no applicable policy is a SILENT zero, not a 42501 — every such probe needs a counter-read in the same transaction proving the row exists, or the zero proves nothing (D3)"
  - "A write-probe list move (table A's contract changed shape) is asserted as a MOVE via a union-equality test, so silently dropping the table from both lists is a test failure, not a quiet loss of coverage"

duration: ~110min
completed: 2026-09-14
---

# quick-599: Close the three dark-command RLS policy gaps — Summary

**Closed two of the satisfiability sweep's four cutover blockers (`"Tenant"` and `AutomationRule`,
both PARTIAL) and the `audit_log` item quick-597 measured but did not fix (now CLOSED), in one
migration applied to staging and proven in both directions by an `app_user` connection against seeded
rows — including the exact `saveOperationsSettings` statement and the exact `writeAuditLog`
cross-tenant contract.**

## Performance

- **Tasks:** 3 of 3
- **Commits:** `85637ca2`, `98e7c671`, plus this task's docs/test commit
- **Migration applied to:** **STAGING ONLY** (`wyixpgunnjmzguhggocz`). Production
  (`oqdhberkghtnszrkdvfm`) was never connected to, for a read or a write.

---

## 1. What shipped

Five policy statements + one grant revoke, in
`20260914120000_tenant_audit_automation_policy_closure`:

1. `tenant_bootstrap_insert` — new `"Tenant"` INSERT policy (bootstrap-only, self-enforcing on the GUC).
2. `tenant_self_update` — new `"Tenant"` UPDATE policy, the exact twin of `tenant_self_read`.
3. `audit_log.tenant_isolation_policy` narrowed to `FOR SELECT` (name kept — D1).
4. `audit_log_append_policy` — new `FOR INSERT WITH CHECK (true)`.
5. `"AutomationRule".tenant_isolation_policy` — explicit `WITH CHECK` added, `USING` unchanged.
5b. `REVOKE UPDATE, DELETE ON audit_log FROM app_user`.

## 2. The headline proofs, both directions, as `app_user`

| Probe | Before | After |
|---|---|---|
| `Tenant.update-own@guc-A` (the exact `saveOperationsSettings` statement) | **0 rows, no error** (counter-read confirmed the row exists) | **1 row** |
| `audit_log.insert-cross@guc-A` (the exact `writeAuditLog` cross-tenant contract) | `ERROR [42501]` | **1 row** |
| `audit_log.update-own@guc-A` / `.delete-own@guc-A` | **1 row each** (the direct disproof of the "already REVOKEd" claim) | `ERROR [42501]` each |
| `AutomationRule.update-system@guc-A` / `.insert-system@guc-A` | 6 rows / accepted | `ERROR [42501]` / `ERROR [42501]` |
| `AutomationRule.delete-system@guc-A` | 6 rows | **6 rows — D2 RESIDUE, unchanged, reported, not closed** |
| `AutomationRule.select-system@guc-A` | 6 | 6 — unchanged, by design |
| `Tenant.delete-own@guc-A` | 0 rows | 0 rows — no DELETE policy, deliberately, both phases |
| `pg_policy` total | 180 | **183** |
| `bypass_rls_policy` | 86, sorted list `[...]` | 86, **identical** sorted list |
| `app_user` grants on `audit_log` | SELECT, INSERT, UPDATE, DELETE | **SELECT, INSERT** |

Full matrix, every probe: `.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/`
(`before.json`/`before.md`, `after.json`/`after.md`, `diff.md` — the diff is generated from the two
JSON artefacts, never typed by hand).

## 3. Gates

- **`_prisma_migrations` read back per DEC-17**: sentinel row visible, newest row
  `20260914120000_tenant_audit_automation_policy_closure`, `applied_steps_count = 1`,
  `checksum = 'manual'`.
- **Canonical artefact regenerated**: 270 CREATE POLICY definitions read, 183 net expected, all 183
  canonicalised, 0 not-canonicalised.
- **Drift gate**: exit 0, CLEAN — 183 expected / 183 live, 0 missing, 0 unexpected, 0 definition drift.
- **RLS isolation suite**: recorded RED first (`evidence/isolation-suite-before-fix.txt` — 1 failed /
  149 passed, the `audit_log` own-tenant DELETE now raising 42501 instead of returning a count), then
  fixed and recorded GREEN (`evidence/isolation-suite-after-fix.txt` — 0 failed / **156** passed, up
  from the 150 total in the red run). The new append-only assertion was itself proven to fire by
  deliberately breaking it (`evidence/guard-break-probe.txt`) — dropping `audit_log` from
  `APPEND_ONLY_WRITE_PROBE_TARGETS` without adding it anywhere else failed the union-equality test with
  `expected [...] to deeply equal [...]`, restored immediately after.
- **Staging returned to its pre-task state**: `597-staging-fixtures.ts --verify-clean` exits 0 (the
  suite's own `global-setup.ts` had already torn fixtures down); `"AutomationRule"` re-read at exactly
  6 rows, all `scope='SYSTEM'`, all `tenantId IS NULL`. The migration itself stays applied.

## 4. What is still open

- **`"Tenant"` blocker 1 — PARTIAL.** 5 of 11 write sites closed. The 6 `(admin)/actions/tenants.ts`
  sysadmin sites (tenant create/update ×5/delete on tenants OTHER than the caller's own) remain
  unserved — deliberately, they route to the privileged admin connection of
  `bypass-replacement-design.md` §3.2 (checklist **B5, which does not exist**). No DELETE policy on
  `"Tenant"` — deliberately, a tenant must never delete itself.
- **`AutomationRule` blocker 4 — PARTIAL.** INSERT and UPDATE closed. **DELETE remains open** (D2):
  `WITH CHECK` does not apply to DELETE, `USING` is unchanged, and a tenant-scoped connection can still
  delete all 6 platform SYSTEM rows. The fix — a four-policy command split (`FOR SELECT` / `FOR INSERT`
  / `FOR UPDATE` / `FOR DELETE`) — is named in the migration header and in
  `docs/audits/tenant-audit-automation-policy-closure.md`, not built.
- **`toggleRuleActive`** (`(admin)/actions/automations.ts:70`) — the only `AutomationRule` write in the
  repository. Every SYSTEM row has `tenantId IS NULL`; after this migration no `app_user` connection,
  scoped or not, can toggle a platform automation rule. Also bound to B5.
- **Production is PENDING.** This task applied to staging only; the runbook in
  `docs/audits/tenant-audit-automation-policy-closure.md` §3 is the production apply path, not yet run.
- **Three false claims corrected**, not merely noted: `src/lib/security/audit-log.ts`'s header (the
  "already carries REVOKE" claim), `bypass-replacement-design.md` §3.1 item 4 (same claim, struck
  through with a dated correction), and `policy-satisfiability-sweep.md`'s §4.1 (the "42501, not a
  silent zero" claim — true for INSERT only; UPDATE/DELETE with no applicable policy is a silent zero,
  D3, now measured and corrected in place).

## 5. Deviations from plan

**One measured correction to the plan's own verification table**, not a deviation in implementation:
the plan groups `AutomationRule.insert-system@guc-A` and `insert-cross@guc-A` as both "accepted →
42501". Measured: `insert-system` matches; `insert-cross` was **already** `42501` before this migration
(the prior derived check never admitted a `TENANT`-scope row naming a foreign tenant either), so that
cell reads `42501 → 42501`, unchanged. Recorded in
`docs/audits/tenant-audit-automation-policy-closure.md` §2.7 per the plan's own D3 discipline: measure
first, don't correct a document on the strength of a prose expectation. No code or migration behaviour
depends on this cell.

None of the plan's `must_haves` truths, artifacts or key_links were weakened to reach green — the
`AutomationRule` DELETE residue is reported exactly as the plan required (PARTIAL, not silently
absorbed into "closed"), and `audit_log` was moved from `WRITE_PROBE_TARGETS` to
`APPEND_ONLY_WRITE_PROBE_TARGETS` rather than dropped from probe coverage.

## Self-Check

- [x] `apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql` exists and is applied to staging
- [x] `apps/web/scripts/audit/599-policy-verify.ts` exists, refuses the production ref, no COMMIT statement
- [x] `.planning/quick/599-close-the-three-dark-command-rls-policy-/evidence/{before,after,diff}.{json,md}` exist
- [x] `docs/audits/tenant-audit-automation-policy-closure.md` exists with the closure table
- [x] `apps/web/tests-db/rls-isolation/` green (156 passed) with the append-only assertion added
- [x] Staging verify-clean exits 0; `AutomationRule` at 6/6/6
- [x] Commits `85637ca2`, `98e7c671` exist in `git log`
