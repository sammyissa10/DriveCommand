---
phase: quick-10
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/lane-analytics.ts
  - src/app/(owner)/lane-analytics/page.tsx
  - src/components/lanes/lane-profitability-table.tsx
  - src/components/lanes/lane-summary-cards.tsx
  - src/components/lanes/lane-profit-chart.tsx
  - src/components/navigation/sidebar.tsx
autonomous: true

must_haves:
  truths:
    - "Owner/Manager can view profitability broken down by origin-destination lane"
    - "Each lane shows route count, total revenue, total expenses, profit, and margin"
    - "Lanes are sortable and ranked by profitability"
    - "Summary cards show top performing and worst performing lanes at a glance"
    - "A bar chart visualizes profit by lane for quick comparison"
  artifacts:
    - path: "src/app/(owner)/actions/lane-analytics.ts"
      provides: "Server action that aggregates route financial data by origin-destination pair"
      exports: ["getLaneAnalytics"]
    - path: "src/app/(owner)/lane-analytics/page.tsx"
      provides: "Lane analytics dashboard page"
    - path: "src/components/lanes/lane-profitability-table.tsx"
      provides: "Sortable table of lanes with financial metrics"
    - path: "src/components/lanes/lane-summary-cards.tsx"
      provides: "Top/bottom lane summary cards"
    - path: "src/components/lanes/lane-profit-chart.tsx"
      provides: "Bar chart of profit by lane using Recharts"
    - path: "src/components/navigation/sidebar.tsx"
      provides: "Updated sidebar with Lane Analytics link"
  key_links:
    - from: "src/app/(owner)/lane-analytics/page.tsx"
      to: "src/app/(owner)/actions/lane-analytics.ts"
      via: "server action import"
      pattern: "getLaneAnalytics"
    - from: "src/app/(owner)/lane-analytics/page.tsx"
      to: "src/components/lanes/*"
      via: "component imports"
      pattern: "LaneProfitabilityTable|LaneSummaryCards|LaneProfitChart"
    - from: "src/components/navigation/sidebar.tsx"
      to: "/lane-analytics"
      via: "sidebar link"
      pattern: "lane-analytics"
---

<objective>
Build a Profit Per Lane Analysis dashboard that aggregates route financial data by origin-destination pairs (lanes), showing profitability metrics per lane with sortable table, summary cards, and bar chart visualization.

Purpose: Enables fleet owners to identify their most and least profitable routes/lanes so they can make data-driven decisions about which lanes to prioritize or avoid.
Output: New /lane-analytics page accessible from sidebar under Intelligence section.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@prisma/schema.prisma (Route model with origin, destination, expenses, payments)
@src/lib/finance/route-calculator.ts (calculateRouteFinancials, Decimal patterns)
@src/app/(owner)/actions/route-analytics.ts (existing route analytics patterns)
@src/components/navigation/sidebar.tsx (sidebar navigation structure)
@src/app/(owner)/fuel/page.tsx (dashboard page pattern with parallel data fetching)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Build lane analytics server action and data aggregation</name>
  <files>src/app/(owner)/actions/lane-analytics.ts</files>
  <action>
Create a server action file `src/app/(owner)/actions/lane-analytics.ts` that:

1. Export `getLaneAnalytics(timeframeDays?: number)` — default 90 days, OWNER/MANAGER only (use requireRole pattern from route-analytics.ts).

2. Query all COMPLETED routes within the timeframe, including their expenses (non-deleted, `deletedAt: null`) and payments (non-deleted, `deletedAt: null`). Select: `id`, `origin`, `destination`, `startOdometer`, `endOdometer`, `completedAt`, `expenses.amount`, `payments.amount`, `payments.status`.

3. Normalize lane keys: trim and uppercase both origin and destination to group "Chicago, IL" and "chicago, il" as the same city. Create a lane key as `${normalizedOrigin} -> ${normalizedDestination}`.

