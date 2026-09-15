# 07 — Task 6: the suite baseline, before and after

## Method, and why it is not a worktree

The plan is explicit and quick-567 is the reason: **a `git worktree` does not carry
`apps/web/.env.local`**, which is untracked and gitignored, so DB-dependent tests behave differently
there and the skew reads as a regression. The baseline was therefore measured **in the main tree**,
with this task's source changes checked out to the plan commit and then restored:

```
$ git checkout bf3b921c -- apps/web/src
$ rm -f apps/web/src/lib/cron/failure-report.ts    # `checkout <rev> -- path` leaves files
$ rmdir apps/web/src/lib/cron                      #   that did not exist at that rev
$ cd apps/web && npx vitest run --reporter=json --outputFile=…/before.json
$ cd ../.. && git checkout HEAD -- apps/web/src
```

**Same reporter both sides — `--reporter=json`.** `--reporter=basic` does not exist in vitest 4 and
exits 0 having run ZERO tests (quick-557); `--silent` and `--reporter=json` disagree by ±4 on this
suite (quick-565). No `next dev` was running: `netstat` showed no listener on 3000/3001 before the
run.

Both runs used vitest 4.0.18 on the same machine, back to back.

## The numbers

| | BEFORE (`bf3b921c`) | AFTER (quick-603 complete) | delta |
|---|---|---|---|
| total tests | 1990 | **2047** | **+57** |
| passed | 1871 | **1928** | **+57** |
| failed | **64** | **64** | **0** |
| pending | 52 | 52 | 0 |
| distinct test files | 165 | 176 | +11 |
| **failing FILES** | **18** | **18** | **0** |

+57 is exactly the number of tests quick-603 added (56 in the eleven `tests/cron/` files, plus the
isolated `[object Object]` assertion added afterwards).

**A note on the repo's recorded baseline.** The plan records "~64 failing files / ~1,990 tests as of
quick-602". 1,990 is right; **64 is the failing TEST count, not the failing FILE count** — the file
count is 18. Recorded rather than adopted.

## The failing FILE set — compared by name, not by count

Identical, both directions, 18 files:

```
src/__tests__/workflows-complete-step.test.ts
src/__tests__/workflows-dispatch-enforcement.test.ts
src/__tests__/workflows-fail-inspection.test.ts
src/__tests__/workflows-fire-event.test.ts
src/__tests__/workflows-instance.test.ts
src/__tests__/workflows-trigger-router.test.ts
src/app/api/driver-pay/__tests__/settlements-paid.test.ts
src/lib/driver-pay/__tests__/exporters/adp.golden.test.ts
src/lib/driver-pay/__tests__/exporters/generic-csv.golden.test.ts
src/lib/driver-pay/__tests__/exporters/gusto.golden.test.ts
src/lib/driver-pay/__tests__/exporters/quickbooks.golden.test.ts
src/server/api/routers/workflows/__tests__/playbook.test.ts
src/server/api/routers/workflows/__tests__/stepTemplate.test.ts
tests/security/rls-policy-replay.test.ts
tests/unit/auth/require-auth.test.ts
tests/unit/auth/require-role.test.ts
tests/unit/auth/validate-mobile-token.test.ts
tests/unit/validation/schemas.test.ts
```

**Set difference: EMPTY in both directions.**

## The failing TEST set — also compared by name

A file-set comparison alone would miss a test swapping places inside an already-failing file, which
is exactly what happened here on the first pass. Compared per test:

```
NEWLY FAILING (existed before and passed): 0
FIXED (failed before, passes now):         0
FAILING AND BRAND NEW (added by this task): 0
```

## TWO REGRESSIONS WERE FOUND BY THIS COMPARISON AND BOTH WERE FIXED. NEITHER WAS SWEPT UP.

Recording them because "the counts matched" would have been a false report on the first two passes.

### Regression 1 — `tests/security/wrapper-migration-countdown.test.ts` (a NEW failing file)

The first AFTER run had **19** failing files, one more than BEFORE, and the extra one was not a file
this task added. quick-602's countdown guard asserts that the committed artefact
`scripts/audit/wrapper-countdown.json` equals what its classifier computes over the tree right now —
totals **and** per-file, per-unit names.

