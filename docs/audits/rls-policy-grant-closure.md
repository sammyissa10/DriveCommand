# RLS policy, grant and default-privilege closure — quick-595

**Date:** 2026-09-12
**Migration:** `apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/migration.sql`
**Applied to:** STAGING only — `drivecommand-staging` (`wyixpgunnjmzguhggocz`, us-west-1)
**Applied by:** `apps/web/scripts/migrate.mjs` — the only permitted applier
**Production (`oqdhberkghtnszrkdvfm`):** **NEVER WRITTEN.** The production project ref was never
placed in this session's environment; the guard proof used the sentinel `zzzzzzzzzzzzzzzzzzzz`.

---

## 0. Branch decision — BRANCH A, the tripwire FIRED

`docs/audits/bypass-call-classification.md` classified all **211 executable `app.bypass_rls` call
sites across 103 files** (the two extra grep matches — `lib/auth/mobile-auth.ts:24` and
`lib/security/audit-log.ts:13` — are prose inside comments, not calls):

| Verdict | Sites | Files |
|---|---|---|
| DECORATIVE | 161 | 84 |
| **CROSS_TENANT** | **50** | **26** |
| UNKNOWN | 0 | 0 |
| **Total executable** | **211** | **103** |

The tripwire is "more than 20 CROSS_TENANT". **50 > 20 — it fired.** Branch A was executed:

- `bypass_rls_policy` was **NOT** dropped. All **86** live instances remain.
- **No application code was moved to a privileged connection.** Not one file, not one site.
- **None of the 211 `app.bypass_rls` calls were deleted.**
- The prepared, **unapplied** drop is staged at
  `apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/deferred-bypass-drop.sql`
  — 86 explicit `DROP POLICY IF EXISTS bypass_rls_policy ON <table>;` statements, generated from
  live staging `pg_policies`, every one at column 0 in plain static SQL.

**Neither `migrate.mjs` nor the drift detector can read that file.** `migrate.mjs` filters
migration directories on `existsSync(dir/migration.sql)`; the detector `statSync`s the same path.
A sibling file is inert to both, which is exactly why it is safe to stage there.

---

## 1. Deviation from the brief — `stops` is scoped via `dispatch_id`, not `load_id`

The brief said to scope `stops` via `load_id`. That is wrong. Measured:

```
stops total ....................................................  791
stops with load_id NULL ........................................   74   (9.4%)
stops with dispatch_id NULL ....................................    0
stops where load.org_id IS DISTINCT FROM dispatch.org_id .......    0
```

A policy routed through `load_id` alone **denies 74 rows to every tenant** — every fuel stop,
every layover, and every Phase 7 end stop, which is precisely the row that exists to stop a trip
looking like it finishes at the last delivery.

The shipped policy routes through `dispatch_id -> dispatches.org_id`: NOT NULL, 100% coverage,
and provably never in disagreement with the load path (0 divergent rows).

**An `OR` of both paths was rejected, not overlooked.** If the two ever diverge, `OR` exposes one
stop to **both** tenants — it turns a coverage fix into an isolation hole. One row visible to a
competitor is worse than 74 rows visible to nobody, and `dispatch_id` gives us neither.

`dispatches` is the `@@map` of the `Trip` model.

---

## 2. Pre-state (staging, before the apply)

```
PRE | app_user | rolcanlogin=false rolbypassrls=false rolconfig=(none)
PRE | pg_default_acl app_user entries in public: 0
PRE | FORCE RLS + zero policies: carrier_documents, route_template_stops, stops
PRE | zero app_user grants: NotificationEmailConfig, NotificationTemplate, Plan, Promo,
                            _prisma_migrations, carrier_catalog_meta, grid_view,
                            policy_drop_audit, route_matrix_cache
PRE | total policies in public: 179
PRE | bypass_rls_policy instances: 86
```

Pre-baseline from the drift detector (recorded against production before planning, raw):

```
Migration files read 149 | Statements parsed 403 | Policies expected (net) 179
Policies live 179 | Missing 0 | Unexpected 0 | RESULT: CLEAN (exit 0)
FORCE RLS + zero policies      : carrier_documents, route_template_stops, stops
RLS enabled not forced + zero  : _prisma_migrations
```

**One table in the zero-grant list was not in the plan's nine:** `policy_drop_audit`. It is the
quick-584 DDL-forensics sink (`dropped_at` / `object_type` / `object_name` / `statement` /
`current_role_name` / `session_role_name` / `application_name` / `client_addr`), written by an
event trigger running as the DDL-issuing role. It is not tenant-scoped, the application neither
reads nor writes it, and it is **deliberately left ungranted** alongside `_prisma_migrations`.
The plan's list had `grid_preference` in the ninth slot; that table is absent on staging, so the
count happened to match while the membership did not.

