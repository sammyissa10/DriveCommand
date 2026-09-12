# Phase 0 (Revised): Tenant Isolation

Supersedes `phase-0-tenant-isolation.md` (Prompts A1–A4) and all earlier
revisions of this file.
Last updated: 2026-09-12
Status: **Blocked on bypass design. See §9.**

---

## 0. Read this first

Phase 0 set out to audit whether tenant isolation is enforced. The answer is
that **it has never been enforced at the database layer**, for two
independent reasons, and that **the repository and production describe
different databases**.

Neither was visible from the original four prompts. Both are now measured.

The application-layer `where` injection in `tenant-rls.ts` is what has been
isolating tenants all along, and it still works. Nothing here is currently
exploitable. But every step that was supposed to turn on database-level
enforcement is blocked behind work nobody had scoped.

Three earlier prompts in this file were written on premises the evidence has
since contradicted. Where a decision was reversed, the reversal and its
evidence are recorded rather than the decision quietly edited.

---

## 1. Working rules

1. Every session runs **from the repo root**.
2. **Read-only queries against production are allowed** for evidence.
   `SELECT` through `execute_sql` is fine. No DDL, no DML, ever.
3. **No write of any kind to production originates from a session.**
4. **One artifact, one applier.** Migrations are applied with
   `node scripts/migrate.mjs` against a session-mode connection string. Not
   `prisma migrate deploy`, not `apply_migration`, not `db push`.
5. **Never edit a migration that has already run.** Corrections are forward
   migrations.
6. All prompts target the **`drivecommand-staging`** project
   (`wyixpgunnjmzguhggocz`). Preview branches do not work — see §3.6.
7. One branch and one PR per prompt.
8. The drift detector runs before and after each prompt; both raw outputs go
   in the PR description.
9. **The applier spawns a seeder that resolves `DATABASE_URL`.** Repointing
   only `DIRECT_URL` writes into production. A guard now refuses on
   mismatched refs; set both inline regardless.

---

## 2. Current sequence

| # | Step | Status |
|---|---|---|
| — | Role guard and storage audit | Done, `cc995ab1` |
| — | Auth guard triage | Done, `d193b877` |
| 0 | Tenant identity trust boundary | Done, `b10e9020` |
| 0.5 | Drift gate armed, recurrence closed | Done, `54f7b4cc` |
| — | Branch viability | Done, `1d18c48c` |
| 0.75 | Staging project created | Done |
| — | Migration chain repaired | Done, `75409679` |
| — | Ledger integrity audit | Done |
| 1A | Money precision + ticket integrity | Done, `698374d5`, `174c001c` |
| 1 | Policies, grants, default privileges | Done, `c360b35f` — bypass drop deferred |
| — | GUC binding audit | Done, `9378b06c` |
| — | GUC binding fix feasibility | Done, `78814f90` |
| — | Wrapper migration scope | Done, `2e2f04b7` |
| — | Five-helper transaction removal | Done, quick-596 |
| **2** | **Bypass replacement design** | **Next — blocking** |
| 3 | Inlined-GUC policy rewrite (3 policies) | Pending |
| 4 | `RAISE` tripwire + CI countdown | Pending |
| 5 | 25P02 sites (17) | Pending |
| 6 | `withTenantContext` migration, groups A → B → C | Pending |
| 7 | Bypass policy drop | Pending |
| 8 | `app_user` cutover | Pending |
| 9 | Cross-tenant test matrix | Pending |

Steps 2 through 8 were previously one prompt. They are not.

---

## 3. Findings

### 3.1 The 59 "missing" policies were never functional

The drift detector reported 59 missing policies across 13 carrier tables,
suppressed against a baseline. `docs/diagnostics/rls-policy-drop-forensics.md`
established the loss removed exactly the output of
`20260404100013_carrier_rls_policies` and `20260527000001_quick410_advisor_rls_fix`
while sparing `20260515000001_db_security_standardization`, with no repository
artefact accounting for it.

The April migration's header resolves what the forensics could not: all 59 are
JWT-based, keyed on `auth.jwt()` and `auth.uid()`. Those read
`request.jwt.claims`, which PostgREST sets on a Supabase API request. A Prisma
connection has no JWT, so they return null and every one of those policies
would deny every row on every Prisma query.

**Verified:** nothing reads carrier tables through the Supabase client.
`apps/web/src` has three matches, all client construction under `lib/supabase/`;
every other `.from(` is `Array.from`, `Buffer.from`, or
`supabase.storage.from(BUCKET)`. `apps/mobile` — 1,038 files scanned, zero hits.

