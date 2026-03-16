---
quick: 79
subsystem: owner-portal/mobile-responsiveness
tags: [mobile, responsive, ui, overflow, tailwind]
dependency_graph:
  requires: []
  provides: [mobile-responsive-owner-portal-pages]
  affects: [loads, invoices, payroll, crm, routes, trucks, support, ai-documents]
tech_stack:
  added: []
  patterns: [flex-col mobile-first, sm:flex-row desktop, text-2xl sm:text-3xl responsive headings, overflow-x-auto tab bar]
key_files:
  modified:
    - src/app/(owner)/loads/[id]/page.tsx
    - src/app/(owner)/invoices/[id]/page.tsx
    - src/app/(owner)/payroll/[id]/page.tsx
    - src/app/(owner)/crm/[id]/page.tsx
    - src/app/(owner)/routes/[id]/route-page-client.tsx
    - src/app/(owner)/loads/[id]/edit/page.tsx
    - src/app/(owner)/loads/new/page.tsx
    - src/app/(owner)/invoices/[id]/edit/page.tsx
    - src/app/(owner)/invoices/new/page.tsx
    - src/app/(owner)/payroll/[id]/edit/page.tsx
    - src/app/(owner)/payroll/new/page.tsx
    - src/app/(owner)/crm/[id]/edit/page.tsx
    - src/app/(owner)/crm/new/page.tsx
    - src/app/(owner)/trucks/new/page.tsx
    - src/app/(owner)/trucks/[id]/maintenance/page.tsx
    - src/app/(owner)/ai-documents/page.tsx
    - src/app/(owner)/support/support-tickets-list.tsx
decisions:
  - Use flex-col/sm:flex-row pattern (same as trucks/[id] and drivers/[id]) for consistency across all detail page headers
  - Add truncate to maintenance h1 since "Maintenance: YYYY Make Model" can be very long at 390px
  - Use overflow-x-auto (not flex-wrap) on tab bar so all 4 tabs remain accessible without reflow
metrics:
  duration: 8m
  completed: 2026-03-15
  tasks: 3
  files: 17
---

# Quick 79: TKT-0028 Mobile Audit — Fix All Sidebar Pages

**One-liner:** Responsive headers and tab bar fixes across 17 owner-portal pages to eliminate horizontal overflow at 390px viewport.

## What Was Done

Completed the mobile audit of the owner portal. The dashboard, live-map, safety, fuel, compliance, CRM list, settings, truck/driver detail headers, and several other pages were already fixed in previous quick tasks (78 and earlier). This task covered every remaining page that still had mobile layout issues.

### Task 1: Detail Page Action Headers (5 files)

Applied the `flex-col / sm:flex-row` stacking pattern to all detail pages that had title+buttons laid out as a rigid horizontal row:

- **loads/[id]/page.tsx** — header now stacks on mobile; `min-w-0` on title div, `flex-shrink-0` on button group
- **invoices/[id]/page.tsx** — same pattern applied
- **payroll/[id]/page.tsx** — same pattern applied
- **crm/[id]/page.tsx** — same pattern applied
- **routes/[id]/route-page-client.tsx** — `flex-col sm:flex-row`, `min-w-0` on h1, `flex-shrink-0` on both Cancel and Edit Route buttons

All five h1 headings changed from `text-3xl` to `text-2xl sm:text-3xl`.

### Task 2: Responsive Text on Form/Create/Utility Pages (11 files)

Minimal one-line change per file — `text-3xl` to `text-2xl sm:text-3xl` on the page h1. Maintenance page also got `truncate` added because "Maintenance: 2022 Kenworth T680" can exceed 390px at any font size:

- loads/[id]/edit, loads/new
- invoices/[id]/edit, invoices/new
- payroll/[id]/edit, payroll/new
- crm/[id]/edit, crm/new
- trucks/new
- trucks/[id]/maintenance (+ truncate)
- ai-documents/page

### Task 3: Support Tickets Tab Bar (1 file)

Changed the tab bar container from `w-fit` to `overflow-x-auto`. The "In Progress (N)" tab was wide enough to push the total width past 390px. With `overflow-x-auto`, the bar scrolls within its container rather than overflowing the page.

## Commits

| Hash    | Task   | Description |
|---------|--------|-------------|
| 2b36c9d | Task 1 | Fix detail page action headers for mobile |
| 3c23980 | Task 2 | Responsive h1 sizing on form/create/utility pages |
| ac2e5b4 | Task 3 | Fix support tickets tab bar overflow on mobile |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All 17 modified files confirmed present. All 3 commits confirmed in git log.
