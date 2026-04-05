---
phase: quick-162
plan: 01
subsystem: carrier-ops
tags: [carrier, documents, expenses, pay-records, cron, supabase-storage]
dependency_graph:
  requires:
    - quick-161 (stops API + stop-completion microflow)
    - quick-160 (dispatches + loads API)
    - quick-159 (facilities + clients API)
    - carrier DB migrations (013-014)
  provides:
    - Document upload microflow (Supabase Storage, path pattern)
    - Expense CRUD + approval
    - Pay record generation (5 pay models + relay split)
    - Nightly auto-dispatch cron
  affects:
    - apps/web/src/lib/carrier/stop-completion.ts (pay calculator now wired in)
    - apps/web/src/lib/carrier/dispatches.ts (pay calculator now wired in)
    - apps/web/vercel.json (cron schedule added)
tech_stack:
  added: []
  patterns:
    - Supabase Storage via createAdminClient (carrier-documents bucket)
    - Storage path: {orgId}/{parentType}/{parentId}/{docType}/{uuid}.{ext}
    - Result union type { data } | { error, status } for microflows
    - 422 for business rule violations (paid/non-pending pay records)
    - Per-tenant isolation in cron (try/catch per tenant)
key_files:
  created:
    - apps/web/src/lib/carrier/documents.ts
    - apps/web/src/lib/carrier/expenses.ts
    - apps/web/src/lib/carrier/pay-calculator.ts
    - apps/web/src/app/api/v1/carrier/documents/route.ts
    - apps/web/src/app/api/v1/carrier/documents/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/expenses/route.ts
    - apps/web/src/app/api/v1/carrier/expenses/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/expenses/[id]/approve/route.ts
    - apps/web/src/app/api/v1/carrier/pay-records/route.ts
    - apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts
    - apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts
    - apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts
  modified:
    - apps/web/src/lib/carrier/stop-completion.ts
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/vercel.json
decisions:
  - "Decimal import: used Prisma.Decimal (from @/generated/prisma) not decimal.js — consistent with Prisma schema types"
  - "CarrierDocument has no orgId column — org scoping done by verifying parent chain (stop→dispatch→orgId)"
  - "percentage_gross creates one DriverPayRecord per load on the dispatch (not one per dispatch)"
  - "dispatches.ts TODO also wired: transitionDispatchStatus completion path now calls generateDriverPayRecords"
metrics:
  duration_minutes: 7
  completed_date: "2026-04-05"
  tasks_completed: 3
  files_created: 12
  files_modified: 3
---

# Phase quick-162 Plan 01: Carrier Ops Documents, Expenses, Pay Records & Cron Summary

**One-liner:** Document upload to Supabase Storage with path pattern, expense CRUD + approval, 5-model pay calculator with relay mile-split, and nightly auto-dispatch cron with per-org isolation.

## Tasks Completed

| Task | Name | Commit | Key Files |
|------|------|--------|-----------|
| 1 | Create documents.ts, expenses.ts, pay-calculator.ts lib modules | `5e43d33` | 3 lib modules |
| 2 | Create all 9 API route files | `5ddd848` | 8 route files + 1 pay-records route |
| 3 | Nightly cron + vercel.json + stop-completion wiring | `be24039` | cron route, vercel.json, 2 modified libs |

## What Was Built

### documents.ts
- `uploadDocument`: validates file type (pdf/jpg/jpeg/png/heic/webp) and size (25MB max), uploads to Supabase Storage bucket `carrier-documents` at path `{orgId}/{parentType}/{parentId}/{docType}/{uuid}.{ext}`, creates CarrierDocument record. Sets stopId for stop-type parents. Sets clientId from stop or load for BOL/POD documents.
- `listDocuments`: queries by parentType+parentId, verifies org ownership through parent chain (stop→dispatch→orgId, load→orgId, dispatch→orgId).
- `deleteDocument`: verifies org ownership, removes from Supabase Storage then hard-deletes DB record.
- `verifyDocument`: sets verified=true, verifiedBy, verifiedAt.

### expenses.ts
- Full CRUD: `listExpenses` (with dispatchId/loadId/stopId/driverId filters + pagination), `getExpense`, `createExpense`, `updateExpense`, `deleteExpense`, `approveExpense`.
- `createExpense`: requires at least one of dispatchId or loadId. Auto-sets `reimbursable=true` when `paidBy='driver_cash'`. Propagates `clientId` from load when loadId provided.

