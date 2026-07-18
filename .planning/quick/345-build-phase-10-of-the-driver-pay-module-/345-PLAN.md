---
phase: 345-build-phase-10-of-the-driver-pay-module
plan: 345
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/driver-pay/reports/accessorial-spend.ts
  - apps/web/src/lib/driver-pay/reports/load-profitability.ts
  - apps/web/src/lib/driver-pay/reports/component-type-breakdown.ts
  - apps/web/src/lib/driver-pay/reports/overtime-exposure.ts
  - apps/web/src/lib/driver-pay/reports/override-audit.ts
  - apps/web/src/lib/driver-pay/reports/deduction-balances.ts
  - apps/web/src/lib/driver-pay/reports/settlement-history.ts
  - apps/web/src/lib/driver-pay/reports/csv-stream.ts
  - apps/web/src/lib/driver-pay/reports/index.ts
  - apps/web/src/app/api/driver-pay/reports/accessorial-spend/route.ts
  - apps/web/src/app/api/driver-pay/reports/load-profitability/route.ts
  - apps/web/src/app/api/driver-pay/reports/component-type/route.ts
  - apps/web/src/app/api/driver-pay/reports/overtime-exposure/route.ts
  - apps/web/src/app/api/driver-pay/reports/override-audit/route.ts
  - apps/web/src/app/api/driver-pay/reports/deduction-balances/route.ts
  - apps/web/src/app/api/driver-pay/reports/settlement-history/route.ts
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx
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
  - apps/web/src/lib/driver-pay/__tests__/reports-aggregation.test.ts
  - apps/web/src/lib/driver-pay/__tests__/reports-csv-streaming.test.ts
  - apps/web/src/lib/driver-pay/__tests__/reports-tenant-isolation.test.ts
  - apps/web/src/lib/driver-pay/__tests__/reports-rbac.test.ts
autonomous: true

must_haves:
  truths:
    - "Admin (OWNER/MANAGER/SYSTEM_ADMIN) can open /carrier/driver-pay/reports and see 8 tabs: Overview, Accessorial, Profitability, Components, Overtime, Override Audit, Deduction Balances, Settlement History"
    - "Each non-overview tab shows a BigNumberHero (big number + delta vs prior period + sparkline where applicable) at the top of the card"
    - "Each report tab supports CSV export via a small button in the top-right of the card; clicking it downloads a streaming CSV (chunked, no full-result buffering)"
    - "Tables in each tab are sortable and paginated (pageSize default 25, max 100) where the row count can exceed 25"
    - "DRIVER role receives HTTP 403 from every new report API endpoint"
    - "Each report API call only returns rows scoped to the caller's tenantId (verified by isolation tests)"
    - "All money totals (accessorial, profitability, components, overtime, settlement) match decimal.js arithmetic and are computed from non-deleted (deletedAt IS NULL) source rows only"
    - "Tab navigation preserves the active period and filter querystring (period, customStart, customEnd, driverIds) when switching tabs"
    - "Empty states render the standard copy ('No data for this period. Try selecting a different date range.') and loading states render ReportTableSkeleton"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/reports/index.ts"
      provides: "Barrel re-export of all 7 aggregation helpers + csv-stream utility + their types"
    - path: "apps/web/src/lib/driver-pay/reports/csv-stream.ts"
      provides: "streamCsvResponse(headers, rows, filename) using ReadableStream — chunked, no buffering"
      exports: ["streamCsvResponse"]
    - path: "apps/web/src/lib/driver-pay/reports/accessorial-spend.ts"
      provides: "computeAccessorialSpend aggregation grouped by client/contract with prior-period delta"
      exports: ["computeAccessorialSpend", "AccessorialSpendRow", "AccessorialSpendResult"]
    - path: "apps/web/src/lib/driver-pay/reports/load-profitability.ts"
      provides: "computeLoadProfitability per-load revenue minus driver pay, paginated"
      exports: ["computeLoadProfitability", "LoadProfitabilityRow", "LoadProfitabilityResult"]
    - path: "apps/web/src/lib/driver-pay/reports/component-type-breakdown.ts"
      provides: "computeComponentTypeBreakdown grouped by componentType with pct"
      exports: ["computeComponentTypeBreakdown", "ComponentTypeRow", "ComponentTypeBreakdownResult"]
    - path: "apps/web/src/lib/driver-pay/reports/overtime-exposure.ts"
      provides: "computeOvertimeExposure with driver/load join"
      exports: ["computeOvertimeExposure", "OvertimeExposureRow", "OvertimeExposureResult"]
    - path: "apps/web/src/lib/driver-pay/reports/override-audit.ts"
      provides: "computeOverrideAudit paginated rows + per-dispatcher summary"
      exports: ["computeOverrideAudit", "OverrideAuditRow", "OverrideAuditResult"]
    - path: "apps/web/src/lib/driver-pay/reports/deduction-balances.ts"
      provides: "computeDeductionBalances of FIXED_INSTALLMENTS deductions with remaining"
      exports: ["computeDeductionBalances", "DeductionBalanceRow", "DeductionBalancesResult"]
    - path: "apps/web/src/lib/driver-pay/reports/settlement-history.ts"
      provides: "computeSettlementHistory full all-status paginated history with anomaly flag"
      exports: ["computeSettlementHistory", "SettlementHistoryRow", "SettlementHistoryResult"]
    - path: "apps/web/src/app/api/driver-pay/reports/accessorial-spend/route.ts"
      provides: "GET (json|csv) accessorial-spend route, force-dynamic, RBAC + tenantId scoped"
      exports: ["GET", "dynamic"]
    - path: "apps/web/src/app/api/driver-pay/reports/load-profitability/route.ts"
      provides: "GET (json|csv) load-profitability route"
      exports: ["GET", "dynamic"]
    - path: "apps/web/src/app/api/driver-pay/reports/component-type/route.ts"
      provides: "GET (json|csv) component-type breakdown route"
      exports: ["GET", "dynamic"]
    - path: "apps/web/src/app/api/driver-pay/reports/overtime-exposure/route.ts"
      provides: "GET (json|csv) overtime exposure route"
      exports: ["GET", "dynamic"]
    - path: "apps/web/src/app/api/driver-pay/reports/override-audit/route.ts"
      provides: "GET (json|csv) override audit route"
      exports: ["GET", "dynamic"]
    - path: "apps/web/src/app/api/driver-pay/reports/deduction-balances/route.ts"
      provides: "GET (json|csv) deduction balances route"
      exports: ["GET", "dynamic"]
    - path: "apps/web/src/app/api/driver-pay/reports/settlement-history/route.ts"
      provides: "GET (json|csv) settlement history route (all statuses)"
      exports: ["GET", "dynamic"]
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx"
      provides: "Reports page with tab param routing — renders Overview + 7 new tab components"
      contains: "ReportTabNav"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/ReportTabNav.tsx"
      provides: "Tab navigation bar preserving period/filter querystring"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/BigNumberHero.tsx"
      provides: "Reusable big number + delta arrow + sparkline (Recharts) hero"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/CsvExportButton.tsx"
      provides: "Top-right secondary button that triggers chunked CSV download"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/ReportTableSkeleton.tsx"
      provides: "Skeleton placeholder for tables while loading"
    - path: "apps/web/src/lib/driver-pay/__tests__/reports-aggregation.test.ts"
      provides: "Vitest coverage for all 7 aggregation helpers with fixture data"
    - path: "apps/web/src/lib/driver-pay/__tests__/reports-csv-streaming.test.ts"
      provides: "Verifies streamCsvResponse emits header chunk first and well-formed rows"
    - path: "apps/web/src/lib/driver-pay/__tests__/reports-tenant-isolation.test.ts"
      provides: "Asserts tenantId filter is present in every Prisma call for all helpers"
    - path: "apps/web/src/lib/driver-pay/__tests__/reports-rbac.test.ts"
      provides: "DRIVER -> 403, OWNER/MANAGER/SYSTEM_ADMIN -> 200 for all 7 new routes"
  key_links:
    - from: "apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx"
      to: "apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/ReportTabNav.tsx"
      via: "renders ReportTabNav with current tab param"
      pattern: "ReportTabNav"
    - from: "apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/AccessorialSpendReport.tsx"
      to: "/api/driver-pay/reports/accessorial-spend"
      via: "fetch() in client component effect, includes period+filters"
      pattern: "fetch.*reports/accessorial-spend"
    - from: "apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/CsvExportButton.tsx"
      to: "/api/driver-pay/reports/{report}?format=csv"
      via: "anchor or window.location download of streaming CSV endpoint"
      pattern: "format=csv"
    - from: "apps/web/src/app/api/driver-pay/reports/accessorial-spend/route.ts"
      to: "apps/web/src/lib/driver-pay/reports/accessorial-spend.ts"
      via: "imports computeAccessorialSpend"
      pattern: "computeAccessorialSpend"
    - from: "apps/web/src/app/api/driver-pay/reports/load-profitability/route.ts"
      to: "apps/web/src/lib/driver-pay/reports/csv-stream.ts"
      via: "imports streamCsvResponse for CSV branch"
      pattern: "streamCsvResponse"
    - from: "apps/web/src/lib/driver-pay/reports/accessorial-spend.ts"
      to: "prisma.loadPayComponent"
      via: "groupBy with tenantId + category=ACCESSORIAL filter"
      pattern: "prisma\\.loadPayComponent\\.(groupBy|findMany|aggregate)"
    - from: "apps/web/src/lib/driver-pay/reports/load-profitability.ts"
      to: "prisma.carrierLoad"
      via: "join CarrierLoad on orgId=tenantId with payComponents aggregate"
      pattern: "prisma\\.(carrierLoad|loadPayComponent)"
