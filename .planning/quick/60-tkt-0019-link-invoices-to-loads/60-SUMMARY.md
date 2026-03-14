---
phase: quick-60
plan: "01"
subsystem: invoices / loads
tags: [invoices, loads, schema, fk, pre-fill]
dependency_graph:
  requires: []
  provides: [loadId FK on Invoice, invoices relation on Load, load-to-invoice creation flow]
  affects: [Invoice model, Load model, invoice creation action, new invoice page, invoice form, load detail page]
tech_stack:
  added: []
  patterns: [nullable FK with index, query param pre-fill, hidden form field, revalidatePath cross-entity]
key_files:
  created: []
  modified:
    - prisma/schema.prisma
    - src/lib/validations/invoice.schemas.ts
    - src/app/(owner)/actions/invoices.ts
    - src/app/(owner)/invoices/new/page.tsx
    - src/components/invoices/invoice-form.tsx
    - src/app/(owner)/loads/[id]/page.tsx
decisions:
  - "Used nullable loadId FK (not required) so all existing invoices remain valid without migration"
  - "Amount encoded as JS Number in URL param (load.rate is Decimal — converted for URL only, reparsed as Decimal in action via Zod coerce)"
  - "Status badge colors implemented inline on load detail page (no new component needed)"
metrics:
  duration: "227s (~3m 47s)"
  completed: "2026-03-14"
  tasks: 3
  files_modified: 6
---

# Quick Task 60: TKT-0019 — Link Invoices to Loads Summary

**One-liner:** Optional loadId FK on Invoice with indexed relation, load detail Invoices section, and query-param pre-fill from load to new invoice form.

## What Was Built

Three interconnected changes that close the invoice-to-load traceability gap:

1. **Schema FK** — `Invoice.loadId String? @db.Uuid` with `@@index([loadId])` and reverse `Load.invoices Invoice[]` relation. Applied via `prisma db push`.

2. **Invoice creation wiring** — `invoiceCreateSchema` accepts `loadId` (optional UUID). `createInvoice` server action reads it from FormData and persists to DB. Added `revalidatePath('/loads')` so load detail reflects new invoices immediately.

3. **New invoice page pre-fill** — `/invoices/new` accepts `loadId`, `customerId`, `amount`, `loadNumber` query params. Passes them as `initialData` and `loadId`/`loadNumber` props to `InvoiceForm`. Back link returns to the load when `loadId` is present.

4. **InvoiceForm enhancements** — Hidden `<input name="loadId">` submitted with every form (empty string when no load context). Blue info banner "Creating invoice for Load #[number]" with link back to load when `loadId` prop is set.

5. **Load detail Invoices section** — Queries `prisma.invoice.findMany({ where: { loadId: id } })`. Renders card with invoice number (linked to `/invoices/[id]`), status badge (DRAFT=gray, SENT=blue, PAID=green, OVERDUE=red, CANCELLED=gray), due date, and total amount. Create Invoice button with Plus icon appears only for `DELIVERED` or `INVOICED` loads, linking to `/invoices/new?loadId=...&customerId=...&amount=...&loadNumber=...`.

## Verification

- `npx prisma db push` — applied cleanly
- `npx prisma generate` — client regenerated
- `npx tsc --noEmit` — no type errors
- `npx next build` — compiled and generated all 86 routes without error

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

All files exist. All commits present:
- 79a0d35: feat(quick-60): add loadId FK to Invoice schema and invoices relation to Load
- 84a05cd: feat(quick-60): wire loadId through invoice creation and pre-fill from load
- 9eefc15: feat(quick-60): add Invoices section to Load detail page
