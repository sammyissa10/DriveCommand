# RLS policy satisfiability and correctness fixes (quick-597)

**Read this before applying `20260913120000_rls_policy_satisfiability_fixes` to production.**

- Migration: `apps/web/prisma/migrations/20260913120000_rls_policy_satisfiability_fixes/migration.sql`
- Applied to: **STAGING ONLY** (`wyixpgunnjmzguhggocz`), 2026-09-14. Production
  (`oqdhberkghtnszrkdvfm`) was never connected to by this task, for a read or a write.
- Evidence: `.planning/quick/597-fix-unsatisfiable-and-incorrect-rls-poli/evidence/`
  (`before.json` · `before.md` · `after.json` · `after.md` · `diff.md` · `drift-after.txt` ·
  `fixture-ids.json` · `verify-clean-after.txt`)
- Instruments: `apps/web/scripts/audit/597-staging-fixtures.ts`,
  `apps/web/scripts/audit/597-policy-verify.ts`

---

## 1. What changed

| # | Statement | Why |
|---|---|---|
| 1 | `audit_log.tenant_isolation_policy` rewritten: `(current_setting('app.current_tenant_id', true))::uuid` -> `current_tenant_id()` | It is the ONLY policy in either database that casts the GUC **value**. `lib/db/prisma.ts:71` writes `''` on every new physical connection, and `''::uuid` is a hard error, so at the `app_user` cutover every GUC-less read of `audit_log` raises rather than filtering — and `writeAuditLog` rethrows. |
| 2 | `"PushToken".user_isolation_policy` **DROPPED** | Keys on `app.current_user_id`, which nothing in this repository sets. Permissive, so it has never matched a row; dropping it can neither narrow nor widen visibility. |
| 3 | `"SysAdminInvoice".sysadmin_invoices_deny_tenant_users` and `"SysAdminInvoiceItem".sysadmin_invoice_items_deny_tenant_users` **DROPPED** | Named "deny", declared PERMISSIVE, therefore OR'd with `tenant_isolation_policy` and **granting**: every GUC-less connection saw every tenant's sysadmin invoices. |
| 4 | `in_app_notifications_insert_policy`: `WITH CHECK (true)` -> `WITH CHECK (org_id = current_tenant_id())` | An open door in. A connection scoped to tenant A could insert a notification owned by tenant B. |
| 5 | `GRANT SELECT, UPDATE ON "Promo" TO app_user` | `src/lib/onboarding/provision-tenant.ts:103` issues a raw `UPDATE "Promo" SET "redemptionCount" = ...` on the promo-code signup path. `20260912130000` granted SELECT only. |

No `bypass_rls_policy` is added, dropped or altered. No index is added. No application code changes.

---

## 2. Evidence

All measurements are an `app_user` connection (`rolbypassrls = false`) against two disposable seeded
tenants on staging, one fresh connection per GUC case, every write inside `BEGIN … ROLLBACK`.

### 2.1 The headline — `audit_log` under the pool's `''` default

Quoted verbatim from `evidence/before.md` and `evidence/after.md`:

```
BEFORE  SELECT count(*) FROM audit_log   (app.current_tenant_id = '')
        ERROR [22P02] invalid input syntax for type uuid: ""

AFTER   SELECT count(*) FROM audit_log   (app.current_tenant_id = '')
        0            -- zero rows, no error
```

The same statement under `app.current_tenant_id = <tenant A>` returned **1** before and **1** after,
and **0** of tenant B's rows in both phases. The fix removes the raise without loosening the filter.

### 2.2 Read matrix, before -> after

Row counts restricted to the seeded fixture ids. `''` is the value `prisma.ts:71` writes.