---

<objective>
Build Phase 10 of the Driver Pay module: a read-only admin reporting dashboard with 8 tabs (Overview + 7 new). Each new tab shows a BigNumberHero (big number + delta + sparkline) at the top, a sortable/paginated detail table, and a CSV export button that streams chunked responses. All data is tenant-scoped, money math uses decimal.js, and DRIVER role is blocked.

Purpose: Give carrier owners and managers a fast operational view of where their driver pay dollars are going (accessorial spend by client, per-load profitability, component-type mix, overtime exposure, override audit trail, outstanding deduction balances, full settlement history) without leaving the app.

Output: 7 aggregation helpers under `lib/driver-pay/reports/`, 7 new API routes (each supporting `?format=csv`), a CSV streaming utility, an updated tab-aware reports page, 11 new UI components, and 4 test files covering aggregation correctness, CSV streaming, tenant isolation, and RBAC.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

# Existing Phase 1-9 code (READ to understand patterns; DO NOT modify core logic)
@apps/web/src/lib/driver-pay/reporting.ts
@apps/web/src/lib/driver-pay/reporting-predicate.ts
@apps/web/src/app/api/driver-pay/reports/overview/route.ts
@apps/web/src/app/api/driver-pay/reports/settlements/route.ts
@apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/KpiCard.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/FilterBar.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/NetPaySparkline.tsx
@apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/SettlementsTable.tsx

# Schema reference
@apps/web/prisma/schema.prisma

# Existing test patterns
@apps/web/src/lib/driver-pay/__tests__/reporting.test.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1 (Wave 1): Shared report aggregation helpers + CSV streaming utility</name>
  <files>
    apps/web/src/lib/driver-pay/reports/csv-stream.ts
    apps/web/src/lib/driver-pay/reports/accessorial-spend.ts
    apps/web/src/lib/driver-pay/reports/load-profitability.ts
    apps/web/src/lib/driver-pay/reports/component-type-breakdown.ts
    apps/web/src/lib/driver-pay/reports/overtime-exposure.ts
    apps/web/src/lib/driver-pay/reports/override-audit.ts
    apps/web/src/lib/driver-pay/reports/deduction-balances.ts
    apps/web/src/lib/driver-pay/reports/settlement-history.ts
    apps/web/src/lib/driver-pay/reports/index.ts
  </files>
  <action>
Create the `apps/web/src/lib/driver-pay/reports/` directory with 8 files. All helpers receive `(prisma, tenantId, range, ...opts)` and MUST filter by `tenantId` and `deletedAt: null` on every base table. Money math uses `decimal.js` (import `Decimal` from `decimal.js`) — never `+` on raw numbers.

Reuse existing utilities from `apps/web/src/lib/driver-pay/reporting.ts`: `getPeriodRange`, `getPriorPeriodRange`, `computeDeltaPct`, `PeriodKey`, `PeriodRange`, `ReportFilters`. Import them, do not duplicate.

### `csv-stream.ts`
Export:
```ts
export function streamCsvResponse(
  headers: string[],
  rows: AsyncIterable<string[]> | Iterable<string[]>,
  filename: string,
): Response
```
Implementation requirements:
- Build a `ReadableStream` with a `start(controller)` that immediately `controller.enqueue(encoder.encode(csvLine(headers) + '\n'))`
- Then in `pull` (or in start after header), iterate rows; for async iterables use `for await`, for sync use `for..of`; enqueue each row as `csvLine(row) + '\n'`
- `csvLine(values)` escapes any value containing `,`, `"`, `\n`, `\r` by wrapping in double quotes and doubling internal `"`
- Final `controller.close()`
- Return `new Response(stream, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': \`attachment; filename="\${filename}"\`, 'Transfer-Encoding': 'chunked', 'Cache-Control': 'no-store' } })`
- Use `TextEncoder`, NEVER buffer the whole result into a string first

