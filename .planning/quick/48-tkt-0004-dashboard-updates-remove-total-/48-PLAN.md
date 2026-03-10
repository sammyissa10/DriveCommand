---
phase: quick-48
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/app/(owner)/actions/dashboard.ts
  - src/app/(owner)/dashboard/page.tsx
  - src/components/dashboard/stat-card.tsx
  - src/components/dashboard/notifications-panel.tsx
autonomous: true
must_haves:
  truths:
    - "Total Trucks KPI card is removed from the dashboard"
    - "Maintenance Alerts KPI card is removed from the dashboard"
    - "Late Loads KPI card is visible, showing active loads (DISPATCHED/PICKED_UP/IN_TRANSIT) with deliveryDate in the past"
    - "Dollar value stat cards (Unpaid Invoices, Revenue/Mile) do not truncate at lg:grid-cols-5"
    - "Alerts panel has a subtitle: Document expiries · Overdue invoices · Safety events"
  artifacts:
    - path: "src/app/(owner)/actions/dashboard.ts"
      provides: "lateLoads count added to DashboardMetrics"
      contains: "lateLoads"
    - path: "src/app/(owner)/dashboard/page.tsx"
      provides: "4-card grid (lg:grid-cols-4 or lg:grid-cols-5)"
      contains: "Late Loads"
    - path: "src/components/dashboard/stat-card.tsx"
      provides: "Late Loads in iconMap/colorMap, value text scales for long strings"
    - path: "src/components/dashboard/notifications-panel.tsx"
      provides: "Subtitle under Alerts heading"
  key_links:
    - from: "src/app/(owner)/dashboard/page.tsx"
      to: "src/app/(owner)/actions/dashboard.ts"
      via: "getDashboardMetrics() returns lateLoads"
      pattern: "lateLoads"
    - from: "src/app/(owner)/dashboard/page.tsx"
      to: "src/components/dashboard/stat-card.tsx"
      via: "StatCard label='Late Loads'"
---

<objective>
Apply five targeted dashboard improvements: remove two redundant KPI cards, add a Late Loads KPI card, fix dollar value truncation in StatCard, and add a subtitle to the Alerts panel.

Purpose: Reduce KPI noise and surface more actionable dispatch data.
Output: Updated dashboard page, actions, stat-card, and notifications-panel.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(owner)/actions/dashboard.ts
@src/app/(owner)/dashboard/page.tsx
@src/components/dashboard/stat-card.tsx
@src/components/dashboard/notifications-panel.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add lateLoads to DashboardMetrics server action</name>
  <files>src/app/(owner)/actions/dashboard.ts</files>
  <action>
    In `DashboardMetrics` interface, add: `lateLoads: number;`

    Remove `maintenanceAlerts` from the `DashboardMetrics` interface (keep it in `FleetStats` — that interface is separate and used by the legacy `getFleetStats` function which must not be changed).

    In `_fetchDashboardMetrics`, add a parallel query for late loads:

    ```
    db.load.count({
      where: {
        status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] },
        deliveryDate: { lt: new Date() },
        archivedAt: null,
      },
    }) as Promise<number>
    ```

    Remove the `maintenanceAlertsCount` query from the parallel Promise.all in `_fetchDashboardMetrics` (the `totalTrucksCount` query can stay — it will be used by the action even though the card is removed from the dashboard, keeping the interface cleaner; alternatively just remove it too). Actually: remove BOTH `totalTrucksCount` and `maintenanceAlertsCount` queries from `_fetchDashboardMetrics` since neither field will be in `DashboardMetrics` anymore.

    Update the return value of `_fetchDashboardMetrics` to include `lateLoads: lateLoadsCount` and remove `totalTrucks` and `maintenanceAlerts`.

    Final `DashboardMetrics` interface should be:
    ```ts
    export interface DashboardMetrics {
      activeDrivers: number;
      activeRoutes: number;
      lateLoads: number;
      unpaidTotal: string;
      overdueTotal: string;
      activeLoads: number;
      revenuePerMile: string;
    }
    ```
  </action>
  <verify>Run `npx tsc --noEmit` — no type errors in dashboard.ts or its consumers.</verify>
  <done>DashboardMetrics has lateLoads, no totalTrucks or maintenanceAlerts. TypeScript compiles clean.</done>
</task>

