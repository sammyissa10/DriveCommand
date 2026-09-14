---
phase: quick-600
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/prisma/migrations/20260914140000_admin_connection_role/migration.sql
  - apps/web/src/lib/db/admin-reasons.ts
  - apps/web/src/lib/db/admin-prisma.ts
  - apps/web/tests/security/admin-connection-allowlist.test.ts
  - apps/web/scripts/audit/600-admin-verify.ts
  - apps/web/.env.staging
  - apps/web/src/lib/db/repositories/tenant.repository.ts
  - apps/web/src/lib/automations/evaluator.ts
  - apps/web/src/actions/support-tickets.ts
  - docs/audits/admin-connection.md
  - docs/audits/bypass-replacement-design.md
  - .planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md
  - .planning/quick/600-build-the-privileged-admin-connection-b5/evidence/
  - .planning/quick/600-build-the-privileged-admin-connection-b5/600-SUMMARY.md
  - .planning/STATE.md
  - CLAUDE.md

must_haves:
  truths:
    - "A dedicated app_admin role exists on staging with rolbypassrls=true, LOGIN granted out of band, and DML ONLY on the tables the routed paths touch — verified by a grant read, with the excluded set named."
    - "getAdminDb(reason) returns a PrismaClient built from DATABASE_URL_ADMIN on a SECOND pool that does NOT carry the tenant-GUC connect initialiser, logs every call with its reason, and cannot be called without a reason (compile error)."
    - "The two-direction boot guard asserts the ADMIN pool is app_admin with rolbypassrls=true AND the TENANT pool is not app_admin; it is flag-gated so today's postgres tenant pool does not hard-throw, and the post-cutover strict half is switched on by one env var."
    - "The import allowlist gate FAILS on a deliberate getAdminDb import outside the allowlist, and the failure output is quoted verbatim in the summary — proven red, then reverted."
    - "Every candidate site carries an explicit written verdict — ROUTE / CORRECT-to-getTenantPrismaForOrg / LEAVE-with-named-owner — and counts are reported against the expected 4 sysadmin billing paths / 6 Tenant write sites / 21 CROSS_TENANT sites with every difference explained."
    - "At least one candidate is reported as a CORRECTION rather than routed, because the tenant is already in hand at that statement."
    - "Every routed site has BOTH-DIRECTIONS evidence on staging: the operation succeeds on the admin connection AND the same operation as app_user under a foreign or empty tenant GUC is refused or returns zero — SQL and result quoted."
    - "bypass_rls_policy is untouched: 86 policies before and after, compared as a sorted table list."
    - "No credential is in git: the migration creates the role NOLOGIN, the password is set out of band, and the admin connection string exists only in the gitignored apps/web/.env.staging."
    - "What still has no route after this lands is named site by site — including both generateTicketNumber copies (B7), the getCurrentUser sysadmin branch (B8), and every BOOTSTRAP site left for B3 or section 4.1."
  artifacts:
    - path: "apps/web/prisma/migrations/20260914140000_admin_connection_role/migration.sql"
      provides: "idempotent CREATE ROLE app_admin BYPASSRLS NOLOGIN, the narrow grant set, the commented rollback, and the statement that the password is set out of band"
      contains: "app_admin"
    - path: "apps/web/src/lib/db/admin-prisma.ts"
      provides: "second pool, adminPrisma, getAdminDb(reason), two-direction flag-gated boot guard, and the explicit NOT-list"
      contains: "getAdminDb"
    - path: "apps/web/src/lib/db/admin-reasons.ts"
      provides: "the closed AdminReason union — one literal per routed unit of work, each naming what the path does"
      contains: "AdminReason"
    - path: "apps/web/tests/security/admin-connection-allowlist.test.ts"
      provides: "CRLF-normalised source scan — allowlist equality both directions, per-file call counts, alias ban, found-assertion and length floor"
      contains: "ADMIN_ALLOWLIST"
    - path: "apps/web/scripts/audit/600-admin-verify.ts"
      provides: "per-routed-site both-directions probe matrix on staging, production-ref refusal, nothing swallowed"
    - path: ".planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md"
      provides: "every candidate with a verdict, counts against 4/6/21, the derived table set that fixes the grant scope, and the deliberate-exclusion list"
    - path: "docs/audits/admin-connection.md"
      provides: "the design record, the production runbook (who sets DATABASE_URL_ADMIN and where), the capacity decision, and the allowlist-growth rule"
  key_links:
    - from: ".planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md"
      to: "apps/web/prisma/migrations/20260914140000_admin_connection_role/migration.sql"
      via: "the manifest's derived table set IS the grant list — the migration grants nothing the manifest does not name"
      pattern: "GRANT SELECT, INSERT, UPDATE, DELETE"
    - from: "apps/web/src/lib/db/admin-prisma.ts"
      to: "apps/web/tests/security/admin-connection-allowlist.test.ts"
      via: "the test scans src/ for imports of the module and compares the file set to ADMIN_ALLOWLIST in both directions"
      pattern: "admin-prisma"
    - from: "apps/web/src/lib/db/admin-reasons.ts"
      to: "the routed call sites"
      via: "reason is a closed union, so a new admin call is a type change in a reviewable file rather than an import"
      pattern: "AdminReason"
---

<objective>
Build the privileged admin connection — checklist item **B5** of
`docs/audits/bypass-replacement-design.md` §5 — and route onto it the paths that genuinely need
cross-tenant or pre-tenant access. **STAGING ONLY. No cutover. `DATABASE_URL` is not touched.**

Purpose: today every cross-tenant path works only because `DATABASE_URL` resolves to `postgres`,
which carries `rolbypassrls = true`. The day `bypass_rls_policy` is dropped and `DATABASE_URL`
moves to `app_user`, all of them break at once. B5 is the prerequisite that gives them somewhere to
go — and gives the codebase, for the first time, a **countable and reviewable** privileged surface
instead of a role attribute nobody can see from the source.

