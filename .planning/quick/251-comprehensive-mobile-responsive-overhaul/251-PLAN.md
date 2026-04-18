---
phase: quick-251
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  # Plan 1 — Layout/Nav
  - apps/web/src/components/ui/sidebar.tsx
  - apps/web/src/components/navigation/owner-shell.tsx
  - apps/web/src/components/navigation/owner-bottom-nav.tsx
  # Plan 2 — Live Map Mobile
  - apps/web/src/components/maps/live-map-wrapper.tsx
  - apps/web/src/app/(owner)/live-map/page.tsx
  # Plan 3 — Responsive Tables
  - apps/web/src/components/carrier/loads/LoadList.tsx
  - apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx
  # Plan 4 — Notification + Vehicles API
  - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
autonomous: true
must_haves:
  truths:
    - "Sidebar is completely hidden on screens < 1024px"
    - "Bottom nav is the sole mobile navigation below 1024px"
    - "Header shows only DC logo icon on mobile, no tenant name"
    - "Main content has bottom padding so bottom nav does not overlap"
    - "Live map is full screen on mobile with a floating toggle for vehicle list"
    - "All carrier list tables scroll horizontally on mobile without page overflow"
    - "Notification dropdown fits within mobile viewport"
    - "Vehicles API returns correct dispatch context with load count from loads table"
  artifacts:
    - path: "apps/web/src/components/ui/sidebar.tsx"
      provides: "Sidebar hidden below lg (1024px) breakpoint"
    - path: "apps/web/src/components/navigation/owner-shell.tsx"
      provides: "Header responsive, sidebar trigger hidden on mobile"
    - path: "apps/web/src/components/maps/live-map-wrapper.tsx"
      provides: "Mobile-responsive live map with bottom sheet vehicle list"
  key_links:
    - from: "sidebar.tsx"
      to: "owner-shell.tsx"
      via: "lg breakpoint alignment"
      pattern: "hidden lg:"
---

<objective>
Comprehensive mobile responsive overhaul for the owner portal — 8 fixes across layout, navigation, tables, live map, header, notifications, and vehicles API.

Purpose: Make the owner web portal fully usable on mobile devices with proper responsive behavior.
Output: All 8 fixes applied across 4 logical groups, each independently committable.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/components/ui/sidebar.tsx
@apps/web/src/components/navigation/owner-shell.tsx
@apps/web/src/components/navigation/owner-bottom-nav.tsx
@apps/web/src/components/navigation/owner-more-menu.tsx
@apps/web/src/components/navigation/notification-bell.tsx
@apps/web/src/components/navigation/notification-center.tsx
@apps/web/src/components/maps/live-map-wrapper.tsx
@apps/web/src/app/(owner)/live-map/page.tsx
@apps/web/src/components/carrier/loads/LoadList.tsx
@apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
</context>

<tasks>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- PLAN 1: Layout/Nav Fixes (Fix 1, 2, 3, 6)                            -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

<task type="auto">
  <name>Task 1: Fix sidebar visibility, header, and bottom nav (Fixes 1, 2, 3, 6)</name>
  <files>
    apps/web/src/components/ui/sidebar.tsx
    apps/web/src/components/navigation/owner-shell.tsx
    apps/web/src/components/navigation/owner-bottom-nav.tsx
  </files>
  <action>
## Fix 1 — Hide sidebar on mobile (< 1024px)

The shadcn sidebar component (`apps/web/src/components/ui/sidebar.tsx`) currently uses `md:block` / `md:flex` breakpoints (768px). The bottom nav uses `lg:hidden` (1024px). This creates a 768-1024px gap where both show. Fix by changing ALL sidebar breakpoints from `md:` to `lg:`:

1. In the `Sidebar` component (line ~218), change the outer div:
   - `"group peer hidden md:block text-sidebar-foreground"` -> `"group peer hidden lg:block text-sidebar-foreground"`

2. In the inner fixed div (line ~237), change:
   - `"... hidden h-svh ... md:flex"` -> `"... hidden h-svh ... lg:flex"`

