# Policy drift gate — armed at zero

**Phase 0, Prompt 0.5.** Companion to
[`rls-policy-drop-forensics.md`](../diagnostics/rls-policy-drop-forensics.md) and
`.planning/phase-0-revised.md` §3.1, §3.5 and §7.

- **Date:** 2026-09-09
- **Migration:** `20260909120000_reconcile_rls_policy_drift`

---

## 1. What the gate reports now

| | Before | After |
|---|---|---|
| Policies expected (replay) | 230 | 179 |
| Policies live | 179 | 179 |
| Missing | **59** | **0** |
| Unexpected | **8** | **0** |
| Suppression baseline | 59 missing + 8 unexpected | **none — file deleted** |
| Result | `CLEAN (exit 0)` **with 67 findings suppressed** | `CLEAN (exit 0)` with nothing suppressed |
| Statements parsed | 328 | 403 |
| Migration files | 140 | 141 |

The reconciliation migration is a **no-op against the database by construction**.
The 59 policies it drops are already absent; the 8 it creates are already present
with exactly the definitions it writes, read out of `pg_policies` on 2026-09-09.
What it changes is the *repository's* expected set, which is what allowed the
baseline to be deleted rather than merely emptied.

## 2. What gates, and what does not

**Gates (exit 1):** `missing` and `unexpected` from the replay diff. There is no
suppression list, no `--ignore`, and no `--allow`. A finding can only be cleared
by a forward migration.

**Does not gate:** the zero-policy table classification. `stops`,
`route_template_stops` and `carrier_documents` run FORCE RLS with zero policies,
and `_prisma_migrations` has RLS enabled with none. These are real and severe,
they are **Prompt 1's work**, and this prompt was explicitly forbidden to touch
them. They are printed as a standing `WARNING` on every run rather than
suppressed, and the warning disappears on its own when Prompt 1 closes them.

Stated plainly because the distinction matters: the old baseline suppressed
exactly this class of finding and still printed `CLEAN`.

## 3. Two things that are NOT active, and why

### 3.1 The `sql_drop` event trigger — blocked by a privilege ceiling

`CREATE EVENT TRIGGER` requires **superuser**, and PostgreSQL exposes no
grantable privilege for it. Measured against production on 2026-09-09:

