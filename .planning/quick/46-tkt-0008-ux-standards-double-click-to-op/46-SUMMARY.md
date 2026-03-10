---
phase: quick-46
plan: "01"
subsystem: UX / Data Layer
tags:
  - ux
  - double-click
  - soft-delete
  - audit-trail
  - driver-documents
dependency_graph:
  requires:
    - prisma/schema.prisma
    - src/lib/auth/server.ts
  provides:
    - Double-click row navigation on all 6 list pages
    - archivedAt soft-delete on Truck, Route, Load, Invoice, PayrollRecord
    - createdById/updatedById audit trail on 5 entity models
    - Record History section on all 6 detail pages
    - Collapsed upload form on driver detail page
  affects:
    - src/components/trucks/truck-list.tsx
    - src/components/drivers/driver-list.tsx
    - src/components/routes/route-list.tsx
    - src/components/loads/load-list.tsx
    - src/components/invoices/invoice-list.tsx
    - src/components/payroll/payroll-list.tsx
    - src/app/(owner)/actions/trucks.ts
    - src/app/(owner)/actions/routes.ts
    - src/app/(owner)/actions/loads.ts
    - src/app/(owner)/actions/invoices.ts
    - src/app/(owner)/actions/payroll.ts
    - src/app/(owner)/trucks/[id]/page.tsx
    - src/app/(owner)/drivers/[id]/page.tsx
    - src/app/(owner)/routes/[id]/page.tsx
    - src/app/(owner)/loads/[id]/page.tsx
    - src/app/(owner)/invoices/[id]/page.tsx
    - src/app/(owner)/payroll/[id]/page.tsx
    - src/components/documents/driver-document-upload.tsx
tech_stack:
  added: []
  patterns:
    - Soft-delete with archivedAt timestamp pattern
    - Audit trail with createdById/updatedById via session userId
    - Double-click navigation using useRouter + onDoubleClick
    - Collapsible upload form with isOpen state
key_files:
  created: []
  modified:
    - prisma/schema.prisma
    - src/components/trucks/truck-list.tsx
    - src/components/drivers/driver-list.tsx
    - src/components/routes/route-list.tsx
    - src/components/loads/load-list.tsx
    - src/components/invoices/invoice-list.tsx
    - src/components/payroll/payroll-list.tsx
    - src/app/(owner)/actions/trucks.ts
    - src/app/(owner)/actions/routes.ts
    - src/app/(owner)/actions/loads.ts
    - src/app/(owner)/actions/invoices.ts
    - src/app/(owner)/actions/payroll.ts
    - src/app/(owner)/trucks/[id]/page.tsx
    - src/app/(owner)/drivers/[id]/page.tsx
    - src/app/(owner)/routes/[id]/page.tsx
    - src/app/(owner)/loads/[id]/page.tsx
    - src/app/(owner)/invoices/[id]/page.tsx
    - src/app/(owner)/payroll/[id]/page.tsx
    - src/app/(owner)/loads/page.tsx
    - src/app/(owner)/invoices/page.tsx
    - src/app/(owner)/payroll/page.tsx
    - src/components/documents/driver-document-upload.tsx
decisions:
  - "Used db push instead of migrate dev due to migration history drift from prior direct DB operations"
  - "Driver detail page shows System for createdBy/updatedBy since User model uses invitation-based creation without audit fields"
  - "Route audit trail added in server page.tsx wrapper rather than inside RoutePageClient to avoid modifying complex client props interface"
metrics:
  duration: "726s"
  completed: "2026-03-10"
  tasks: 3
  files_modified: 23
---

# Phase quick-46 Plan 01: UX Standards — Double-Click Navigation, Soft-Delete, Audit Trail Summary

**One-liner:** Four UX standards shipped across all six entity types: double-click row navigation, archivedAt soft-delete with `npx prisma db push`, createdById/updatedById audit trail on detail pages, and collapsed driver document upload form.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Add double-click row navigation to all six list components | 62d8a95 | 6 list components |
| 2 | Soft-delete schema + archive actions + filter archived records | c33ff4f | schema.prisma, 5 action files, 3 list pages |
| 3 | Audit trail on all 6 detail pages + fix driver doc upload form | 9508608 | 6 detail pages, 1 upload component |

