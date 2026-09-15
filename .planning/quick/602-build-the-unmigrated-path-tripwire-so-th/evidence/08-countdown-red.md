# quick-602 step 5 — the countdown gate, PROVEN RED three ways

A guard asserted without a witnessed red is worthless (quick-549). Each breakage below was applied,
the run captured, then reverted and re-confirmed green.

Baseline green, before any breakage:

```
 ✓ tests/security/wrapper-migration-countdown.test.ts (11 tests) 159ms
 Test Files  1 passed (1)
      Tests  11 passed (11)
   Duration  7.34s (transform 364ms, setup 0ms, import 6.74s, tests 159ms)
```

Wall time is 7.34s, comfortably under the ~20s threshold at which the plan would have moved the
full-tree walk out of the test — so the walk stays in the test, where it can compare BOTH directions.

## RED (a) — one file's count decremented in the artefact

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/security/wrapper-migration-countdown.test.ts > wrapper-migration-countdown — the committed artefact matches the tree > totals are equal — a DECREASE fails too, which is the point
AssertionError: expected { unmigratedUnits: 456, …(4) } to deeply equal { unmigratedUnits: 455, …(4) }
 FAIL  tests/security/wrapper-migration-countdown.test.ts > wrapper-migration-countdown — the committed artefact matches the tree > the per-file, per-unit NAMES are equal in both directions
AssertionError: wrapper-migration-countdown: __tests__/security/tenant-header-forgery.test.ts drifted: expected { units: 5, callSites: 5, …(1) } to deeply equal { units: 4, callSites: 5, …(1) }
 Test Files  1 failed (1)
      Tests  2 failed | 9 passed (11)
```

## RED (b) — a new file under `src` with a bare `await getTenantPrisma()`

Added `src/lib/__602-red-b.ts`:

```ts
import { getTenantPrisma } from '@/lib/context/tenant-context';
export async function red602() {
  const prisma = await getTenantPrisma();
  return prisma.tag.count();
}
```

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/security/wrapper-migration-countdown.test.ts > wrapper-migration-countdown — the committed artefact matches the tree > totals are equal — a DECREASE fails too, which is the point
AssertionError: expected { unmigratedUnits: 457, …(4) } to deeply equal { unmigratedUnits: 456, …(4) }
 FAIL  tests/security/wrapper-migration-countdown.test.ts > wrapper-migration-countdown — the committed artefact matches the tree > the per-file, per-unit NAMES are equal in both directions
AssertionError: expected [ 'lib/__602-red-b.ts' ] to deeply equal []
 Test Files  1 failed (1)
      Tests  2 failed | 9 passed (11)
```

## RED (c) — the classifier's wrapper detection disabled

The ancestor check `if (ts.isCallExpression(p) && calleeText(p) === WRAPPER_NAME) wrapped = true;`
was deleted from `classifyFile`, so a WRAPPED acquisition is scored as unmigrated. This is what
proves the synthetic assertions DISTINGUISH the two shapes rather than passing vacuously:

```
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  tests/security/wrapper-migration-countdown.test.ts > wrapper-migration-countdown — the classifier recognises the MIGRATED shape > a wrapped acquisition contributes ZERO unmigrated units
AssertionError: expected [ { name: '(anonymous)', …(2) } ] to deeply equal []
 FAIL  tests/security/wrapper-migration-countdown.test.ts > wrapper-migration-countdown — the classifier recognises the MIGRATED shape > DISTINGUISHES the two — it does not simply report everything as unmigrated
AssertionError: expected 1 to be +0 // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 9 passed (11)
```

## GREEN again, after all three reverts

```
 ✓ tests/security/wrapper-migration-countdown.test.ts (11 tests) 145ms
 Test Files  1 passed (1)
      Tests  11 passed (11)
   Duration  7.27s (transform 346ms, setup 0ms, import 6.68s, tests 145ms, environment 0ms)
```

---

## Reconciliation against `docs/audits/wrapper-migration-scope.md`

The audit (2026-09-12) published **456 units / 198 files / 449 `await` call sites** over **1,694**
files. This classifier, today:

| figure | audit | here | agreement |
|---|---|---|---|
| unmigrated **units** | 456 | **456** | **exact** |
| files containing them | 198 | **202** | differs by 4 |
| call sites | 449 (`await …` occurrences) | **459** (all call EXPRESSIONS) | differs by 10 |
| files scanned | 1,694 | 1,689 | differs by 5 |

- **Units agree exactly**, which is the number that matters — the migration unit is the function.
- **Call sites differ by design.** The audit counted `await getTenantPrisma(…)` OCCURRENCES; this
  counts call expressions, awaited or not. The audit says so itself: *"456 exceeds 449 because a few
  functions acquire twice and the AST catches non-`await` forms a grep misses."* 459 − 449 = 10 is
  that set.
- **The file and corpus counts are NOT reconciled and are reported as such.** Both figures are
  4–5 apart in the same direction, which is consistent with the corpus itself having moved since
  2026-09-12 (quick-597 through quick-601 all touched `src`). The audit's analysis scripts live in a
  session scratchpad and were never committed ("Reproduction" section), so the difference cannot be
  attributed line by line without re-deriving their walker. Stated rather than smoothed into
  agreement.
- One of the 202 files is a **test** file (`__tests__/security/tenant-header-forgery.test.ts`,
  5 units). Excluding tests gives 201 files / 451 units. `src/__tests__` is inside `apps/web/src`, so
  it is in the audit's stated corpus too, and it is kept for that reason.

## Cross-reference with step 4 — the runtime signal's actual reach

Of the 23 distinct source files step 4 invoked, **4 appear in the countdown**, and between them they
account for **4 of 456 unmigrated units — 0.88 %**:

| file | units the countdown names |
|---|---|
| `app/api/cron/automations/route.ts` | `scheduleCronDrivenRule:133` |
| `app/api/cron/trip-reminders/route.ts` | `GET:58` |
| `app/api/cron/workflow-notifications/route.ts` | `GET:36` |
| `lib/automations/evaluator.ts` | `runEvaluator:56` |

**That 0.88 % is the honest measure of the runtime signal's reach**, and it is the whole argument for
keeping both instruments. The tripwire raised 12 times on real executions — but almost all of those
raises came from paths the countdown does **not** name, because they use the bare client rather than
an unwrapped `getTenantPrisma`. The two instruments see *different* populations, not the same
population at different resolutions.
