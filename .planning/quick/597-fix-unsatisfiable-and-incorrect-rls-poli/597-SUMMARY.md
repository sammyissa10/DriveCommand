---
phase: quick-597
plan: 01
subsystem: database
tags: [rls, postgres, policy, multi-tenant, app_user, staging, prisma, supabase]

requires:
  - phase: quick-595
    provides: "tenant_isolation_policy on stops / carrier_documents / route_template_stops, and the app_user grant baseline this task extends"
  - phase: quick-596
    provides: "the app.current_user_id finding that makes PushToken.user_isolation_policy provably dead"
provides:
  - "One idempotent migration fixing 4 RLS policies + 1 grant, with a verbatim commented-out ROLLBACK section"
  - "Two staging-only instruments: disposable fixtures and an app_user before/after verification matrix"
  - "Empirical proof that the three EXISTS-subquery carrier policies are satisfiable as app_user"
  - "A CLOSED/PARTIAL/REMAINS verdict for all 11 BROKEN_POLICY sites of bypass-replacement-design §1.3"
affects: [app_user cutover, withTenantContext wrapper migration, admin connection B5, SupportTicket product decision]

tech-stack:
  added: []
  patterns:
    - "Staging-only scripts load .env.staging explicitly and refuse the production ref; they never import _bootstrap-env"
    - "One fresh pg.Client per GUC case, each case inside one transaction, each probe fenced with a SAVEPOINT"
    - "The before/after diff is GENERATED from the two JSON artefacts (--diff), never typed by hand"

key-files:
  created:
    - apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql
    - apps/web/scripts/audit/597-staging-fixtures.ts
    - apps/web/scripts/audit/597-policy-verify.ts
    - docs/audits/rls-policy-satisfiability-fixes.md
    - .planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence/
  modified: []

key-decisions:
  - "DROP the SysAdmin deny pair rather than make it AS RESTRICTIVE — a restrictive policy is AND'd with bypass_rls_policy and would silently neuter the bypass"
  - "DROP PushToken.user_isolation_policy rather than invent app.current_user_id to make it satisfiable"
  - "Report SupportTicket's 7 null-tenant rows and stop — the resolution is a product decision, and no policy can admit them because the submitter does not exist"
  - "Leave audit_log's derived WITH CHECK alone; the cast was the scoped ask, and the split is design doc §3.1 item 4"
  - "Deliberately diverge from checklist B4, which said to leave the SysAdmin deny pair in place"

patterns-established:
  - "A green deploy is not evidence for an RLS policy while the app connects as postgres; the evidence is an app_user matrix against seeded rows"
  - "Counter-assertions are mandatory: the cross-tenant rejection probe is paired with an own-tenant acceptance probe in both phases"

duration: ~75min
completed: 2026-09-13
---

# quick-597: Fix unsatisfiable and incorrect RLS policies — Summary

**Four RLS policies and one grant repaired in a single migration, each proven by an `app_user`
connection against two seeded tenants on staging: `audit_log` stops raising `22P02` on the pool's
empty-string default, the permissive "deny" pair that showed every tenant's sysadmin invoices to any
unscoped connection is gone, `in_app_notifications` stops accepting cross-tenant inserts, and
promo-code signup gets the `UPDATE` grant it has always needed — with `bypass_rls_policy` untouched at
86 rows.**

## Performance

- **Tasks:** 3 of 3
- **Commits:** `fe74fa8d`, `4fbf960b`, `9bd5db08`
- **Files created:** 4 source/doc + 7 evidence artefacts
- **Migration applied to:** **STAGING ONLY** (`wyixpgunnjmzguhggocz`). Production
  (`oqdhberkghtnszrkdvfm`) was never connected to, for a read or a write.

---

## 1. Before/after evidence for every changed policy

Measured as `app_user` (`rolbypassrls = false`), one fresh connection per GUC case, every write inside
`BEGIN … ROLLBACK`. Generated into `evidence/diff.md` by `597-policy-verify.ts --diff` from
`before.json` + `after.json` — not typed by hand.

### The headline: `audit_log` under `app.current_tenant_id = ''`