---

## 3. Pre-check — `"User".id` is `uuid`

Confirmed against `information_schema` on staging before the SQL was written, so
`u.id = carrier_documents.uploaded_by` needs no cast:

```
'User'                | 'id'                | 'uuid'
'User'                | 'tenantId'          | 'uuid'
'carrier_documents'   | 'uploaded_by'       | 'uuid'
'grid_view'           | 'gridId'            | 'character varying'
'grid_view'           | 'userId'            | 'uuid'
'route_matrix_cache'  | 'org_id'            | 'uuid'
'route_template_stops'| 'route_template_id' | 'uuid'
'stops'               | 'dispatch_id'       | 'uuid'
'stops'               | 'load_id'           | 'uuid'
```

**Does a from-zero replay create `app_user`?** **Yes.**
`prisma/migrations/20260515000001_db_security_standardization/migration.sql` lines 19-23:

```sql
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    CREATE ROLE app_user NOLOGIN;
  END IF;
END$$;
```

That is the only creation site in the chain. quick-595's migration sorts after it, so on a
from-zero replay the role exists by the time the grant block runs. The `pg_roles` guard exists
anyway, and skips with `RAISE NOTICE` rather than an exception, so a replay that has not yet
reached 20260515000001 still completes.

---

## 4. The `migrate.mjs` project-ref guard — both proofs

### 4a. The hazard being closed

`migrate.mjs` has **two** database consumers that resolve **different** environment variables:

1. The applier uses `DIRECT_URL || DATABASE_URL`.
2. The starter-playbook seeder it spawns resolves a **bare** `process.env.DATABASE_URL`, with no
   dotenv load of its own.

Pinning only `DIRECT_URL` therefore applies DDL to staging and **writes starter playbooks into
production.** The guard sits immediately before the seeder spawn.

### 4b. REFUSES on mismatched refs (sentinel — never the production ref)

```
$ DIRECT_URL="<staging>" DATABASE_URL="<staging, ref replaced by zzzzzzzzzzzzzzzzzzzz>" node scripts/migrate.mjs

Running database migrations...
Applying migration: 20260912130000_tenant_policy_grant_and_default_privilege_closure
  Applied: 20260912130000_tenant_policy_grant_and_default_privilege_closure
Migrations complete (1 applied)

  !! REFUSING TO SEED — DIRECT_URL and DATABASE_URL name DIFFERENT Supabase projects.
     DIRECT_URL  : postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres  -> ref wyixpgunnjmzguhggocz
     DATABASE_URL: postgresql://postgres.zzzzzzzzzzzzzzzzzzzz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres  -> ref zzzzzzzzzzzzzzzzzzzz
     The applier uses DIRECT_URL; the spawned starter-playbook seeder resolves
     DATABASE_URL. Running on would apply DDL to one project and write starter
     playbooks into the other.
     Set BOTH variables inline to the same connection string and re-run.

EXIT CODE: 1
```

**This run is also the apply.** The DDL went to the applier's target — `DIRECT_URL`, staging —
which is the only database either variable named that exists. The seeder was not spawned, so
nothing was written anywhere else. The refusal is the guard doing exactly its job: it fired
*after* the DDL and *before* the seeder, which is the only ordering that can exist given the two
consumers read different variables.

### 4c. PERMITS a matched pair

```
$ DATABASE_URL="<staging>" DIRECT_URL="<staging>" node scripts/migrate.mjs
DATABASE_URL (masked): postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres
DIRECT_URL   (masked): postgresql://postgres.wyixpgunnjmzguhggocz:****@aws-0-us-west-1.pooler.supabase.com:5432/postgres

Running database migrations...
Database up to date
Seeding starter playbooks for 0 tenant(s)...
EXIT CODE: 0
```

No refusal; the seeder spawned and ran against staging (0 tenants — staging carries none yet).
`Database up to date` is also the **idempotency proof at the applier level**: the second run
executed zero statements, because `migrate.mjs` skips by `migration_name`.

Separately, the **SQL itself** is re-runnable: every policy is `DROP POLICY IF EXISTS` +
`CREATE POLICY`; both `ALTER TABLE ... ROW LEVEL SECURITY` statements are naturally idempotent;
every grant, default-privilege and role statement sits inside a `pg_roles`-guarded `DO` block
(`GRANT`/`ALTER ROLE`/`ALTER DEFAULT PRIVILEGES` are all idempotent); the `grid_preference`
grant carries its own `information_schema.tables` guard; and both indexes are
`CREATE INDEX IF NOT EXISTS`. A second run of the SQL is a no-op.

