---
quick: 78
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/components/crm/customer-list.tsx
  - src/components/compliance/driver-compliance-table.tsx
  - src/components/compliance/truck-compliance-table.tsx
  - src/components/lanes/lane-profitability-table.tsx
  - src/app/(owner)/compliance/page.tsx
  - src/app/(owner)/lane-analytics/page.tsx
  - src/app/(owner)/profit-predictor/page.tsx
  - src/app/(owner)/ifta/page.tsx
  - src/app/(owner)/settings/expense-categories/page.tsx
  - src/app/(owner)/settings/expense-templates/page.tsx
  - src/app/(owner)/settings/integrations/page.tsx
  - src/app/(owner)/trucks/[id]/page.tsx
  - src/app/(owner)/drivers/[id]/page.tsx

must_haves:
  truths:
    - "All owner-portal pages fit on a 390px screen with no horizontal scrolling"
    - "CRM customer list shows cards on mobile instead of a wide table"
    - "Compliance tables (driver + truck) show cards on mobile"
    - "Lane analytics profitability table shows cards on mobile"
    - "Detail pages (truck, driver) have action buttons that wrap on mobile"
    - "All page headers with long text truncate or wrap cleanly at 390px"
  artifacts:
    - path: "src/components/crm/customer-list.tsx"
      provides: "Mobile card layout for CRM"
    - path: "src/components/compliance/driver-compliance-table.tsx"
      provides: "Mobile card layout for driver compliance"
    - path: "src/components/compliance/truck-compliance-table.tsx"
      provides: "Mobile card layout for truck compliance"
    - path: "src/components/lanes/lane-profitability-table.tsx"
      provides: "Mobile card layout for lane profitability"
    - path: "src/app/(owner)/trucks/[id]/page.tsx"
      provides: "Responsive header with wrapping action buttons"
    - path: "src/app/(owner)/drivers/[id]/page.tsx"
      provides: "Responsive header with wrapping action buttons"
---

<objective>
Apply mobile-first responsive fixes to all remaining owner-portal pages that still overflow at 390px.

Purpose: Complete TKT-0028 — every page must be usable on mobile without horizontal scrolling.
Output: 13 files fixed, all pages fit 390px viewport cleanly.
</objective>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: CRM and Compliance — mobile card layouts</name>
  <files>
    src/components/crm/customer-list.tsx
    src/components/compliance/driver-compliance-table.tsx
    src/components/compliance/truck-compliance-table.tsx
    src/app/(owner)/compliance/page.tsx
  </files>
  <action>
**customer-list.tsx** — Add mobile card layout below the existing table:
- Wrap the existing `<div className="overflow-x-auto">` (and its table) in `<div className="hidden md:block">`.
- Add a `<div className="md:hidden space-y-3">` section with card items. Each card: `<Link href={/crm/${customer.id}} className="block rounded-lg border border-border bg-card p-4 hover:bg-muted/30 transition-colors">`. Inside: company name as `font-semibold`, contact name + email/phone as `text-sm text-muted-foreground`, priority and status badges in a `flex flex-wrap gap-2 mt-2`, loads count and revenue as `text-sm font-medium mt-2`.

**driver-compliance-table.tsx** — Add mobile card layout:
- Wrap existing `<div className="overflow-x-auto">` in `<div className="hidden md:block">`.
- Add `<div className="md:hidden divide-y divide-border">` section. Each driver row becomes a card block (`<div className="p-4 space-y-2">`): driver name as `font-medium`, overall `<StatusBadge>`, documents list (same as desktop: type + expiry + status badge, space-y-1), safety events using `<SafetyEventCell>`, and a `<Link href={/drivers/${driver.driverId}}>` "View Driver" link styled as `text-sm text-primary`.

**truck-compliance-table.tsx** — Add mobile card layout:
- Wrap existing `<div className="overflow-x-auto">` in `<div className="hidden md:block">`.
- Add `<div className="md:hidden divide-y divide-border">` section. Each truck row becomes a block (`<div className="p-4 space-y-2">`): truck label + license plate (font-mono text-xs), registration row (label + expiry + badge), insurance row (label + expiry + badge), "View Truck" link.

**compliance/page.tsx** — Fix page header for mobile:
- The `<h1>` has `text-3xl font-bold` — change to `text-2xl sm:text-3xl font-bold tracking-tight`.
- Wrap the `<div>` containing h1+p in `min-w-0` so it truncates rather than overflows.
  </action>
  <verify>No horizontal scroll on CRM page or Compliance page at 390px viewport width in browser devtools.</verify>
  <done>Customer list, driver compliance table, and truck compliance table all render as stacked cards on mobile (md:hidden cards visible, tables hidden). Compliance page header fits 390px.</done>
</task>

<task type="auto">
  <name>Task 2: Analytics pages — mobile cards and header fixes</name>
  <files>
    src/components/lanes/lane-profitability-table.tsx
    src/app/(owner)/lane-analytics/page.tsx
    src/app/(owner)/profit-predictor/page.tsx
    src/app/(owner)/ifta/page.tsx
    src/app/(owner)/settings/expense-categories/page.tsx
    src/app/(owner)/settings/expense-templates/page.tsx
    src/app/(owner)/settings/integrations/page.tsx
  </files>
  <action>
