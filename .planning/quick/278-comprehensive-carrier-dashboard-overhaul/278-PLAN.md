---
phase: quick-278
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts
  - apps/web/src/app/api/v1/carrier/dashboard/activity/route.ts
  - apps/web/src/app/api/v1/carrier/dashboard/alerts/route.ts
  - apps/web/src/app/api/v1/carrier/dashboard/drivers-status/route.ts
  - apps/web/src/app/api/v1/carrier/dashboard/messages/route.ts
  - apps/web/src/components/carrier/dashboard/KPIStrip.tsx
  - apps/web/src/components/carrier/dashboard/AlertBar.tsx
  - apps/web/src/components/carrier/dashboard/DriverStatusStrip.tsx
  - apps/web/src/components/carrier/dashboard/RecentActivity.tsx
  - apps/web/src/components/carrier/dashboard/QuickMessageBoard.tsx
  - apps/web/src/app/(owner)/carrier/dashboard/page.tsx
autonomous: true
must_haves:
  truths:
    - "Revenue This Week KPI shows actual revenue from loads, not $0"
    - "Alert strip shows actionable items (expiring CDLs, contracts, pending pay, etc.) with navigation links"
    - "Driver status strip shows all active drivers with HOS status dots"
    - "Recent Activity feed shows last 15 events across operations"
    - "Quick Message Board shows last 5 messages with send capability and 30s polling"
    - "Dashboard layout is two-column on desktop, single column on mobile"
  artifacts:
    - path: "apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts"
      provides: "Revenue KPI fix with totalRevenue fallback"
    - path: "apps/web/src/app/api/v1/carrier/dashboard/activity/route.ts"
      provides: "Recent activity feed aggregation endpoint"
    - path: "apps/web/src/components/carrier/dashboard/DriverStatusStrip.tsx"
      provides: "Driver chips with HOS status dots"
    - path: "apps/web/src/components/carrier/dashboard/RecentActivity.tsx"
      provides: "Activity feed UI with icons and timestamps"
    - path: "apps/web/src/components/carrier/dashboard/QuickMessageBoard.tsx"
      provides: "Message board with polling and send"
  key_links:
    - from: "KPIStrip.tsx"
      to: "/api/v1/carrier/dashboard/kpi"
      via: "fetch, revenue now includes fallback calculation"
      pattern: "revenueThisWeek"
    - from: "QuickMessageBoard.tsx"
      to: "/api/v1/carrier/dashboard/messages"
      via: "30s polling interval + POST for send"
      pattern: "setInterval.*30000"
---

<objective>
Overhaul the carrier dashboard with 6 fixes: revenue calculation fix, actionable alert strip, driver status strip, recent activity feed, quick message board, and new two-column layout.

Purpose: Transform the dashboard from a basic KPI + dispatches view into a comprehensive operations command center.
Output: Fully functional dashboard with all 6 sections working against existing database tables.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/prisma/schema.prisma
@apps/web/src/app/(owner)/carrier/dashboard/page.tsx
@apps/web/src/components/carrier/dashboard/KPIStrip.tsx
@apps/web/src/components/carrier/dashboard/AlertBar.tsx
@apps/web/src/components/carrier/dashboard/TodayDispatches.tsx
@apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts
@apps/web/src/lib/carrier/reports.ts
@apps/web/src/app/(owner)/actions/fleet-messages.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix revenue KPI + create dashboard API endpoints</name>
  <files>
    apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts
    apps/web/src/app/api/v1/carrier/dashboard/alerts/route.ts
    apps/web/src/app/api/v1/carrier/dashboard/activity/route.ts
    apps/web/src/app/api/v1/carrier/dashboard/drivers-status/route.ts
    apps/web/src/app/api/v1/carrier/dashboard/messages/route.ts
  </files>
  <action>
**Fix 1 — Revenue in KPI endpoint (`kpi/route.ts`):**
- Add a `revenueThisWeek` field to the KPI response.
- Query: `SELECT COALESCE(SUM(total_revenue), 0) as revenue FROM loads WHERE org_id = $orgId AND created_at >= $monday AND status != 'cancelled'`
- Use Prisma `$queryRaw` for this since we need COALESCE with a fallback.
- Fallback: if `total_revenue` sum is 0, also compute `SUM(COALESCE(rate_amount, 0) + COALESCE(fuel_surcharge, 0) + COALESCE(detention_amount, 0) + COALESCE(other_charges, 0))` as `fallback_revenue` for the same filter, and return whichever is greater.
- Return `revenueThisWeek` as a number in the JSON alongside existing fields.