### 4d. Guard behaviour, stated in full

- `DIRECT_URL` unset → no split target is possible → proceed.
- Both set, both refs derivable, **equal** → seed.
- Both set, both refs derivable, **different** → print both masked URLs and both refs, explain the
  two-consumer hazard, **do not spawn the seeder**, `process.exit(1)`.
- A ref **underivable** from either → loud warning, **skip the seeder**, exit 0. Fail-safe in both
  directions: never seed the wrong database, never break a deploy over a connection-string shape
  the guard cannot parse.

Ref derivation: `new URL(u).username` → the part after the first `.` (Supavisor's
`postgres.<ref>`); falling back to a `db.<ref>.supabase.co` hostname match; otherwise `undefined`.

---

## 5. Post-state verification — all against STAGING, raw

### 5.1 Drift detector, `DATABASE_URL` **and** `DIRECT_URL` pinned inline to staging

```
$ DATABASE_URL="<staging>" DIRECT_URL="<staging>" npx tsx scripts/audit/rls-policy-drift.ts

RLS Policy Drift — replay diff against live pg_policy
========================================================================

  Migration files read     : 150
  Statements parsed        : 411
  Policies expected (net)  : 183
  Policies live            : 183
  Missing (expected−live)  : 0
  Unexpected (live−expect) : 0

MISSING: none.

UNEXPECTED: none.

ZERO-POLICY TABLES (reported, not gating — Prompt 1 owns these):
  FORCE RLS + zero policies (severe)     : none
  RLS enabled, not forced, zero policies : _prisma_migrations

BASELINE: none — this check has no suppression list.
  Any missing or unexpected policy fails the run.

========================================================================
RESULT: CLEAN (exit 0) — repo and database agree exactly.
EXIT: 0
```

Every predicted number matched exactly: 149→**150** files, 403→**411** statements
(+4 `DROP POLICY` +4 `CREATE POLICY`), 179→**183** expected, 179→**183** live.

> **CORRECTION TO THE PLAN.** The plan said to pin only `DATABASE_URL` because "the script has no
> dotenv override, so an inline value wins". That is only half true and would have pointed the
> detector at **production**. `scripts/_bootstrap-env.ts` loads the repo-root `.env`
> non-overridingly (so an inline `DATABASE_URL` does survive) — but then executes:
>
> ```ts
> if (process.env.DIRECT_URL) {
>   process.env.DATABASE_URL = process.env.DIRECT_URL;
> }
> ```
>
> `DIRECT_URL` comes from the repo-root `.env` and is **production**, so it would have overwritten
> the inline staging value unconditionally. Read-only, so nothing was at risk of being written —
> but the numbers would have described the wrong database while looking correct. **Any script that
> imports `_bootstrap-env` must have BOTH variables pinned inline to be repointed.**

### 5.2 Zero FORCE-RLS-with-zero-policy tables

```
V3 | FORCE RLS + zero policies: none
V3b| RLS enabled not forced + zero policies: _prisma_migrations
```

`_prisma_migrations` remaining in the "enabled, not forced, zero policies" bucket is **by design**,
not a regression. The ledger is written by `migrate.mjs` running as `postgres`, never by the
application.

### 5.3 Zero tenant-scoped tables with zero `app_user` grants

```
V4 | tables with ZERO app_user grants: _prisma_migrations, policy_drop_audit
V4b| grants on the 8 target tables: NotificationEmailConfig=SELECT ; NotificationTemplate=SELECT ;
     Plan=SELECT ; Promo=SELECT ; carrier_catalog_meta=SELECT ;
     grid_view=DELETE+INSERT+SELECT+UPDATE ; route_matrix_cache=DELETE+INSERT+SELECT+UPDATE
```

Both remaining zeros are deliberate and neither is tenant-scoped (§2). `grid_preference` does not
appear because **it does not exist on staging** — it is absent from the migration chain entirely,
and this migration deliberately does **not** create it; its grant is guarded on
`information_schema.tables` so the same file is correct on production, where the table does exist.

**SELECT-only on the five reference tables is the evidence answer to the brief's "plus any write
the sysadmin path provably needs" — the answer is NONE.** Every write to `Plan` / `Promo` /
`NotificationTemplate` / `NotificationEmailConfig` lives in
`src/app/(admin)/actions/{plans,promos,notifications}.ts`, the sysadmin path, which per
`docs/audits/role-guard-storage-audit.md` §4 runs on the privileged `DATABASE_URL` and not as
`app_user`. `carrier_catalog_meta` has 0 reads and 0 writes in application code and is granted
SELECT to close the zero-grant **class**, not because anything reads it.