`''` is the literal value `lib/db/prisma.ts:71` writes on every new physical connection.

```
BEFORE   SELECT count(*) FROM audit_log
         ERROR [22P02] invalid input syntax for type uuid: ""

AFTER    SELECT count(*) FROM audit_log
         0            -- zero rows, no error
```

The same raw text was returned for all three read probes (tenant-A-scoped count, tenant-B-scoped
count, and the unrestricted count) and for the INSERT probe in the BEFORE phase.

### Full matrix

| Policy / table | Probe | BEFORE | AFTER |
|---|---|---|---|
| `audit_log.tenant_isolation_policy` | SELECT, GUC `''` | `ERROR [22P02] invalid input syntax for type uuid: ""` | **0 rows, no error** |
| | SELECT, GUC tenant A | 1 of A, 0 of B | 1 of A, 0 of B (unchanged) |
| | SELECT, GUC tenant B | 0 of A, 1 of B | 0 of A, 1 of B (unchanged) |
| | INSERT own tenant, GUC A | 1 | 1 |
| | INSERT cross tenant, GUC A | `ERROR [42501]` | `ERROR [42501]` — §3(b) |
| | INSERT, GUC `''` | `ERROR [22P02] … uuid: ""` | `ERROR [42501] new row violates row-level security policy for table "audit_log"` — §3(b) |
| `"SysAdminInvoice"` deny pair | SELECT, GUC `''` | **2 of 2 tenants' rows** | **0** |
| | SELECT, GUC unset | **2 of 2 tenants' rows** | **0** |
| | SELECT, GUC tenant A | 1 of A, 0 of B | 1 of A, 0 of B (unchanged) |
| `"SysAdminInvoiceItem"` deny pair | identical to the above, all four cases | 2 / 2 / 1+0 | 0 / 0 / 1+0 |
| `in_app_notifications_insert_policy` | INSERT naming **another** tenant's `org_id`, GUC A | **accepted (1 row)** | `ERROR [42501] new row violates row-level security policy for table "in_app_notifications"` |
| | INSERT naming its **own** tenant, GUC A | accepted (1 row) | **accepted (1 row)** |
| `"PushToken".user_isolation_policy` | SELECT, GUC tenant A | 1 of A, 0 of B | **1 of A, 0 of B — the drop lost nothing** |
| `"Promo"` grant | `UPDATE … SET "redemptionCount" = "redemptionCount" + 1` | `ERROR [42501] permission denied for table Promo` | **1 row** |
| | `SELECT` | 1 | 1 |
| `stops` (proof, no DDL) | GUC A / GUC `''` | 2 of A, 0 of B / 0, no error | unchanged — **satisfiable** |
| `carrier_documents` (proof, no DDL) | GUC A / GUC `''` | 1 of A, 0 of B / 0, no error | unchanged — **satisfiable** |
| `route_template_stops` (proof, no DDL) | GUC A / GUC `''` | 2 of A, 0 of B / 0, no error | unchanged — **satisfiable** |

The last three rows are the point of seeding a real carrier graph: each of those policies is an
`EXISTS` subquery over a table (`dispatches`, `"User"`, `route_templates`) that carries RLS itself, so
their presence in `pg_policy` says nothing about whether an `app_user` connection can get through the
join. It can.

### Invariants

| | BEFORE | AFTER |
|---|---|---|
| `bypass_rls_policy` rows | 86 | **86**, identical table set (compared as a sorted list, not a count) |
| total `pg_policy` rows | 183 | **180** (exactly the three dropped policies) |
| `npm run audit:rls-policy-drift` vs staging | — | **exit 0**, expected 180 / live 180 / 0 missing / 0 unexpected |
| `migrate.mjs` | — | **`Migrations complete (1 applied)`** — exactly one |
| `_prisma_migrations` (DEC-17 read-back) | 150 rows | **151**, newest row is this migration, `applied_steps_count = 1`, `checksum = 'manual'` |
| staging fixtures | seeded | **torn down; `--verify-clean` exit 0**, all 11 checked tables at 0 |

---