| table | GUC | A rows | B rows | all |
|---|---|---|---|---|
| `audit_log` | tenant A | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `audit_log` | tenant B | 0 -> 0 | 1 -> 1 | 1 -> 1 |
| `audit_log` | `''` | **22P02 -> 0** | **22P02 -> 0** | **22P02 -> 0** |
| `in_app_notifications` | tenant A | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `in_app_notifications` | `''` | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `"PushToken"` | tenant A | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `"PushToken"` | `''` | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `"SysAdminInvoice"` | tenant A | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `"SysAdminInvoice"` | `''` | **1 -> 0** | **1 -> 0** | **2 -> 0** |
| `"SysAdminInvoiceItem"` | tenant A | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `"SysAdminInvoiceItem"` | `''` | **1 -> 0** | **1 -> 0** | **2 -> 0** |
| `stops` | tenant A | 2 -> 2 | 0 -> 0 | 2 -> 2 |
| `stops` | `''` | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `carrier_documents` | tenant A | 1 -> 1 | 0 -> 0 | 1 -> 1 |
| `carrier_documents` | `''` | 0 -> 0 | 0 -> 0 | 0 -> 0 |
| `route_template_stops` | tenant A | 2 -> 2 | 0 -> 0 | 2 -> 2 |
| `route_template_stops` | `''` | 0 -> 0 | 0 -> 0 | 0 -> 0 |

The last six rows are the **empirical satisfiability proof** for the three EXISTS-subquery policies
shipped by `20260912130000`. Each joins a table that carries RLS itself (`dispatches`, `"User"`,
`route_templates`), so "the policy exists in `pg_policy`" says nothing about whether a real `app_user`
connection can get through the join. It can: tenant A sees 2 / 1 / 2 of its own rows, none of tenant
B's, and an unscoped connection sees zero **without an error**.

`"PushToken"` tenant A still sees its own token and none of B's after the drop, which is the
counter-assertion that change 2 removed nothing that was in force.

### 2.3 Write probes, before -> after

| probe | before | after |
|---|---|---|
| `in_app_notifications` INSERT naming **another** tenant's `org_id`, GUC = A | **accepted (1 row)** | **ERROR [42501] new row violates row-level security policy for table "in_app_notifications"** |
| `in_app_notifications` INSERT naming its **own** tenant, GUC = A | accepted (1 row) | accepted (1 row) |
| `"Promo"` `UPDATE … SET "redemptionCount" = "redemptionCount" + 1` | **ERROR [42501] permission denied for table Promo** | **1 row** |
| `"Promo"` SELECT | 1 | 1 |
| `audit_log` INSERT, GUC = `''` | ERROR [22P02] invalid input syntax for type uuid: "" | **ERROR [42501] new row violates row-level security policy for table "audit_log"** — see §5(b) |
| `audit_log` INSERT naming its own tenant, GUC = A | 1 | 1 |
| `audit_log` INSERT naming **another** tenant, GUC = A | ERROR [42501] | ERROR [42501] — see §5(b) |

The own-tenant `in_app_notifications` insert is deliberate and load-bearing: without it the rejection
above would pass by saying nothing.

### 2.4 The bypass is untouched

`bypass_rls_policy`: **86 rows before, 86 after, identical table set** (compared as a sorted list, not
as a count — a count alone would miss a swap). Total `pg_policy` rows **183 -> 180**, which is exactly
the three dropped policies.

### 2.5 What is NOT evidence

- **`npm run audit:rls-policy-drift` validates NAMES ONLY.** It replays the repo's migration SQL and
  diffs `(table, policy_name)` identity against live `pg_policy`. It does not compare expressions,
  commands or the permissive flag. It confirms the name set; it can never confirm the rewrites in
  changes 1 and 4. It ran green against staging after the migration:
  `Policies expected (net) 180 / live 180 / Missing 0 / Unexpected 0 — RESULT: CLEAN (exit 0)`.
- **The 17 tests in `src/__tests__/isolation/*.test.ts` are VACUOUS.** They contain zero database
  references and assert string literals against string literals, e.g.
  `expect(policyExpression).toBe('org_id = current_tenant_id()')` where `policyExpression` is a local
  constant declared three lines above. They pass 17/17 before and after this migration and would pass
  identically with every policy in the database dropped. (`group-a-isolation.test.ts:8` even carries
  the header "Database connectivity required. Run with DATABASE_URL env var set." — there is no
  connectivity in the file.) They are recorded because the task required running them, not because
  they show anything.
