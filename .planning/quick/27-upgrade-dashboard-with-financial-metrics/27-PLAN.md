---
phase: quick-27
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
    - "Dashboard shows total unpaid invoices amount with overdue amount highlighted in red"
    - "Dashboard shows count of active loads (DISPATCHED/PICKED_UP/IN_TRANSIT)"
    - "Dashboard shows revenue per mile from completed loads"
    - "Dashboard shows unified notifications panel aggregating expiring docs, overdue invoices, and safety events"
  artifacts:
    - path: "src/app/(owner)/actions/dashboard.ts"
      provides: "Extended dashboard stats including financial metrics and notifications data"
    - path: "src/components/dashboard/stat-card.tsx"
      provides: "Updated stat card supporting string values and danger variant"
    - path: "src/components/dashboard/notifications-panel.tsx"
      provides: "Unified notifications panel with severity icons and links"
    - path: "src/app/(owner)/dashboard/page.tsx"
      provides: "Updated dashboard page with new metric cards and notifications panel"
  key_links:
    - from: "src/app/(owner)/dashboard/page.tsx"
      to: "src/app/(owner)/actions/dashboard.ts"
      via: "server action calls"
      pattern: "getDashboardMetrics|getNotifications"
    - from: "src/components/dashboard/notifications-panel.tsx"
      to: "various pages"
      via: "Link hrefs to /invoices, /trucks, /drivers, /safety"
---

<objective>
Upgrade the owner dashboard with financial metric cards (unpaid invoices, active loads, revenue per mile) and a unified notifications panel aggregating expiring documents, overdue invoices, and safety events.

Purpose: Give fleet owners immediate visibility into financial health and actionable alerts from one page.
Output: Enhanced dashboard page with 6 stat cards and a notifications panel.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
@src/app/(owner)/dashboard/page.tsx
@src/app/(owner)/actions/dashboard.ts
@src/app/(owner)/actions/notifications.ts
@src/components/dashboard/stat-card.tsx
@src/components/dashboard/expiring-documents-widget.tsx
@prisma/schema.prisma
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add financial metrics server actions and update stat card component</name>
  <files>
    src/app/(owner)/actions/dashboard.ts
    src/components/dashboard/stat-card.tsx
  </files>
  <action>
**In `src/app/(owner)/actions/dashboard.ts`:**

Extend the existing `getFleetStats` function (or create a new `getDashboardMetrics` function) that returns all dashboard data in one call. Add these new queries alongside existing ones in Promise.all:

1. **Unpaid Invoices** — Query `Invoice` where `status` IN ('DRAFT', 'SENT', 'OVERDUE') and `paidDate` IS NULL. Sum `totalAmount` for all unpaid. Also sum `totalAmount` where `status = 'OVERDUE'` separately. Return `{ unpaidTotal: string, overdueTotal: string }` (formatted as currency strings like "$12,450.00" using Intl.NumberFormat).

2. **Active Loads** — Count `Load` where `status` IN ('DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'). Return as number.

3. **Revenue Per Mile** — Query `Route` where `status = 'COMPLETED'` and both `startOdometer` and `endOdometer` are not null. For each completed route, get associated `RoutePayment` records (where `deletedAt` IS NULL) and sum their amounts. Calculate total revenue / total miles across all completed routes. Return as formatted string like "$2.45/mi" or "N/A" if no data. Use Prisma.Decimal for calculations (never parseFloat for math).

Export the new interface `DashboardMetrics`:
```typescript
export interface DashboardMetrics {
  totalTrucks: number;
  activeDrivers: number;
  activeRoutes: number;
  maintenanceAlerts: number;
  unpaidTotal: string;       // e.g. "$12,450.00"
  overdueTotal: string;      // e.g. "$3,200.00" — subset of unpaid
  activeLoads: number;       // DISPATCHED + PICKED_UP + IN_TRANSIT
  revenuePerMile: string;    // e.g. "$2.45/mi" or "N/A"
}
```

**In `src/components/dashboard/stat-card.tsx`:**

Update StatCard to support:
- `value` accepting `string | number` (currently only number) — needed for currency display
- A `danger` variant (in addition to existing 'default' and 'warning') — red border/ring for overdue amounts
- A `subtitle` optional prop for secondary text below the value (used for overdue amount in red)
- Add new entries to `iconMap` and `colorMap` for the new card labels: "Unpaid Invoices" (use `DollarSign` icon, danger color), "Active Loads" (use `Package` icon, info/blue color), "Revenue / Mile" (use `TrendingUp` icon, success/green color)
- Import `DollarSign`, `Package`, `TrendingUp` from lucide-react
  </action>
  <verify>
Run `npx tsc --noEmit 2>&1 | head -20` to confirm no TypeScript errors in modified files.
  </verify>
  <done>
getDashboardMetrics returns all 8 fields. StatCard renders string values, danger variant, and subtitle prop. New icon/color mappings exist for financial cards.
  </done>
</task>