### `accessorial-spend.ts`
Export:
```ts
export interface AccessorialSpendRow {
  clientId: string | null;
  clientName: string;
  contractId: string | null;
  contractName: string | null;
  totalAmount: string;       // Decimal serialized
  componentCount: number;
  avgAmount: string;
}
export interface AccessorialSpendResult {
  bigNumber: string;          // total accessorial spend in period (Decimal serialized)
  deltaPct: number | null;    // vs prior period
  priorTotal: string;
  rows: AccessorialSpendRow[];
}
export async function computeAccessorialSpend(
  prisma: PrismaClient,
  tenantId: string,
  range: PeriodRange,
  filters?: ReportFilters,
): Promise<AccessorialSpendResult>
```
Algorithm:
1. Query `prisma.loadPayComponent.findMany({ where: { tenantId, category: 'ACCESSORIAL', deletedAt: null, createdAt: { gte: range.start, lte: range.end }, ...(filters?.driverIds?.length ? { driverId: { in: filters.driverIds } } : {}) }, include: { load: { include: { client: true, contract: true } } } })`
2. Reduce in JS by `clientId` (null bucket: clientName = 'Unknown / No Client'), summing `grossAmount` with `Decimal`, counting components
3. Compute `avgAmount = totalAmount / componentCount` per bucket
4. Sort rows by `totalAmount` desc
5. `bigNumber` = sum of all `grossAmount`
6. Compute prior period via `getPriorPeriodRange(range)` and re-run the sum-only query, then `deltaPct = computeDeltaPct(bigNumber, priorTotal)`

### `load-profitability.ts`
Export `computeLoadProfitability(prisma, tenantId, range, pagination: { page, pageSize, sortBy?, sortDir? })` returning:
```ts
export interface LoadProfitabilityRow {
  loadId: string;
  referenceNumber: string | null;
  clientName: string | null;
  revenue: string;            // loadRevenue if any assignment has it, else CarrierLoad.totalRevenue
  totalDriverPay: string;     // sum LoadPayComponent.grossAmount for this load
  profit: string;
  profitMarginPct: number | null;
  driverCount: number;
  createdAt: string;          // ISO
}
export interface LoadProfitabilityResult {
  bigNumber: string;          // sum(profit) across all matching loads in period
  deltaPct: number | null;
  priorTotal: string;
  page: number;
  pageSize: number;
  totalCount: number;
  rows: LoadProfitabilityRow[];
}
```
Algorithm:
1. Query `prisma.carrierLoad.findMany({ where: { orgId: tenantId, createdAt: { gte: range.start, lte: range.end } }, include: { client: { select: { name: true } }, driverAssignments: { where: { deletedAt: null }, select: { loadRevenue: true, driverId: true } }, payComponents: { where: { deletedAt: null }, select: { grossAmount: true } } } })` — NOTE field is `orgId` not `tenantId` on CarrierLoad
2. In JS, for each load compute: revenue = first non-null `assignment.loadRevenue` else `load.totalRevenue` (Decimal); totalDriverPay = sum of payComponents grossAmount; profit = revenue - totalDriverPay; margin = profit/revenue*100 (null if revenue=0); driverCount = distinct driverIds
3. Sort by `sortBy` (allowed: profit | margin | revenue | totalDriverPay | createdAt; default createdAt desc); apply `(page-1)*pageSize` slice; totalCount = pre-slice length
4. `bigNumber` = sum of all profits (NOT just the page)
5. Prior period delta from prior range total profit

### `component-type-breakdown.ts`
Export `computeComponentTypeBreakdown(prisma, tenantId, range, filters?)` returning:
```ts
export interface ComponentTypeRow { componentType: string; totalAmount: string; count: number; pct: number; }
export interface ComponentTypeBreakdownResult { bigNumber: string; deltaPct: number | null; priorTotal: string; rows: ComponentTypeRow[]; }
```
Use `prisma.loadPayComponent.groupBy({ by: ['componentType'], where: { tenantId, deletedAt: null, createdAt: { gte: range.start, lte: range.end }, ...(driverIds filter) }, _sum: { grossAmount: true }, _count: { _all: true } })`. Compute `pct = (totalAmount / bigNumber) * 100` per row, sort desc by totalAmount. NO pagination (PayComponentType has ~30 enum values).

### `overtime-exposure.ts`
Export `computeOvertimeExposure(prisma, tenantId, range, pagination)` returning:
```ts
export interface OvertimeExposureRow {
  driverId: string; driverName: string;
  loadId: string | null; referenceNumber: string | null;
  overtimeAmount: string; actualHours: string | null; assignmentId: string;
}
export interface OvertimeExposureResult {
  bigNumber: string; deltaPct: number | null; priorTotal: string;
  totalLoadsAffected: number;
  page: number; pageSize: number; totalCount: number;
  rows: OvertimeExposureRow[];
}
```
Query `prisma.loadPayComponent.findMany({ where: { tenantId, componentType: 'OVERTIME', deletedAt: null, createdAt: { gte: range.start, lte: range.end } }, include: { load: { select: { id: true, referenceNumber: true } }, assignment: { select: { id: true, actualHours: true, driver: { select: { id: true, firstName: true, lastName: true } } } } } })`. Build `driverName = \`\${firstName} \${lastName}\``. Sort by overtimeAmount desc. Paginate. `totalLoadsAffected = distinct count of loadId`.

### `override-audit.ts`
Export `computeOverrideAudit(prisma, tenantId, range, pagination)` returning:
```ts
export interface OverrideAuditRow {
  assignmentId: string; loadId: string; referenceNumber: string | null;
  driverId: string; driverName: string;
  overrideReason: string; createdBy: string | null; createdAt: string;
  payType: string | null; baseRate: string | null; rateUnit: string | null;
}
export interface OverrideAuditResult {
  bigNumber: number;          // count of overrides in period
  deltaPct: number | null;
  priorCount: number;
  byDispatcher: Array<{ createdBy: string | null; count: number }>;
  page: number; pageSize: number; totalCount: number;
  rows: OverrideAuditRow[];
}
```
Query `prisma.loadDriverAssignment.findMany({ where: { tenantId, deletedAt: null, overrideReason: { not: null }, createdAt: { gte: range.start, lte: range.end } }, include: { load: { select: { id: true, referenceNumber: true } }, driver: { select: { id: true, firstName: true, lastName: true } } } })`. Group by `createdBy` for `byDispatcher` summary. Sort rows by `createdAt` desc. Paginate.