Output: an `app_admin` role on staging, `getAdminDb(reason)`, a two-direction boot guard, a CI
import-allowlist gate proven to fire, a written routing manifest with a verdict per candidate, the
routed sites, and both-directions staging evidence for every one of them.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@CLAUDE.md

Read in full before writing anything (use `sed -n` — the design doc is 963 lines):
- `docs/audits/bypass-replacement-design.md` §1.1 (lines 93-121), §1.2 (121-164), §2.4-2.6
  (526-566), §3.2-3.4 (582-697), §4.4-4.5 (755-777), §5 (777-866)
- @docs/audits/policy-satisfiability-sweep.md
- @docs/audits/tenant-audit-automation-policy-closure.md
- @docs/audits/rls-policy-satisfiability-fixes.md

Read for pattern, not for content:
- `apps/web/scripts/audit/599-policy-verify.ts` — the staging-refusal header, the four ground
  rules, the SAVEPOINT probe shape. Copy this discipline exactly.
- `apps/web/tests-db/rls-isolation/env.ts` — `requireStagingUrl`, `probe`,
  `probeWriteThenRollback`, "it fails, it never skips".
- `apps/web/tests/security/bypass-rls-flag-removal.test.ts` — the CRLF-normalised source-scan
  shape, with its `minBytes` floor and its two-direction (retained AND removed) assertions.
- `apps/web/src/lib/db/prisma.ts` (92 lines) — the pool this task must NOT copy wholesale.
- `apps/web/src/lib/context/tenant-context.ts:200` — `getTenantPrismaForOrg(tenantId, userId?)`,
  which is where CORRECTIONS go.
- `apps/web/prisma/migrations/20260914120000_tenant_audit_automation_policy_closure/migration.sql`
  — migration header style.

## Facts already measured. Do not re-measure; do not contradict.

1. Production and staging are **ALIGNED at 183 policies**, byte-identical, digest
   `99abc8b7112e797944fe0df0855fd56a`, `bypass_rls_policy` **86** on both. quick-599's migration was
   applied to production out of band between that task closing and this one starting.
   **§5 item B1's sentence "staging has 183 to production's 179" is STALE** — correct it in the
   design doc as part of this task, the way quick-599 corrected its own predecessors.
2. `postgres`: `rolsuper=false`, `rolbypassrls=true`, `rolcanlogin=true`, `rolcreaterole=true`,
   `rolcreatedb=true`, `rolconnlimit=-1`, member of `{anon, app_user, authenticated, authenticator,
   pg_create_subscription, pg_monitor, pg_read_all_data, pg_signal_backend, service_role,
   supabase_privileged_role}`.
3. `app_user`: `rolsuper=false`, `rolbypassrls=false`, `rolcanlogin=true`, no memberships.
4. **No dedicated admin role exists today.** The other `rolbypassrls=true` roles are all
   Supabase-owned (`service_role` nologin, `supabase_admin` superuser, `supabase_etl_admin`,
   `supabase_read_only_user`) and none is appropriate to borrow.
5. `max_connections` = 60 on both databases.
6. The established role-creation pattern is
   `20260515000001_db_security_standardization/migration.sql:17-22`: a guarded
   `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_user') THEN CREATE ROLE
   app_user NOLOGIN; END IF; END$$;`. `app_user`'s LOGIN and password were granted **out of band by
   a human, never in git.** Follow that exactly.
7. `apps/web/.env.staging` is gitignored (`.gitignore:42`) and untracked. It currently holds
   `STAGING_DATABASE_URL`, `STAGING_DIRECT_URL`, `STAGING_DATABASE_URL_APP_USER`.
8. `apps/web/src/lib/db/prisma.ts` is 92 lines, one client from `process.env.DATABASE_URL`, and
   `pool.on('connect')` at :64-74 runs `set_config('app.current_tenant_id', '', false)` on every new
   physical connection. `max: 1`, `idleTimeoutMillis: 10000`.
9. Candidate line numbers verified against today's `master` and they match the design doc's
   `aa38953c` snapshot: `(admin)/actions/tenants.ts` Tenant writes at 98/190/229/432/542/625; all 21
   CROSS_TENANT sites present at their stated lines. **One site the snapshot does not have:**
   `api/cron/automations/route.ts:179` — a Phase 52 addition. It is a candidate and must get a
   verdict.
10. The cron sweeps are already in their **own** `prisma.$transaction`, separate from their loop
    bodies. Routing the sweep is a clean swap, not the A1 restructuring.

## Decisions already taken. Implement them; do not relitigate.

**ROLE: a dedicated `app_admin`, NOT `postgres`.** Record this reasoning in the migration header and
in `docs/audits/admin-connection.md`:
- `postgres` is far more than "a role that bypasses RLS" — it carries `createrole`, `createdb`,
  `pg_signal_backend`, `pg_read_all_data` and membership in `app_user`, `service_role`,
  `authenticated`, `anon`. An admin connection needs bypass-RLS plus DML on the tables the routed
  paths touch, and nothing else.
- **The decisive reason is the boot guard.** With `postgres` on the admin pool, after cutover
  `DATABASE_URL_ADMIN` and today's `DATABASE_URL` would be the *same credential*: `current_user`
  identical on both pools, so nothing could distinguish a correct deployment from one where
  `DATABASE_URL` was mistakenly pointed at the admin string. **A naming convention is not a
  control.** With a dedicated role the two-direction guard becomes a real assertion.
- It is separately revocable (`ALTER ROLE app_admin NOLOGIN`) without touching the role migrations
  run as, and separately visible in `pg_stat_activity` and the Supabase logs.

**NAMES: follow this plan, not the design doc, where they differ — and note the divergence:**
- env var is **`DATABASE_URL_ADMIN`** (design doc says `ADMIN_DATABASE_URL`)
- the accessor is **`getAdminDb(reason)`** (design doc says `withAdminContext(reason, fn)`)

The design doc's *properties* all still apply: required non-optional reason, no tenant extension, no
tenant-GUC initialiser on that pool, logged on every call, countable call sites.