**Decision: not restored.** Restoring them onto the Prisma path would deny
every row across the carrier surface. Role-within-tenant and driver
self-scoping move to a later phase, rebuilt on GUCs, as new work.

**Corollary:** role-within-tenant authorization and driver self-scoping have
only ever been enforced by application `where` clauses. Driver Portal is live.
Whether those clauses are all present is open, and becomes a named test in
step 9.

### 3.2 Tenant identity trust boundary — closed

`getTenantPrisma()` read `x-tenant-id` and never validated it against the
session. Proven red-first against the live database: forged header returned
another tenant's row. Fixed at the resolver — the header is now a veto, never
a source. Signup made fatal-with-rollback; a guard refuses authentication for
accounts already stranded. Production: 71 users, 0 tenantless.

### 3.3 The GUC has never been bound to the query

This is the central defect.

`getTenantPrisma` and `getTenantPrismaForOrg` call `prisma.$executeRawUnsafe`
to set `app.current_tenant_id` with **session scope**, then return a client
from `createTenantClient`. The extension header asserted that `max: 1` plus
single-threaded Vercel workers "guarantee no concurrent tenant overlap on a
given physical connection."

Measured, 8-way concurrent over two tenants, as `app_user`:

| | `max: 1` | `max: 5` |
|---|---|---|
| pids identical | 24/24 | 5/24 |
| **wrong tenant read** | **12/24** | — |
| GUC read empty | 0 | 2 |

**At `max: 1` the pids match 24/24 and it still fails.** Connection binding was
never the invariant. A Node worker interleaves awaits, so two in-flight
requests overwrite each other's GUC between the `set_config` and the query.

Consequences under `app_user`: raw SQL returned another tenant's row 12/24;
model queries leaked 0 — injection holds — but returned silently empty 12/24,
no error, no log line.

Nothing resets the GUC on connection release. Only another `set_config`, idle
eviction at 10s, or Supavisor reassignment ends it.

Three claims in the extension header are false: the concurrency guarantee;
that port 6543 is the "Session Pooler" (it is transaction mode); and that the
pool `connect` handler resetting the GUC is sufficient (nothing resets on
release).

### 3.4 P2028 belongs to nesting, not to transaction scope

Session scope was a locked decision in every earlier revision, justified by
P2028 deadlocks on the pooler. Measured:

- Nested shape: 6/6 deadlock at `max: 1`, 5/6 at `max: 5`.
- `set_config(TRUE)` and query in **one** transaction: 128/128 correct, zero
  P2028, zero leaks.

`tenantRawQuery` has shipped the `TRUE`-in-one-transaction shape all along,
with no P2028 in 7 days of production runtime errors — verified the log was
non-vacuous (137 `Error`, 72 `Prisma` hits) before trusting the zero.

**The session-scope lock is withdrawn.** It avoided a failure that transaction
scope does not cause.

### 3.5 The extension cannot carry the fix

A Prisma extension *can* detect transaction state — `__internalParams.transaction`
is undefined outside, `{kind:'itx'}` or `{kind:'batch'}` inside — and a
prototype binding correctly was built and measured.

It should not ship. Two reasons:

- **Structural deadlock at `max: 1`.** Binding needs a transaction, a
  transaction pins a connection, `max: 1` has one. 25/64 P2028.
  `transactionOptions` moves 4/64 → 33/64 and stops. The extension can only
  bind per-operation; a call-site wrapper binds per unit of work, which is
  why the same topology measured 128/128 for it.
- **`$queryRaw` never enters `$allModels`.** All 350 raw sites stay exactly as
  exposed as today. The extension approach fixes the surface that already had
  injection as defence-in-depth and leaves untouched the surface where actual
  cross-tenant reads were measured.

**Chosen: the call-site wrapper**, `withTenantContext`.

### 3.6 Preview branches cannot serve as a verification target

Measured. A branch came up with **zero tables** against production's 98.
Supabase seeds a branch from its own ledger, which holds 36 entries against
the repo's 141 with zero exact name matches — and that ledger has no baseline,
its earliest entry being an `ALTER TABLE "Customer"` against a table nothing
in it creates. Hence the second project, seeded by `scripts/migrate.mjs`.

### 3.7 Production and the repo describe different databases

The chain could not replay from zero — it died at 38 of 141 on
`Document.driverId`, a column `schema.prisma` declares, production holds, and
no migration creates. Seven defects of four kinds were repaired; the chain now
replays, 147 for 147, 98 tables for 98.

