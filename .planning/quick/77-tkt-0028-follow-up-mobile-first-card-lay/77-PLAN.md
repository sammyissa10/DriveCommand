---
phase: quick-77
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/trucks/truck-list.tsx
  - src/components/drivers/driver-list.tsx
  - src/components/loads/load-list.tsx
  - src/components/routes/route-list.tsx
  - src/components/invoices/invoice-list.tsx
  - src/components/payroll/payroll-list.tsx
autonomous: true

must_haves:
  truths:
    - "On mobile (<md), user sees stacked card lists instead of tables for all 6 entities"
    - "On desktop (>=md), user sees the existing tables unchanged"
    - "Each card is fully tappable and navigates to the detail page"
    - "Status badges are prominently visible on each card"
    - "Cards show only the 3-4 most important fields per entity"
  artifacts:
    - path: "src/components/trucks/truck-list.tsx"
      provides: "Mobile card view for trucks"
      contains: "md:hidden"
    - path: "src/components/drivers/driver-list.tsx"
      provides: "Mobile card view for drivers"
      contains: "md:hidden"
    - path: "src/components/loads/load-list.tsx"
      provides: "Mobile card view for loads"
      contains: "md:hidden"
    - path: "src/components/routes/route-list.tsx"
      provides: "Mobile card view for routes"
      contains: "md:hidden"
    - path: "src/components/invoices/invoice-list.tsx"
      provides: "Mobile card view for invoices"
      contains: "md:hidden"
    - path: "src/components/payroll/payroll-list.tsx"
      provides: "Mobile card view for payroll"
      contains: "md:hidden"
  key_links:
    - from: "mobile card onClick"
      to: "router.push(/entity/id)"
      via: "click handler on card div"
      pattern: "router\\.push"
---

<objective>
Add mobile-first card layouts to all 6 owner-portal list pages (trucks, drivers, loads, routes, invoices, payroll). On screens below the `md` breakpoint, tables are hidden and replaced with native-feeling stacked card lists. Desktop tables remain completely unchanged.

Purpose: Make the owner portal usable on phones -- tables are unreadable on small screens. Cards provide an app-like feel with tappable rows, visible status badges, and key info at a glance.
Output: 6 modified list components with responsive table/card switching.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@src/components/trucks/truck-list.tsx
@src/components/drivers/driver-list.tsx
@src/components/loads/load-list.tsx
@src/components/routes/route-list.tsx
@src/components/invoices/invoice-list.tsx
@src/components/payroll/payroll-list.tsx
@src/components/loads/load-status-badge.tsx
@src/lib/trucks/compute-truck-status.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add mobile card views to trucks, drivers, and loads lists</name>
  <files>
    src/components/trucks/truck-list.tsx
    src/components/drivers/driver-list.tsx
    src/components/loads/load-list.tsx
  </files>
  <action>
For each of these 3 list components, add a mobile card list that shows below `md` and hide the existing table at `md` and above. The pattern for ALL cards across ALL entities is identical:

**Responsive toggle pattern:**
- Wrap the existing table container (the `rounded-xl border...` div or `rounded-lg border...` div) with `className="hidden md:block"`
- Add a new sibling div with `className="md:hidden"` containing the card list
- Search input and any tab bars / status legends remain visible at all breakpoints (do NOT hide them)

**Card design (consistent across all entities):**
```
<div className="md:hidden divide-y divide-border rounded-xl border border-border bg-card overflow-hidden">
  {filteredRows.map(item => (
    <div
      key={item.id}
      onClick={() => router.push(`/entity/${item.id}`)}
      className="flex items-center gap-3 px-4 py-3.5 active:bg-muted/50 cursor-pointer"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-foreground truncate">{primaryField}</span>
          {statusBadge}
        </div>
        <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
          {secondaryFields as comma-separated or spaced items}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-muted-foreground/50" />
    </div>
  ))}
</div>
```

Import `ChevronRight` from `lucide-react` in each file.

**Truck cards** - use `table.getRowModel().rows` to respect sorting/filtering:
- Line 1: `{licensePlate}` (in muted bg badge style like desktop) + status badge from `computeTruckStatus`
- Line 2: `{year} {make} {model}` + `{odometer.toLocaleString()} mi` separated by a centered dot or pipe
- The card navigates to `/trucks/${id}`

