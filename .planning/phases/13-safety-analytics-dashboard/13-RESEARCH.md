# Phase 13: Safety Analytics Dashboard - Research

**Researched:** 2026-02-15
**Domain:** Safety analytics dashboard with composite scoring, event distribution charts, trend lines, driver leaderboard, and configurable thresholds
**Confidence:** HIGH

## Summary

Phase 13 builds a Safety Analytics Dashboard at `/safety` that visualizes fleet safety performance using data from the existing `SafetyEvent` model (created in Phase 11, seeded with 5-15 events per truck). The dashboard requires five distinct UI sections: (1) fleet-wide composite safety score (0-100), (2) safety event distribution charts (bar chart by type + donut chart for percentages), (3) 30-day safety score trend line chart, (4) driver performance leaderboard (top/bottom performers), and (5) configurable g-force alert thresholds per vehicle class.

The charting library choice is straightforward: shadcn/ui provides a `chart` component that wraps Recharts with theme-aware styling, ChartConfig for metadata, and ChartContainer for responsive sizing. This is the natural extension of the existing shadcn/ui component library already installed in the project. Recharts supports all required chart types: PieChart (donut via `innerRadius`), BarChart, LineChart, and can be composed declaratively. The shadcn `card` component will also need to be added for the dashboard layout cards.

The safety score formula follows the industry standard used by Samsara, Motive, and Geotab: start at 100, subtract points for each event normalized per 1,000 miles driven. Since this project uses mock data without real mileage tracking, a simplified formula works: `score = max(0, 100 - (totalEvents * penaltyPerEvent))` where penalty weights vary by severity (LOW=1, MEDIUM=2, HIGH=4, CRITICAL=8). The fleet-wide score is the weighted average of all driver/vehicle scores.

**Primary recommendation:** Install shadcn/ui `chart` and `card` components (which bring in Recharts as a dependency). Create server actions for safety aggregation queries using the established pattern (requireRole + getTenantPrisma + raw SQL for complex aggregations). Build the dashboard as a server component page that fetches all data in parallel and passes it to client chart wrapper components. Follow the same architecture as the existing dashboard page (parallel data fetching) and live-map page (server component + client wrappers for browser-only libraries).

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 16.x | Framework with App Router | Server components for data fetching, client components for charts |
| shadcn/ui | Latest (new-york style) | Component library | Already installed, extend with chart + card components |
| Prisma | 7.x | ORM with RLS | SafetyEvent queries with tenant isolation (model already exists) |
| Tailwind CSS | 3.4.x | Styling | Already configured with CSS variables for shadcn |
| lucide-react | 0.564.0 | Icons | Shield, AlertTriangle, TrendingUp, Users, Settings icons |
| zod | 4.3.x | Validation | Threshold configuration form validation |

### New Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|-------------|
| recharts | 2.x | Charting library | Required by shadcn/ui chart component; industry standard React charting |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Recharts (via shadcn chart) | Chart.js / react-chartjs-2 | Chart.js uses Canvas (better for 10K+ data points) but doesn't integrate with shadcn theming. Recharts uses SVG (better for <1000 data points typical of dashboard aggregations). shadcn wraps Recharts so it inherits the project's design system automatically. |
| Recharts (via shadcn chart) | Nivo | Nivo has more chart types and animations but is heavier (bundle size), less community adoption, and no shadcn integration. Overkill for bar/line/donut charts. |
| Recharts (via shadcn chart) | Victory | Similar declarative API to Recharts but smaller ecosystem, less maintained, no shadcn integration. |
| Server-side score calculation | Client-side calculation | Server-side is correct: scores involve aggregating potentially thousands of events across date ranges. Client would receive too much raw data. |

**Installation:**
```bash
# Add shadcn chart component (installs recharts automatically)
npx shadcn@latest add chart

# Add card component for dashboard layout
npx shadcn@latest add card

# Add select component for date range picker / vehicle class selector
npx shadcn@latest add select

# Add tabs component for dashboard sections
npx shadcn@latest add tabs

# Add badge component for severity indicators
npx shadcn@latest add badge
```

## Architecture Patterns

