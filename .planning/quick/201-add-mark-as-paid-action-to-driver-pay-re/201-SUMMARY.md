---
phase: quick-201
plan: 01
subsystem: carrier/payroll
tags: [pay-records, payroll, dispatch, driver-pay-report, api]
dependency_graph:
  requires: []
  provides: [mark-paid-endpoint, mark-paid-ui-dispatch, mark-paid-ui-report]
  affects: [DispatchPayRecordsPanel, driver-pay-report]
tech_stack:
  added: []
  patterns: [PATCH status transition endpoint, window.confirm guard, optimistic loading state]
key_files:
  created:
    - apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
  modified:
    - apps/web/src/components/carrier/dispatches/DispatchPayRecordsPanel.tsx
    - apps/web/src/app/(owner)/carrier/reports/driver-pay/page.tsx
decisions:
  - No paidAt field added to schema per execution constraints; status='paid' update only
  - approvedBy/approvedAt set conditionally only if not already present on the record
metrics:
  duration: ~10min
  completed: 2026-04-09
  tasks_completed: 2
  files_changed: 3
---

# Phase quick-201 Plan 01: Add Mark as Paid Action to Driver Pay Records Summary

**One-liner:** Mark as Paid button transitions approved pay records to paid status via new PATCH endpoint, surfaced in both dispatch detail panel and driver pay report with confirmation guard.

## What Was Built

PATCH `/api/v1/carrier/pay-records/[id]/mark-paid` endpoint mirrors the approve route — auth + orgId scope, 404 for unknown records, 422 with descriptive messages for pending/paid/voided records, sets `status: 'paid'` (and conditionally sets `approvedBy`/`approvedAt` if not already set). No schema changes were required.

`DispatchPayRecordsPanel` gains: `paid` entry in `PAY_STATUS_BADGE` map (blue), `markingPaidId` state, `handleMarkPaid()` async function with `window.confirm()` guard, and a "Mark as Paid" button rendered only for `approved` records. Paid records display the blue badge and no action buttons.

`driver-pay/page.tsx` gains: `markingPaidId` state, `handleMarkPaid()` function, an "Actions" column header in the table `<thead>`, and a "Mark as Paid" button cell in each row (rendered only for approved rows; empty cell for all other statuses).

## Deviations from Plan

### Skipped per execution constraints

**1. Schema change omitted** — The plan called for adding `paidAt DateTime?` to `DriverPayRecord` and running `prisma migrate dev`. Per explicit constraint in this execution, the schema was not modified and `paidAt` was not stored. The update only sets `status: 'paid'`.

## Self-Check: PASSED

- FOUND: apps/web/src/app/api/v1/carrier/pay-records/[id]/mark-paid/route.ts
- FOUND: commit 08c7047 (Task 1 — API endpoint)
- FOUND: commit c62a386 (Task 2 — UI components)
- TypeScript: `npx tsc --noEmit` passed with zero errors