- **A green production deploy is not evidence.** The application connects as `postgres`
  (`rolbypassrls = true`), so every policy below is decorative until `DATABASE_URL` moves to
  `app_user`.

### 2.6 One measurement worth keeping: a genuinely-unset GUC is unreachable

`STAGING_DATABASE_URL_APP_USER` is a Supavisor **transaction-mode** pooler string, so a fresh client
is not a fresh backend. Measured in both phases:

```
at connect                                          : NULL  (a clean backend) or ''  (a reused one)
after set_config('app.current_tenant_id', NULL, false): ''
after RESET "app.current_tenant_id"                  : ''
```

Once the placeholder GUC has been set on a server connection its **reset value is `''`, not absent**.
Neither documented route returns `current_setting(name, true)` to NULL. So "GUC never set" is not a
state the application can be in after its first request on a given backend — which makes `''` the
only case that matters, and it is the case `prisma.ts:71` creates deliberately. This is the quick-413
pool leak seen from a different angle, and it is why change 1 is a correctness fix rather than an edge
case.

---

## 3. Production apply runbook

**This migration is inert on production today.** The app connects as `postgres`
(`rolbypassrls = true`), so nothing it does takes effect until the `app_user` cutover. Applying it
early is the point: the cutover must not be the moment these are discovered.

**Sequencing constraint: change 3 breaks four files at the cutover. See §4. Checklist item B5 (the
admin connection) must land before `DATABASE_URL` moves — not before this migration.**

Apply exactly as follows, from `apps/web`:

```bash
DIRECT_URL="<production session-mode string>" \
DATABASE_URL="<the same string>" \
node scripts/migrate.mjs
```

**Both variables, every time.** `scripts/_bootstrap-env.ts:53-55` does
`process.env.DATABASE_URL = process.env.DIRECT_URL` unconditionally; `migrate.mjs` itself loads no
dotenv but spawns `seed-starter-playbooks.ts`, which resolves a **bare** `DATABASE_URL`, and its
`assertSameProjectRef()` guard refuses to spawn the seeder when the two refs differ.

Expected output: **`Migrations complete (1 applied)`**. More than one means the ledger and the disk
corpus disagree — stop and investigate rather than continuing.

Post-apply checks:

| Check | Expected |
|---|---|
| `SELECT count(*) FROM pg_policy` | 183 -> **180** |
| `SELECT count(*) FROM pg_policies WHERE policyname = 'bypass_rls_policy'` | **86**, unchanged |
| `SELECT policyname FROM pg_policies WHERE tablename IN ('PushToken','SysAdminInvoice','SysAdminInvoiceItem')` | no `user_isolation_policy`, no `*_deny_tenant_users` |
| `npm run audit:rls-policy-drift` (both vars pinned) | exit 0, 0 missing / 0 unexpected |
| `SELECT privilege_type FROM information_schema.role_table_grants WHERE grantee='app_user' AND table_name='Promo'` | `SELECT`, `UPDATE` |
| newest `_prisma_migrations` row (**DEC-17: read it back, do not assume**) | `20260913120000_rls_policy_satisfiability_fixes`, `applied_steps_count = 1`, `checksum = 'manual'` |

On staging all six were confirmed after the apply, including the ledger read-back (150 -> 151 rows,
newest row is this migration with `steps=1 / checksum=manual` — the signature of a row `migrate.mjs`
actually wrote, as opposed to a hand-mirrored resolved row, which carries `applied_steps_count = 0`
and a real SHA-256).

**Rollback** is a commented-out block at the end of the migration file, copied verbatim out of
`evidence/before.json`. Copy it into a psql session; do NOT uncomment it in place — `migrate.mjs`
skips by `migration_name` and would never re-run the file, while the drift replay WOULD see the
uncommented statements and report the four policies as expected-but-missing.

---

## 4. What breaks at the `app_user` cutover, by file and line