| role | `rolsuper` | `rolbypassrls` |
|---|---|---|
| `postgres` (the migration runner's role) | **false** | true |
| `supabase_admin` | true | true |
| `app_user` | false | false |

All six pre-existing event triggers (`pgrst_ddl_watch`, `pgrst_drop_watch`,
`issue_pg_graphql_access`, `issue_graphql_placeholder`, `issue_pg_cron_access`,
`issue_pg_net_access`) are owned by `supabase_admin`.

**A Supabase preview branch does not lift this.** A branch hands you the same
`postgres` role, so creating the branch would not have made this work.

The migration therefore creates the durable table `public.policy_drop_audit` and
the function `public.policy_drop_audit_fn()` — both of which `postgres` can
create — and attempts the trigger inside a `DO` block that catches
`insufficient_privilege` and raises a `WARNING`. The migration applies cleanly
either way; it does not pretend to have succeeded.

**Manual step, requires a superuser connection:**

```sql
CREATE EVENT TRIGGER policy_drop_audit_trigger
  ON sql_drop EXECUTE FUNCTION public.policy_drop_audit_fn();
```

Verify with:

```sql
SELECT evtname, evtevent, evtenabled, pg_get_userbyid(evtowner) AS owner
  FROM pg_event_trigger WHERE evtname = 'policy_drop_audit_trigger';
```

Until that runs, **`DROP POLICY` is not recorded**, and the forensics gap that
made the 2026 loss unattributable is still open.

### 3.2 pgaudit — same ceiling

`pgaudit` is available (version 17.1) and **already in
`shared_preload_libraries`**, confirmed on production:

```
pg_stat_statements, pgaudit, plpgsql, plpgsql_check, pg_cron, pg_net,
pgsodium, auto_explain, pg_tle, plan_filter, supabase_vault
```

It is **not installed** (`installed_version` is null). Both remaining steps need
superuser: `CREATE EXTENSION pgaudit` and `ALTER SYSTEM SET pgaudit.log`.

**Manual steps, requires a superuser connection or the Supabase dashboard:**

```sql
CREATE EXTENSION IF NOT EXISTS pgaudit;
ALTER SYSTEM SET pgaudit.log = 'ddl';
SELECT pg_reload_conf();
```

Worth knowing before relying on it: pgaudit writes to the **same Postgres log
that already failed us**. Supabase retains roughly 24 hours, and the 2026 loss
was found about three months later. pgaudit earns its keep only with a log drain
or another durable sink. The `policy_drop_audit` table in §3.1 is the option that
survives rotation, which is why it is the one built into the migration.

## 4. The CI credential gap — the remaining hole

`.github/workflows/rls-policy-drift.yml` now runs on **every pull request** and
fails the job on non-zero drift.

It is still **inert**, because `RLS_AUDIT_DATABASE_URL` does not exist as a
repository or organization secret. quick-585 deliberately did not create one and
neither did this task — minting a database credential is not something a task
should do unsupervised.

The skip path was a `::notice::` that quietly passed. It is now a `::warning::`
annotation plus a banner in the job log stating that a green tick means nothing
was checked. It is deliberately **not** a hard failure: that would turn every
pull request red today over a missing secret nobody asked for.

**To arm it:** add a read-only Postgres connection string as the repository
secret `RLS_AUDIT_DATABASE_URL`. A role with `pg_read_all_data` is sufficient —
the script only reads `pg_catalog`.

## 5. The `db push` guard

`apps/web/scripts/guard-no-prod-db-push.mjs` refuses when `DATABASE_URL` or
`DIRECT_URL` resolves to a production host, and is wired as the `predb:push` and
`premigrate:reset` npm hooks. Verified:

| case | expected | exit |
|---|---|---|
| real `.env.local` (production pooler) | block | 1 |
| `db.oqdhberkghtnszrkdvfm.supabase.co` (direct) | block | 1 |
| `localhost:5432` | allow | 0 |
| no `DATABASE_URL` / `DIRECT_URL` at all | block (fail closed) | 1 |
| unparseable connection string | block (fail closed) | 1 |
| `ALLOW_PROD_DB_PUSH=i-understand-this-can-drop-rls-policies` | allow, with a warning | 0 |
| `npm run db:push` against production | pre-hook aborts before Prisma runs | 1 |

It fails closed on absence and on anything it cannot parse, because a guard that
guesses "probably fine" is the thing being replaced.

## 6. Documentation

Five documents told developers to run `prisma db push` or `prisma migrate dev`,
and contradicted each other. They now agree on one workflow: hand-write
`prisma/migrations/<UTC timestamp>_<name>/migration.sql`, apply it with
`node scripts/migrate.mjs`, and never run `db push`, `migrate dev` or
`migrate reset`.

| file | change |
|---|---|
| `apps/web/docs/database.md` | `db push` "for local development" replaced with the hand-written migration workflow, plus why (`schema.prisma` does not contain RLS policies) and that there is no local database |
| `apps/web/docs/setup.md` | first-time-setup `db push` replaced with `node scripts/migrate.mjs` |
| `apps/web/docs/setup.md` | **"drift detected" troubleshooting entry deleted outright.** It instructed forcing past the exact check that would have stopped this: "drift" is Prisma reporting that the database holds objects the schema does not describe, which is precisely what an RLS policy is |
| `apps/web/docs/stack.md` | `db push` command replaced; explicit NEVER line added |
| `apps/web/docs/troubleshooting.md` | `db push` command replaced; the "Always create migrations via `prisma migrate dev`" prevention line rewritten |
| `CONTRIBUTING.md` | `prisma migrate dev --name` replaced with the hand-written workflow |

The contradiction was resolved in favour of `database.md`, because
`scripts/migrate.mjs` is the actual applier: it reads `migration.sql` files in
directory order, skips by `migration_name`, and is what `npm start` and the
Vercel build run. `prisma migrate deploy` reads the same directory and the same
`_prisma_migrations` table and remains compatible for preview-branch use.

---

## 7. The preview branch is not available on this plan — affects all of Phase 0

Attempted 2026-09-09, with cost confirmed at $0.01344/hour:

```
create_branch(project_id=oqdhberkghtnszrkdvfm, name=phase0-prompt05-verify)
=> PaymentRequiredException: "Branching is supported only on the Pro plan or above"
```

**Nothing was billed and no preview branch exists.** One side effect worth
recording: the attempt registered a default branch record named `main` whose
`project_ref` is the production project itself
(`67db06c8-6e48-4f6c-80e0-fb67bd1456b2`, `is_default: true`). That is Supabase's
branching bookkeeping, not a preview database. It was deliberately **not**
deleted, because deleting a branch record that points at the production project
ref is not a safe operation to attempt on a hunch.

This is not a Prompt 0.5 problem. `.planning/phase-0-revised.md` §1.5 states that
**all four prompts target a Supabase preview branch**, and §1.4 specifies
applying migrations to it with `prisma migrate deploy`. On the current plan tier
that route does not exist, so Prompts 1, 2 and 3 need a different plan for how
their migrations get verified before production.

There is also no local alternative: DEC-3 records that there is no local
database, and this machine has no Docker, no `psql`, and nothing listening on
5432.

**Two further things a branch would not have given us even on Pro**, both
measured rather than assumed:

1. It would not have lifted the superuser ceiling in §3 — a branch hands you the
   same non-superuser `postgres` role.
2. It would not have been a faithful replica. Supabase builds a branch by
   replaying **its own** migration ledger, which holds 36 entries under different
   names from this repo's 141. `20260404100013_carrier_rls_policies`,
   `20260515000001_db_security_standardization` and
   `20260527000001_quick410_advisor_rls_fix` are all absent from it. A branch
   would therefore not carry the policies whose absence this migration records,
   and `DROP POLICY IF EXISTS ... ON public.stops` errors outright if the table
   itself is missing — `IF EXISTS` covers the policy, not the relation.

**Consequence for this task.** The reconciliation migration is committed and
unapplied. It is a no-op against production by construction, and the drift
detector already reports 0 missing / 0 unexpected against production read-only,
because the detector computes its expected set from migration files rather than
from what has been applied. What remains unproven is only that the file applies
without error, which will first be exercised by `scripts/migrate.mjs` on the next
deploy.

---

## 8. Verification by inspection (2026-09-09)

The migration ships unapplied. Since no branch was available and production is
not written, Part 2 was verified by diffing every statement against the live
definitions read from `pg_policies`, mechanically rather than by eye.

Canonical live shape, identical across all four tables:

```
tenant_isolation_policy  ALL  {public}
  USING      (org_id = current_tenant_id())
  WITH CHECK (org_id = current_tenant_id())

bypass_rls_policy        ALL  {public}
  USING      (current_setting('app.bypass_rls', true) = 'on')
  WITH CHECK (null)
```

Result — **all 8 match on cmd, roles, USING and WITH CHECK**:

```
match  document_import_pages.tenant_isolation_policy        cmd=ALL roles=public USING=ok WITH CHECK=ok
match  document_import_pages.bypass_rls_policy              cmd=ALL roles=public USING=ok WITH CHECK=omitted -> null
match  document_imports.tenant_isolation_policy             cmd=ALL roles=public USING=ok WITH CHECK=ok
match  document_imports.bypass_rls_policy                   cmd=ALL roles=public USING=ok WITH CHECK=omitted -> null
match  document_profiles.tenant_isolation_policy            cmd=ALL roles=public USING=ok WITH CHECK=ok
match  document_profiles.bypass_rls_policy                  cmd=ALL roles=public USING=ok WITH CHECK=omitted -> null
match  facility_external_references.tenant_isolation_policy cmd=ALL roles=public USING=ok WITH CHECK=ok
match  facility_external_references.bypass_rls_policy       cmd=ALL roles=public USING=ok WITH CHECK=omitted -> null

RESULT: all 8 match the live shape exactly.
```

Two representational points, stated because the comparison normalised them and
a reader diffing by eye would otherwise see a difference that is not one:

1. **`::text` casts.** The migration writes
   `current_setting('app.bypass_rls'::text, true) = 'on'::text`, which is how
   `pg_policies` rendered the live expression when it was read. The casts are
   Postgres's own rendering of a text literal in that context; writing the
   expression with or without them stores the identical parse tree. The
   comparison stripped `::text` from both sides.

2. **`WITH CHECK` omitted for `bypass_rls_policy`.** Live `with_check` is
   `null`, and the migration omits the clause entirely, which is what produces
   `polwithcheck = null` in the catalog. That is a match, not an approximation.
   For a `FOR ALL` policy Postgres falls back to the `USING` expression when
   `WITH CHECK` is absent, so behaviour is identical too. Writing
   `WITH CHECK (current_setting(...) = 'on')` explicitly would have produced a
   non-null `polwithcheck` and therefore a real difference from live.

## 9. The stray `main` branch record — left in place

The failed `create_branch` attempt registered this row:

```
id                   67db06c8-6e48-4f6c-80e0-fb67bd1456b2
name                 main
project_ref          oqdhberkghtnszrkdvfm      <-- the production project
parent_project_ref   oqdhberkghtnszrkdvfm      <-- the production project
is_default           true
persistent           false
preview_project_status ACTIVE_HEALTHY
```

**It was not deleted, because it cannot be confirmed to be bookkeeping only.**
Its own `project_ref` and `parent_project_ref` are the production project ref,
and `is_default` is true — so by the only evidence available it *is* a pointer
to production, not a detached record. `delete_branch` takes a branch id and
there is no read-only call that reveals what it would do to a default branch
whose ref is the production project. The downside of guessing wrong is
irreversible and the upside is tidiness.

To remove it deliberately: disable branching from the Supabase dashboard, where
the consequences are shown before confirming.