## 2. What breaks at the `app_user` cutover — and the blocker it needs

Dropping the permissive "deny" pair removes the only thing that lets an **unscoped** connection read
`"SysAdminInvoice"` / `"SysAdminInvoiceItem"`. The single sysadmin account (1 of 38 `auth.users`, the
only one with no tenant claim) has no `tenantId`, so every sysadmin billing path runs GUC-less. After
the cutover these see **zero rows**:

| File | Sites |
|---|---|
| `src/app/(admin)/actions/sysadmin-invoices.ts` | **17 statements** — lines 26, 106, 151, 166, 202, 242, 243, 275, 280, 300, 305, 325, 331, 356, 366, 399 |
| `src/app/(admin)/billing/[id]/page.tsx` | :36 |
| `src/app/api/cron/mark-overdue-invoices/route.ts` | :21 |
| `src/lib/email/send-sysadmin-invoice.ts` | :19 |

All four use the bare Prisma client. Their fix is the privileged **admin connection** of
`docs/audits/bypass-replacement-design.md` §3.2 — checklist item **B5**.

**That connection does not exist.** `prisma.ts` is one client from one connection string. B5 is
unstarted and nothing here starts it. It is a blocker, not a scheduled item, and it must land before
`DATABASE_URL` moves to `app_user` — not before this migration, which is inert until then.

This is a **deliberate divergence from checklist B4**, which says to leave the deny pair inline
because "they must pass on a null GUC". That requirement *is* the defect restated: a policy that must
pass on a null GUC hands every tenant's billing data to any connection that forgot to set one.

---

## 3. Closure table — the 11 BROKEN_POLICY sites (design doc §1.3)

| § | Gap | Sites | Verdict | Reason |
|---|---|---|---|---|
| (a) | `"Tenant"` has no UPDATE / INSERT / DELETE policy | 2 — `api/email-confirm/[token]/route.ts:54`, `lib/onboarding/hydrate-tenant.ts:36` | **REMAINS** | Out of scope and not preflighted; nothing about it was measured here. The fourth caller, `(admin)/actions/tenants.ts` (6 statements), needs the admin connection — **B5 again**. Carry forward: **seven more `Tenant` writers sit outside the 211 bypass sites and outside every prior count** (`(admin)/actions/tenants.ts:98,190,229,432,542,625` and `(owner)/settings/operations/actions.ts:40`). The last runs on a **correctly-scoped** client and still fails, because `tenant_self_read` is `FOR SELECT` — that is the whole `/settings/operations` page, the only UI for both Document Import inspection settings. |
| (b) | `audit_log` — raises on the default GUC; derived `WITH CHECK` contradicts the writer's contract | 1 — `lib/security/audit-log.ts:68` | **PARTIAL** | The `22P02` is **closed and proven both directions**. The derived check remains: `pg_policies.with_check` is NULL, so under `FOR ALL` Postgres derives it from `USING` — before and after. Measured post-fix, an insert naming another tenant is `42501 new row violates row-level security policy for table "audit_log"`, and an insert under GUC `''` is **also now 42501** where it was `22P02`. **The write is still refused; only the reason changed** — a policy decision instead of a type error, and no longer a hard failure on the read path. Closing it means splitting into `FOR SELECT USING (…)` + `FOR INSERT WITH CHECK (true)` per §3.1 item 4. |
| (c) | `SupportTicket` — no policy can admit a NULL-tenant row | 4 — `actions/support-tickets.ts:169, 217, 371, 410` | **REMAINS — PRODUCT DECISION** | See §4. Nothing was deleted, no tenant invented, no policy widened. |
| (d) | `stops` / `carrier_documents` / `route_template_stops` | 4 — `driver-dashboard.ts:86`, `driver-routes.ts:202`, `api/driver/stops/[stopId]/messages/route.ts:105`, `api/v1/carrier/stops/[id]/messages/route.ts:89` | **CLOSED** | And the design doc's premise is **stale**: §1.3(d)/§2.3 say production has zero policies on all three; `20260912130000` (checklist B1) shipped a `tenant_isolation_policy` to each. This task measured all three live on staging **and satisfiable as `app_user`** — the half a `pg_policy` row cannot supply. The production half rests on the orchestrator's preflight (both databases at 183 policies, byte-identical digest `83f0a5e51586bbc924c0c33b6dbd3151`), not on any connection made here. Note they carry **no `bypass_rls_policy`**, so the bypass line at those four sites is already a no-op and must be replaced by setting `app.current_tenant_id`. |