### Recommended Project Structure
```
src/
  app/
    (owner)/
      safety/
        page.tsx                    # Server component: fetches all safety data in parallel
        actions.ts                  # Server actions for safety aggregation queries
  components/
    safety/
      safety-score-card.tsx         # Large composite score display (0-100 gauge)
      event-distribution-chart.tsx  # Bar chart by event type + donut chart for percentages
      safety-trend-chart.tsx        # 30-day line chart of daily average scores
      driver-leaderboard.tsx        # Table/list of top and bottom performers
      threshold-config.tsx          # Form for g-force sensitivity settings per vehicle class
  lib/
    safety/
      score-calculator.ts           # Safety score calculation logic (shared between server actions)
  components/
    ui/
      card.tsx                      # shadcn card component (NEW)
      chart.tsx                     # shadcn chart component (NEW)
      select.tsx                    # shadcn select component (NEW)
      tabs.tsx                      # shadcn tabs component (NEW)
      badge.tsx                     # shadcn badge component (NEW)
```

### Pattern 1: Server Component Page with Parallel Data Fetching
**What:** Dashboard page as server component fetching all chart data in parallel, passing to client chart components
**When to use:** Any dashboard page with multiple data widgets
**Example:**
```typescript
// src/app/(owner)/safety/page.tsx (SERVER COMPONENT)
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import {
  getFleetSafetyScore,
  getEventDistribution,
  getSafetyScoreTrend,
  getDriverRankings,
  getSafetyThresholds,
} from './actions';

export const fetchCache = 'force-no-store';

export default async function SafetyDashboardPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parallel data fetching (same pattern as dashboard/page.tsx)
  const [score, distribution, trends, rankings, thresholds] = await Promise.all([
    getFleetSafetyScore(),
    getEventDistribution(),
    getSafetyScoreTrend(30),
    getDriverRankings(),
    getSafetyThresholds(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Safety Dashboard</h1>
        <p className="text-muted-foreground">Fleet-wide safety performance and driver rankings</p>
      </div>

      {/* Top row: Score card + Event distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <SafetyScoreCard score={score} />
        <div className="lg:col-span-2">
          <EventDistributionChart data={distribution} />
        </div>
      </div>

      {/* Trend chart: full width */}
      <SafetyTrendChart data={trends} />

      {/* Bottom row: Leaderboard + Thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DriverLeaderboard rankings={rankings} />
        <ThresholdConfig thresholds={thresholds} />
      </div>
    </div>
  );
}
```

**Why this approach:**
- Server component fetches data with RLS tenant isolation (no API routes needed)
- `Promise.all` runs all queries in parallel (faster than sequential)
- Chart components receive pre-processed data as props (no client-side data fetching)
- `fetchCache = 'force-no-store'` ensures fresh data on every load
- Matches established pattern from `dashboard/page.tsx` and `live-map/page.tsx`

### Pattern 2: Client Chart Components with shadcn ChartContainer
**What:** Client components wrapping Recharts charts with shadcn theming
**When to use:** Any chart that needs browser rendering (SVG/Canvas)
**Example:**
```typescript
// src/components/safety/event-distribution-chart.tsx
'use client'

import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface EventDistributionProps {
  data: Array<{
    eventType: string
    count: number
    label: string
  }>
}

const chartConfig = {
  count: {
    label: 'Events',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig

export function EventDistributionChart({ data }: EventDistributionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Safety Events by Type</CardTitle>
        <CardDescription>Distribution of safety events in the last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <BarChart data={data} layout="vertical">
            <CartesianGrid horizontal={false} />
            <XAxis type="number" />
            <YAxis dataKey="label" type="category" width={120} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Bar dataKey="count" fill="var(--color-count)" radius={4} />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

**Why this approach:**
- `ChartContainer` handles responsive sizing and theme variable injection
- `ChartConfig` maps data keys to labels and colors (human-readable tooltips)
- `ChartTooltipContent` from shadcn provides styled tooltips matching design system
- Card wrapper provides consistent dashboard card styling
- `'use client'` because Recharts uses browser APIs (SVG rendering)

### Pattern 3: Donut Chart with Center Text for Score Display
**What:** Recharts PieChart with innerRadius to create donut shape, Label component for center text
**When to use:** Showing percentage distribution with a central summary value
**Example:**
```typescript
// Donut chart for event severity distribution
'use client'