4. For each lane, aggregate using Decimal.js (import `Prisma` from `@/generated/prisma`, use `Prisma.Decimal` — NEVER use JavaScript number for money math):
   - `routeCount`: number of routes on this lane
   - `totalRevenue`: sum of all payment amounts (string, 2 decimal places)
   - `totalExpenses`: sum of all expense amounts (string, 2 decimal places)
   - `profit`: totalRevenue - totalExpenses (string, 2 decimal places)
   - `marginPercent`: (profit / totalRevenue) * 100, or 0 if no revenue (number, 2 decimal places)
   - `avgProfitPerRoute`: profit / routeCount (string, 2 decimal places)
   - `totalMiles`: sum of (endOdometer - startOdometer) for routes with valid odometer data (number or null)
   - `profitPerMile`: profit / totalMiles if totalMiles > 0, else null (string or null, 2 decimal places)

5. Return interface:
```typescript
export interface LaneData {
  lane: string;           // "CHICAGO, IL -> DALLAS, TX"
  origin: string;         // Normalized origin
  destination: string;    // Normalized destination
  routeCount: number;
  totalRevenue: string;
  totalExpenses: string;
  profit: string;
  marginPercent: number;
  avgProfitPerRoute: string;
  totalMiles: number | null;
  profitPerMile: string | null;
}

export interface LaneAnalytics {
  lanes: LaneData[];          // Sorted by profit descending
  totalLanes: number;
  totalRoutes: number;
  overallRevenue: string;
  overallExpenses: string;
  overallProfit: string;
  overallMargin: number;
  timeframeDays: number;
}
```

6. Sort lanes by profit descending (best lanes first). Use Decimal comparison, not parseFloat.

7. Calculate overall fleet totals (sum across all lanes) for the summary.

Use the same auth/tenant patterns as route-analytics.ts: `requireRole`, `requireTenantId`, `getTenantPrisma`.
  </action>
  <verify>TypeScript compiles: `npx tsc --noEmit --pretty 2>&1 | head -30` (no errors in lane-analytics.ts)</verify>
  <done>Server action returns lane-level profitability data aggregated from completed routes with Decimal.js precision</done>
</task>

<task type="auto">
  <name>Task 2: Build lane analytics dashboard page with table, cards, and chart</name>
  <files>
    src/app/(owner)/lane-analytics/page.tsx
    src/components/lanes/lane-profitability-table.tsx
    src/components/lanes/lane-summary-cards.tsx
    src/components/lanes/lane-profit-chart.tsx
  </files>
  <action>
Create the lane analytics dashboard with 3 client components and 1 server page.

**Page: `src/app/(owner)/lane-analytics/page.tsx`**
- Server component, `export const fetchCache = 'force-no-store'`
- `requireRole([UserRole.OWNER, UserRole.MANAGER])`
- Accept `searchParams` with optional `days` (default 90). Use `await searchParams` (Next.js 16 pattern).
- Call `getLaneAnalytics(days)` from the server action
- Layout: page header with title "Lane Profitability Analysis" and subtitle, then timeframe selector (links to ?days=30, ?days=90, ?days=180, ?days=365 — use Link with active state styling), then summary cards row, then bar chart, then full table
- Follow the fuel page pattern for layout structure (page header, grid sections)

**Component: `src/components/lanes/lane-summary-cards.tsx`** ("use client")
- Accept `LaneAnalytics` data as props
- Show 4 summary cards in a responsive grid (grid-cols-1 md:grid-cols-2 lg:grid-cols-4):
  1. **Total Lanes** — count with total routes subtitle
  2. **Overall Profit** — formatted as currency, green if positive/red if negative
  3. **Best Lane** — lane name + profit (first item in sorted array) — show "N/A" if no lanes
  4. **Worst Lane** — lane name + profit (last item with routeCount > 0) — show "N/A" if no lanes
- Use card styling: `rounded-xl border border-border bg-card p-6 shadow-sm` (matching existing route cards)
- Format currency using `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })` with parseFloat for DISPLAY ONLY