**Alerts endpoint (`alerts/route.ts`):**
- GET, auth + orgId check (same pattern as kpi/route.ts).
- Run 5 parallel count queries via `Promise.all`:
  1. Pending pay: `prisma.driverPayRecord.count({ where: { orgId, status: 'pending' } })`
  2. Expiring CDLs (30 days): `prisma.carrierDriver.count({ where: { orgId, status: 'active', cdlExpiry: { lte: thirtyDaysFromNow, gte: now } } })` — also count already-expired: `cdlExpiry: { lt: now }` as critical.
  3. Expiring truck registrations (30 days): `prisma.carrierTruck.count({ where: { orgId, status: 'active', registrationExpiry: { lte: thirtyDaysFromNow, gte: now } } })` — also expired as critical.
  4. Expiring contracts (30 days): `prisma.carrierContract.count({ where: { orgId, status: 'active', expirationDate: { lte: thirtyDaysFromNow, gte: now } } })`
  5. Planned dispatches (needing attention): `prisma.carrierDispatch.count({ where: { orgId, status: 'planned', scheduledDeparture: { lte: endOfToday } } })` — dispatches planned for today that haven't started.
- Return array of `{ id: string, label: string, count: number, href: string, severity: 'warning' | 'critical' }`. Only include items with count > 0.

**Activity endpoint (`activity/route.ts`):**
- GET, auth + orgId check.
- Query 6 sources for last 7 days, each limited to 15 rows, all in `Promise.all`:
  1. Dispatches with status changes (recently updated, status != 'planned'): `prisma.carrierDispatch.findMany({ where: { orgId, updatedAt: { gte: sevenDaysAgo } }, orderBy: { updatedAt: 'desc' }, take: 15, select: { id, status, notes, updatedAt } })` — format: "DC-XXXX moved to [status]" (extract dispatch number from notes with `[DISPATCH_NUMBER=...]` regex, fallback to id slice).
  2. Completed stops: `prisma.carrierStop.findMany({ where: { dispatch: { orgId }, status: 'completed', departedAt: { gte: sevenDaysAgo } }, orderBy: { departedAt: 'desc' }, take: 15, include: { dispatch: { select: { primaryDriverId: true, primaryDriver: { select: { firstName: true } } } }, facility: true } })` — format: "[Driver] completed [stopType] at [facility.name]".
  3. New loads: `prisma.carrierLoad.findMany({ where: { orgId, createdAt: { gte: sevenDaysAgo } }, orderBy: { createdAt: 'desc' }, take: 15, include: { client: { select: { name: true } } } })` — format: "Load [refNumber or id slice] created for [client]".
  4. Pay records: `prisma.driverPayRecord.findMany({ where: { orgId, createdAt: { gte: sevenDaysAgo } }, orderBy: { createdAt: 'desc' }, take: 15, include: { driver: { select: { firstName: true, lastName: true } } } })` — format: "Pay record generated for [driver]".
  5. Documents uploaded: `prisma.carrierDocument.findMany({ where: { dispatch: { orgId }, createdAt: { gte: sevenDaysAgo } }, orderBy: { createdAt: 'desc' }, take: 15, include: { uploader: { select: { firstName: true } } } })` — format: "[Uploader] uploaded [documentType]".
  6. New dispatches: `prisma.carrierDispatch.findMany({ where: { orgId, createdAt: { gte: sevenDaysAgo } }, orderBy: { createdAt: 'desc' }, take: 15, select: { id, notes, scheduledDeparture, createdAt } })` — format: "DC-XXXX scheduled for [date]".
- Merge all into unified array `{ type: string, description: string, timestamp: string, href: string }`, sort by timestamp DESC, take first 15.
- Each type gets a link: dispatches → `/carrier/dispatches/[id]`, loads → `/carrier/loads/[id]`, pay → `/carrier/reports/driver-pay`, docs → `/carrier/dispatches/[dispatchId]`.

**Drivers status endpoint (`drivers-status/route.ts`):**
- GET, auth + orgId check.
- Query active carrier drivers with their user info and current dispatch:
  ```
  prisma.carrierDriver.findMany({
    where: { orgId, status: 'active' },
    include: {
      user: { select: { id, firstName, lastName } },
      primaryDispatches: {
        where: { status: 'in_progress' },
        take: 1,
        select: { id, notes }
      }
    }
  })
  ```
