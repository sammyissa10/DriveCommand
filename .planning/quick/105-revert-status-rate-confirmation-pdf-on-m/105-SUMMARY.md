---
phase: quick-105
plan: 01
subsystem: mobile-driver
tags: [mobile, driver, loads, pdf, offline-queue, status]
dependency_graph:
  requires:
    - apps/web/src/lib/auth/mobile-auth
    - apps/web/src/lib/db/prisma
    - apps/web/src/lib/pdf/rate-confirmation
    - packages/api-client
  provides:
    - PATCH /api/mobile/driver/loads/[id]/revert
    - GET /api/mobile/driver/loads/[id]/rate-confirmation
    - driverApi.revertLoadStatus
    - driverApi.getRateConfirmation
  affects:
    - apps/mobile/components/driver/StatusUpdateButton.tsx
    - apps/mobile/app/(driver)/loads/[id].tsx
tech_stack:
  added:
    - expo-sharing ~55.0.14
  patterns:
    - prisma.$transaction with bypass_rls (existing auth pattern)
    - callOrQueue for offline mutation support
    - React.createElement instead of JSX in .ts API routes
    - expo-file-system/legacy for documentDirectory + EncodingType
key_files:
  created:
    - apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts
    - apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts
  modified:
    - packages/api-client/src/driver.ts
    - packages/api-client/src/index.ts
    - apps/mobile/lib/offline-queue.ts
    - apps/mobile/components/driver/StatusUpdateButton.tsx
    - apps/mobile/app/(driver)/loads/[id].tsx
    - apps/mobile/package.json
decisions:
  - "Used expo-file-system/legacy (not new class API) for documentDirectory and EncodingType — SDK 55 split legacy API into a subpath"
  - "Used React.createElement instead of JSX in .ts API route to avoid needing .tsx extension"
  - "DISPATCHED->PENDING revert blocked by design — driver cannot self-revert to Pending (owner-only action)"
metrics:
  duration: 9m
  completed: "2026-03-25"
  tasks_completed: 2
  files_changed: 8
---

# Quick Task 105: Revert Status and Rate Confirmation PDF on Mobile

**One-liner:** Revert status (PICKED_UP/IN_TRANSIT only) and rate confirmation PDF download via base64 API + expo-sharing, with offline queue support.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Create revert and rate-confirmation API routes + api-client methods | bcde434 | revert/route.ts, rate-confirmation/route.ts, driver.ts, offline-queue.ts |
| 2 | Add Revert button to StatusUpdateButton and Rate Confirmation button to load detail | 0395380 | StatusUpdateButton.tsx, loads/[id].tsx, package.json |

## What Was Built

### Revert Status (PATCH /api/mobile/driver/loads/[id]/revert)

- Drivers can revert PICKED_UP back to DISPATCHED ("Accepted")
- Drivers can revert IN_TRANSIT back to PICKED_UP
- DISPATCHED -> PENDING is intentionally blocked (returns 400 "Contact dispatch")
- No request body needed — previous status is deterministic
- Same auth pattern as status/route.ts (validateMobileToken + prisma.$transaction + bypass_rls)

### Rate Confirmation PDF (GET /api/mobile/driver/loads/[id]/rate-confirmation)

- Available for DISPATCHED, PICKED_UP, IN_TRANSIT, DELIVERED statuses
- Replicates generateRateConfirmationPDF logic from owner action
- Uses @react-pdf/renderer's renderToBuffer server-side
- Returns { pdf: base64, filename: "RateConfirmation-{loadNumber}.pdf" }
- Mobile writes to FileSystem.documentDirectory and opens system share sheet

### Mobile UI Changes

**StatusUpdateButton.tsx:**
- Added `getRevertAction()` helper — returns label for eligible statuses
- Added `handleRevert()` using `callOrQueue('REVERT_LOAD_STATUS', ...)` for offline support
- Secondary amber button appears below the primary action button for PICKED_UP/IN_TRANSIT loads
- Second confirmation modal with amber styling and warning text

**loads/[id].tsx:**
- Added Rate Confirmation PDF button inside the Route Info card
- Appears for DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED
- Shows ActivityIndicator while downloading
- Uses expo-file-system/legacy + expo-sharing to write and share PDF

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed non-existent configureApiClient export in api-client index.ts**
- **Found during:** Task 2 (needed to build api-client dist for TypeScript resolution)
- **Issue:** `packages/api-client/src/index.ts` exported `configureApiClient` from `./client`, but that function was never defined in `client.ts`. This prevented `npm run build` from succeeding.
- **Fix:** Removed `configureApiClient` from the export line in index.ts. Verified it's not used anywhere in the mobile app.
- **Files modified:** packages/api-client/src/index.ts
- **Commit:** 0395380

**2. [Rule 1 - Bug] Used expo-file-system/legacy subpath import**
- **Found during:** Task 2 (TypeScript errors on documentDirectory and EncodingType)
- **Issue:** SDK 55 split the legacy FileSystem API into `expo-file-system/legacy`. The main `expo-file-system` no longer exports `documentDirectory` or `EncodingType` directly.
- **Fix:** Changed import from `expo-file-system` to `expo-file-system/legacy`.
- **Files modified:** apps/mobile/app/(driver)/loads/[id].tsx
- **Commit:** 0395380

**3. [Rule 3 - Blocking] Used React.createElement instead of JSX in API route**
- **Found during:** Task 1 TypeScript check
- **Issue:** JSX syntax `<RateConfirmationDocument ... />` caused TS1005 errors in a `.ts` file. No `.tsx` API routes exist in the project.
- **Fix:** Changed to `React.createElement(RateConfirmationDocument, { data })` with `as any` cast (same pattern as existing owner action).
- **Files modified:** apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts
- **Commit:** bcde434

## Self-Check: PASSED

Files verified to exist:
- apps/web/src/app/api/mobile/driver/loads/[id]/revert/route.ts — FOUND
- apps/web/src/app/api/mobile/driver/loads/[id]/rate-confirmation/route.ts — FOUND
- apps/mobile/components/driver/StatusUpdateButton.tsx — FOUND (contains revertAction, handleRevert)
- apps/mobile/app/(driver)/loads/[id].tsx — FOUND (contains handleRateConfirmation, canViewRateConfirmation)

Commits verified:
- bcde434 — Task 1 (API routes + api-client)
- 0395380 — Task 2 (mobile UI)
