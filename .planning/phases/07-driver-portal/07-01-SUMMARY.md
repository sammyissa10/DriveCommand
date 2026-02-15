---
phase: 07-driver-portal
plan: 01
subsystem: driver-portal/server-actions
tags: [security, idor-prevention, driver-scoped-actions, route-access, document-access]
dependency_graph:
  requires:
    - src/lib/auth/server.ts (getCurrentUser, requireRole)
    - src/lib/context/tenant-context.ts (getTenantPrisma, requireTenantId)
    - src/lib/db/repositories/document.repository.ts (DocumentRepository)
    - src/lib/storage/presigned.ts (generateDownloadUrl)
  provides:
    - src/app/(driver)/actions/driver-routes.ts (getMyAssignedRoute)
    - src/app/(driver)/actions/driver-documents.ts (getMyRouteDocuments, getMyTruckDocuments, getDriverDownloadUrl)
  affects: []
tech_stack:
  added:
    - Driver-scoped server action pattern (user-level data filtering on top of tenant RLS)
  patterns:
    - Identity resolution from getCurrentUser() prevents IDOR attacks
    - Double-check ownership via route assignment chain for document access
    - Database-level filtering (WHERE clause) instead of client-side filtering
key_files:
  created:
    - src/app/(driver)/actions/driver-routes.ts
    - src/app/(driver)/actions/driver-documents.ts
  modified: []
decisions:
  - summary: "Driver identity resolved from getCurrentUser() session, never from parameters"
    rationale: "Prevents IDOR attacks where malicious driver could access another driver's routes/documents by manipulating URL or request parameters"
    alternatives: "Accept driverId as parameter (REJECTED: trivial IDOR vulnerability)"
  - summary: "Document ownership verified through route assignment chain"
    rationale: "Driver can only download documents for their assigned route or truck, enforced via database queries that join through the route table"
    alternatives: "Direct document access check (REJECTED: doesn't verify current assignment)"
  - summary: "Empty array return instead of error when no active route"
    rationale: "Driver with no active assignment is valid state, not an error — better UX to show empty state"
    alternatives: "Throw error (REJECTED: valid application state should not error)"
metrics:
  duration: "114s"
  tasks_completed: 2
  files_created: 2
  commits: 2
  completed_date: "2026-02-14"
---

# Phase 07 Plan 01: Driver-Scoped Server Actions Summary

**One-liner:** IDOR-proof driver server actions enforce user-level filtering (driverId = user.id) on routes and documents via getCurrentUser() session resolution.

## What Was Built

Created two server action files that provide driver-scoped data access for the driver portal:

1. **driver-routes.ts**: `getMyAssignedRoute()` returns the authenticated driver's active route (PLANNED or IN_PROGRESS) with full truck, driver, and document details
2. **driver-documents.ts**: Three actions for document access:
   - `getMyRouteDocuments()`: Documents for driver's assigned route
   - `getMyTruckDocuments()`: Documents for driver's assigned truck
   - `getDriverDownloadUrl(documentId)`: Presigned download URL with ownership verification

## Security Architecture

**Critical IDOR-Prevention Pattern:**

All server actions follow this security flow:
1. `requireRole([UserRole.DRIVER])` FIRST before any data access
2. `getCurrentUser()` to get database user record (not from URL/params)
3. Database query with `WHERE driverId = user.id` (database-level filtering)
4. For documents: verify ownership through route assignment chain before allowing download

**Why This Matters:**

The existing `(owner)` route and document actions allow DRIVER role but don't filter by driverId — they return all tenant data. A malicious driver could:
- View all routes in the tenant
- Download documents for trucks/routes they're not assigned to

This plan closes that gap by creating driver-specific actions that enforce user-level isolation on top of the existing tenant-level RLS.

## Task Breakdown

### Task 1: Driver-scoped route server action
**Files:** `src/app/(driver)/actions/driver-routes.ts`
**Commit:** `4f3e92e`

Created `getMyAssignedRoute()` server action:
- Enforces DRIVER role check as first operation
- Resolves driver identity via `getCurrentUser()` (never from parameters)
- Filters routes by `driverId = user.id` in database WHERE clause
- Returns active route (PLANNED or IN_PROGRESS status) with truck, driver, and documents
- Returns null if no active assignment (valid state for unassigned driver)

**Security guarantees:**
- No routeId or driverId accepted as input parameter
- Database-level filtering prevents accessing other drivers' routes
- Includes documents inline (driver can see route documents in one query)