3. The `isMobile` hook at `apps/web/src/hooks/use-mobile.tsx` uses `MOBILE_BREAKPOINT = 768`. Change to `1024` so the Sheet-based mobile sidebar is disabled entirely below 1024px (since we don't want the sidebar Sheet either — the bottom nav is the sole navigation on mobile).

   WAIT — actually we do NOT want the Sheet to open on mobile at all. The simplest approach: in the `Sidebar` component's mobile branch (line ~195-213), instead of rendering a Sheet, render `null`. This means on mobile (< 1024px), the sidebar simply does not exist. The bottom nav handles all navigation.

   Change line ~195 from:
   ```
   if (isMobile) {
     return (
       <Sheet open={openMobile} onOpenChange={setOpenMobile} {...props}>
   ```
   to:
   ```
   if (isMobile) {
     return null
   }
   ```

   And update `MOBILE_BREAKPOINT` in `apps/web/src/hooks/use-mobile.tsx` from `768` to `1024`.

## Fix 1 (cont) — Hide SidebarTrigger on mobile

In `apps/web/src/components/navigation/owner-shell.tsx`, line 22, the `SidebarTrigger` button in the header must be hidden on mobile. Add `hidden lg:flex` to it:
```
<SidebarTrigger className="-ml-1 hidden lg:flex" />
```

Also hide the `Separator` next to it on mobile:
```
<Separator orientation="vertical" className="mr-2 h-4 hidden lg:block" />
```

## Fix 3 — Header truncation

In `owner-shell.tsx`, the tenant name span (line ~25) shows "DriveComma..." on mobile. Hide it on mobile:
```
{tenantName && (
  <span className="text-sm font-semibold text-foreground truncate hidden lg:block">{tenantName}</span>
)}
```

The NotificationBell and UserMenu remain visible (they already are).

Remove any `min-w-*` on the header if present. Currently the header has `px-6` — change to `px-4 lg:px-6` for tighter mobile padding.

## Fix 6 — Bottom nav padding

In `owner-shell.tsx`, the main element already has `pb-20 lg:pb-6` (line 32). Verify this is correct. It already is: `<main className="flex-1 p-6 pb-20 lg:pb-6">`. Change the p-6 to `p-4 lg:p-6` for better mobile spacing.

## Fix 2 — Bottom nav More menu active detection

In `apps/web/src/components/navigation/owner-bottom-nav.tsx`, the More tab (line 76-85) only highlights when `isMoreOpen` is true. It should ALSO highlight when the current path matches any More menu item.

Add a `moreMenuPaths` array and check if `pathname` starts with any of them:
```typescript
const moreMenuPaths = [
  '/carrier/clients',
  '/carrier/contracts',
  '/carrier/templates',
  '/carrier/fleet',
  '/carrier/facilities',
  '/carrier/reports',
  '/ai-documents',
  '/settings',
  '/support',
];

const isOnMorePage = moreMenuPaths.some(p => pathname.startsWith(p));
```

Then on the More button, change the active check:
```
className={`... ${isMoreOpen || isOnMorePage ? 'text-blue-400' : 'text-slate-400 ...'}`}
```

Commit after this task: `fix(quick-251): hide sidebar on mobile, fix header and bottom nav`
  </action>
  <verify>
- Run `cd apps/web && npx tsc --noEmit` — no type errors
- Visually verify in browser at 375px width: sidebar gone, no hamburger, header shows only logo + bell + avatar, bottom nav visible, More tab highlights on /carrier/clients
- At 1024px+: sidebar works exactly as before, bottom nav hidden
  </verify>
  <done>
- Sidebar completely hidden below 1024px (no Sheet, no toggle)
- SidebarTrigger and Separator hidden on mobile
- Tenant name hidden on mobile, only logo + bell + avatar in header
- Bottom nav More tab highlights when on a More menu page
- Main content has pb-20 on mobile for bottom nav clearance
- Desktop layout unchanged
  </done>
</task>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- PLAN 2: Live Map Mobile (Fix 4)                                       -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

<task type="auto">
  <name>Task 2: Make live map full screen on mobile with bottom sheet vehicle list (Fix 4)</name>
  <files>
    apps/web/src/components/maps/live-map-wrapper.tsx
    apps/web/src/app/(owner)/live-map/page.tsx
  </files>
  <action>
## Fix 4 — Live map responsive layout

### live-map/page.tsx
Change the container height to account for mobile bottom nav:
```
<div className="h-[calc(100vh-3.5rem-5rem)] lg:h-[calc(100vh-8rem)]">
```
- 3.5rem = header (h-14)
- 5rem = bottom nav (~60px + safe area)
- Desktop keeps the original 8rem calculation

### live-map-wrapper.tsx

The current layout is `<div className="h-full flex relative">` with a 320px sidebar and flex-1 map. On mobile, the sidebar takes half the screen.

**Desktop (>= 1024px):** Keep the current two-panel layout EXACTLY as is.

**Mobile (< 1024px):**
- Map takes full width and height
- The left sidebar (w-80 div, lines ~160-197) gets `hidden lg:flex` so it's hidden on mobile
- Remove the existing mobile toggle button (lines 147-157, the `md:hidden` button) — replace with a new floating button positioned at bottom-left, above the bottom nav

Add a new floating toggle button that only shows on mobile:
```tsx
{/* Mobile vehicle list toggle — positioned above bottom nav */}
<button
  className="lg:hidden fixed bottom-24 left-4 z-40 bg-background border border-border rounded-full p-3 shadow-lg hover:bg-muted transition-colors"
  onClick={() => setSidebarOpen(p => !p)}
  aria-label={sidebarOpen ? 'Close vehicle list' : 'Open vehicle list'}
>
  {sidebarOpen ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
</button>
```

Add a mobile bottom sheet overlay that appears when sidebarOpen is true on mobile:
```tsx
{/* Mobile bottom sheet for vehicle list */}
{sidebarOpen && (
  <div className="lg:hidden fixed inset-x-0 bottom-20 z-30 flex flex-col" style={{ height: '60vh' }}>
    {/* Backdrop — tapping closes */}
    <div
      className="absolute inset-0 -top-[40vh] bg-black/40"
      onClick={() => setSidebarOpen(false)}
    />
    {/* Sheet content */}
    <div className="relative bg-background border-t border-border rounded-t-2xl flex flex-col h-full shadow-2xl">
      {/* Drag handle */}
      <div className="flex justify-center py-2">
        <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
      </div>
      {/* Close button */}
      <div className="flex items-center justify-between px-4 pb-2">
        <span className="text-sm font-semibold">Vehicles</span>
        <button
          onClick={() => setSidebarOpen(false)}
          className="p-1 rounded-md hover:bg-muted"
          aria-label="Close vehicle list"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {/* Tab bar */}
      <LiveMapTabs activeTab={activeTab} onTabChange={setActiveTab} />
      {/* Tab content — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'live' && (
          <>
            <VehicleFilterBar vehicles={vehicles} onFilteredChange={setFilteredVehicles} />
            <VehicleSidebar vehicles={filteredVehicles} onVehicleClick={handleVehicleClick} selectedVehicleId={selectedVehicleId} />
          </>
        )}
        {activeTab === 'history' && (
          <HistoryTab orgTrucks={orgTrucks} onHistoryPoints={setHistoryPoints} onHistorySegments={setHistorySegments} initialTruckId={historyPrefillTruckId} initialDate={historyPrefillDate} />
        )}
        {activeTab === 'trips' && (
          <TripsTab onViewTrip={handleViewTrip} />
        )}
      </div>
    </div>
  </div>
)}
```

Import `X` and `List` from lucide-react (X may already be imported; List needs adding).

Initialize `sidebarOpen` to `false` instead of `true` so mobile starts with just the map.

IMPORTANT: The desktop sidebar div (lines 160-197) must keep working. Change the conditional:
- Current: `!sidebarOpen && 'hidden md:flex'` -> Change to: Desktop always shows with `hidden lg:flex`, mobile uses the bottom sheet instead.
- The desktop sidebar div should be: `className="w-80 border-r flex-col shrink-0 bg-background hidden lg:flex"`
- Remove the `sidebarOpen` conditional from the desktop sidebar — it always shows on desktop.

Keep the desktop sidebar toggle behavior if desired, or simplify by always showing the desktop sidebar (the SidebarTrigger from the outer shell handles collapse). For simplicity, always show the desktop live map sidebar.

Commit: `fix(quick-251): make live map full screen on mobile with bottom sheet`
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` — no type errors
- At 375px: map fills screen, floating button visible bottom-left, tapping opens bottom sheet with vehicle list at 60% height, backdrop visible, close button works
- At 1024px+: two-panel layout unchanged, no floating button, no bottom sheet
  </verify>
  <done>
- Mobile: map is full screen, vehicle list in bottom sheet overlay
- Floating toggle button positioned above bottom nav
- Bottom sheet has drag handle, close button, tabs, filter bar, vehicle list
- Desktop: two-panel layout unchanged
  </done>
</task>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- PLAN 3: Responsive Tables (Fix 5)                                     -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

<task type="auto">
  <name>Task 3: Add horizontal scroll to tables missing it (Fix 5)</name>
  <files>
    apps/web/src/components/carrier/loads/LoadList.tsx
    apps/web/src/app/(owner)/carrier/reports/revenue/page.tsx
  </files>
  <action>
## Fix 5 — Horizontal scroll for tables

Most carrier list components ALREADY have `overflow-x-auto` on their table wrapper divs:
- ContractList.tsx — HAS overflow-x-auto (line 131)
- ClientList.tsx — HAS overflow-x-auto (line 96)
- FacilityList.tsx — HAS overflow-x-auto (line 104)
- CarrierDriverList.tsx — HAS overflow-x-auto (line 130)
- CarrierTruckList.tsx — HAS overflow-x-auto (line 167)
- RouteTemplateList.tsx — HAS overflow-x-auto (lines 267, 306)
- Reports: aging, driver-pay, performance — HAS overflow-x-auto

**DispatchList.tsx uses DispatchCard (card layout, not table) — no table fix needed.**

Only TWO files need the fix:

### 1. LoadList.tsx
The table wrappers (lines ~221 and ~255) have `overflow-hidden` but NOT `overflow-x-auto`.

Change both table wrapper divs:
- Line ~221: `<div className="rounded-lg border bg-card overflow-hidden">` -> `<div className="rounded-lg border bg-card overflow-x-auto">`
- Line ~255 (second table, the actual data table): same change

Also add `min-w-[600px]` to the `<table>` elements so they have a minimum width that triggers scroll on mobile:
```
<table className="w-full text-sm min-w-[600px]">
```

### 2. Revenue report page.tsx
Line ~299: `<div className="rounded-lg border border-border bg-card overflow-hidden">` -> `<div className="rounded-lg border border-border bg-card overflow-x-auto">`

Add `min-w-[600px]` to the table element too.

Commit: `fix(quick-251): add horizontal scroll to load list and revenue report tables`
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` — no type errors
- At 375px width: loads list page table scrolls horizontally, revenue report table scrolls horizontally
- Page itself does not scroll horizontally (only the table container)
  </verify>
  <done>
- LoadList.tsx tables have overflow-x-auto with min-w on table
- Revenue report table has overflow-x-auto with min-w on table
- All other list pages already had the fix
- No page-level horizontal overflow
  </done>
</task>

<!-- ═══════════════════════════════════════════════════════════════════════ -->
<!-- PLAN 4: Notification + Vehicles API (Fix 7, 8)                        -->
<!-- ═══════════════════════════════════════════════════════════════════════ -->

<task type="auto">
  <name>Task 4: Fix notification dropdown positioning and vehicles dispatch query (Fixes 7, 8)</name>
  <files>
    apps/web/src/components/navigation/notification-center.tsx
    apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
  </files>
  <action>
## Fix 7 — Notification dropdown mobile positioning

The notification-center.tsx already has the responsive width fix at line 146:
`w-[calc(100vw-2rem)] sm:w-[380px]`

This was already fixed. Verify the parent in `notification-bell.tsx` has `relative` positioning — it does (line 53: `className="relative"`). And the dropdown opens at `right-0` (line 68). No changes needed for Fix 7.

## Fix 8 — Vehicles API dispatch context

In `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts`:

### Issue 1: Carrier dispatch query needs ORDER BY + LIMIT 1 per truck
The current query (lines 363-369) fetches ALL matching dispatches and relies on Map dedup. Change to use DISTINCT ON to get one dispatch per truck, ordered by most recent:

Replace the carrier dispatch query (lines 362-378) with:
```sql
SELECT DISTINCT ON (d.truck_id)
  d.id AS "dispatchId",
  d.truck_id AS "truckId",
  d.notes,
  d.status
FROM dispatches d
WHERE d.org_id = ${orgId}::uuid
  AND d.status IN ('planned', 'in_progress')
  AND d.truck_id = ANY(${carrierTruckIds}::uuid[])
ORDER BY d.truck_id,
  d.actual_departure DESC NULLS LAST,
  d.scheduled_departure DESC
```

Remove the Map dedup check — DISTINCT ON handles it. Keep the Map building but simplify since each truckId appears once:
```typescript
for (const row of carrierDispatchRows) {
  const match = row.notes ? DISPATCH_NUM_RE.exec(row.notes) : null;
  const dispatchNumber = match ? match[1] : 'Dispatch';
  carrierDispatchMap.set(row.truckId, { dispatchId: row.dispatchId, dispatchNumber });
}
```

### Issue 2: Load count from loads table, not stops
Currently `carrierStopCountMap` queries the `stops` table. The spec says to fetch load count from the `loads` table instead.

Replace the `carrierStopCountRows` query (lines 384-391) with:
```sql
SELECT l.dispatch_id AS "dispatchId", COUNT(*)::int AS "loadCount"
FROM loads l
WHERE l.dispatch_id = ANY(${activeCarrierDispatchIds}::uuid[])
GROUP BY l.dispatch_id
```

Rename the interface from `CarrierStopCountRow` to `CarrierLoadCountRow` and update the field from `stopCount` to `loadCount`.

Update the map variable name from `carrierStopCountMap` to `carrierLoadCountMap` and update the reference in the VehicleLocation mapping (line ~448):
```
loadCount: carrierLoadCountMap.get(carrierDisp.dispatchId) ?? 0,
```

Commit: `fix(quick-251): fix vehicles API dispatch query ordering and load count source`
  </action>
  <verify>
- `cd apps/web && npx tsc --noEmit` — no type errors
- GET /api/v1/carrier/live-map/vehicles returns dispatch with correct load count from loads table
- Each truck has at most one dispatch (the most recent by actual_departure/scheduled_departure)
  </verify>
  <done>
- Notification dropdown: already fixed (verified, no changes needed)
- Vehicles API: dispatch query uses DISTINCT ON with proper ordering
- Load count sourced from loads table, not stops table
  </done>
</task>

</tasks>

<verification>
After all 4 tasks:
1. `cd apps/web && npx tsc --noEmit` passes
2. Mobile (375px): sidebar hidden, bottom nav is sole navigation, header compact, live map full screen with bottom sheet, tables scroll horizontally
3. Desktop (1024px+): everything unchanged — sidebar, two-panel map, tables, notifications all work as before
4. Vehicles API returns correct dispatch context
</verification>

<success_criteria>
- All 8 fixes applied
- Zero TypeScript errors
- Desktop layout completely unchanged
- Mobile layout fully functional with bottom nav as sole navigation
- Each fix independently verifiable
</success_criteria>

<output>
After completion, create `.planning/quick/251-comprehensive-mobile-responsive-overhaul/251-SUMMARY.md`
</output>
