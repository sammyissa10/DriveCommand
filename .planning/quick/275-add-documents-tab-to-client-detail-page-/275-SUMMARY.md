---
phase: quick-275
plan: "01"
subsystem: carrier-ops / client-detail / contract-detail
tags: [documents, carrier, client, contract, signed-url, tenant-isolation]
dependency_graph:
  requires:
    - quick-274 (clientId/contractId propagation to CarrierDocument)
    - apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts
  provides:
    - GET /api/v1/carrier/clients/[id]/documents
    - GET /api/v1/carrier/contracts/[id]/documents
    - ClientDetail Documents tab
    - ContractDetail Documents section
  affects:
    - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
    - apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
    - apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts
tech_stack:
  added: []
  patterns:
    - lazy tab fetch (fetch on tab activation, not on mount)
    - on-demand signed URL (never cached in list response)
    - tenant isolation via parent entity orgId check
key_files:
  created:
    - apps/web/src/app/api/v1/carrier/clients/[id]/documents/route.ts
    - apps/web/src/app/api/v1/carrier/contracts/[id]/documents/route.ts
  modified:
    - apps/web/src/app/(owner)/carrier/clients/[id]/ClientDetail.tsx
    - apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx
    - apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts
decisions:
  - "Stop display uses stopType + sequenceOrder (not stopName — CarrierStop has no name field)"
  - "Dispatch display uses first 8 chars of UUID (no dispatchNumber field on CarrierDispatch)"
  - "Documents tab is lazy-fetched (on tab activation), contract documents fetch on mount"
  - "Signed URL endpoint extended to handle contract/client/expense parentType (was bug)"
metrics:
  duration: ~20 minutes
  completed: 2026-04-21
  tasks_completed: 2
  files_created: 2
  files_modified: 3
---

# Phase quick Plan 275: Add Documents Tab to Client Detail Page Summary

**One-liner:** Documents tab on client detail + documents section on contract detail, both backed by new tenant-isolated API endpoints with on-demand signed URL generation.

## Tasks Completed

| Task | Description | Commit | Files |
|------|-------------|--------|-------|
| 1 | Create client + contract document API endpoints | 40fb8bb | route.ts (x2), signed-url/route.ts |
| 2 | Add Documents tab to ClientDetail, Documents section to ContractDetail | 6d19cb6 | ClientDetail.tsx, ContractDetail.tsx |

## What Was Built

**Two new API endpoints:**
- `GET /api/v1/carrier/clients/[id]/documents` — verifies client belongs to org, queries `CarrierDocument` by `clientId`, returns document array with uploader name, stop/load/dispatch context, no pre-generated signed URLs
- `GET /api/v1/carrier/contracts/[id]/documents` — same pattern but verifies contract and queries by `contractId`

**ClientDetail.tsx:**
- Added `'documents'` to the `Tab` union type (now 5 tabs: Overview, Contracts, Loads, Financials, Documents)
- Documents tab fetches lazily on activation via `useEffect`
- Skeleton loading, descriptive empty state, responsive table with Type/Filename/Linked To/Uploaded By/Date/Actions columns
- View button (ExternalLink icon) and Download button generate fresh signed URLs on click

**ContractDetail.tsx:**
- Added `documents` state, fetches on mount (not lazy — always visible at bottom of page)
- Documents section below Loads Summary with same table layout and View/Download actions
- Added `useEffect` import alongside existing `useState`

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed signed-url endpoint missing contract/client/expense parentType handlers**
- **Found during:** Task 1 (code review of existing signed-url endpoint)
- **Issue:** The signed-url endpoint only handled `stop`, `load`, and `dispatch` parentTypes. Documents uploaded directly under a contract (`parentType === 'contract'`) would fail the tenant isolation check and return 403, making View/Download broken for any document uploaded via the contract upload flow
- **Fix:** Added `contract`, `client`, and `expense` cases to the parentType switch in the signed-url endpoint
- **Files modified:** `apps/web/src/app/api/v1/carrier/documents/[id]/signed-url/route.ts`
- **Commit:** 40fb8bb

**2. [Rule 2 - Schema deviation] CarrierStop has no stopName field**
- **Found during:** Task 1 (schema verification)
- **Issue:** Plan specified `stop: { select: { id: true, stopName: true } }` but `CarrierStop` has no `stopName` field — stops are identified by `stopType` + `sequenceOrder`
- **Fix:** Changed include to `{ id: true, stopType: true, sequenceOrder: true }` and display as "Stop N (type)" format
- **Files modified:** Both route.ts files

**3. [Rule 2 - Schema deviation] CarrierDispatch has no dispatchNumber field**
- **Found during:** Task 1 (schema verification)
- **Issue:** Plan specified `dispatch: { select: { id: true, dispatchNumber: true } }` but no such field exists
- **Fix:** Changed to `{ id: true }` and display first 8 chars of UUID as `dispatchShortId`
- **Files modified:** Both route.ts files, both UI files

## Self-Check

**Files created:**
- `apps/web/src/app/api/v1/carrier/clients/[id]/documents/route.ts` — FOUND
- `apps/web/src/app/api/v1/carrier/contracts/[id]/documents/route.ts` — FOUND

**Commits:**
- `40fb8bb` — FOUND
- `6d19cb6` — FOUND

**TypeScript:** `npx tsc --noEmit` — PASSED (no errors)
**Build:** `npm run build` — PASSED (exit code 0)

## Self-Check: PASSED