import { Pie, PieChart, Label } from 'recharts'
import { ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart'
import { useMemo } from 'react'

const chartConfig = {
  low: { label: 'Low', color: 'hsl(var(--chart-2))' },
  medium: { label: 'Medium', color: 'hsl(var(--chart-3))' },
  high: { label: 'High', color: 'hsl(var(--chart-4))' },
  critical: { label: 'Critical', color: 'hsl(var(--chart-5))' },
} satisfies ChartConfig

export function SeverityDonutChart({ data }: { data: Array<{ severity: string; count: number; fill: string }> }) {
  const total = useMemo(() => data.reduce((sum, item) => sum + item.count, 0), [data])

  return (
    <ChartContainer config={chartConfig} className="mx-auto aspect-square max-h-[250px]">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Pie
          data={data}
          dataKey="count"
          nameKey="severity"
          innerRadius={60}
          strokeWidth={5}
        >
          <Label
            content={({ viewBox }) => {
              if (viewBox && 'cx' in viewBox && 'cy' in viewBox) {
                return (
                  <text x={viewBox.cx} y={viewBox.cy} textAnchor="middle" dominantBaseline="middle">
                    <tspan x={viewBox.cx} y={viewBox.cy} className="fill-foreground text-3xl font-bold">
                      {total}
                    </tspan>
                    <tspan x={viewBox.cx} y={(viewBox.cy || 0) + 24} className="fill-muted-foreground">
                      Total Events
                    </tspan>
                  </text>
                )
              }
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  )
}
```

### Pattern 4: Safety Score Calculation (Server-Side)
**What:** Composite safety score formula normalized per 1,000 miles
**When to use:** Calculating fleet-wide or per-driver safety scores from SafetyEvent data
**Example:**
```typescript
// src/lib/safety/score-calculator.ts

import { SafetyEventSeverity } from '@/generated/prisma';

/**
 * Severity penalty weights (points deducted per event)
 * Based on industry standard (Samsara/Motive/Geotab patterns):
 * Score = max(0, 100 - sum(events * penalty_weight))
 *
 * For mock data without real mileage, use flat penalty per event.
 * For production with mileage data, normalize per 1,000 miles.
 */
export const SEVERITY_WEIGHTS: Record<SafetyEventSeverity, number> = {
  LOW: 1,
  MEDIUM: 2,
  HIGH: 4,
  CRITICAL: 8,
};

/**
 * Calculate safety score from event counts by severity
 * Returns 0-100 where 100 is perfect (no events)
 */
export function calculateSafetyScore(
  eventCounts: Record<SafetyEventSeverity, number>
): number {
  let totalPenalty = 0;

  for (const [severity, count] of Object.entries(eventCounts)) {
    totalPenalty += count * SEVERITY_WEIGHTS[severity as SafetyEventSeverity];
  }

  return Math.max(0, Math.round(100 - totalPenalty));
}

/**
 * Get color class based on safety score
 */
export function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-600';
  if (score >= 60) return 'text-yellow-600';
  if (score >= 40) return 'text-orange-600';
  return 'text-red-600';
}

/**
 * Get score label based on safety score
 */
export function getScoreLabel(score: number): string {
  if (score >= 80) return 'Excellent';
  if (score >= 60) return 'Good';
  if (score >= 40) return 'Needs Improvement';
  return 'Poor';
}
```

### Anti-Patterns to Avoid

- **Fetching raw events client-side:** Do NOT send thousands of raw SafetyEvent records to the client for aggregation. Perform all COUNT/GROUP BY/AVG calculations in server actions. Client components should receive pre-aggregated data only (arrays of {label, value} objects).

- **Using canvas-based charts (Chart.js) in SSR context:** Canvas requires browser APIs. While Recharts also requires browser (SVG), it integrates with shadcn's theming system. Canvas-based charts would need separate styling and won't match the design system.

- **Calculating scores in the database:** While PostgreSQL can compute scores via SQL, the formula may change frequently. Keep the scoring logic in TypeScript (`score-calculator.ts`) so it's testable and versionable. Use SQL only for aggregation (COUNT, GROUP BY).

- **Not wrapping charts in 'use client' components:** Recharts requires browser rendering. If you try to use Recharts components directly in a server component, you'll get hydration errors. Always create a separate client component for each chart.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Chart rendering (SVG) | Custom SVG generation | Recharts via shadcn chart component | Recharts handles SVG layout, animations, responsiveness, accessibility, tooltips. Custom SVG for charts is extremely error-prone. |
| Donut chart with center text | Custom CSS circles | Recharts PieChart with innerRadius + Label | Recharts handles arc calculations, hover states, segment click handlers, responsive scaling. |
| Chart theming | Custom CSS variables for each chart | shadcn ChartContainer + ChartConfig | ChartContainer injects theme-aware CSS variables automatically, ensuring charts match the app's color scheme in light/dark mode. |
| Dashboard card layout | Custom div styling | shadcn Card component (CardHeader, CardContent, CardFooter) | Card provides consistent padding, border-radius, shadow, and composition pattern (header/content/footer). |
| Date range filtering | Custom date picker logic | shadcn Select with preset ranges (7d, 30d, 90d) | For dashboard time range selection, preset options are simpler and more useful than a full date picker. |

**Key insight:** The shadcn chart component eliminates the "Recharts boilerplate problem" -- instead of configuring CartesianGrid, XAxis, YAxis, Tooltip, Legend individually and styling each to match your design system, ChartContainer and ChartTooltipContent handle all of that automatically.

## Common Pitfalls

### Pitfall 1: Recharts Not Rendering in Server Component
**What goes wrong:** "window is not defined" or blank chart area
**Why it happens:** Recharts uses browser APIs (SVG, DOM measurements) that don't exist during SSR. Unlike Leaflet which crashes immediately, Recharts may render empty SVG containers on the server and then fail to hydrate.
**How to avoid:** Every chart component MUST have `'use client'` directive. The page component can be a server component, but chart components must be client components.
**Warning signs:** Charts render as empty boxes, no error in console but no visible chart content.

### Pitfall 2: ChartContainer Without min-h Class
**What goes wrong:** Chart renders as 0-height (invisible)
**Why it happens:** Recharts' `ResponsiveContainer` (used internally by ChartContainer) requires explicit height from parent. Without `min-h-[VALUE]` class, the container collapses.
**How to avoid:** Always set `className="min-h-[200px] w-full"` (or appropriate height) on ChartContainer.
**Warning signs:** Card shows title/description but chart area is invisible. Inspect element shows 0px height on chart wrapper.

### Pitfall 3: Seed Data Enum Mismatch
**What goes wrong:** Seed script references enum values that don't exist in the Prisma schema
**Why it happens:** The existing `prisma/seeds/safety-events.ts` file imports `SeverityLevel` (does not exist) instead of `SafetyEventSeverity`, and references `SafetyEventType.LANE_DEPARTURE`, `SafetyEventType.COLLISION`, `SafetyEventType.ROLLOVER_RISK` which are NOT in the schema enum. The schema enum only has: HARSH_BRAKING, HARSH_ACCELERATION, HARSH_CORNERING, SPEEDING, DISTRACTED_DRIVING, ROLLING_STOP, SEATBELT_VIOLATION, FOLLOWING_TOO_CLOSE.
**How to avoid:** The seed script needs to be fixed before or during this phase. Safety dashboard queries must use the ACTUAL enum values from the schema, not the seed file's incorrect values.
**Warning signs:** Seed script fails to compile or inserts incorrect enum values. Dashboard queries return 0 results for event types that should have data.

### Pitfall 4: Decimal Fields Not Converted for Charts
**What goes wrong:** Chart axes show `[object Object]` or `NaN` instead of numbers
**Why it happens:** Prisma returns `Decimal` type for fields like `gForce`, `speed` (on SafetyEvent). Recharts expects JavaScript `number`. Same issue documented in Phase 12 research for GPS coordinates.
**How to avoid:** Convert all Decimal fields to Number in server actions before returning: `gForce: Number(event.gForce)`. Also convert aggregate results from raw SQL queries.
**Warning signs:** Chart renders but data points are missing or positioned at 0.

### Pitfall 5: Empty States When No Safety Events Exist
**What goes wrong:** Charts crash or show confusing empty visualizations
**Why it happens:** New tenants or tenants without seeded data have zero SafetyEvent records. Recharts PieChart with empty data array renders nothing. Score calculation returns 100 (perfect) which may be misleading.
**How to avoid:** Check data length before rendering charts. Show meaningful empty states: "No safety events recorded in the last 30 days" with a brief explanation. For score display, show "No data" instead of 100 when there are zero events.
**Warning signs:** Dashboard shows "100" score with empty charts (misleading), or crashes with "Cannot read property of undefined".

### Pitfall 6: Safety Score Not Meaningful with Current Seed Data
**What goes wrong:** All drivers show similar scores, or scores are all 0 because penalties are too high
**Why it happens:** Seed data generates 5-15 events per truck (not per driver). With driverId = null in seed data, per-driver scores cannot be calculated. The penalty formula needs tuning to produce a range of scores (20-95) that make the leaderboard meaningful.
**How to avoid:** When building server actions, handle the case where driverId is null on SafetyEvent records. For fleet-wide score, aggregate by truck. For per-driver leaderboard, either: (a) update seed data to assign driverIds, or (b) aggregate by truck and show truck-level rankings. Tune penalty weights so that 5-15 events per truck produce scores in the 60-95 range (not all 0 or all 100).
**Warning signs:** Leaderboard shows all drivers at same score, or all scores are 0/100.

## Code Examples

### Example 1: Server Action for Fleet Safety Score
```typescript
// src/app/(owner)/safety/actions.ts
'use server'

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { calculateSafetyScore, SEVERITY_WEIGHTS } from '@/lib/safety/score-calculator';

export async function getFleetSafetyScore(daysBack: number = 30) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Count events by severity for the fleet
  // @ts-ignore - Raw query typing
  const results = await db.$queryRaw`
    SELECT severity, COUNT(*)::int as count
    FROM "SafetyEvent"
    WHERE "tenantId" = ${tenantId}::uuid
      AND timestamp >= ${cutoff}
    GROUP BY severity
  `;

  const counts = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  for (const row of results as any[]) {
    counts[row.severity as keyof typeof counts] = row.count;
  }

  const totalEvents = Object.values(counts).reduce((sum, c) => sum + c, 0);
  const score = calculateSafetyScore(counts);

  return {
    score,
    totalEvents,
    eventsBySeverity: counts,
    period: daysBack,
  };
}
```

### Example 2: Server Action for Event Distribution
```typescript
export async function getEventDistribution(daysBack: number = 30) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // @ts-ignore - Raw query typing
  const results = await db.$queryRaw`
    SELECT "eventType", COUNT(*)::int as count
    FROM "SafetyEvent"
    WHERE "tenantId" = ${tenantId}::uuid
      AND timestamp >= ${cutoff}
    GROUP BY "eventType"
    ORDER BY count DESC
  `;

  // Map enum values to human-readable labels
  const EVENT_LABELS: Record<string, string> = {
    HARSH_BRAKING: 'Harsh Braking',
    HARSH_ACCELERATION: 'Harsh Acceleration',
    HARSH_CORNERING: 'Harsh Cornering',
    SPEEDING: 'Speeding',
    DISTRACTED_DRIVING: 'Distracted Driving',
    ROLLING_STOP: 'Rolling Stop',
    SEATBELT_VIOLATION: 'Seatbelt Violation',
    FOLLOWING_TOO_CLOSE: 'Following Too Close',
  };

  return (results as any[]).map(row => ({
    eventType: row.eventType,
    label: EVENT_LABELS[row.eventType] || row.eventType,
    count: row.count,
  }));
}
```

### Example 3: Server Action for 30-Day Score Trend
```typescript
export async function getSafetyScoreTrend(daysBack: number = 30) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Get daily event counts grouped by severity
  // @ts-ignore - Raw query typing
  const results = await db.$queryRaw`
    SELECT
      DATE(timestamp) as date,
      severity,
      COUNT(*)::int as count
    FROM "SafetyEvent"
    WHERE "tenantId" = ${tenantId}::uuid
      AND timestamp >= ${cutoff}
    GROUP BY DATE(timestamp), severity
    ORDER BY date ASC
  `;

  // Build daily scores
  const dailyMap = new Map<string, Record<string, number>>();

  // Initialize all dates in range (including days with 0 events)
  for (let i = 0; i < daysBack; i++) {
    const date = new Date(Date.now() - (daysBack - 1 - i) * 24 * 60 * 60 * 1000);
    const dateStr = date.toISOString().split('T')[0];
    dailyMap.set(dateStr, { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 });
  }

  // Fill in actual counts
  for (const row of results as any[]) {
    const dateStr = new Date(row.date).toISOString().split('T')[0];
    const existing = dailyMap.get(dateStr);
    if (existing) {
      existing[row.severity] = row.count;
    }
  }

  // Calculate daily scores
  return Array.from(dailyMap.entries()).map(([date, counts]) => ({
    date,
    score: calculateSafetyScore(counts as any),
    events: Object.values(counts).reduce((sum, c) => sum + c, 0),
  }));
}
```

### Example 4: Server Action for Driver/Truck Rankings
```typescript
export async function getDriverRankings(daysBack: number = 30) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();
  const cutoff = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000);

  // Aggregate events by truck (since seed data has driverId = null)
  // Join with Truck to get identifying info
  // @ts-ignore - Raw query typing
  const results = await db.$queryRaw`
    SELECT
      t.id as "truckId",
      t.make,
      t.model,
      t."licensePlate",
      COALESCE(SUM(CASE WHEN se.severity = 'LOW' THEN 1 ELSE 0 END), 0)::int as low_count,
      COALESCE(SUM(CASE WHEN se.severity = 'MEDIUM' THEN 1 ELSE 0 END), 0)::int as medium_count,
      COALESCE(SUM(CASE WHEN se.severity = 'HIGH' THEN 1 ELSE 0 END), 0)::int as high_count,
      COALESCE(SUM(CASE WHEN se.severity = 'CRITICAL' THEN 1 ELSE 0 END), 0)::int as critical_count,
      COUNT(se.id)::int as total_events
    FROM "Truck" t
    LEFT JOIN "SafetyEvent" se ON t.id = se."truckId"
      AND se.timestamp >= ${cutoff}
      AND se."tenantId" = ${tenantId}::uuid
    WHERE t."tenantId" = ${tenantId}::uuid
    GROUP BY t.id, t.make, t.model, t."licensePlate"
    ORDER BY total_events ASC
  `;

  return (results as any[]).map(row => ({
    truckId: row.truckId,
    name: `${row.make} ${row.model}`,
    licensePlate: row.licensePlate,
    score: calculateSafetyScore({
      LOW: row.low_count,
      MEDIUM: row.medium_count,
      HIGH: row.high_count,
      CRITICAL: row.critical_count,
    }),
    totalEvents: row.total_events,
  }));
}
```

### Example 5: Line Chart for Score Trend
```typescript
// src/components/safety/safety-trend-chart.tsx
'use client'

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from 'recharts'
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from '@/components/ui/chart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

