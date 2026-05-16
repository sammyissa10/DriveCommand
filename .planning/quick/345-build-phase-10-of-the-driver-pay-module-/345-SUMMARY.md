---
phase: quick
plan: 345
subsystem: driver-pay-reports
tags: [driver-pay, reporting, csv-export, rbac, vitest]
dependency_graph:
  requires: [driver-pay-phases-1-9, reporting.ts, reporting-predicate.ts]
  provides: [7-aggregation-helpers, 7-api-routes, 11-ui-components, 4-test-files]
  affects: [carrier/driver-pay/reports page, driver-pay API surface]
tech_stack:
  added: [ReadableStream CSV streaming]
  patterns: [fetch+useState client components, streamCsvResponse, describe.each RBAC tests]
key_files:
  created:
    - apps/web/src/lib/driver-pay/reports/csv-stream.ts
    - apps/web/src/lib/driver-pay/reports/accessorial-spend.ts
    - apps/web/src/lib/driver-pay/reports/load-profitability.ts
    - apps/web/src/lib/driver-pay/reports/component-type-breakdown.ts
    - apps/web/src/lib/driver-pay/reports/overtime-exposure.ts
    - apps/web/src/lib/driver-pay/reports/override-audit.ts
    - apps/web/src/lib/driver-pay/reports/deduction-balances.ts
    - apps/web/src/lib/driver-pay/reports/settlement-history.ts
    - apps/web/src/lib/driver-pay/reports/index.ts
    - apps/web/src/app/api/driver-pay/reports/accessorial-spend/route.ts
    - apps/web/src/app/api/driver-pay/reports/load-profitability/route.ts
    - apps/web/src/app/api/driver-pay/reports/component-type/route.ts
    - apps/web/src/app/api/driver-pay/reports/overtime-exposure/route.ts
    - apps/web/src/app/api/driver-pay/reports/override-audit/route.ts
    - apps/web/src/app/api/driver-pay/reports/deduction-balances/route.ts
    - apps/web/src/app/api/driver-pay/reports/settlement-history/route.ts
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/ReportTabNav.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/BigNumberHero.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/CsvExportButton.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/ReportTableSkeleton.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/AccessorialSpendReport.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/LoadProfitabilityReport.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/ComponentTypeReport.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/OvertimeExposureReport.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/OverrideAuditReport.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/DeductionBalancesReport.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/SettlementHistoryReport.tsx
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/format.ts
    - apps/web/src/lib/driver-pay/__tests__/reports-aggregation.test.ts
    - apps/web/src/lib/driver-pay/__tests__/reports-csv-streaming.test.ts
    - apps/web/src/lib/driver-pay/__tests__/reports-tenant-isolation.test.ts
    - apps/web/src/lib/driver-pay/__tests__/reports-rbac.test.ts
  modified:
    - apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx
decisions:
  - "CarrierLoad tenant FK is orgId not tenantId — computeLoadProfitability uses orgId in where clause"
  - "For CSV export on large datasets (profitability, settlement-history, overtime, override-audit), used pageSize:100_000 approach. Phase 11 should add cursor-based streaming if needed."
  - "computeSettlementHistory calls computeRollingAvgNetPay per row — test mock accounts for the N+1 findMany calls this generates"
  - "ReportTabNav is 'use client' (needs useSearchParams for querystring preservation)"
  - "page.tsx conditionally computes Overview data only when tab=overview to avoid unnecessary server queries on other tabs"
metrics:
  duration: 2h
  completed: 2026-05-16
  tasks: 4
  files: 33
---

# Phase 345: Driver Pay Phase 10 — Read-Only Admin Reporting Dashboard

Driver Pay Phase 10: 8-tab reporting dashboard with BigNumberHero, streaming CSV export, and RBAC — giving carrier owners a fast operational view of accessorial spend, per-load profitability, component-type mix, overtime exposure, override audit trail, deduction balances, and full settlement history.

## Helpers Exported (7 + 1 utility)