### `deduction-balances.ts`
Export `computeDeductionBalances(prisma, tenantId, pagination, driverIds?)` returning:
```ts
export interface DeductionBalanceRow {
  driverId: string; driverName: string;
  deductionId: string; deductionType: string;
  totalAmount: string; amountCollected: string; remaining: string;
  percentComplete: number; schedule: string;
}
export interface DeductionBalancesResult {
  bigNumber: string;          // total outstanding balance
  driversWithBalanceCount: number;
  page: number; pageSize: number; totalCount: number;
  rows: DeductionBalanceRow[];
}
```
NOTE: this report is NOT period-scoped (balances are point-in-time). No prior-period delta. Query `prisma.driverDeduction.findMany({ where: { tenantId, deletedAt: null, schedule: 'FIXED_INSTALLMENTS', ...(driverIds ? { driverId: { in: driverIds } } : {}) }, include: { driver: { select: { firstName: true, lastName: true } } } })`. Filter in JS for `totalAmount.minus(amountCollected).gt(0)`. Compute `remaining` and `percentComplete = (amountCollected/totalAmount)*100`. Sort by remaining desc. Paginate. `driversWithBalanceCount = distinct driverId`.

### `settlement-history.ts`
Export `computeSettlementHistory(prisma, tenantId, range, filters, pagination)` returning:
```ts
export interface SettlementHistoryRow {
  id: string; driverId: string; driverName: string;
  periodStart: string; periodEnd: string;
  status: string;
  grossTaxable: string; grossNonTaxable: string; totalDeductions: string; netPay: string;
  paidAt: string | null;
  isAnomaly: boolean;
}
export interface SettlementHistoryResult {
  bigNumber: string;          // sum of netPay for PAID settlements in period
  deltaPct: number | null;
  priorTotal: string;
  statusCounts: Record<string, number>;  // by status
  page: number; pageSize: number; totalCount: number;
  rows: SettlementHistoryRow[];
}
```
Query `prisma.driverSettlement.findMany({ where: { tenantId, deletedAt: null, periodEnd: { gte: range.start }, periodStart: { lte: range.end }, ...(driverIds filter) }, include: { driver: { select: { firstName: true, lastName: true } } }, orderBy: sortBy mapped })`. ALL statuses included (DRAFT, PENDING_REVIEW, FINALIZED, PAID, VOIDED). `isAnomaly` via existing `isNetPayAnomaly` from `reporting.ts` if available; else `false`. `bigNumber` only sums rows where status='PAID'. statusCounts groups counts by status.

### `index.ts`
Re-export every helper function and every exported type from the 7 files plus `streamCsvResponse`. One-liner per file: `export * from './accessorial-spend';` etc.

### CRITICAL CONSTRAINTS
- TypeScript strict, no `any` — use `Prisma.PrismaClient`, `Decimal` types
- All Decimals serialize via `.toFixed(2)` (or `.toString()` for ratios)
- Never use `+` for money — only `Decimal.plus/minus/div/mul`
- Every Prisma query MUST include `tenantId` in `where`
- Every base-table Prisma query MUST include `deletedAt: null`
  </action>
  <verify>
Run `cd apps/web && pnpm exec tsc --noEmit` — must pass with zero errors in the new files.
Grep check: `grep -L "tenantId" apps/web/src/lib/driver-pay/reports/*.ts` must return only `index.ts` and `csv-stream.ts`.
Grep check: `grep -L "deletedAt" apps/web/src/lib/driver-pay/reports/*.ts | grep -v -E "(index|csv-stream|deduction-balances|settlement-history)"` — only files exempt are index/csv-stream and the two that have schema-specific handling; the other 5 MUST include deletedAt filter.
Manual import test: `import { streamCsvResponse, computeAccessorialSpend, computeLoadProfitability, computeComponentTypeBreakdown, computeOvertimeExposure, computeOverrideAudit, computeDeductionBalances, computeSettlementHistory } from '@/lib/driver-pay/reports'` must resolve.
  </verify>
  <done>
All 9 files exist under `apps/web/src/lib/driver-pay/reports/`. `tsc --noEmit` is clean. Every aggregation helper accepts (prisma, tenantId, range, ...) and returns the documented Result shape. csv-stream.ts exports `streamCsvResponse` returning a streaming `Response` with `Content-Type: text/csv` and `Transfer-Encoding: chunked`. No helper uses raw number arithmetic for money. No helper omits `tenantId` from its query.
  </done>
</task>

<task type="auto">
  <name>Task 2 (Wave 2): 7 new API routes with JSON + streaming CSV support</name>
  <files>
    apps/web/src/app/api/driver-pay/reports/accessorial-spend/route.ts
    apps/web/src/app/api/driver-pay/reports/load-profitability/route.ts
    apps/web/src/app/api/driver-pay/reports/component-type/route.ts
    apps/web/src/app/api/driver-pay/reports/overtime-exposure/route.ts
    apps/web/src/app/api/driver-pay/reports/override-audit/route.ts
    apps/web/src/app/api/driver-pay/reports/deduction-balances/route.ts
    apps/web/src/app/api/driver-pay/reports/settlement-history/route.ts
  </files>
  <action>
Pattern after the existing `apps/web/src/app/api/driver-pay/reports/overview/route.ts` and `settlements/route.ts` — READ them first to copy session loading, period parsing, and error shape.

### Shared route skeleton (apply to ALL 7 routes)
```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/prisma';
import { getPeriodRange, type PeriodKey, type ReportFilters } from '@/lib/driver-pay/reporting';
import { streamCsvResponse, /* compute* */ } from '@/lib/driver-pay/reports';

export const dynamic = 'force-dynamic';

const ALLOWED_ROLES = ['OWNER', 'MANAGER', 'SYSTEM_ADMIN'] as const;

export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session?.tenantId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ALLOWED_ROLES.includes(session.role as typeof ALLOWED_ROLES[number])) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const period = (sp.get('period') ?? 'this_month') as PeriodKey;
  const customStart = sp.get('customStart');
  const customEnd = sp.get('customEnd');
  const driverIds = sp.getAll('driverIds').filter(Boolean);
  const format = (sp.get('format') ?? 'json') as 'json' | 'csv';
  const page = Math.max(1, parseInt(sp.get('page') ?? '1', 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(sp.get('pageSize') ?? '25', 10)));
  const sortBy = sp.get('sortBy') ?? undefined;
  const sortDir = (sp.get('sortDir') ?? 'desc') as 'asc' | 'desc';

  const range = getPeriodRange(period, customStart, customEnd);
  const filters: ReportFilters = { driverIds: driverIds.length ? driverIds : undefined };

  try {
    const result = await /* compute*() */;

    if (format === 'csv') {
      const headers = [ /* per-route columns */ ];
      const rows: string[][] = result.rows.map(r => [ /* per-route */ ]);
      // For unbounded reports (history, profitability), pass an async iterator that pages through Prisma instead of result.rows
      return streamCsvResponse(headers, rows, `${REPORT_NAME}-${range.start.toISOString().slice(0,10)}-${range.end.toISOString().slice(0,10)}.csv`);
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error(`[${REPORT_NAME}] error`, err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
```

