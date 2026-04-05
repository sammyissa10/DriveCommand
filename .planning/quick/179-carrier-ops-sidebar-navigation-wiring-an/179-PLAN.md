---
phase: quick-179
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/components/navigation/sidebar.tsx
  - apps/web/src/components/navigation/dispatch-badge.tsx
  - apps/web/src/app/(owner)/carrier/layout.tsx
  - apps/web/src/components/carrier/CarrierBreadcrumb.tsx
autonomous: true
must_haves:
  truths:
    - "Sidebar Carrier Ops section shows all nav items: Dashboard, Clients, Contracts, Templates, Dispatches (with badge), Loads"
    - "Fleet sub-group shows nested Drivers, Trucks, Facilities links"
    - "Reports sub-group shows nested Revenue, Driver Pay, AR Aging, Performance links"
    - "Dispatches sidebar item shows needs_assignment count badge that polls every 60s"
    - "DRIVER role accessing /carrier/* is redirected to /my-load"
    - "CarrierBreadcrumb renders Carrier > Section > Detail based on pathname"
  artifacts:
    - path: "apps/web/src/components/navigation/sidebar.tsx"
      provides: "Complete carrier nav with sub-groups and badge"
    - path: "apps/web/src/components/navigation/dispatch-badge.tsx"
      provides: "Client component polling dispatch needs_assignment count"
    - path: "apps/web/src/app/(owner)/carrier/layout.tsx"
      provides: "Server layout with DRIVER redirect and breadcrumb"
    - path: "apps/web/src/components/carrier/CarrierBreadcrumb.tsx"
      provides: "Pathname-based breadcrumb for carrier section"
  key_links:
    - from: "sidebar.tsx"
      to: "dispatch-badge.tsx"
      via: "renders DispatchBadge inside Dispatches menu item"
    - from: "carrier/layout.tsx"
      to: "CarrierBreadcrumb.tsx"
      via: "renders breadcrumb above children"
---

<objective>
Wire up the complete Carrier Ops sidebar navigation with sub-groups, dispatch needs_assignment badge, carrier layout with DRIVER role guard, and a pathname-based breadcrumb.

Purpose: Finalize navigation for the carrier ops section so all pages (quick-153 through quick-178) are accessible and properly guarded.
Output: Updated sidebar, new carrier layout, new breadcrumb component, new dispatch badge component.
</objective>

<context>
@apps/web/src/components/navigation/sidebar.tsx
@apps/web/src/components/navigation/support-badge.tsx
@apps/web/src/app/(owner)/layout.tsx
@apps/web/src/components/ui/sidebar.tsx
</context>

<tasks>

<task type="auto">
  <name>Task 1: Restructure Carrier Ops sidebar with sub-groups and dispatch badge</name>
  <files>
    apps/web/src/components/navigation/sidebar.tsx
    apps/web/src/components/navigation/dispatch-badge.tsx
  </files>
  <action>
