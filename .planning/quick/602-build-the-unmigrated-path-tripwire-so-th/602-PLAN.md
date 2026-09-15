---
phase: quick-602
plan: 01
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - apps/web/scripts/audit/602-tripwire-verify.ts
  - apps/web/scripts/audit/602-execution-sweep.ts
  - apps/web/prisma/migrations/20260914180000_tenant_context_tripwire/migration.sql
  - apps/web/scripts/audit/rls-policy-canonical.json
  - apps/web/scripts/audit/wrapper-countdown.ts
  - apps/web/scripts/audit/wrapper-countdown.json
  - apps/web/tests/security/wrapper-migration-countdown.test.ts
  - apps/web/package.json
  - docs/audits/unmigrated-path-tripwire.md
  - docs/audits/wrapper-migration-scope.md
  - docs/audits/policy-satisfiability-sweep.md
  - .planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/
  - .planning/quick/602-build-the-unmigrated-path-tripwire-so-th/602-SUMMARY.md
  - .planning/STATE.md
  - CLAUDE.md

must_haves:
  truths:
    - "The current policy classification is stated as 91 / 2 / 86 / 4 = 183 against the audit's 87 / 5 / 86 / 5, with the per-policy delta DERIVED from the three intervening migrations' SQL and each move attributed to a named migration."
    - "Whether the COALESCE fast path short-circuits under inlining is MEASURED as app_user on staging, not reasoned about; if it does not, current_tenant_id() becomes plpgsql with an explicit IF and the measured reason is recorded."
    - "Whether a permissive bypass_rls_policy OR'd with a tenant policy suppresses the raise is MEASURED on staging BEFORE the migration is written, and the exemption decision (if taken) is recorded with its cost — ~211 bypass sites unsignalled — rather than taken quietly."
    - "Tag and TagAssignment route through current_tenant_id() and the rewrite is proven NOT to change the predicate's meaning: row counts before and after under the same GUC, over seeded fixtures, across GUC = A / B / '' / unset / uppercase-uuid / non-uuid."
    - "The tripwire raises a distinct SQLSTATE TC001 that names the statement via current_query() in DETAIL and distinguishes an UNSET GUC from an EMPTY one — proven by executing both cases as app_user."
    - "With the tripwire flag OFF, every measured behaviour is byte-identical to today: same row counts, no raise, and npm run test:rls-isolation green."
    - "The flag is a GUC read at call time, never a settings table; the migration sets it NOWHERE, so the migration is a no-op the day it reaches production on the next deploy, and that is stated explicitly."
    - "Step 4 is an EXECUTION measurement: real application entry points are invoked against staging as app_user with the tripwire ON, and every one is reported BY NAME with one of four outcomes — RAISED_TC001, COMPLETED, OTHER_FAILURE, NOT_INVOKED — which are never merged."
    - "All 14 /api/cron/* route handlers are invoked and reported individually by name, and the four mechanism classes among them (getTenantPrisma / app.bypass_rls / getAdminDb / bare prisma) are reported against their outcomes."
    - "A COMPLETED verdict records whether the entry point issued any database statement at all, so 'completed' cannot be a vacuous green for a path that touched no policy."
    - "Entry points that were NOT invoked are listed by name with the reason, in their own section, and are never folded in with the passes."
    - "The CI countdown lists every unmigrated unit BY NAME in a committed artefact, recognises a migrated unit without withTenantContext existing, and its gate is proven RED on a tampered artefact and on a synthetic migrated snippet."
    - "rls-policy-drift.ts reports CLEAN against staging — 0 missing, 0 unexpected, 0 definition drift, 0 not-canonicalised — after rls-policy-canonical.json is regenerated."
    - "The write-up states plainly whether group A (336 units / 154 files) can now ship incrementally, and states SEPARATELY what the tripwire misses and what the countdown misses."
    - "Production is never written: 183 policies, the old current_tenant_id() body and the unchanged ledger head are re-read at close and quoted."
  artifacts:
    - path: "apps/web/scripts/audit/602-tripwire-verify.ts"
      provides: "staging-only, production-ref-refusing, both-directions SQL harness: baseline classification, mechanism probes, Tag equivalence matrix, post-migration tripwire matrix, fixture teardown"
      contains: "PRODUCTION_REF"
    - path: "apps/web/scripts/audit/602-execution-sweep.ts"
      provides: "step 4 — invokes real application entry points in-process against staging as app_user with the tripwire on, four-way outcome classification, DB-touched flag, invoked and not-invoked lists by name"
      contains: "NOT_INVOKED"
    - path: "apps/web/prisma/migrations/20260914180000_tenant_context_tripwire/migration.sql"
      provides: "current_tenant_id() with the tripwire branch, tenant_context_required() raising TC001, the two Tag/TagAssignment policy rewrites, grants/revokes, commented rollback"
      contains: "tenant_context_required"
    - path: "apps/web/scripts/audit/wrapper-countdown.ts"
      provides: "pure syntactic classifier + CLI that emits the by-name artefact of every unmigrated unit"
      contains: "withTenantContext"
    - path: "apps/web/scripts/audit/wrapper-countdown.json"
      provides: "the committed by-name enumeration: per-file unmigrated units, totals, and the withTenantContext call-site count"
    - path: "apps/web/tests/security/wrapper-migration-countdown.test.ts"
      provides: "CRLF-normalised source-scan gate with found-assertions, length floors, synthetic migrated/unmigrated snippets and a counter-assertion"
      contains: "COUNTDOWN"
    - path: "docs/audits/unmigrated-path-tripwire.md"
      provides: "the six named deliverables, every number traceable to a measurement, quoted SQL, and a 'what this did not measure' section"
  key_links:
    - from: "apps/web/prisma/migrations/20260914180000_tenant_context_tripwire/migration.sql"
      to: "apps/web/scripts/audit/rls-policy-canonical.json"
      via: "the two rewritten policy bodies must be regenerated into the artefact or the drift gate exits 3 and never prints CLEAN"
      pattern: "tenant_isolation_policy"
    - from: "apps/web/scripts/audit/602-execution-sweep.ts"
      to: "apps/web/src/lib/db/prisma.ts"
      via: "DATABASE_URL is set to staging-as-app_user BEFORE the dynamic import, because the pg.Pool is built at module scope"
      pattern: "DATABASE_URL"
    - from: "apps/web/scripts/audit/wrapper-countdown.ts"
      to: "apps/web/tests/security/wrapper-migration-countdown.test.ts"
      via: "the test imports the pure classifier and compares its output against the committed artefact in both directions"
      pattern: "wrapper-countdown"
---

<objective>
Build the **unmigrated-path tripwire** so the `withTenantContext` migration can ship incrementally
instead of as an all-or-nothing cutover. `docs/audits/wrapper-migration-scope.md` §5 designs it;
this task builds it, measures the three things that design assumed rather than measured, routes the
two remaining inline policies through the function, and then **runs the application against staging
as `app_user` with the tripwire on and reports every path that raises, by name**.

**STAGING ONLY. Production is never written. No cutover. No call site is migrated.**

Purpose: today an unmigrated path fails **silently** — the GUC is unset, `current_tenant_id()`
returns NULL, `"tenantId" = NULL` is unknown, the row is filtered, and the caller gets an empty
result with no error. That silence is the only reason the cutover has to be all-or-nothing: you
cannot ship half a migration when the other half degrades invisibly. Converting that silence into a
loud, attributable, **flag-gated** database error — plus a static countdown that catches the paths
no test exercises — is what relaxes the constraint.

Output: one migration (a tripwire branch inside `current_tenant_id()`, a raising helper carrying a
distinct SQLSTATE, and the two `Tag`/`TagAssignment` policies routed through the function), a
staging-only both-directions SQL harness, **an execution sweep that invokes real entry points and
names every outcome**, a committed by-name countdown artefact with a CI gate, and
`docs/audits/unmigrated-path-tripwire.md`.

**Task count:** seven, one more than this mode's stated cap of six. The seventh exists because step 4
(execution) and step 5 (static countdown) are two different instruments answering two different
questions, and the brief asks for both plus an explicit statement of what each one misses. Merging
them would be the substitution the brief pre-emptively rejects. Every task remains atomically
committable.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@CLAUDE.md

Read in full before writing anything (these are large — use `sed -n` in slices):
- `docs/audits/wrapper-migration-scope.md` — all of it; **§5 is the design this task builds**
- `docs/audits/policy-satisfiability-sweep.md` — §0, §1 (the 17 shapes, especially **S5**), §2 (the
  GUC census and the 12 writers), §3.4 (schema USAGE vs EXECUTE), §4.1 (silent-zero vs 42501), §7, §8
- `apps/web/scripts/audit/601-provisioning-verify.ts` — **its header is the conventions document**
  for both harnesses in this task: env discipline, the five ground rules, the drop/restore-from-
  catalogue pattern, fixtures, teardown, and — for Task 4 — **why it invokes the real functions
  rather than replaying their SQL**
- `docs/audits/guc-binding.md` — the inventory of cron and `after()` paths that swallow failures
  silently; that inventory is what makes the cron population the highest-value target in Task 4
- `apps/web/scripts/audit/rls-policy-drift.ts` and `apps/web/scripts/audit/598-canonicalise-policies.ts`
- `apps/web/src/lib/context/tenant-context.ts` and `apps/web/src/lib/db/prisma.ts` (the `pool.on('connect')`
  initialiser at ~line 69-71 is what writes `''`; `globalForPrisma.pool` is what Task 4 instruments)
