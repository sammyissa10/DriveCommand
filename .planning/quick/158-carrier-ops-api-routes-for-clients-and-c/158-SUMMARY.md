---
phase: quick-158
plan: "01"
subsystem: carrier-ops
tags: [api, carrier, clients, contracts, rest, prisma, zod]
dependency_graph:
  requires:
    - quick-157 (CarrierClient + CarrierContract Prisma models)
  provides:
    - REST API for carrier client CRUD
    - REST API for carrier contract CRUD + revenue summary
  affects:
    - apps/web/src/lib/carrier/
    - apps/web/src/app/api/v1/carrier/
tech_stack:
  added:
    - /api/v1/carrier/* route namespace
  patterns:
    - Prisma data access modules in lib/carrier/
    - Zod v4 (.issues) request validation
    - Decimal-to-string serialization via decStr helper
    - Next.js 15 async params (params: Promise<{ id: string }>)
    - Transaction-based contract number generation
key_files:
  created:
    - apps/web/src/lib/carrier/clients.ts
    - apps/web/src/lib/carrier/contracts.ts
    - apps/web/src/app/api/v1/carrier/clients/route.ts
    - apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/contracts/route.ts
    - apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts
    - apps/web/src/app/api/v1/carrier/contracts/[id]/loads/route.ts
  modified: []
decisions:
  - Used Zod v4 .issues instead of .errors (project uses zod@^4.3.6)
  - Decimal serialization via String(d) helper rather than importing Decimal type directly
  - ContractCreateInput accepts baseRate/fuelSurchargeRate as strings (Prisma accepts string for Decimal fields)
metrics:
  duration: ~20 minutes
  completed: "2026-04-04"
  tasks_completed: 2
  tasks_total: 2
  files_created: 7
---

# Phase quick-158 Plan 01: Carrier API Routes for Clients and Contracts Summary

**One-liner:** Org-scoped REST CRUD endpoints for carrier clients and contracts under `/api/v1/carrier/` with Zod v4 validation, Decimal serialization, and transaction-based CN-YYYY-NNNNN contract numbering.

## What Was Built

### Task 1: Data access layer (lib/carrier/)

Two modules exposing all database operations for CarrierClient and CarrierContract.

**clients.ts** exports:
- `listClients(orgId, filters)` — paginated list with search (case-insensitive) and status filter
- `getClient(orgId, id)` — single record with computed `openLoadsCount` and `outstandingAR`
- `createClient(orgId, data)` — enforces orgId from param, never from request body
- `updateClient(orgId, id, data)` — verifies org ownership before update, returns null if not found
- `softDeleteClient(orgId, id)` — sets status='inactive', returns null if not found

**contracts.ts** exports:
- `listContracts(orgId, filters)` — paginated list with clientId and status filters, includes client name
- `getContract(orgId, id)` — includes routeTemplateCount and revenue aggregates
- `createContract(orgId, clientId, data)` — auto-generates CN-YYYY-NNNNN via transaction to prevent races
- `updateContract(orgId, id, data)` — org-scoped, serializes Decimal on return
- `softDeleteContract(orgId, id)` — sets status='terminated'
- `getContractLoadsSummary(orgId, contractId)` — aggregates totalLoads/totalRevenue/totalInvoiced/totalPaid/avgRate

### Task 2: API route handlers (api/v1/carrier/)

Five route files creating the full HTTP surface:

| Endpoint | Methods | Notes |
|---|---|---|
| `/api/v1/carrier/clients` | GET, POST | search/status/page/pageSize params; 201 on create |
| `/api/v1/carrier/clients/[id]` | GET, PATCH, DELETE | 404 if not found; DELETE soft-deletes |
| `/api/v1/carrier/contracts` | GET, POST | client_id/status/page/pageSize params; 201 on create |
| `/api/v1/carrier/contracts/[id]` | GET, PATCH, DELETE | 404 if not found; DELETE sets terminated |
| `/api/v1/carrier/contracts/[id]/loads` | GET | Revenue summary for contract's loads |

All handlers enforce: session auth (401), tenantId check (403), Zod validation (400), consistent `{data}` / `{error}` response shape, try/catch with logger.error (500).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Zod v4 uses `.issues` not `.errors`**
- **Found during:** Task 2 TypeScript check
- **Issue:** Plan spec referenced `parsed.error.errors[0].message` but project uses Zod ^4.3.6 where the property is `.issues`
- **Fix:** Changed all four validation error reads to `parsed.error.issues[0].message`
- **Files modified:** All 4 POST/PATCH route files
- **Commit:** 2adb1e1

**2. [Rule 2 - Missing] Avoided Decimal type import**
- **Found during:** Task 1 implementation
- **Issue:** No `runtime/library` export path in the generated Prisma client structure
- **Fix:** Used `const decStr = (d: any): string | null => (d != null ? String(d) : null)` — avoids import entirely, achieves same serialization
- **Files modified:** clients.ts, contracts.ts

## Self-Check

**Files:**
- FOUND: apps/web/src/lib/carrier/clients.ts
- FOUND: apps/web/src/lib/carrier/contracts.ts
- FOUND: apps/web/src/app/api/v1/carrier/clients/route.ts
- FOUND: apps/web/src/app/api/v1/carrier/clients/[id]/route.ts
- FOUND: apps/web/src/app/api/v1/carrier/contracts/route.ts
- FOUND: apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts
- FOUND: apps/web/src/app/api/v1/carrier/contracts/[id]/loads/route.ts

**TypeScript:** `npx tsc --noEmit` — zero errors

**Commits:**
- FOUND: 4c77c0e (Task 1 — lib/carrier/)
- FOUND: 2adb1e1 (Task 2 — api/v1/carrier/)

## Self-Check: PASSED