### Per-route specifics

1. **`accessorial-spend/route.ts`** — calls `computeAccessorialSpend(prisma, session.tenantId, range, filters)`. CSV headers: `['Client', 'Contract', 'Total Amount', 'Component Count', 'Avg Amount']`.

2. **`load-profitability/route.ts`** — calls `computeLoadProfitability(prisma, session.tenantId, range, { page, pageSize, sortBy, sortDir })`. CSV headers: `['Load Ref', 'Client', 'Revenue', 'Driver Pay', 'Profit', 'Margin %', 'Driver Count', 'Created']`. For CSV format ignore pagination — re-call with `{ page: 1, pageSize: 1_000_000 }` OR add a separate streaming iterator path. Simplest: for CSV pass `pageSize: 100_000`. (Document in code comment.)

3. **`component-type/route.ts`** — calls `computeComponentTypeBreakdown(prisma, session.tenantId, range, filters)`. CSV headers: `['Component Type', 'Total Amount', 'Count', 'Pct of Total']`. No pagination params.

4. **`overtime-exposure/route.ts`** — calls `computeOvertimeExposure(prisma, session.tenantId, range, { page, pageSize })`. CSV headers: `['Driver', 'Load Ref', 'Overtime Amount', 'Actual Hours', 'Assignment ID']`.

5. **`override-audit/route.ts`** — calls `computeOverrideAudit(prisma, session.tenantId, range, { page, pageSize })`. CSV headers: `['Load Ref', 'Driver', 'Override Reason', 'Pay Type', 'Base Rate', 'Rate Unit', 'Created By (UUID)', 'Created At']`.

6. **`deduction-balances/route.ts`** — calls `computeDeductionBalances(prisma, session.tenantId, { page, pageSize }, driverIds.length ? driverIds : undefined)`. NOTE: no period parsing needed — balances are point-in-time. CSV headers: `['Driver', 'Deduction Type', 'Total Amount', 'Collected', 'Remaining', '% Complete', 'Schedule']`. Filename uses today's date instead of range.

7. **`settlement-history/route.ts`** — calls `computeSettlementHistory(prisma, session.tenantId, range, filters, { page, pageSize, sortBy, sortDir })`. CSV headers: `['Settlement ID', 'Driver', 'Period Start', 'Period End', 'Status', 'Gross Taxable', 'Gross Non-Taxable', 'Total Deductions', 'Net Pay', 'Paid At', 'Anomaly?']`.

### Hard requirements (apply to every route)
- `export const dynamic = 'force-dynamic'` at the top
- 401 for missing session, 403 for DRIVER (or any role not in ALLOWED_ROLES)
- Never trust `tenantId` from querystring — always read from `session.tenantId`
- CSV filename pattern: `{report-name}-{YYYY-MM-DD}-{YYYY-MM-DD}.csv` (deduction-balances uses today only)
- All routes go through `getSession()` from `@/lib/auth/supabase` (do not roll a new auth check)
- No `any` types
  </action>
  <verify>
`cd apps/web && pnpm exec tsc --noEmit` passes clean.
Manual curl (with dev server up, owner session cookie set):
- `curl -s 'http://localhost:3000/api/driver-pay/reports/accessorial-spend?period=this_month'` → 200 JSON with `bigNumber`, `rows`
- `curl -sI 'http://localhost:3000/api/driver-pay/reports/accessorial-spend?period=this_month&format=csv'` → `Content-Type: text/csv`, `Content-Disposition: attachment; filename=...`, `Transfer-Encoding: chunked`
- With a DRIVER session: every route returns 403
Grep check: `grep -L "force-dynamic" apps/web/src/app/api/driver-pay/reports/*/route.ts` returns only the 4 pre-existing routes (overview, settlements, operational-metrics, drivers/[driverId]). The 7 new routes must all contain `force-dynamic`.
Grep check: `grep -L "ALLOWED_ROLES\|session.role" apps/web/src/app/api/driver-pay/reports/{accessorial-spend,load-profitability,component-type,overtime-exposure,override-audit,deduction-balances,settlement-history}/route.ts` returns empty (every new route has RBAC).
  </verify>
  <done>
All 7 route files exist and `tsc --noEmit` passes. Each route returns JSON for default format and a streaming CSV `Response` for `format=csv`. Each enforces RBAC (DRIVER → 403). Each uses `session.tenantId` (not a querystring tenant). Each declares `export const dynamic = 'force-dynamic'`.
  </done>
</task>

<task type="auto">
  <name>Task 3 (Wave 3): Tab-aware reports page + 11 new UI components</name>
  <files>
    apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/ReportTabNav.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/BigNumberHero.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/CsvExportButton.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/ReportTableSkeleton.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/AccessorialSpendReport.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/LoadProfitabilityReport.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/ComponentTypeReport.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/OvertimeExposureReport.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/OverrideAuditReport.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/DeductionBalancesReport.tsx
    apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/SettlementHistoryReport.tsx
  </files>
  <action>
First READ the existing `page.tsx` and these components to copy their structure and styling conventions: `KpiCard.tsx`, `FilterBar.tsx`, `PeriodSelector.tsx`, `SettlementsTable.tsx`, `NetPaySparkline.tsx`. DO NOT modify those files; mirror their patterns (Tailwind classes, shadcn/ui imports, dark-mode tokens) in the new ones.

### `ReportTabNav.tsx` (server or client component)
Renders a horizontal tab strip below the sticky FilterBar. Props: `{ active: TabKey }`. Internally uses `usePathname()` and `useSearchParams()` (so this MUST be `'use client'`). Tab keys:
```ts
type TabKey = 'overview' | 'accessorial' | 'profitability' | 'components' | 'overtime' | 'override-audit' | 'deduction-balances' | 'settlement-history';
```
For each tab render a `<Link>` to `?{preserved-params}&tab={key}` (preserve `period`, `customStart`, `customEnd`, `driverIds`). Active tab gets `border-b-2 border-primary text-foreground`; inactive gets `text-muted-foreground hover:text-foreground`. Horizontal scroll on overflow (`overflow-x-auto`). Tab labels: 'Overview', 'Accessorial Spend', 'Load Profitability', 'Components', 'Overtime', 'Override Audit', 'Deduction Balances', 'Settlement History'.

