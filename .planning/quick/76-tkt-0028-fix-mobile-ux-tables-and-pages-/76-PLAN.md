---
phase: quick-76
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/components/trucks/truck-list.tsx
  - src/components/drivers/driver-list.tsx
  - src/components/routes/route-list.tsx
  - src/components/maintenance/maintenance-event-list.tsx
  - src/components/maintenance/scheduled-service-list.tsx
  - src/app/(owner)/subscription/page.tsx
autonomous: true
must_haves:
  truths:
    - "All table pages scroll horizontally on mobile without content being clipped"
    - "Tables with many columns (trucks, drivers, routes, maintenance, subscription) are fully readable on 375px viewport"
    - "No horizontal overflow causes the entire page body to scroll horizontally"
  artifacts:
    - path: "src/components/trucks/truck-list.tsx"
      provides: "overflow-x-auto wrapper around table"
    - path: "src/components/drivers/driver-list.tsx"
      provides: "overflow-x-auto wrapper around table"
    - path: "src/components/routes/route-list.tsx"
      provides: "overflow-x-auto with min-w-[800px] table instead of table-fixed"
    - path: "src/components/maintenance/maintenance-event-list.tsx"
      provides: "overflow-x-auto wrapper around table"
    - path: "src/components/maintenance/scheduled-service-list.tsx"
      provides: "overflow-x-auto wrapper around table"
    - path: "src/app/(owner)/subscription/page.tsx"
      provides: "overflow-x-auto wrapper around table"
  key_links:
    - from: "table wrapper div"
      to: "table element"
      via: "overflow-x-auto CSS class"
      pattern: "overflow-x-auto"
---

<objective>
Fix mobile horizontal scrolling on all table/list pages across the owner portal.

Purpose: Tables with many columns overflow on mobile (375px) causing content to be clipped or the entire page to scroll horizontally. Users on phones cannot see all table columns.
Output: All 6 affected table components wrapped with `overflow-x-auto` so tables scroll independently within their container.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md

Audit results — 13 table components found, 6 need fixes:

MISSING overflow-x-auto entirely (table clips on mobile):
1. src/components/trucks/truck-list.tsx — line 187: outer div has overflow-hidden but NO overflow-x-auto inner wrapper
2. src/components/drivers/driver-list.tsx — line 193: same pattern as trucks, no overflow-x-auto
3. src/components/maintenance/maintenance-event-list.tsx — line 130: outer div has overflow-hidden, no overflow-x-auto
4. src/components/maintenance/scheduled-service-list.tsx — line 196: same pattern as maintenance-event-list
5. src/app/(owner)/subscription/page.tsx — line 75: table inside CardContent with no overflow wrapper

HAS overflow-x-auto but table-fixed prevents proper scroll:
6. src/components/routes/route-list.tsx — line 232-233: has overflow-x-auto but table uses `table-fixed` which constrains columns to container width, defeating horizontal scroll

ALREADY FIXED (no changes needed):
- load-list.tsx, invoice-list.tsx, payroll-list.tsx, customer-list.tsx
- driver-compliance-table.tsx, truck-compliance-table.tsx
- ifta-report-table.tsx, lane-profitability-table.tsx
- invoices/[id]/page.tsx

The working pattern (from load-list.tsx, invoice-list.tsx, etc.):
```
<div className="rounded-lg border border-border bg-card overflow-hidden">
  <div className="overflow-x-auto">
    <table className="w-full text-sm">
```
The outer div clips rounded corners with overflow-hidden. The inner div provides overflow-x-auto for horizontal scrolling. The table uses w-full (NOT table-fixed) with optional min-w-[Npx] to ensure columns don't crush.
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add overflow-x-auto wrappers to 5 tables missing horizontal scroll</name>
  <files>
    src/components/trucks/truck-list.tsx
    src/components/drivers/driver-list.tsx
    src/components/maintenance/maintenance-event-list.tsx
    src/components/maintenance/scheduled-service-list.tsx
    src/app/(owner)/subscription/page.tsx
  </files>
  <action>
For each file, wrap the `<table>` element in a `<div className="overflow-x-auto">` container. The outer container should keep `overflow-hidden` (for border-radius clipping). The pattern to follow matches what load-list.tsx and invoice-list.tsx already use.

Specific changes per file:

1. **truck-list.tsx** (line ~187-188): The current structure is:
   `<div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm"><table className="w-full">`
   Change to:
   `<div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[900px]">` and add closing `</div>` after `</table>`.
   Add `min-w-[900px]` because this table has 8 columns (Make, Model, Year, VIN, License Plate, Status, Odometer, Actions).

2. **driver-list.tsx** (line ~193-194): Same pattern as truck-list.
   `<div className="rounded-xl border border-border bg-card overflow-hidden shadow-sm"><div className="overflow-x-auto"><table className="w-full min-w-[700px]">` and add closing `</div>`.
   Add `min-w-[700px]` — 6 columns (First, Last, Email, License, Status, Actions).

3. **maintenance-event-list.tsx** (line ~130-131): Current structure is:
   `<div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden"><table className="w-full border-collapse">`
   Change to add `<div className="overflow-x-auto">` wrapper around `<table>`. Add `min-w-[600px]` to table — 6 columns.

4. **scheduled-service-list.tsx** (line ~196-197): Same pattern as maintenance-event-list.
   Add `<div className="overflow-x-auto">` wrapper. Add `min-w-[900px]` to table — 8 columns (Service Type, Interval, Next Due Date, Days Until Due, Next Due Mileage, Miles Until Due, Status, Actions).

5. **subscription/page.tsx** (line ~74-75): The table is inside `<CardContent className="p-0">`. Wrap the `<table>` in `<div className="overflow-x-auto">`. Add `min-w-[600px]` to table — 6 columns.

Do NOT change any other styling, column definitions, or behavior. Only add the overflow wrapper and min-width.
  </action>
  <verify>Run `npx next build` or `npx tsc --noEmit` to confirm no type/syntax errors. Visually grep for "overflow-x-auto" in all 5 files to confirm the wrapper was added.</verify>
  <done>All 5 table components have an overflow-x-auto wrapper div between the outer overflow-hidden container and the table element. Tables have min-w values to prevent column crushing on small screens.</done>
</task>

<task type="auto">
  <name>Task 2: Fix route-list.tsx table-fixed preventing horizontal scroll</name>
  <files>src/components/routes/route-list.tsx</files>
  <action>
The route-list.tsx already has `overflow-x-auto` on line 232, but the table on line 233 uses `table-fixed` which forces all columns to fit within the container width, defeating horizontal scroll.

Change line 233 from:
`<table className="w-full table-fixed divide-y divide-border">`
to:
`<table className="w-full min-w-[900px] divide-y divide-border">`

This removes `table-fixed` and adds `min-w-[900px]` so the table can expand beyond the viewport on mobile and scroll horizontally. The 8 columns (Route Name, Origin, Destination, Date, Driver, Truck, Status, Actions) need this width.

Also remove the `style={{ width: header.column.getSize() }}` from the `<th>` element (line 240) and `overflow-hidden` from the `<th>` className (line 241) and `<td>` className (line 283) since table-fixed layout is no longer needed. The columns will auto-size based on content. Keep the `truncate block` classes on cell content spans since those still help with very long text.

Do NOT change column definitions, sizes, sorting logic, or any other behavior.
  </action>
  <verify>Run `npx tsc --noEmit` to confirm no type errors. Verify the table no longer uses `table-fixed` class.</verify>
  <done>Route list table scrolls horizontally on mobile. Columns auto-size to content instead of being fixed-width and clipped.</done>
</task>

</tasks>

<verification>
After both tasks:
1. `npx tsc --noEmit` passes with no errors
2. All 13 table components in the codebase now have `overflow-x-auto` on their table wrapper
3. No table uses `table-fixed` layout
4. Grep confirms: `grep -rn "overflow-x-auto" src/components/trucks/truck-list.tsx src/components/drivers/driver-list.tsx src/components/routes/route-list.tsx src/components/maintenance/maintenance-event-list.tsx src/components/maintenance/scheduled-service-list.tsx src/app/\(owner\)/subscription/page.tsx` returns a match for every file
</verification>

<success_criteria>
- All 6 affected table components have overflow-x-auto wrappers
- Tables have min-w-[Npx] values appropriate to their column count
- Route list no longer uses table-fixed
- TypeScript compiles cleanly
- No visual regressions on desktop (tables still render full-width)
</success_criteria>

<output>
After completion, create `.planning/quick/76-tkt-0028-fix-mobile-ux-tables-and-pages-/76-SUMMARY.md`
</output>