**One deliberate strengthening, to be stated in the summary:** the task prompt says
`getAdminDb(reason: string)`; this plan types it `getAdminDb(reason: AdminReason)` over a closed
string-literal union. That is design §3.2 mechanism 2 verbatim — "a new reason is a type change, so
adding an admin call is a reviewable diff rather than an import" — and it costs one file. The reason
*values* are plain prose (`'sysadmin invoice listing'`), per Step 6 of the brief.

**The role's password is NEVER committed.** The migration creates the role `NOLOGIN` and
idempotently. For staging the executor may mint a password itself and record the resulting string
ONLY in the gitignored `apps/web/.env.staging`. Nothing about production's value goes anywhere in
the repo — the plan must state the production value's shape and who sets it.
</context>

<hard_constraints>

Violating any of these is a task failure, not a judgement call.

- **STAGING ONLY (`wyixpgunnjmzguhggocz`). Production (`oqdhberkghtnszrkdvfm`) is never written.**
  Every instrument loads `apps/web/.env.staging` explicitly, **NEVER imports
  `scripts/_bootstrap-env`** (it runs `process.env.DATABASE_URL = process.env.DIRECT_URL`
  unconditionally and every env file points `DIRECT_URL` at PRODUCTION), and REFUSES to start if the
  resolved URL contains the production ref or lacks the staging ref.
- **Apply migrations ONLY with `node scripts/migrate.mjs`, both env vars pinned inline to staging.**
  Never `prisma migrate deploy`, never Supabase MCP `apply_migration`, never `execute_sql` for DDL,
  never `db push`. `migrate.mjs` writes its own `_prisma_migrations` row (`applied_steps_count = 1`,
  checksum `'manual'`), so DEC-17's hand-written mirror row is NOT needed here — but **read the
  newest `_prisma_migrations` row back afterwards and quote it**; "the DDL is live" is evidence of
  the half that was never in doubt.
- **DO NOT change `DATABASE_URL`, and perform no part of the cutover.**
- **DO NOT touch `bypass_rls_policy`.** Assert 86 before and after, compared as a sorted table list,
  not as a count alone.
- **DO NOT route anything to admin that a tenant client can serve.**
- **DO NOT weaken any policy to make a path work.** If a routed path needs a policy change, STOP and
  REPORT it rather than changing it.
- **No credential in git, ever** — not in a migration, not in a doc, not in a fixture, not in an
  evidence file. Mask every connection string that is printed.
- **Do not install any package.**
- **No `AS RESTRICTIVE`. No policy DDL inside a `DO` block** (the replay parser is line-anchored). A
  `CREATE ROLE` inside a `DO` block is fine and is the established pattern — that parser only reads
  CREATE/DROP POLICY.
- `scripts/audit/rls-policy-canonical.json` is regenerated **if and only if policies change**. This
  task is not expected to add any; if it does, that is a signal to re-read the don't-weaken-policies
  constraint, not a reason to regenerate.
- Source-scanning guards MUST normalise CRLF (`core.autocrlf=true`, no `.gitattributes`) and MUST
  carry both a "was it actually found" assertion and a length floor. **The failure mode of a bad
  slice is green, not red** (quick-546).
- Stop `next dev` before any mass file change, and delete `apps/web/.next` if the tree was swapped
  under a running server.

</hard_constraints>

<tasks>

<task type="auto">
  <name>Task 1: Verify the dependent list, write the routing manifest, then create app_admin on staging</name>

  <files>
.planning/quick/600-build-the-privileged-admin-connection-b5/ROUTING-MANIFEST.md
apps/web/prisma/migrations/20260914140000_admin_connection_role/migration.sql
.planning/quick/600-build-the-privileged-admin-connection-b5/evidence/00-baseline.md
  </files>

  <action>
**This is the step most likely to be rushed. It must not be. The grant scope in the migration is
derived from the manifest, so a lazy audit produces a wrong role.**

### 1a. Baseline, before anything

Against **staging only**, record into `evidence/00-baseline.md`:
- `SELECT count(*) FROM pg_policies WHERE policyname = 'bypass_rls_policy';` → expect 86, and the
  **sorted `tablename` list** beside it. That list is the comparison object at the end, not the
  count.
- `SELECT rolname, rolsuper, rolbypassrls, rolcanlogin, rolconnlimit FROM pg_roles WHERE rolname IN
  ('postgres','app_user','app_admin');` → `app_admin` absent.
- the newest `_prisma_migrations` row (`migration_name`, `applied_steps_count`, `checksum`).

Use a one-off `pg.Client` on `STAGING_DIRECT_URL`, or Supabase MCP `execute_sql` **for reads only**
— remember it returns only the LAST statement's result, so one result set per call.

### 1b. Enumerate every candidate and give each an explicit verdict

Build `ROUTING-MANIFEST.md` as one table with columns:
`file:line · function · what it does · verdict · reason string (if ROUTE) · tables touched · evidence note`.

**Verdict vocabulary — exactly three values:**
- `ROUTE` — genuinely cross-tenant or pre-tenant. Goes on `getAdminDb`.
- `CORRECT` — **the tenant is already in hand at that statement.** Goes through
  `getTenantPrismaForOrg(tenantId)` instead. This is a correction of the design doc's
  classification, not a routing.
- `LEAVE` — out of B5's scope. Must name the checklist item that owns it, and stay on its current
  bypass, untouched.

**The candidate set, which you must walk in full:**

1. **The 21 CROSS_TENANT sites** (design §1.2). Read each one. Expect corrections — the design doc
   is a snapshot and its own §5 A7 says every commit can move the numbers. Two are already visible
   from the code: `cron/workflow-notifications/route.ts:81` and `:96` are
   `stepInstance.update({ where: { id } })` inside a loop where `step.playbookInstance.tenantId` is
   **already in hand** — those are `CORRECT`, not `ROUTE`. Check `auto-close-tickets:53` and
   `evaluator.ts:203` for the same shape before routing them.