### `BigNumberHero.tsx` (client component, takes Recharts)
Props:
```ts
interface BigNumberHeroProps {
  value: string;                  // pre-formatted ('$12,345.67' or '127')
  subtitle: string;
  deltaPct: number | null;
  deltaInvertedForSpend?: boolean; // true => up = bad (red); false => up = good (green)
  sparklineData?: Array<{ x: string; y: number }>;
}
```
Layout: large `text-4xl font-bold` value on the left, subtitle muted underneath, delta arrow + pct to the right (ArrowUp / ArrowDown from lucide-react; color logic: up && !inverted → green-600; up && inverted → red-600; down && !inverted → red-600; down && inverted → green-600; null → muted '—'). On the far right, if `sparklineData` is provided, render a 120x40 Recharts `<LineChart>` (no axes, no grid, single line, currentColor stroke). Card background: `bg-card border rounded-xl p-6`.

### `CsvExportButton.tsx` (client component)
Props: `{ endpoint: string; filename?: string; params: Record<string, string | string[]> }`. Renders a small secondary shadcn `<Button variant="outline" size="sm">` with a `Download` lucide icon and label 'Export CSV'. On click: construct URL `\`${endpoint}?${new URLSearchParams({...params, format: 'csv'}).toString()}\``, then `window.location.href = url` (let the browser handle streaming download with the right `Content-Disposition`). Positioned top-right by the parent card via flex layout — this component does NOT manage its own positioning.

### `ReportTableSkeleton.tsx` (server component)
Props: `{ rows?: number; columns?: number }` (defaults: 8 / 5). Renders a `<table>` with skeleton `<div className="h-4 bg-muted rounded animate-pulse" />` cells.

### `AccessorialSpendReport.tsx` (client component)
- `'use client'`, takes `period`, `customStart`, `customEnd`, `driverIds` from props (passed by page.tsx after reading searchParams)
- Uses TanStack `useQuery` to fetch `/api/driver-pay/reports/accessorial-spend?{params}` (mirror existing pattern in SettlementsTable.tsx — check whether it uses TanStack or raw fetch+useState and copy that)
- Renders `<Card>` with header row: title 'Accessorial Spend by Client' on left, `<CsvExportButton endpoint="/api/driver-pay/reports/accessorial-spend" params={...} />` on right
- Body: `<BigNumberHero value={fmtMoney(data.bigNumber)} subtitle="Total accessorial spend this period" deltaPct={data.deltaPct} deltaInvertedForSpend />` then a sortable table with columns Client | Contract | Total | Count | Avg
- While loading: `<ReportTableSkeleton />`
- Empty state: centered text `'No data for this period. Try selecting a different date range.'`

### `LoadProfitabilityReport.tsx` (client component)
- Same shell, fetches `/api/driver-pay/reports/load-profitability?{params}&page={p}&pageSize=25&sortBy={s}&sortDir={d}`
- Columns: Load Ref | Client | Revenue | Driver Pay | Profit | Margin % | Drivers | Created
- Headers are clickable to set `sortBy` (local component state); pagination controls (Prev / page X of Y / Next) at bottom
- `deltaInvertedForSpend={false}` (profit higher is good)
- BigNumberHero subtitle: 'Total profit this period'

### `ComponentTypeReport.tsx` (client component)
- Fetches `/api/driver-pay/reports/component-type?{params}`
- BigNumberHero (subtitle: 'Total components by type') with NO sparkline
- Renders a Recharts `<PieChart>` (300px height, donut shape, legend on right) + a table below sorted by amount desc with columns: Type | Amount | Count | % of Total
- No pagination
- `deltaInvertedForSpend` unspecified (most types are spend) — leave default false

### `OvertimeExposureReport.tsx` (client component)
- Fetches `/api/driver-pay/reports/overtime-exposure?{params}&page&pageSize`
- BigNumberHero (subtitle: `\`Total overtime exposure (${data.totalLoadsAffected} loads)\``), `deltaInvertedForSpend` = true
- Paginated table: Driver | Load Ref | OT Amount | Actual Hours | Assignment ID
- CSV export button

### `OverrideAuditReport.tsx` (client component)
- Fetches `/api/driver-pay/reports/override-audit?{params}&page&pageSize`
- BigNumberHero (value = count formatted, subtitle 'Pay overrides this period'), `deltaInvertedForSpend` = true
- Below hero, render 'Overrides by Dispatcher' summary as a row of small cards (one per `byDispatcher` row)
- Paginated table: Load Ref | Driver | Reason | Pay Type | Base Rate | Rate Unit | Created By | Created At
- CSV export button

### `DeductionBalancesReport.tsx` (client component)
- Fetches `/api/driver-pay/reports/deduction-balances?page&pageSize` (NO period params)
- BigNumberHero (value = formatted total outstanding, subtitle = `\`Outstanding across ${data.driversWithBalanceCount} drivers\``), `deltaPct={null}`, no sparkline
- Paginated table: Driver | Type | Total | Collected | Remaining | % Complete (with progress bar) | Schedule
- CSV export button

### `SettlementHistoryReport.tsx` (client component)
- Fetches `/api/driver-pay/reports/settlement-history?{params}&page&pageSize&sortBy&sortDir`
- BigNumberHero (value = total PAID, subtitle 'Paid this period'), `deltaInvertedForSpend` = false (more pay disbursed is fine, but show neutral)
- Below hero, render status count chips: `DRAFT 12  PENDING_REVIEW 3  FINALIZED 5  PAID 87  VOIDED 1`
- Sortable paginated table: Driver | Period | Status (colored badge) | Gross Taxable | Gross Non-Tax | Deductions | Net Pay | Paid At | Anomaly (badge if true)
- CSV export button

### `page.tsx` (UPDATE existing file)
1. Add `tab` to the searchParams type. Default to `'overview'`.
2. Read all 5 params (period, customStart, customEnd, driverIds, tab).
3. After the existing sticky FilterBar, render `<ReportTabNav active={tab} />`.
4. Replace the existing inline rendering with a switch on `tab`:
   - `'overview'` → existing KpiCards + NetPayTrendChart + DeductionDonut + SettlementsTable + OperationalMetrics (extract as `OverviewTab` if simpler, or keep inline)
   - `'accessorial'` → `<AccessorialSpendReport period={period} customStart={customStart} customEnd={customEnd} driverIds={driverIds} />`
   - `'profitability'` → `<LoadProfitabilityReport ... />`
   - `'components'` → `<ComponentTypeReport ... />`
   - `'overtime'` → `<OvertimeExposureReport ... />`
   - `'override-audit'` → `<OverrideAuditReport ... />`
   - `'deduction-balances'` → `<DeductionBalancesReport ... />`
   - `'settlement-history'` → `<SettlementHistoryReport ... />`
5. Preserve all existing imports and the page header. Do NOT remove existing functionality.

### Hard requirements
- All Report* components are `'use client'`
- Money formatting helper: reuse the existing one in `_components` (search for `fmtMoney` or `formatCurrency`); if none exists, create `apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/format.ts` with `export function fmtMoney(s: string): string { return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(s)); }`
- No new chart library — only Recharts (already in deps)
- All tables use shadcn `<Table>` primitives
- Theme tokens: `bg-card`, `text-foreground`, `text-muted-foreground`, `border-border` (dark mode must work)
- TypeScript strict, no `any`
  </action>
  <verify>