Change 3 removes the only thing that lets an **unscoped** connection read
`"SysAdminInvoice"` / `"SysAdminInvoiceItem"`. The single sysadmin account (1 of 38 `auth.users`, the
only one with no tenant claim) has no `tenantId`, so every sysadmin billing path runs GUC-less. After
the cutover these four see **zero rows**:

| File | Sites |
|---|---|
| `src/app/(admin)/actions/sysadmin-invoices.ts` | **17 statements** — lines 26, 106, 151, 166, 202, 242, 243, 275, 280, 300, 305, 325, 331, 356, 366, 399 |
| `src/app/(admin)/billing/[id]/page.tsx` | :36 |
| `src/app/api/cron/mark-overdue-invoices/route.ts` | :21 |
| `src/lib/email/send-sysadmin-invoice.ts` | :19 |

All four use the bare Prisma client. Their fix is the privileged **admin connection** of
`bypass-replacement-design.md` §3.2 — `ADMIN_DATABASE_URL`, a second pool without the tenant-GUC
initialiser, `adminPrisma`, `withAdminContext(reason, fn)` over a closed reason union, the
two-direction boot guard and the CI call-site countdown — tracked as checklist item **B5**.

**That connection does not exist.** `prisma.ts` is one client from one connection string. B5 is
unstarted, and nothing in this task starts it. It is not scheduled; it is a blocker, and it is stated
here so the sequencing is a decision rather than a discovery.

**This is a deliberate divergence from checklist item B4**, which says *"Leave the two
`SysAdminInvoice*` deny policies inline (they must pass on a null GUC) but record §2.6's finding."*
The parenthetical is the defect restated as a requirement: a policy that "must pass on a null GUC" is
a policy that grants every tenant's billing data to any connection that forgot to set one. The
finding is recorded (§2.2 above, 2 of 2 rows visible), and the granting policy is removed rather than
preserved.

---

## 5. Closure table — the 11 BROKEN_POLICY sites of §1.3

| § | Gap | Sites | Status |
|---|---|---|---|
| (a) | `"Tenant"` has no UPDATE / INSERT / DELETE policy | 2 | **REMAINS** |
| (b) | `audit_log` — raises on the default GUC, and the derived `WITH CHECK` contradicts the writer's contract | 1 | **PARTIAL** |
| (c) | `SupportTicket` — no policy can admit a NULL-tenant row | 4 | **REMAINS — product decision** |
| (d) | `stops` / `carrier_documents` / `route_template_stops` | 4 | **CLOSED** |

### (a) `"Tenant"` — REMAINS. 2 sites.

`api/email-confirm/[token]/route.ts:54` · `lib/onboarding/hydrate-tenant.ts:36`.

Out of scope here and not preflighted, so nothing about it was measured by this task. Two things
carry forward:

- The fourth caller, `(admin)/actions/tenants.ts` (6 statements), is a sysadmin acting on **another**
  tenant and needs the admin connection of §3.2 — i.e. **B5 again**.
- **Seven more `Tenant` writers sit outside the 211 bypass sites and outside every prior count**:
  `(admin)/actions/tenants.ts:98, 190, 229, 432, 542, 625` and
  `(owner)/settings/operations/actions.ts:40`. The last is the sharp one — it runs on a
  **correctly-scoped** tenant client and still fails, because `tenant_self_read` is `FOR SELECT`.
  That is the whole `/settings/operations` page, which is the only UI for both Document Import
  inspection settings.

### (b) `audit_log` — PARTIAL. 1 site (`lib/security/audit-log.ts:68`).

**Closed:** the `22P02`. Proven, both directions, §2.1.

**Remains:** `pg_policies.with_check` is NULL on this policy, so under `FOR ALL` PostgreSQL derives
the check from `USING` — before and after this migration. `writeAuditLog`'s own documented contract is
*"this call succeeds regardless of which tenant context the caller is operating under … the audit
system must write even during RBAC-denied access attempts where the calling context may differ from
the row being audited."* The derived check forbids exactly that. Measured post-fix, verbatim:

```
INSERT INTO audit_log (tenant_id = tenant B) with app.current_tenant_id = tenant A
  ERROR [42501] new row violates row-level security policy for table "audit_log"

INSERT INTO audit_log (tenant_id = tenant A) with app.current_tenant_id = ''
  ERROR [42501] new row violates row-level security policy for table "audit_log"
```

The second line is worth reading twice: before this migration that insert was a `22P02`, and it is now
a `42501`. **The write is still refused; only the reason changed.** That is an improvement (a policy
decision rather than a type error, and no longer a hard failure on a read path) and it is not a fix.

Closing it means splitting the policy per §3.1 item 4 — `FOR SELECT USING (tenant_id =
current_tenant_id())` plus `FOR INSERT WITH CHECK (true)`. `audit_log` already carries
`REVOKE UPDATE, DELETE`, so an append-only table with an unconditional insert and a tenant-scoped read
is the intended audit property. Deliberately not done here: the plan scoped this task to the cast.

### (c) `SupportTicket` — REMAINS. **This is a product decision and this document does not make it.**

4 sites: `actions/support-tickets.ts:169` (create) · `:217` (`getMyTickets`) · `:371`
(`getTicketById`) · `:410` (`addOwnerReply`).

The policy is `USING ("tenantId" = current_tenant_id())` with a derived check.
`SupportTicket.tenantId` is nullable **by design** (`20260328000002_nullable_tenant_support_ticket`),
so a sysadmin can file a ticket with no tenant. For a NULL-tenant row the predicate is
`NULL = current_tenant_id()` -> NULL -> not true, **at every GUC value including NULL**, because
`NULL = NULL` is NULL.

Findings carried forward from this task's preflight (measured on production by the orchestrator, not
re-measured here — this task never connected to production):

- **7 null-tenant rows out of 87.**
- They are **the same 7 rows** as the 7 `submittedBy` FK orphans.
- All 7 point at **one** hard-deleted user. 0 `TicketMessage` rows. 3 OPEN (TKT-0038, TKT-0044,
  TKT-0061), 4 CLOSED (TKT-0001, TKT-0036, TKT-0037, TKT-0067). Created 2026-03-28 .. 2026-07-17.
- **No tenant-facing path reaches them.** Verified in this repository: `getMyTickets:217` filters
  `submittedBy: userId` and `getTicketById:371` filters `tenantId AND submittedBy: userId`, so both
  require the live session user to be the submitter — and the submitter does not exist. They surface
  only on the sysadmin dashboard via `getAllTickets`, which works today **solely** because `postgres`
  has `BYPASSRLS`.
- **A correct policy cannot admit them "for their submitter", because the submitter does not exist.**
  §3.1 option (i) keys on `app.current_user_id`, the GUC §2.2 shows nothing sets; and even with it,
  no live user matches.

The four options are: a sentinel tenant row · a soft-delete of the 7 rows · restoring the deleted user
· archiving them out of the table. **Choosing between them is a human decision.** Nothing was deleted,
no tenant was invented, and the policy was not widened.

**Also found, and it is a code change rather than a migration:** `support-tickets.ts:239-240` carries
a comment that is false in both halves —

```
// Use $queryRaw — raw SQL bypasses RLS entirely, no set_config needed.
// SupportTicket has no RLS so this is safe for cross-tenant admin access.
```

Raw SQL does **not** bypass RLS; only Prisma's `where`-injection layer is bypassed. And
`SupportTicket` has `relrowsecurity = true`, `relforcerowsecurity = true` and two policies
(`bypass_rls_policy`, `tenant_isolation_policy`) — read off `pg_class` and `pg_policies` on staging
during this task. `getAllTickets` works because of the role, not because of the absence of RLS, and
the comment is the kind that survives a cutover as a reason not to look.

### (d) `stops` / `carrier_documents` / `route_template_stops` — CLOSED, **and the design doc's premise is stale.**

4 sites: `(driver)/actions/driver-dashboard.ts:86` · `(driver)/actions/driver-routes.ts:202` ·
`api/driver/stops/[stopId]/messages/route.ts:105` · `api/v1/carrier/stops/[id]/messages/route.ts:89`.

