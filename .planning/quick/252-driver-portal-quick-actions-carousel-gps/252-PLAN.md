---
phase: "252"
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/driver/driver-quick-actions.tsx
  - apps/web/src/components/driver/driver-dashboard.tsx
  - apps/web/src/components/driver/driver-gps-ping.tsx
  - apps/web/src/app/(driver)/layout.tsx
  - apps/web/src/app/(driver)/home/page.tsx
  - apps/web/src/app/(driver)/actions/driver-dashboard.ts
  - apps/web/src/app/globals.css
  - apps/web/src/components/navigation/owner-shell.tsx
  - apps/web/src/components/carrier/dashboard/KPIStrip.tsx
autonomous: true

must_haves:
  truths:
    - "Driver dashboard shows a single-item swipeable carousel with CSS scroll snap, one action visible at a time with prev/next peeking 20px"
    - "Each carousel tile shows a real data badge (stops remaining, unread messages, HOS status, expiring docs, or tap to report)"
    - "GPS indicator appears as a pill badge below the greeting text, not in the header"
    - "Owner portal mobile header shows DC logo + notification bell + avatar only (no tenant name, no user text)"
    - "Owner dashboard shows 4 KPIs: Loads This Week, Revenue This Week, Pending Pay Approvals, Open Invoices"
    - "Pending Pay Approvals and Open Invoices KPI cards are clickable and navigate to their respective pages"
  artifacts:
    - path: "apps/web/src/components/driver/driver-quick-actions.tsx"
      provides: "Scroll-snap carousel with badge props"
    - path: "apps/web/src/components/carrier/dashboard/KPIStrip.tsx"
      provides: "4 KPI cards with real DB queries"
    - path: "apps/web/src/components/navigation/owner-shell.tsx"
      provides: "Mobile-responsive header"
  key_links:
    - from: "apps/web/src/app/(driver)/actions/driver-dashboard.ts"
      to: "apps/web/src/components/driver/driver-quick-actions.tsx"
      via: "badge data props passed through driver-dashboard.tsx"
      pattern: "quickActionBadges"
    - from: "apps/web/src/components/carrier/dashboard/KPIStrip.tsx"
      to: "/api/v1/carrier/pay-records and prisma CarrierLoad"
      via: "fetch calls for pending pay count and invoiced load count"
      pattern: "pendingPayCount|openInvoices"
---

<objective>
Fix four UI issues across driver and owner web portals: (1) replace driver quick actions horizontal scroll with a single-item CSS scroll-snap carousel with real data badges, (2) move GPS indicator from header to dashboard pill, (3) fix owner mobile header to show only logo + bell + avatar, (4) replace two KPI cards with Pending Pay Approvals and Open Invoices.

Purpose: Improve driver dashboard usability and owner dashboard actionability.
Output: Updated driver dashboard, owner header, and owner KPI strip.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/driver/driver-quick-actions.tsx
@apps/web/src/components/driver/driver-dashboard.tsx
@apps/web/src/components/driver/driver-gps-ping.tsx
@apps/web/src/app/(driver)/layout.tsx
@apps/web/src/app/(driver)/home/page.tsx
@apps/web/src/app/(driver)/actions/driver-dashboard.ts
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/components/carrier/dashboard/KPIStrip.tsx
@apps/web/src/app/globals.css
@apps/web/tailwind.config.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Driver carousel with badges + GPS indicator reposition</name>
  <files>
    apps/web/src/app/globals.css
    apps/web/src/app/(driver)/actions/driver-dashboard.ts
    apps/web/src/app/(driver)/home/page.tsx
    apps/web/src/components/driver/driver-dashboard.tsx
    apps/web/src/components/driver/driver-quick-actions.tsx
    apps/web/src/components/driver/driver-gps-ping.tsx
    apps/web/src/app/(driver)/layout.tsx
  </files>
  <action>
**1. Add scrollbar-hide utility to globals.css:**
Add at the end of globals.css:
```css
/* Hide scrollbar for scroll-snap carousels */
.scrollbar-hide::-webkit-scrollbar { display: none; }
.scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
```