2. **The 6 `"Tenant"` write sites** in `(admin)/actions/tenants.ts` at 98/190/229/432/542/625
   (design §4.4). None is a bypass site; all work only because `postgres` has BYPASSRLS.
3. **The sysadmin billing paths.** The brief's expected count is **4**; the four *files* are
   `(admin)/actions/sysadmin-invoices.ts`, `(admin)/billing/[id]/page.tsx`,
   `api/cron/mark-overdue-invoices/route.ts`, `lib/email/send-sysadmin-invoice.ts`.
   `sysadmin-invoices.ts` alone carries ~18 bare-`prisma` statements — **report the real statement
   count and explain the difference against "4"**; do not silently reinterpret the number.
   `(owner)/actions/subscription.ts` also touches `SysAdminInvoice` and is a **tenant** path — it is
   a `CORRECT` or `LEAVE` candidate, never `ROUTE`. §2.6 is why this surface matters: the two
   `sysadmin_invoices_deny_*` policies are named "deny" but are **permissive**, so today every
   GUC-less connection sees every tenant's invoices.
4. **The BOOTSTRAP sites** (design §1.1 — 7 sites / 5 files). §3.2 says only four want the admin
   connection: `tenant.repository.ts:66`, `accept-invitation:44`, `accept-invitation:121`,
   `track/[token]:24`. `supabase.ts:164` is **B8** (`LEAVE`). `provision-tenant.ts:36` and
   `tenant.repository.ts:33` are **B3 / §4.1** — give them a verdict with reasoning; if the two
   global probes (the cross-tenant email `findFirst` and the slug-uniqueness loop) cannot be hoisted
   onto admin without restructuring the transaction, that is a `LEAVE` naming §4.1, and say so
   plainly rather than half-doing it.
5. **`api/cron/automations/route.ts:179`** — not in the design doc's snapshot. Verdict + reasoning.
6. **The 2 `generateTicketNumber` copies** (`actions/support-tickets.ts:98`,
   `api/mobile/support/ticket/route.ts:39`). **Decision, taken here: `LEAVE`.** §3.3 says an admin
   connection is the wrong fix — the correct fix is `CREATE SEQUENCE support_ticket_number` with
   `GRANT USAGE` to `app_user` (checklist **B7**), which removes the cross-tenant read AND the live
   race in one change. Routing them would paper over a data-model problem and add two allowlist
   entries B7 immediately deletes. **They therefore still break at cutover, and that must appear in
   the "what still has no route" list by name.**
7. **The 6 DECORATIVE loop bodies inside the cron sweeps.** `LEAVE` — they are §1.4 D5 and checklist
   **A1/A2**, and A2's rule is that a bypass line is deleted in the same commit that wraps its unit
   of work in `withTenantContext`, which this task does not do. Route **only** the sweep statement in
   each file.

**For each `ROUTE` verdict also record:** the exact tables the statement touches and the operations
(S/I/U/D). The union of those is the grant list for 1c — nothing else goes in it.

**Counts section, mandatory.** State final counts per category against the expected **4 / 6 / 21**
and explain **every** difference, in both directions (a site that moved to `CORRECT`, a site the
snapshot did not have, a line that shifted). A count that matches without explanation is as suspect
as one that does not.

### 1c. The migration

`apps/web/prisma/migrations/20260914140000_admin_connection_role/migration.sql`.

Header comment must record: that the role is `app_admin` and not `postgres`, the three reasons from
`<context>` (privilege minimisation · **the boot-guard argument** · separate revocability), that the
password is set **out of band by a human** and is in no repository artefact, the exact grant scope
and what it deliberately excludes, and a commented rollback block.

Statements:
1. Guarded role creation, copying `20260515000001_db_security_standardization:17-22`:
   `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='app_admin') THEN CREATE ROLE
   app_admin BYPASSRLS NOLOGIN; END IF; END$$;`
   Then a separate idempotent `ALTER ROLE app_admin BYPASSRLS;` so a pre-existing role without the
   attribute is corrected rather than silently accepted.
2. `GRANT USAGE ON SCHEMA public TO app_admin;`
3. `GRANT SELECT, INSERT, UPDATE, DELETE ON <exactly the tables from the manifest> TO app_admin;` —
   one explicit alphabetised table list, **not** `ALL TABLES IN SCHEMA`.
4. `GRANT USAGE, SELECT ON SEQUENCE <…>` **only** where a routed table actually has a sequence
   default — check `information_schema.columns.column_default` rather than assuming; most ids here
   are cuid/uuid and need none. If none is needed, say so in a comment instead of granting.
5. `ALTER ROLE app_admin SET statement_timeout = '30s';` — a privileged connection with no ceiling
   is a privileged connection that can take the database down. State the value chosen.

**Deliberately NOT in this migration, each named in the header as excluded:** `GRANT ALL`;
`ALTER DEFAULT PRIVILEGES` (so a table added later is **not** automatically reachable — adding an
admin path must be a migration); `CREATE` on the schema; any role membership; `LOGIN`; any password;
`_prisma_migrations`; `Plan`; `Promo`; and every table no routed path touches.
**`app_admin` has BYPASSRLS, so policies do not constrain it — GRANTs are the only remaining
control, which is the whole argument for the narrow list.**

### 1d. Apply to staging, and read it back

From `apps/web`:
```
DIRECT_URL="<staging>" DATABASE_URL="<staging>" node scripts/migrate.mjs
```
Both vars pinned inline to the SAME staging project, or the script's own `assertSameProjectRef`
refuses to spawn the seeder.

Then read back and quote in `evidence/00-baseline.md`:
- the `app_admin` row from `pg_roles` (expect `rolbypassrls=true`, `rolcanlogin=false` at this
  point);
- its grants: `SELECT table_name, privilege_type FROM information_schema.role_table_grants WHERE
  grantee='app_admin' ORDER BY 1,2;` — and assert the table set **equals** the manifest's list, both
  directions;
- the newest `_prisma_migrations` row, proving it is this migration and not the previous one;
- `bypass_rls_policy` still 86, **sorted table list identical** to the baseline.

