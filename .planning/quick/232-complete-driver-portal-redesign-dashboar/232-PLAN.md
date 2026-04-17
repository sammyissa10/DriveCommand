---
phase: quick-232
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/app/(driver)/page.tsx
  - apps/web/src/app/(driver)/layout.tsx
  - apps/web/src/app/(driver)/more/page.tsx
  - apps/web/src/components/driver/driver-bottom-nav.tsx
  - apps/web/src/components/driver/driver-nav.tsx
  - apps/web/src/components/driver/driver-dashboard.tsx
  - apps/web/src/components/driver/driver-gps-ping.tsx
  - apps/web/src/components/driver/driver-notification-bell.tsx
  - apps/web/src/components/driver/driver-notification-panel.tsx
  - apps/web/src/components/driver/driver-hos-widget.tsx
  - apps/web/src/components/driver/driver-quick-actions.tsx
  - apps/web/src/components/driver/driver-messages-preview.tsx
  - apps/web/src/components/driver/driver-dispatch-card.tsx
  - apps/web/src/app/api/driver/gps-ping/route.ts
  - apps/web/src/app/api/driver/notifications/route.ts
  - apps/web/src/app/api/driver/notifications/mark-read/route.ts
  - apps/web/src/app/(driver)/actions/driver-dashboard.ts
autonomous: true
must_haves:
  truths:
    - "Driver lands on Dashboard tab after login with time-aware greeting"
    - "Active dispatch card shows dispatch info with Start/Continue button"
    - "Quick action tiles navigate to correct pages"
    - "HOS widget shows current status and allows status change"
    - "GPS ping fires via browser watchPosition and shows green/grey indicator"
    - "Notification bell shows unread count and dropdown with notifications"
    - "More tab opens full-screen menu with Hours, Documents, Incidents, Support, Log Out"
    - "Bottom nav shows Dashboard, Route, Load, Messages, More"
    - "All timestamps are human-readable, never raw ISO strings"
  artifacts:
    - path: "apps/web/src/app/(driver)/page.tsx"
      provides: "Dashboard landing page (server component)"
    - path: "apps/web/src/components/driver/driver-dashboard.tsx"
      provides: "Client-side dashboard with GPS, notifications, HOS, messages"
    - path: "apps/web/src/app/api/driver/gps-ping/route.ts"
      provides: "POST endpoint for browser GPS coordinates"
    - path: "apps/web/src/app/api/driver/notifications/route.ts"
      provides: "GET endpoint for driver notifications"
    - path: "apps/web/src/app/api/driver/notifications/mark-read/route.ts"
      provides: "PATCH endpoint for marking notifications read"
    - path: "apps/web/src/app/(driver)/more/page.tsx"
      provides: "More menu page"
  key_links:
    - from: "apps/web/src/components/driver/driver-gps-ping.tsx"
      to: "/api/driver/gps-ping"
      via: "navigator.geolocation.watchPosition + fetch POST"
      pattern: "fetch.*api/driver/gps-ping"
    - from: "apps/web/src/components/driver/driver-notification-bell.tsx"
      to: "/api/driver/notifications"
      via: "fetch GET polling every 60s"
      pattern: "fetch.*api/driver/notifications"
    - from: "apps/web/src/components/driver/driver-hos-widget.tsx"
      to: "actions/driver-hos.ts"
      via: "updateDutyStatus server action"
      pattern: "updateDutyStatus"
---

<objective>
Complete driver portal redesign: new dashboard landing page, browser GPS pinging, notification bell, tab restructure (Dashboard/Route/Load/Messages/More), and mobile-first layout polish.

Purpose: Transform the driver portal from a bare redirect-to-route page into a functional standalone experience with dashboard, GPS status, notifications, and quick actions — serving as the primary driver interface until the native mobile app ships.

Output: Fully redesigned driver portal with 5-tab navigation, dashboard home screen, GPS pinging, notification center, HOS widget, and More menu.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/app/(driver)/layout.tsx
@apps/web/src/app/(driver)/page.tsx
@apps/web/src/app/(driver)/my-route/page.tsx
@apps/web/src/app/(driver)/actions/driver-routes.ts
@apps/web/src/app/(driver)/actions/driver-hos.ts
@apps/web/src/app/(driver)/actions/driver-messages.ts
@apps/web/src/components/driver/driver-bottom-nav.tsx
@apps/web/src/components/driver/driver-nav.tsx
@apps/web/src/components/driver/gps-tracker.tsx
@apps/web/src/app/api/gps/report/route.ts
@apps/web/src/app/api/v1/carrier/notifications/route.ts
@apps/web/src/app/api/v1/carrier/notifications/mark-read/route.ts
@apps/web/src/components/navigation/notification-bell.tsx
@apps/web/src/components/navigation/notification-center.tsx
@apps/web/src/lib/carrier/in-app-notifications.ts
@apps/web/src/lib/auth/supabase.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: API endpoints + server actions for dashboard data, GPS ping, and notifications</name>
  <files>
    apps/web/src/app/api/driver/gps-ping/route.ts
    apps/web/src/app/api/driver/notifications/route.ts
    apps/web/src/app/api/driver/notifications/mark-read/route.ts
    apps/web/src/app/(driver)/actions/driver-dashboard.ts
  </files>
  <action>