### The four §2 "incorrect policy" items

| Item | Verdict |
|---|---|
| `"PushToken".user_isolation_policy` unsatisfiable | **CLOSED** — dropped. §5. |
| `SysAdminInvoice*` deny pair permissive and therefore granting | **CLOSED** — dropped. 2 -> 0 unscoped; tenant-scoped unchanged. Breaks four files at cutover (§2). |
| `in_app_notifications_insert_policy` `WITH CHECK (true)` | **CLOSED** — now `org_id = current_tenant_id()`. Cross-tenant INSERT accepted -> 42501; own-tenant accepted in both phases. |
| `"Promo"` missing `UPDATE` grant (checklist B2) | **CLOSED** — 42501 -> 1 row. |

**Deliberately left alone and reported:** `in_app_notifications_select_policy` and
`_update_policy` key on `(auth.jwt() ->> 'org_id')::uuid`, which a Prisma connection never sets, so
both are dead. They are permissive and therefore **harmless** — `tenant_isolation_policy` is `FOR ALL`
and covers both commands correctly. Unlike the SysAdmin pair they grant nothing, which is why they
were not in scope. `UserNotificationPreference.user_isolation_policy` is dead for the same reason
(`auth.uid()`) and is likewise untouched.

---

## 4. `SupportTicket` — reported, not resolved. This needs a human.

The policy is `USING ("tenantId" = current_tenant_id())` with a derived check. `tenantId` is nullable
**by design** (`20260328000002_nullable_tenant_support_ticket`) so a sysadmin can file a ticket with
no tenant. For such a row the predicate is `NULL = current_tenant_id()` -> NULL -> not true **at every
GUC value including NULL**, because `NULL = NULL` is NULL.

From this task's preflight, measured on production by the orchestrator (this task never connected to
production):

- **7 null-tenant rows out of 87.**
- They are **the same 7 rows** as the 7 `submittedBy` FK orphans.
- All 7 point at **one** hard-deleted user. **0** `TicketMessage` rows. 3 OPEN (TKT-0038, TKT-0044,
  TKT-0061), 4 CLOSED (TKT-0001, TKT-0036, TKT-0037, TKT-0067). Created 2026-03-28 .. 2026-07-17.

Verified in this repository during the run: **no tenant-facing path reaches them.** `getMyTickets`
(:217) filters `submittedBy: userId`; `getTicketById` (:371) filters `tenantId AND submittedBy:
userId`. Both require the live session user to be the submitter, and the submitter does not exist.
They surface only on the sysadmin dashboard via `getAllTickets`, which works today **solely** because
`postgres` has `BYPASSRLS`.

**A correct policy cannot admit them "for their submitter" — the submitter does not exist.** Design
doc §3.1 option (i) keys on `app.current_user_id`, the GUC nothing sets; and even with it, no live
user matches.

**The four options are: a sentinel tenant row · a soft-delete of the 7 rows · restoring the deleted
user · archiving them out of the table. This is a PRODUCT DECISION and this task stops here.**

Also found, and it is a **code** change rather than a migration — `support-tickets.ts:239-240`:

```
// Use $queryRaw — raw SQL bypasses RLS entirely, no set_config needed.
// SupportTicket has no RLS so this is safe for cross-tenant admin access.
```

Both halves are false. Raw SQL does not bypass RLS (only Prisma's `where`-injection layer is
bypassed), and `SupportTicket` has `relrowsecurity = true`, `relforcerowsecurity = true` and two
policies (`bypass_rls_policy`, `tenant_isolation_policy`) — read off `pg_class` / `pg_policies` during
this run. `getAllTickets` works because of the **role**, not because of an absence of RLS.

---

## 5. `PushToken` — DROP, not repair

