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