The ledger audit is the larger finding:

| | |
|---|---|
| False ledger claims (`steps=1`, objects absent) | **9** |
| Resolved-not-run markers (`steps=0`, objects present) | 20 |
| Ledger orphans | 1 |
| Untracked production objects | 55 |
| Reconciliation gap, production-only | 55 |
| Reconciliation gap, rebuild-only | 349 |
| Type divergences | 43 |
| Foreign keys with unwritten `ON UPDATE CASCADE` | 87 |

The `steps=0` rows are honest — every object they claim is present. The damage
is in rows counted as sound. `20260515000001` is missing 90 named objects and
236 columns.

One checksum matches no version of its file in git history, and production
holds that migration's uniqueness as a bare index rather than the declared
constraint — two independent measurements agreeing the SQL that ran was not
the SQL in the file.

Four `driver_pay_records` money columns were `numeric(65,30)` — Prisma's
default `Decimal` with no annotation, which is what `db push` emits — while
every other money column in 98 tables is `(10,2)` or `(12,2)`. Repaired in 1A.

Best available reading: production's schema has been shaped largely by
Prisma's schema-sync path while the ledger recorded authored files as applied.
Offered as a reading; the logs that would confirm it expired.

**This is a separate phase.** It does not block tenant isolation — policies,
grants and RLS flags match exactly between the two databases.

### 3.8 The bypass is not decorative

quick-596 inverted the premise it was given. Across five shared helpers: 18
`$transaction` calls, 18 `set_config('app.bypass_rls','on',TRUE)` calls,
paired 1:1. **`TRUE` is transaction-local, so the transaction is the bypass's
scope.** These are not atomicity boundaries.

The prescribed remedy — pass the caller's transaction in — would have left
`app.bypass_rls = on` for the rest of that caller's unit of work, i.e. every
subsequent query in the request under `withTenantContext`. A deadlock fails
closed and loud; that fails open and silent. Correctly refused.

| helper | verdict |
|---|---|
| `resolveSenderConfig` | UNNECESSARY — removed. Bypass is a verified no-op: `relrowsecurity=false`, 0 policies |
| `getCurrentUser` | NECESSARY — `User` is FORCE-RLS; bootstrap read precedes any tenant GUC |
| `sendPushToUser` | NECESSARY — policy keys on `app.current_user_id`, which nothing sets |
| `recordActivationEvent` | NECESSARY — genuine atomicity, see below |
| `sendInstanceBlocked` | NECESSARY — `PlaybookInstance` FORCE-RLS |

`recordActivationEvent` is idempotent by field: a partial failure advances
`completionPct` with no `AppEvent`, and the retry takes the early exit and
never writes it. Permanent funnel loss, manual backfill only.

Group 1b: 64 → **57**, a reduction of 7 not 14 — seven of
`resolveSenderConfig`'s units have a second path to a transaction and
re-attributed to `sendPushToUser`, now the largest resolver at 20.

**`PushToken`'s RLS policy is unsatisfiable.** It keys on
`app.current_user_id`, which nothing in the repo sets. That table's isolation
today rests entirely on the bypass every reader sets. Dropping
`bypass_rls_policy` stops push notifications entirely.

### 3.9 Scope, corrected

"~90 call sites" appeared in three earlier prompts. It was the
`requireTenantId` count (93). Measured:

**449 call sites · 456 units of work · 198 files.**

| group | units | files | |
|---|---|---|---|
| A | 336 | 154 | move as-is |
| B | 98 | 65 | inner transaction must be removed first |
| C | 22 | 20 | need restructuring |

| risk | units | files |
|---|---|---|
| Nested transactions | 108 | 69 |
| — grep-visible | 44 | 36 |
| — via call chain only | 64 → 57 | 38 |
| External I/O held across the DB span | 8 | 6 |
| Multi-write units | 46 | 35 |
| — where atomicity is a behaviour change | 5 | 5 |
| **Transaction-abort (25P02)** | **17** | **16** |

### 3.10 The 25P02 finding

Not in any earlier scoping. Postgres aborts a transaction on any statement
error, so `try { await db.x.create() } catch { log }` — harmless under
autocommit — becomes a cascade once the unit of work is one transaction. 17
sites.

`createCarrierDriver` is the sharpest: its own comment states a failed
user-link leaves the driver record valid. Under one transaction that record is
destroyed. **A security fix introducing silent data loss.**

### 3.11 The migration can be incremental

