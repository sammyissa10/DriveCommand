# 06 — Task 6: the witnessed RED runs

**A guard asserted without a witnessed red is not a guard** (quick-549). Every test added by
quick-603 was proven to fail against the pre-fix code before being accepted as green.

## Method

The twelve fixed route files were restored to the plan commit and the whole `tests/cron/` directory
was run against them. `src/lib/cron/failure-report.ts` was deliberately **left in place** — the
contract's own unit tests import it directly, and deleting it would have produced an import error
instead of the assertion failures that are the point.

```
$ for r in automations carrier-auto-dispatch carrier-compliance-alerts cleanup-quarantine \
           digest-compliance-30day digest-daily-driver digest-weekly-owner purge-deleted \
           send-reminders trip-reminders workflow-digest workflow-notifications; do
    git checkout bf3b921c -- "apps/web/src/app/api/cron/$r/route.ts"
  done
$ cd apps/web && npx vitest run tests/cron/
…
$ git checkout HEAD -- apps/web/src/app/api/cron/     # restored
```

## The result: 11 of 11 files red, 48 of 56 tests red

```
 Test Files  11 failed (11)
      Tests  48 failed | 8 passed (56)
```

**Every one of the eleven test files went red.** The 8 that stayed green are the ones that *should*
have: the five pure `CronFailures` unit tests (the contract module was not reverted), the
"cron directory still holds exactly the routes this guard names" enumeration, the CLEAN-routes
counter-assertion, and `purge-deleted`'s 401 test — authentication was never broken, so a test that
claimed it was would be the wrong kind of assertion.

## Verbatim — the source guard

```
 ❯ tests/cron/cron-failure-contract.test.ts (20 tests | 13 failed) 101ms
     ✓ `ok` is a getter over the count, so it cannot be set true beside a failure 8ms
     ✓ names a failure with a real message, and carries a code when the error has one 2ms
     ✓ caps the LIST but never the COUNT, and says so when the cap bites 10ms
     ✓ does not claim truncation when the cap did not bite 1ms
     ✓ describeError never renders a container as [object Object] 0ms
     ✓ the cron directory still holds exactly the routes this guard names 1ms
     × automations computes its success flag rather than writing a literal 15ms
     × carrier-auto-dispatch computes its success flag rather than writing a literal 9ms
     × carrier-compliance-alerts computes its success flag rather than writing a literal 5ms
     × cleanup-quarantine computes its success flag rather than writing a literal 4ms
     × digest-compliance-30day computes its success flag rather than writing a literal 4ms
     × digest-daily-driver computes its success flag rather than writing a literal 3ms
     × digest-weekly-owner computes its success flag rather than writing a literal 4ms
     × purge-deleted computes its success flag rather than writing a literal 4ms
     × send-reminders computes its success flag rather than writing a literal 5ms
     × trip-reminders computes its success flag rather than writing a literal 5ms
     × workflow-digest computes its success flag rather than writing a literal 5ms
     × workflow-notifications computes its success flag rather than writing a literal 5ms
     × purge-deleted no longer erases a failure from its total 3ms
     ✓ the CLEAN routes are left alone — their literals are on paths that cannot have failed 2ms
```

```
AssertionError: expected 'import { NextRequest } from \'next/se…' not to contain 'filter(n => n > 0)'
 ❯ tests/cron/cron-failure-contract.test.ts:178:21
```

## Verbatim — the injection tests, one file each

```
 ❯ tests/cron/purge-deleted.test.ts (4 tests | 3 failed) 1453ms
 ❯ tests/cron/carrier-auto-dispatch.test.ts (3 tests | 3 failed) 1468ms
 ❯ tests/cron/workflow-notifications.test.ts (3 tests | 3 failed) 1474ms
 ❯ tests/cron/trip-reminders.test.ts (2 tests | 2 failed) 1555ms
 ❯ tests/cron/automations.test.ts (3 tests | 3 failed) 1400ms
 ❯ tests/cron/send-reminders.test.ts (3 tests | 3 failed) 1741ms
 ❯ tests/cron/workflow-digest.test.ts (3 tests | 3 failed) 1716ms
 ❯ tests/cron/cleanup-quarantine.test.ts (3 tests | 3 failed) 1744ms
 ❯ tests/cron/digests.test.ts (9 tests | 9 failed) 1851ms
 ❯ tests/cron/carrier-compliance-alerts.test.ts (3 tests | 3 failed) 1852ms
```

Selected assertion failures, verbatim:

```
AssertionError: status must report the failure: expected 200 to be 500
 ❯ Module.expectFailureReported tests/cron/_cron-test-kit.ts:92:52
 ❯ tests/cron/automations.test.ts:75:5

AssertionError: expected true not to be true            <- `ok: true` beside a non-zero `failed`
 ❯ tests/cron/automations.test.ts:98:25

AssertionError: expected { success: true, scanned: 4, …(2) } to match object { scanned: 4, deleted: 4, …(2) }
 ❯ tests/cron/cleanup-quarantine.test.ts:88:18

AssertionError: expected undefined to be +0             <- no `failureCount` key at all
 ❯ tests/cron/carrier-auto-dispatch.test.ts:117:31
```

## The `[object Object]` assertion, proven red IN ISOLATION

**This one needed a dedicated test, and noticing that is the point.** In the combined test,
`expectFailureReported` runs before `expectNamedInLog`, so on pre-fix code the status assertion fails
first and the RED run never reaches the log assertion — it would have been asserted but never
witnessed red. A separate `it` that asserts *nothing but the log* fixes that.

```
$ # GREEN, against the fixed route
 ✓ tests/cron/purge-deleted.test.ts (5 tests | 4 skipped) 419ms
     ✓ logs the real error in slot 2, never `[object Object]`  418ms

$ git checkout bf3b921c -- apps/web/src/app/api/cron/purge-deleted/route.ts
$ # RED, against the pre-fix route
 ❯ tests/cron/purge-deleted.test.ts (5 tests | 1 failed | 4 skipped) 410ms
     × logs the real error in slot 2, never `[object Object]` 408ms

 FAIL  tests/cron/purge-deleted.test.ts > cron/purge-deleted — injection
       > logs the real error in slot 2, never `[object Object]`
AssertionError: no logger.error call carried the injected error in slot 2. Calls were:
  [["[CRON] purge-deleted: Failed to purge CarrierContract","object","[object Object]"]]
  : expected 0 to be greater than 0
 ❯ Module.expectNamedInLog tests/cron/_cron-test-kit.ts:76:5
 ❯ tests/cron/purge-deleted.test.ts:115:5
```

**The failure message prints the defect literally**: the second argument to `logger.error` was an
`object` whose rendered value is `[object Object]`. That string is the whole of quick-602's finding,
reproduced in a test.

## The survivor assertion (finishing check 2), per route, by test name

Assertion 3 in every file counts the mocked downstream calls and demands **M**, never 1 and never 2.

| route | M | what is counted | test |
|---|---|---|---|
| `purge-deleted` | 7 | `deleteMany` per model | *reports the failure … and keeps the survivors in the total* |
| `send-reminders` | 4 | `dispatchNotification` | *reports the failure, names the truck, and STILL dispatches the other M-1 items* |
| `send-reminders` (tenant) | 3 | `findUpcomingMaintenance` | *counts and NAMES a whole lost tenant …* |
| `digest-daily-driver` | 5 | `buildDailyDriverPayload` | *reports the failure, names the recipient, and STILL builds all M payloads* |
| `digest-weekly-owner` | 5 | `buildWeeklyOwnerPayload` | same |
| `digest-compliance-30day` | 5 | `buildCompliance30DayPayload` | same |
| `cleanup-quarantine` | 4 | `DeleteObjectCommand` sends | *reports the failure, names the object key, and STILL attempts all M deletes* |
| `carrier-auto-dispatch` | 4 | `generateDispatches` | *reports the failure, names the template, and STILL generates for the other M-1* |
| `carrier-compliance-alerts` | 4 | `getComplianceAlerts` | *COUNTS the lost tenant … and STILL processes the other M-1* |
| `trip-reminders` | 4 | `getTenantPrismaForOrg` | *reports the failure, names the tenant, and STILL reminds the other M-1* |
| `workflow-notifications` | 5 | `sendStepOverdue` | *reports a failed ITEM, names the step, and STILL sends the other M-1* |
| `workflow-digest` | 4 | `sendEmail` | *COUNTS a failed recipient email … and STILL emails the other M-1* |
| `automations` | 16 (4 tenants × 4 rules) | `getTenantPrismaForOrg` | *COUNTS a failed scheduling … and STILL schedules the rest* |

**A test that only asserted the response reports a failure would not discharge this**, which is why
each one asserts the mocked downstream call COUNT as well as the success counter.

## One decision recorded, per the plan's instruction to pick one and be consistent

**The cron secret is the REAL guard, never a mock.** `verifyCronSecret` reads
`process.env.CRON_SECRET` at call time and hashes both sides, so `cronRequest()` sets the env var and
builds a matching `Bearer` header. A mocked `@/lib/security/cron-auth` would let a route whose
authentication had been broken still pass every test in this directory. Doing it identically in all
eleven files also means there is one place to look when one of them unexpectedly 401s.

## Every failure is INJECTED

There is no local database (DEC-3) and production is never written. Every failure above is a rejected
promise from a `vi.fn()` at a module boundary. **Nothing in `tests/cron/` opens a connection.**