<task type="auto">
  <name>Task 2: Build unified notifications panel and wire up dashboard page</name>
  <files>
    src/app/(owner)/actions/dashboard.ts
    src/components/dashboard/notifications-panel.tsx
    src/app/(owner)/dashboard/page.tsx
  </files>
  <action>
**In `src/app/(owner)/actions/dashboard.ts`** (or a new `getNotificationAlerts` action in the same file):

Create `getNotificationAlerts()` that returns a unified sorted array of alerts. Each alert has:
```typescript
export interface NotificationAlert {
  id: string;
  type: 'document_expiry' | 'overdue_invoice' | 'safety_event';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  href: string;         // link to relevant page
  timestamp: Date;      // for sorting
}
```

Sources (query all in parallel with Promise.all):
1. **Expiring/expired documents** — Reuse existing `getExpiringDocuments()` logic (truck registration/insurance within 60 days). Also query `Document` model for driver documents with `expiryDate` within 60 days. Expired = severity `critical`, expiring within 14 days = `warning`, else `info`. Link to `/trucks` for truck docs, `/drivers/{driverId}` for driver docs.

2. **Overdue invoices** — Query `Invoice` where `status = 'OVERDUE'`. Each becomes a `critical` alert. Title: "Invoice {invoiceNumber} overdue". Description: amount + customer name. Link to `/invoices`.

3. **Recent safety events** — Query `SafetyEvent` from last 7 days. CRITICAL severity = `critical`, HIGH = `warning`, else `info`. Title: event type formatted. Link to `/safety`.

Sort all alerts: critical first, then warning, then info. Within same severity, most recent first. Limit to 20 alerts total.

**In `src/components/dashboard/notifications-panel.tsx`:**

Create a new client component that renders the unified alerts list. Style matching existing dark card pattern (`rounded-xl border border-border bg-card p-6 shadow-sm`).

- Header: Bell icon with count badge (red if any critical alerts)
- Each alert row: severity icon (AlertOctagon red for critical, AlertTriangle amber for warning, Info blue for info), title, description, relative time (e.g. "2d ago"), clickable → navigates to `href`
- Empty state: "No active alerts" with CheckCircle icon
- Show max 10 alerts with "View all" expandable or "and N more..." text
- Use lucide-react icons: `Bell`, `AlertOctagon`, `AlertTriangle`, `Info`, `CheckCircle`

**In `src/app/(owner)/dashboard/page.tsx`:**

Replace current layout with:
1. Page header (keep existing)
2. Stat cards grid — 6 cards in a responsive grid (`grid-cols-2 md:grid-cols-3 lg:grid-cols-6` or `lg:grid-cols-3` with 2 rows):
   - Total Trucks (existing, link /trucks)
   - Active Drivers (existing, link /drivers)
   - Active Loads (NEW, link /loads)
   - Maintenance Alerts (existing, link /trucks, warning variant if > 0)
   - Unpaid Invoices (NEW, link /invoices, danger variant if overdue > 0, subtitle showing overdue amount in red like "($3,200 overdue)")
   - Revenue / Mile (NEW, link /routes)
3. Bottom section — 3-column grid (`lg:grid-cols-3`):
   - NotificationsPanel (takes full first column or spans 1 col)
   - UpcomingMaintenanceWidget (keep existing)
   - ExpiringDocumentsWidget (keep existing)

Import and call `getDashboardMetrics()` and `getNotificationAlerts()` in Promise.all. Remove old `getFleetStats` call (replaced by getDashboardMetrics).
  </action>
  <verify>
Run `npx tsc --noEmit 2>&1 | head -20` for type checking. Then `npm run build 2>&1 | tail -20` to verify the page builds. Finally visit http://localhost:3000/dashboard to confirm all 6 stat cards render and the notifications panel displays.
  </verify>
  <done>
Dashboard shows 6 stat cards (Total Trucks, Active Drivers, Active Loads, Maintenance Alerts, Unpaid Invoices with red overdue subtitle, Revenue/Mile). Notifications panel renders below with severity-colored alerts from documents, invoices, and safety events. All cards link to their respective pages. Existing dark card styling maintained.
  </done>
</task>

</tasks>

<verification>
- Dashboard page loads without errors at /dashboard
- All 6 stat cards display with correct icons and colors
- Unpaid Invoices card shows overdue amount in red when overdue invoices exist
- Active Loads card counts only DISPATCHED/PICKED_UP/IN_TRANSIT loads
- Revenue/Mile shows calculated value from completed routes or "N/A"
- Notifications panel aggregates alerts from documents, invoices, and safety events
- Alerts sorted by severity (critical first) then recency
- Each alert links to the correct page
- Dark card styling consistent with existing dashboard components
</verification>

<success_criteria>
Fleet owner sees financial health metrics and actionable alerts on dashboard load. All data is real (queried from database), not placeholder. Clicking any card or alert navigates to the relevant detail page.
</success_criteria>

<output>
After completion, create `.planning/quick/27-upgrade-dashboard-with-financial-metrics/27-SUMMARY.md`
</output>