- `apps/web/prisma/migrations/20260914160000_provisioning_under_app_user/migration.sql` — the house
  style for a policy-rewriting migration
- `apps/web/tests/security/admin-connection-allowlist.test.ts` — the house style for a source-scan gate
</context>

---

## Given facts — re-confirm, do not re-derive

These were measured read-only against **both** databases at plan time. The executor **must
re-confirm each one** as the first action of Task 1 (a stale premise is the quick-599 trap), but
must not spend the task rediscovering them.

| fact | value |
|---|---|
| policies in `public`, production `oqdhberkghtnszrkdvfm` and staging `wyixpgunnjmzguhggocz` | **183 each** |
| newest `_prisma_migrations` row, both | `20260914170000_activation_progress_congrats_shown_at` |
| route through `current_tenant_id()` | **91** |
| inline `current_setting('app.current_tenant_id', …)` | **2** — `Tag.tenant_isolation_policy`, `TagAssignment.tenant_isolation_policy` |
| `app.bypass_rls` policies | **86** |
| neither | **4** — `UserNotificationPreference.user_isolation_policy`, `audit_log.audit_log_append_policy` (INSERT, `WITH CHECK (true)`), `in_app_notifications_select_policy`, `in_app_notifications_update_policy` |
| | 91 + 2 + 86 + 4 = **183 ✓** |
| `Tag` / `TagAssignment` rows on staging | **0 each** — fixtures are mandatory |
| `current_tenant_id()`, byte-identical on both, `prosecdef=false`, `STABLE`, `LANGUAGE sql` | `SELECT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::UUID;` |
| roles | `app_user` `rolbypassrls=false`; `app_admin`, `postgres` `rolbypassrls=true` |
| `pg_db_role_setting` already carries | `app_user → idle_in_transaction_session_timeout=30s`, database-level `app.settings.jwt_exp=3600` |
| `rls-policy-canonical.json` today | `definitionCount: 183`, `projectRef: wyixpgunnjmzguhggocz` |

The two policies to rewrite, quoted verbatim from `pg_get_expr` on both databases today — ALL,
permissive, roles `{}` (PUBLIC), `WITH CHECK` null (derived from `USING`):

```sql
-- Tag.tenant_isolation_policy   AND   TagAssignment.tenant_isolation_policy
USING (("tenantId")::text = current_setting('app.current_tenant_id'::text, true))
```

**Connection strings** live in `apps/web/.env.staging`: `STAGING_DIRECT_URL` (postgres, 5432),
`STAGING_DATABASE_URL_APP_USER` (app_user, 6543), `STAGING_DATABASE_URL_ADMIN` (app_admin, 5432).
**Port 6543 is not reachable from this developer machine** — repoint to 5432 exactly as
`601-provisioning-verify.ts` does.

### The delta the write-up must explain — derive it, then check it against this

`wrapper-migration-scope.md` §5 recorded 87 covered / 5 inline / 86 bypass / 5 neither = 183. It is
three migrations stale. **Derive the per-policy moves from the migration SQL** and state each with
its migration name. The arithmetic that should come out, which is a check on the derivation and not
a substitute for it:

| migration | move | covered | inline | bypass | neither | total |
|---|---|---|---|---|---|---|
| (audit, 2026-09-12) | — | 87 | 5 | 86 | 5 | 183 |
| `20260913120000` (quick-597) | `audit_log.tenant_isolation_policy` inline-cast → `current_tenant_id()` | +1 | −1 | | | |
| `20260913120000` | `in_app_notifications_insert_policy` `WITH CHECK (true)` → `org_id = current_tenant_id()` | +1 | | | −1 | |
| `20260913120000` | dropped the two inverted `SysAdminInvoice`/`SysAdminInvoiceItem` deny policies | | −2 | | | |
| `20260913120000` | dropped `PushToken.user_isolation_policy` | | | | −1 | |
| **after 597** | | **89** | **2** | **86** | **3** | **180** |
| `20260914120000` (quick-599) | `tenant_self_update` added | +1 | | | | |
| `20260914120000` | `tenant_bootstrap_insert` added, inline `NULLIF(current_setting(…)) IS NULL` body | | +1 | | | |
| `20260914120000` | `audit_log` split into SELECT + INSERT halves; the INSERT half is `WITH CHECK (true)` | | | | +1 | |
| **after 599** | | **90** | **3** | **86** | **4** | **183** |
| `20260914160000` (quick-601) | `tenant_bootstrap_insert` → `id = current_tenant_id()` | +1 | −1 | | | |
| **today** | | **91** | **2** | **86** | **4** | **183 ✓** |

**After this task's migration: 93 / 0 / 86 / 4 = 183.** Coverage of the signal goes 91 → 93 of 183.

---

## The design being built

### The tripwire mechanism

Keep `current_tenant_id()` `LANGUAGE sql STABLE` so it stays **inlinable** — 91 policies call it,
many of them per-row — and put the raise in a separate plpgsql helper reached only through the null
branch:

```sql
CREATE OR REPLACE FUNCTION public.current_tenant_id() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    NULLIF(current_setting('app.current_tenant_id', TRUE), '')::uuid,
    CASE WHEN COALESCE(current_setting('app.tenant_context_tripwire', TRUE), 'off') = 'on'
         THEN public.tenant_context_required(current_setting('app.current_tenant_id', TRUE))
         ELSE NULL::uuid END
  );
$$;
```

`NULLIF` collapses **both** the unset case and the Supavisor `''` case (`prisma.ts`'s
`pool.on('connect')` writes `''` on every fresh physical connection) before the check. That is the
quick-597 finding and this design honours it: without the `NULLIF` the `::uuid` cast raises `22P02`
on `''`, which is a different, wrong error.

**The COALESCE short-circuit must be PROVEN, not reasoned about** (Task 1). If the fast path raises
under inlining or constant folding, fall back to a plpgsql `current_tenant_id()` with an explicit
`IF`, accept the loss of inlining, and record the measured reason and the measured cost.

### The raise helper

```sql
CREATE OR REPLACE FUNCTION public.tenant_context_required(p_raw text)
  RETURNS uuid LANGUAGE plpgsql STABLE AS $$
BEGIN
  RAISE EXCEPTION USING
    ERRCODE = 'TC001',
    MESSAGE = 'tenant context is required: app.current_tenant_id is '
              || CASE WHEN p_raw IS NULL THEN 'UNSET' ELSE 'the EMPTY STRING' END,
    DETAIL  = 'statement: ' || current_query(),
    HINT    = 'This statement ran with no tenant context. Acquire one (getTenantPrisma / '
              || 'getTenantPrismaForOrg / withTenantContext) before querying, or SET '
              || 'app.tenant_context_tripwire = ''off'' on this connection.';
END;
$$;
```