```
-   "filesScanned": 1689,
+   "filesScanned": 1690,
-     "scheduleCronDrivenRule:133",
+     "scheduleCronDrivenRule:164",
```

Cause: quick-603 added one file (`src/lib/cron/failure-report.ts`) and inserted lines above three
functions. **The regeneration was the sanctioned path, not a weakened guard** — the guard's own
header states it "forces the number down in a reviewable diff, in the same commit as the work", so
refreshing the artefact alongside the work is what it is for. The full diff of the regenerated
artefact was inspected before accepting it:

| field | before | after |
|---|---|---|
| `unmigratedUnits` | 456 | **456** |
| `unmigratedCallSites` | 459 | **459** |
| `withTenantContextCallSites` | 0 | **0** |
| `filesWithUnmigratedUnits` | 202 | **202** |
| `filesScanned` | 1689 | 1690 |

**Every count the countdown exists to protect is byte-identical.** Nothing entered or left the
unmigrated set, the anti-vacuity counter is unchanged, and the new file was classified as having zero
unmigrated units — correct, it touches no database. The only other changes are `generatedAt` and
three moved line numbers.

### Regression 2 — one test flipped INSIDE an already-failing file

After regenerating the artefact the file counts matched at 18/18, but failing TESTS were 65 vs 64.
The per-test diff named it:

```
NEWLY FAILING (existed before and passed): 1
  ! src/__tests__/workflows-fire-event.test.ts ::
      fireEvent — match/skip behavior (Phase 4 DoD test 1)
      does NOT call generatePlaybookInstance when entityData does not match conditions
```

**This is the check the plan warned about**: a file-set comparison would have called it clean.
Cause, run in isolation:

```
Error: [vitest] No "serializeError" export is defined on the "@/lib/logger" mock.
       Did you forget to return it from "vi.mock"?
```

Task 5 added `serializeError` to `fireEvent.ts`'s logger import. Twelve test files mocked
`@/lib/logger` with a factory returning only `{ logger: … }`, which REPLACES the module rather than
extending it, so any subject importing anything else from it now throws.

**The fix was to the mocks, and it is not a suppression.** No assertion was touched; the mock stopped
hiding a real export. Each now spreads the actual module — the pattern
`src/lib/notifications/__tests__/in-app-failure-visibility.test.ts` already used — so the next export
added to `@/lib/logger` will not break them again:

```diff
-vi.mock('@/lib/logger', () => ({
-  logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
-}));
+vi.mock('@/lib/logger', async (importOriginal) => {
+  const actual = await importOriginal<typeof import('@/lib/logger')>();
+  return {
+    ...actual,
+    logger: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
+  };
+});
```

Twelve files patched. Afterwards **every** `vi.mock('@/lib/logger')` in the repo either spreads the
real module or supplies `serializeError` explicitly — verified by grep.

**Note for the record:** five of the six tests in `workflows-fire-event.test.ts` were failing
*before* quick-603 for an unrelated reason, and still are. The file was in the failing set on both
sides; only the sixth test flipped. That is precisely why the count was the only signal.

## `npm run build`

```
$ cd apps/web && rm -rf .next && npm run build
…
ƒ Proxy (Middleware)
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
BUILD EXIT=0
```

## `tsc --noEmit`, probed three times

```
$ npx tsc --noEmit        # clean
```

Probed after Task 3 (`src/app/api/cron/purge-deleted/route.ts` → TS2322 reported), after Task 5
(`src/server/services/workflows/notifications.ts` → TS2322 reported) and after Task 6
(`tests/cron/purge-deleted.test.ts` → TS2322 reported). Every probe went into a file the
corresponding task had **actually edited**, and every probe was deleted afterwards.

## Lint

**`apps/web` has no working lint entry point** (quick-562): `next lint` no longer accepts `--dir` on
this Next version and ESLint 9 finds no `eslint.config.js` (the repo still has `.eslintrc.*`).
Reported rather than claimed — tsc is the only gate that actually runs.

## Nothing installed, no DDL

```
$ git diff --name-only bf3b921c..HEAD | grep -E "package(-lock)?\.json|prisma/(migrations|schema)"
(no output)
```
