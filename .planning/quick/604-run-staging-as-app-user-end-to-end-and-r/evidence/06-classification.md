# quick-604 · 06 — classification and 456-attribution

Generated 2026-09-15T11:10:24.330Z. Membership is read from `scripts/audit/wrapper-countdown.json`
(generated 2026-09-15T10:44:42.584Z; {"unmigratedUnits":456,"unmigratedCallSites":459,"withTenantContextCallSites":0,"filesScanned":1691,"filesWithUnmigratedUnits":202}).

## The arithmetic check

| category | count |
|---|---|
| `TRIPWIRE_TC001` | 7 |
| `MISSING_GRANT` | 2 |
| `RLS_DENIAL_SATISFIABLE` | 0 |
| `RLS_DENIAL_NO_POLICY` | 0 |
| `SOMETHING_ELSE` | 4 |
| **SUM** | **13** |
| **failure count, derived independently from the verdict fields** | **13** |

`13 === 13` → **PASSES**.

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
| `/carrier/driver-pay/settlements` | surface | 500 | `SQLSTATE_UNRECOVERED` | **SOMETHING_ELSE** | unclassified code SQLSTATE_UNRECOVERED | `src/components/data-grid/core/useGridUrlState.ts:43` (`useGridUrlState`) | **OUTSIDE_456** |
| `/checklists/automation` | surface | 500 | `SQLSTATE_UNRECOVERED` | **SOMETHING_ELSE** | unclassified code SQLSTATE_UNRECOVERED | `src/components/data-grid/core/useGridUrlState.ts:43` (`useGridUrlState`) | **OUTSIDE_456** |

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
| `/carrier/driver-pay/settlements` | `src/components/data-grid/core/useGridUrlState.ts` | 43 | `useGridUrlState` | SOMETHING_ELSE |
| `/checklists/automation` | `src/components/data-grid/core/useGridUrlState.ts` | 43 | `useGridUrlState` | SOMETHING_ELSE |

---

## PASS 2 — re-derived, and two more red runs

The classification above is generated over the **merged** artefact (66 entries: 41 from pass 1, 25
from pass 2). Nothing was patched.

| | pass 1 only | both passes |
|---|---|---|
| `TRIPWIRE_TC001` | 7 | **7** |
| `MISSING_GRANT` | 2 | **2** |
| `RLS_DENIAL_SATISFIABLE` | 0 | **0** |
| `RLS_DENIAL_NO_POLICY` | 0 | **0** |
| `SOMETHING_ELSE` | 2 | **4** |
| SUM | 11 | **13** |
| derived failure count | 11 | **13** |
| OUTSIDE_456 | 9 | **11** |

Pass 2's two failures are **both the same root cause** — `nuqs` has no adapter outside the `(dev)`
route group — and both resolve to `src/components/data-grid/core/useGridUrlState.ts:43`. Two
surfaces, one site: `/carrier/driver-pay/settlements` and `/checklists/automation`.

`604-report-integrity.test.ts` grew a **check 5** block (pass-2 coverage, the SysAdmin session, and
"every `not-reachable` carries a stated reason and is never merged into pass or fail"), witnessed RED
two more ways:

**RED 4 — drop every `pass2:SysAdmin` row**, i.e. the "a whole portal with no verdict" failure:

```
 FAIL  check 5 > the pass-2 block ran and every listed surface produced a row
AssertionError: expected 19 to be 25 // Object.is equality
 FAIL  check 5 > every brief-named group has at least one row with a verdict
AssertionError: expected [ 'Settlements', 'Driver Pay', …(8) ] to include 'SysAdmin'
 FAIL  check 5 > the SysAdmin portal was exercised with a SYSADMIN session, not marked unreachable by default
 Test Files  1 failed (1)
      Tests  3 failed | 17 passed (20)
```

**RED 5 — blank one `not-reachable` row's reason**:

```
 FAIL  check 5 > every not-reachable row carries a stated reason and is never merged into pass or fail
AssertionError: expected 0 to be greater than 0
 Test Files  1 failed (1)
      Tests  1 failed | 19 passed (20)
```

**GREEN after both reverts:** `Tests 20 passed (20)`.