**lane-profitability-table.tsx** — Add mobile card layout:
- Wrap the existing `<div className="overflow-x-auto">` in `<div className="hidden md:block">`.
- Add `<div className="md:hidden divide-y divide-border">` with card rows. Each lane: origin city bold, destination as `text-xs text-muted-foreground → destination`, then a 2-col grid (`grid grid-cols-2 gap-2 mt-2 text-sm`) with: Routes / Revenue / Expenses / Profit / Margin % / Avg/Route — label as `text-muted-foreground text-xs`, value as `font-medium`. Apply `getProfitColor` and `getMarginColor` on respective values.

**lane-analytics/page.tsx** — The `<h1>` reads "Lane Profitability Analysis" — shorten to "Lane Analytics" on mobile: change to `text-2xl sm:text-3xl font-bold tracking-tight`. The subtitle `<p>` is long; truncate on mobile with `line-clamp-2 sm:line-clamp-none`. The timeframe selector `flex items-center gap-1` pill — already uses `self-start`, no fix needed.

**profit-predictor/page.tsx** — Header fix only: change `text-3xl` to `text-2xl sm:text-3xl` on the h1. The subtitle is two lines long; add `line-clamp-2 sm:line-clamp-none` to the `<p>`. The `ProfitPredictorForm` is a standard form — check that the form renders in a single column on mobile. If the form uses side-by-side fields without responsive cols, add `grid grid-cols-1 sm:grid-cols-2 gap-4` where needed (read the component to confirm before editing). Keep existing layout if already responsive.

**ifta/page.tsx** — Header fix: change `text-3xl` to `text-2xl sm:text-3xl` on the h1. The subtitle is fine. The `<IFTAQuarterSelector>` already uses `flex-col sm:flex-row` so it's fine. In the IFTA table (`ifta-report-table.tsx`) the summary cards use `grid-cols-1 sm:grid-cols-3` — already mobile-safe, no change needed. The data table has `overflow-x-auto` wrapping — already safe, no change needed.

**settings pages (expense-categories, expense-templates, integrations)** — Header fix for all three pages: change `text-3xl font-bold` to `text-2xl sm:text-3xl font-bold` on each h1. No other changes needed as these pages use simple card/list layouts without wide tables.
  </action>
  <verify>No horizontal scroll on Lane Analytics, Profit Predictor, IFTA, or Settings sub-pages at 390px.</verify>
  <done>Lane profitability table renders as mobile cards. All analytics and settings page headers fit 390px. Stat card grids are 1-col or 2-col on mobile.</done>
</task>

<task type="auto">
  <name>Task 3: Detail page headers — responsive action buttons</name>
  <files>
    src/app/(owner)/trucks/[id]/page.tsx
    src/app/(owner)/drivers/[id]/page.tsx
  </files>
  <action>
**trucks/[id]/page.tsx** — The header has:
```
<div className="flex items-center justify-between">
  <div className="flex items-center gap-3">
    <h1 ...>{truck.year} {truck.make} {truck.model}</h1>
    <span ...>{truckStatus}</span>
  </div>
  <div className="flex gap-3">
    <MaintenanceToggleButton ... />
    <Link ... >Maintenance</Link>
    <Link ... >Edit Truck</Link>
  </div>
</div>
```
Change the outer div to `flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between`. Change the h1 to `text-2xl sm:text-3xl font-bold tracking-tight text-foreground`. Change the button group div to `flex flex-wrap gap-2`.

**drivers/[id]/page.tsx** — The header has:
```
<div className="flex items-center justify-between">
  <h1 className="text-3xl font-bold tracking-tight text-foreground">...</h1>
  <div className="flex items-center gap-2">
    <DriverStatusButton ... />
    <Link ... >Edit</Link>
  </div>
</div>
```
Change the outer div to `flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between`. Change the h1 to `text-2xl sm:text-3xl font-bold tracking-tight text-foreground min-w-0`. Change the button group div to `flex items-center gap-2 flex-shrink-0`.

For loads/[id] and routes/[id] — both already use `flex items-start justify-between gap-4` with `flex-wrap` on the action buttons, so they are already mobile-safe. No changes needed.
  </action>
  <verify>Open truck detail and driver detail pages at 390px — title and buttons should stack vertically on mobile, side-by-side on sm+.</verify>
  <done>Truck and driver detail page headers stack cleanly on 390px. No button or title overflow. All three detail page types (truck, driver, load) are mobile-safe.</done>
</task>

</tasks>

<verification>
Run `npm run build` — must pass with no TypeScript errors.
Check these pages at 390px devtools viewport (no horizontal scroll):
- /crm
- /compliance
- /lane-analytics
- /profit-predictor
- /ifta
- /settings/expense-categories
- /settings/expense-templates
- /settings/integrations
- /trucks/[any-id]
- /drivers/[any-id]
</verification>

<success_criteria>
All owner-portal pages render without horizontal overflow at 390px viewport width. Mobile card views replace tables on CRM and Compliance. All page headers use responsive text sizes. Action button groups in detail pages wrap on mobile.
</success_criteria>

<output>
After completion, update .planning/STATE.md: set Last activity to today's date and note "Completed quick task 78: TKT-0028 comprehensive mobile fix — all owner-portal pages mobile-friendly at 390px".
Create `.planning/quick/78-tkt-0028-comprehensive-mobile-fix/78-SUMMARY.md` with files modified and what was done.
</output>