## What Was Built

### Task 1: Double-Click Navigation
All six list pages now support row double-click to navigate to the entity detail page:
- `truck-list.tsx`, `driver-list.tsx`: tanstack-table `<tr>` with `onDoubleClick` + `cursor-pointer`
- `route-list.tsx`: used TableMeta pattern (columns defined outside component) with `onRowDoubleClick` callback
- `load-list.tsx`, `invoice-list.tsx`, `payroll-list.tsx`: custom table rows with `onDoubleClick` + `useRouter`
- All rows have `cursor-pointer` CSS to communicate interactivity

### Task 2: Soft-Delete with archivedAt
Schema changes:
- Added `archivedAt DateTime? @db.Timestamptz` and `@@index([archivedAt])` to: Truck, Route, Load, Invoice, PayrollRecord
- Added `createdById`, `updatedById` String? @db.Uuid fields to same 5 models + named relations
- Added 10 back-relations to User model (2 per entity: Created/Updated)
- Synced to DB via `npx prisma db push` (migrate dev unavailable due to migration history drift)

Server action changes:
- `deleteTruck`, `deleteRoute`: now `prisma.*.update({ archivedAt: new Date() })`
- `deleteLoad`, `deleteInvoice`, `deletePayrollRecord`: same soft-archive pattern
- `createTruck/Route/Load/Invoice/PayrollRecord`: capture `createdById: userId, updatedById: userId`
- `updateTruck/Route/Load/Invoice/PayrollRecord`: capture `updatedById: userId`
- `listTrucks`, `listRoutes`, loads/invoices/payroll pages: `where: { archivedAt: null }` filter
- Confirmation dialogs updated: "archive this truck (recoverable within 30 days)"

### Task 3: Audit Trail + Driver Doc Upload Fix
Detail pages:
- All 6 entity detail pages now show a "Record History" section at the bottom
- Trucks, routes, loads, invoices, payroll: display createdBy user name/email + formatted dates
- Driver page: shows "System" for by-fields (User model not tracked), dates from model
- Queries updated to `include: { createdBy: ..., updatedBy: ... }`

Driver document upload fix:
- `DriverDocumentUpload` now defaults to `isOpen = false`
- Renders a dashed "Upload Document" button when collapsed
- On click, expands to full upload form
- `resetForm()` also sets `isOpen = false` to collapse after successful upload
- Upload icon imported from lucide-react

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] migrate dev failed due to migration history drift**
- **Found during:** Task 2
- **Issue:** `npx prisma migrate dev` failed — migration history had drift from prior direct DB operations (db push, etc.)
- **Fix:** Used `npx prisma db push` as documented fallback in the plan
- **Files modified:** none (DB only)
- **Commit:** c33ff4f

**2. [Rule 1 - Bug] Invoice detail page audit trail had JSX placement error**
- **Found during:** Task 3 TypeScript check
- **Issue:** Audit trail div was inserted after the closing `</div>` of the outer container, creating invalid JSX
- **Fix:** Corrected JSX structure to insert before the final closing div
- **Files modified:** `src/app/(owner)/invoices/[id]/page.tsx`
- **Commit:** 9508608

## Verification Results

- `npx tsc --noEmit`: PASSED (no TypeScript errors)
- `npx prisma validate`: PASSED (schema valid)
- Schema has archivedAt on 5 models: Truck, Route, Load, Invoice, PayrollRecord
- Schema has createdById/updatedById on 5 models with named relations
- All 6 list pages: cursor-pointer + onDoubleClick navigation added
- All 6 detail pages: Record History section at bottom
- Driver detail page: upload form collapsed by default

## Self-Check: PASSED

Files verified to exist:
- src/components/trucks/truck-list.tsx: FOUND
- prisma/schema.prisma: FOUND (archivedAt on 5 models)
- src/app/(owner)/trucks/[id]/page.tsx: FOUND (Record History section)
- src/components/documents/driver-document-upload.tsx: FOUND (isOpen state)

Commits verified:
- 62d8a95: FOUND — double-click navigation
- c33ff4f: FOUND — soft-delete schema + actions
- 9508608: FOUND — audit trail + doc upload fix