### 5.4 `pg_default_acl` carries an `app_user` entry

```
V5 | pg_default_acl: count=1 defaclrole=postgres defaclobjtype=r
     acl=postgres=arwdDxtm/postgres anon=arwdDxtm/postgres authenticated=arwdDxtm/postgres
         service_role=arwdDxtm/postgres app_user=arwd/postgres
```

`app_user=arwd` is exactly `INSERT, SELECT, UPDATE, DELETE`. `defaclrole = postgres` is the role
`migrate.mjs` connects as on both staging and production.

**Stated limit:** default privileges are **per creating role**. A table created by any role other
than `postgres` still needs an explicit grant. This closes the class for the path we actually use;
it is not a universal guarantee.

### 5.5 `app_user` role state

```
V6 | app_user rolcanlogin=true rolbypassrls=false rolconfig=idle_in_transaction_session_timeout=30s
```

- `rolcanlogin` false → **true**. Production was already `true`, so the statement is a no-op there.
  It grants no access on its own: the role still has no password, which Prompt 2 sets.
- `rolbypassrls` **false** — unchanged, and the whole point.
- 30s idle-in-transaction cap vs an instance-wide `0` (no limit). ~6x Prisma's 5s default
  interactive-transaction timeout, so it cannot cut a legitimate transaction; it bounds a leaked
  one against a 60-connection ceiling. Reversible with one `ALTER ROLE ... RESET`.

### 5.6 Migration ledger row

```
V7 | _prisma_migrations row: 20260912130000_tenant_policy_grant_and_default_privilege_closure
     checksum=manual steps=1 finished=true
```

`checksum='manual'` with `applied_steps_count=1` is the signature of a migration `migrate.mjs`
**actually executed**, as opposed to a hand-mirrored resolved-not-run row (real SHA-256,
`applied_steps_count = 0`) — DEC-17. This row was written by the applier itself, so DEC-17's
"query the table and read the newest row back" was satisfied by this query rather than assumed.

### 5.7 Indexes, policies, RLS state

```
V8 | new indexes: carrier_documents_uploaded_by_idx, grid_view_userId_idx
V9 | new policies: carrier_documents.tenant_isolation_policy [ALL/PERMISSIVE/public] ;
                   route_matrix_cache.tenant_isolation_policy [ALL/PERMISSIVE/public] ;
                   route_template_stops.tenant_isolation_policy [ALL/PERMISSIVE/public] ;
                   stops.tenant_isolation_policy [ALL/PERMISSIVE/public]
V10| route_matrix_cache rls=true force=true
V11| bypass_rls_policy instances still live: 86
V12| total policies in public: 183
```

All four match the canonical shape read from live `pg_policies` before writing
(`loads`, `route_templates`, `carrier_truck_defects`): PERMISSIVE, `FOR ALL`, `TO public`,
`USING` identical to `WITH CHECK`.

`bypass_rls_policy` still at **86** confirms Branch A: none were dropped.

### 5.8 Other gates

```
$ npx prisma validate
The schema at prisma\schema.prisma is valid 🚀          EXIT 0

$ npx prisma generate
✔ Generated Prisma Client (v7.6.0) to .\src\generated\prisma in 26.52s   EXIT 0

$ npx tsc --noEmit
(no output)                                              EXIT 0

# probed, because a clean run is not evidence the gate ran:
$ (inject `const __probe595: number = 'x';` into tenant-rls.ts) && npx tsc --noEmit
src/lib/db/extensions/tenant-rls.ts(246,7): error TS2322: Type 'string' is not assignable to type 'number'.
# probe deleted; re-run clean, EXIT 0

$ npx vitest run src/__tests__/isolation
 ✓ src/__tests__/isolation/group-b-isolation.test.ts (6 tests) 19ms
 ✓ src/__tests__/isolation/group-a-isolation.test.ts (4 tests) 19ms
 ✓ src/__tests__/isolation/group-c-isolation.test.ts (7 tests) 22ms
 Test Files  3 passed (3)
      Tests  17 passed (17)
```

The isolation tests were run exactly the way the 17/17 baseline was taken and were **not**
repointed at staging. They are unaffected by this migration because the runtime role has
`rolbypassrls = true`.

---

## 6. What this migration does NOT do

**It changes nothing at runtime today.** The application connects as `postgres`, which has
`rolbypassrls = true`. FORCE RLS and every policy shipped here are **decorative** until the
Prompt 2 cutover moves `DATABASE_URL` to `app_user`. A green deploy of this migration is **not**
evidence that the policies work, and must not be read as one.