interface TrendData {
  date: string
  score: number
  events: number
}

const chartConfig = {
  score: {
    label: 'Safety Score',
    color: 'hsl(var(--chart-1))',
  },
} satisfies ChartConfig

export function SafetyTrendChart({ data }: { data: TrendData[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Safety Score Trend</CardTitle>
        <CardDescription>Daily fleet safety score over the last 30 days</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="date"
              tickFormatter={(value) => {
                const date = new Date(value)
                return `${date.getMonth() + 1}/${date.getDate()}`
              }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis domain={[0, 100]} tickLine={false} axisLine={false} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="var(--color-score)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 6 }}
            />
          </LineChart>
        </ChartContainer>
      </CardContent>
    </Card>
  )
}
```

## Safety Score Formula

### Industry Standard (Samsara/Motive/Geotab)
The standard formula used across fleet management platforms:

```
Score = max(0, 100 - (Events per 1,000 miles * severity_weight))
```

### Simplified Formula for Mock Data (No Real Mileage)
Since DriveCommand uses mock data without real mileage tracking:

```
Score = max(0, 100 - sum(event_count_by_severity * penalty_weight))

Where penalty_weight:
  LOW = 1 point
  MEDIUM = 2 points
  HIGH = 4 points
  CRITICAL = 8 points
```

### Score Ranges and Labels
| Range | Label | Color | Meaning |
|-------|-------|-------|---------|
| 80-100 | Excellent | Green | Few or no safety events |
| 60-79 | Good | Yellow | Some minor events |
| 40-59 | Needs Improvement | Orange | Frequent or severe events |
| 0-39 | Poor | Red | Many severe events, intervention needed |

### Fleet-Wide Score
The fleet-wide score is calculated by aggregating ALL events across all trucks in the tenant for the selected time period, then applying the formula. This gives a single composite number for the entire fleet.

### Per-Truck/Driver Score
Each truck (or driver, when driverId is populated) gets its own score calculated independently. This enables the leaderboard ranking.

**Important note about seed data:** The current seed script sets `driverId: null` on all SafetyEvent records. The leaderboard should rank by truck until seed data is updated to include driver assignments. The server action should handle both cases (rank by driver when available, fall back to truck).

## Threshold Configuration (SAFE-05)

### Vehicle Classes for G-Force Sensitivity
| Class | Description | Default Harsh Braking (g) | Default Harsh Acceleration (g) | Default Harsh Cornering (g) |
|-------|-------------|--------------------------|-------------------------------|---------------------------|
| Light Duty | Vans, pickups (<10,000 lbs GVWR) | 0.45g | 0.35g | 0.30g |
| Medium Duty | Box trucks, delivery (10,001-26,000 lbs) | 0.35g | 0.30g | 0.25g |
| Heavy Duty | Semi-trucks, tankers (>26,000 lbs) | 0.25g | 0.20g | 0.20g |

### Storage Approach
Since this is a configuration UI with mock data, thresholds can be stored in:
- **Option A (Recommended):** JSON field on the Tenant model (add `safetyThresholds Json?` to Tenant)
- **Option B:** localStorage on the client (simplest, but not persistent across devices)
- **Option C:** New `SafetyThreshold` model in database (most robust, but adds migration complexity)

**Recommendation:** Use Option A (Tenant JSON field) for persistence without a new migration. The planner can decide based on complexity budget. If a new migration is too much overhead for this phase, use localStorage as a pragmatic alternative since this is mock data.

### Configuration UI
A form with three vehicle class sections, each having three g-force input fields (braking, acceleration, cornering). Use shadcn `Select` for vehicle class tabs and `Input` for g-force values with validation (0.1-5.0g range).

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Chart.js with manual styling | Recharts via shadcn chart component | 2024 (shadcn charts released) | Charts automatically match app theme, no manual CSS variable mapping |
| Custom dashboard card divs | shadcn Card component | 2024 | Consistent card styling, built-in composition (Header/Content/Footer) |
| Client-side data aggregation | Server action aggregation (SQL GROUP BY) | 2024 (Next.js 14/15) | Reduces client bundle size, keeps raw data on server, RLS isolation automatic |
| Fixed 30-day period | Configurable time range | Industry practice | Users need 7d/30d/90d views for different insights |
| Random safety scores | Formula-based calculation from real events | Industry standard | Scores meaningful, comparable, and actionable |

**Deprecated/outdated:**
- **react-vis:** Uber's charting library, deprecated 2023. Use Recharts.
- **Recharts v1.x:** Use v2.x (v1.x incompatible with React 18+).
- **Manual Chart.js wrapper components:** shadcn chart component provides better DX with theme integration.
- **Client-side score calculation from raw events:** Server-side aggregation is correct for dashboards with potentially thousands of events.

## Open Questions

1. **Driver vs Truck Rankings**
   - What we know: Seed data has `driverId = null` on all SafetyEvent records. Leaderboard requires per-entity scores.
   - What's unclear: Should the planner update seed data to assign driverIds, or should the leaderboard rank by truck?
   - Recommendation: Rank by truck for now (data exists). If the planner wants per-driver rankings, add a task to update the seed script to assign driverIds to events. This is a small change (query existing drivers per tenant, randomly assign to events).

2. **Threshold Persistence**
   - What we know: SAFE-05 requires configurable g-force thresholds per vehicle class.
   - What's unclear: Where to store thresholds (Tenant JSON field vs new model vs localStorage).
   - Recommendation: Start with localStorage for simplicity (mock data context). If production-grade persistence is needed, add `safetyThresholds Json?` to the Tenant model via a small migration.

3. **Score Tuning**
   - What we know: With 5-15 events per truck and current severity weights, scores could range from 85 (5 LOW events) to 0 (15 CRITICAL events at 8 points each = 120 penalty).
   - What's unclear: Whether the penalty weights produce a visually interesting distribution across the fleet.
   - Recommendation: Start with the proposed weights (LOW=1, MEDIUM=2, HIGH=4, CRITICAL=8). If scores are too clustered, adjust weights during implementation. The score calculator is a pure function, easy to tune.

4. **Chart Responsiveness on Mobile**
   - What we know: Recharts charts can be made responsive with ChartContainer, but complex dashboards with 4-5 charts may not fit well on mobile.
   - What's unclear: Mobile layout expectations for this dashboard.
   - Recommendation: Use `grid-cols-1 lg:grid-cols-3` responsive grid. On mobile, all charts stack vertically in a single column. Charts should have minimum heights but be full-width on small screens.

## Sources

### Primary (HIGH confidence)
- [shadcn/ui Chart Component Documentation](https://ui.shadcn.com/docs/components/radix/chart) - Official chart component docs, installation, ChartConfig/ChartContainer usage
- [shadcn/ui Pie Charts Gallery](https://ui.shadcn.com/charts/pie) - Donut chart examples with innerRadius and center Label
- [shadcn/ui Card Component](https://ui.shadcn.com/docs/components/radix/card) - Dashboard card layout component
- [Recharts Official Documentation](https://recharts.org) - BarChart, LineChart, PieChart API reference
- Prisma schema (verified): SafetyEvent model with SafetyEventType enum (8 values) and SafetyEventSeverity enum (4 values)
- Existing codebase: `src/app/(owner)/live-map/actions.ts` - Established pattern for server actions with RLS
- Existing codebase: `src/app/(owner)/dashboard/page.tsx` - Established pattern for parallel data fetching

### Secondary (MEDIUM confidence)
- [Samsara Safety Score Calculation](https://kb.samsara.com/hc/en-us/articles/360045237852-Safety-Score-Categories-and-Calculation) - Industry standard safety score formula (100 - events per 1000 miles)
- [Motive Safety Score](https://helpcenter.gomotive.com/hc/en-us/articles/6162164321693-Safety-Score) - Alternative scoring approach (events per 1000 miles)
- [Geotab Driver Safety Scorecard](https://www.geotab.com/white-paper/driver-safety-scorecard/) - Event categories and weight calibration
- [Best React Chart Libraries 2025](https://blog.logrocket.com/best-react-chart-libraries-2025/) - Library comparison (confirms Recharts as top choice for declarative React charts)

### Tertiary (LOW confidence)
- [shadcn-ui/ui Discussion #4133](https://github.com/shadcn-ui/ui/discussions/4133) - Community discussion on chart library choices with shadcn (needs verification)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Recharts via shadcn chart is the obvious choice; already using shadcn for all UI components
- Architecture: HIGH - Extends established patterns (server actions, parallel data fetching, client wrappers)
- Safety score formula: MEDIUM-HIGH - Industry standard verified across Samsara/Motive/Geotab, but penalty weights need tuning for mock data
- Pitfalls: HIGH - Enum mismatch in seed data verified by direct code inspection, Decimal conversion issue documented from Phase 12 experience
- Threshold config: MEDIUM - Storage approach (Tenant JSON vs localStorage) depends on planner's complexity budget

**Known issue requiring attention:**
The seed file `prisma/seeds/safety-events.ts` has enum mismatches with the actual schema:
- Imports `SeverityLevel` (should be `SafetyEventSeverity`)
- References `SafetyEventType.LANE_DEPARTURE` (not in schema)
- References `SafetyEventType.COLLISION` (not in schema)
- References `SafetyEventType.ROLLOVER_RISK` (not in schema)
The planner should include a task to fix this seed file, OR verify whether the seed script even runs successfully in its current state. If the seed has already run and data exists with correct enum values (because the incorrect values were filtered out at runtime), the dashboard queries will work correctly against the seeded data.

**Research date:** 2026-02-15
**Valid until:** 60 days (stable domain: charting libraries, dashboard patterns, score formulas are well-established)