### 1e. Give the role a staging login, out of band

`ALTER ROLE app_admin LOGIN PASSWORD '<minted>';` — run as a one-off statement against staging,
**not** in the migration file. Add `STAGING_DATABASE_URL_ADMIN=` to `apps/web/.env.staging`
(gitignored) pointing at **port 5432 session mode**. Never print it unmasked.
  </action>

  <verify>
- `ROUTING-MANIFEST.md` exists, every candidate has one of the three verdicts, and the counts section
  explains every difference against 4 / 6 / 21.
- At least one `CORRECT` verdict exists with its reasoning.
- `information_schema.role_table_grants` for `app_admin` equals the manifest's table union exactly —
  assert both directions and quote the (empty) diff.
- `bypass_rls_policy`: 86 before, 86 after, sorted table lists byte-identical.
- The newest `_prisma_migrations` row is `20260914140000_admin_connection_role`.
- A connection on `STAGING_DATABASE_URL_ADMIN` returns `current_user = 'app_admin'` and
  `rolbypassrls = true`.
- `git status` shows no `.env.staging` and no credential in any tracked file. Grep the diff for the
  minted password string and confirm zero hits.
  </verify>

  <done>
`app_admin` exists on staging with bypass-RLS and DML on exactly the manifest's tables and nothing
else; the manifest records a defended verdict for every candidate with counts reconciled against
4 / 6 / 21; `bypass_rls_policy` is provably untouched; no credential is in git.
  </done>
</task>

<task type="auto">
  <name>Task 2: getAdminDb + the two-direction boot guard + the allowlist gate proven to fire, then route the manifest</name>

  <files>
apps/web/src/lib/db/admin-reasons.ts
apps/web/src/lib/db/admin-prisma.ts
apps/web/tests/security/admin-connection-allowlist.test.ts
apps/web/src/lib/context/tenant-context.ts
[the ROUTE and CORRECT sites from ROUTING-MANIFEST.md]
  </files>

  <action>
### 2a. `admin-reasons.ts` — the closed union

One exported type, `AdminReason`, as a string-literal union with **one member per routed unit of
work**, plus a `const ADMIN_REASONS` array of the same values so the test can count them.

**Reason strings say WHAT THE PATH DOES, never that it needs admin.** `'sysadmin invoice listing'`,
`'compliance digest tenant sweep'`, `'invitation lookup by token'`, `'public shipment tracking
lookup'`, `'tenant lookup by user id'`. Never `'requires elevated access'`, never `'bypass'`, never
`'cross-tenant'` as the whole string. A file header states this rule so the next edit inherits it.

### 2b. `admin-prisma.ts` — the second pool, beside `prisma.ts`, not inside it

A **separate module** rather than an addition to `prisma.ts`: it keeps the tenant module unchanged,
and it makes the import scan in 2c trivially precise — one module path instead of a named-export
grep over a file most of the app already imports.

- Second `Pool` from `process.env.DATABASE_URL_ADMIN`, `max: 1`, the same `idleTimeoutMillis` and
  `connectionTimeoutMillis` handling as `prisma.ts`, singleton on `globalThis` under a **different
  key** (`adminPool` / `adminPrisma`).
- **The `pool.on('connect')` tenant-GUC initialiser is NOT copied.** A comment says why in the
  design's own words: a bypassing connection has no use for a tenant GUC, and copying it would make
  the two pools look interchangeable. That comment is load-bearing — it is the thing that stops a
  later edit "fixing the inconsistency".
- `export async function getAdminDb(reason: AdminReason): Promise<PrismaClient>` — async because it
  awaits the memoised boot guard, and because `getTenantPrismaForOrg` is already async so the call
  shape matches. Logs **every** call: `logger.info('[admin-db] privileged query', { reason })`. Use
  `info`, **not** `warn` — `logger.warn` fires `Sentry.captureMessage` on every call and would flood
  Sentry. (`logger.error(message, error, context)` takes the error SECOND — CLAUDE.md.)
- No tenant extension is applied. `adminPrisma` is **not** exported from this module under any other
  name.
- A module header with an explicit **NOT-list**, in these words or better:
  - it does **not** set, read or clear `app.current_tenant_id`;
  - it does **not** apply `withTenantRLS`;
  - it must **never** be reachable from a request path that already has a tenant — if the tenant is
    in hand, the call belongs on `getTenantPrismaForOrg`, and **the allowlist in 2c is what enforces
    that, not this sentence** (a comment asserting an invariant is not evidence the invariant holds
    — quick-547/548);
  - it is **not** a general escape hatch for a query that is failing: a failing query under
    `app_user` is a policy or grant finding to report, not a reason to escalate.

**The two-direction boot guard**, memoised once per process, awaited by `getAdminDb` on first call
and by `getTenantPrismaForOrg`'s first call (one added `await` in `tenant-context.ts`):

```sql
SELECT current_user AS who,
       (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user) AS bypasses;
```

- **Admin direction — always assertable, pre- and post-cutover:** the admin pool must report
  `current_user = 'app_admin'` AND `bypasses = true`.
- **Tenant direction — pre-cutover:** the tenant pool must report `current_user <> 'app_admin'`.
  That is the half that can be asserted TODAY while `DATABASE_URL` is still `postgres`, and it is
  precisely the mistake a naming convention cannot catch: `DATABASE_URL` pointed at the admin string.
- **Tenant direction — post-cutover:** when `DB_ROLE_EXPECT_TENANT_ROLE` is set (it will be
  `app_user`), additionally assert `current_user` equals it AND `bypasses = false`.

Flag-gating, per design §3.2's explicit requirement that a rollback to `postgres` must not be
blocked by a hard throw: `DB_ROLE_ASSERT` ∈ `off` (default) | `warn` | `enforce`. `off` skips the
query entirely; `warn` runs it and logs a failure; `enforce` throws. `.env.staging` sets `enforce`.
**Half a guard gives a "privileged" client that silently is not and a "restricted" client that
silently is** — say that in the comment.

