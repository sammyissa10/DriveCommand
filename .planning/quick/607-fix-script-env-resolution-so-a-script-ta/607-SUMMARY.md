# quick-607 — SUMMARY

Fix the audit and script environment resolution so a script targets the database the operator
intends. Full technical record: `docs/audits/script-connection-resolution.md`.

## What was wrong

`apps/web/scripts/_bootstrap-env.ts:53-55` set `DATABASE_URL = DIRECT_URL` unconditionally, and
every env file points `DIRECT_URL` at production. Two audits recorded consequences separately
(`app-user-failure-remediation.md` §8 item 8 — a false measurement; `phase-0-verification-gates.md`
— a production-write hazard). Both are the same line. What made them dangerous was neither: a
script could print `RESULT: CLEAN` without ever saying which database produced it.

## 1. Census — 4 importers, not 27

`_bootstrap-env` is NAMED in 27 files and IMPORTED by four. The other 23 mention it in prose while
building their own `STAGING_*` pools — the quick-602 grep-vs-AST shape, exposure overstated 6×.

| script | writes? | targeted before |
|---|---|---|
| `scripts/audit/rls-policy-drift.ts` | no (`SELECT` on `pg_catalog`) | production always |
| `scripts/audit/app-user-connection-harness.ts` | no (DML inside `BEGIN`/`ROLLBACK`, never commits) | production always |
| **`scripts/test-extraction.ts`** | **YES** — `document_imports`, `document_import_pages` | production always |
| **`scripts/test-pdf-import.ts`** | **YES** — same, plus R2 puts | production always |

**The writers are `test-extraction.ts` and `test-pdf-import.ts`.** Both were one plain command from
writing to production. Two further bare-`DATABASE_URL` writers (`tests/security/db-fixture-setup.ts`,
`tests-db/rls-isolation/env.ts`) do not import the bootstrap and already carry quick-598's own
production refusal.

## 2. The rule

Honour an explicitly-set `DATABASE_URL`; fall back to `DIRECT_URL` only when nothing was pinned.
"Explicitly set" = present before any dotenv load, captured at module top — dotenv is
non-overriding, so the distinction exists only before the first load.

Five rungs: both pinned same project → pinned `DIRECT_URL` (port fix preserved) · both pinned
different projects → **REFUSE** · only `DATABASE_URL` → verbatim · only `DIRECT_URL` → it · nothing
→ file `DIRECT_URL` then file `DATABASE_URL`.

**Nothing breaks.** Every existing caller lands on rung 5, the historical behaviour. The "pin both"
workaround lands on rung 1. CI lands on rung 3 and now works for a principled reason rather than a
quirk. Rung 2 is the only new refusal and fires only on operator error.

## 3. The banner — quoted from a real run

```
[db-target] script   : rls-policy-drift.ts
[db-target] project  : wyixpgunnjmzguhggocz (staging)
[db-target] host     : aws-0-us-west-1.pooler.supabase.com:5432
[db-target] role     : postgres
[db-target] resolved : explicit DATABASE_URL
[db-target] intent   : read-only
```

stderr, not stdout — `--json` payloads pipe into `jq` (quick-585).

## 4. The guard

**A script declares itself READ-ONLY by importing `_bootstrap-env-readonly`. Everything else is a
writer.** Forgetting is therefore safe: an undeclared script refuses production loudly. The inverse
default cannot work — the failure mode of forgetting would be a silent production write.

Frozen by `tests/security/script-db-target-guard.test.ts` (31 tests): census equality both
directions, the default asserted to be `writes`, the literal defect asserted absent, `DIRECT_URL`
asserted never reassigned. All proven red before being trusted.

## 5. Proofs

| proof | result |
|---|---|
| old rule, staging pinned | resolved `oqdhberkghtnszrkdvfm` (**PRODUCTION**) |
| new rule, staging pinned | resolved `wyixpgunnjmzguhggocz` (staging), `RESULT: CLEAN`, exit 0 |
| writer at production, no flag | `REFUSING TO RUN`, **exit 1**, password masked, ref visible |
| guard flipped / writer moved | 1 and 2 tests fail respectively; green on restore |

## 6. Which prior claims are suspect

**None found.** Measured the divergence window off `_prisma_migrations`: aligned before
2026-09-15 05:22Z, **diverged 05:22Z → 19:41:51Z**, aligned again after.

- **quick-602 and quick-606** ran inside the diverged window and reported **0 definition drift** —
  which production could not have produced, since it lacked `20260914180000` and its `Tag` bodies
  differed. Confirmed staging by an independent signal, not by their label.
- **quick-595** specified the unsafe invocation in its plan, **caught it at execution time**, pinned
  both, and documented the correction. It is the origin of the "pin both" convention.
- **quick-597 / 598 / 599 / 600** all quote both variables pinned, and ran while the databases were
  aligned anyway.

What *is* weakened is provenance, not numbers: every pre-607 transcript records what was measured
and not where. From now on each carries its own `[db-target] project :` line.

## 7. Gates

| gate | result |
|---|---|
| `npm run build` | **exit 0** |
| `npx tsc --noEmit` | **exit 0**, probed — injected `TS2322` in `_db-target.ts` reported at the injected line, probe removed, re-run clean |
| full suite, same JSON reporter both sides | BEFORE 2114 tests / 65 failed · AFTER 2145 / 66. **+31 = exactly the new test file** |
| failing-file set | **deterministic set identical both directions (18 files)**. The only differences are four real-DB carrier suites, demonstrated flaky **at HEAD** with no changes (one run: file failed, all 22 tests passed — the quick-546 teardown-FK shape) |
| `npx eslint` | **NOT RUN, NOT CLAIMED** — `apps/web` has no working lint entry point (quick-562) |

Unrelated docs search-index regeneration reverted so the diff stays honest, as quick-606 did.

## 8. Incident — production was written, by me

Demonstrating the `--allow-production` escape hatch, I ran `test-extraction.ts` against production
with the flag, twice: 2 `document_imports` + 8 `document_import_pages` rows. Nothing committed, no
pre-existing record touched, no R2 objects. All 10 rows deleted; back to the pre-existing count of
26 with zero orphans. The guard itself was correct — the plain invocation refused with exit 1.

**Do not run a writer with `--allow-production` to demonstrate `--allow-production`.** The banner
alone was sufficient evidence. Full detail: `evidence/05-production-write-incident.md`.

## 9. Deliberately not done

Did not unify the 26 files hardcoding the production ref (they all agree; rewriting 26 files is
risk without benefit — recorded, not hidden). Did not de-privilege `DIRECT_URL`. Did not change
what any script does beyond resolution and the guard. Installed nothing.