- `streamCsvResponse(headers, rows, filename)` — ReadableStream CSV, header-first, no buffering
- `computeAccessorialSpend` — ACCESSORIAL components grouped by client, with prior-period delta
- `computeLoadProfitability` — per-load revenue minus driver pay, paginated + sortable
- `computeComponentTypeBreakdown` — grouped by componentType with % of total
- `computeOvertimeExposure` — OVERTIME components with driver/load join, paginated
- `computeOverrideAudit` — LoadDriverAssignment overrideReason rows + dispatcher summary
- `computeDeductionBalances` — FIXED_INSTALLMENTS deductions with remaining (point-in-time)
- `computeSettlementHistory` — all-status settlements paginated with anomaly flag

## Routes Added (7)

| Route | Method | RBAC | CSV |
|-------|--------|------|-----|
| `/api/driver-pay/reports/accessorial-spend` | GET | OWNER/MANAGER/SYSTEM_ADMIN | Yes |
| `/api/driver-pay/reports/load-profitability` | GET | OWNER/MANAGER/SYSTEM_ADMIN | Yes |
| `/api/driver-pay/reports/component-type` | GET | OWNER/MANAGER/SYSTEM_ADMIN | Yes |
| `/api/driver-pay/reports/overtime-exposure` | GET | OWNER/MANAGER/SYSTEM_ADMIN | Yes |
| `/api/driver-pay/reports/override-audit` | GET | OWNER/MANAGER/SYSTEM_ADMIN | Yes |
| `/api/driver-pay/reports/deduction-balances` | GET | OWNER/MANAGER/SYSTEM_ADMIN | Yes |
| `/api/driver-pay/reports/settlement-history` | GET | OWNER/MANAGER/SYSTEM_ADMIN | Yes |

All routes: `export const dynamic = 'force-dynamic'`, DRIVER → 403, session.tenantId only (no querystring tenant).

## UI Components Added (11 + 1 utility)

- `ReportTabNav` — 8-tab strip preserving period/filter querystring
- `BigNumberHero` — value + delta arrow + optional Recharts sparkline
- `CsvExportButton` — secondary button triggering streaming CSV via window.location.href
- `ReportTableSkeleton` — animated table skeleton
- `AccessorialSpendReport` — client component, fetch + shadcn Table
- `LoadProfitabilityReport` — sortable paginated table
- `ComponentTypeReport` — Recharts donut chart + breakdown table
- `OvertimeExposureReport` — paginated table with amber amounts
- `OverrideAuditReport` — dispatcher summary + paginated table
- `DeductionBalancesReport` — progress bar column + paginated table
- `SettlementHistoryReport` — status count chips + sortable paginated table + anomaly badge
- `format.ts` — fmtMoney, fmtDate, fmtPct utilities

## Tests Added (4 files, 58 tests)

- `reports-aggregation.test.ts` (8 tests) — covers all 7 helpers with deterministic fixture data
- `reports-csv-streaming.test.ts` (8 tests) — header-first delivery, escaping (comma/quote/newline), async iterable, empty rows
- `reports-tenant-isolation.test.ts` (7 tests) — asserts tenantId (or orgId for CarrierLoad) filter on all Prisma calls
- `reports-rbac.test.ts` (35 tests) — 5 cases × 7 routes: 401 no-session, 403 DRIVER, 200 OWNER/MANAGER/SYSTEM_ADMIN

Pre-existing test count: 157. Total after: 215. No regressions.

## Deviations from Plan

None — plan executed exactly as written.

**Follow-up deferred (per plan):**
- CSV pagination strategy for very large profitability/settlement-history exports: currently uses `pageSize: 100_000` approach. A cursor-based streaming iterator should be used in Phase 11 if export sizes regularly exceed 10k rows.

## Self-Check: PASSED

All 33 created/modified files verified present. All 4 commits verified in git log:
- `4bc1512` feat(quick-345): Wave 1 — 7 aggregation helpers + CSV stream
- `f61ca49` feat(quick-345): Wave 2 — 7 new API routes  
- `aaaa32d` feat(quick-345): Wave 3 — tab-aware page + 11 UI components
- `743f10d` test(quick-345): Wave 4 — 4 Vitest test files
