---
quick: 79
type: execute
wave: 1
depends_on: []
autonomous: true
files_modified:
  - src/app/(owner)/loads/[id]/page.tsx
  - src/app/(owner)/loads/[id]/edit/page.tsx
  - src/app/(owner)/loads/new/page.tsx
  - src/app/(owner)/routes/[id]/route-page-client.tsx
  - src/app/(owner)/invoices/[id]/page.tsx
  - src/app/(owner)/invoices/[id]/edit/page.tsx
  - src/app/(owner)/invoices/new/page.tsx
  - src/app/(owner)/payroll/[id]/page.tsx
  - src/app/(owner)/payroll/[id]/edit/page.tsx
  - src/app/(owner)/payroll/new/page.tsx
  - src/app/(owner)/crm/[id]/page.tsx
  - src/app/(owner)/crm/[id]/edit/page.tsx
  - src/app/(owner)/crm/new/page.tsx
  - src/app/(owner)/trucks/new/page.tsx
  - src/app/(owner)/trucks/[id]/maintenance/page.tsx
  - src/app/(owner)/ai-documents/page.tsx
  - src/app/(owner)/support/support-tickets-list.tsx
---

<objective>
Fix all remaining mobile overflow and layout issues across owner portal detail, edit, new, and utility pages at 390px viewport. The dashboard, live-map, safety, fuel, and compliance pages are already fixed. This covers every remaining page that still uses un-responsive text-3xl headings or rigid flex headers.

Purpose: Complete the mobile audit so every page in the owner sidebar works at 390px without horizontal overflow or clipped content.
Output: 17 files updated with responsive headers, text sizing, and button groups.
</objective>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Fix detail page action headers (loads, invoices, payroll, crm, routes)</name>
  <files>
    src/app/(owner)/loads/[id]/page.tsx
    src/app/(owner)/invoices/[id]/page.tsx
    src/app/(owner)/payroll/[id]/page.tsx
    src/app/(owner)/crm/[id]/page.tsx
    src/app/(owner)/routes/[id]/route-page-client.tsx
  </files>
  <action>
Each of these detail pages has a header with a title on the left and action buttons on the right using `flex items-start justify-between` or `flex items-center justify-between` — no flex-col on mobile. At 390px the buttons get squeezed against a long title and overflow.

Apply the same pattern already used on trucks/[id]/page.tsx and drivers/[id]/page.tsx.

**loads/[id]/page.tsx** — line ~107: `<div className="flex items-start justify-between gap-4">`
Change to: `<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">`
Add `min-w-0` to the inner title `<div>`.
Add `flex-shrink-0` to the button group `<div className="flex flex-wrap items-center gap-2">`.
Change `<h1 className="text-3xl font-bold...">` to `<h1 className="text-2xl sm:text-3xl font-bold...">`.

**invoices/[id]/page.tsx** — line ~70: `<div className="flex items-start justify-between">`
Change to: `<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">`
Add `min-w-0` to the title `<div>`.
Add `flex-shrink-0` to the button group `<div className="flex items-center gap-2">`.
Change `<h1 className="text-3xl font-bold...">` to `<h1 className="text-2xl sm:text-3xl font-bold...">`.

**payroll/[id]/page.tsx** — line ~54: `<div className="flex items-start justify-between">`
Change to: `<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">`
Add `min-w-0` to the title `<div>`.
Add `flex-shrink-0` to the button group `<div className="flex items-center gap-2">`.
Change `<h1 className="text-3xl font-bold...">` to `<h1 className="text-2xl sm:text-3xl font-bold...">`.

**crm/[id]/page.tsx** — line ~58: `<div className="flex items-start justify-between">`
Change to: `<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">`
Add `min-w-0` to the title `<div>`.
Add `flex-shrink-0` to the button group `<div className="flex items-center gap-2">`.
Change `<h1 className="text-3xl font-bold...">` to `<h1 className="text-2xl sm:text-3xl font-bold...">`.