`cd apps/web && pnpm exec tsc --noEmit` passes clean.
`cd apps/web && pnpm dev` then visit `http://localhost:3000/carrier/driver-pay/reports` — Overview tab renders unchanged.
Click each tab — URL updates with `?tab=...&period=...` preserved, content swaps, no console errors.
Each tab shows BigNumberHero at the top with a delta arrow (or '—' if no prior data).
Click 'Export CSV' on any tab — browser downloads a `.csv` file with the expected headers.
Toggle dark mode — all 11 new components remain readable.
Loading state shows skeleton, not a spinner.
Empty state (e.g. select a future date range) shows the standard copy.
  </verify>
  <done>
`page.tsx` reads `tab` searchParam and renders the corresponding report component. All 11 new component files exist. ReportTabNav shows 8 tabs, preserves querystring, highlights active. BigNumberHero renders value + delta + sparkline. CsvExportButton triggers a streaming download. Each report component fetches its endpoint, shows skeleton during load, empty state for no rows, and a paginated/sortable table. `tsc --noEmit` clean. No mention of TanStack vs raw fetch mismatch with existing components (must follow same pattern as SettlementsTable).
  </done>
</task>

<task type="auto">
  <name>Task 4 (Wave 4): Vitest coverage — aggregation, CSV streaming, tenant isolation, RBAC</name>
  <files>
    apps/web/src/lib/driver-pay/__tests__/reports-aggregation.test.ts
    apps/web/src/lib/driver-pay/__tests__/reports-csv-streaming.test.ts
    apps/web/src/lib/driver-pay/__tests__/reports-tenant-isolation.test.ts
    apps/web/src/lib/driver-pay/__tests__/reports-rbac.test.ts
  </files>
  <action>
Mirror the pattern in `apps/web/src/lib/driver-pay/__tests__/reporting.test.ts` (read it first) — uses Vitest, mocks Prisma via `vi.fn()` returning shaped fixture data, and uses `Decimal` for assertions.

### `reports-aggregation.test.ts`
Mock Prisma client with `vi.fn()` per method used by each helper. Use fixed `range = { start: new Date('2026-05-01'), end: new Date('2026-05-31') }`.

Tests (one `describe` per helper):

1. **computeAccessorialSpend**:
   - Mock `prisma.loadPayComponent.findMany` to return 4 components across 2 clients: Client A (2 components @ $100, $50) and Client B (1 component @ $200) and 1 with null load (Unknown bucket, $25)
   - Mock prior-period query to return total $250
   - Assert: `bigNumber === '375.00'`, `rows.length === 3`, Client A row `totalAmount === '150.00'`, `componentCount === 2`, `avgAmount === '75.00'`; rows sorted by total desc (B then A then Unknown)
   - Assert: `deltaPct === 50` (375 vs 250 = +50%)

2. **computeLoadProfitability**:
   - Mock `prisma.carrierLoad.findMany` to return 3 loads: L1 revenue=$1000, payComponents sum=$300 → profit $700, margin 70%; L2 revenue=$500, payComponents=$500 → profit $0, margin 0%; L3 revenue=null, totalRevenue=$200, payComponents=$50 → profit $150
   - Assert: `bigNumber === '850.00'`, `rows.length === 3`, L1.profit === '700.00', L2.margin === 0, L3.revenue === '200.00'
   - With `pagination = { page: 1, pageSize: 2 }`: `rows.length === 2`, `totalCount === 3`

3. **computeComponentTypeBreakdown**:
   - Mock `prisma.loadPayComponent.groupBy` to return: [{ componentType: 'OVERTIME', _sum: { grossAmount: Decimal(400) }, _count: { _all: 4 } }, { componentType: 'DETENTION', _sum: { grossAmount: Decimal(100) }, _count: { _all: 2 } }]
   - Assert: `bigNumber === '500.00'`, OVERTIME row `pct === 80`, DETENTION row `pct === 20`, sorted desc

4. **computeOvertimeExposure**:
   - Mock `prisma.loadPayComponent.findMany` returns 3 rows, 2 distinct loads
   - Assert: `bigNumber` correct, `totalLoadsAffected === 2`, driverName concatenated correctly

5. **computeOverrideAudit**:
   - Mock returns 3 assignments with `overrideReason !== null`, 2 created by dispatcher 'user-1', 1 by 'user-2'
   - Assert: `bigNumber === 3`, `byDispatcher` includes `{createdBy: 'user-1', count: 2}`, `{createdBy: 'user-2', count: 1}`

6. **computeDeductionBalances**:
   - Mock `prisma.driverDeduction.findMany` returns 4 deductions: 2 with remaining > 0 (total $500/collected $200 = remaining $300, percentComplete 40), 1 with remaining = 0 (filtered OUT), 1 with schedule != FIXED_INSTALLMENTS (filtered OUT via where clause — verify the where clause passed includes `schedule: 'FIXED_INSTALLMENTS'`)
   - Assert: `rows.length === 2`, `bigNumber === '600.00'`, first row `percentComplete === 40`

7. **computeSettlementHistory**:
   - Mock `prisma.driverSettlement.findMany` returns 5 settlements: 3 PAID (netPay $1000 each), 1 DRAFT, 1 VOIDED
   - Assert: `bigNumber === '3000.00'` (only PAID summed), `statusCounts.PAID === 3`, `statusCounts.DRAFT === 1`, `statusCounts.VOIDED === 1`, `rows.length === 5`

### `reports-csv-streaming.test.ts`
- Test `streamCsvResponse(['A','B','C'], [['1','2','3'], ['4','5','6']], 'x.csv')`:
  - Returns a `Response`
  - `res.headers.get('Content-Type')` === `'text/csv; charset=utf-8'`
  - `res.headers.get('Content-Disposition')` matches `attachment; filename="x.csv"`
  - Read the body as text: `await res.text()` === `'A,B,C\n1,2,3\n4,5,6\n'`
- Test escaping: `streamCsvResponse(['col'], [['has,comma'], ['has"quote'], ['has\nnewline']], 'esc.csv')`:
  - Body contains `"has,comma"`, `"has""quote"`, `"has\nnewline"` properly quoted
- Test async iterable input: define `async function* gen() { yield ['1','2']; yield ['3','4']; }`, call `streamCsvResponse(['A','B'], gen(), 'a.csv')`, assert body === `'A,B\n1,2\n3,4\n'`
- Test header arrives first (chunked): use `res.body!.getReader()`, first chunk decoded must start with `'A,B'` (header) before any data rows — even with a slow async iterable (use `await new Promise(r=>setTimeout(r,50))` between yields). This verifies no full-result buffering.