§1.3(d) and §2.3 state that production has **zero** policies on all three. That reading is out of
date: `20260912130000_tenant_policy_grant_and_default_privilege_closure` (checklist B1) shipped a
`tenant_isolation_policy` to each. This task measured all three **live on staging** and **satisfiable
as `app_user`** — see §2.2, the empirical half that a `pg_policy` row cannot supply, since each policy
joins a table that carries RLS itself. The production half rests on the orchestrator's preflight
measurement that both databases carry 183 policies with a byte-identical
`(name|cmd|permissive|USING|WITH CHECK)` digest (`83f0a5e51586bbc924c0c33b6dbd3151`), not on any
connection made by this task.

One consequence worth restating because it is easy to read the wrong way round: all three carry
**no `bypass_rls_policy`** (deliberately — see `20260912130000` Part 3). The `app.bypass_rls` line at
those four call sites is therefore **already a no-op** against them, and must be replaced by setting
`app.current_tenant_id`, not by relying on the bypass.

---

## 6. The four §2.6 / §2.2 "incorrect policy" items

| Item | Status |
|---|---|
| `"PushToken".user_isolation_policy` unsatisfiable | **CLOSED** — dropped. See §7. |
| `SysAdminInvoice*` "deny" pair permissive and therefore granting | **CLOSED** — dropped. Unscoped visibility 2 -> 0; tenant-scoped visibility unchanged. Breaks four files at the cutover: §4. |
| `in_app_notifications_insert_policy` `WITH CHECK (true)` | **CLOSED** — now `org_id = current_tenant_id()`. Cross-tenant INSERT accepted -> 42501; own-tenant INSERT accepted in both phases. |
| `"Promo"` missing `UPDATE` grant (checklist B2) | **CLOSED** — `42501 permission denied for table Promo` -> 1 row. |

**One item deliberately left alone, and reported:** `in_app_notifications_select_policy` and
`in_app_notifications_update_policy` both key on `(auth.jwt() ->> 'org_id')::uuid`. PostgREST sets
that claim; a `pg`/Prisma connection never does, so both return NULL and are **dead**. They are
permissive and therefore harmless — `tenant_isolation_policy` is `FOR ALL` and covers both commands
correctly, which §2.2 confirms (tenant A sees 1 row, tenant B's 0). Dropping them is a reasonable
tidy-up and is **not** part of this task, because unlike the SysAdmin pair they grant nothing.
`UserNotificationPreference.user_isolation_policy` is dead for the same reason (`auth.uid()`) and is
likewise untouched.

---

## 7. Why `"PushToken".user_isolation_policy` was dropped rather than made satisfiable

**Decision: DROP.**

- It is PERMISSIVE and its predicate is
  `("userId")::text = current_setting('app.current_user_id', true)`. Nothing in this repository ever
  sets that GUC — the only occurrences are the `CREATE POLICY` in
  `20260327000006_add_push_token/migration.sql:23`, a note in `src/lib/auth/mobile-auth.ts:21`
  recording that it is *not* set from the HTTP context, and two derived comments. So
  `current_setting(..., true)` is NULL, the comparison is NULL, and the policy has **never matched a
  row**. Dropping a permissive policy that matches nothing changes no visibility in either direction.
- Making it satisfiable would mean inventing `app.current_user_id` here. That GUC is scheduled work
  (`.planning/phase-0-revised.md` §10, "role-within-tenant and driver self-scoping at the DB layer")
  and introducing it as a side effect of a policy-repair task would pre-empt a design decision with
  a one-line migration.
- The table is not left unprotected: `PushToken.tenantId` is `NOT NULL` with 0 null rows, and
  `tenant_isolation_policy` (`FOR ALL`, `USING/WITH CHECK ("tenantId" = current_tenant_id())`) stays.
  Measured after the drop: tenant A sees its own token and **none** of tenant B's.

**What is lost:** per-user scoping on `"PushToken"` — but it was never in force, so the drop removes
the *appearance* of an enforcement, not an enforcement. Nothing relied on it, and one file relies on
it being dead: `src/lib/notifications/send-push.ts` documents that `sendPushToUser`'s
`app.bypass_rls` scope is "STRICTLY load-bearing … That policy can never pass, so the bypass is the
only reason this query returns rows at all." That remains true and unchanged — `bypass_rls_policy` is
untouched on `"PushToken"`, and the query's real fix (a tenant predicate, or the privileged
connection) is unaffected either way.

