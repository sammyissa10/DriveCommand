# quick-604 · 06 — classification and 456-attribution

Generated 2026-09-15T10:38:39.604Z. Membership is read from `scripts/audit/wrapper-countdown.json`
(generated 2026-09-15T07:25:50.015Z; {"unmigratedUnits":456,"unmigratedCallSites":459,"withTenantContextCallSites":0,"filesScanned":1690,"filesWithUnmigratedUnits":202}).

## The arithmetic check

| category | count |
|---|---|
| `TRIPWIRE_TC001` | 7 |
| `MISSING_GRANT` | 2 |
| `RLS_DENIAL_SATISFIABLE` | 0 |
| `RLS_DENIAL_NO_POLICY` | 0 |
| `SOMETHING_ELSE` | 2 |
| **SUM** | **11** |
| **failure count, derived independently from the verdict fields** | **11** |

`11 === 11` → **PASSES**.

The failure count is derived as
`entries.filter(v === 'fail').length + writes.filter(v === 'SILENT_NO_OP' || v === 'REFUSED').length`,
never read from this file's own header.

## Every failure, one row each

| surface | source | HTTP | SQLSTATE | category | why | offending site | attribution |
|---|---|---|---|---|---|---|---|
| `/carrier/trips` | surface | 500 | `TC001` | **TRIPWIRE_TC001** | SQLSTATE is TC001 | `src/app/(owner)/carrier/trips/page.tsx:19` (`TripsPage`) | **OUTSIDE_456** |
| `/documents` | surface | 500 | `P2022` | **SOMETHING_ELSE** | unclassified code P2022 | `src/app/(driver)/documents/page.tsx:22` (`DriverDocumentsPage`) | **OUTSIDE_456** |
| `/api/cron/carrier-auto-dispatch` | surface | 500 | `SQLSTATE_UNRECOVERED` | **SOMETHING_ELSE** | unclassified code SQLSTATE_UNRECOVERED | `src/app/api/cron/carrier-auto-dispatch/route.ts:125` (`GET`) | **OUTSIDE_456** |
| `/api/cron/carrier-compliance-alerts` | surface | 500 | `P2010` | **MISSING_GRANT** | 42501 permission denied for schema public | `src/app/api/cron/carrier-compliance-alerts/route.ts:39` (`GET`) | **OUTSIDE_456** |
| `/api/cron/digest-compliance-30day` | surface | 500 | `TC001` | **TRIPWIRE_TC001** | SQLSTATE is TC001 | `src/app/api/cron/digest-compliance-30day/route.ts:62` (`GET`) | **OUTSIDE_456** |
| `/api/cron/digest-daily-driver` | surface | 500 | `TC001` | **TRIPWIRE_TC001** | SQLSTATE is TC001 | `src/app/api/cron/digest-daily-driver/route.ts:62` (`GET`) | **OUTSIDE_456** |
| `/api/cron/digest-weekly-owner` | surface | 500 | `TC001` | **TRIPWIRE_TC001** | SQLSTATE is TC001 | `src/app/api/cron/digest-weekly-owner/route.ts:62` (`GET`) | **OUTSIDE_456** |
| `/api/cron/purge-deleted` | surface | 500 | `TC001` | **TRIPWIRE_TC001** | SQLSTATE is TC001 | `src/app/api/cron/purge-deleted/route.ts:51` (`GET`) | **OUTSIDE_456** |
| `/api/cron/send-reminders` | surface | 500 | `TC001` | **TRIPWIRE_TC001** | SQLSTATE is TC001 | `src/lib/notifications/check-upcoming-maintenance.ts:31` (`findUpcomingMaintenance`) | **OUTSIDE_456** |
| `/api/cron/trip-reminders` | surface | 500 | `TC001` | **TRIPWIRE_TC001** | SQLSTATE is TC001 | `src/app/api/cron/trip-reminders/route.ts:74` (`GET`) | **IN_456_FILE_ONLY** |
| `/api/cron/workflow-notifications` | surface | 500 | `42501` | **MISSING_GRANT** | 42501 permission denied for table PlaybookNotification | `src/app/api/cron/workflow-notifications/route.ts:146` (`GET`) | **IN_456_FILE_ONLY** |

## Live policy queries (what makes categories 3 and 4 reproducible)

No finding reached categories 3 or 4, so no policy query was needed. The distinction is not asserted where it was not tested.



## OUTSIDE_456 — the finding