1. Create `apps/web/src/components/navigation/dispatch-badge.tsx` — a "use client" component:
   - Uses `useState` + `useEffect` with 60s `setInterval` to poll `GET /api/v1/carrier/dispatches?needs_assignment=true&status=planned`
   - Parses response to get count (response likely has `.data` array — count its length, or use a `total` field if present)
   - Returns `null` if count is 0, otherwise renders a red badge identical to SupportBadge style: `<span className="ml-auto flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">{count > 9 ? '9+' : count}</span>`
   - Fetches on mount immediately, then every 60s
   - Catches errors silently (badge just doesn't show)

2. Modify the Carrier Ops section in `sidebar.tsx` (lines 370-477). Replace the current flat list with:
   - Add imports: `SidebarMenuSub, SidebarMenuSubItem, SidebarMenuSubButton` from `@/components/ui/sidebar`, and `DispatchBadge` from `./dispatch-badge`
   - Add new lucide icons needed: `Warehouse` (already imported), `Users2` (already imported), `FileText` (already imported), `CalendarDays` (already imported), `Boxes` (already imported), `BarChart3` (already imported) — all already imported, good
   - Keep the group label "Carrier Ops" and the `canViewFleetIntelligence` guard

   Restructured items (in order):
   a. Dashboard — `/carrier/dashboard` with `LayoutDashboard` icon (reuse from imports, use a different icon to avoid confusion — use `Boxes` for carrier dashboard or just reuse `LayoutDashboard`)
   b. Clients — `/carrier/clients` with `Users2`
   c. Contracts — `/carrier/contracts` with `FileText`
   d. Templates — `/carrier/templates` with `CalendarDays`
   e. Dispatches — `/carrier/dispatches` with `Truck` icon, include `<DispatchBadge />` after the span text (same pattern as supportBadge in the Support section)
   f. Loads — `/carrier/loads` with `Package`
   g. Fleet — parent `SidebarMenuItem` with `SidebarMenuButton` (non-link, just label with `Boxes` icon), then `SidebarMenuSub` containing:
      - `SidebarMenuSubItem` > `SidebarMenuSubButton asChild isActive={pathname.startsWith("/carrier/fleet/drivers")}` > Link to `/carrier/fleet/drivers` text "Drivers"
      - `SidebarMenuSubItem` > `SidebarMenuSubButton asChild isActive={pathname.startsWith("/carrier/fleet/trucks")}` > Link to `/carrier/fleet/trucks` text "Trucks"
      - `SidebarMenuSubItem` > `SidebarMenuSubButton asChild isActive={pathname.startsWith("/carrier/facilities")}` > Link to `/carrier/facilities` text "Facilities"
   h. Reports — parent `SidebarMenuItem` with `SidebarMenuButton` (non-link, label with `BarChart3` icon), then `SidebarMenuSub` containing:
      - `SidebarMenuSubItem` > `SidebarMenuSubButton` > Link to `/carrier/reports/revenue` text "Revenue"
      - `SidebarMenuSubItem` > `SidebarMenuSubButton` > Link to `/carrier/reports/driver-pay` text "Driver Pay"
      - `SidebarMenuSubItem` > `SidebarMenuSubButton` > Link to `/carrier/reports/aging` text "AR Aging"
      - `SidebarMenuSubItem` > `SidebarMenuSubButton` > Link to `/carrier/reports/performance` text "Performance"

   For the Fleet and Reports parent buttons: set `isActive` to `pathname.startsWith("/carrier/fleet") || pathname.startsWith("/carrier/facilities")` for Fleet, and `pathname.startsWith("/carrier/reports")` for Reports. The parent button should NOT be a link (no `asChild`, no Link wrapper) — it just shows the icon and label. The sub-items below it are always visible (no collapsible toggle needed — SidebarMenuSub handles icon-mode hiding automatically).

   IMPORTANT: Do NOT modify any other sidebar sections. Only replace lines 370-477 (the Carrier Ops group).
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` (or from monorepo root) to confirm no type errors. Visually confirm the sidebar renders the new structure by checking the component compiles.</verify>
  <done>Carrier Ops sidebar section has Dashboard, Clients, Contracts, Templates, Dispatches (with polling badge), Loads as top-level items, plus Fleet and Reports as sub-grouped items with nested links. No other sidebar sections changed.</done>
</task>

<task type="auto">
  <name>Task 2: Create carrier layout with role guard and breadcrumb</name>
  <files>
    apps/web/src/app/(owner)/carrier/layout.tsx
    apps/web/src/components/carrier/CarrierBreadcrumb.tsx
  </files>
  <action>
1. Create `apps/web/src/components/carrier/CarrierBreadcrumb.tsx` — a "use client" component:
   - Import `usePathname` from `next/navigation` and `Link` from `next/link`
   - Parse pathname segments after `/carrier/`: e.g. `/carrier/dispatches/abc123` becomes ["dispatches", "abc123"]
   - Build breadcrumb: always start with "Carrier" (linked to `/carrier/dashboard`)
   - Second segment: capitalize and map known slugs to display names:
     - `dashboard` -> "Dashboard"
     - `clients` -> "Clients"
     - `contracts` -> "Contracts"
     - `templates` -> "Route Templates"
     - `dispatches` -> "Dispatches"
     - `loads` -> "Loads"
     - `fleet` -> "Fleet"
     - `facilities` -> "Facilities"
     - `reports` -> "Reports"
   - Third segment: if it's a known sub-section (e.g., `drivers`, `trucks`, `revenue`, `driver-pay`, `aging`, `performance`), map to display name. If it's a dynamic ID (e.g., UUID), show "Detail". If it's `new`, show "New".
   - Render with chevron separators (`>` or a `/` — use `>` with spacing): `<nav className="flex items-center gap-1.5 text-sm text-muted-foreground mb-4">`. Each non-terminal segment is a Link with `hover:text-foreground transition-colors`. Terminal segment is plain `<span className="text-foreground font-medium">`.

2. Create `apps/web/src/app/(owner)/carrier/layout.tsx` — a server component:
   - Import `getSession, getRole` from `@/lib/auth/supabase`
   - Import `redirect` from `next/navigation`
   - Import `UserRole` from `@/lib/auth/roles`
   - Import `CarrierBreadcrumb` from `@/components/carrier/CarrierBreadcrumb`
   - Export `const dynamic = 'force-dynamic'`
   - In the default export async function:
     - Call `const role = await getRole()`
     - If `role === UserRole.DRIVER`, `redirect("/my-load")`
     - If role is not OWNER and not MANAGER, `redirect("/unauthorized")`
     - Return `<><CarrierBreadcrumb />{children}</>`
   - NOTE: The parent `(owner)/layout.tsx` already checks for session existence and OWNER/MANAGER role. This layout adds the DRIVER-specific redirect to `/my-load` (instead of generic `/unauthorized`) and renders the breadcrumb. The role check here is belt-and-suspenders but ensures DRIVER redirect goes to the right place.
  </action>
  <verify>Run `npx tsc --noEmit -p apps/web/tsconfig.json` to confirm no type errors. Check that the layout file exists and exports a default async function.</verify>
  <done>DRIVER role accessing any /carrier/* path is redirected to /my-load. OWNER/MANAGER see CarrierBreadcrumb above page content. Breadcrumb shows "Carrier > Section > Detail" based on current pathname.</done>
</task>

</tasks>

<verification>
- `npx tsc --noEmit` passes with no errors across the monorepo
- sidebar.tsx Carrier Ops section contains Dashboard, Clients, Contracts, Templates, Dispatches, Loads as direct items
- sidebar.tsx Carrier Ops section contains Fleet sub-group with Drivers, Trucks, Facilities nested items
- sidebar.tsx Carrier Ops section contains Reports sub-group with Revenue, Driver Pay, AR Aging, Performance nested items
- Dispatches menu item includes DispatchBadge component
- dispatch-badge.tsx polls /api/v1/carrier/dispatches every 60s
- carrier/layout.tsx redirects DRIVER to /my-load
- CarrierBreadcrumb.tsx renders pathname-based breadcrumb
</verification>

<success_criteria>
All carrier sidebar links present and correctly structured with sub-groups. Dispatch badge polls and shows count. DRIVER role blocked from carrier section. Breadcrumb renders above all carrier pages. TypeScript compiles cleanly.
</success_criteria>
