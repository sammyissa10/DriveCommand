---
phase: quick-37
plan: "01"
subsystem: navigation, invoices
tags: [sidebar, navigation, invoices, ui-fix, audit]
dependency_graph:
  requires: []
  provides:
    - Sidebar Settings section with Expense Categories + Expense Templates links
    - Sidebar Management section without duplicate Maintenance item
    - Invoice detail conditional Edit button (hidden on PAID/CANCELLED)
    - markInvoicePaid server action (SENT -> PAID transition)
    - MarkAsPaidButton client component
  affects:
    - src/components/navigation/sidebar.tsx
    - src/app/(owner)/invoices/[id]/page.tsx
    - src/app/(owner)/actions/invoices.ts
    - src/components/invoices/mark-as-paid-button.tsx
tech_stack:
  added: []
  patterns:
    - Server action prop-passing to client component (same as DeleteInvoiceButton)
    - useTransition for server action pending state
    - Status-gated conditional rendering for invoice action buttons
key_files:
  created:
    - src/components/invoices/mark-as-paid-button.tsx
  modified:
    - src/components/navigation/sidebar.tsx
    - src/app/(owner)/invoices/[id]/page.tsx
    - src/app/(owner)/actions/invoices.ts
decisions:
  - Removed Wrench import when removing Maintenance nav item (keep imports clean)
  - Edit hidden on PAID and CANCELLED (both terminal statuses — no further editing needed)
  - Mark as Paid only on SENT (not DRAFT/OVERDUE — SENT is the actionable pre-payment state)
  - useTransition over useState+setIsPending for pending state (idiomatic React 18 pattern)
  - markInvoicePaid validates status === SENT at server level (defense-in-depth beyond UI gating)
metrics:
  duration: 93s
  completed: "2026-02-27"
  tasks: 2
  files_affected: 4
---

# Phase Quick-37: Fix Audit Issues — Sidebar Links for Expense Settings + Invoice Conditional Buttons — Summary

**One-liner:** Added Expense Categories/Templates to sidebar Settings, removed duplicate Maintenance nav item, and added status-gated Edit/Mark-as-Paid buttons on invoice detail.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Fix sidebar — add expense settings links, remove Maintenance duplicate | c9c4c03 | sidebar.tsx |
| 2 | Invoice detail — conditional Edit button and Mark as Paid action | 02676cd | invoices.ts, mark-as-paid-button.tsx, [id]/page.tsx |

## What Was Built

### Task 1: Sidebar Navigation Fixes

**Expense Categories + Expense Templates added to Settings section:**
- `Expense Categories` → `/settings/expense-categories` (Tag icon, isActive on pathname prefix)
- `Expense Templates` → `/settings/expense-templates` (FileSpreadsheet icon, isActive on pathname prefix)
- Both placed before existing Integrations link (alphabetical/logical order)

**Maintenance duplicate removed:**
- Removed the Wrench/Maintenance `SidebarMenuItem` from Management section
- Per-truck maintenance is accessed via `/trucks/[id]/maintenance` on the truck detail page — no fleet-wide maintenance page exists
- Removed unused `Wrench` import from lucide-react

**Trucks isActive simplified:**
- Changed from `pathname.startsWith("/trucks") && !pathname.includes("/maintenance")` to simply `pathname.startsWith("/trucks")`
- No longer needed to disambiguate from a Maintenance nav item that no longer exists

### Task 2: Invoice Detail Conditional Buttons + Mark as Paid

**markInvoicePaid server action (`actions/invoices.ts`):**
- Requires OWNER or MANAGER role
- Fetches invoice, validates status === 'SENT' (returns error if not)
- Updates to `status: 'PAID', paidDate: new Date()`
- Handles P2025 (not found) in catch block
- `revalidatePath('/invoices')` then `redirect(\`/invoices/${id}\`)`

**MarkAsPaidButton client component (`mark-as-paid-button.tsx`):**
- Props: `{ invoiceId: string, markPaidAction: (id: string) => Promise<any> }`
- `useTransition` for pending state — button disabled + shows "Processing..." text during submission
- Green styling: `bg-green-600 hover:bg-green-700 text-white` with DollarSign icon
- Server action passed as prop from server page component (same pattern as DeleteInvoiceButton)

**Invoice detail page (`invoices/[id]/page.tsx`):**
- Edit link conditionally rendered: `invoice.status !== 'PAID' && invoice.status !== 'CANCELLED'`
- MarkAsPaidButton conditionally rendered: `invoice.status === 'SENT'`
- Button visibility matrix:

| Status | Edit | Mark as Paid | Delete |
|--------|------|-------------|--------|
| DRAFT | Yes | No | Yes |
| SENT | Yes | Yes | No |
| PAID | No | No | No |
| OVERDUE | Yes | No | No |
| CANCELLED | No | No | No |

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with no errors (both tasks verified)
- Sidebar Settings section: Expense Categories, Expense Templates, Integrations (3 links)
- Sidebar Management section: Trucks, Drivers, Routes, Tags (no Maintenance)
- Wrench not in lucide-react imports
- DRAFT invoice: Edit visible, Mark as Paid hidden, Delete visible
- SENT invoice: Edit visible, Mark as Paid visible, Delete hidden
- PAID invoice: Edit hidden, Mark as Paid hidden, Delete hidden
- CANCELLED invoice: Edit hidden, Mark as Paid hidden, Delete hidden
- markInvoicePaid validates SENT status server-side before updating

## Self-Check: PASSED

Files verified to exist:
- src/components/navigation/sidebar.tsx — FOUND
- src/app/(owner)/actions/invoices.ts — FOUND
- src/components/invoices/mark-as-paid-button.tsx — FOUND
- src/app/(owner)/invoices/[id]/page.tsx — FOUND

Commits verified:
- c9c4c03 — FOUND (feat(quick-37-01))
- 02676cd — FOUND (feat(quick-37-02))