`current_tenant_id()` returning NULL on an unset GUC is exactly what makes an
unmigrated path silently empty. A `RAISE` there makes it loud, below every
call site, without touching one.

87 of 92 tenant policies on staging route through it. Three inline the GUC and
must be rewritten first; two inverted SysAdmin deny-policies must be left
alone. Pair with a CI countdown — neither signal alone covers the call-chain
cases.

**This dissolves the all-or-nothing cutover constraint.** Without it, 198
files land in one PR.

### 3.12 Auth guard tests are stale, not broken

Three files, triaged, all TEST_STALE. `require-auth` and `require-role` mock a
module deleted in `de01979f` while importing from its replacement — a
`vi.mock` specifier takes a string literal, so an import-path sweep passes
over it and so does `tsc`. Red for five months.

`validate-mobile-token` carries a trap: its failing assertions encode the
insecure behaviour. The fixture puts claims in `user_metadata`; the guard
correctly reads `app_metadata`, which is not user-writable. **The fixture
moves. The guard does not.**

---

## 4. Locked decisions

| Decision | Value | Why |
|---|---|---|
| GUC name | `app.current_tenant_id` | Referenced by `current_tenant_id()` and every live policy |
| GUC scope | **Transaction, `TRUE`, bound in one transaction with the query** | §3.3, §3.4. Supersedes the session-scope lock |
| Binding mechanism | **Call-site wrapper**, not the extension | §3.5 |
| Policy shape | `tenant_isolation_policy` FOR ALL, GUC-based | The only shape that evaluates on a Prisma connection |
| Column naming | `tenantId` and `org_id` read per table from `information_schema` | Dual naming is real |
| `stops` scoping | Via `dispatch_id`, not `load_id` | `load_id` nullable at 74/791 |
| `carrier_documents` | Via `uploaded_by` | Avoids a migration on a live table |
| Tenant identity source | Authenticated session only | §3.2 |
| Index creation | Plain `CREATE INDEX` | Affected tables under 800 rows |
| Definitions read from | **Production, never `schema.prisma`** | §3.7 — that artifact was hand-synced |

---

## 5. Withdrawn decisions

Recorded so the reversal is visible.

| Was | Now | Why |
|---|---|---|
| Session scope, `FALSE`, because `TRUE` deadlocks | Transaction scope, `TRUE` | P2028 belongs to nesting. 128/128 clean in one transaction |
| Blanket policy shape is intended design | It is the residue of a loss event | Forensics: the granular set was live on 2026-05-28 |
| Bypass drop is one step in Prompt 1 | It needs its own design phase | §3.8 — 14 of 18 sites need it to function |
| Cutover is "change the role, not the route" | Route changes too, 6543 → 5432 | Runtime is on the transaction pooler |
| Cutover rollback is two env vars | True only if the assertion is flag-gated | `postgres` has `BYPASSRLS`; a hard throw blocks rollback |
| ~90 call sites | 449 sites / 456 units / 198 files | The 90 was the `requireTenantId` count |
| "Move CROSS_TENANT paths to the privileged connection" | There is no privileged connection | One client, one `DATABASE_URL`, privileged only incidentally |
| Preview branch as verification target | Second project | §3.6 |

---

## 6. Environment

**Production** `oqdhberkghtnszrkdvfm` · Nano · pool 30 · max 200 clients ·
`max_connections` 60.
Runtime `DATABASE_URL` → `:6543` transaction mode. Migrations `DIRECT_URL` →
`:5432` session mode.

**Staging** `wyixpgunnjmzguhggocz` · Micro · pool 15 · max 200 ·
`max_connections` 60. Note the larger tier carries the **smaller** pool;
saturation measured on staging understates production by half.
Cluster is `aws-0`, production is `aws-1`.

`app_user` exists on both: `rolsuper=false`, `rolbypassrls=false`,
`rolcanlogin=true`. Staging password recorded as
`STAGING_DATABASE_URL_APP_USER` in `apps/web/.env.staging` (gitignored).

The chain creates `app_user` **NOLOGIN** while production has
`rolcanlogin=true` — the grant was applied out of band and the role's
production state is not reproducible from migrations. Closed in step 1.

---

## 7. What is done

- Tenant identity closed at the resolver; signup no longer strands accounts.
- Drift gate armed at zero with no suppression, proven non-vacuous, on CI.
- `db push` guard blocks production across seven cases, fails closed.
- Five documents reconciled onto one migration workflow.
- `CLAUDE.md` line 131 corrected — no auto-deploy hook exists.
- Migration chain replays from zero.
- Money precision and support-ticket integrity repaired.
- Policies, grants, default privileges, `app_user` LOGIN, indexes — staging
  drift zero, 183 expected / 183 live.
