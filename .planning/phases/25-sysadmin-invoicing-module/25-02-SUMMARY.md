---
phase: 25-sysadmin-invoicing-module
plan: "02"
subsystem: sysadmin-billing-ui
tags: [nextjs, server-components, client-components, invoicing, billing, decimal.js]
dependency_graph:
  requires: [Phase 25 Plan 01 (SysAdminInvoice schema + server actions)]
  provides: [Admin billing UI: list, create, detail, edit, tenant billing history]
  affects: [Phase 25 Plan 03 (email/cron will use same routes)]
tech_stack:
  added: []
  patterns: [server-component data fetch, use-client form with Decimal.js, router.refresh() for optimistic UI, dynamic route params as Promise]
key_files:
  created:
    - src/app/(admin)/billing/page.tsx
    - src/app/(admin)/billing/mark-overdue-button.tsx
    - src/app/(admin)/billing/new/page.tsx
    - src/app/(admin)/billing/new/new-invoice-form.tsx
    - src/app/(admin)/billing/[id]/page.tsx
    - src/app/(admin)/billing/[id]/invoice-actions.tsx
    - src/app/(admin)/billing/[id]/edit/page.tsx
    - src/app/(admin)/billing/[id]/edit/edit-invoice-form.tsx
  modified:
    - src/app/(admin)/layout.tsx
    - src/app/(admin)/tenants/[id]/page.tsx
decisions:
  - "MarkOverdueButton placed in separate file (mark-overdue-button.tsx) rather than inline in page.tsx to keep the server component clean"
  - "InvoiceActions uses window.confirm for destructive actions — aligns with existing admin portal patterns (no modal dependency)"
  - "EditInvoiceForm InvoiceItem interface uses { toString(): string } union type to handle Prisma Decimal fields without re-typing the entire return shape"
  - "quantity.toString() called inline in detail page to convert Prisma Decimal to ReactNode-compatible string"
metrics:
  duration: 378s
  completed: "2026-03-11"
  tasks: 2
  files_affected: 10
---

# Phase 25 Plan 02: Admin Billing UI Summary

Full admin billing UI with invoice list, create form, detail page, edit page, and tenant billing history — wired to Plan 01 server actions using Decimal.js for monetary precision.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Nav link + billing list page + summary stats | e644ae8 | layout.tsx, billing/page.tsx, mark-overdue-button.tsx |
| 2 | New invoice form, detail, edit, tenant billing history | 516e467 | 6 new files + tenants/[id]/page.tsx |

## What Was Built

### Admin Nav (`src/app/(admin)/layout.tsx`)
- Added "Billing" nav link after "Support" pointing to /billing

### Billing List Page (`src/app/(admin)/billing/page.tsx`)
- Fetches all non-archived invoices via `getSysAdminInvoices()`
- Derives 3 summary stats: unpaidCount (DRAFT+SENT), overdueCount (OVERDUE), paidThisMonth (Decimal sum of PAID invoices in current calendar month)
- Invoice table: invoice number (link), tenant, status badge, amount, due date, view link
- Status badges: DRAFT=gray, SENT=blue, PAID=green, OVERDUE=red, VOID=gray/muted
- Empty state with "Create the first one" link

### MarkOverdueButton (`src/app/(admin)/billing/mark-overdue-button.tsx`)
- Client component with window.confirm guard
- Calls `markOverdueInvoices()` then `router.refresh()`
- Shows inline success/error feedback

### New Invoice Form (`src/app/(admin)/billing/new/`)
- Server page fetches all tenants for dropdown; accepts `?tenantId` searchParam for pre-selection
- Client form: tenant select, due date, notes textarea, dynamic line items table
- Live subtotal computed with Decimal.js on every keystroke
- Submits to `createSysAdminInvoice()`, redirects to detail page on success

### Invoice Detail Page (`src/app/(admin)/billing/[id]/page.tsx`)
- Full line-item table with Description / Qty / Unit Price / Amount columns
- Bold total row in tfoot
- Two-column info card: tenant + owner contact, issue date + due date + notes
- Delegates action buttons to InvoiceActions client component

### InvoiceActions (`src/app/(admin)/billing/[id]/invoice-actions.tsx`)
- DRAFT: disabled Send button, Edit link, Archive button (push to /billing)
- SENT/OVERDUE: Mark as Paid (green), Void Invoice (red)
- PAID/VOID: read-only status display

### Edit Invoice Form (`src/app/(admin)/billing/[id]/edit/`)
- Server page guards with `status !== 'DRAFT'` redirect
- Client form pre-populated from invoice data (ISO date → YYYY-MM-DD for input)
- Same line-item editor as new form; tenant shown as read-only
- Submits to `updateSysAdminInvoice(id, ...)`

### Tenant Billing History (`src/app/(admin)/tenants/[id]/page.tsx`)
- Added `getSysAdminInvoices({ tenantId })` fetch below existing data
- Billing History card renders below the 2-column grid
- Table: invoice number (link), amount, due date, status badge
- "+ New Invoice" link pre-selects the tenant via `?tenantId=` searchParam

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Prisma Decimal not directly renderable as ReactNode**
- **Found during:** Task 2 (TypeScript check)
- **Issue:** Prisma returns `Decimal` type for `quantity`, `unitPrice`, `amount`, `total` fields; JSX renders require string/number
- **Fix:** Added `.toString()` call on `item.quantity` in detail page; used `{ toString(): string }` union type in EditInvoiceForm's InvoiceItem interface, and called `.toString()` when initializing state from props
- **Files modified:** src/app/(admin)/billing/[id]/page.tsx, src/app/(admin)/billing/[id]/edit/edit-invoice-form.tsx
- **Commit:** 516e467

## Self-Check: PASSED

- FOUND: src/app/(admin)/billing/page.tsx
- FOUND: src/app/(admin)/billing/mark-overdue-button.tsx
- FOUND: src/app/(admin)/billing/new/page.tsx
- FOUND: src/app/(admin)/billing/new/new-invoice-form.tsx
- FOUND: src/app/(admin)/billing/[id]/page.tsx
- FOUND: src/app/(admin)/billing/[id]/invoice-actions.tsx
- FOUND: src/app/(admin)/billing/[id]/edit/page.tsx
- FOUND: src/app/(admin)/billing/[id]/edit/edit-invoice-form.tsx
- FOUND: commit e644ae8
- FOUND: commit 516e467
- npx next build: /billing, /billing/[id], /billing/[id]/edit, /billing/new all present
- npx tsc --noEmit: 0 errors
