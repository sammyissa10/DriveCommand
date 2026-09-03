# quick-585 — CI policy-count assertion: detect silent RLS policy loss

**Date:** 2026-09-03
**Type:** detector build. Read-only against production for verification queries; no DDL, no
DML, no migration run, no policy created/altered/dropped, no pgaudit installed, no CI
credential created.

Report: [`docs/diagnostics/rls-policy-drift-detector.md`](../../../docs/diagnostics/rls-policy-drift-detector.md)

---

## What was built

quick-584 found that 59 RLS policies across 13 carrier tables silently vanished from
production and recommended, as the single highest-value fix, "a policy-count assertion in CI
or a cron... the ~40-line replay written for §5 is the whole mechanism, and it would have
caught this the day after it happened." This task builds exactly that detector, records
today's shortfall as an explicit shrinking baseline (not a fix — the 59 policies are still
missing), and wires it into CI in a way that is inert until a credential exists.

1. **`apps/web/scripts/audit/rls-policy-replay.ts`** — pure, DB-free library. Parses
   `CREATE`/`DROP POLICY` out of migration text with a line-anchored regex (preserving
   quick-584's 328-vs-330 boundary — the two excluded lines are inside a `DO $$ … EXECUTE
   format(...)` block), replays them in migration order into a net "expected" set (so the
   balanced 46 DROP / 46 CREATE in the 2026-05-15 standardization migration nets to zero
   phantom discrepancies), diffs that against a live set in both directions, applies an
   explicit baseline with stale-entry detection, classifies zero-policy tables into
   FORCE-RLS-and-zero (severe) vs enabled-not-forced-and-zero, and exports integrity floors
   so a broken parser fails loud instead of quiet.
2. **`apps/web/scripts/audit/rls-policy-drift.ts`** — the runner. Reads the migration corpus
   from disk, queries live `pg_policy`/`pg_class` read-only (joined on `pg_class.oid`, never
   `::regclass` on a literal), loads the committed baseline via `readFileSync` + `JSON.parse`,
   and prints a human diff or (`--json`) a machine-readable summary. Exit 0 = clean, 1 = drift,
   2 = operational failure (distinct banner, never mistaken for a clean run). No
   `--write-baseline`, `--ignore`, or `--allow` flag exists anywhere in the file.
3. **`apps/web/scripts/audit/rls-policy-baseline.json`** — the explicit, named, shrinking
   baseline. Regenerated from the runner's own `--json` output against production (never
   hand-typed). 59 `missing` entries + 8 `unexpected` entries + 3 `zeroPolicyForced` entries +
   1 `zeroPolicyEnabled` entry = **71 total baseline entries** across the four lists (the plan
   referred to this as the "67-entry baseline," counting only the two policy-key lists:
   59 + 8 = 67). Each list carries a `$why` naming quick-584 and a top-level `$comment`
   instructing deletion of the file once every list is empty.
4. **`apps/web/tests/security/rls-policy-replay.test.ts`** — 23 Vitest tests: parser anchor
   regression (the CREATE-inside-a-quoted-string case that produces 330 vs 328), CRLF
   normalization, quoted/bare identifiers, replay ordering in both directions (including the
   balanced-46/46 case), both diff directions, baseline suppression + both stale-entry cases,
   zero-policy classification into both classes, integrity-floor breach/pass, and a **real
   corpus test** reading every migration file off disk with a "was it found" assertion (≥130
   files) and a hard-coded length floor (exactly 328 statements, exactly 230 expected) that
   will fail — deliberately — if a future migration changes those numbers, forcing the
   baseline and the hard-coded numbers to be updated together.
5. **`.github/workflows/rls-policy-drift.yml`** — push-to-master (+ `workflow_dispatch`).
   Checks for `secrets.RLS_AUDIT_DATABASE_URL`; runs the check only when present; emits a
   `::notice::` and exits 0 (does not fail the build) when absent. The secret is read via
   `env:`, never interpolated into a `run:` command body.
6. **`apps/web/package.json`** — `audit:rls-policy-drift` npm entry point.
7. **`docs/diagnostics/rls-policy-drift-detector.md`** — what it catches, how it works, the
   full sample production run, both tamper-probe outputs, the CI credential-gap finding, and
   the pgaudit availability + priced log-volume assessment.

---

## Production run — reproduces quick-584 exactly

| metric | quick-584 | this run |
|---|---|---|
| statements parsed | 328 | **328** |
| policies expected | 230 | **230** |
| policies live | 179 | **179** |
| missing | 59 | **59** |
| tables with missing policies | 13 | **13** |
| tables at zero live policies | 3 | **3** |
| unexpected live policies | 8 | **8** |

Arithmetic `230 − 59 + 8 = 179` confirmed. Every missing/unexpected policy name was
cross-checked one-for-one against forensics §5's table and code block — no divergence, so
execution proceeded to populate the baseline rather than stopping.

Zero-policy classification: `zeroPolicyForced = [carrier_documents, route_template_stops,
stops]` (FORCE RLS + zero policies — the severe class); `zeroPolicyEnabled = [_prisma_migrations]`
(RLS enabled, not forced, zero policies, by deliberate design per
`20260328000001_enable_rls_prisma_migrations_and_tenant` — not a quick-584 loss).

With the populated baseline committed, `npm run audit:rls-policy-drift` exits **0**, reporting
"Suppressed missing entries: 59" and "Suppressed unexpected entries: 8".

## Tamper probes (proving the baseline is not a rubber stamp)

**Probe A — deleted a real entry** (`carrier_documents.carrier_documents_insert` removed from
`missing.entries`): exit **1**, reported under "NEW findings — not in the baseline: - missing:
carrier_documents.carrier_documents_insert". Entry restored, re-run confirmed exit 0.

**Probe B — added a fabricated entry** (`clients.definitely_not_a_real_policy`): exit **1**,
reported under "STALE baseline entries — these are no longer actually missing/unexpected live"
with the instruction to delete that line. Entry removed, re-run confirmed exit 0.

## CI credential-gap finding

`.github/workflows/` has exactly four pre-existing workflows: `ci.yml` (pull_request only, no
push trigger, dummy `DATABASE_URL: postgresql://ci:ci@localhost:5432/ci`), `deploy-web.yml`
(push to master, `VERCEL_*`/`SUPABASE_*` secrets), `doc-drift.yml` (pull_request, no secrets),
`playwright.yml` (push + pull_request, `PLAYWRIGHT_*`/`TEST_*` secrets). **No workflow has any
Postgres connection secret.** `SUPABASE_SERVICE_ROLE_KEY` (in `deploy-web.yml`) is a
PostgREST/API key and cannot drive a `pg` connection to `pg_catalog`. A new secret,
`RLS_AUDIT_DATABASE_URL`, is required — a read-only connection string on the **direct** 5432
host (not the 6543 pooler), for a role with `SELECT` on `pg_catalog` (no extra grant needed;
`pg_policy`/`pg_class` are world-readable to any connecting role). **No credential was
created.** The new workflow checks for it, skips with a GitHub notice and exits 0 when it is
absent (true today), and only runs the check once a maintainer adds the secret.

## pgaudit — availability and priced log volume

Availability (not re-queried; already established per the task's constraint): `pgaudit`
`default_version 17.1`, `installed_version null`, already in `shared_preload_libraries` on
project `oqdhberkghtnszrkdvfm` (Postgres 17.6.1.084) — available, not installed.

Cost, measured read-only via `pg_stat_statements` (`stats_reset = 2026-08-24T12:23:57Z`,
queried 2026-09-03T19:08:14Z, ≈10.28 days elapsed): **89 DDL-class statement executions
(leading verb CREATE/ALTER/DROP) across 27 distinct normalized statements ≈ 8.7 DDL
statements/day**; average statement text length ≈104 bytes (max 325, min 31). Estimated
pgaudit log volume, assuming ~150–350 bytes of fixed prefix per line on top of the statement
text: **order of a few KB/day**, low tens of KB/day upper bound during heavier migration
activity — trivial by any storage measure.

**The decisive finding is retention, not volume.** `log_statement='ddl'` is already on and
already captured quick-584's DDL statements at the time they ran; pgaudit would add
object-level attribution to the same log stream, not durability. quick-584's loss was found
~3 months after the fact against a log with ~24-hour retention. pgaudit is worth having **only
paired with** a log drain or another durable sink (or the forensics report's alternative: an
`sql_drop` event trigger writing into a durable table). Priced as an option; **not installed,
no decision made.**

## Verification

- **tsc probe:** injected `const __probe: number = 'y';` at the end of
  `rls-policy-drift.ts`; `npx tsc --noEmit` from `apps/web/` reported
  `scripts/audit/rls-policy-drift.ts(499,7): error TS2322: Type 'string' is not assignable to
  type 'number'.` — confirming the gate was live at that exact file/line. Probe deleted
  (including the extra trailing blank line the append created); re-run reported **0 errors**;
  `git status` confirmed clean of the probe.
- **Vitest, same reporter (`vitest run`, default reporter) before and after, measured by
  temporarily moving the new test file out and back rather than a worktree:**
  - Before (without `rls-policy-replay.test.ts`): 162 files (17 failed / 137 passed /
    8 skipped), 1806 tests (63 failed / 1679 passed / 61 skipped / 3 todo).
  - After (with it, full suite run twice to rule out the cold-cache flake this repo has hit
    before): 163 files (17 failed / 138 passed / 8 skipped), 1829 tests (63 failed /
    1702 passed / 61 skipped / 3 todo).
  - Delta: **+1 file passed, +23 tests passed, exactly the new suite. The same 63 pre-existing
    tests fail before and after — zero regressions.** (An intermediate run showed 18 failed
    files instead of 17 with an identical 63 failed *tests*; re-run confirmed 17/138 was
    stable and the extra failed-file count was a one-off, unrelated flaky file — the pattern
    this repo's memory already documents from quick-549/quick-565.)
- **DDL/DML grep, per the plan's exact pattern:**
  `grep -inE '\b(create|drop|alter)\s+(policy|table|index)|\b(insert|update|delete)\s+(into|from)\b' apps/web/scripts/audit/rls-policy-drift.ts`
  returns zero matches.
- `git diff --stat` confirms `EXEMPT_MODELS`, `getTenantPrisma`, and `lib/db/prisma.ts` are
  untouched by this task's commits.

## Deviations from plan

None — plan executed exactly as written, including stopping to cross-check every number
before populating the baseline (no divergence was found, so execution proceeded).

## What was deliberately not done

- The 59 missing policies were **not** rebuilt. They remain missing; rebuilding is a distinct,
  future task, and the plan explicitly scoped this task to the detector only.
- pgaudit was **not** installed. Availability and log-volume cost are priced above only.
- `RLS_AUDIT_DATABASE_URL` (or any other CI secret) was **not** created. The workflow is wired
  to use it and is currently inert, skipping with a notice.
- No lint gate exists in `apps/web` (documented pre-existing repo state, unrelated to this
  task — `next lint` no longer accepts `--dir` on this Next version and ESLint 9 finds no
  `eslint.config.js`). tsc remains the only gate that runs, and it was probed live as above.

## Files

- `apps/web/scripts/audit/rls-policy-replay.ts` (new)
- `apps/web/scripts/audit/rls-policy-drift.ts` (new)
- `apps/web/scripts/audit/rls-policy-baseline.json` (new)
- `apps/web/tests/security/rls-policy-replay.test.ts` (new)
- `apps/web/package.json` (modified — one script line added)
- `.github/workflows/rls-policy-drift.yml` (new)
- `docs/diagnostics/rls-policy-drift-detector.md` (new)
- `.planning/STATE.md` (modified — quick-585 row added)

## Commits

- `ffb8e845` — `feat(quick-585): pure RLS policy replay/diff library + Vitest coverage`
- `b4f8a8de` — `feat(quick-585): RLS policy drift runner, npm entry point, 67-entry baseline`
- `94cf6e50` — `docs(quick-585): CI wiring, credential-gap finding, pgaudit cost assessment`
- `cc86e4f7` — `docs(quick-585): point the STATE row at the commit`

## Self-Check: PASSED

- `apps/web/scripts/audit/rls-policy-replay.ts` — FOUND
- `apps/web/scripts/audit/rls-policy-drift.ts` — FOUND
- `apps/web/scripts/audit/rls-policy-baseline.json` — FOUND
- `apps/web/tests/security/rls-policy-replay.test.ts` — FOUND
- `.github/workflows/rls-policy-drift.yml` — FOUND
- `docs/diagnostics/rls-policy-drift-detector.md` — FOUND
- Commits `ffb8e845`, `b4f8a8de`, `94cf6e50`, `cc86e4f7` — all present in `git log --oneline`
