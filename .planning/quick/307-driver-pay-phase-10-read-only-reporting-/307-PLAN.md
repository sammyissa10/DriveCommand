---
phase: 307-driver-pay-phase-10-read-only-reporting-
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/driver-pay/reporting.ts
  - apps/web/src/app/api/driver-pay/reports/overview/route.ts
  - apps/web/src/app/api/driver-pay/reports/settlements/route.ts
  - apps/web/src/app/api/driver-pay/reports/drivers/[driverId]/route.ts
  - apps/web/src/app/api/driver-pay/reports/operational-metrics/route.ts
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/KpiCard.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/PeriodSelector.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/FilterBar.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/NetPayTrendChart.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/DeductionDonut.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/SettlementsTable.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/OperationalMetrics.tsx
  - apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/NetPaySparkline.tsx
  - apps/web/src/app/api/driver-pay/__tests__/reports-api.test.ts
autonomous: true

must_haves:
  truths:
    - "Owner/manager can view a Driver Pay reports dashboard at /carrier/driver-pay/reports"
    - "5 KPI cards display total payroll, drivers paid, avg net pay, total deductions, total bonuses with % delta vs prior period"
    - "Period selector switches between This Week, Last Week, This Month, Last Month, Custom Range"
    - "Net pay trend line chart and deduction breakdown donut render with real data"
    - "Settlements table is paginated, sortable, and links rows to per-driver detail page"
    - "Operational metrics show settlement velocity, dispute count, garnishment cap hit rate, carryover queue size"
    - "Per-driver detail page at /carrier/driver-pay/reports/[driverId] shows YTD earnings/deductions/bonuses, settlements list, bonuses, deduction balances, and a 4-settlement sparkline"
    - "All 4 GET API routes return 403 when called by DRIVER role"
    - "All queries are tenant-scoped (no cross-tenant data leaks)"
    - "Money math uses decimal.js (never native float); date math uses date-fns"
    - "CSV download buttons exist on tables with TODO comments for Phase 11 export"
    - "Anomaly red badge appears when driver net pay deviates >25% from rolling 4-week avg"
  artifacts:
    - path: "apps/web/src/lib/driver-pay/reporting.ts"
      provides: "Shared aggregation helpers: computeOverviewKpis, computeDeltaPct, getPeriodRange, getPriorPeriodRange, computeNetPayTrend, computeDeductionBreakdown, computeOperationalMetrics, computeDriverDetail, isNetPayAnomaly"
    - path: "apps/web/src/app/api/driver-pay/reports/overview/route.ts"
      provides: "GET handler returning KPIs + trend + donut data for the selected period"
    - path: "apps/web/src/app/api/driver-pay/reports/settlements/route.ts"
      provides: "GET handler returning paginated/sorted settlements list"
    - path: "apps/web/src/app/api/driver-pay/reports/drivers/[driverId]/route.ts"
      provides: "GET handler returning per-driver YTD + settlements + bonuses + deduction balances"
    - path: "apps/web/src/app/api/driver-pay/reports/operational-metrics/route.ts"
      provides: "GET handler returning velocity/disputes/garnishment/carryover metrics"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx"
      provides: "Carrier reports dashboard server component"
    - path: "apps/web/src/app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx"
      provides: "Per-driver detail report page"
    - path: "apps/web/src/app/api/driver-pay/__tests__/reports-api.test.ts"
      provides: "Vitest suite covering KPIs, period boundaries, trend %, tenant isolation, RBAC"
  key_links:
    - from: "apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx"
      to: "/api/driver-pay/reports/overview"
      via: "server-side fetch with period+filter query params"
      pattern: "fetch.*driver-pay/reports/overview"
    - from: "apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx"
      to: "/api/driver-pay/reports/settlements"
      via: "client-side fetch on table page/sort change"
      pattern: "driver-pay/reports/settlements"
    - from: "apps/web/src/app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx"
      to: "/api/driver-pay/reports/drivers/[driverId]"
      via: "server fetch in page params"
      pattern: "driver-pay/reports/drivers"
    - from: "apps/web/src/app/api/driver-pay/reports/*/route.ts"
      to: "apps/web/src/lib/driver-pay/reporting.ts"
      via: "import compute* helpers"
      pattern: "from ['\"]@/lib/driver-pay/reporting['\"]"
    - from: "apps/web/src/lib/driver-pay/reporting.ts"
      to: "decimal.js + date-fns"
      via: "import Decimal from 'decimal.js'; import { startOfWeek, endOfWeek, ... } from 'date-fns'"
      pattern: "from ['\"]decimal\\.js['\"]"