### Task 2: Driver-scoped document server actions
**Files:** `src/app/(driver)/actions/driver-documents.ts`
**Commit:** `2616b83`

Created three driver-scoped document actions:

**`getMyRouteDocuments()`:**
- Queries driver's active route first to get route ID
- Uses DocumentRepository to fetch documents for that route
- Returns empty array if no active route (graceful degradation)

**`getMyTruckDocuments()`:**
- Queries driver's active route to get truckId
- Uses DocumentRepository to fetch documents for that truck
- Returns empty array if no active route (graceful degradation)

**`getDriverDownloadUrl(documentId)`:**
- Fetches document via DocumentRepository (tenant RLS isolation)
- Queries driver's active route to get route.id and route.truckId
- Verifies `doc.routeId === route.id OR doc.truckId === route.truckId`
- Verifies s3Key starts with `tenant-${tenantId}/` (defense in depth)
- Generates presigned download URL only if ownership check passes
- Returns error object if document not found or not accessible

**Security guarantees:**
- All actions enforce DRIVER role check first
- All actions resolve driver identity via getCurrentUser()
- Document download verifies ownership through route assignment (can't download documents for unassigned trucks/routes)
- No driverId accepted as parameter in any action

## Deviations from Plan

None - plan executed exactly as written.

## Verification Results

**TypeScript Compilation:** ✓ PASSED (`npx tsc --noEmit`)

**Security Checklist:**
- ✓ Both files use `'use server'` directive
- ✓ All 4 server actions enforce `requireRole([UserRole.DRIVER])` as first operation
- ✓ All 4 server actions call `getCurrentUser()` to resolve user identity
- ✓ All 4 server actions filter by `driverId = user.id` from database user record
- ✓ No server action accepts `driverId` or `routeId` as input parameter
- ✓ Document download verifies ownership through route assignment chain
- ✓ All queries use database-level filtering (WHERE clause), not client-side filtering

**Pattern Validation:**
- ✓ IDOR-proof: Identity resolution from session, never from parameters
- ✓ Double-check ownership for document access (route query + document query)
- ✓ Defense in depth: s3Key tenant prefix verification even after RLS check
- ✓ Graceful degradation: Empty arrays for valid states (no active route)

## Testing Strategy

**Manual Testing (when driver portal UI is built):**
1. Login as driver with active route assignment
2. Verify `getMyAssignedRoute()` returns only that driver's route
3. Verify route documents are included inline
4. Verify `getMyRouteDocuments()` returns only assigned route documents
5. Verify `getMyTruckDocuments()` returns only assigned truck documents
6. Verify `getDriverDownloadUrl()` generates URL for accessible documents
7. Verify `getDriverDownloadUrl()` rejects documentId for other driver's route/truck

**IDOR Attack Testing (when UI is built):**
1. Login as Driver A assigned to Route 1
2. Attempt to access Route 2 (assigned to Driver B) via URL manipulation
3. Verify server actions return null/empty/error (no data leakage)
4. Attempt to download document from Route 2 via API call with document ID
5. Verify `getDriverDownloadUrl()` returns error (ownership check fails)

**Edge Cases Covered:**
- Driver with no active route → Empty arrays (graceful)
- Driver with completed route (status=COMPLETED) → Empty arrays (only PLANNED/IN_PROGRESS)
- Document belongs to truck but not current route → Download rejected (ownership check)
- Document belongs to route the driver had in the past → Download rejected (only active route)

## Next Steps

**Phase 07 Plan 02:** Build driver portal UI that consumes these server actions
- Dashboard showing driver's assigned route
- Truck details and documents (read-only)
- Route documents (read-only)
- Download document functionality

**Future Enhancements (Post-MVP):**
- Driver can update route status (Start Route, Complete Route)
- Driver can add delivery notes to routes
- Driver can upload POD (proof of delivery) documents
- Real-time route status updates via websockets

## Self-Check: PASSED

**Files created:**
```
FOUND: src/app/(driver)/actions/driver-routes.ts
FOUND: src/app/(driver)/actions/driver-documents.ts
```

**Commits exist:**
```
FOUND: 4f3e92e (Task 1 - driver-scoped route action)
FOUND: 2616b83 (Task 2 - driver-scoped document actions)
```

**Pattern verification:**
```
FOUND: 'use server' directive in both files (2 files)
FOUND: requireRole([UserRole.DRIVER]) in 4 server actions (4 occurrences)
FOUND: getCurrentUser() called in all actions (6 total calls)
FOUND: driverId: user.id in WHERE clauses (4 occurrences)
```

All artifacts verified — plan execution complete.