The four new policies ship **without** a companion `bypass_rls_policy`, deliberately diverging
from the 86 tables that carry one, because the direction of travel is to remove those. Stated
consequence: after the cutover these four tables **ignore** `app.bypass_rls` while the other 86
still honour it. Any path that relies on the bypass to reach `stops`, `route_template_stops`,
`carrier_documents` or `route_matrix_cache` must set `app.current_tenant_id` instead
(`getTenantPrisma` / `getTenantPrismaForOrg`), not the bypass.

---

## 7. Follow-ups — open, deliberately not closed here

### (a) User-scoped RLS on `grid_view` and `grid_preference` — Phase 1

Both were added to `EXEMPT_MODELS` in `src/lib/db/extensions/tenant-rls.ts`.
**Exemption from tenant policy is NOT exemption from access control.** Both tables have RLS
**disabled** today (`rls=false force=false`) and rely entirely on application `where` clauses on
`userId`. `app_user` now has full DML on `grid_view`, so once the cutover lands, nothing at the
database level prevents one user reading another's saved grid views. A user-scoped policy needs a
`current_user_id()`-equivalent GUC, which does not exist yet — that is the Phase 1 item, not a
line that could have been added to this migration.

### (b) The deferred `bypass_rls_policy` drop

Prepared and **unapplied** at
`apps/web/prisma/migrations/20260912130000_tenant_policy_grant_and_default_privilege_closure/deferred-bypass-drop.sql`.
86 statements. Promote by **copying** it into a NEW migration directory as `migration.sql` — never
by renaming it and never by editing the applied migration beside it.

**The drops and the expected-set change must land in the same apply.** The detector replays the
repo's policy statements and diffs the net against live `pg_policy`. Promoting the file removes 86
from both sides at once, which is correct. Dropping them out of band — by hand, by `execute_sql`,
by anything that is not a committed `migration.sql` — leaves the expected set at 86 and the gate
reports **86 missing**.

Re-run the enumeration before promoting; the list was generated from live staging `pg_policies` on
2026-09-12 and a later migration may add another table carrying the same companion policy.

### (c) `grid_preference` is still absent from the migration chain

It exists on **production** and on no other project. It is not created by any migration. This
migration deliberately does **not** create it — that is a separate decision with its own
correctness question (what the authoritative column set is), and inventing one here would put a
guess into the chain. Its grant is guarded so this file is correct on both projects.

Related and also open: **`policy_drop_audit`** is likewise present on staging and carries no
`app_user` grant. It is not tenant-scoped and the application does not touch it, so it is left
ungranted — but it should be confirmed to be in the chain rather than out of band.

### (d) A from-zero replay DOES create `app_user`

`20260515000001_db_security_standardization` creates it `NOLOGIN`, guarded on `pg_roles`. See §3.
quick-595 sorts after it, so the grant block runs against an existing role on a full replay.

### (e) `"Tenant"` has no write policy — a Prompt 2 blocker, NOT fixed here

Verified against **live** `pg_policies` (not migration SQL) before planning: the `"Tenant"` table
carries exactly two policies —

- `bypass_rls_policy` (`ALL`), and
- `tenant_self_read` (`SELECT`, `USING (id = current_tenant_id())`).

There is **no INSERT, UPDATE or DELETE policy.** Once `bypass_rls_policy` is dropped and
`DATABASE_URL` moves to `app_user`, **every write to `"Tenant"` fails** — including signup,
onboarding and any settings update that touches the tenant row. This is recorded here as a
**Prompt 2 blocker**. It is deliberately not fixed in quick-595: the correct predicate for a
tenant INSERT is not obvious (the row being created is, by definition, not yet the current
tenant), and getting it wrong is the kind of change that looks applied and is discovered at
signup.

### (f) `SupportTicket_submittedBy_fkey` remains open from quick-594

Carried forward unchanged. quick-595 did not touch it.

### (g) Only ~15 of the 211 bypass sites survive a cutover as written

From `docs/audits/bypass-call-classification.md`: **145 of the 161 DECORATIVE sites never push the
tenant into the DB session at all.** They call `set_config('app.bypass_rls', 'on', TRUE)` on a
client whose `app.current_tenant_id` was never set, so when the bypass policy is removed the
tenant policy evaluates `org_id = NULL` and they return **zero rows** — they do not "fall back to"
the tenant policy, they fail closed.

**The remedy for those is `getTenantPrismaForOrg`, not a privileged connection.** Handing them a
privileged connection would convert 145 correctly-scoped queries into 145 unscoped ones, which is
the opposite of the work. This is the single largest item standing between here and Prompt 2, and
it is not started.