### `reports-tenant-isolation.test.ts`
For each of the 7 helpers, create a mock Prisma where the relevant method is `vi.fn().mockResolvedValue([])`. Call the helper with `tenantId: 'tenant-A'`. Then assert:
- The mock was called with `expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tenant-A' }) })` — for `computeLoadProfitability` the field is `orgId: 'tenant-A'` (CarrierLoad uses orgId)
- For helpers that query a SECOND time (prior period), assert that ALL calls included the tenant filter (use `mock.calls.forEach`)

### `reports-rbac.test.ts`
Test route handlers directly. Pattern:
```ts
import { GET } from '@/app/api/driver-pay/reports/accessorial-spend/route';

vi.mock('@/lib/auth/supabase', () => ({ getSession: vi.fn() }));
vi.mock('@/lib/prisma', () => ({ prisma: { /* mocked methods */ } }));

import { getSession } from '@/lib/auth/supabase';

describe('accessorial-spend RBAC', () => {
  it('returns 403 for DRIVER', async () => {
    (getSession as Mock).mockResolvedValue({ tenantId: 't1', role: 'DRIVER' });
    const req = new NextRequest('http://localhost/api/driver-pay/reports/accessorial-spend');
    const res = await GET(req);
    expect(res.status).toBe(403);
  });
  it('returns 200 for OWNER', async () => {
    (getSession as Mock).mockResolvedValue({ tenantId: 't1', role: 'OWNER' });
    // mock prisma to return [] so the handler completes
    const res = await GET(new NextRequest('http://localhost/api/driver-pay/reports/accessorial-spend'));
    expect(res.status).toBe(200);
  });
  it('returns 200 for MANAGER', async () => { /* ... */ });
  it('returns 200 for SYSTEM_ADMIN', async () => { /* ... */ });
  it('returns 401 for no session', async () => {
    (getSession as Mock).mockResolvedValue(null);
    const res = await GET(new NextRequest('http://localhost/api/driver-pay/reports/accessorial-spend'));
    expect(res.status).toBe(401);
  });
});
```
Repeat (compactly, possibly via a `describe.each`) for all 7 routes. Keep the test file under ~250 lines by using a parametrized helper.

### Hard requirements
- All tests use Vitest (`import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'`)
- No real DB calls — fully mocked Prisma
- TypeScript strict
- Use `Decimal` from `decimal.js` for fixture amounts where the helper expects them
  </action>
  <verify>
`cd apps/web && pnpm exec vitest run src/lib/driver-pay/__tests__/reports-aggregation.test.ts` → all green
`cd apps/web && pnpm exec vitest run src/lib/driver-pay/__tests__/reports-csv-streaming.test.ts` → all green; specifically the 'header arrives first' test must pass
`cd apps/web && pnpm exec vitest run src/lib/driver-pay/__tests__/reports-tenant-isolation.test.ts` → all green; failing any helper means tenantId leak
`cd apps/web && pnpm exec vitest run src/lib/driver-pay/__tests__/reports-rbac.test.ts` → all green; DRIVER must be 403 on all 7 routes
`cd apps/web && pnpm exec vitest run src/lib/driver-pay/__tests__/` → all driver-pay tests (including pre-existing) pass
`cd apps/web && pnpm exec tsc --noEmit` clean
  </verify>
  <done>
All 4 test files exist and pass. `reports-aggregation.test.ts` covers all 7 helpers with deterministic fixture data. `reports-csv-streaming.test.ts` verifies header-first delivery and proper escaping. `reports-tenant-isolation.test.ts` verifies every helper's Prisma calls include the tenant filter (tenantId or orgId). `reports-rbac.test.ts` verifies DRIVER → 403 and OWNER/MANAGER/SYSTEM_ADMIN → 200 on every new route. No pre-existing test breaks.
  </done>
</task>

</tasks>

<verification>
After all 4 tasks complete:

1. **TypeScript:** `cd apps/web && pnpm exec tsc --noEmit` — zero errors across the whole web app
2. **Unit tests:** `cd apps/web && pnpm exec vitest run src/lib/driver-pay/__tests__/` — all green (including pre-existing tests)
3. **Dev smoke test:** `cd apps/web && pnpm dev`, then as an OWNER:
   - Visit `/carrier/driver-pay/reports` → Overview tab renders unchanged (regression check)
   - Click each of the 7 new tabs → URL updates with `?tab=...`, content swaps without page reload
   - Each tab shows BigNumberHero, table, and an 'Export CSV' button
   - Change period via PeriodSelector → all tabs refetch with the new range
   - Click 'Export CSV' on any tab → browser downloads a `.csv` with correct headers and at least one data row (if data exists)
4. **RBAC smoke:** Log in as a DRIVER → all 7 new endpoints return 403 (check via curl or browser devtools)
5. **Tenant isolation smoke:** Switch tenants → previous tenant's data does not appear
6. **Dark mode:** Toggle dark mode → all 11 new components render correctly (no white-on-white, no invisible text)
7. **No phase 1-9 regression:** existing Overview KPIs, NetPayTrendChart, DeductionDonut, SettlementsTable, OperationalMetrics still render and function on the Overview tab
</verification>

<success_criteria>
- 7 new aggregation helpers exist under `apps/web/src/lib/driver-pay/reports/` with the documented `Result` shapes
- `streamCsvResponse` utility exists and emits headers before data rows (verified by test)
- 7 new API routes exist, each enforcing RBAC (DRIVER → 403), each scoped to `session.tenantId`, each supporting `?format=csv` streaming
- Reports page reads `tab` searchParam and renders 1 of 8 tab contents; querystring preserved across tab switches
- 11 new UI components exist (ReportTabNav, BigNumberHero, CsvExportButton, ReportTableSkeleton, + 7 *Report components)
- 4 test files exist and all pass: aggregation correctness, CSV streaming (header-first), tenant isolation, RBAC
- `tsc --noEmit` is clean
- No phase 1-9 files modified (verified by `git diff --stat` excluding the listed files)
- Money values are computed via `decimal.js`, never raw `+`
- All Prisma queries filter `deletedAt: null` on base tables (where the table supports soft delete)
- `export const dynamic = 'force-dynamic'` on every new route
</success_criteria>

<output>
After all 4 tasks complete, create `.planning/quick/345-build-phase-10-of-the-driver-pay-module-/345-SUMMARY.md` documenting:
- Files created (count and list)
- Helpers exported (one line each)
- Routes added (with method + RBAC + CSV support)
- UI components added
- Tests added (count + what they cover)
- Any deviations from the plan and why
- Any follow-up items deferred (e.g. CSV pagination strategy for very large profitability exports if you used the simple `pageSize: 100_000` shortcut)
</output>