If per-user scoping on push tokens is wanted, it has to be **built**, against a GUC something
actually writes.

---

## 8. Why no RESTRICTIVE policy was added

The obvious repair for the SysAdmin pair is to keep the policies and flip them to `AS RESTRICTIVE`, so
that "deny" means deny. **That would have been a serious mistake.**

A restrictive policy is `AND`'d with **all** permissive policies on the table — including
`bypass_rls_policy`. A restrictive tenant predicate on `"SysAdminInvoice"` would therefore silently
neuter the bypass on that table, which is the one thing this task must not touch, and it would do so
invisibly: `bypass_rls_policy` would still be listed in `pg_policies`, still be counted at 86, and
simply stop working.

Dropping the granting policy reaches the identical end state — a tenant sees its own rows via
`tenant_isolation_policy`, an unscoped connection sees none — without going near the bypass. Measured:
86 bypass rows before and after, same table set.

---

## 9. Environment hazard, worth keeping

`apps/web/scripts/_bootstrap-env.ts:53-55`:

```ts
if (process.env.DIRECT_URL) {
  process.env.DATABASE_URL = process.env.DIRECT_URL;
}
```

This runs **unconditionally**, and `.env`, `.env.local` and `apps/web/.env.local` all point
`DIRECT_URL` at **production**. Consequences:

1. Running any script that imports `_bootstrap-env` with only `DATABASE_URL` pinned inline is
   **silently repointed at production**. `npm run audit:rls-policy-drift` is one such script. Pin
   **both** variables, every time.
2. A script that must not reach production must not import it at all. The two instruments this task
   added (`597-staging-fixtures.ts`, `597-policy-verify.ts`) load `apps/web/.env.staging` explicitly,
   read `STAGING_DIRECT_URL` / `STAGING_DATABASE_URL_APP_USER` directly, and **refuse to start** if
   either resolved URL contains the production ref or fails to contain the staging ref.

Two smaller notes from the same family:

- `scripts/migrate.mjs` spawns `scripts/seed-starter-playbooks.ts`, which resolves a **bare**
  `DATABASE_URL` with no dotenv of its own. Applying a migration with fixtures present therefore
  creates `Playbook` / `PlaybookStep` / `PlaybookTrigger` / `StepTemplate` rows for every active
  tenant. On staging this task's teardown removes them (6 / 54 / 2 / 54 rows); on production this is
  the normal, idempotent behaviour and is not a side effect of this migration.
- `apps/web/.env.staging`'s own header still says the password is the placeholder token and must be
  replaced. It has been replaced; all three connection strings authenticate. The comment is stale and
  would send the next reader looking for a problem that is fixed.

---

## 10. Staging was returned to its pre-task state

`597-staging-fixtures.ts --verify-clean`, after teardown:

```
"Tenant" 0 · audit_log 0 · "PushToken" 0 · in_app_notifications 0 · "SysAdminInvoice" 0 ·
"SysAdminInvoiceItem" 0 · stops 0 · carrier_documents 0 · route_template_stops 0 ·
"SupportTicket" 0 · "Promo" (RLS597-PROMO) 0
CLEAN — every table above is empty. Exit 0.
```

Also confirmed zero: `"Playbook"`, `"PlaybookStep"`, `"PlaybookTrigger"`, `"StepTemplate"`,
`"Promo"` (all rows), `dispatches`, `loads`, `facilities`, `carrier_trucks`, `clients`,
`carrier_drivers`, `route_templates`, `"User"`.

The **migration stays applied** on staging; only the fixtures were removed.