- Seeder guard in `migrate.mjs`, proven both directions.
- Five helpers classified; one transaction removed; group 1b 64 → 57.

---

## 8. What is not done, and why

**`bypass_rls_policy` still exists** — 86 instances, drop staged unapplied in
a sibling `deferred-bypass-drop.sql`. Blocked on §9.

**No CROSS_TENANT path has moved** — 50 sites across 26 files. The
instruction named a destination that does not exist.

**`Tenant` has no INSERT, UPDATE or DELETE policy.** Signup, email
confirmation and onboarding hydration break under `app_user` regardless of
anything else. The tenant-creation path runs before a tenant exists and cannot
be tenant-scoped by construction.

**`SupportTicket_submittedBy_fkey`** — 7 orphans, all pointing at one
hard-deleted user, and `submittedBy` is `NOT NULL`. The fix is the
user-deletion path, not the constraint. `User` has no `deletedAt` column, so
this recurs on every deletion.

**The chain's from-zero replay is untested since 1A.** One staging project,
already carrying the full chain, nowhere to test it.

---

## 9. Next: bypass replacement design

**Blocking everything else.**

The Prompt 1 classification split 211 bypass sites into DECORATIVE and
CROSS_TENANT. §3.8 shows that split is the wrong axis. The real categories are:

1. **Bootstrap reads** — the path runs before a tenant context can exist.
   `getCurrentUser` reading FORCE-RLS `User` at authentication. The
   tenant-creation path. These have no tenant-scoped answer.
2. **Genuine cross-tenant reads** — cron digests, sysadmin surfaces, the
   public tracking page.
3. **Unsatisfiable-policy compensation** — `PushToken`, whose policy keys on a
   GUC nothing sets. The bypass is not covering for a missing tenant; it is
   covering for a broken policy.
4. **Decorative** — the path is tenant-scoped and the bypass was never needed.

Each needs a different replacement. Category 3 needs the policy fixed, not a
bypass. Category 1 needs either an admin path or a self-read policy. Only
category 2 wants something like the admin connection that does not yet exist.

Until this is designed, the migration cannot proceed: routing calls through
`withTenantContext` while 14 of 18 helper sites depend on a bypass that is
about to be dropped just moves the failure.

---

## 10. Follow-up — outside Phase 0

- **Schema reconciliation phase.** 9 false ledger claims, 55 untracked
  objects, 349 rebuild-only, 43 type divergences, 87 unwritten cascades.
- **Six migration methods in the project's history** — `migrate deploy`,
  `migrate.mjs`, MCP `apply_migration`, MCP `execute_sql`, direct `pg`,
  `db push`, with `migrate resolve` papering over the disagreements. This is
  the root cause of every schema defect found in Phase 0.
- **User deletion path** hard-deletes and orphans dependents. `User` has no
  `deletedAt`.
- **Role-within-tenant and driver self-scoping at the DB layer**, rebuilt on
  GUCs. Needs `app.current_user_id` and `app.current_user_role`.
- **User-scoped RLS on `grid_view` and `grid_preference`** — application
  `where` clauses only today.
- **Delete the 211 `app.bypass_rls` calls** once the policy is gone.
- **Workflow engine tests** — 45 failures across 7 files.
- **Driver-pay test failures** — 4 golden exporters plus `settlements-paid`.
- **`[settlement/finalize] R2 upload failed`** — a path still calling
  Cloudflare R2 after the P5 move to Supabase Storage. If live, settlement
  PDFs are not being stored.
- **`resolveSenderConfig` swallows a TypeError** and falls back to env.
- **`search-index.json` and the generated Prisma client are in version
  control** and stale.
- **Nine private `requireAdminAccess` definitions**, the ninth divergent.
  `markCongratsShown` is the only tenant-touching server action with no guard.
- **`apps/web/.env.local` has every key duplicated.**
- **Ship Postgres logs off-platform**, then install `pgaudit`. Retention is
  ~24h; the 2026 loss was found three months later.
- **`sql_drop` event trigger** — post-deploy step, then a superuser question.
  `CREATE EVENT TRIGGER` needs superuser and `postgres` is not one.
- **The stray `main` branch record** on production. Dashboard action.
- **`vi.mock` specifiers are invisible to import-path sweeps and `tsc`.** Any
  module rename must grep `vi.mock(` / `vi.doMock(` / `jest.mock(` for the old
  specifier as a separate step.
