---
phase: quick-169
plan: "01"
subsystem: carrier-ops
tags: [carrier, loads, form, financials, crud]
dependency_graph:
  requires:
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/lib/carrier/revenue-calculator.ts
    - apps/web/src/components/carrier/stops/StopBuilder.tsx
  provides:
    - apps/web/src/components/carrier/loads/LoadList.tsx
    - apps/web/src/components/carrier/loads/LoadForm.tsx
    - apps/web/src/components/carrier/loads/LoadFinancials.tsx
    - apps/web/src/app/(owner)/carrier/loads/page.tsx
    - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  affects:
    - Carrier Ops sidebar Loads link
    - /carrier/loads route group
tech_stack:
  added: []
  patterns:
    - Client-side revenue calculator replicated from server module (cannot import prisma in client)
    - Contract auto-populate with "from contract" labels on auto-filled fields
    - Status multi-toggle filter badges with color-coded per-status classes
    - Decimal-to-number transforms in server page for client component props
key_files:
  created:
    - apps/web/src/components/carrier/loads/LoadList.tsx
    - apps/web/src/components/carrier/loads/LoadForm.tsx
    - apps/web/src/components/carrier/loads/LoadFinancials.tsx
    - apps/web/src/app/(owner)/carrier/loads/page.tsx
    - apps/web/src/app/(owner)/carrier/loads/new/page.tsx
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
  modified: []
decisions:
  - Replicated calculateRevenue logic inline in LoadFinancials to avoid prisma import in client component
  - Used client-side status multi-toggle with client-side filter for multiple selections (API supports single status param)
  - Appointment fields are display-only with TODO comment — they are stop-level fields not load-level
  - StopBuilder displayed in create mode only when no dispatchId — stops are display-only with TODO to persist
metrics:
  duration: "6 minutes"
  completed: "2026-04-05T08:19:44Z"
  tasks_completed: 2
  files_created: 6
---

# Phase quick-169: Carrier Ops Loads — List, Create, and Detail Summary

**One-liner:** Paginated loads list with client/status/date filters, 8-section create/edit form with contract rate auto-population, and live financial preview computing base + FSC + accessorials = invoice total.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | LoadList component and list page | 231104d | LoadList.tsx, loads/page.tsx |
| 2 | LoadForm, LoadFinancials, create and detail pages | 2c93927 | LoadForm.tsx, LoadFinancials.tsx, new/page.tsx, [id]/page.tsx |

## What Was Built

### LoadList (`LoadList.tsx`)
Client-side loads list fetching `/api/v1/carrier/loads`. Features:
- Client `<select>` filter with "All Clients" default from server-fetched `clientMap`
- Status multi-toggle badges (pending=slate, in_transit=blue, delivered=green, cancelled=red, invoiced=purple)
- Date range filters (From / To date inputs)
- Paginated table (PAGE_SIZE=25) with prev/next and "Page X of Y (N total)"
- Table columns: Load # (linked to detail), Client (linked to client detail), Dispatch (linked or "Unassigned" badge), Type (uppercase badge), Status (colored badge), Total (currency)
- Skeleton loading state with 6 animate-pulse placeholder rows
- "New Load" button linking to `/carrier/loads/new` positioned right via `ml-auto`

### LoadFinancials (`LoadFinancials.tsx`)
Client-side financial preview card. Revenue calculation replicated from `revenue-calculator.ts` (cannot import server module in client component). Shows:
- Base Revenue (with contextual notes for per_mile/per_stop/hourly rate types)
- Fuel Surcharge (with "per-mile FSC (miles needed)" note when applicable)
- Detention (always $0.00 — no detention_minutes column)
- Accessorial / Other Charges
- Invoice Total (bold with border separator)
- Gross Margin (broker mode only, green if positive / red if negative)

### LoadForm (`LoadForm.tsx`)
8-section create/edit form. Key features:
1. **Client & Contract** — required client select with red asterisk, contract select appears when client selected (fetches active contracts via `/api/v1/carrier/contracts?client_id=X&status=active`). Contract selection auto-populates `rateType`, `rateAmount`, `fuelSurchargeMethod`, `fuelSurchargeRate` with "from contract" label next to each auto-filled field.
2. **Freight Details** — loadType, commodityDescription (required), weight/pieces/pallets, hazmat toggle, BOL/PRO/PO numbers
3. **Rate** — rateType with dynamic label, rateAmount, FSC method/rate, otherCharges, plus live `<LoadFinancials />` preview updating in real time
4. **Appointments** — datetime-local inputs (display-only, TODO comment for stop-level wiring)
5. **Broker Mode** — Switch toggle, carrierCost input when enabled
6. **Rate Confirmation** — file input with TODO comment for R2 wiring
7. **Driver Instructions** — specialInstructions textarea
8. **Stops** — `<StopBuilder mode="load" />` shown in create mode when no dispatchId (display-only, TODO for persistence)

Validation: `clientId` required (red inline error), `commodityDescription` required. POST to `/api/v1/carrier/loads` on create (redirects to detail), PATCH to `/api/v1/carrier/loads/[id]` on edit (redirects to list).

### Pages
- **`loads/page.tsx`** — Server component fetching all org clients for `clientMap`, renders heading + `<LoadList />`
- **`loads/new/page.tsx`** — Server component fetching clients, renders `<LoadForm mode="create" />`
- **`loads/[id]/page.tsx`** — Server component fetching load via `getLoad()` + clients. Transforms Prisma Decimal fields to numbers. Renders `<LoadForm mode="edit" initialData={...} />`

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files exist
- `apps/web/src/components/carrier/loads/LoadList.tsx` — FOUND
- `apps/web/src/components/carrier/loads/LoadForm.tsx` — FOUND
- `apps/web/src/components/carrier/loads/LoadFinancials.tsx` — FOUND
- `apps/web/src/app/(owner)/carrier/loads/page.tsx` — FOUND
- `apps/web/src/app/(owner)/carrier/loads/new/page.tsx` — FOUND
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` — FOUND

### Commits exist
- 231104d — feat(quick-169): add carrier loads list page with filters and pagination
- 2c93927 — feat(quick-169): add LoadForm, LoadFinancials, create and detail pages

### TypeScript
- `npx tsc --noEmit -p apps/web/tsconfig.json` — PASSED (no output = no errors)

## Self-Check: PASSED
