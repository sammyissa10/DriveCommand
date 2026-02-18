---
phase: quick-10
plan: "01"
subsystem: lane-analytics
tags: [analytics, profitability, finance, recharts, server-actions]
dependency_graph:
  requires:
    - Route model with origin, destination, expenses, payments (Prisma)
    - Decimal.js via Prisma.Decimal for financial math
    - requireRole/requireTenantId/getTenantPrisma auth patterns
    - Recharts (already in project)
  provides:
    - getLaneAnalytics server action
    - /lane-analytics page with timeframe selector
    - Lane profitability breakdown by origin-destination pair
  affects:
    - src/components/navigation/sidebar.tsx (new nav item)
tech_stack:
  added: []
  patterns:
    - Decimal.js aggregation over route financials grouped by lane key
    - Normalized lane keys (trim + toUpperCase) for consistent grouping
    - Client-side sortable table with useState for sort column/direction
    - Recharts BarChart with per-bar Cell coloring (green/red)
    - Next.js 16 searchParams await pattern for timeframe selection
key_files:
  created:
    - src/app/(owner)/actions/lane-analytics.ts
    - src/app/(owner)/lane-analytics/page.tsx
    - src/components/lanes/lane-summary-cards.tsx
    - src/components/lanes/lane-profit-chart.tsx
    - src/components/lanes/lane-profitability-table.tsx
  modified:
    - src/components/navigation/sidebar.tsx
decisions:
  - Normalize lane keys with trim+toUpperCase so "Chicago, IL" and "CHICAGO, IL" aggregate to the same lane
  - Sort lanes by profit using Decimal.comparedTo (not parseFloat) to preserve precision in sort
  - Display only top 10 lanes in bar chart to avoid overcrowding; full table shows all lanes
  - Use -Infinity sentinel for null profitPerMile values during client-side table sort
  - Chart uses raw Recharts (BarChart/Bar/Cell) not ChartContainer — direct tooltip required for multi-field tooltip with lane/routes/margin
metrics:
  duration: "~10 minutes"
  completed: "2026-02-18"
  tasks_completed: 3
  files_affected: 6
---

# Quick Task 10: Profit Per Lane Analysis Summary

**One-liner:** Lane profitability dashboard aggregating completed routes by origin-destination pair using Decimal.js, with sortable table, Recharts bar chart, and summary cards showing best/worst lanes.

## What Was Built

A new `/lane-analytics` page accessible from the sidebar Intelligence section (OWNER/MANAGER only) that breaks down fleet profitability by origin-destination lane (e.g., "CHICAGO, IL -> DALLAS, TX").

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Lane analytics server action | `104801b` | `lane-analytics.ts` |
| 2 | Dashboard page, chart, cards, table | `7e5552e` | `page.tsx`, 3 components |
| 3 | Sidebar navigation update | `4cc3422` | `sidebar.tsx` |

## Architecture

### Server Action (`lane-analytics.ts`)
- `getLaneAnalytics(timeframeDays = 90)` — OWNER/MANAGER only
- Queries all COMPLETED routes within timeframe with nested expenses/payments (deletedAt: null)
- Groups routes by normalized lane key (`${ORIGIN} -> ${DESTINATION}`)
- All arithmetic uses `Prisma.Decimal` — zero float errors
- Returns `LaneAnalytics` with per-lane `LaneData[]` sorted by profit descending

### Page (`lane-analytics/page.tsx`)
- Server component with `fetchCache = 'force-no-store'`
- Timeframe selector: 30/90/180/365 day views via `?days=` searchParam
- Renders: `LaneSummaryCards` → `LaneProfitChart` → `LaneProfitabilityTable`

### Components
- **`LaneSummaryCards`**: 4-card grid (Total Lanes, Overall Profit, Best Lane, Worst Lane)
- **`LaneProfitChart`**: Top 10 lanes bar chart; green bars for profit >= 0, red for negative; custom multi-field tooltip
- **`LaneProfitabilityTable`**: 8-column sortable table with click-to-toggle sort, alternating row colors, color-coded profit/margin columns

## Key Decisions

1. **Lane key normalization** — `trim().toUpperCase()` ensures consistent grouping regardless of data entry casing
2. **Decimal sort** — `Decimal.comparedTo()` used for profit-descending sort, not `parseFloat`
3. **Chart shows top 10** — Prevents visual overcrowding; full detail available in table
4. **`-Infinity` sentinel** — Null `profitPerMile` values sort to bottom when sorted ascending in table
5. **Raw Recharts** — Used `BarChart/Bar/Cell` directly (not `ChartContainer`) to support per-bar coloring and multi-field tooltips

## Deviations from Plan

None — plan executed exactly as written.

## Success Criteria Verification

- [x] `/lane-analytics` page loads with profitability data by origin-destination pair
- [x] Summary cards display total lanes, overall profit, best lane, worst lane
- [x] Bar chart shows top 10 lanes colored green (profit) / red (loss)
- [x] Table is sortable by all 8 columns (click toggles asc/desc)
- [x] Timeframe selector: 30/90/180/365 day views
- [x] Sidebar shows "Lane Profitability" under Intelligence (OWNER/MANAGER only)
- [x] All money calculations use Decimal.js — 12 `new Decimal` usages in server action, never JS number arithmetic

## Self-Check: PASSED

Files created:
- `src/app/(owner)/actions/lane-analytics.ts` — exists (committed `104801b`)
- `src/app/(owner)/lane-analytics/page.tsx` — exists (committed `7e5552e`)
- `src/components/lanes/lane-summary-cards.tsx` — exists (committed `7e5552e`)
- `src/components/lanes/lane-profit-chart.tsx` — exists (committed `7e5552e`)
- `src/components/lanes/lane-profitability-table.tsx` — exists (committed `7e5552e`)
- `src/components/navigation/sidebar.tsx` — modified (committed `4cc3422`)

TypeScript: `npx tsc --noEmit` passes with no errors.
Decimal.js: 12 `new Decimal` usages in server action — no JS number arithmetic on money.
Sidebar: `lane-analytics` href present in `sidebar.tsx` at lines 157-160.