---

<objective>
Build the Driver Pay Phase 10 read-only reporting layer: carrier overview dashboard, per-driver detail report, 4 GET API routes, operational metrics, and a Vitest suite covering KPI math, period boundaries, tenant isolation, and RBAC.

Purpose: Give owners/managers a single dashboard to monitor payroll health (total payroll, deductions, bonuses, disputes, velocity) and drill into any driver's compensation history without affecting any write paths. This is the final analytical surface before Phase 11 (export engine).

Output:
- 1 shared aggregation library (apps/web/src/lib/driver-pay/reporting.ts)
- 4 GET API routes under /api/driver-pay/reports/*
- 2 carrier pages under /(owner)/carrier/driver-pay/reports/
- 8 React components under reports/_components/
- 1 Vitest suite (reports-api.test.ts)
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@apps/web/prisma/schema.prisma
@apps/web/src/lib/driver-pay/calculator.ts
@apps/web/src/lib/driver-pay/settlement-generator.ts
@apps/web/src/lib/driver-pay/settlement-anomaly.ts
@apps/web/src/lib/auth/supabase.ts
@apps/web/src/lib/auth/roles.ts
@apps/web/src/lib/context/tenant-context.ts
@apps/web/src/app/api/driver-pay/settlements/route.ts
@apps/web/src/app/api/driver-pay/__tests__/settlements-tenant.test.ts
@apps/web/src/components/ui/table.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build shared reporting aggregation library</name>
  <files>apps/web/src/lib/driver-pay/reporting.ts</files>
  <action>
Create `apps/web/src/lib/driver-pay/reporting.ts` exporting pure aggregation helpers used by every reports API route. ALL money math uses `Decimal` from decimal.js (never native float). ALL date math uses date-fns.

Imports:
- `Decimal` from 'decimal.js'
- `startOfWeek, endOfWeek, startOfMonth, endOfMonth, subWeeks, subMonths, differenceInDays, startOfYear, addDays` from 'date-fns'
- `Prisma, PrismaClient` (type only) — function accepts an injected tenant-scoped prisma so handlers and tests both work
- Types: `DriverSettlement, DriverBonus, DriverDeduction, DriverDispute, LoadDriverAssignment` from '@prisma/client' (or `@/generated/prisma` if that's the project pattern — match the existing imports in apps/web/src/lib/driver-pay/calculator.ts)

Exports (all functions accept `prisma: Prisma.TransactionClient | PrismaClient` and `tenantId: string` so they are tenant-isolated by argument, not by closure):

1. `type PeriodKey = 'this_week' | 'last_week' | 'this_month' | 'last_month' | 'custom'`

2. `getPeriodRange(key: PeriodKey, customStart?: Date, customEnd?: Date, now: Date = new Date()): { start: Date; end: Date }`
   - this_week: startOfWeek(now,{weekStartsOn:1}) → endOfWeek(now,{weekStartsOn:1})
   - last_week: subWeeks one week
   - this_month / last_month similar
   - custom: throw if start/end missing; otherwise return as-is

3. `getPriorPeriodRange(range: {start,end}): {start,end}`
   - lengthDays = differenceInDays(end, start) + 1
   - priorEnd = addDays(start, -1); priorStart = addDays(priorEnd, -(lengthDays - 1))

4. `computeDeltaPct(current: Decimal, prior: Decimal): number | null`
   - If prior.isZero(): return null (UI shows "—")
   - Else: current.minus(prior).div(prior).mul(100).toDecimalPlaces(1).toNumber()

5. `async computeOverviewKpis(prisma, tenantId, range, filters: { driverIds?: string[]; employmentType?: 'EMPLOYEE'|'CONTRACTOR'|'ALL'; status?: DriverSettlement['status']|'ALL' })`
   Returns: `{ totalPayroll: { current: string; delta: number|null }, driversPaid: { current: number; delta: number|null }, avgNetPay: { current: string; delta: number|null }, totalDeductions: { current: string; delta: number|null }, totalBonuses: { current: string; delta: number|null } }`
   Implementation:
   - Query DriverSettlement where tenantId, periodStart >= range.start, periodEnd <= range.end, plus filter on driverId IN + status
   - Filter by employment type via include of CarrierDriver.employmentType (or skip if 'ALL')
   - totalPayroll = sum of netPay; driversPaid = count distinct driverId where status='PAID'; avgNetPay = totalPayroll/driversPaid (Decimal.div, guard div-by-zero); totalDeductions = sum of totalDeductions; totalBonuses = via DriverBonus where awardedAt in range
   - Run same query for prior range; compute deltas via computeDeltaPct
   - Decimal totals → toFixed(2) before returning as string

6. `async computeNetPayTrend(prisma, tenantId, range, filters)` → `Array<{ weekStart: string; netPay: string }>`
   - Bucket settlements by ISO week (startOfWeek with weekStartsOn:1)
   - For each week in range, sum netPay; format weekStart as 'yyyy-MM-dd'
   - Use Map<string, Decimal> then convert to array sorted by weekStart

7. `async computeDeductionBreakdown(prisma, tenantId, range, filters)` → `Array<{ deductionType: string; total: string }>`
   - groupBy DriverDeduction.deductionType where tenantId, settlement linked via DriverDeductionApplication or directly on DriverDeduction.amountCollected updates in range
   - If model lacks period field, use DriverDeduction.updatedAt as the proxy (note in code: "TODO: tie to DeductionApplication when Phase 7 lands a join table")
   - Return list sorted by total desc

8. `async computeOperationalMetrics(prisma, tenantId, range)` → `{ avgDaysApprovedToPaid: number|null; totalDisputes: number; topDisputedDriver: { driverId: string; driverName: string; count: number }|null; garnishmentCapHitRate: number; carryoverQueueSize: number }`
   - avgDaysApprovedToPaid: from LoadDriverAssignment where approvedAt + paidAt both set, in range; avg differenceInDays(paidAt, approvedAt)
   - totalDisputes: count DriverDispute where status IN ('OPEN','IN_REVIEW','RESOLVED_PAID','RESOLVED_NO_CHANGE') and createdAt in range
   - topDisputedDriver: groupBy driverId on disputes, take top by count, join CarrierDriver for firstName+lastName
   - garnishmentCapHitRate: of all DriverDeduction where deductionType='GARNISHMENT' and amountCollected > 0 in range, fraction where amountCollected reached maxPercentageOfNet cap (compare to floor((maxPercentageOfNet/100) * settlement.netPay)) — return as 0..1 decimal
   - carryoverQueueSize: count LoadDriverAssignment where payStatus='PENDING_REVIEW' (current snapshot, not range-scoped)

9. `async computeDriverDetail(prisma, tenantId, driverId, year: number = new Date().getFullYear())` → `{ driver: {id, firstName, lastName, employmentType}; ytd: {earnings: string; deductions: string; bonuses: string}; settlements: Array<{...}>; bonuses: Array<{id, bonusType, amount, awardedAt, installmentNumber, totalInstallments}>; deductionBalances: Array<{id, deductionType, amountCollected, totalAmount, percentComplete}>; last4NetPay: Array<{periodEnd: string; netPay: string}> }`
   - YTD: sum across DriverSettlements where periodEnd between startOfYear(date) and endOfYear; status IN ('FINALIZED','PAID')
   - deductionBalances: only schedule='FIXED_INSTALLMENTS'; percentComplete = amountCollected/totalAmount * 100 (Decimal, toFixed(1))
   - last4NetPay: top 4 settlements desc by periodEnd

10. `isNetPayAnomaly(currentNet: Decimal, rollingAvg: Decimal): boolean`
    - If rollingAvg.isZero(): false
    - deviation = currentNet.minus(rollingAvg).abs().div(rollingAvg)
    - return deviation.gt(new Decimal('0.25'))

11. `async computeRollingAvgNetPay(prisma, tenantId, driverId, anchor: Date, weeks: number = 4)`
    - Get last `weeks` settlements before anchor; return average netPay as Decimal (or Decimal(0) if none)

IMPORTANT — DO NOT use raw SQL date_trunc for week bucketing. Use JS-side reduce with date-fns to keep portability and to make Vitest mocking trivial. Inline note: "Raw SQL only acceptable if profiling shows N+1 issues — Phase 11 can optimize."

DO NOT make any writes. Read-only.

Return type definitions exported from the same file so route handlers and components can share them.
  </action>
  <verify>
- `npx tsc --noEmit --project apps/web/tsconfig.json` passes with no errors in apps/web/src/lib/driver-pay/reporting.ts
- File has zero `any` types except in Prisma where clauses (use `Prisma.DriverSettlementWhereInput`)
- Grep confirms: `grep -n "parseFloat\|Number(" apps/web/src/lib/driver-pay/reporting.ts` returns 0 hits for money fields
- All exported functions are pure async (take prisma + tenantId as args, no module-level prisma)
  </verify>
  <done>
File apps/web/src/lib/driver-pay/reporting.ts compiles. Exports: PeriodKey, getPeriodRange, getPriorPeriodRange, computeDeltaPct, computeOverviewKpis, computeNetPayTrend, computeDeductionBreakdown, computeOperationalMetrics, computeDriverDetail, computeRollingAvgNetPay, isNetPayAnomaly. All money values returned as decimal-string (toFixed(2)) or as Decimal where consumer needs further math.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build 4 GET API routes with RBAC and tenant scoping</name>
  <files>apps/web/src/app/api/driver-pay/reports/overview/route.ts, apps/web/src/app/api/driver-pay/reports/settlements/route.ts, apps/web/src/app/api/driver-pay/reports/drivers/[driverId]/route.ts, apps/web/src/app/api/driver-pay/reports/operational-metrics/route.ts</files>
  <action>
Create 4 read-only GET routes. Every route follows this exact pattern (match the style in apps/web/src/app/api/driver-pay/settlements/route.ts):

```ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { ALLOWED_ROLE_SET } from '...'; // see below

const ALLOWED = new Set(['OWNER', 'MANAGER', 'SYSTEM_ADMIN']);

export async function GET(req: NextRequest, ctx?: { params: Promise<{ driverId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!ALLOWED.has(session.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const prisma = await getTenantPrisma();
  // ... call helpers from reporting.ts with prisma + session.tenantId
}
```

**Route 1: GET /api/driver-pay/reports/overview**
File: apps/web/src/app/api/driver-pay/reports/overview/route.ts
Query params (parse with `req.nextUrl.searchParams`):
- `period`: PeriodKey, default 'this_week'
- `customStart`, `customEnd`: ISO date strings (required if period='custom')
- `driverIds`: comma-separated, optional
- `employmentType`: 'EMPLOYEE'|'CONTRACTOR'|'ALL', default 'ALL'
- `status`: settlement status filter, default 'ALL'
Validate with simple inline checks (no need for zod here — params are constrained). On bad params: 400 with `{ error: 'Invalid period' }`.
Response: `{ period: {start, end}, priorPeriod: {start, end}, kpis: {...}, netPayTrend: [...], deductionBreakdown: [...] }`

**Route 2: GET /api/driver-pay/reports/settlements**
File: apps/web/src/app/api/driver-pay/reports/settlements/route.ts
Query params:
- `period`, `customStart`, `customEnd`, `driverIds`, `employmentType`, `status` (same as overview)
- `page`: number, default 1
- `pageSize`: number, default 25, max 100
- `sortBy`: 'periodEnd' | 'netPay' | 'driverName' | 'status', default 'periodEnd'
- `sortDir`: 'asc' | 'desc', default 'desc'
Implementation: Prisma findMany on DriverSettlement with where { tenantId, periodStart >= range.start, periodEnd <= range.end, ...filters }, include carrierDriver: { select: {firstName, lastName, employmentType} }, orderBy mapped from sortBy, skip+take pagination.
For each row, compute anomaly flag inline: call `computeRollingAvgNetPay(prisma, tenantId, driverId, periodEnd)` and `isNetPayAnomaly(netPay, avg)`. Add `isAnomaly: boolean` to row.
Response: `{ rows: [...], total: number, page, pageSize, totalPages }`

**Route 3: GET /api/driver-pay/reports/drivers/[driverId]**
File: apps/web/src/app/api/driver-pay/reports/drivers/[driverId]/route.ts
- Extract driverId from awaited params (Next.js 15 pattern: `const { driverId } = await ctx.params`)
- Optional query param `year`: number, default current year
- Verify the driver belongs to this tenant before calling helpers (Prisma findFirst on CarrierDriver where { id: driverId, tenantId }, throw 404 if missing)
- Call `computeDriverDetail(prisma, session.tenantId, driverId, year)`
- Return as-is

**Route 4: GET /api/driver-pay/reports/operational-metrics**
File: apps/web/src/app/api/driver-pay/reports/operational-metrics/route.ts
- Same period params as overview (no driver/employment filters — operational metrics are carrier-wide)
- Call `computeOperationalMetrics(prisma, session.tenantId, range)`
- Return as-is

ALL 4 ROUTES:
- Wrap body in `try { ... } catch (err) { console.error('reports route error', err); return NextResponse.json({ error: 'Internal error' }, { status: 500 }); }` — use the existing logger if a `logger` util is present in apps/web/src/lib (check `apps/web/src/lib/logger.ts` first; if exists, use it).
- NO writes. NO `revalidatePath`. Read-only.
- Add `export const dynamic = 'force-dynamic'` at top of each route file (these are query-driven dashboards).
  </action>
  <verify>
- `npx tsc --noEmit --project apps/web/tsconfig.json` passes
- Manual curl with no auth → 401: `curl -i http://localhost:3000/api/driver-pay/reports/overview`
- Manual curl as DRIVER session → 403 (covered by Task 3 tests)
- `grep -rn "force-dynamic" apps/web/src/app/api/driver-pay/reports/` returns 4 hits
  </verify>
  <done>
4 route.ts files created, each exports GET, each returns 401 for unauthed, 403 for DRIVER, valid JSON for OWNER/MANAGER/SYSTEM_ADMIN. All money values come through as decimal strings (no `parseFloat`).
  </done>
</task>

<task type="auto">
  <name>Task 3: Build carrier reports dashboard page + per-driver detail page + components</name>
  <files>apps/web/src/app/(owner)/carrier/driver-pay/reports/page.tsx, apps/web/src/app/(owner)/carrier/driver-pay/reports/[driverId]/page.tsx, apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/KpiCard.tsx, apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/PeriodSelector.tsx, apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/FilterBar.tsx, apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/NetPayTrendChart.tsx, apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/DeductionDonut.tsx, apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/SettlementsTable.tsx, apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/OperationalMetrics.tsx, apps/web/src/app/(owner)/carrier/driver-pay/reports/_components/NetPaySparkline.tsx</files>
  <action>
Build the carrier-side UI. Match existing patterns in apps/web/src/app/(owner)/carrier/driver-pay/settlements/ for layout, breadcrumbs, container widths, dark mode (Tailwind `dark:` variants), and Skeleton usage. Use shadcn/ui Table from @/components/ui/table.

NOTE: Apps/web uses Next.js 15 App Router. Page components are server components by default. Components needing client interactivity (period selector, filters, table sort/page state, charts) MUST have `'use client'`.

**1. Reports dashboard page (server component): `reports/page.tsx`**
- Auth check: `const session = await getSession(); if (!session) redirect('/login'); if (session.role === 'DRIVER') redirect('/driver');`
- Parse `searchParams` for period/filters; default period='this_week'
- Server-side fetch the overview data by calling the helper directly (cleaner than HTTP fetch from server component): `import { computeOverviewKpis, computeNetPayTrend, computeDeductionBreakdown, getPeriodRange, getPriorPeriodRange } from '@/lib/driver-pay/reporting'; const prisma = await getTenantPrisma(); const range = getPeriodRange(period, ...); const kpis = await computeOverviewKpis(prisma, session.tenantId, range, filters);`
- Render layout: page header "Driver Pay Reports" + breadcrumb back to /carrier/driver-pay
- `<PeriodSelector>` + `<FilterBar>` in a sticky top bar (`sticky top-16 z-10 bg-background border-b`)
- 5 KpiCard in a responsive grid (`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4`)
- Two charts side by side (`grid grid-cols-1 lg:grid-cols-2 gap-4`): `<NetPayTrendChart data={netPayTrend} />` + `<DeductionDonut data={deductionBreakdown} />`
- `<SettlementsTable initialQuery={{ period, filters }} />` (client component fetches /api/driver-pay/reports/settlements)
- `<OperationalMetrics period={period} />` (client component fetches /api/driver-pay/reports/operational-metrics)
- Wrap each section that fetches in `<Suspense fallback={<Skeleton className="h-32 w-full" />}>` — NO spinners
- Empty state: if `kpis.totalPayroll === '0.00'`: show centered card "No payroll activity in this period" with subtle illustration (just a Lucide icon `CalendarOff`) — meets Section 8.6 empty-state requirement

**2. Per-driver detail page (server component): `reports/[driverId]/page.tsx`**
- Auth check same as above (DRIVER → redirect)
- `const { driverId } = await params; const { year } = searchParams ?? {};`
- Server fetch: call `computeDriverDetail(prisma, session.tenantId, driverId, year ?? currentYear)`
- If driver not found → notFound() (Next 14+ helper)
- Render: page header "{firstName} {lastName} — {employmentType}" + breadcrumb back to /carrier/driver-pay/reports
- 3 KpiCard row: YTD Earnings, YTD Deductions, YTD Bonuses
- Section "Settlements (YTD)" → shadcn/ui Table, paginated client-side (simple page state)
- Section "Bonuses Earned (YTD)" → list cards with "{bonusType} · ${amount} · Installment {n}/{total} · {awardedAt}"
- Section "Deduction Balances (Fixed Installments)" → for each: label + Tailwind progress bar (`<div className="h-2 bg-muted rounded"><div style={{width:`${pct}%`}} className="h-2 bg-primary rounded" /></div>`) + "${amountCollected} / ${totalAmount}"
- Section "Net Pay Trend (Last 4 Settlements)" → `<NetPaySparkline data={last4NetPay} />`
- Empty state per section if arrays empty

**3. KpiCard component (server-safe, no client hooks):**
- Props: `{ label: string; value: string; deltaPct: number|null; trendUp?: boolean; isMoney?: boolean }`
- Big number: format with Intl.NumberFormat USD if isMoney, else as-is
- Arrow: ArrowUp (green) if deltaPct > 0, ArrowDown (red) if < 0, Minus (muted) if 0 or null
- Show "{absPct}% vs prior period" below value
- Use Card from @/components/ui/card; `text-2xl font-semibold` for the value

**4. PeriodSelector (client):**
- Use shadcn Select (@/components/ui/select)
- Options: This Week, Last Week, This Month, Last Month, Custom Range
- On change: push new search params via `useRouter().push(`?period=${val}`)` keeping other params
- If Custom: render two `<input type="date">` next to it; commit via "Apply" button

**5. FilterBar (client):**
- Driver multi-select: lightweight popover with checkbox list — fetch /api/driver-pay/drivers (already exists) and cache via useSWR or useEffect+useState. NO new endpoint.
- Employment Type: shadcn Select (All / Employee / Contractor)
- Status: shadcn Select (All / Draft / Finalized / Paid / Voided)
- "Reset filters" button when any filter is non-default
- Updates query string via router.push

**6. NetPayTrendChart (client, uses recharts):**
- `'use client'`
- Import: `import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'`
- Height 240, ResponsiveContainer width="100%"
- Format Y axis with Intl.NumberFormat USD compact ($1.2k)
- Empty state: "No data for this period" centered

**7. DeductionDonut (client, recharts PieChart):**
- Use PieChart + Pie (innerRadius={50}, outerRadius={80})
- Colors from a fixed palette (5–7 hex values matching existing dark-mode-safe Tailwind tokens — use HSL CSS vars from globals.css if present, else fall back to `["#0ea5e9", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#84cc16"]`)
- Legend on the right (vertical, scrollable)
- Empty state same pattern

**8. SettlementsTable (client):**
- State: page, pageSize=25, sortBy, sortDir
- useEffect fetches /api/driver-pay/reports/settlements when state or initialQuery changes
- shadcn Table; sortable column headers (clickable, ArrowUp/Down icon)
- Columns: Driver (firstName lastName, links to /carrier/driver-pay/reports/{driverId}), Period (periodStart–periodEnd via date-fns format 'MMM d'), Gross Taxable, Gross Non-Taxable, Total Deductions, Net Pay, Status (Badge), Anomaly (red Badge if isAnomaly)
- Pagination controls below: "Showing {start}–{end} of {total}" + Prev/Next buttons
- "Export CSV" button (top-right): `<Button variant="outline" size="sm" onClick={() => alert('CSV export wires up in Phase 11')} title="TODO: Wire to Phase 11 export engine"><Download className="h-4 w-4 mr-2" />Export CSV</Button>` — leave a `// TODO(phase-11): wire to export engine` code comment immediately above the button
- Skeleton state: 5 rows of skeleton TableCell while loading (NOT a spinner)

**9. OperationalMetrics (client):**
- useEffect fetches /api/driver-pay/reports/operational-metrics with current period
- Layout: 4 small metric cards (avgDaysApprovedToPaid → "{n} days", totalDisputes + topDisputedDriver, garnishmentCapHitRate as percent, carryoverQueueSize)
- Skeleton state for each card while loading

**10. NetPaySparkline (client, recharts):**
- Tiny LineChart, height=60, no axes, no grid, single line, Tooltip on hover
- Color: primary token

GLOBAL UX:
- All dollar amounts formatted with `new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value))` — note: the Number() conversion is for display formatting only; the underlying string from the API was already Decimal-precise
- All dates formatted with `date-fns/format` 'MMM d, yyyy'
- Dark mode: rely on existing CSS variables in apps/web/src/app/globals.css; no manual color overrides
- IMPORTANT: Do NOT modify or delete the old `/carrier/reports/driver-pay/page.tsx` stub — it's a different module. Our work lives under `/carrier/driver-pay/reports/`.

Page-level CSV stubs: also add an "Export CSV" button next to "Operational Metrics" and on the per-driver settlement table — both with the same alert + TODO(phase-11) pattern.
  </action>
  <verify>
- `npx tsc --noEmit --project apps/web/tsconfig.json` passes
- Boot dev server (`cd apps/web && npm run dev`), navigate to /carrier/driver-pay/reports — page renders without console errors
- Switch period dropdown to "Last Month" → URL updates with ?period=last_month and KPIs recompute
- Click a settlement row → navigates to /carrier/driver-pay/reports/{driverId}
- `grep -rn "TODO(phase-11)" apps/web/src/app/\(owner\)/carrier/driver-pay/reports/` returns at least 3 hits
- `grep -rn "Spinner\\|<Loading" apps/web/src/app/\(owner\)/carrier/driver-pay/reports/` returns 0 hits (we use Skeleton)
  </verify>
  <done>
Both pages render at /carrier/driver-pay/reports and /carrier/driver-pay/reports/[driverId]. All 8 components compile and are wired in. Period selector + filters update URL params and trigger refetches. Charts render with real data. CSV buttons are present as stubs.
  </done>
</task>

<task type="auto">
  <name>Task 4: Vitest suite for reports — KPIs, period boundaries, trend %, tenant isolation, RBAC</name>
  <files>apps/web/src/app/api/driver-pay/__tests__/reports-api.test.ts</files>
  <action>
Create `apps/web/src/app/api/driver-pay/__tests__/reports-api.test.ts`. Match the mocking style of `settlements-tenant.test.ts` (already in the same folder):
- `vi.mock('@/lib/auth/supabase', () => ({ getSession: vi.fn() }))`
- `vi.mock('@/lib/context/tenant-context', () => ({ getTenantPrisma: vi.fn() }))`

Structure the file as 5 describe blocks:

**describe('GET /api/driver-pay/reports/overview — RBAC')**
- it('returns 401 with no session') — getSession returns null, expect 401
- it('returns 403 for DRIVER role') — session.role='DRIVER', expect 403, JSON {error:'Forbidden'}
- it('returns 200 for OWNER role') — session.role='OWNER', mock prisma returns empty arrays, expect 200

**describe('KPI computations')**
Build a handcrafted fixture: 3 drivers in tenant-A, 5 settlements with known netPay/totalDeductions/grossTaxable/grossNonTaxable + 2 bonuses awarded in range. Mock prisma.driverSettlement.findMany to return the fixture; prisma.driverBonus.findMany returns the 2 bonuses; for the prior-period query, return a second smaller fixture.
- Compute expected totals BY HAND in the test (with Decimal) and assert each KPI matches: totalPayroll, driversPaid, avgNetPay, totalDeductions, totalBonuses
- Assert prior-period deltas use computeDeltaPct (prior 100 → current 150 should yield delta=50)

**describe('Period boundary handling')**
- Mock period 'this_week' as Mon 2026-05-11 → Sun 2026-05-17 (use a fixed `now`: pass `now: new Date('2026-05-13T12:00:00Z')` to getPeriodRange)
- Create a settlement with periodStart=2026-05-11 (boundary day) → assert it IS counted
- Create a settlement with periodStart=2026-05-10 (one day before) → assert it is NOT counted
- This proves `>=` is used for start and the date math is inclusive

**describe('Trend percentage math')**
- Direct unit test of computeDeltaPct (no mocking needed)
- prior=Decimal('100'), current=Decimal('150') → 50
- prior=Decimal('200'), current=Decimal('100') → -50
- prior=Decimal('0'), current=Decimal('500') → null (divide-by-zero)
- prior=Decimal('100'), current=Decimal('100') → 0

**describe('Tenant isolation')**
- Mock getTenantPrisma to return a prisma where driverSettlement.findMany asserts that the where clause has `tenantId: 'tenant-A'`
- Use a spy: `const findManySpy = vi.fn(...).mockResolvedValue([])`
- Call GET handler with session.tenantId='tenant-A'
- Assert `findManySpy.mock.calls[0][0].where.tenantId === 'tenant-A'`
- Repeat for the per-driver detail route: call GET with driverId belonging to tenant-B (mock CarrierDriver.findFirst to return null) → expect 404

**describe('Per-driver detail — RBAC')**
- it('returns 403 for DRIVER role on /reports/drivers/[driverId]') even when driverId matches their own userId (this endpoint is OWNER-only; drivers use the existing /api/driver-pay/me/* routes)

Helper: write a `makeSettlement(id, tenantId, driverId, overrides)` factory at top of file. The Decimal fields should be returned as `Prisma.Decimal`-like objects with `.toString()` method (match settlements-tenant.test.ts factory at line 52).

Run target: `cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/reports-api.test.ts`
  </action>
  <verify>
- `cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/reports-api.test.ts` → all describe blocks pass, no skipped tests
- Total test count >= 12 (3 RBAC + 5 KPI + 3 period + 4 delta + 2 isolation = ~17)
- `npx tsc --noEmit --project apps/web/tsconfig.json` still passes after test file added
  </verify>
  <done>
Test file exists and passes. Every requirement from the task description is covered: KPI math against handcrafted fixture, period boundary inclusion, trend pct including div-by-zero, tenant isolation via where-clause spy, DRIVER → 403.
  </done>
</task>

</tasks>

<verification>
After all tasks:
1. `cd apps/web && npx tsc --noEmit` → 0 errors
2. `cd apps/web && npx vitest run src/app/api/driver-pay/__tests__/reports-api.test.ts` → all green
3. Boot `npm run dev` from repo root, sign in as owner, visit /carrier/driver-pay/reports → dashboard renders with 5 KPIs, 2 charts, settlements table, operational metrics
4. Click a settlement row → /carrier/driver-pay/reports/{driverId} renders YTD + tables + sparkline
5. Open browser devtools, attempt fetch('/api/driver-pay/reports/overview') with a driver session cookie → 403
6. Verify no `parseFloat`, no native float arithmetic on money fields: `grep -rn "parseFloat\\|Number(\\|\\*\\|/" apps/web/src/lib/driver-pay/reporting.ts` — only multiplication on counts/percentages, not money strings
7. Verify CSV stubs: `grep -rn "TODO(phase-11)" apps/web/src/app/\(owner\)/carrier/driver-pay/reports/` returns >=3 hits
</verification>

<success_criteria>
- 4 API routes live under /api/driver-pay/reports/* — all read-only, RBAC-gated, tenant-scoped
- 2 pages live under /carrier/driver-pay/reports — dashboard + per-driver detail
- 8 reports components built with skeleton loading, dark mode, empty states
- recharts used for trend line, donut, sparkline (not custom SVG)
- decimal.js used for ALL money math in reporting.ts and tests
- date-fns used for ALL date math (no native Date arithmetic for ranges)
- Vitest suite covers RBAC, KPI fixtures, period boundaries, trend %, tenant isolation
- TypeScript strict mode clean — no new `any` types in route/component code
- CSV download buttons present as stubs with TODO(phase-11) comments
- Anomaly red badge surfaces when driver net pay deviates >25% from rolling 4-week avg
- No writes added anywhere; old /carrier/reports/driver-pay/page.tsx stub left untouched
</success_criteria>

<output>
After completion, create `.planning/quick/307-driver-pay-phase-10-read-only-reporting-/307-SUMMARY.md` summarizing:
- Files created (paths)
- Test results (count, pass/fail)
- KPI fixture totals proven by tests
- Routes added and their RBAC posture
- Open items for Phase 11 (CSV export wiring locations)
</output>
