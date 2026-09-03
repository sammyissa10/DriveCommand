# quick-584 — How the carrier RLS policies were dropped without a ledger entry

**Date:** 2026-09-03
**Type:** read-only forensic. **No DDL, no DML, no policy recreated. No test suite, seed, migration or npm script executed.**

Report: [`docs/diagnostics/rls-policy-drop-forensics.md`](../../../docs/diagnostics/rls-policy-drop-forensics.md)

---

## Verdict: the mechanism CANNOT be determined — and that is the honest answer

The surface that would have answered it was **enabled and did capture the statements**:
`log_statement = 'ddl'`. Its retention is ~24 hours (oldest `postgres_logs` row:
**2026-09-02T18:45**, 226 rows) and the event is ~3 months old. **The evidence existed and
expired before the question was asked.** `pgaudit` is in `shared_preload_libraries` but the
extension is **not installed**, so the richer object-level trail was never written at all.

Per the brief's constraint, I have not named a mechanism. A wrong attribution here would be
worse than the open question.

## The loss is four times larger than reported

Method: parsed all `CREATE`/`DROP POLICY` from every migration, **replayed them in migration
order** (counting raw CREATEs would have produced 46 phantom discrepancies from the
standardization migration's balanced 46/46), then diffed against live `pg_policy`.

- 328 statements parsed → **230 expected**, **179 live**
- **59 missing across 13 carrier tables** — not 14 across 3

`stops` (0/6), `carrier_documents` (0/4) and `route_template_stops` (0/4) are simply the
three where the loss is *total*. The other ten carrier tables lost 4–6 each but were
re-covered on 2026-05-15 by the standardized pair, so their loss is invisible — which is
exactly why quick-582 surfaced only three.

## The footprint is perfectly clean

| source migration | missing | surviving |
|---|---|---|
| `20260404100013_carrier_rls_policies` | **48** | 0 |
| `20260527000001_quick410_advisor_rls_fix` | **11** | 0 |
| `20260515000001_db_security_standardization` | 0 | **20** |

Every policy from the April carrier migration and quick-410 is gone; every policy from the
May standardization survives. The missing set is precisely the April per-command naming
scheme (`*_org_select/insert/update/delete`, `*_driver_*`, `*_owner_*`).

### Two attractive hypotheses falsified

- **"A sweep dropped everything not named `tenant_isolation_policy`/`bypass_rls_policy`."**
  **False** — `in_app_notifications_*`, `PushToken.user_isolation_policy`,
  `Tenant.tenant_self_read` and both `SysAdmin*_deny_tenant_users` survive with non-standard
  names.
- **Point-in-time restore.** **Impossible** — no single instant preserves 2026-05-15 while
  discarding both 2026-04-05 and 2026-05-27.

## Everything ruled out, with evidence

- **No repo artefact drops these policies.** 169 `DROP POLICY` occurrences; every executable
  one is paired with a `CREATE` in the same migration. The only `DROP POLICY` outside
  `prisma/migrations` is `scripts/audit/421-...-ROLLBACK.sql`, targeting
  `Tenant.tenant_jwt_self_read` — which is still live, so it was never run.
- **No dynamic DDL.** The standardization migration's seven `DO $$` blocks are NULL-check
  guards that `RAISE EXCEPTION`; there is no `EXECUTE format(...)` loop anywhere.
- **No runtime DDL path.** Three candidates examined by *reading*, never running:
  `test-advisor-fix-isolation.ts` (INSERTs inside `BEGIN`/`ROLLBACK`, refuses to run as the
  privileged role), the three `isolation/*.test.ts` files (`CREATE POLICY` only in `//`
  comments), and `406b-resolve-blockers.ts` (snippets are markdown output; no `query(`
  begins with a DDL verb). **The brief's "test suite pointed at production" hypothesis is
  specifically falsified.**
- **No script or CI uses `db push` / `migrate reset` / `migrate dev`.** Every hit is inside
  `.planning/` narrative. But the practice is documented in this repo's history (quick-102,
  quick-14, ROADMAP §115) and `.env.local` points at production — so a manual `db push`
  remains the most plausible **unfalsified** path, since RLS policies never appear in
  `schema.prisma`. It cannot be confirmed, and it does not obviously explain why the
  2026-05-15 policies survived.

## Step 6's premise was false and is corrected in the open

**Postgres stores no policy creation or modification timestamp** — `pg_policy` has no
timestamp column and there is no `pg_stat_last_ddl`. The step as written is unanswerable.

I used **OID ordering** as the proxy (monotonic counter; labelled circumstantial, with wrap
and cross-catalog caveats stated). It answers the underlying question decisively: the
surviving `facilities` policies are OID **53105/53106**, inside the contiguous 53099–53114
block created by the **2026-05-15** standardization — *before* the loss, not after. So the
survivors are original, not recreated, which rules out "everything was rebuilt later and
these three were forgotten". There is a conspicuous OID gap between 53298 and 60767 where
quick-410's 2026-05-27 policies would have sat; nothing occupies it.

## One surface the brief did not name, checked anyway

`pg_stat_statements` has `track_utility = on`, so it records `DROP POLICY`. Its
`stats_reset` is **2026-08-24**, after the event — but it contains exactly four policy DDL
statements, all four the paired CREATE/DROP from `20260825120000_add_carrier_truck_defects`.
**So no unexplained policy DDL has run since 2026-08-24**, which brackets the event to
**after 2026-05-28 and before 2026-08-24** and confirms nothing is dropping policies now.

## Monitoring that would catch a recurrence

1. **A policy-count assertion in CI** comparing live `pg_policy` to the migration replay —
   the ~40-line script written for §5 *is* the mechanism, needs no new infrastructure, and
   would have caught this the next day. Highest value by far.
2. **Install `pgaudit`** (already preloaded) with `pgaudit.log = 'ddl'`.
3. **Ship Postgres logs off-platform** — DDL logging is already on; only retention is short.
4. **An event trigger on `sql_drop`** writing to a durable table — survives log rotation.
5. **Remove the ability to `db push` at production** — a guard on `DATABASE_URL`.

## Verification

`git status` shows only the report and planning docs. No file under `apps/` or `packages/`.
Re-queried at the end: `stops`, `route_template_stops` and `carrier_documents` still have
**zero** policies — this task fixed nothing by accident.