Also document the **capacity decision** in the header, as a decision and not a side effect: both
pools are `max: 1`, so a warm lambda that touches an admin path draws **two** Supabase pooler slots
instead of one; `max_connections` is 60. The admin pool is instantiated lazily on first `getAdminDb`
call, so a lambda that never touches an admin path still draws one.

### 2c. The import allowlist gate — a test, because there is no lint entry point

`apps/web/tests/security/admin-connection-allowlist.test.ts`. **It must be a test-based source scan,
not an ESLint rule**: `apps/web` has no working lint entry point (`next lint` no longer accepts
`--dir` on this Next version and ESLint 9 finds no `eslint.config.js` — the repo still has
`.eslintrc.*`). It lives under `tests/` so `vitest.config.ts`'s `tests/**` glob collects it, which is
what `npm test` and CI already run; it is a pure source scan and needs no database, so CI's dummy
`DATABASE_URL` is irrelevant to it.

Walk every `.ts`/`.tsx` under `apps/web/src`, **normalising `\r\n` → `\n` on read**. Assert:

1. **Allowlist equality, BOTH directions.** The set of files importing from `lib/db/admin-prisma` (or
   naming `getAdminDb`) equals `ADMIN_ALLOWLIST` exactly. A missing file fails; an extra file fails.
   The allowlist starts as **exactly the files this task routes** — no more.
2. **Per-file call count**, the §3.2 countdown: each allowlist entry records how many `getAdminDb(`
   calls it contains, and the test asserts equality. A new admin call inside an already-allowlisted
   file is therefore still a deliberate edit.
3. **No aliasing.** `getAdminDb\s+as\s+` and `adminPrisma\s+as\s+` must have zero matches anywhere in
   `src`. §3.2: `import { adminPrisma as prisma }` defeats reviewability in one line.
4. **`adminPrisma` is not exported or re-exported from any module other than `admin-prisma.ts`**, and
   `admin-prisma.ts` is not re-exported from `prisma.ts` or any barrel.
5. **Anti-vacuity, three assertions** — the quick-546 rule, and not optional:
   - the scan visited at least N files (N = a floor well under the real count, recorded);
   - every allowlist entry exists on disk and is ≥ its recorded `minBytes`;
   - a **counter-assertion**: a named file that is NOT on the allowlist and IS in the corpus (pick a
     stable one, e.g. `lib/db/prisma.ts`) is confirmed read and confirmed to contain zero
     `getAdminDb` matches. Without this, an empty-corpus bug passes every other assertion.

**PROVE THE RULE FIRES.** Add a deliberate `import { getAdminDb } from '@/lib/db/admin-prisma';` plus
one call into a file that is *not* on the allowlist. Run the suite. **Capture the failure output
verbatim** into `evidence/02-allowlist-gate-fires.md`. Then remove the deliberate import and confirm
green. Do the same for the alias rule (`import { getAdminDb as db }`). A gate that has never been
seen red is a gate nobody has tested.

### 2d. Route the manifest's `ROUTE` set

Mechanical, one unit of work at a time, in manifest order:
- replace `prisma.$transaction(async tx => { set_config('app.bypass_rls' …); return tx.X… })` with
  `const db = await getAdminDb('<reason>'); … db.X…`;
- for the non-bypass sites (`(admin)/actions/tenants.ts` x6, the sysadmin billing statements),
  replace the bare `prisma.` with the admin client;
- where a `$transaction` is still needed for atomicity, keep it — on the admin client.

**Deleting the `app.bypass_rls` line at a ROUTED site is correct and is NOT a violation of the A2
rule.** A2 governs DECORATIVE tenant-scoped paths, where the bypass is the only thing making the
query work until `withTenantContext` wraps it. Here the admin connection *is* the replacement, in the
same edit. Say this in the summary so the next task does not read it as a violation.

### 2e. Apply the `CORRECT` verdicts

Each `CORRECT` site moves to `getTenantPrismaForOrg(tenantId)` using the tenant it already holds
(e.g. `step.playbookInstance.tenantId`), and its `app.bypass_rls` line goes with it. **Report these
as corrections to the design doc's classification, not as routings** — they do not appear on the
allowlist and they shrink the privileged surface below the doc's own count. Update §1.2 in
`docs/audits/bypass-replacement-design.md` accordingly, and correct §5 B1's stale "183 to
production's 179" sentence in the same edit.

### 2f. Type-check, honestly

`npx tsc --noEmit` from `apps/web`, then **PROBE it**: inject `const x: number = 'y';` into a file
this task actually edited, re-run, confirm tsc reports **that** error, delete the probe. If the only
errors are syntax errors, or all in files you did not touch, the gate is blind, not green — delete
`apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` and re-run. Check for
stray `__probe.ts` files from previous runs before finishing.
  </action>

  <verify>
- `npx vitest run tests/security/admin-connection-allowlist.test.ts` passes, and
  `evidence/02-allowlist-gate-fires.md` quotes the **verbatim failure output** from both the
  deliberate out-of-allowlist import and the deliberate alias, with the green run after each revert.
- `getAdminDb()` with no argument is a **compile** error, and a reason not in `AdminReason` is a
  compile error. Demonstrate both with a temporary probe and quote tsc's message.
- `grep -rn "pool.on('connect'" apps/web/src/lib/db/` shows the handler in `prisma.ts` only.
- `grep -rn "getAdminDb\|adminPrisma" apps/web/src` — every hit is either `admin-prisma.ts`,
  `admin-reasons.ts` or an allowlisted file.
- `npx tsc --noEmit` clean **after** the probe confirmed the gate is live.
- `npm test` (default vitest config) — no regression against a baseline measured with the SAME
  reporter, `git stash`-clean, **after** the last edit of the task (quick-561/565/567). Report the
  `Test Files … | Tests …` summary line for both runs; a run whose output contains no test counts is
  not a green run.
  </verify>

  <done>