**1. Create POST /api/driver/gps-ping/route.ts:**
- Accept `{ lat: number, lng: number, accuracy?: number, dispatchId?: string }`
- Authenticate via `getSession()` (cookie-based, web only — no Bearer token needed)
- Verify session.role === 'DRIVER'
- Look up `carrierDriver` by `userId = session.userId, orgId = session.tenantId` using bypass_rls transaction pattern (same as driver-routes.ts)
- Look up active `carrierDispatch` for that driver (status in ['planned', 'in_progress']) to get `truckId` (CarrierTruck ID)
- IMPORTANT: GPSLocation table has FK to legacy `Truck` table, NOT `CarrierTruck`. Since Carrier Ops drivers use CarrierTruck, we CANNOT write to GPSLocation without a matching legacy Truck row. Instead:
  - Log the GPS coordinates with structured logger: `logger.info('driver-gps-ping', { driverId, lat, lng, accuracy, dispatchId, carrierTruckId })`
  - Return `{ saved: true, source: 'web_driver_portal' }` — the UI only needs to know the ping succeeded to show green status
  - Add a TODO comment: "When GPSLocation table adds CarrierTruck FK or a new CarrierGPSLocation table is created, persist coordinates here"
- Tenant isolation: orgId from session only, never from request body
- Rate limit: use existing `gpsLimiter` from `@/lib/rate-limit` (same as /api/gps/report)

**2. Create GET /api/driver/notifications/route.ts:**
- Follow the exact pattern from `/api/v1/carrier/notifications/route.ts`
- Authenticate via `getSession()`, verify role === 'DRIVER'
- Query `InAppNotification` WHERE `orgId = session.tenantId` AND (`userId = session.userId` OR `userId IS NULL`) AND `type IN ('dispatch_assigned', 'fleet_message')`
- Accept query params: `?unread=true&limit=20`
- Return `{ notifications, unreadCount }`
- Use direct `prisma` (not bypass_rls) — InAppNotification doesn't have RLS issues since we filter by orgId from session

**3. Create PATCH /api/driver/notifications/mark-read/route.ts:**
- Follow the exact pattern from `/api/v1/carrier/notifications/mark-read/route.ts`
- Authenticate via `getSession()`, verify role === 'DRIVER'
- Accept `{ ids?: string[], all?: boolean }` — validate with zod
- Update matching `InAppNotification` rows WHERE `orgId = session.tenantId` AND (`userId = session.userId` OR `userId IS NULL`)
- When `all: true`, additionally filter `type IN ('dispatch_assigned', 'fleet_message')` so driver mark-read doesn't affect owner notifications
- Return `{ success: true, updated: count }`