**Component: `src/components/lanes/lane-profit-chart.tsx`** ("use client")
- Accept `lanes: LaneData[]` as prop
- Show top 10 lanes (or fewer) in a horizontal BarChart using Recharts (already in project)
- Import: `BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell` from 'recharts'
- X-axis: lane name (truncate long names to 20 chars), Y-axis: profit in dollars
- Color bars green for positive profit, red for negative profit using `<Cell>` per bar
- Tooltip shows lane, profit formatted as currency, route count, margin %
- Wrap in card container with heading "Top Lanes by Profit"
- Handle empty state: show "No lane data available" message

**Component: `src/components/lanes/lane-profitability-table.tsx`** ("use client")
- Accept `lanes: LaneData[]` as prop
- Use `useState` for sort column and sort direction. Default: sort by profit descending.
- Sortable columns (click header to toggle): Lane, Routes, Revenue, Expenses, Profit, Margin %, Avg Profit/Route, Profit/Mile
- Table with `<table>` element, standard Tailwind table styling (`divide-y`, `text-sm`, alternating row colors)
- Format money columns as currency (parseFloat + Intl.NumberFormat for DISPLAY ONLY)
- Color profit column: green text for positive, red for negative
- Color margin column: green for >= 10% (tenant threshold default), amber for 0-10%, red for negative
- Show "N/A" for null profitPerMile values
- Handle empty state: "No completed routes found in the selected timeframe"
- Show lane origin and destination on separate lines within the Lane column for readability (origin on top in bold, arrow, destination below)

All components use existing Tailwind classes and patterns from the project. No new dependencies required (Recharts already available).
  </action>
  <verify>TypeScript compiles: `npx tsc --noEmit --pretty 2>&1 | head -30`. Page accessible at /lane-analytics (verify with `ls src/app/\(owner\)/lane-analytics/page.tsx`).</verify>
  <done>Lane analytics dashboard renders with summary cards, bar chart of top lanes, and sortable profitability table</done>
</task>

<task type="auto">
  <name>Task 3: Add Lane Analytics to sidebar navigation</name>
  <files>src/components/navigation/sidebar.tsx</files>
  <action>
Update `src/components/navigation/sidebar.tsx`:

1. Import `TrendingUp` from `lucide-react` (add to the existing import destructuring — TrendingUp represents profitability/analytics well).

2. Add a new `SidebarMenuItem` in the **Intelligence** section (inside the `canViewFleetIntelligence` block), after the "Fuel & Energy" item:

```tsx
<SidebarMenuItem>
  <SidebarMenuButton
    asChild
    isActive={pathname.startsWith("/lane-analytics")}
    tooltip="Lane Profitability"
  >
    <Link href="/lane-analytics">
      <TrendingUp />
      <span>Lane Profitability</span>
    </Link>
  </SidebarMenuButton>
</SidebarMenuItem>
```

This places lane analytics alongside other intelligence dashboards (Live Map, Safety, Fuel & Energy) since it is an analytics/intelligence feature for OWNER/MANAGER only.
  </action>
  <verify>Grep for "lane-analytics" in sidebar.tsx confirms the link is present. TypeScript compiles without errors.</verify>
  <done>Sidebar shows "Lane Profitability" link under Intelligence section for OWNER/MANAGER users</done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with no errors
2. `grep -r "lane-analytics" src/` shows page, action, and sidebar references
3. Lane analytics action uses Decimal.js for all financial calculations (grep for "new Decimal" in lane-analytics.ts)
4. No JavaScript number arithmetic used for money (no `+` or `*` on amounts)
5. requireRole check prevents DRIVER access
</verification>

<success_criteria>
- /lane-analytics page loads and shows profitability data by origin-destination pair
- Summary cards display total lanes, overall profit, best lane, worst lane
- Bar chart shows top 10 lanes colored by profitability (green/red)
- Table is sortable by any column (profit, margin, revenue, etc.)
- Timeframe selector allows 30/90/180/365 day views
- Sidebar shows "Lane Profitability" under Intelligence for OWNER/MANAGER roles
- All money calculations use Decimal.js (never JavaScript number type)
</success_criteria>

<output>
After completion, create `.planning/quick/10-build-profit-per-lane-analysis/10-SUMMARY.md`
</output>