- For HOS status: Query `DriverHOSEntry` for each driver's userId — get latest entry. Use raw query or individual lookups batched. Since DriverHOSEntry uses `driverId` pointing to `User.id` (not CarrierDriver.id), query with user IDs:
  ```sql
  SELECT DISTINCT ON ("driverId") "driverId", status
  FROM "DriverHOSEntry"
  WHERE "driverId" = ANY($userIds) AND "tenantId" = $orgId
  ORDER BY "driverId", "startTime" DESC
  ```
- Return array: `{ id, firstName, lastName, hosStatus: 'driving'|'on_duty'|'off_duty'|'sleeper'|null, dispatchId: string|null, dispatchNumber: string|null }`.

**Messages endpoint (`messages/route.ts`):**
- GET: auth + orgId check. Return last 5 FleetMessage for tenantId = orgId, ordered by createdAt DESC. Include sender info by joining User on senderId: `prisma.fleetMessage.findMany({ where: { tenantId: orgId }, orderBy: { createdAt: 'desc' }, take: 5 })`. Then batch-resolve sender names from User table. Return `{ id, senderName, body, createdAt, isBroadcast }`.
- POST: auth + orgId check. Accept `{ body: string, recipientId?: string }`. Create FleetMessage with `tenantId: orgId, senderId: session.userId, senderRole: 'owner', body, isBroadcast: !recipientId, recipientId: recipientId || null`. Return created message.
  </action>
  <verify>
- `curl` or browser test: GET `/api/v1/carrier/dashboard/kpi` returns `revenueThisWeek` field with a number (not null).
- GET `/api/v1/carrier/dashboard/alerts` returns array (possibly empty).
- GET `/api/v1/carrier/dashboard/activity` returns array of activity items.
- GET `/api/v1/carrier/dashboard/drivers-status` returns array of drivers.
- GET `/api/v1/carrier/dashboard/messages` returns array of messages.
- `tsc --noEmit` passes in apps/web.
  </verify>
  <done>All 5 API endpoints return correct data scoped to orgId. Revenue KPI includes fallback calculation when totalRevenue is null.</done>
</task>

<task type="auto">
  <name>Task 2: Build dashboard UI components and assemble new layout</name>
  <files>
    apps/web/src/components/carrier/dashboard/KPIStrip.tsx
    apps/web/src/components/carrier/dashboard/AlertBar.tsx
    apps/web/src/components/carrier/dashboard/DriverStatusStrip.tsx
    apps/web/src/components/carrier/dashboard/RecentActivity.tsx
    apps/web/src/components/carrier/dashboard/QuickMessageBoard.tsx
    apps/web/src/app/(owner)/carrier/dashboard/page.tsx
  </files>
  <action>
**KPIStrip.tsx — Update revenue display:**
- The KPI endpoint now returns `revenueThisWeek` directly. Remove the separate revenue report fetch.
- Simplify: single fetch to `/api/v1/carrier/dashboard/kpi`, read `revenueThisWeek` from the response.
- Keep the same 4-card layout and styling. Remove the `getWeekStartISO`/`getTodayISO` helpers and the second fetch to `/api/v1/carrier/reports/revenue`.

**AlertBar.tsx — Replace with actionable alert strip:**
- Change the data source from `/api/v1/carrier/compliance-alerts` to `/api/v1/carrier/dashboard/alerts`.
- New design: horizontal scrollable row of amber warning cards. Each card: `AlertTriangle` icon, message like "3 pending pay approvals", `ChevronRight` icon. Wrap each in a `Link` to the `href` from API.
- Critical severity items (expired CDLs/registrations): use red instead of amber.
- When array is empty: show green "All clear" banner (keep existing empty-state pattern).
- Skeleton: keep existing 3-chip skeleton.

**DriverStatusStrip.tsx — NEW component:**
- 'use client', fetch from `/api/v1/carrier/dashboard/drivers-status` on mount.
- Render horizontal scrollable row of driver chips.
- Each chip: circle with initials (first letter of first + last name), first name text, status dot (green = driving/on_duty, grey = off_duty/sleeper/null, blue = has active dispatch).
- If driver has a dispatch, show small dispatch number below name.
- Chip styling: `rounded-full bg-card border border-border px-3 py-2 flex items-center gap-2`.
- Skeleton: 5 circular placeholder chips.