- **A distinct SQLSTATE, recognised by CODE and never by message prose.** `TC` is not one of
  PostgreSQL's standard classes (`00 01 02 03 07 08 09 0A 0B 0F 0L 0P 0Z 20 21 22 23 24 25 26 27 28
  2B 2D 2F 34 38 39 3B 3D 3F 40 42 44 53 54 55 57 58 72 F0 HV P0 XX`) — confirm that list against
  the server's own behaviour before relying on it.
- **`current_query()` in DETAIL is how "name the table and operation" is satisfied.** A policy
  expression has no `TG_TABLE_NAME`; the statement text is the only handle the database has.
- **UNSET is distinguished from the EMPTY STRING** because they have different causes: unset means
  no `set_config` ran on this connection at all; `''` means the pool initialiser ran and nothing
  overwrote it. The second is the one an unmigrated unit produces on a warm connection.
- **`app_user` needs an explicit `GRANT EXECUTE`.** §3.4 of the sweep is about schema **USAGE** at
  *name resolution*, which does not apply to a stored policy node tree — but EXECUTE **is** checked
  at runtime. Also `REVOKE ALL FROM PUBLIC` **and** explicit `REVOKE … FROM anon, authenticated,
  service_role`: quick-601 measured that both databases carry `ALTER DEFAULT PRIVILEGES … GRANT
  EXECUTE ON FUNCTIONS TO anon, authenticated, service_role` from two grantors, which a PUBLIC
  revoke does not touch, and Supabase's PostgREST exposes `public` functions to `anon` over `/rpc/`.

### The flag: a GUC read at call time, not a settings table

Stated here so the write-up can quote it. A settings-table read inside `current_tenant_id()` would
put **a query inside every policy evaluation on 91 policies**; that query would itself be subject to
RLS (recursion hazard) and would need its own grant. A GUC costs nothing. `ALTER ROLE app_user SET
app.tenant_context_tripwire = 'on'` flips it for every new connection in one statement, with no
migration and no deploy — and `pg_db_role_setting` already proves role-level custom GUCs work on
this Supabase instance. It defaults OFF **by the migration never setting it anywhere**, and a
session-level `SET` is the per-connection escape hatch.

**Consequence that must be stated in the migration header and the write-up:** this migration file is
committed, so `scripts/migrate.mjs` will apply it to production on the next `vercel --prod`. That is
intended and safe **because the flag is set nowhere**: with the flag off, `current_tenant_id()`
returns NULL exactly as today. The only production-visible change is the `Tag`/`TagAssignment`
predicate, whose equivalence Task 1 measures and Task 3 re-measures.

### The bypass-policy interaction — an OPEN QUESTION that may change the design

86 tables carry a permissive `bypass_rls_policy` OR'd with a tenant policy that calls
`current_tenant_id()`. **PostgreSQL does not guarantee the evaluation order of an `OR`**, and a
permissive-policy set is combined with `OR`. If the tenant arm is evaluated on a bypass-flagged
statement, every one of the ~211 bypass sites raises under the tripwire.

That is either the right answer or fatal noise, and it is **not decidable by reading**. Measure it
first (Task 1). If it is noise, the defensible scoping is: a bypass-flagged statement does **not**
produce a silent empty — the row is admitted — so it is not what the tripwire exists to catch, and
it is already enumerated by the Phase 0 bypass programme. The exemption is implemented by making
`tenant_context_required` return NULL instead of raising when
`current_setting('app.bypass_rls', TRUE) = 'on'`. **If that exemption is taken it is a RECORDED
DECISION with its cost stated — ~211 sites unsignalled — never a quiet convenience.** Task 4's cron
sweep will then show it directly: the five bypass-carrying cron routes will come back COMPLETED
rather than RAISED, and that is the exemption's cost made visible on real paths.

### Why the two inline policies must move

They are the precondition §5 named. `Tag` and `TagAssignment` read the GUC without the helper, so
the signal cannot reach them. The audit's third inline policy (`audit_log`) already moved in
quick-597, and the two deliberately-inverted `SysAdminInvoice*` deny policies that §5 said must stay
inline **no longer exist** — quick-597 dropped them. So the precondition is now exactly two policies
and there is no "must stay inline" residue.

**The rewrite changes the comparison from text-to-text to uuid-to-uuid**, and "is that a predicate
change?" is a question this plan answers with evidence, not assumption:

| GUC value | today (`::text = text`) | after (`uuid = current_tenant_id()`) | verdict |
|---|---|---|---|
| canonical lowercase uuid of the row's tenant | admits | admits | must be identical — this is the whole point |
| another tenant's uuid | filters | filters | must be identical |
| `''` (the pool default) | FALSE → filters | `NULLIF` → NULL → filters | same outcome, different truth value; under `WITH CHECK` both refuse |
| unset | NULL → filters | NULL → filters (or **TC001** with the flag on) | same with the flag off |
| **uppercase / non-canonical uuid** | **filters** (text mismatch) | **admits** (uuid equality) | a **widening** — small, arguably a fix, must be stated |
| **non-uuid garbage** | **FALSE → filters** | **`22P02` invalid input syntax for uuid** | a **behaviour change** — the same class quick-597 removed from `audit_log`. It puts `Tag` on the footing the other 91 policies already have, but it must be named, not discovered |

---

<tasks>

<task type="auto">
  <name>Task 1: Re-confirm the baseline, derive the delta, and MEASURE the three things the design assumed</name>

  <files>
apps/web/scripts/audit/602-tripwire-verify.ts
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/01-baseline.md
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/01-baseline.json
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/02-mechanism.md
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/02-mechanism.json
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/03-tag-equivalence.md
  </files>

  <action>
Create `apps/web/scripts/audit/602-tripwire-verify.ts`, modelled on `601-provisioning-verify.ts` —
**read that file's header first and carry its conventions across verbatim**:

- **It MUST NOT import `scripts/_bootstrap-env`.** That file runs
  `process.env.DATABASE_URL = process.env.DIRECT_URL` unconditionally and every env file points
  `DIRECT_URL` at PRODUCTION. Load `apps/web/.env.staging` explicitly with `dotenv`.
- Refuse (exit 1) if any resolved URL contains `oqdhberkghtnszrkdvfm` or does not contain
  `wyixpgunnjmzguhggocz`. Never print a connection string.
- Repoint the app_user URL from `:6543/` to `:5432/` and strip `?pgbouncer=true`.
- The five ground rules: nothing swallowed (record `{code, message}` with the SQLSTATE); direct SQL
  probes inside `BEGIN … ROLLBACK` fenced per-probe with a `SAVEPOINT`; both directions always;
  loud failure on a failed restore; it is a REPORT — only a connect, fixture or restore failure
  exits non-zero.
- `--baseline | --mechanism | --tag-equivalence | --after | --teardown` phases, each writing
  `evidence/<name>.json` and `evidence/<name>.md`. This task builds the first three.

**1a. `--baseline` — against BOTH databases, read-only (`BEGIN READ ONLY … ROLLBACK`).**
Re-confirm every row of the Given-facts table above: the 183 count, the newest `_prisma_migrations`
row, the four-way classification (classify each of the 183 by whether its `USING`/`WITH CHECK` text
contains `current_tenant_id(`, contains `current_setting('app.current_tenant_id'`, is the
`app.bypass_rls` shape, or none of those), `current_tenant_id()`'s body and `prosecdef`/`provolatile`
from `pg_proc`, the three roles' `rolbypassrls`, `pg_db_role_setting`'s current contents, and
`Tag`/`TagAssignment` row counts. Emit the two inline bodies verbatim from `pg_get_expr`. **Print the
set difference between the two databases in both directions** and fail loudly if it is non-empty. Any
disagreement with the Given-facts table is a finding to report, not a number to quietly adopt.

Then derive the 87→91 delta **from the SQL of `20260913120000`, `20260914120000` and
`20260914160000`** — read those three `migration.sql` files, attribute each `CREATE POLICY` /
`DROP POLICY` / body rewrite to a bucket move, and check the arithmetic against the table in this
plan. Record it in `evidence/01-baseline.md` as a per-policy list, not a subtraction.

**1b. `--mechanism` — the three measurements, as `app_user` on staging.**

These need **committed** objects, because DDL inside a rolled-back transaction as `postgres` is
invisible to a separate `app_user` session. So: create throwaway probe objects, measure, drop them
in a `finally`, and assert the drop landed by re-reading `pg_class`/`pg_proc`. Nothing touches a real
table's policies in this phase.

```
public.tripwire_probe_602            -- table: id uuid pk, "tenantId" uuid not null, FORCE RLS,
                                     --        GRANT SELECT,INSERT,UPDATE,DELETE TO app_user
public.probe_current_tenant_id()     -- the PROPOSED sql body, verbatim
public.probe_tenant_context_required(text)  -- the PROPOSED plpgsql raiser
```

Seed two rows on the probe table under two synthetic tenant uuids (as `postgres`, which bypasses
RLS), then measure as `app_user`:

1. **COALESCE short-circuit — the fast path must NOT raise.** With
   `app.tenant_context_tripwire = 'on'` and `app.current_tenant_id` = a real uuid:
   `SELECT public.probe_current_tenant_id()` must return that uuid, and
   `SELECT count(*) FROM public.tripwire_probe_602` (under a `tenant_isolation_policy`-shaped probe
   policy calling `probe_current_tenant_id()`) must return the correct row count with **no error**.
   Repeat with the GUC unset and with `''` — both must raise `TC001`. Also capture
   `EXPLAIN (VERBOSE) SELECT …` so the inlined expression is in the evidence.
   **If the fast path raises, that is the fallback trigger**: rewrite `current_tenant_id()` as
   plpgsql with an explicit `IF`, re-measure, and record the measured reason and the cost (loss of
   inlining on 91 policies). Do not proceed to Task 2 on a design that was not measured.
2. **The bypass OR.** Add a second, permissive, `bypass_rls_policy`-shaped policy to the probe table
   (`USING (current_setting('app.bypass_rls', true) = 'on')`). As `app_user` with
   `app.bypass_rls = 'on'`, `app.current_tenant_id` unset and the tripwire on, run a SELECT, an
   UPDATE and a DELETE. Record whether each raises `TC001` or returns rows. **Run it both ways
   round** — create the two policies in each order on two separate probe tables — because a single
   ordering is a sample of one. Capture `EXPLAIN` for each.
3. **The `TC001` payload.** Confirm the raise carries the SQLSTATE the client sees as `code`, that
   `DETAIL` contains the statement text from `current_query()`, and that UNSET and `''` produce
   different MESSAGEs. Quote all three verbatim.

Write the decision into `evidence/02-mechanism.md` under a heading **DECISIONS**, each with the
measurement that produced it:
- `current_tenant_id()` stays `LANGUAGE sql` / becomes plpgsql — and why;
- bypass-flagged statements are exempted / are not — and, if exempted, the cost sentence naming
  ~211 sites and the Phase 0 bypass programme as the mechanism that already enumerates them.

**1c. `--tag-equivalence` — the predicate question, with fixtures.**
`Tag` and `TagAssignment` are empty on staging, so a measurement without fixtures is the
"all assertions passed, nothing was tested" shape. Create a disposable tenant pair (marker prefix
`RLS602`: two `Tenant` rows, a `Tag` each, a `TagAssignment` each), as `postgres`.

Then, for `Tag` and `TagAssignment`, as `app_user`, produce a row-count matrix over six GUC values —
tenant A, tenant B, `''`, unset, the uppercase form of tenant A's uuid, and `'not-a-uuid'` — for:
  (i) **today's live policy** (text-to-text), measured before any change;
  (ii) **the proposed body**, measured by the 601 `phaseBefore` pattern — capture the current body
  from `pg_get_expr`, `DROP`/`CREATE` the policy under the **same name** with the new body, measure,
  then restore the captured body in a `finally` and **assert byte-equality of the restored body**.

Include an INSERT probe in each direction (own tenant admitted, foreign tenant refused) because a
`FOR ALL` policy with no declared `WITH CHECK` derives the write check from `USING`, so the rewrite
moves the write door too. Record `22P02` and every other SQLSTATE verbatim rather than as "error".

`--teardown` deletes the `RLS602` fixtures children-before-parent (`TagAssignment` → `Tag` →
`Tenant`; inbound FKs are RESTRICT) and asserts **zero** leftovers, exiting 1 if any survive. Leave
the fixtures in place at the end of this task — Tasks 3 and 4 reuse them — but prove `--teardown`
works now, then re-seed.

Commit the script and the evidence files.
  </action>

  <verify>
- `npx tsx scripts/audit/602-tripwire-verify.ts` with no flag REFUSES; with a production ref
  substituted into the env it REFUSES — demonstrate both and quote the refusal.
- `evidence/01-baseline.md` shows 183 on both databases, the four-way classification summing to 183,
  an empty set difference, the two inline bodies quoted, `pg_db_role_setting` recorded, and a
  per-policy delta table attributing every move to one of the three migrations.
- `evidence/02-mechanism.md` contains: the fast-path probe returning a uuid with the flag ON (no
  error), the unset and `''` probes raising `TC001` with the three payload fields quoted, the bypass
  OR result for SELECT/UPDATE/DELETE in **both** policy-creation orders with `EXPLAIN` output, and a
  DECISIONS section with one measurement cited per decision.
- `evidence/03-tag-equivalence.md` contains the full 2 tables × 6 GUC values × (before, after) matrix
  plus the INSERT probes, and the restored-body byte-equality assertion.
- The probe objects are gone: `SELECT count(*) FROM pg_class WHERE relname LIKE 'tripwire_probe_602%'`
  = 0 and the two probe functions are absent from `pg_proc`.
- `--teardown` demonstrated to report 0 leftovers, then fixtures re-seeded and counted.
- Production policy count re-read = 183 and its `current_tenant_id()` body unchanged.
  </verify>

  <done>
The baseline is re-confirmed on both databases with any disagreement reported; the 87→91 delta is
derived per policy from migration SQL; the COALESCE short-circuit, the bypass OR and the `TC001`
payload are all MEASURED with the evidence quoted; the `Tag` predicate-equivalence matrix exists over
seeded fixtures; both design decisions are recorded with their measurements; teardown is proven;
production is unwritten.
  </done>
</task>

<task type="auto">
  <name>Task 2: The migration — tripwire branch, TC001 helper, the two policy rewrites — applied to staging with the ledger row read back</name>

  <files>
apps/web/prisma/migrations/20260914180000_tenant_context_tripwire/migration.sql
apps/web/scripts/audit/rls-policy-canonical.json
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/04-ledger-readback.txt
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/05-drift-after.txt
  </files>

  <action>
Write `apps/web/prisma/migrations/20260914180000_tenant_context_tripwire/migration.sql` in the house
style of `20260914160000_provisioning_under_app_user/migration.sql`: §-numbered prose explaining
**why**, the before/after of every object, what it deliberately does not ship, and a commented
rollback block that is NOT executed.

Contents, in this order:

1. **`public.tenant_context_required(p_raw text) RETURNS uuid`**, `LANGUAGE plpgsql`, `STABLE`,
   `SECURITY INVOKER`, `SET search_path = public, pg_catalog`, raising `TC001` with the MESSAGE /
   DETAIL / HINT designed above. Then `REVOKE ALL … FROM PUBLIC`, `REVOKE ALL … FROM anon,
   authenticated, service_role`, `GRANT EXECUTE … TO app_user`.
2. **`CREATE OR REPLACE FUNCTION public.current_tenant_id()`** in whichever form Task 1's DECISIONS
   chose, with the bypass exemption included **only if** Task 1 decided to take it. Do not change its
   name, signature, return type or `prosecdef`. Check `pg_proc.proacl` before and after and re-`GRANT
   EXECUTE … TO app_user` if `CREATE OR REPLACE` did not preserve it; record both readings.
3. **`DROP POLICY tenant_isolation_policy ON "Tag"` + `CREATE POLICY` under the SAME NAME** with
   `USING ("tenantId" = current_tenant_id())`, and the same for `"TagAssignment"`. Keep them `FOR
   ALL`, `PERMISSIVE`, `TO PUBLIC`, and keep `WITH CHECK` **undeclared** so it stays derived — that
   preserves the existing shape rather than introducing a second change. **The names are deliberately
   unchanged**: `rls-policy-canonical.json` and the replay drift detector both find policies BY NAME,
   so a rename would make them vanish from the enumeration rather than show up as changed (quick-599's
   rule).
4. A §-section stating, in the migration itself: **the flag is set nowhere by this migration**, so
   when `scripts/migrate.mjs` applies it to production on the next deploy it is a behavioural no-op
   for the 91+2 policies; the only production-visible change is the `Tag`/`TagAssignment` predicate,
   with Task 1's measured matrix summarised and the two edge cases (non-canonical uuid widens,
   non-uuid garbage now `22P02`) named.
5. The commented rollback: restore the old `current_tenant_id()` body, drop
   `tenant_context_required`, restore both inline policy bodies verbatim.

**Do NOT put `ALTER ROLE app_user SET app.tenant_context_tripwire = 'on'` in the migration.** It
would flip production on the next deploy. The `ALTER ROLE` is a documented manual lever, exercised
and then reset in Task 3.

**Apply to staging only.** Use the Supabase MCP against the staging project, or `psql`/`pg` on
`STAGING_DIRECT_URL`. Then, **DEC-17**:

- `apply_migration` does **not** write the `_prisma_migrations` row — it writes Supabase's own,
  different ledger. Write the resolved-not-run row **by hand** with `migration_name =
  '20260914180000_tenant_context_tripwire'`, `applied_steps_count = 0`, `logs = ''`,
  `started_at = finished_at`, and `checksum` = a real SHA-256 of `migration.sql` over **LF** bytes
  (the working tree is CRLF — normalise before hashing).
- **Read it back**, and before treating any empty result as absence, confirm a **known-good sentinel
  row** is visible (`_prisma_migrations` is RLS-enabled with zero policies and no `app_user` grant, so
  a non-owner read returns zero rows with no error — indistinguishable from "never written", which
  would prompt a duplicate write). Save both reads to `evidence/04-ledger-readback.txt`.

**Regenerate the canonical artefact — mandatory, not optional.** Two policy bodies changed, so
`corpusHash` moves:

```
cd apps/web && npm run audit:rls-canonicalise
```

It loads `.env.staging` itself and never imports `_bootstrap-env`. Confirm the artefact's
`Tag.tenant_isolation_policy` and `TagAssignment.tenant_isolation_policy` entries now read
`("tenantId" = current_tenant_id())`, `definitionCount` is still 183, and `notCanonicalised` is
empty. **Do not modify** `rls-policy-replay.ts`'s `POLICY_STATEMENT_RE` or `INTEGRITY_FLOORS`, or
`rls-policy-definitions.ts`'s `DEFINITION_FLOORS` — every floor is a lower bound and this migration
raises no count below one.

Then run the body-level drift detector with both variables pinned to staging (this script DOES
import `_bootstrap-env`, so pinning is required):

```
DIRECT_URL="<staging>" DATABASE_URL="<staging>" npm run audit:rls-policy-drift
```

It must end `RESULT: CLEAN` with **0 missing / 0 unexpected / 0 definition drift / 0
not-canonicalised**. Save to `evidence/05-drift-after.txt`. Exit 3 (`DEFINITION LAYER DID NOT RUN`)
means the artefact was not regenerated — fix that, do not interpret it as clean.

Commit the migration, the regenerated artefact and both evidence files.
  </action>

  <verify>
- The staging policy count is **183** after the migration (2 dropped, 2 created, same names) and the
  `bypass_rls_policy` set is unchanged — compared as a **sorted table list**, not as a count.
- `pg_get_expr` on both rewritten policies reads `("tenantId" = current_tenant_id())`, quoted
  before/after in the evidence.
- `pg_proc` shows `current_tenant_id()` with the new body and `tenant_context_required(text)` present;
  `has_function_privilege('app_user', 'public.tenant_context_required(text)', 'EXECUTE')` = true and
  the same for `anon`, `authenticated`, `service_role` = **false**, each quoted per role.
- `evidence/04-ledger-readback.txt` shows a visible sentinel row AND the new row with
  `applied_steps_count = 0` and a real SHA-256 (not `'manual'`).
- `evidence/05-drift-after.txt` ends `RESULT: CLEAN (exit 0)`.
- `rls-policy-canonical.json` is modified, `definitionCount` = 183, `notCanonicalised` = `[]`.
- Production re-read: still 183 policies, still the old `current_tenant_id()` body, ledger head still
  `20260914170000_activation_progress_congrats_shown_at`.
  </verify>

  <done>
One migration exists and is applied to staging and staging only; the helper carries TC001 and the
right ACL; both `Tag` policies route through the function under their original names; the ledger row
is hand-written and read back behind a sentinel; the canonical artefact is regenerated and the
body-level drift detector reports zero; production is unchanged and re-verified.
  </done>
</task>

<task type="auto">
  <name>Task 3: Prove the tripwire in SQL, both directions, and prove the flag-off path is byte-identical</name>

  <files>
apps/web/scripts/audit/602-tripwire-verify.ts
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/06-tripwire-matrix.md
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/06-tripwire-matrix.json
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/07-isolation-suite.txt
  </files>

  <action>
This task proves the **mechanism** at SQL level. Task 4 proves it on **real executions**. Both are
needed: a mechanism proof over hand-written statements would be exactly what
`601-provisioning-verify.ts`'s header rejects as sufficient on its own, and an execution sweep with
no mechanism baseline cannot tell a path that is correctly scoped from a mechanism that never fires.

Add the `--after` phase to `602-tripwire-verify.ts`, reusing the `RLS602` fixtures, as `app_user`
against the migrated staging database. **The tripwire is turned on with a session-level `SET`, not
`ALTER ROLE`**, so the flag-off half of the matrix is measurable in the same run and the rest of
staging is unaffected while this runs.

**Direction A — the tripwire fires, loudly and by name.** With `app.tenant_context_tripwire = 'on'`
and no tenant GUC (and separately with `''`), run a representative statement against each of at least
five distinct policy shapes from the sweep's §1 — S2 (`"tenantId"`), S10 (`org_id`), S12
(`tenant_id`), S17 (the `EXISTS` join on `stops`), and one of the two newly-routed `Tag` policies.
Each must raise `TC001`; record the SQLSTATE, the MESSAGE (UNSET vs EMPTY STRING), and the DETAIL
with the statement text, verbatim. **Include at least one write** (INSERT and UPDATE) as well as
reads, because `WITH CHECK` is a separate evaluation site.

**Direction B — a scoped statement is untouched.** The same five statements with
`app.current_tenant_id` set to fixture tenant A must return the same row counts as with the tripwire
off. Without this, direction A proves only that something raises.

**Direction C — the flag OFF is today's behaviour, byte-identical.** Every statement in A and B, with
the tripwire unset and with it explicitly `'off'`: no raise, and row counts equal to the
pre-migration counts recorded in Task 1. Any difference is a finding, not a rounding.

**Direction D — the bypass interaction, on real policies.** Re-run the Task-1 bypass measurement
against two or three real bypass-carrying tables (`app.bypass_rls = 'on'`, no tenant GUC, tripwire
on). The result must match the decision in `evidence/02-mechanism.md`. If it does not, that
contradiction is the finding and the decision is revised with the new measurement — do not reconcile
it in prose.

**The `ALTER ROLE` lever, exercised once and reset.** Run
`ALTER ROLE app_user SET app.tenant_context_tripwire = 'on'`, open a **new** connection, confirm
`current_setting` reads `'on'` with no session `SET`, then
`ALTER ROLE app_user RESET app.tenant_context_tripwire` and confirm a fresh connection reads the
default. Assert `pg_db_role_setting` matches Task 1's reading exactly. Staging must be left
**flag-off** so Task 4 controls the flag itself and the next task inherits a clean database.

**Regression gate.** Capture the pre-migration `npm run test:rls-isolation` count FIRST — from the
same command with the same reporter, in this task, before anything else — then re-run it with the
flag off after the migration. Both outputs go to `evidence/07-isolation-suite.txt`. A run whose
output has no `Test Files … | Tests …` summary line is not a run. Do not trust a previous summary's
arithmetic for the baseline (quick-561/565/567).
  </action>

  <verify>
- `evidence/06-tripwire-matrix.md` contains, for ≥5 named policy shapes × {read, insert, update} ×
  {unset, `''`, tenant A} × {flag on, flag off}, a row per probe with either a row count or a quoted
  `{code, message}`; every flag-on/no-GUC row is `TC001`; every flag-on/tenant-A row equals its
  flag-off twin; every flag-off row equals the Task-1 baseline count.
- At least one `TC001` DETAIL is quoted in full and visibly contains the statement text.
- The UNSET and EMPTY-STRING messages are quoted side by side and differ.
- Direction D's result is stated and either confirms or overturns `02-mechanism.md`'s decision, with
  the overturning measurement quoted if it overturns.
- `pg_db_role_setting` for `app_user` is byte-identical to Task 1's reading; a fresh connection reads
  the tripwire default.
- `evidence/07-isolation-suite.txt` holds both runs with their summary lines, and the post-migration
  count equals the pre-migration count.
  </verify>

  <done>
The tripwire is proven to raise TC001 on an unscoped statement across five policy shapes including
writes, proven not to fire on a scoped statement, proven byte-identical to today with the flag off,
and its bypass interaction matches the recorded decision; the `ALTER ROLE` lever is demonstrated and
reset; the isolation suite is green against a baseline this task measured; staging is left flag-off.
  </done>
</task>

<task type="auto">
  <name>Task 4: STEP 4 — run the application against staging as app_user with the tripwire on, and report every path BY NAME</name>

  <files>
apps/web/scripts/audit/602-execution-sweep.ts
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/10-execution-sweep.md
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/10-execution-sweep.json
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/11-execution-http.md
  </files>

  <action>
**This is the measurement the whole task exists to make.** `wrapper-migration-scope.md` counted call
sites; nothing has ever counted **executions**. The static countdown in Task 5 is a different
instrument and cannot discharge this step.

Create `apps/web/scripts/audit/602-execution-sweep.ts`, carrying every convention from
`601-provisioning-verify.ts` — and in particular the one its header argues for at length:

> `--after` imports `provisionTenant`, `confirmTenantEmail`, `hydrateTenant` and `getOnboardingFlags`
> and calls them, with the module-scope Prisma pool pointed at staging as `app_user`. Replaying the
> statements by hand would prove the policy set admits a sequence I typed out; it would not prove it
> admits the sequence Prisma actually emits.

That reasoning transfers unchanged. **`process.env.DATABASE_URL` is assigned the staging `app_user`
URL (repointed 6543 → 5432) BEFORE any dynamic import**, because `lib/db/prisma.ts` builds its
`pg.Pool` at module scope. The script never imports `scripts/_bootstrap-env` and refuses on the
production ref.

### 4a. Safety rails — assert these before invoking anything, and record the assertions

1. **Database identity.** After the first import, run `SELECT current_user, current_database(),
   (SELECT rolbypassrls FROM pg_roles WHERE rolname = current_user)` through the app's own `prisma`
   client and require `app_user` / `rolbypassrls = false`. Abort otherwise. This is the same
   connection assertion 601 makes and it is what proves the sweep measured the role it claims.
2. **No live outbound email or push.** Several cron routes send. Explicitly delete or neutralise
   `RESEND_API_KEY`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` and any SMTP/Expo push variable in
   `process.env` before importing, and **assert they are absent**, recording the assertion. Staging
   also carries no real users, and the `RLS602` fixtures use `@example.test` addresses (601
   precedent) — but the env assertion is the control, not the emptiness.
3. **Write surface.** Some cron routes write (`purge-deleted` deletes, `mark-overdue-invoices`
   updates). Snapshot row counts for every table they touch before and after the sweep, report any
   change, and tear down anything the sweep created. A non-zero change on a table the sweep did not
   intend to touch is a finding.
4. **`CRON_SECRET` is not in any env file** — `verifyCronSecret` therefore returns false and every
   cron route would 401, which would look like a clean sweep and measure nothing. Mint one with
   `randomUUID()` into `process.env.CRON_SECRET` before importing and send the matching
   `Authorization: Bearer …` header. **A 401 from any cron route is a harness failure, not a
   result** — assert the response status is not 401 and fail the run if it is.

### 4b. The outcome vocabulary — four categories, never merged

| verdict | meaning |
|---|---|
| `RAISED_TC001` | the entry point (or something it awaited) raised SQLSTATE `TC001` — **the positive signal** |
| `COMPLETED` | ran to completion with no `TC001`, plus a **`dbTouched: true/false`** flag |
| `OTHER_FAILURE` | threw for an unrelated reason — no session, `headers()` outside a request scope, a missing fixture, a different SQLSTATE. Recorded with `{code, message}` and **counted as evidence about nothing** |
| `NOT_INVOKED` | listed by name with the reason. **Never folded in with the passes** — that conflation is the quick-565 vacuous-green shape |

Detect `TC001` by **`code === 'TC001'` on the error object**, never by message prose, and unwrap
nested causes (Prisma wraps driver errors) — walk `error.cause` and any `meta` to find the SQLSTATE.
`instanceof` is not usable across two copies of a library in a monorepo (quick-546's rule).

**`dbTouched` is load-bearing.** `cleanup-quarantine` talks only to S3; a `COMPLETED` for it means
nothing about tenant context. Instrument the app's own pool — `lib/db/prisma.ts` stores it on
`globalThis` (`globalForPrisma.pool`), so the sweep can wrap `pool.connect` and count queries per
entry point, restoring the original afterwards. If that wrapper proves unworkable, fall back to a
**statically derived** flag (does the route import a DB module and issue a query) and **label it as
static in the evidence** — do not silently report a static inference as a measurement.

### 4c. Population 1 — all 14 `/api/cron/*` route handlers, in-process

These are the highest-value population in the app for this measurement: `guc-binding.md` recorded
them as silently swallowing failures, and they authenticate on `CRON_SECRET` rather than a user
session, so they are callable without a browser. Every one exports
`export async function GET(request: NextRequest)`.

Invoke each by dynamically importing the route module and calling `GET(new NextRequest(url, {headers:
{authorization: 'Bearer ' + secret}}))`. Enumerate the directory rather than hardcoding a list, so a
route added later cannot silently escape the sweep, and **assert the enumerated count is 14** —
a floor plus an equality, so both a missed route and a vanished one are visible.

Report each by name with its verdict **and its mechanism class**, which is the interesting cut:

| class | routes (verify by grep, do not trust this table) | expectation |
|---|---|---|
| uses `getTenantPrisma` / `getTenantPrismaForOrg` | `automations`, `trip-reminders`, `workflow-notifications`, + 1 | scoped — should NOT raise, or raises only outside the scoped section |
| sets `app.bypass_rls` | `carrier-auto-dispatch`, `carrier-compliance-alerts`, `digest-compliance-30day`, `digest-daily-driver`, `digest-weekly-owner`, `workflow-digest` | depends entirely on Task 1's bypass-OR decision — **this is where that decision's cost becomes visible on real paths** |
| uses `getAdminDb` | `auto-close-tickets`, `mark-overdue-invoices`, `send-reminders` | structurally exempt — `app_admin` carries `rolbypassrls`, so no policy is consulted. **Name this as its own category in the write-up**: quick-600 routing a path to the admin connection also removes it from the tripwire's reach |
| bare `prisma`, neither | `purge-deleted`, `cleanup-quarantine` | the cleanest expected `RAISED_TC001` — except `cleanup-quarantine`, which is S3-only and is why `dbTouched` exists |

Re-derive that classification by grep in the sweep itself and report any disagreement with this table
as a finding.

Note honestly in the evidence: `carrier-auto-dispatch` uses `after()`. Called outside the Next request
lifecycle, `after()` may throw or no-op, so whatever it defers is **not measured** — that route's
verdict covers its synchronous body only, and the deferred part goes in the NOT_INVOKED list by name.

### 4d. Population 2 — `lib/` and server entry points the fixtures make reachable

Breadth beats depth here. Prefer entry points that take an **explicit tenant/org id or no session**,
because those are callable in-process; a server action whose first line is `getSession()` will throw
from `headers()` outside a request scope and is an `OTHER_FAILURE`, not a result.

Cover **both shapes deliberately**:

- **Must NOT raise (the counter-assertion).** Functions that acquire a tenant client:
  `getOnboardingFlags(tenantId)`, `hydrateTenant(tenantId)`, `confirmTenantEmail(tenantId)` (601
  proved all three callable), and at least two more `getTenantPrismaForOrg` consumers found by grep.
  **Without these, the sweep proves only that something raises** — the same asymmetry direction B
  fixes in Task 3.
- **Expected to raise.** Bare-client paths with no GUC: pick from `lib/notifications/*`
  (`dispatchNotification` takes an explicit `tenantId` but uses the bare client — sweep §2 and
  Phase 10's note), `getCurrentUser()`, `lib/automations/evaluator.ts`, and any `$queryRaw` helper
  reachable without a session.
- **The login route.** `api/auth/login/route.ts` writes the GUC at `:74` and `:113`; it is a `POST`
  taking a constructed `Request` and reaching Supabase Auth. Attempt it against a fixture user; if
  Supabase Auth cannot be satisfied from this environment, that is an `OTHER_FAILURE` or a
  `NOT_INVOKED` with the reason — report it, do not omit it.

Every entry point considered goes in the output, including the ones not invoked.

### 4e. Population 3 — the same cron routes over real HTTP, if it can be made safe

An in-process call is **not** an HTTP request through middleware, and a route handler invoked
directly skips the Next request lifecycle (`after()`, `headers()`, `cookies()`). The HTTP pass is
what closes that gap, and it is bounded to the cron routes because they need no session.

Run `next dev` (or `next build && next start`) from a shell where `DATABASE_URL` **and** `DIRECT_URL`
are exported to the staging `app_user` string and `CRON_SECRET` is exported to the minted value —
Next does not override variables already present in the process environment, so `.env.local`'s
**production** `DATABASE_URL` loses. That precedence is the entire safety argument, so **verify it
rather than trusting it**, with this triple guard, all three recorded:

1. Before starting the server, print the resolved `DATABASE_URL` project ref in that shell and assert
   it is the staging ref.
2. After the server is up and **before any route is hit**, read `pg_stat_activity` on **production**
   and record the connection count; read it on staging and confirm a new `app_user` backend appeared.
   After the run, assert production's count did not rise. `/api/health` does no DB work, so it is not
   a usable identity probe — `pg_stat_activity` is.
3. The email/push env neutralisation from 4a applies to that shell too.

Then `fetch` each of the 14 cron routes with the bearer header and record the same four-way verdict
plus the HTTP status, and **diff the HTTP verdicts against the in-process verdicts**. A disagreement
is the most interesting result this task can produce — it means the request lifecycle changes the
answer — and it must be reported per route, not aggregated.

**If any of the three guards cannot be satisfied, do not run this population.** Report it as
`NOT_INVOKED` with the guard that failed, by name, in `evidence/11-execution-http.md`, and let the
in-process pass stand. That is the one sub-part of step 4 this environment may genuinely not permit;
naming it is required, silently dropping it is not.

### 4f. The evidence file

`evidence/10-execution-sweep.md` must carry, in this order:

1. The safety-rail assertions, quoted.
2. **A table of every entry point invoked**, by name (`file:export`), with verdict, mechanism class,
   `dbTouched`, and — for `RAISED_TC001` — the `TC001` MESSAGE and the `current_query()` DETAIL
   verbatim, because the DETAIL is what names the statement and is the deliverable's whole point.
3. **A separate table of every entry point NOT invoked**, by name, with the reason.
4. Counts per verdict, stated as counts **of what was invoked**, with the not-invoked total beside
   them so no reader can mistake one for the other.
5. **The honest limits, in their own section**: an in-process call is not an HTTP request through
   middleware; a route handler invoked directly skips the Next request lifecycle; `after()`-deferred
   work is not measured; a path that was never invoked is not a path that passed; and the sweep
   covers entry points reachable without a browser session, which is a minority of the 456 units.
  </action>

  <verify>
- `evidence/10-execution-sweep.md` names **all 14** cron routes individually with a verdict each, and
  the enumeration's count equality assertion is quoted.
- The four verdicts appear as four distinct categories; `NOT_INVOKED` has its own table and is not
  summed into the passes anywhere in the file.
- At least one `RAISED_TC001` row quotes a `current_query()` DETAIL that visibly names a real
  statement from a real application code path.
- At least two entry points that acquire a tenant client are reported `COMPLETED` with
  `dbTouched: true` — the counter-assertion. If none is, the sweep is reporting that the tripwire
  fires on everything, which is a finding to investigate before the write-up is believed.
- `dbTouched` is present on every `COMPLETED` row and its derivation (instrumented vs static) is
  labelled.
- The safety assertions are quoted: `app_user` / `rolbypassrls=false`, the absent email/push
  variables, the before/after row-count snapshot with any change explained, and no 401 from any cron
  route.
- `evidence/11-execution-http.md` either holds the HTTP pass with its triple guard recorded and a
  per-route in-process-vs-HTTP diff, or states which guard failed and why, by name.
- Staging is left with the tripwire flag off and zero sweep-created rows; `pg_db_role_setting`
  unchanged.
- Production `pg_stat_activity` shows no connection from this host during the run.
  </verify>

  <done>
Real application entry points were invoked against staging as `app_user` with the tripwire on; all 14
cron routes are reported individually by name with a mechanism class and a verdict; both shapes are
covered so the sweep can distinguish "fires on unscoped paths" from "fires on everything"; every
`TC001` is quoted with the statement its DETAIL names; everything not invoked is listed by name with
its reason and kept out of the pass counts; the HTTP pass either ran under its triple guard or is
reported unexecuted with the failing guard named.
  </done>
</task>

<task type="auto">
  <name>Task 5: The static countdown — a by-name artefact plus a gate proven red</name>

  <files>
apps/web/scripts/audit/wrapper-countdown.ts
apps/web/scripts/audit/wrapper-countdown.json
apps/web/tests/security/wrapper-migration-countdown.test.ts
apps/web/package.json
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/08-countdown-red.md
  </files>

  <action>
The runtime signal only fires on paths that get exercised — Task 4 measured exactly how many that is,
and the gap between that number and 456 is this task's justification. §5 is explicit that neither
instrument alone relaxes the cutover.

**How it recognises a migrated unit without `withTenantContext` existing.** The classifier is
**purely syntactic** — `ts.createSourceFile` per file, no `Program`, no type checker, so the
identifier need not resolve to anything. Definitions:

- A **unit** is the innermost function-like node (`FunctionDeclaration`, `FunctionExpression`,
  `ArrowFunction`, `MethodDeclaration`) containing a call to `getTenantPrisma` or
  `getTenantPrismaForOrg`.
- A unit is **unmigrated** when that acquisition has **no ancestor `CallExpression` whose callee text
  is `withTenantContext`** (bare or as the tail of a property access). A fully migrated unit has no
  acquisition at all and contributes zero; a transitional unit that has the wrapper but kept the
  inner acquisition also contributes zero, which is why the artefact records a **second** number.
- `withTenantContextCallSites` — the count of `withTenantContext(` call expressions in `src` — is the
  anti-vacuity counter: without it, "the countdown reached zero" and "somebody deleted the
  acquisitions" are indistinguishable. **Today it is 0**, and the gate asserts that too.

Build `apps/web/scripts/audit/wrapper-countdown.ts` as a module exporting **pure functions**
(`classifyFile(sourceText, fileName) → { unmigrated: UnitRef[], withTenantContextCalls: number }`)
plus a CLI that walks `apps/web/src` (excluding `src/generated` and
`lib/db/extensions/tenant-rls-bound.prototype.ts`, matching `wrapper-migration-scope.md`'s exclusions)
and writes `apps/web/scripts/audit/wrapper-countdown.json`:

```jsonc
{
  "generatedAt": "...",
  "totals": { "unmigratedUnits": N, "unmigratedCallSites": M, "withTenantContextCallSites": 0,
              "filesScanned": F, "filesWithUnmigratedUnits": 154 },
  "files": { "app/(owner)/settings/operations/actions.ts": { "units": 1, "callSites": 1,
              "names": ["saveOperationsSettings:39"] }, ... }
}
```

Every unmigrated unit is listed **BY NAME** (`function:line`, `(anonymous):line` where unnamed).
Register `"audit:wrapper-countdown": "tsx scripts/audit/wrapper-countdown.ts"` in
`apps/web/package.json`.

**Reconcile against `wrapper-migration-scope.md`** (456 units / 198 files / 449 `await` call sites)
and **state the difference and its cause** — the unit definitions differ — rather than silently
publishing a number that contradicts a committed audit.

**Cross-reference Task 4.** The artefact's per-file names and Task 4's invoked list are two views of
the same population: report how many of the units the countdown names were actually executed by the
sweep. That number is the honest measure of the runtime signal's reach and belongs in the write-up.

Build the gate at `apps/web/tests/security/wrapper-migration-countdown.test.ts`, following
`admin-connection-allowlist.test.ts`:

1. **CRLF normalisation** on every read (`core.autocrlf=true`, no `.gitattributes`; quick-546).
2. **Equality, both directions** between the artefact and what the classifier computes over the real
   tree now. A decrease failing is the point: it forces the number down in a reviewable diff, in the
   same commit as the work.
3. **`withTenantContextCallSites` equality** as the anti-vacuity counter.
4. **Synthetic snippets through the pure classifier** — a migrated shape
   (`withTenantContext(async (db) => { const p = await getTenantPrisma(); … })` → 0 unmigrated) and an
   unmigrated shape (a bare `await getTenantPrisma()` → 1 unmigrated, named). This is where
   "recognises a migrated unit" is asserted, and it works because the classifier never resolves the
   identifier.
5. **Anti-vacuity (quick-546)**: a floor on `filesScanned`; a "was it actually found" assertion; a
   per-entry `minBytes` floor **as a parameter, not a blanket constant** (quick-562: a legitimate
   one-line re-export `page.tsx` is under 300 bytes).
6. **Counter-assertion**: a file with zero acquisitions (e.g. `lib/db/admin-prisma.ts`) is confirmed
   READ and confirmed to yield zero unmigrated units.

**Prove it RED before accepting it green (quick-549).** Three deliberate breakages, each run, its
failure quoted into `evidence/08-countdown-red.md`, then reverted and re-confirmed green: (a)
decrement one file's count in the artefact; (b) add a temporary file under `src` with a bare
`await getTenantPrisma()`; (c) the synthetic migrated-shape assertion, proven to distinguish rather
than to return "unmigrated" for everything.

Measure the test's wall time. If the full-tree parse pushes it past ~20s, move the full walk into the
CLI and have the test compare the artefact against a cheaper independent recount plus the synthetic
snippets — **recorded as a measured decision with the timing**, not as a convenience.
  </action>

  <verify>
- `npm run audit:wrapper-countdown` writes the artefact listing every unmigrated unit by name; totals
  reconciled against 456 / 198 / 449 with every difference explained.
- `npx vitest run tests/security/wrapper-migration-countdown.test.ts` green; test count and wall time
  recorded.
- `evidence/08-countdown-red.md` contains three quoted RED runs, each followed by a quoted green run
  after revert.
- `git status` clean apart from intended files; the injected temporary file is deleted and no stray
  `__probe*` survives (quick-519).
- `withTenantContextCallSites` is 0 and `grep -rn "withTenantContext" apps/web/src` returns nothing
  outside the test's synthetic strings.
- The "how many countdown-named units did Task 4 actually execute" figure is computed and recorded.
  </verify>

  <done>
A committed artefact names every unmigrated unit; a CI gate asserts it in both directions with an
anti-vacuity counter, floors, CRLF normalisation and a counter-assertion; the classifier is proven to
recognise the migrated shape although `withTenantContext` does not exist; the overlap with Task 4's
executed set is measured; all three RED runs are quoted and reverted.
  </done>
</task>

<task type="auto">
  <name>Task 6: Write docs/audits/unmigrated-path-tripwire.md and correct the two predecessor audits in place</name>

  <files>
docs/audits/unmigrated-path-tripwire.md
docs/audits/wrapper-migration-scope.md
docs/audits/policy-satisfiability-sweep.md
  </files>

  <action>
Write `docs/audits/unmigrated-path-tripwire.md` in the house style of the directory: a dated header
naming the target and the scope, every number traceable to a **named** measurement (cite the evidence
file), quoted SQL, and a closing **"What this did not measure"** section.

It must contain, explicitly, all six deliverables the finishing check names:

1. **Step 1 counts against the audit's 87/92**, with the differences explained per policy and each
   move attributed to `20260913120000`, `20260914120000` or `20260914160000`. State today's
   91 / 2 / 86 / 4 = 183 and the post-migration 93 / 0 / 86 / 4 = 183.
2. **Before and after quoted for every rewritten policy** — both `Tag` and `TagAssignment`, from
   `pg_get_expr`, plus `current_tenant_id()`'s old and new bodies.
3. **Step 4 — PATHS BY NAME, from EXECUTION.** This section is built from
   `evidence/10-execution-sweep.md` and `11-execution-http.md`, not from the countdown. Reproduce the
   full per-entry-point table: name, mechanism class, verdict, `dbTouched`, and the quoted
   `current_query()` DETAIL for the raises. Keep the **NOT_INVOKED** list as its own subsection with
   reasons. State the count of paths that raised as a count **of executions**, and say in terms how
   it differs from the scope audit's call-site count. The static countdown is **step 5** and appears
   in its own section; the write-up must not let one read as the other.
4. **The body-level drift detector reports zero against staging** — quote the `RESULT: CLEAN` line
   and the four zeros.
5. **A plain statement of whether group A (336 units / 154 files) can now ship incrementally.**
   Answer it in one sentence and justify it from the measurements: the signal covers 93 of 183
   policies; an unmigrated statement raises `TC001` naming itself; Task 4 proved it fires on real
   executions and does not fire on scoped ones; the flag is off by default so the signal is a 500 you
   can see rather than one a customer sees; the countdown gives an exact remaining count per commit.
   Name the conditions that must hold for the answer to stay true.
6. **Separately — what the tripwire misses and what the countdown misses.** Two lists, not one
   paragraph:
   - **The tripwire misses**: the 86 bypass policies (and, if the exemption was taken, every
     bypass-flagged statement — ~211 sites, with the five bypass-carrying cron routes from Task 4 as
     the worked example); **every path routed to `getAdminDb`**, which bypasses RLS entirely and is
     therefore structurally invisible — name the three cron routes quick-600 moved there; the 4
     "neither" policies, three of which are dead on the Prisma path (sweep §3); the 8 RLS-off public
     tables; `_prisma_migrations`; `after()`-deferred work; and **every path nobody exercises** —
     quantified against Task 4's invoked/not-invoked split rather than asserted.
   - **The countdown misses**: everything §1b of `wrapper-migration-scope.md` found — a transaction
     reached through a call chain is invisible to a static scan; raw `$queryRaw`/`$executeRaw` sites
     that never call `getTenantPrisma` (350 occurrences / 134 files); dynamic dispatch and renamed
     imports; and the fact that a zero count means "no unwrapped acquisitions", not "the migration is
     correct".

Also record: the **flag-as-GUC reasoning** (the settings-table alternative's recursion, cost and
grant hazards); the **`TC001` by-code-not-by-prose** rule; the bypass decision with its cost; the
**production no-op on next deploy** statement; and the two `Tag` predicate edge cases.

Then correct the predecessors **in place** — the house convention, and the reason
`wrapper-migration-scope.md` §5's numbers went stale unnoticed:

- `wrapper-migration-scope.md` §5: replace the 87/86/5/5 table with the measured 91/86/2/4, strike
  the claim that the two `SysAdminInvoice*` deny policies must stay inline (**quick-597 dropped them;
  they no longer exist**), change step 1 of "How to run the partial migration" from three policies to
  the two this task rewrote, and add a pointer to `unmigrated-path-tripwire.md` as the built version
  of §5 — including the note that §5's step 3 ("point staging's `DATABASE_URL` at `app_user`") was
  discharged per-process by Task 4's sweep rather than by a standing configuration change. Use
  strike-through plus a dated correction line, never a silent overwrite.
- `policy-satisfiability-sweep.md`: correct **S5** (no longer an inline-GUC shape — `Tag`/
  `TagAssignment` now match S4's predicate with a derived `WITH CHECK`), update the §1 accounting
  line, and update the §2 GUC census row for `app.current_tenant_id` (91 → 93) plus add
  `app.tenant_context_tripwire` as a sixth GUC with its writers (the documented `ALTER ROLE`, the
  harnesses' session `SET`). Note that §2's "the only `ALTER ROLE … SET` in the repository sets a
  timeout" claim remains true — this task deliberately did **not** add one to a migration.
  </action>

  <verify>
- `docs/audits/unmigrated-path-tripwire.md` exists and contains all six numbered deliverables, each
  findable by heading; every count cites an evidence filename; every SQL body is quoted; a "What this
  did not measure" section closes it.
- Deliverable 3 is built from the execution evidence and names entry points; the countdown appears
  under a **separate** step-5 heading; the NOT_INVOKED subsection is present with reasons.
- The two "misses" lists are separate sections with separate headings, and the tripwire list names
  the `getAdminDb` exemption explicitly with its three cron routes.
- `grep -n "87" docs/audits/wrapper-migration-scope.md` shows the old figure only in a correction
  context, never as a live claim.
- `grep -n "SysAdminInvoice" docs/audits/wrapper-migration-scope.md` shows the corrected statement.
- `policy-satisfiability-sweep.md` §1's shape accounting still sums to 183 after the S5 correction,
  and §2's census row reads 93.
- `npm run check:docs` passes if it covers `docs/audits/` — check first, and say so if it does not
  rather than claiming a gate that did not run.
  </verify>

  <done>
The audit document exists with all six deliverables traceable to measurements, step 4 is presented as
an execution measurement naming paths and step 5 as a separate static instrument, the two blind-spot
lists are stated separately, and both predecessor audits are corrected in place with dated
corrections.
  </done>
</task>

<task type="auto">
  <name>Task 7: Close the gates — tsc with the blind-gate probe, the full suite either side, production untouched, and the summary</name>

  <files>
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/evidence/09-gates.md
.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/602-SUMMARY.md
.planning/STATE.md
CLAUDE.md
  </files>

  <action>
**1. `npx tsc --noEmit` in `apps/web`, and check it is not lying.** If the only reported errors are
syntax errors, or are all in files this task did not touch, the gate is **blind, not green**: delete
`apps/web/.next/dev/types/validator.ts` and `apps/web/tsconfig.tsbuildinfo` and re-run. **Always
probe** — inject `const x: number = 'y'` into a file this task actually edited, confirm tsc reports
THAT error, then delete the probe and confirm no `__probe*` file survives anywhere.

**2. The full vitest suite, before and after, with the SAME reporter.** Capture the "before" by
`git stash`-ing this task's work (or `git checkout <base> -- <touched files>` in the main tree —
**not** a `git worktree`, which does not carry the gitignored `apps/web/.env.local` and skews
DB-dependent tests by ~25 tests, quick-567). Stop `next dev` first. Read the `Test Files … | Tests …`
summary line: a run with no counts is not a run (`--reporter=basic` does not exist in vitest 4 and
exits 0 having executed zero tests). The delta must be exactly this task's new tests.

**3. Re-run the drift gate** against staging after everything is committed; still `RESULT: CLEAN`.

**4. Production untouched, re-verified at close** and quoted: policy count 183;
`Tag`/`TagAssignment` bodies still the inline text-to-text form; `current_tenant_id()` still the
one-line NULLIF body; `tenant_context_required` absent from `pg_proc`; ledger head still
`20260914170000_activation_progress_congrats_shown_at`; `pg_db_role_setting` unchanged; and — because
Task 4 ran an application against a database — `pg_stat_activity` showed no connection from this host
to production during the sweep.

**5. Staging left clean:** flag off (no tripwire entry in `pg_db_role_setting`), zero `RLS602`
fixtures, zero `tripwire_probe_602*` objects, zero rows created by the execution sweep,
`bypass_rls_policy` at 86 compared as a sorted table list.

**6. Write `602-SUMMARY.md`** using the GSD summary template: what was asked vs what came back, the
two measured decisions with their evidence, the delta explanation, the step-4 execution counts
alongside the not-invoked count, and what is deferred and named (the migration has not reached
production; no call site has been migrated; the countdown is a gate with a non-zero count by design).

**7. Update `.planning/STATE.md`** with the quick-602 row, and **append the durable rules to
`CLAUDE.md`** in the file's established voice, one bolded lead clause each, and only the ones this
task established by measurement:
- the tripwire mechanism, and that the flag is a GUC read at call time, never a settings table;
- `TC001` is recognised by CODE, never by message prose, and `current_query()` is how a policy names
  the statement it refused;
- whichever way the bypass-OR measurement came out, stated as the measured fact plus its cost;
- **that routing a path to `getAdminDb` removes it from the tripwire's reach** — a real interaction
  between quick-600 and this task that nothing else records;
- that a countdown without `withTenantContextCallSites` cannot tell "migrated" from "deleted";
- the `Tag`/`TagAssignment` text-to-uuid edge cases.

Do **not** push. Commit only (the orchestrator pushes once at the end).
  </action>

  <verify>
- `evidence/09-gates.md` contains the tsc run, the injected probe error quoted, the probe removal
  confirmed, and a `find` showing no `__probe*` file remains.
- Before/after vitest summary lines quoted, same reporter, delta equal to the tests added.
- The final drift run's `RESULT: CLEAN` line is quoted.
- The production read-back is quoted field by field and shows zero change, including the
  `pg_stat_activity` check covering Task 4.
- The staging read-back shows flag off, zero fixtures, zero probe objects, zero sweep rows, 86 bypass
  policies as a sorted list.
- `602-SUMMARY.md` and the `.planning/STATE.md` row exist; `CLAUDE.md` gained only measured rules.
  </verify>

  <done>
tsc is green and proven not blind; the full suite's before and after are measured with the same
reporter and the delta explained; the drift gate is CLEAN; production is verified unwritten field by
field including during the execution sweep; staging is left flag-off and fixture-free; the summary,
STATE.md and CLAUDE.md are updated and everything is committed without a push.
  </done>
</task>

</tasks>

<verification>
1. **Nothing was installed.** `git diff` on the three `package.json`/lockfile shows only the new
   `scripts` entries — no dependency change.
2. **No call site was migrated.** `withTenantContext` still does not exist in `apps/web/src`.
3. **No policy predicate's meaning changed** beyond the measured `Tag`/`TagAssignment` edge cases,
   quoted with their before/after row counts.
4. **Production was never written**, and no process connected to it during the execution sweep —
   both re-read and quoted at close.
5. **Step 4 is an execution measurement**, reports by name, and keeps `NOT_INVOKED` separate from
   every pass count.
6. **Every guard added was proven RED first**, with the failure output quoted and the revert
   confirmed green.
7. **Every source-scanning guard** normalises CRLF, asserts it actually found what it sliced, and
   carries a length floor scoped to the files it makes claims about.
</verification>

<success_criteria>
- 183 policies on both databases confirmed; the four-way classification and the 87→91 delta derived
  per policy from the three intervening migrations' SQL.
- The COALESCE short-circuit, the bypass-OR interaction and the `TC001` payload are each measured on
  staging and quoted; both design decisions recorded with the measurement that produced them.
- One migration ships `tenant_context_required()` (TC001, granted to `app_user` only), the tripwire
  branch in `current_tenant_id()`, and the two `Tag`/`TagAssignment` rewrites under their original
  names; applied to staging; ledger row hand-written with `applied_steps_count = 0` and a real
  SHA-256, read back behind a visible sentinel.
- `rls-policy-canonical.json` regenerated; `npm run audit:rls-policy-drift` prints `RESULT: CLEAN`
  with four zeros against staging.
- The tripwire raises `TC001` naming the statement across ≥5 policy shapes including writes, does not
  fire on a scoped statement, and is byte-identical to today with the flag off; the `ALTER ROLE`
  lever demonstrated and reset; `npm run test:rls-isolation` green against a baseline measured here.
- **Step 4 executed**: all 14 cron routes plus `lib/` entry points of both shapes invoked in-process
  against staging as `app_user` with the tripwire on; every one reported by name with one of four
  verdicts; `NOT_INVOKED` kept separate; at least one raise quoted with its `current_query()` DETAIL;
  at least two scoped entry points completing with `dbTouched: true` as the counter-assertion; the
  HTTP pass either run under its triple guard or reported unexecuted with the failing guard named.
- `wrapper-countdown.json` lists every unmigrated unit by name; its gate proven red three ways with
  an anti-vacuity counter, floors and a counter-assertion; the overlap with Task 4's executed set
  measured.
- `docs/audits/unmigrated-path-tripwire.md` carries all six named deliverables — step 4 built from
  execution evidence, step 5 as a separate instrument, a plain answer on group A, and two separate
  "what this misses" lists including the `getAdminDb` exemption; both predecessor audits corrected in
  place.
- tsc 0 errors with the blind-gate probe performed and removed; vitest before/after measured with the
  same reporter; staging left flag-off and fixture-free; production unwritten.
</success_criteria>

<output>
After completion, create
`.planning/quick/602-build-the-unmigrated-path-tripwire-so-th/602-SUMMARY.md`.
</output>
</content>
