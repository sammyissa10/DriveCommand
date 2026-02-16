---
phase: 13
plan: 02
subsystem: safety-analytics-ui
tags: [safety, dashboard, charts, recharts, shadcn]
dependencies:
  requires: [13-01-safety-data-layer, shadcn-components, server-actions]
  provides: [safety-dashboard-page, safety-chart-components]
  affects: [owner-manager-navigation]
tech_stack:
  added: [recharts-charts, localStorage-persistence]
  patterns: [server-component-parallel-fetch, client-chart-components, empty-state-handling]
key_files:
  created:
    - src/components/safety/safety-score-card.tsx
    - src/components/safety/event-distribution-chart.tsx
    - src/components/safety/safety-trend-chart.tsx
    - src/components/safety/driver-leaderboard.tsx
    - src/components/safety/threshold-config.tsx
    - src/app/(owner)/safety/page.tsx
  modified: []
decisions:
  - Use shadcn Badge variants for severity display (outline, secondary, destructive)
  - Use localStorage for threshold config persistence (mock data context, no backend needed)
  - Empty state handling for all charts (show fallback messages instead of crashing)
  - Responsive grid layout (1 col mobile, multi-col desktop)
metrics:
  duration: 3m 23s
  tasks_completed: 2
  files_created: 6
  files_modified: 0
  commits: 2
  completed_at: 2026-02-16T05:10:31Z
---

# Phase 13 Plan 02: Safety Analytics Dashboard UI Summary

**One-liner:** Complete safety dashboard at /safety with 5 interactive chart/widget components covering fleet score, event distribution, trends, leaderboard, and threshold configuration.

## What Was Built

### Five Chart/Widget Components

**1. SafetyScoreCard (`src/components/safety/safety-score-card.tsx`)** - SAFE-01
- Large 0-100 composite score with color coding (green, yellow, orange, red)
- Score label (Excellent, Good, Needs Improvement, Poor) via `getScoreLabel()`
- Total events count display
- Severity breakdown badges: LOW (outline), MEDIUM (secondary), HIGH (orange destructive), CRITICAL (red destructive)
- Empty state: Shows Shield icon with "No safety events recorded" message when totalEvents === 0

**2. EventDistributionChart (`src/components/safety/event-distribution-chart.tsx`)** - SAFE-02
- Two charts side-by-side (responsive grid):
  - **Bar chart:** Horizontal bar chart showing event counts by type (8 event types), using Recharts BarChart with `layout="vertical"` for readable labels
  - **Donut chart:** PieChart with `innerRadius={60}` showing severity distribution, center label displays total events count
- ChartContainer with `min-h-[300px]` to prevent chart collapse (critical for Recharts rendering)
- Empty state: Shows message when no events exist

**3. SafetyTrendChart (`src/components/safety/safety-trend-chart.tsx`)** - SAFE-03
- Line chart showing 30-day daily safety score trend
- XAxis with MM/DD date formatting, YAxis with 0-100 domain for consistent scale
- CartesianGrid with dashed lines, monotone line type with activeDot on hover
- Empty state: Shows "No trend data available" message

**4. DriverLeaderboard (`src/components/safety/driver-leaderboard.tsx`)** - SAFE-04
- Ranked list of trucks sorted by safety score (best first)
- Each row shows: rank number, truck name (make + model), license plate, safety score with color coding, score label, total events
- Top 3 performers get Trophy icon indicator
- Low performers (score < 60) get AlertTriangle warning icon
- Alternating row backgrounds (odd rows: `bg-muted/50`)
- Empty state: Shows "No vehicles found" message

**5. ThresholdConfig (`src/components/safety/threshold-config.tsx`)** - SAFE-05
- Three vehicle class tabs: Light Duty, Medium Duty, Heavy Duty
- Per-class g-force thresholds: Harsh Braking, Harsh Acceleration, Harsh Cornering
- Default values: Light (0.45, 0.35, 0.30), Medium (0.35, 0.30, 0.25), Heavy (0.25, 0.20, 0.20)
- localStorage persistence with key `drivecommand-safety-thresholds`
- Input validation: 0.1 to 5.0 range, step 0.05
- "Save All Thresholds" button with success feedback message

### Safety Dashboard Page (`src/app/(owner)/safety/page.tsx`)

- **Server component** with role-based auth (`OWNER` and `MANAGER` only)
- **Parallel data fetching** with `Promise.all()` for all 4 server actions:
  - `getFleetSafetyScore()` - Overall fleet score and severity breakdown
  - `getEventDistribution()` - Event distribution by type and severity
  - `getSafetyScoreTrend(30)` - 30-day daily trend data
  - `getDriverRankings()` - Truck safety rankings
- **fetchCache = 'force-no-store'** for fresh data on every load
- **Responsive layout structure:**
  - Page header with title and description
  - Top row: Score card (1 col) + Event distribution (2 cols) on lg screens
  - Full-width trend chart
  - Bottom row: Leaderboard (1 col) + Threshold config (1 col) on lg screens
  - All sections stack vertically on mobile

## Technical Decisions

### Badge Variants for Severity Display

**Decision:** Use shadcn Badge component with different variants for each severity level

**Rationale:**
- LOW: `outline` variant (subtle, gray border) - minimal visual emphasis
- MEDIUM: `secondary` variant (muted background) - moderate emphasis
- HIGH: `destructive` with custom orange color override - strong emphasis
- CRITICAL: standard `destructive` (red) - strongest emphasis

**Impact:** Provides clear visual hierarchy for severity levels matching user expectations.

### localStorage for Threshold Persistence

**Decision:** Store threshold configuration in localStorage instead of backend API

**Rationale:** In mock data context (no real hardware integration), thresholds are client-side settings that don't need server persistence. localStorage provides immediate feedback and persistence across page reloads without backend complexity.

