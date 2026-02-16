---
phase: 16
plan: 03
subsystem: route-finance
tags: [payments, revenue, profit-calculation, financial-summary, decimal-precision]
dependency_graph:
  requires: [16-01, 16-02]
  provides: [payment-crud, financial-calculator, profit-margin-tracking]
  affects: [route-detail-page, financial-reporting]
tech_stack:
  added: [route-calculator-library]
  patterns: [decimal-arithmetic, financial-math, status-badges, conditional-rendering]
key_files:
  created:
    - src/lib/validations/payment.schemas.ts
    - src/app/(owner)/actions/payments.ts
    - src/lib/finance/route-calculator.ts
    - src/components/routes/payment-form.tsx
    - src/components/routes/route-payments-section.tsx
    - src/components/routes/route-financial-summary.tsx
  modified:
    - src/app/(owner)/routes/[id]/page.tsx
decisions:
  - Used Prisma.Decimal (from @/generated/prisma) for all money calculations to avoid floating-point errors
  - Created centralized route-calculator.ts library for all financial math (single source of truth)
  - Implemented conditional paidAt field rendering based on status selection in payment form
  - Used local state (useState) in PaymentForm to track status and show/hide paidAt field
  - Applied green badge for PAID status, yellow/amber badge for PENDING status for visual distinction
  - Calculated margin as (profit / totalRevenue) * 100 with zero-division protection
  - Set default profitMarginThreshold to 10% (can be made configurable from Tenant model later)
  - Used parseFloat ONLY for display formatting (Intl.NumberFormat), never for calculations
metrics:
  duration: 438s
  tasks_completed: 3
  files_affected: 7
  commits: 3
  completed_date: 2026-02-16
---

# Phase 16 Plan 03: Payment & Revenue Tracking Summary

**Payment CRUD with Decimal.js financial calculator and profit/margin tracking**

## What Was Built

Implemented complete payment/revenue recording system with financial summary dashboard:

1. **Payment Schemas & Actions** (Task 1):
   - Zod validation schemas for payment create/update with amount, status, paidAt, notes
   - Four server actions: createPayment, updatePayment, deletePayment, listPayments
   - COMPLETED route protection on all mutations
   - Auto-set paidAt to current date when status changes to PAID without explicit date
   - Soft delete pattern (deletedAt) for audit trail preservation

2. **Payment Form Component** (Task 2):
   - Amount input with 2-decimal precision (0.01 step)
   - Status dropdown (PENDING/PAID)
   - Conditional paidAt datetime-local picker (only shows when status is PAID)
   - Notes textarea (max 1000 chars)
   - Local state management for status to control conditional field visibility
   - Support for both create and edit modes via useActionState

3. **Payment List & Financial Summary** (Task 3):
   - RoutePaymentsSection: payment list with CRUD controls, status badges, total revenue
   - RouteFinancialSummary: financial dashboard showing:
     - Total Revenue (with paid/pending breakdown)
     - Total Expenses
     - Profit (color-coded: green for positive, red for negative)
     - Margin Percentage (with low-margin warning when below 10%)
   - Integration into route detail page with calculateRouteFinancials
   - Status badges: PAID (green), PENDING (yellow/amber)
   - Low margin warning with AlertTriangle icon

## Deviations from Plan

None - plan executed exactly as written.

## Technical Highlights

**Decimal.js Precision**: All financial calculations use Prisma.Decimal with .add(), .sub(), .div(), .mul() methods. No JavaScript number arithmetic on currency values (prevents 0.1 + 0.2 = 0.30000000000000004).

**Financial Calculator Library**: Created centralized `calculateRouteFinancials()` function:
- Takes expenses and payments arrays as input
- Returns serializable strings (Decimal.toFixed(2)) for server-to-client props
- Handles zero-division in margin calculation
- Returns isLowMargin boolean for threshold warnings

**Status-Based Conditional Rendering**: PaymentForm uses local state to show/hide paidAt field:
```typescript
const [selectedStatus, setSelectedStatus] = useState(payment?.status || 'PENDING');
// ...
{selectedStatus === 'PAID' && (
  <input type="datetime-local" name="paidAt" ... />
)}
```

**Server Action Auto-Date Logic**: If status is PAID and no paidAt provided, server action sets it to `new Date()`. If status changes from PENDING to PAID during update, sets paidAt to now.

## Verification Results

- TypeScript compilation: PASSED
- Production build: PASSED (7.4s compile, 20 routes generated)
- Route detail page structure:
  1. Route Details card
  2. Financial Summary card (NEW)
  3. Expenses card (from 16-02)
  4. Payments card (NEW)
  5. Files card

## Files Created

| File | Purpose | Exports |
|------|---------|---------|
| src/lib/validations/payment.schemas.ts | Zod schemas for payment validation | paymentCreateSchema, paymentUpdateSchema |
| src/app/(owner)/actions/payments.ts | Server actions for payment CRUD | createPayment, updatePayment, deletePayment, listPayments |
| src/lib/finance/route-calculator.ts | Financial calculation library | calculateRouteFinancials |
| src/components/routes/payment-form.tsx | Payment form with conditional fields | PaymentForm |
| src/components/routes/route-payments-section.tsx | Payment list with CRUD controls | RoutePaymentsSection |
| src/components/routes/route-financial-summary.tsx | Financial dashboard card | RouteFinancialSummary |

## Files Modified

| File | Changes |
|------|---------|
| src/app/(owner)/routes/[id]/page.tsx | Added listPayments import, calculateRouteFinancials call, financial summary + payments sections |

## Integration Points

**Upstream Dependencies**:
- Plan 16-01: RoutePayment table, PaymentStatus enum, Decimal type
- Plan 16-02: RouteExpensesSection pattern, expenses list

**Downstream Provides**:
- Payment CRUD actions for future financial reporting features
- Financial calculator for route profitability analysis
- Profit margin tracking for business intelligence dashboards

**Affects**:
- Route detail page: now shows complete financial picture (revenue + expenses + profit)
- Future financial reports will consume calculateRouteFinancials() for aggregate metrics

## Testing Scenarios Enabled

1. Create PAID payment with explicit date → green badge, shows paid date
2. Create PAID payment without date → auto-sets to current date/time
3. Create PENDING payment → yellow badge, no paid date shown
4. Edit payment status from PENDING to PAID → auto-sets paidAt, badge changes
5. Delete payment → soft deleted, disappears from list, financial summary recalculates
6. View financial summary with profit > 0 → green profit, margin displayed
7. View financial summary with profit < 0 → red profit, negative margin
8. View financial summary with margin < 10% → orange warning with AlertTriangle
9. Try to add/edit/delete payment on COMPLETED route → blocked with error message

## Self-Check: PASSED

**Created files verified**:
```
FOUND: src/lib/validations/payment.schemas.ts
FOUND: src/app/(owner)/actions/payments.ts
FOUND: src/lib/finance/route-calculator.ts
FOUND: src/components/routes/payment-form.tsx
FOUND: src/components/routes/route-payments-section.tsx
FOUND: src/components/routes/route-financial-summary.tsx
```

**Commits verified**:
```
FOUND: fea0a45
FOUND: aa8a056
FOUND: 3fe16d4
```

All artifacts created successfully. Financial calculations use Decimal arithmetic exclusively. Payment status tracking works with visual badges. Profit/margin displayed with conditional styling.
