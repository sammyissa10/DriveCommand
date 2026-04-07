---
phase: quick-199
plan: "01"
subsystem: carrier-pay
tags: [pay-records, reimbursements, expenses, net-pay, api]
dependency_graph:
  requires: []
  provides: [recalculatePayRecordReimbursements, PATCH-pay-records-recalculate]
  affects: [DriverPayRecord, CarrierExpense, approveExpense]
tech_stack:
  added: []
  patterns: [computeNetPay helper, best-effort propagation with try/catch]
key_files:
  created:
    - apps/web/src/app/api/v1/carrier/pay-records/[id]/recalculate/route.ts
  modified:
    - apps/web/src/lib/carrier/pay-calculator.ts
    - apps/web/src/lib/carrier/expenses.ts
decisions:
  - "Split reimbursements evenly across sibling pay records for percentage_gross pay model (one record per load) to avoid double-reimbursement"
  - "Expense approval always succeeds — pay record propagation is best-effort, wrapped in try/catch with warnings"
  - "computeNetPay extracted as shared helper so the formula (base + bonuses + tips - deductions + reimbursements) is a single source of truth"
metrics:
  duration: "~15 minutes"
  completed: "2026-04-07"
  tasks_completed: 3
  files_modified: 3
---

# Phase quick-199 Plan 01: Fix Reimbursements Not Flowing Into Driver Pay Records Summary

## One-liner

Fixed reimbursement propagation pipeline: `computeNetPay` formula corrected to include all 5 components, `approveExpense` now auto-updates non-paid pay records, and a new PATCH recalculate endpoint provides manual override.

## What Was Built

### Task 1 — pay-calculator.ts: computeNetPay helper + recalculatePayRecordReimbursements

- Extracted `computeNetPay(basePay, bonuses, tips, deductions, reimbursements)` helper — single source of truth for the net_pay formula
- Fixed both pay model code paths (percentage_gross loop and general case) to use `computeNetPay` instead of `basePay + reimbursements`
- Exported `recalculatePayRecordReimbursements(orgId, payRecordId)`:
  - Returns 404 if record not found
  - Returns 422 if record.status === 'paid' (protected)
  - Sums all approved reimbursable expenses for driver+dispatch
  - Splits evenly across sibling records for percentage_gross pay model
  - Updates reimbursements + netPay on the record using Prisma.Decimal

### Task 2 — expenses.ts: auto-propagation on approval

- Imported `recalculatePayRecordReimbursements` from `./pay-calculator`
- After `approveExpense` updates the expense, if it is reimbursable with a dispatchId and driverId, finds all non-paid DriverPayRecord rows for that driver+dispatch
- Calls `recalculatePayRecordReimbursements` for each, logging results
- Wrapped in try/catch — expense approval always succeeds regardless of pay record update failures

### Task 3 — PATCH /api/v1/carrier/pay-records/[id]/recalculate

- New route at `apps/web/src/app/api/v1/carrier/pay-records/[id]/recalculate/route.ts`
- Follows same auth pattern as the existing approve route (getSession + tenantId)
- Delegates entirely to `recalculatePayRecordReimbursements`
- Returns 404/422 error responses or `{ data: { id, reimbursements, netPay } }` on success

## Deviations from Plan

None — plan executed exactly as written.

## Commits

| Hash    | Message |
| ------- | ------- |
| 255f620 | feat(quick-199): add recalculatePayRecordReimbursements helper and fix net_pay formula |
| e9d2f6a | feat(quick-199): propagate reimbursements to pay records on expense approval |
| 0acf1c4 | feat(quick-199): add PATCH /api/v1/carrier/pay-records/[id]/recalculate endpoint |

## Self-Check: PASSED

- `apps/web/src/lib/carrier/pay-calculator.ts` — found, exports `recalculatePayRecordReimbursements`, `computeNetPay` used in 3 places
- `apps/web/src/lib/carrier/expenses.ts` — found, imports and calls `recalculatePayRecordReimbursements`
- `apps/web/src/app/api/v1/carrier/pay-records/[id]/recalculate/route.ts` — found
- `npx tsc --noEmit` — zero errors
- Commits 255f620, e9d2f6a, 0acf1c4 — all present in git log