`getAdminDb(reason)` exists on its own pool with no tenant-GUC initialiser, logs every call, and
cannot be called without a reason; the boot guard asserts both directions and is flag-gated; the
allowlist gate has been **seen red** on a deliberate violation and quoted verbatim; every `ROUTE`
site is on the admin client and every `CORRECT` site is on `getTenantPrismaForOrg`; tsc is clean and
was probed.
  </done>
</task>

<task type="auto">
  <name>Task 3: Prove every routed path on staging in both directions, then close the verification bar</name>

  <files>
apps/web/scripts/audit/600-admin-verify.ts
.planning/quick/600-build-the-privileged-admin-connection-b5/evidence/
docs/audits/admin-connection.md
docs/audits/bypass-replacement-design.md
.planning/quick/600-build-the-privileged-admin-connection-b5/600-SUMMARY.md
.planning/STATE.md
CLAUDE.md
  </files>

  <action>
### 3a. `scripts/audit/600-admin-verify.ts` — the both-directions matrix

Model it on `scripts/audit/599-policy-verify.ts` and reuse its discipline verbatim:
- header stating **STAGING ONLY** and **never import `scripts/_bootstrap-env`**;
- `loadEnv({ path: resolve(APP_ROOT, '.env.staging') })`, then refuse on the production ref and
  refuse when the staging ref is absent — for `STAGING_DIRECT_URL`, `STAGING_DATABASE_URL_APP_USER`
  **and** the new `STAGING_DATABASE_URL_ADMIN`;
- **nothing is swallowed**: every probe records `{rows:n}` or `{error:{code,message}}` with the
  SQLSTATE and the full server message;
- every write probe inside `BEGIN … ROLLBACK`, each statement fenced with a SAVEPOINT — reuse the
  `probe` / `probeWriteThenRollback` shapes from `tests-db/rls-isolation/env.ts`;
- one FRESH client per case, all of a case's work in ONE transaction (Supavisor is transaction-mode:
  outside a transaction consecutive statements may land on different backends and a session-scope
  `set_config` would not be observed by the next one);
- **never print a connection string.**

Drive it from a table with **one entry per routed site**, each carrying the statement shape that site
issues. For each entry run **both directions**:

- **Direction A — admin succeeds.** As `app_admin` on `STAGING_DATABASE_URL_ADMIN`, with no
  `app.current_tenant_id` set at all, issue the statement. Expect rows / an affected count. For a
  sweep, expect rows spanning **more than one** tenant — assert `count(DISTINCT tenant) >= 2`, not
  merely `> 0`. **A cross-tenant read that returns one tenant's rows proves nothing about crossing.**
- **Direction B — the tenant client is still refused.** As `app_user` on
  `STAGING_DATABASE_URL_APP_USER`, with `app.current_tenant_id` set to fixture tenant **A**, issue
  the same statement against tenant **B**'s rows (or, for a sweep, the unscoped statement). Expect
  **0 rows** or a SQLSTATE (42501 / 23514 / 22P02). Record which.

**A rejection test alone passes by saying nothing** — that is why direction A is mandatory per site,
and why direction A's assertion is about *spanning*, not about *non-emptiness*.

Fixtures: reuse quick-597's, via `npx tsx scripts/audit/597-staging-fixtures.ts --seed` and
`--teardown`. Do **not** build a second fixture mechanism. Tear down when finished and run
`--verify-clean`.

Write `evidence/03-routed-sites.json` and `evidence/03-routed-sites.md`, one row per routed site with
the SQL, both results, and a PASS/FAIL. Quote the notable ones verbatim in the summary.

**If any routed path needs a policy change to work: STOP and REPORT it. Do not change the policy.**

### 3b. Close the verification bar

Run and record each, with the command line as run:

1. `DIRECT_URL="<staging>" DATABASE_URL="<staging>" npm run audit:rls-policy-drift` → exit 0, **zero
   name drift AND zero body-level definition drift**. Quote both halves.
2. `npm run test:rls-isolation` → passes. **State explicitly whether it covers anything this task
   touched** — it connects as `app_user`, not `app_admin`, so the honest answer is probably "it
   covers the tenant direction of some of the tables this task granted to `app_admin`, and nothing
   about the admin connection itself". Say that rather than implying broader coverage.
3. `npm run build` from `apps/web` → succeeds.
4. `npx tsc --noEmit` → clean, re-probed after the last edit of the task (inject
   `const x: number = 'y'` into a file this task edited, confirm tsc reports THAT error, delete it).
   Confirm no stray `__probe.ts` remains anywhere under `src`.
5. `bypass_rls_policy` → **86**, sorted table list byte-identical to `evidence/00-baseline.md`.
6. Staging returned to its pre-task state apart from the intended role and migration: fixtures torn
   down (`--verify-clean`), no leftover tenants, no orphan rows, `git status` clean apart from the
   intended files and with **no** `.env.staging`.

### 3c. `docs/audits/admin-connection.md` — the record

Sections:
- **Why `app_admin` and not `postgres`** — the three reasons, with the boot-guard argument stated as
  the decisive one, and the "a naming convention is not a control" line kept.
- **The grant scope**, the table list, and everything deliberately excluded (`GRANT ALL`,
  `ALTER DEFAULT PRIVILEGES`, `_prisma_migrations`, `Plan`, `Promo`, schema `CREATE`, any role
  membership). State that because `app_admin` bypasses RLS, **GRANTs are the only remaining control**
  on that connection.
- **The production runbook — who does what.** `DATABASE_URL_ADMIN` must be set **by a human** in
  Vercel **Production and Preview**, as a **port 5432 session-mode** string for the `app_admin` role
  on the production project, after applying the same migration to production and running
  `ALTER ROLE app_admin LOGIN PASSWORD '…'` out of band. **This task does none of that.** State the
  shape, never a value.
- **The capacity decision** — two `max: 1` pools per warm lambda, `max_connections` 60, the lazy
  instantiation that keeps admin-free lambdas at one slot.