**RecentActivity.tsx — NEW component:**
- 'use client', fetch from `/api/v1/carrier/dashboard/activity` on mount.
- Render vertical list of activity items inside a card with header "Recent Activity".
- Each row: type icon (use `Truck` for dispatches, `MapPin` for stops, `Package` for loads, `CreditCard` for pay, `FileText` for docs, `Send` for new dispatches), description text, relative timestamp using `formatDistanceToNow` logic (implement inline — do NOT add date-fns, use simple helper: "X min ago", "X hr ago", "X days ago").
- Each row clickable via `Link` to `href`.
- Skeleton: 5 rows with pulse animation.
- Empty state: "No recent activity" centered text.

**QuickMessageBoard.tsx — NEW component:**
- 'use client', fetch from `/api/v1/carrier/dashboard/messages` on mount.
- Poll every 30 seconds using `setInterval` in `useEffect` (clear on unmount).
- Header: "Messages" bold + "View All" link to `/carrier/messages` (or `/owner/messages` — check existing routes; if no carrier messages page exists, link to `#` with tooltip "Coming soon").
- Message list: 5 items, each showing sender name (bold), message preview (truncate to 50 chars with ellipsis), relative timestamp. Use `text-sm text-muted-foreground` for timestamp.
- Bottom: text input (`<input>` with `border rounded-lg px-3 py-2 text-sm w-full`) + Send button (`<button>` with brand color). Small "To: All Drivers" label above input.
- On send: POST to `/api/v1/carrier/dashboard/messages` with `{ body }`, then refresh the message list.
- Disable send button while sending (loading state).

**page.tsx — New layout assembly:**
Replace entire page content with this structure:
```
<div className="space-y-6">
  {/* Header */}
  <div>
    <h1>Dashboard</h1>
    <p>Carrier operations overview</p>
  </div>

  {/* Row 1: KPI Cards */}
  <KPIStrip />

  {/* Row 2: Alert Strip */}
  <AlertBar />

  {/* Row 3: Driver Status Strip */}
  <DriverStatusStrip />

  {/* Row 4: Two-column layout */}
  <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
    {/* Left 60% */}
    <div className="lg:col-span-3 space-y-6">
      <div>
        <h2>Today's Dispatches</h2>
        <TodayDispatches />
      </div>
      <RecentActivity />
    </div>

    {/* Right 40% */}
    <div className="lg:col-span-2 space-y-6">
      <QuickMessageBoard />
      {/* Quick Actions */}
      <div>
        <h2>Quick Actions</h2>
        {/* existing 3 links: New Dispatch, New Load, New Client */}
      </div>
    </div>
  </div>
</div>
```
- Keep `min-w-0` on flex containers to prevent overflow.
- Import all new components at top.
- Keep the page as a server component — all new sections are client components that fetch their own data.
  </action>
  <verify>
- `tsc --noEmit` passes in apps/web.
- Load `/carrier/dashboard` in browser — all 6 sections visible.
- Revenue KPI shows a non-zero number (if loads exist with rate_amount).
- Alert strip shows amber/red cards or green "all clear".
- Driver chips show with status dots.
- Activity feed shows recent events.
- Message board shows messages and send works.
- On mobile viewport: single column stacking.
  </verify>
  <done>
- Dashboard displays all 6 sections in the new layout.
- Revenue KPI is fixed (uses direct sum with fallback).
- Alert strip shows actionable items with navigation.
- Driver status strip shows active drivers with HOS dots.
- Recent Activity feed shows last 15 cross-operation events.
- Quick Message Board polls every 30s and supports sending.
- Mobile layout stacks to single column.
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` — no type errors
- Load `/carrier/dashboard` — all sections render
- Revenue KPI shows actual value (not $0 when loads have rate_amount)
- Click an alert chip — navigates to correct page
- Send a message via the board — appears in message list
- Resize to mobile — layout stacks correctly
</verification>

<success_criteria>
All 6 fixes implemented: revenue calculation fixed, alert strip with navigation, driver status strip with HOS dots, recent activity feed with 15 merged events, quick message board with 30s polling + send, and responsive two-column layout.
</success_criteria>

<output>
After completion, create `.planning/quick/278-comprehensive-carrier-dashboard-overhaul/278-SUMMARY.md`
</output>