**routes/[id]/route-page-client.tsx** — line ~171: `<div className="flex items-center justify-between">`
Change to: `<div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">`
Wrap the `<h1>` in a `<div className="min-w-0">` (or add min-w-0 to the h1 itself).
Add `flex-shrink-0` to the Cancel/Edit Route button element.
Change `<h1 className="text-3xl font-bold...">` to `<h1 className="text-2xl sm:text-3xl font-bold...">`.
  </action>
  <verify>Open each detail page at 390px DevTools viewport. Title and buttons should stack vertically on mobile, sit side-by-side on sm+. No horizontal scrollbar.</verify>
  <done>All 5 detail pages render without overflow at 390px. Buttons do not overlap or clip titles.</done>
</task>

<task type="auto">
  <name>Task 2: Fix responsive text on form/create/utility pages</name>
  <files>
    src/app/(owner)/loads/[id]/edit/page.tsx
    src/app/(owner)/loads/new/page.tsx
    src/app/(owner)/invoices/[id]/edit/page.tsx
    src/app/(owner)/invoices/new/page.tsx
    src/app/(owner)/payroll/[id]/edit/page.tsx
    src/app/(owner)/payroll/new/page.tsx
    src/app/(owner)/crm/[id]/edit/page.tsx
    src/app/(owner)/crm/new/page.tsx
    src/app/(owner)/trucks/new/page.tsx
    src/app/(owner)/trucks/[id]/maintenance/page.tsx
    src/app/(owner)/ai-documents/page.tsx
  </fires>
  <action>
All these pages have `<h1 className="text-3xl font-bold tracking-tight ...">` with no responsive breakpoint. At 390px this causes the heading to crowd or wrap awkwardly. Also the maintenance page has a long dynamic title ("Maintenance: YYYY Make Model") that needs truncation.

For each file, make the following minimal change:

**loads/[id]/edit/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.

**loads/new/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.

**invoices/[id]/edit/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.

**invoices/new/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.

**payroll/[id]/edit/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.

**payroll/new/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.

**crm/[id]/edit/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.

**crm/new/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.

**trucks/new/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.

**trucks/[id]/maintenance/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1. Also add `truncate` class and wrap the heading div with `min-w-0` so the long "Maintenance: YYYY Make Model" title truncates instead of overflowing. The outer `<div>` that contains the back link and h1 does not need changes — just the h1 itself gets `truncate` added.

**ai-documents/page.tsx** — Change `text-3xl` → `text-2xl sm:text-3xl` on the h1.
  </action>
  <verify>Open each page at 390px DevTools. Headings should fit without causing the page to scroll horizontally. Maintenance page heading should truncate if truck name is long.</verify>
  <done>All 11 pages have responsive h1 sizing. No horizontal overflow on any form/utility page at 390px.</done>
</task>

<task type="auto">
  <name>Task 3: Fix support tickets tab bar overflow on mobile</name>
  <files>
    src/app/(owner)/support/support-tickets-list.tsx
  </files>
  <action>
The support tickets list tab bar renders 4 tabs ("All (N)", "Open (N)", "In Progress (N)", "Closed (N)") inside a `<div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">`. At 390px, "In Progress (N)" makes the total width exceed the viewport, causing a horizontal scroll.

Change the tab bar container from:
`<div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 w-fit">`

To:
`<div className="flex items-center gap-1 bg-muted/50 rounded-lg p-1 overflow-x-auto">`

This removes `w-fit` (which forces the div to exactly fit its content regardless of viewport) and adds `overflow-x-auto` so if tabs don't fit they scroll within the container rather than overflowing the page. The tab pills themselves keep their existing padding and text — no other changes needed.
  </action>
  <verify>Open /support at 390px DevTools. The tab bar should not cause page-level horizontal scroll. All 4 tabs should be reachable (either fitting or scrollable within the bar).</verify>
  <done>Support ticket tab bar does not overflow the 390px viewport. Page has no horizontal scrollbar.</done>
</task>

</tasks>

<success_criteria>
- At 390px viewport: all 17 modified pages have no horizontal overflow
- Detail page headers (loads, invoices, payroll, crm, route) stack title above buttons on mobile
- Form/create pages all use text-2xl sm:text-3xl for their h1
- Maintenance page heading truncates for long truck names
- Support ticket tab bar scrolls within its container rather than overflowing the page
</success_criteria>

<output>
After completion, create `.planning/quick/79-tkt-0028-mobile-audit-and-fix-all-sideba/79-SUMMARY.md`
</output>