**2. Add badge data fetching to `driver-dashboard.ts`:**
Do NOT modify the existing `getDriverDashboardData` function signature or break any existing callers. Add a NEW exported async function `getDriverQuickActionBadges()` that:
- Calls `requireRole([UserRole.DRIVER])` and `getCurrentUser()`
- Uses `getTenantPrisma()` for all queries
- Fetches in parallel:
  - **stopsRemaining**: Count RouteStops with status != 'COMPLETED' on the driver's active route (use the same active dispatch logic — find Route where driverId matches and status is active/in_transit). If no active route, return 0.
  - **unreadMessages**: Count FleetMessages where recipientId = userId OR (isBroadcast = true AND recipientId IS NULL) — just count, no read tracking needed. Return count number.
  - **hosStatus**: Call `getDriverHOS()` and extract `currentStatus` field. Map to short labels: 'DRIVING' -> 'D', 'ON_DUTY' -> 'ON', 'SLEEPER_BERTH' -> 'SB', 'OFF_DUTY' -> 'OFF'. Default to 'OFF' if null.
  - **expiringDocs**: Count Documents where driverId = driver's driver record id AND expiresAt is within 30 days from now AND expiresAt > now. Return count.
- Returns `{ stopsRemaining: number, unreadMessages: number, hosStatus: string, expiringDocs: number }`
- Wrap everything in try/catch, return safe defaults on error: `{ stopsRemaining: 0, unreadMessages: 0, hosStatus: 'OFF', expiringDocs: 0 }`

**3. Update `page.tsx` (driver home):**
- Import and call `getDriverQuickActionBadges()` in parallel with existing `getDriverDashboardData()`
- Pass result as `quickActionBadges` prop to `<DriverDashboard>`
- On error, pass default `{ stopsRemaining: 0, unreadMessages: 0, hosStatus: 'OFF', expiringDocs: 0 }`

**4. Update `driver-dashboard.tsx`:**
- Add `quickActionBadges` to the props interface: `quickActionBadges: { stopsRemaining: number; unreadMessages: number; hosStatus: string; expiringDocs: number }`
- Pass `quickActionBadges` to `<DriverQuickActions quickActionBadges={quickActionBadges} />`
- Extract GPS indicator display from `DriverGpsPing` component. Since DriverGpsPing is a client component that manages its own state, instead: import `DriverGpsPing` here and render it below the greeting h1 as a pill badge row. The DriverGpsPing component will need to be refactored (see below).
- Add GPS pill below greeting:
```tsx
<h1 className="text-xl font-bold text-foreground leading-snug min-h-[1.75rem]">{greeting}</h1>
<DriverGpsPing variant="pill" />
```

**5. Refactor `driver-gps-ping.tsx`:**
- Add a `variant` prop: `variant?: 'header' | 'pill'` defaulting to `'header'`
- When `variant === 'pill'`:
  - Render as a horizontal flex row with items-center gap-2 and mb-6
  - Show a 2x2 rounded-full dot (green-500 animate-pulse when active, gray-400 when off)
  - Show text "Location sharing on" or "Location sharing off" in text-sm text-muted-foreground
  - Show denied warning below if denied
- When `variant === 'header'` (existing): keep existing compact render
- The GPS logic (watchPosition, pinging, etc.) stays identical regardless of variant

**6. Update `layout.tsx` (driver):**
- Remove `<DriverGpsPing />` from the header entirely (line 49)
- Remove the import of `DriverGpsPing` from the imports

**7. Rewrite `driver-quick-actions.tsx`:**
- Accept props: `{ quickActionBadges: { stopsRemaining: number; unreadMessages: number; hosStatus: string; expiringDocs: number } }`
- Define actions array with id, href, label, icon (from lucide-react), color (hex string), and a badge function that takes quickActionBadges and returns a string:
  - My Route: #3B82F6, MapPin, badge = `${badges.stopsRemaining} stops remaining` (or "No active route" if 0)
  - Messages: #10B981, MessageSquare, badge = `${badges.unreadMessages} unread` if > 0, else "No new messages"
  - Hours: #8B5CF6, Clock, badge = badges.hosStatus (the short label like "ON", "OFF", "D", "SB")
  - Documents: #F59E0B, FileText, badge = `${badges.expiringDocs} expiring` if > 0, else "All current"
  - Report Incident: #EF4444, AlertTriangle, badge = "Tap to report"