### pay-calculator.ts
- `generateDriverPayRecords`: loads dispatch with all relations, handles relay (isRelay = relayHandoffStopId + coDriverId present). Splits miles at handoff stop by sequenceOrder ratio. Empty miles estimated at 10% of loaded miles.
- 5 pay models: `per_mile` (loaded × rate + empty × rate×0.8), `percentage_gross` (one record per load, revenue × rate), `hourly` (hours from actualDeparture→actualArrival × rate), `flat_rate` (payRate as flat amount), `team_split` (totalMiles/2 then per_mile calculation).
- Fetches approved reimbursable expenses per driver per dispatch and adds to netPay.

### API Routes
- `POST /api/v1/carrier/documents` — multipart/form-data upload (parent_type, parent_id, document_type, file)
- `GET /api/v1/carrier/documents?parent_type=&parent_id=` — list documents
- `DELETE /api/v1/carrier/documents/{id}` — delete from storage + DB
- `PATCH /api/v1/carrier/documents/{id}` — verify document
- `GET/POST /api/v1/carrier/expenses` — list (with filters) + create
- `GET/PATCH/DELETE /api/v1/carrier/expenses/{id}` — CRUD by id
- `PATCH /api/v1/carrier/expenses/{id}/approve` — approve expense
- `GET /api/v1/carrier/pay-records` — list with driver_id/status/pay_period filters
- `PATCH /api/v1/carrier/pay-records/{id}/approve` — 422 if not pending
- `PATCH /api/v1/carrier/pay-records/{id}/void` — 422 if paid

### Cron
- `GET /api/cron/carrier-auto-dispatch` — nightly at 00:00 UTC. CRON_SECRET auth. Fetches tenants with active route templates, processes each template per tenant, wraps each tenant in try/catch (one failure cannot block others). Returns summary with orgs_processed, total_dispatches_created, total_errors, per-tenant details.

### vercel.json
- Added `{ "path": "/api/cron/carrier-auto-dispatch", "schedule": "0 0 * * *" }` to existing crons array. Preserved all existing entries (send-reminders, warmup, auto-close-tickets, mark-overdue-invoices).

### Wiring
- `stop-completion.ts`: replaced TODO comment with `await generateDriverPayRecords(orgId, stop.dispatchId)` wrapped in try/catch (failure does not block stop completion).
- `dispatches.ts`: replaced TODO with same pattern in `transitionDispatchStatus` completion path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Wrong Decimal import path**
- **Found during:** Task 1 tsc check
- **Issue:** `import { Decimal } from '@/generated/prisma/runtime/library'` — module not found
- **Fix:** Used `import { Prisma } from '@/generated/prisma'` and `Prisma.Decimal` constructor
- **Files modified:** apps/web/src/lib/carrier/pay-calculator.ts
- **Commit:** `5e43d33`

**2. [Rule 2 - Missing] Wire pay calculator into dispatches.ts too**
- **Found during:** Task 3
- **Issue:** dispatches.ts had an identical TODO for generateDriverPayRecords in transitionDispatchStatus — plan only mentioned stop-completion.ts
- **Fix:** Also replaced the TODO in dispatches.ts (manual status transition completion path)
- **Files modified:** apps/web/src/lib/carrier/dispatches.ts
- **Commit:** `be24039`

**3. [Rule 3 - Blocking] vercel.json at apps/web not project root**
- **Found during:** Task 3 — plan said vercel.json "does not exist"; it actually exists at apps/web/vercel.json
- **Fix:** Read existing file, merged new cron entry into existing crons array, preserved all existing config
- **Files modified:** apps/web/vercel.json
- **Commit:** `be24039`

## Self-Check

**Files verified:**
- `apps/web/src/lib/carrier/documents.ts` — FOUND
- `apps/web/src/lib/carrier/expenses.ts` — FOUND
- `apps/web/src/lib/carrier/pay-calculator.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/documents/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/documents/[id]/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/expenses/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/expenses/[id]/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/expenses/[id]/approve/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/pay-records/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/pay-records/[id]/approve/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/pay-records/[id]/void/route.ts` — FOUND
- `apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts` — FOUND
- `apps/web/vercel.json` — FOUND (with carrier-auto-dispatch cron entry)

**Commits verified:** 5e43d33, 5ddd848, be24039 — all present in git log

**tsc --noEmit:** PASSED (zero errors)

## Self-Check: PASSED