**Driver cards** - use `table.getRowModel().rows` to respect sorting/filtering:
- Line 1: `{firstName} {lastName}` + Active/Deactivated badge (reuse same badge markup from desktop column)
- Line 2: License: `{licenseNumber}` or "No license" if null, + `{email}`
- The card navigates to `/drivers/${id}`
- Keep the AlertDialog deactivate/reactivate modals working -- do NOT add deactivate/reactivate buttons to cards. Cards just navigate to detail page.

**Load cards** - use the `filtered` array (already computed from tab filtering):
- Line 1: `{loadNumber}` (bold) + `LoadStatusBadge` component
- Line 2: `{customer.companyName}` + `${rate}` (formatted) separated by dot
- Line 3 (optional): `{pickupDate}` formatted
- The card navigates to `/loads/${id}`
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Visually inspect in browser at mobile width (< 768px) -- tables should be hidden, cards should show. At desktop width (>= 768px) -- tables should show, cards should be hidden.
  </verify>
  <done>
Trucks, drivers, and loads list pages show native-feeling card lists on mobile with status badges, key fields, and tap-to-navigate. Desktop tables are unchanged.
  </done>
</task>

<task type="auto">
  <name>Task 2: Add mobile card views to routes, invoices, and payroll lists</name>
  <files>
    src/components/routes/route-list.tsx
    src/components/invoices/invoice-list.tsx
    src/components/payroll/payroll-list.tsx
  </files>
  <action>
Apply the exact same responsive card pattern from Task 1 to these 3 components.

**Route cards** - use `table.getRowModel().rows` to respect sorting/filtering/status filter:
- Line 1: `{name || 'Unnamed Route'}` + status badge (reuse same inline badge markup from desktop column)
- Line 2: `{origin}` arrow `{destination}` (use a right arrow character or text)
- Line 3: date formatted like desktop
- The card navigates to `/routes/${id}`
- Do NOT include delete action on cards. Card only navigates.

**Invoice cards** - iterate over `invoices` array directly (no table instance to filter through):
- Line 1: `{invoiceNumber}` (bold) + status badge (reuse `statusColors` map)
- Line 2: `${totalAmount}` formatted (bold) + due date
- The card navigates to `/invoices/${id}`

**Payroll cards** - iterate over `records` array directly:
- Line 1: `{driver.firstName} {driver.lastName}` + status badge (reuse `statusColors` map)
- Line 2: Period: `{periodStart} - {periodEnd}` formatted
- Line 3: Net pay `${totalPay}` in bold
- The card navigates to `/payroll/${id}`

Same card structure: `px-4 py-3.5`, `divide-y divide-border`, `ChevronRight` icon, `active:bg-muted/50`, `rounded-xl border border-border bg-card overflow-hidden`, `md:hidden` wrapper. Import `ChevronRight` from lucide-react.
  </action>
  <verify>
Run `npx tsc --noEmit` to confirm no type errors. Check all 6 pages at mobile width in browser -- every list should show cards. Check at desktop width -- every list should show tables.
  </verify>
  <done>
All 6 owner-portal list pages (trucks, drivers, loads, routes, invoices, payroll) have responsive mobile card layouts. Cards show key fields, status badges, and chevron indicators. Full card is tappable. Desktop tables unchanged.
  </done>
</task>

</tasks>

<verification>
1. `npx tsc --noEmit` passes with zero errors
2. At viewport < 768px: all 6 list pages show card layouts, tables are hidden
3. At viewport >= 768px: all 6 list pages show tables, cards are hidden
4. Each card navigates to the correct detail page on tap
5. Status badges are visible on every card
6. Search/filter functionality still works on mobile (search input visible, filters functional)
7. Empty states still render correctly on both mobile and desktop
</verification>

<success_criteria>
All 6 owner-portal entity lists (trucks, drivers, loads, routes, invoices, payroll) display native-feeling stacked card layouts on mobile screens and unchanged data tables on desktop. Cards show 3-4 key fields, prominent status badges, and navigate to detail pages on tap.
</success_criteria>

<output>
After completion, create `.planning/quick/77-tkt-0028-follow-up-mobile-first-card-lay/77-SUMMARY.md`
</output>