- Fix Documents href from '/hours' to '/documents' (or keep '/hours' if /documents doesn't exist — check first)
- Render the carousel container:
```tsx
<div
  className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide gap-4 px-[calc(50%-80px)]"
  style={{ scrollPaddingInline: 'calc(50% - 80px)' }}
>
```
- Each tile: `snap-center shrink-0 w-40 h-32 rounded-2xl flex flex-col items-center justify-center gap-2 cursor-pointer active:scale-95 transition-transform` with `style={{ backgroundColor: action.color }}`
- Icon: `w-8 h-8 text-white`
- Label: `text-white font-semibold text-sm`
- Badge: `text-white/80 text-xs`
- Use `router.push(action.href)` via `useRouter` from next/navigation for onClick, or keep using `<Link>` — but since we need onClick with scale animation, use a div with onClick + router.push
- Keep the "Quick Actions" section label above the carousel
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — no TypeScript errors.
Visually: driver dashboard at /home shows single-card carousel with scroll-snap, GPS pill below greeting, no GPS in header.
  </verify>
  <done>
Driver dashboard shows scroll-snap carousel with 5 action tiles (one visible at a time, edges peek), each tile has a real data badge. GPS indicator is a pill below the greeting, removed from header bar entirely.
  </done>
</task>

<task type="auto">
  <name>Task 2: Owner mobile header fix + KPI replacements</name>
  <files>
    apps/web/src/components/navigation/owner-shell.tsx
    apps/web/src/components/carrier/dashboard/KPIStrip.tsx
  </files>
  <action>
**1. Fix owner-shell.tsx mobile header:**
Current header (line 21-31):
```tsx
<header className="flex h-14 shrink-0 items-center gap-2 border-b bg-card/80 backdrop-blur-sm px-4 lg:px-6">
  <SidebarTrigger className="-ml-1 hidden lg:flex" />
  <Separator orientation="vertical" className="mr-2 h-4 hidden lg:block" />
  {tenantName && (
    <span className="text-sm font-semibold text-foreground truncate hidden lg:block">{tenantName}</span>
  )}
  <div className="ml-auto flex items-center gap-2">
    <NotificationBell />
    <UserMenu />
  </div>
</header>
```

Update to:
- Import `AppLogo` (DCChevronIcon) from `@/components/navigation/app-logo` — the same one used in the driver layout
- Add the DC logo at the start of the header, visible on ALL screen sizes: `<AppLogo size={28} variant="dark" />`
- Keep `SidebarTrigger` as `hidden lg:flex`
- Keep `Separator` as `hidden lg:block`
- Tenant name already has `hidden lg:block` — correct, keep it
- `NotificationBell` stays visible on all sizes — correct
- `UserMenu` currently shows name+email+avatar. It already accepts `compactOnMobile` prop but it's not being passed. Add `compactOnMobile` prop to hide name/email text on mobile: `<UserMenu compactOnMobile />`

Result on mobile: DC logo | [spacer] | notification bell | avatar circle
Result on desktop: DC logo | sidebar trigger | separator | tenant name | [spacer] | notification bell | avatar + name + email

**2. Replace KPI cards in KPIStrip.tsx:**
- Remove `avgDwellMinutes` and `onTimePct` from the KPIData interface and all their fetching/calculation logic
- Remove the performance API fetch entirely (`/api/v1/carrier/reports/performance`) — it was only used for dwell + on-time + loads count
- Add two new data points to the interface:
  - `pendingPayApprovals: number | null`
  - `openInvoices: number | null`
- Add two new API calls in the useEffect (can be simple fetch calls to existing or new endpoints). Since there may not be dedicated count endpoints, create inline fetch logic:
  - **Pending Pay Approvals**: `fetch('/api/v1/carrier/pay-records?status=pending&count_only=true')` — BUT this endpoint may not support count_only. Instead, use a new small server-side API. Actually, to keep it simple and avoid creating new API routes (constraint says no new server actions for driver, but owner is fine), create a new small API route:
    - Create `apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts` — a GET endpoint that:
      - Validates session via `getSession()`, requires OWNER/MANAGER role
      - Queries `prisma.driverPayRecord.count({ where: { orgId, status: 'pending' } })`
      - Queries `prisma.carrierLoad.count({ where: { orgId, status: 'invoiced' } })`
      - Queries existing loads this week: `prisma.carrierLoad.count({ where: { orgId, createdAt: { gte: weekStart } } })` — actually the loads count was from performance endpoint rows. Simplify: count CarrierLoads created this week.
      - Queries revenue this week from the existing revenue endpoint (keep that fetch)
      - Returns JSON: `{ loadsThisWeek, revenueThisWeek, pendingPayApprovals, openInvoices }`
  - Actually, to minimize changes, keep the existing revenue API call for revenueThisWeek, and add two simple fetch calls for the counts. Better yet: just add the two new counts as separate fetches and keep loadsThisWeek from the performance endpoint.

**Simplest approach — keep what works, replace what's removed:**
- Keep the revenue API fetch for `revenueThisWeek`
- For `loadsThisWeek`: the performance endpoint returned rows and we counted them. Instead, create a simple server action or inline count. Since we want real DB data, add a new API route.

**Final approach — create one new KPI endpoint:**
- Add file: `apps/web/src/app/api/v1/carrier/dashboard/kpi/route.ts`
- GET handler: authenticates via `getSession()` + role check (OWNER/MANAGER)
- Queries in parallel via Prisma:
  1. `loadsThisWeek`: `carrierLoad.count({ where: { orgId, createdAt: { gte: mondayOfThisWeek } } })`
  2. `pendingPayApprovals`: `driverPayRecord.count({ where: { orgId, status: 'pending' } })`
  3. `openInvoices`: `carrierLoad.count({ where: { orgId, status: 'invoiced' } })`
- Returns `{ loadsThisWeek, pendingPayApprovals, openInvoices }`

- Update KPIStrip.tsx:
  - Fetch from `/api/v1/carrier/dashboard/kpi` for loadsThisWeek + pendingPayApprovals + openInvoices
  - Keep existing `/api/v1/carrier/reports/revenue` fetch for revenueThisWeek
  - Remove the performance API fetch entirely
  - Import `useRouter` from `next/navigation`
  - Update the 4 cards array:
    1. Package icon, "Loads This Week", value = loadsThisWeek, format as string, no href
    2. DollarSign icon, "Revenue This Week", value = revenueThisWeek, format as currency, no href
    3. CreditCard icon (import from lucide-react), "Pending Pay", value = pendingPayApprovals, format as string, href = `/carrier/reports/driver-pay`
    4. FileText icon (import from lucide-react), "Open Invoices", value = openInvoices, format as string, href = `/carrier/loads?status=invoiced`
  - Add `cursor-pointer active:scale-95 transition-transform` to ALL card divs
  - Cards with href: wrap onClick with `router.push(href)`
  - Cards without href: just cursor-pointer for visual consistency (no navigation)
  - Remove the `Clock` and `CheckCircle` icon imports, add `CreditCard` and `FileText`
  - Remove `PerformanceRow` interface and all dwell/onTime calculation code
  </action>
  <verify>
Run `cd apps/web && npx tsc --noEmit` — no TypeScript errors.
Visually: owner mobile header at < 1024px shows DC logo + bell + avatar only. KPI strip shows 4 cards: Loads This Week, Revenue This Week, Pending Pay, Open Invoices.
  </verify>
  <done>
Owner mobile header shows DC logo, notification bell, and avatar circle only (no tenant name, no user text). Owner dashboard KPI strip shows 4 cards with real data: Loads This Week, Revenue This Week, Pending Pay Approvals (clickable -> /carrier/reports/driver-pay), Open Invoices (clickable -> /carrier/loads?status=invoiced). Avg Dwell and On-Time % cards are removed.
  </done>
</task>

</tasks>

<verification>
1. `cd apps/web && npx tsc --noEmit` passes with zero errors
2. Driver portal /home: carousel shows one tile at a time with scroll-snap, badges show real data
3. Driver portal /home: GPS pill below greeting, GPS not in header
4. Owner portal mobile (< 1024px): header shows DC logo + bell + avatar only
5. Owner portal desktop: header unchanged (logo + sidebar trigger + tenant name + bell + user menu)
6. Owner /carrier/dashboard: 4 KPI cards in correct order, Pending Pay and Open Invoices clickable
</verification>

<success_criteria>
- Zero TypeScript errors
- Driver carousel is CSS scroll-snap only, no new npm packages
- All badge data comes from real DB queries, not hardcoded
- GPS indicator fully removed from driver header
- Desktop owner header unchanged
- KPI cards show real counts from DB
</success_criteria>

<output>
After completion, create `.planning/quick/252-driver-portal-quick-actions-carousel-gps/252-SUMMARY.md`
</output>