| surface | file | line | function | category |
|---|---|---|---|---|
| `/carrier/trips` | `src/app/(owner)/carrier/trips/page.tsx` | 19 | `TripsPage` | TRIPWIRE_TC001 |
| `/documents` | `src/app/(driver)/documents/page.tsx` | 22 | `DriverDocumentsPage` | SOMETHING_ELSE |
| `/api/cron/carrier-auto-dispatch` | `src/app/api/cron/carrier-auto-dispatch/route.ts` | 125 | `GET` | SOMETHING_ELSE |
| `/api/cron/carrier-compliance-alerts` | `src/app/api/cron/carrier-compliance-alerts/route.ts` | 39 | `GET` | MISSING_GRANT |
| `/api/cron/digest-compliance-30day` | `src/app/api/cron/digest-compliance-30day/route.ts` | 62 | `GET` | TRIPWIRE_TC001 |
| `/api/cron/digest-daily-driver` | `src/app/api/cron/digest-daily-driver/route.ts` | 62 | `GET` | TRIPWIRE_TC001 |
| `/api/cron/digest-weekly-owner` | `src/app/api/cron/digest-weekly-owner/route.ts` | 62 | `GET` | TRIPWIRE_TC001 |
| `/api/cron/purge-deleted` | `src/app/api/cron/purge-deleted/route.ts` | 51 | `GET` | TRIPWIRE_TC001 |
| `/api/cron/send-reminders` | `src/lib/notifications/check-upcoming-maintenance.ts` | 31 | `findUpcomingMaintenance` | TRIPWIRE_TC001 |

---

> **This section is appended by hand.** `604-classify.ts` rewrites everything above it on every run,
> so re-running the classifier deletes anything added there. (It did, once, in this task.)

## The three witnessed RED runs

`604-report-integrity.test.ts` was proven to fail three ways before it was accepted green. Each
mutation was applied, the suite run, and the mutation reverted.

**RED 1 — decrement one category count in `06-classification.json`** (check 2):

```
 FAIL  tests/security/604-report-integrity.test.ts > check 2 — the five category counts SUM to the failure count > the failure count derived independently equals the category sum
AssertionError: expected 10 to be 11 // Object.is equality
 FAIL  tests/security/604-report-integrity.test.ts > check 2 — the five category counts SUM to the failure count > every finding carries exactly one of the five categories
AssertionError: expected 11 to be 10 // Object.is equality
 Test Files  1 failed (1)
      Tests  2 failed | 14 passed (16)
```

**RED 2 — blank one `OUTSIDE_456` entry's `file` field** (check 3):

```
 FAIL  tests/security/604-report-integrity.test.ts > check 3 — every OUTSIDE_456 entry names a file and a line > every entry has a non-empty file and an integer line
AssertionError: expected 0 to be greater than 0
 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
```

**RED 3 — truncate `OWNER_SURFACES` in `604-click-through.ts` to one entry** (check 4):

```
 FAIL  tests/security/604-report-integrity.test.ts > check 4 — the surface list and the cron enumeration, by source scan > the named surface list has at least 25 entries
AssertionError: expected 6 to be greater than or equal to 25
 Test Files  1 failed (1)
      Tests  1 failed | 15 passed (16)
```

(6 = the one surviving owner surface + the five driver surfaces — the driver list was untouched.)

**GREEN, after all three reverts:**

```
 Test Files  1 passed (1)
      Tests  16 passed (16)
```

## Reading the attribution table honestly

Three caveats, stated rather than smoothed over.

1. **The recovered site is the deepest `src/**.ts(x):line` frame in the correlated log slice**, with
   `lib/logger.ts` and `lib/cron/failure-report.ts` skipped — those are where the error was
   *recorded*, not where the statement was *issued*. For the cron routes that swallow and log, the
   deepest surviving frame is the route's own `await`; a helper inlined into a Turbopack chunk has no
   `src` frame at all. So a site is the truest available attribution, not necessarily the innermost.
   Three were spot-checked against the source by hand and all three are genuine issuing sites:
   `carrier/trips/page.tsx:19` (`prisma.carrierDriver.findMany` on the bare client),
   `digest-compliance-30day/route.ts:62` (`prisma.$extends(withTenantRLS(...)).user.findMany`),
   `purge-deleted/route.ts:51` (`model.deleteMany` on the bare client).
2. **The frame regex must admit parentheses in the path.** Every App Router page lives under a route
   group — `src\app\(owner)\carrier\trips\page.tsx` — and a `[^\s):]` path class silently matches
   nothing for all of them. The failure mode is `SITE_UNRECOVERED`, which *looks* like an honest
   "could not tell" rather than a bug. It was caught by noticing that the two page failures had no
   frames while every cron failure did.
3. **`IN_456_FILE_ONLY` is never rounded up to `IN_456`.** Two findings land there —
   `trip-reminders/route.ts:74` and `workflow-notifications/route.ts:146` — both in files the 456
   scan knows, at lines it does not.

## A note on categories 3 and 4

**Neither fired**, so no live policy query was needed and the 3-vs-4 distinction is **not asserted
here**. That is a real outcome, not a gap in the procedure: the only RLS-shaped denials this run
produced were `TC001` (which outranks them by construction — the tripwire fires *before* a policy is
consulted) and two plain `42501 permission denied`, which is a **grant** failure, not a policy one.
The procedure for 3 vs 4 is implemented and would have run; it had nothing to run on.