**Decision: DROP `user_isolation_policy`.**

Justification:

- Its predicate is `("userId")::text = current_setting('app.current_user_id', true)` and **nothing in
  this repository ever sets that GUC**. The only occurrences are the `CREATE POLICY` itself
  (`20260327000006_add_push_token/migration.sql:23`), a note at `src/lib/auth/mobile-auth.ts:21`
  recording that it is *not* set from the HTTP context, and two derived comments. So
  `current_setting(..., true)` is NULL, the comparison is NULL, and the policy has **never matched a
  row**. Dropping a permissive policy that matches nothing cannot change visibility in either
  direction — and that was confirmed, not assumed: after the drop tenant A still sees its own token
  and none of tenant B's.
- Making it satisfiable would mean inventing `app.current_user_id` here. That GUC is scheduled design
  work (`.planning/phase-0-revised.md` §10) and introducing it as a side effect of a policy-repair
  task would pre-empt a decision with a one-line migration.
- `PushToken.tenantId` is `NOT NULL` with 0 null rows and `tenant_isolation_policy` already scopes the
  table, so nothing is left unprotected.

**What is lost:** per-user scoping on `"PushToken"` — but it was never in force, so the drop removes
the *appearance* of an enforcement, not an enforcement.

**Did anything rely on it? No — and one file relies on it being dead.**
`src/lib/notifications/send-push.ts` documents that `sendPushToUser`'s `app.bypass_rls` scope is
"STRICTLY load-bearing … That policy can never pass, so the bypass is the only reason this query
returns rows at all." That remains true and unchanged: `bypass_rls_policy` is untouched on
`"PushToken"`. If per-user scoping is wanted it has to be **built**, against a GUC something writes.

---

## 6. What is NOT evidence

- **The drift detector validates NAMES ONLY.** `npm run audit:rls-policy-drift` replays the migration
  corpus and diffs `(table, policy_name)` identity against live `pg_policy`. It does not compare
  expressions, commands or the permissive flag. It confirms the name set moved from 183 to 180 with
  zero drift; it **can never validate the rewrites** in changes 1 and 4.
- **The 17 tests in `src/__tests__/isolation/` are VACUOUS.** They pass 17/17 (3 files, 934ms) and
  contain **zero database references**; they assert string literals against string literals, e.g.
  `expect(policyExpression).toBe('org_id = current_tenant_id()')` where `policyExpression` is a local
  constant declared three lines above. They pass identically before and after, and would pass with
  every policy in the database dropped. (`group-a-isolation.test.ts:8` even carries the header
  "Database connectivity required. Run with DATABASE_URL env var set." — there is none in the file.)
  Run because the task required it; **not evidence**.
- **A green production deploy is not evidence.** The app connects as `postgres`
  (`rolbypassrls = true`), so everything here is decorative until the `app_user` cutover. The evidence
  is the `app_user` matrix in §1 and nothing else.

**The migration is applied to STAGING ONLY.** It is the artefact a human later applies to production,
using the runbook in `docs/audits/rls-policy-satisfiability-fixes.md` §3.

---

## 7. Corrections to the plan's preflight

Recorded because the plan asked for contradictions rather than silent workarounds.