- **The allowlist growth rule** — a new admin call is (i) a new `AdminReason` literal, (ii) an
  allowlist entry with a call count, (iii) a migration if it touches a table `app_admin` has no grant
  on. Three deliberate edits, which is the point.
- **What still has no route**, named individually — at minimum both `generateTicketNumber` copies
  (B7), `supabase.ts:164`'s sysadmin branch (B8), and whatever §4.1 bootstrap sites were left. For
  each: the checklist item that owns it and what it does at cutover.
- **What this task did NOT do:** no cutover, `DATABASE_URL` unchanged, production untouched, no
  policy added or weakened, `bypass_rls_policy` intact.

### 3d. Update the design doc, STATE.md, CLAUDE.md

- `docs/audits/bypass-replacement-design.md`: tick **B5**; correct §5 **B1**'s stale "183 to
  production's 179" sentence (both databases are now aligned at 183, digest
  `99abc8b7112e797944fe0df0855fd56a`); and correct §1.2's classification for every site this task
  found to be `CORRECT` rather than CROSS_TENANT — **strike through in place**, the way quick-599
  corrected `07-SUMMARY.md`, rather than silently rewriting.
- `.planning/STATE.md`: current position and what B5 leaves open.
- `CLAUDE.md`: add the durable rules this task establishes — at minimum: the admin connection is
  `app_admin` and never `postgres`, and **the reason is the boot guard**; `getAdminDb` is reachable
  only from the allowlist and a tenant-in-hand call belongs on `getTenantPrismaForOrg`; the
  tenant-GUC connect initialiser is deliberately absent from the admin pool; and `app_admin` bypasses
  RLS, so its GRANTs are the only control left.
  </action>

  <verify>
- `evidence/03-routed-sites.md` has one row per routed site with **both** directions, SQL and result
  quoted, and every row PASS. The row count equals the number of allowlisted call sites.
- Every sweep's direction-A assertion is `count(DISTINCT tenant) >= 2`, not `> 0`.
- `npm run audit:rls-policy-drift` (both vars pinned to staging) exit 0, zero name drift, zero body
  drift — both halves quoted.
- `npm run test:rls-isolation` passes, with a stated coverage claim that does not overreach.
- `npm run build` succeeds; `npx tsc --noEmit` clean and probed.
- `bypass_rls_policy` 86 / identical sorted table list, before vs after.
- `npx tsx scripts/audit/597-staging-fixtures.ts --verify-clean` reports clean.
- `git status`: no `.env.staging`, no credential anywhere in the diff (grep the diff for the minted
  password and for `postgresql://` and confirm only masked or placeholder forms).
  </verify>

  <done>
Every routed site has both-directions staging evidence; the full verification bar is closed with
commands and outputs quoted; `docs/audits/admin-connection.md` records the design, the production
runbook, the capacity decision and the named list of what still has no route; the design doc,
STATE.md and CLAUDE.md are updated; staging is back to its pre-task state apart from the role and the
migration.
  </done>
</task>

</tasks>

<verification>

Quote the command line and the output for each. "It passed" is not evidence.

1. **The allowlist gate fires** — verbatim failure output for a deliberate out-of-allowlist import
   AND for a deliberate alias, with the green run after each revert.
2. **Both-directions evidence per routed site** — admin succeeds (spanning ≥ 2 tenants for sweeps),
   tenant client refused or zero. SQL and result quoted, measured on staging.
3. **Counts against 4 / 6 / 21** with every difference explained in both directions.
4. **`npm run audit:rls-policy-drift`** with both env vars pinned to staging: exit 0, zero name drift
   and zero body-level definition drift.
5. **`npm run build`** succeeds; **`npx tsc --noEmit`** clean **and probed** (inject
   `const x: number = 'y'` into a file this task edited, confirm tsc reports THAT error, delete it).
   If the only errors are syntax errors, or all in files you did not touch, the gate is blind.
6. **`npm run test:rls-isolation`** passes, with an honest statement of whether it covers anything
   this task touched.
7. **`bypass_rls_policy` 86 before and after**, compared as a sorted table list.
8. **What still has no route**, named site by site with its owning checklist item.
9. **Staging restored** — fixtures torn down and `--verify-clean` green; only the role and the
   migration remain.
10. **No credential in git** — grep the diff and confirm.

</verification>

<success_criteria>

- `app_admin` exists on staging with `rolbypassrls = true`, created `NOLOGIN` and idempotently by a
  migration applied with `node scripts/migrate.mjs`, with DML on **only** the tables the routed paths
  touch, and the excluded set named.
- `getAdminDb(reason)` exists on a second pool without the tenant-GUC connect initialiser, requires
  its reason at compile time, and logs every call.
- The two-direction boot guard asserts the admin pool is `app_admin`/bypass-true and the tenant pool
  is not `app_admin`, is flag-gated so today's `postgres` does not hard-throw, and has a one-env-var
  switch for the strict post-cutover half.
- The import allowlist gate exists as a CRLF-normalised source scan with an anti-vacuity
  counter-assertion, and **has been seen red**.
- Every candidate has a written verdict; every `ROUTE` is routed; every `CORRECT` goes to
  `getTenantPrismaForOrg` and is reported as a correction to the design doc.
- Every routed site has both-directions staging evidence.
- `DATABASE_URL` is unchanged, production is untouched, no policy was added or weakened,
  `bypass_rls_policy` is intact at 86.
- No credential is in git.

</success_criteria>

<output>
After completion, create
`.planning/quick/600-build-the-privileged-admin-connection-b5/600-SUMMARY.md`.

It must contain, at minimum:
- the routing manifest's counts reconciled against 4 / 6 / 21, with every difference explained;
- the verbatim allowlist-gate failure output;
- the both-directions evidence table;
- **what still has no route**, named site by site with its owning checklist item (B7 for both
  `generateTicketNumber` copies, B8 for `supabase.ts:164`, B3/§4.1 for anything left there);
- the production runbook line: who sets `DATABASE_URL_ADMIN`, where, and in what shape;
- what this task deliberately did NOT do.
</output>
