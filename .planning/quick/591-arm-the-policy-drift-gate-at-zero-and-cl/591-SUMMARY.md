# Quick 591 — Summary

**Date:** 2026-09-09
**Commits:** `8cc4b36e` (reconciliation + baseline removal) · `fb7864bb` (guard + CI) · `198f2153` (docs)
**Outcome:** gate armed at zero with no suppression list. Two items blocked by a
privilege ceiling and reported rather than faked. One item needs a decision.

---

## Pre-baseline

```
  Policies expected (net)  : 230
  Policies live            : 179
  Missing (expected−live)  : 59
  Unexpected (live−expect) : 8
BASELINE: 59 suppressed missing, 8 suppressed unexpected (recorded 2026-09-03)
RESULT: CLEAN (exit 0) — no drift beyond the baseline.
```

## Post

```
  Migration files read     : 141
  Statements parsed        : 403
  Policies expected (net)  : 179
  Policies live            : 179
  Missing (expected−live)  : 0
  Unexpected (live−expect) : 0
MISSING: none.   UNEXPECTED: none.
ZERO-POLICY TABLES (reported, not gating — Prompt 1 owns these):
  FORCE RLS + zero policies (severe)     : carrier_documents, route_template_stops, stops
  RLS enabled, not forced, zero policies : _prisma_migrations
  WARNING: 3 table(s) enforce RLS with no policy at all.
BASELINE: none — this check has no suppression list.
RESULT: CLEAN (exit 0) — repo and database agree exactly.
```

Both runs are against **production, read-only**.

## The reconciliation migration is a no-op by construction

`20260909120000_reconcile_rls_policy_drift` — 67 `DROP POLICY IF EXISTS`
(59 April/quick-410 + 8 out-of-band), 8 `CREATE POLICY`, 322 lines.

The 59 are already absent; the 8 are already present with exactly the
definitions written, read from `pg_policies` on 2026-09-09. **The migration
moves the repository, not the database** — which is why the detector reports
0/0 against production without the migration having been applied anywhere. That
is the mechanism, not a coincidence: the detector replays migration files to
compute an expected set, and the file changes that set.

Neither historical migration was edited.

## Verification

**Deliberate-discrepancy probe (step 2).** Added a scratch migration creating
`loads.quick591_probe_policy`:

```
MISSING policy keys:
  - loads.quick591_probe_policy
RESULT: DRIFT DETECTED (exit 1)
npm error code 1
```

Reverted; back to `CLEAN (exit 0)`. The gate is non-vacuous.

**db push guard (step 4).**

| case | expected | exit |
|---|---|---|
| real `.env.local` (production pooler) | block | 1 |
| `db.oqdhberkghtnszrkdvfm.supabase.co` | block | 1 |
| `localhost:5432` | allow | 0 |
| no `DATABASE_URL`/`DIRECT_URL` | block (fail closed) | 1 |
| unparseable string | block (fail closed) | 1 |
| documented override | allow + warning | 0 |
| `npm run db:push` vs production | pre-hook aborts before Prisma | 1 |

**Tests.** 17/17 isolation. 23/23 replay. `tsc --noEmit` clean.

**Documents (step 7).** All five agree: hand-write
`prisma/migrations/<UTC timestamp>_<name>/migration.sql`, apply with
`node scripts/migrate.mjs`, never `db push` / `migrate dev` / `migrate reset`.
Resolved in favour of `database.md` because `scripts/migrate.mjs` is the actual
applier. `setup.md`'s "drift detected" entry was deleted outright.

## Two guards this change legitimately moved

Both are recalibrations of anti-vacuity guards that tripped on a *correct*
corpus once the expected set changed, and both are recorded rather than quietly
widened:

- `INTEGRITY_FLOORS.MIN_EXPECTED_POLICIES` 200 → 150. Not 179: a floor equal to
  the current value fails on the next legitimate removal and teaches people to
  edit the floor instead of reading the finding.
- `rls-policy-replay.test.ts` pinned 328/230 (the quick-584 reproduction). Now
  403/179, with the arithmetic written out so a future failure is investigated.

## Blocked by a privilege ceiling — reported, not faked

`CREATE EVENT TRIGGER` and `CREATE EXTENSION pgaudit` both require **superuser**,
and PostgreSQL exposes no grantable privilege for the former. Measured live:
`postgres` (the migration runner's role) has `rolsuper = false`; all six existing
event triggers are owned by `supabase_admin`.

**A preview branch does not lift this** — a branch hands you the same `postgres`
role. So steps 5 and 6 were never achievable by a migration on any target.

- **Step 5.** The migration creates `public.policy_drop_audit` and
  `public.policy_drop_audit_fn()` (both within `postgres`'s rights) and attempts
  the trigger in a `DO` block that catches `insufficient_privilege` and raises a
  `WARNING`. The migration applies cleanly either way and does not pretend to
  have succeeded.
- **Step 6.** pgaudit is available (17.1) and already in
  `shared_preload_libraries`, but not installed.

Both manual statements are in `docs/audits/policy-drift-gate.md` §3.

Worth stating: pgaudit writes to the same ~24h Postgres log that already failed
us. The `policy_drop_audit` table is the option that survives rotation, which is
why it is the one in the migration.

## Open — needs a decision

**The migration has not been applied anywhere.** `list_branches` returns empty;
no Supabase preview branch exists, and production must not be written. Three
check items remain unmet for that reason:

- `prisma migrate deploy` applies cleanly to the branch
- per-table policy counts identical before and after
- the `sql_drop` trigger records a test DROP POLICY (blocked by superuser too)

Creating a branch costs $0.01344/hour (~$9.68/month) and would serve only the
first two, since the third needs superuser regardless.

**The CI check is armed but inert.** `RLS_AUDIT_DATABASE_URL` does not exist as
a secret; this task did not mint a database credential. The skip is now a loud
`::warning::` rather than a silent `::notice::`.