1. **`audit_log.action` carries a CHECK constraint admitting exactly eight literals** —
   `VIEW_PII`, `VIEW_PII_DENIED`, `DOWNLOAD_DOCUMENT`, `DOWNLOAD_DOCUMENT_DENIED`,
   `UPDATE_RESTRICTED`, `DELETE_RESTRICTED`, `EXPORT`, `RATE_LIMIT_HIT`. The plan's fixture
   instruction ("use the literal marker `RLS597` in a name/code/message field wherever the schema
   allows") read against `action` gives `23514 violates check constraint "audit_log_action_check"` on
   every insert, which is exactly what the first seed run produced. Read off `pg_get_constraintdef`,
   per DEC-14. Fixtures now write `action = 'EXPORT'` and carry the marker in `resource_type`, which
   has no CHECK; teardown keys on that column.
2. **The raw `"Promo"` UPDATE is at `src/lib/onboarding/provision-tenant.ts:103`**, not
   `src/lib/tenant/provision-tenant.ts:97`. The plan and `bypass-replacement-design.md` §2.5 both say
   `:97`; there is no `src/lib/tenant/` directory. Corrected in the migration header.
3. **A genuinely-unset `app.current_tenant_id` is NOT REACHABLE** on the `app_user` connection, so the
   plan's "GUC unset" case is in practice a second reading of the `''` case. Measured in both phases:
   a Supavisor transaction-mode backend arrives carrying `''` from a prior session, and **neither**
   `set_config('app.current_tenant_id', NULL, false)` **nor** `RESET "app.current_tenant_id"` returns
   `current_setting(name, true)` to NULL — once the placeholder GUC has been set on a backend its
   reset value is `''`, not absent. This strengthens rather than weakens the case for change 1: `''`
   is both what `prisma.ts:71` writes and what a "reset" leaves behind. The verify script now records
   the observed GUC per case and probes reachability explicitly, so the matrix states what it saw
   instead of what it intended. (The `unset` case is run **first** for the same reason.)
4. **The plan's teardown list named Prisma model names, not tables.** `CarrierTruck` is
   `carrier_trucks` and `CarrierDriver` is `carrier_drivers` (not `trucks` / `drivers`). Also
   missing from that list: `scripts/migrate.mjs` spawns `seed-starter-playbooks.ts`, so applying the
   migration while the fixtures existed created **116 rows** across `Playbook` (6), `PlaybookStep`
   (54), `PlaybookTrigger` (2) and `StepTemplate` (54) for the two disposable tenants. Without
   deleting those the `Tenant` delete fails on an FK. Teardown handles all four; all are at 0.
5. **`apps/web/.env.staging`'s own header is stale.** It says the password segment is still the
   literal placeholder `NcOoIimeVqRnW48N` and must be replaced in both occurrences. It has been —
   the token appears only in that comment, and all three connection strings authenticate. Not touched
   (gitignored, out of scope), but it would send the next reader hunting a fixed problem.
6. **Confirmed as stated, worth recording:** staging was empty (0 rows in all 11 checked tables);
   `app_user` had SELECT-only on `"Promo"` (`42501` on UPDATE); `audit_log.tenant_isolation_policy` is
   the only policy on the target tables casting the GUC value; the `SysAdminInvoiceItem` deny policy
   is named `sysadmin_invoice_items_deny_tenant_users`; `migrate.mjs` applied **exactly one**
   migration; the ledger went 150 -> 151.

## 8. Gate results

| Gate | Result |
|---|---|
| `migrate.mjs` against staging | 1 applied |
| `npm run audit:rls-policy-drift` (both vars pinned to staging) | **exit 0** — 180/180, 0 missing, 0 unexpected |
| `npx vitest run src/__tests__/isolation` | **17/17 pass** — and vacuous (§6) |
| `npx tsc --noEmit` in `apps/web` | **0 errors — and PROBED.** A deliberate `const __probe597: number = 'y'` in `597-policy-verify.ts` was reported as `TS2322` and as the only error, so the gate was not blind. Probe removed; 0 occurrences remain. |
| `597-staging-fixtures.ts --verify-clean` | **exit 0** after teardown — and **exit 1** with fixtures present, so the check can actually fail |
| Production written | **Never.** Both new scripts refuse on the production ref and require the staging ref; both `migrate.mjs` invocations printed the staging project. |

## 9. Not done, deliberately

- **STATE.md was not updated.** This is a quick task, not a phase; the GSD `state advance-plan` /
  `update-progress` commands are phase-counters and would corrupt the position. Recording the commit
  hashes is the orchestrator's step (the shape of `f47e407d`, "docs(quick-596): record commit hash in
  STATE.md").
- **Nothing was pushed.** Three commits: `fe74fa8d`, `4fbf960b`, `9bd5db08`.
- ROADMAP.md untouched.

## Self-Check: PASSED

All 13 claimed artefacts exist on disk and all three claimed commits exist in git
(`fe74fa8d`, `4fbf960b`, `9bd5db08`).