**4. Create server action apps/web/src/app/(driver)/actions/driver-dashboard.ts:**
- `getDriverDashboardData()` — single server action that returns all dashboard data in one call:
  - Active dispatch (reuse `getMyActiveDispatch()` from driver-routes.ts — import and call it, don't duplicate)
  - HOS data (reuse `getDriverHOS()` from driver-hos.ts)
  - Recent unread messages: query last 2 unread FleetMessages for this driver (similar to getDriverMessages but limited to 2, ordered desc, only unread — use the same prisma query pattern from driver-messages.ts but with `take: 2, orderBy: { createdAt: 'desc' }`)
  - Return typed object: `{ dispatch, hos, recentMessages: { id, senderRole, body, createdAt }[] }`
- Mark with `'use server'` directive
- Enforce DRIVER role via `requireRole([UserRole.DRIVER])`
  </action>
  <verify>
Run `npx tsc --noEmit` from apps/web — no TypeScript errors on the new files. Verify the 3 API route files exist and export the correct HTTP method handlers.
  </verify>
  <done>
Three API endpoints (gps-ping POST, notifications GET, notifications/mark-read PATCH) and one dashboard server action exist with proper auth, tenant isolation, and typed responses.
  </done>
</task>

<task type="auto">
  <name>Task 2: Dashboard page, client components, tab restructure, and layout overhaul</name>
  <files>
    apps/web/src/app/(driver)/page.tsx
    apps/web/src/app/(driver)/layout.tsx
    apps/web/src/app/(driver)/more/page.tsx
    apps/web/src/components/driver/driver-bottom-nav.tsx
    apps/web/src/components/driver/driver-nav.tsx
    apps/web/src/components/driver/driver-dashboard.tsx
    apps/web/src/components/driver/driver-gps-ping.tsx
    apps/web/src/components/driver/driver-notification-bell.tsx
    apps/web/src/components/driver/driver-notification-panel.tsx
    apps/web/src/components/driver/driver-hos-widget.tsx
    apps/web/src/components/driver/driver-quick-actions.tsx
    apps/web/src/components/driver/driver-messages-preview.tsx
    apps/web/src/components/driver/driver-dispatch-card.tsx
  </files>
  <action>
**A. Rewrite apps/web/src/app/(driver)/page.tsx — Dashboard landing page (server component):**
- Remove the redirect-to-route logic entirely
- Add `export const dynamic = 'force-dynamic'`
- Import and call `getDriverDashboardData()` from `actions/driver-dashboard.ts`
- Get session via `getSession()` to extract `firstName`
- Render `<DriverDashboard>` client component, passing: `firstName`, `dispatch`, `hos`, `recentMessages`
- This is the DEFAULT landing page — drivers land here after login

**B. Create apps/web/src/components/driver/driver-dashboard.tsx ('use client'):**
- Master client component that composes all dashboard sections
- Props: `{ firstName?: string, dispatch: DispatchData | null, hos: HosData, recentMessages: MessagePreview[] }`
- Layout: single column, mobile-first, max-w-lg mx-auto, space-y-5, px-4
- Sections in order:
  1. **Header row:** Time-aware greeting + notification bell + GPS indicator
     - Greeting: compute greeting based on `new Date().getHours()` — "Good morning" (5-11), "Good afternoon" (12-16), "Good evening" (17-4). Show: "Good morning, {firstName}." If no firstName, just "Good morning."
     - Right side: `<DriverNotificationBell />` and `<DriverGpsPing />`
  2. `<DriverDispatchCard dispatch={dispatch} />`
  3. `<DriverQuickActions />`
  4. `<DriverHosWidget hos={hos} />`
  5. `<DriverMessagesPreview messages={recentMessages} />`

**C. Create apps/web/src/components/driver/driver-dispatch-card.tsx ('use client'):**
- Full-width card with rounded-xl, shadow-sm, bg-card, p-4
- If dispatch exists (planned or in_progress):
  - Show: status badge (colored pill — planned=slate, in_progress=blue), truck unit number as subtitle
  - Departure time formatted as "Apr 16, 6:30 AM" using Intl.DateTimeFormat
  - Stop progress: "X of Y stops completed" (count stops where status === 'completed')
  - Next stop: find first stop where status !== 'completed', show facility name + city + appointment time
  - CTA button: "Start Trip" if planned (links to /my-route), "Continue to Stops" if in_progress (links to /my-route). Use Next.js Link, styled as full-width primary button (bg-primary text-primary-foreground h-12 rounded-lg font-semibold)
- If no dispatch: centered empty state with MapPin icon, "No active dispatch" heading, "Contact your dispatcher for your next assignment" subtext. Muted colors.

**D. Create apps/web/src/components/driver/driver-quick-actions.tsx ('use client'):**
- Section header: "QUICK ACTIONS" — text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3
- Horizontal scrollable row: `flex gap-3 overflow-x-auto pb-2 -mx-4 px-4` (negative margin trick for edge-to-edge scroll)
- 5 tiles, each: `min-w-[100px] flex-shrink-0 rounded-xl p-4 flex flex-col items-center gap-2 text-center`
  - My Route (blue bg-blue-50 dark:bg-blue-950, MapPin icon, link to /my-route)
  - Messages (green bg-green-50 dark:bg-green-950, MessageSquare icon, link to /messages)
  - Hours (purple bg-purple-50 dark:bg-purple-950, Clock icon, link to /hours)
  - Documents (orange bg-orange-50 dark:bg-orange-950, FileText icon, link to /more — documents section, but since no dedicated /documents page exists, link to /hours for now and add TODO)
  - Report Incident (red bg-red-50 dark:bg-red-950, AlertTriangle icon, link to /incidents)
- Each tile: min-h-[80px], text-xs font-medium label below icon
- All tiles are Next.js Link elements for proper navigation

**E. Create apps/web/src/components/driver/driver-hos-widget.tsx ('use client'):**
- Section header: "DUTY STATUS" (same uppercase style)
- Card with current duty status shown as colored badge pill:
  - OFF_DUTY → grey (bg-gray-100 text-gray-700), SLEEPER_BERTH → blue, DRIVING → green, ON_DUTY → amber
- Four tap buttons in a row: OFF, SB, D, ON — each a small rounded button (min-w-[56px] h-10)
  - Active status button gets filled color, others get outline style
  - On tap: call `updateDutyStatus` server action from driver-hos.ts via `useActionState`
  - Show optimistic UI: immediately switch the active button, revert on error
- Below buttons: "{hours}h {minutes}m on duty today" — compute from `hos.onDutyHoursUsed` (convert decimal hours to Xh Ym format)

**F. Create apps/web/src/components/driver/driver-messages-preview.tsx ('use client'):**
- Section header: "RECENT MESSAGES"
- If messages array is empty: "No new messages" in muted text, single line
- If messages exist: show up to 2 message cards, each with:
  - Sender role badge ("Dispatch" for OWNER senderRole, "Driver" for DRIVER)
  - Message body truncated to 60 chars with ellipsis (line-clamp-1)
  - Relative timestamp using same `relativeTime()` helper pattern from notification-center.tsx
- "View all messages" link at bottom → navigates to /messages
- Use bg-card rounded-lg p-3 for each message row

**G. Create apps/web/src/components/driver/driver-gps-ping.tsx ('use client'):**
- On mount: call `navigator.geolocation.watchPosition()` with options `{ enableHighAccuracy: true, maximumAge: 30000, timeout: 10000 }`
- On each position callback: POST to `/api/driver/gps-ping` with `{ lat, lng, accuracy }`
- Throttle: skip POSTs if last successful POST was <30 seconds ago (track with useRef timestamp)
- State: `'active' | 'denied' | 'unavailable' | 'pending'`
- Render: small inline indicator next to greeting
  - active: green dot (h-2 w-2 bg-green-500 rounded-full animate-pulse) + "Location on" text-xs
  - denied: grey dot + "Location off" text-xs
  - pending: yellow dot + "Locating..." text-xs
- If denied: show a subtle banner below header: "Location sharing is off. Enable location access in your browser settings."
- CRITICAL: Clean up watchPosition on unmount via `navigator.geolocation.clearWatch(watchId)` stored in useRef
- Add code comment: "watchPosition only works while the tab is open and active. Background sync is handled by the native mobile app."

**H. Create apps/web/src/components/driver/driver-notification-bell.tsx ('use client'):**
- Follow the exact pattern from `components/navigation/notification-bell.tsx` but pointing to `/api/driver/notifications`
- Poll every 60s via setInterval, clean up on unmount
- Show red badge with unread count (hidden when 0)
- On click: toggle `<DriverNotificationPanel>` dropdown

**I. Create apps/web/src/components/driver/driver-notification-panel.tsx ('use client'):**
- Similar to `notification-center.tsx` but adapted for driver:
  - Fetch from `/api/driver/notifications?limit=20`
  - Mark read via PATCH `/api/driver/notifications/mark-read`
  - Deep-link resolution: `dispatch_assigned` → `/my-route`, `fleet_message` → `/messages`
  - Same UI: sticky header with "Mark all read", notification rows with icon + title + message + relative timestamp + unread indicator
  - Empty state: Bell icon + "No notifications"

**J. Rewrite apps/web/src/components/driver/driver-bottom-nav.tsx:**
- New 5-tab structure:
  - Dashboard (Home icon from lucide) → href `/` (the driver root page.tsx)
  - Route (MapPin icon) → href `/my-route`
  - Load (Package icon) → href `/my-load`
  - Messages (MessageSquare icon) → href `/messages`
  - More (LayoutGrid icon) → href `/more`
- Active tab: text-primary font-semibold, blue highlight
- Min height: 60px (h-[60px]) for thumb accessibility — increase from current 56px
- Each icon + label column, centered
- Remove Support (LifeBuoy) tab — it moves to More menu
- Remove Hours tab — it moves to More menu
- Remove Report tab — it moves to More menu

**K. Rewrite apps/web/src/components/driver/driver-nav.tsx (desktop nav):**
- Same 5 items as bottom nav: Dashboard, Route, Load, Messages, More
- Keep the same styling pattern (horizontal pills)
- Dashboard href = `/`, isActive check: `pathname === '/'`

**L. Create apps/web/src/app/(driver)/more/page.tsx:**
- Full-screen menu page with `export const dynamic = 'force-dynamic'`
- Page heading: "More" with a brief subtitle
- Grid of menu items, each a Link with icon + label + chevron-right:
  - Hours of Service (Clock icon) → /hours
  - Documents (FileText icon) → /hours (with TODO: create /documents page when ready)
  - Report Incident (AlertTriangle icon) → /incidents
  - Support Tickets (LifeBuoy icon) → /my-tickets
  - Log Out (LogOut icon) → calls sign-out action or links to /sign-out
- Each menu item: full-width card style (bg-card rounded-lg px-4 py-3 flex items-center gap-3), min-h-[52px] touch target
- Sign out: use existing sign-out mechanism (check how UserMenu handles it — likely a form POST to /auth/signout or similar)

**M. Update apps/web/src/app/(driver)/layout.tsx:**
- Keep the same auth checks (getSession, getRole redirect)
- Remove the `<GpsTracker>` component from layout (GPS moves to dashboard client component)
- Remove the truckId lookup transaction (no longer needed in layout)
- Keep the header with logo + DriveCommandWordmark + UserMenu
- The header should have a dark branded feel: `bg-slate-900 text-white` (dark header) with border-b border-slate-800
- AppLogo variant="light" for dark background
- Add the `<DriverNotificationBell>` component next to `<UserMenu>` in the header — so notifications are accessible from any page, not just dashboard
- Keep `<DriverNav>` for desktop, `<DriverBottomNav>` for mobile
- Keep `pb-20` on main for bottom nav clearance on mobile, but ensure pb is adequate for the taller 60px nav

**N. Visual polish across all new components:**
- Mobile-first: base styles for 375px, responsive up from there
- Touch targets: all buttons min h-12 (48px), nav items min h-[60px]
- Cards: bg-card rounded-xl shadow-sm border border-border
- Status badges: inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium
  - planned: bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300
  - in_progress: bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300
  - completed: bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300
  - cancelled: bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300
- Empty states: centered with icon (opacity-30) + heading + muted subtext
- Timestamps: use Intl.DateTimeFormat for absolute times, relative helper for recent times
- Section headers: text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3
- No raw "null" or blank spaces — every field has a fallback display
  </action>
  <verify>
1. Run `npx tsc --noEmit` from apps/web root — zero TypeScript errors
2. Run `npm run build` (or `npx next build`) from apps/web — build succeeds with no errors
3. Manually verify in browser: navigate to driver portal root (/) → dashboard loads with greeting, dispatch card, quick actions, HOS widget, messages preview
4. Verify bottom nav shows 5 tabs: Dashboard, Route, Load, Messages, More
5. Verify More page shows menu items and each link navigates correctly
6. Verify GPS indicator appears (green if permission granted, grey if denied)
7. Verify notification bell appears in header with badge
  </verify>
  <done>
Driver portal has been completely redesigned with: (1) Dashboard as default landing with greeting, dispatch card, quick actions, HOS widget, messages preview; (2) Browser GPS pinging with status indicator; (3) Notification bell with unread count and dropdown panel; (4) 5-tab navigation (Dashboard/Route/Load/Messages/More); (5) More menu with Hours, Documents, Incidents, Support, Log Out; (6) Dark branded header; (7) Mobile-first layout with 48px+ touch targets and 60px bottom nav; (8) All timestamps human-readable; (9) Proper empty states everywhere.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` — zero TypeScript errors across all new/modified files
2. `npx next build` — successful build
3. Driver login → lands on Dashboard tab (not redirect to /my-route)
4. Greeting shows correct time-of-day greeting with driver first name
5. Active dispatch card renders with correct dispatch info OR empty state
6. Quick action tiles scroll horizontally and navigate correctly
7. HOS widget shows current status and buttons respond to taps
8. GPS status indicator shows green/grey based on permission
9. Notification bell shows count badge, dropdown opens/closes
10. More tab shows full-screen menu, all links work
11. Bottom nav has exactly 5 tabs with correct icons
12. No floating blue Support FAB anywhere
13. All timestamps formatted as relative or human-readable
14. No console errors in browser dev tools
</verification>

<success_criteria>
- Driver portal has a functional dashboard as the default landing page
- 5-tab navigation structure works on mobile and desktop
- GPS pinging fires and shows status indicator
- Notification bell polls and displays unread count
- HOS widget allows duty status changes
- More menu provides access to Hours, Incidents, Support, and Log Out
- Zero TypeScript errors, successful Next.js build
</success_criteria>

<output>
After completion, create `.planning/quick/232-complete-driver-portal-redesign-dashboar/232-SUMMARY.md`
</output>