<task type="auto">
  <name>Task 2: Update dashboard page, StatCard, and Alerts panel subtitle</name>
  <files>
    src/app/(owner)/dashboard/page.tsx
    src/components/dashboard/stat-card.tsx
    src/components/dashboard/notifications-panel.tsx
  </files>
  <action>
    **src/app/(owner)/dashboard/page.tsx**

    Update `StatCardsSection`:
    - Remove `totalTrucks: 0` and `maintenanceAlerts: 0` from the fallback object `m`.
    - Remove the `<StatCard label="Total Trucks" ...>` JSX element.
    - Remove the `<StatCard label="Maintenance Alerts" ...>` JSX element.
    - Add `lateLoads: 0` to the fallback object.
    - Add a Late Loads stat card:
      ```tsx
      <StatCard
        label="Late Loads"
        value={m.lateLoads}
        href="/loads"
        variant={m.lateLoads > 0 ? 'danger' : 'default'}
      />
      ```
    - Change grid class from `lg:grid-cols-6` to `lg:grid-cols-4` on the `<div>` (4 cols fits 4 remaining number cards + 1 financial card cleanly; use `lg:grid-cols-5` if 5 cards remain — count: Active Drivers, Active Routes, Active Loads, Late Loads, Unpaid Invoices, Revenue/Mile = 6... wait, that is still 6. Re-count after removals: 6 original - Total Trucks - Maintenance Alerts + Late Loads = 5 cards. Use `lg:grid-cols-5`).
    - Update `StatCardsSkeleton` to use `length: 5` and `lg:grid-cols-5`.

    **src/components/dashboard/stat-card.tsx**

    Add "Late Loads" entry to `iconMap`:
    ```ts
    'Late Loads': AlertTriangle,
    ```
    (AlertTriangle is already imported.)

    Add "Late Loads" entry to `colorMap`:
    ```ts
    'Late Loads': {
      bg: 'bg-status-danger-bg',
      icon: 'text-status-danger-foreground',
      border: 'border-t-status-danger-foreground',
    },
    ```

    Fix value text scaling for long strings — update the value `<p>` element from fixed `text-3xl sm:text-4xl` to a dynamic size based on string length:
    ```tsx
    const valueStr = String(value);
    const valueSizeClass =
      valueStr.length > 8
        ? 'text-xl sm:text-2xl'
        : valueStr.length > 5
          ? 'text-2xl sm:text-3xl'
          : 'text-3xl sm:text-4xl';
    ```
    Then use `valueSizeClass` in the className: `className={`mt-2 font-bold tracking-tight text-card-foreground truncate ${valueSizeClass}`}`

    **src/components/dashboard/notifications-panel.tsx**

    Below the `<h2 className="text-lg font-semibold text-card-foreground">Alerts</h2>` line, add a subtitle:
    ```tsx
    <p className="text-xs text-muted-foreground mt-0.5">
      Document expiries · Overdue invoices · Safety events
    </p>
    ```
    Wrap the `<h2>` and the new `<p>` in a `<div className="flex flex-col">` so they stack vertically. The existing outer div (`flex items-center gap-3`) wraps the bell icon div and this new inner div.
  </action>
  <verify>
    1. Run `npx tsc --noEmit` — no type errors.
    2. Run `npm run build` — build succeeds with no errors.
    3. Visually load `/dashboard` in the browser: confirm 5 stat cards (no "Total Trucks", no "Maintenance Alerts"), Late Loads card present, dollar values readable, Alerts panel has subtitle text.
  </verify>
  <done>
    - 5 stat cards visible: Active Drivers, Active Routes, Active Loads, Late Loads, Unpaid Invoices, Revenue/Mile (wait — that is 6: Active Drivers, Active Routes, Active Loads, Late Loads, Unpaid Invoices, Revenue/Mile. Correct count is 6 - 2 + 1 = 5. Cards: Active Drivers, Active Routes, Active Loads, Late Loads, Unpaid Invoices, Revenue/Mile minus Total Trucks and Maintenance Alerts = Active Drivers, Active Routes, Active Loads, Unpaid Invoices, Revenue/Mile + Late Loads = 5 cards with lg:grid-cols-5).
    - Dollar values do not truncate at normal viewport widths.
    - Alerts panel subtitle reads "Document expiries · Overdue invoices · Safety events".
    - TypeScript and build pass clean.
  </done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` exits 0
- `npm run build` exits 0
- Dashboard loads at `/dashboard` without runtime errors
- KPI grid shows exactly 5 cards in lg:grid-cols-5
- No "Total Trucks" or "Maintenance Alerts" cards visible
- "Late Loads" card visible with correct danger variant when count > 0
- "$12,450.00" style values render without clipping
- Alerts panel has subtitle below "Alerts" heading
</verification>

<success_criteria>
Five targeted changes applied with zero regressions. Build passes. Dashboard renders correctly with 5 KPI cards, readable financial values, and the Alerts panel subtitle.
</success_criteria>

<output>
After completion, create `.planning/quick/48-tkt-0004-dashboard-updates-remove-total-/48-SUMMARY.md` using the summary template.
</output>