**Future:** When real-time safety monitoring is integrated with hardware, thresholds should be stored server-side and applied to event detection at the device level.

### Empty State Handling

**Decision:** All chart components explicitly handle empty state with fallback messages

**Rationale:** Prevents broken UI when no data exists (new tenants, filtered date ranges). Recharts can render empty/broken charts if data array is empty, so explicit checks prevent this.

**Pattern:** `if (data.length === 0) return <EmptyStateUI />`

### Responsive Grid Layout

**Decision:** Use Tailwind grid classes with `grid-cols-1 lg:grid-cols-*` pattern for all sections

**Rationale:** Mobile-first approach: all sections stack vertically on small screens, expand to multi-column on large screens. Matches established pattern from dashboard and live-map pages.

**Breakpoints:**
- Mobile: single column
- Desktop (lg): Score card 1/3 width + Event distribution 2/3 width, Leaderboard + Thresholds 1/2 each

## Deviations from Plan

None - plan executed exactly as written.

## Files Created

### Chart Components (5 files)

**`src/components/safety/safety-score-card.tsx`**
- Client component with SafetyScoreCard props interface
- Uses `getScoreColor()` and `getScoreLabel()` from score calculator
- Shield icon from lucide-react
- Badge component for severity breakdown

**`src/components/safety/event-distribution-chart.tsx`**
- Client component with two Recharts charts (BarChart + PieChart)
- ChartConfig for theme colors (chart-1 through chart-5)
- Responsive grid for side-by-side layout
- Center label for donut chart showing total events

**`src/components/safety/safety-trend-chart.tsx`**
- Client component with Recharts LineChart
- Date formatting function for MM/DD display
- CartesianGrid, XAxis, YAxis, Line components
- Fixed Y-axis domain [0, 100] for consistent scale

**`src/components/safety/driver-leaderboard.tsx`**
- Client component with ranking display logic
- Trophy icon for top 3, AlertTriangle for low performers
- Alternating row backgrounds for readability
- Truncate text for long truck names

**`src/components/safety/threshold-config.tsx`**
- Client component with useState and useEffect hooks
- Tabs component for vehicle class selection
- Input components with number type and validation
- localStorage load on mount, save on button click
- Temporary success message on save

### Safety Dashboard Page

**`src/app/(owner)/safety/page.tsx`**
- Server component (no 'use client' directive)
- Role auth check with `requireRole([UserRole.OWNER, UserRole.MANAGER])`
- Promise.all for parallel data fetching
- fetchCache = 'force-no-store' export
- Responsive grid layout with all 5 components

## Testing & Verification

- **TypeScript compilation:** `npx tsc --noEmit` passes with no errors
- **Build:** `npm run build` completes successfully, `/safety` route appears in build output
- **All components:** Have 'use client' directive (except page.tsx which is server component)
- **Empty state handling:** All charts render fallback messages when data is empty
- **Responsive layout:** Grid classes properly configured for mobile/desktop

## Key Patterns Established

### Server Component + Client Chart Pattern

- **Server component page:** Fetches data via server actions, passes as props
- **Client chart components:** Receive pre-aggregated data, handle rendering with Recharts
- **No data fetching in client components:** All data comes from server props
- **Benefits:** SSR-compatible, no client-side data fetching waterfalls, optimal performance

### ChartContainer min-h Pattern

- **Critical requirement:** All ChartContainer components must have `className="min-h-[300px] w-full"`
- **Reason:** Without min-h, ResponsiveContainer renders at 0px height (invisible chart)
- **Applies to:** All Recharts components (BarChart, PieChart, LineChart)

### Parallel Data Fetching

- **Pattern:** `const [data1, data2, ...] = await Promise.all([action1(), action2(), ...])`
- **Benefits:** All data fetched simultaneously instead of sequentially
- **Established in:** dashboard/page.tsx, live-map/page.tsx, now safety/page.tsx
- **Best practice:** Use for any server component with multiple data dependencies

## Impact

### Immediate

- **Complete safety dashboard:** All 5 SAFE requirements (SAFE-01 through SAFE-05) implemented
- **Owner/Manager visibility:** OWNER and MANAGER roles can now view fleet-wide safety analytics at /safety
- **Real seed data:** Dashboard renders actual data from safety event seed (no hardcoded mocks)
- **Responsive design:** Works on mobile and desktop with appropriate layout adjustments

### Phase Completion

- **Phase 13 complete:** Both Plan 01 (data layer) and Plan 02 (UI) finished
- **Safety analytics fully functional:** Score calculation, server actions, and UI all working together
- **Ready for navigation integration:** Safety link can be added to sidebar navigation for OWNER/MANAGER roles

### Next Steps

- **Add Safety link to sidebar navigation** (navigation-sidebar.tsx) - similar to Live Map link, show only for OWNER/MANAGER roles
- **Phase 14: Fuel Dashboard** - Apply same patterns (data layer + UI) for fuel consumption analytics
- **Real-time updates consideration:** Currently uses force-no-store for fresh data on load; could add router.refresh() polling if needed

## Self-Check: PASSED

**Files created:**
- FOUND: src/components/safety/safety-score-card.tsx
- FOUND: src/components/safety/event-distribution-chart.tsx
- FOUND: src/components/safety/safety-trend-chart.tsx
- FOUND: src/components/safety/driver-leaderboard.tsx
- FOUND: src/components/safety/threshold-config.tsx
- FOUND: src/app/(owner)/safety/page.tsx

**Commits exist:**
- FOUND: d645fe7 (Task 1: chart components)
- FOUND: c47310b (Task 2: dashboard page assembly)

**TypeScript compilation:** No errors
**Build verification:** Successful, /safety route in build output
**All verification criteria:** Met
