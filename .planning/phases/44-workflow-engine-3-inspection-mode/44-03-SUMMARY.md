---
phase: 44-workflow-engine-3-inspection-mode
plan: "03"
subsystem: api
tags: [workflow-engine, inspection-mode, mobile-api, r2-presigned-url, bearer-auth]

# Dependency graph
requires:
  - phase: 44-workflow-engine-3-inspection-mode
    plan: "02"
    provides: failInspectionItem service callable from REST context
  - phase: 43-workflow-engine-2-execution
    provides: withMobileAuth wrapper, generateUploadUrl presigned utility
provides:
  - POST /api/mobile/driver/tasks/[id]/fail — DRIVER-authenticated REST endpoint calling failInspectionItem
  - POST /api/mobile/driver/tasks/upload-photo — DRIVER-authenticated presigned R2 URL for inspection fail photos
  - 'inspections' DocumentCategory type added to presigned.ts
affects:
  - 44-04 (InspectionModeScreen — calls these endpoints directly)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "REST wrapper pattern: withMobileAuth + TRPCError status map for service calls"
    - "Inspection photo storage: 'inspections' R2 prefix, same flow as incident photos"

key-files:
  created:
    - apps/web/src/app/api/mobile/driver/tasks/[id]/fail/route.ts
    - apps/web/src/app/api/mobile/driver/tasks/upload-photo/route.ts
  modified:
    - apps/web/src/lib/storage/presigned.ts

key-decisions:
  - "Used withMobileAuth instead of old validateMobileToken pattern to match tasks/complete and tasks/skip conventions"
  - "Added 'inspections' DocumentCategory variant — required for TypeScript safety, uses same R2 bucket with distinct path prefix"

patterns-established:
  - "Mobile task REST endpoint pattern: URL segment extraction, body validation, TRPCError→HTTP status map, withMobileAuth DRIVER gate"

# Metrics
duration: 8min
completed: 2026-04-24
---

# Phase 44 Plan 03: Mobile Fail + Upload-Photo Endpoints Summary

**Two DRIVER-authenticated REST endpoints: POST .../tasks/[id]/fail calls failInspectionItem service, POST .../tasks/upload-photo returns presigned R2 URL with 'inspections' prefix for fail-capture photos**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-04-24T18:17:58Z
- **Completed:** 2026-04-24T18:25:00Z
- **Tasks:** 1
- **Files modified:** 3

## Accomplishments
- Created `apps/web/src/app/api/mobile/driver/tasks/[id]/fail/route.ts` — mirrors complete/skip pattern, calls failInspectionItem with photoUrls + optional note, maps TRPCError codes to HTTP status
- Created `apps/web/src/app/api/mobile/driver/tasks/upload-photo/route.ts` — presigned R2 URL endpoint, 'inspections' prefix, JPEG/PNG + 10MB validation, withMobileAuth DRIVER gate
- Extended `DocumentCategory` union in `presigned.ts` with 'inspections' to maintain TypeScript safety

## Task Commits

Each task was committed atomically:

1. **Task 1: POST tasks/[id]/fail + POST tasks/upload-photo** - `5ec6077` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `apps/web/src/app/api/mobile/driver/tasks/[id]/fail/route.ts` - Fail endpoint: Bearer auth, ID extraction from URL, result body validation, failInspectionItem call, TRPCError → HTTP status mapping
- `apps/web/src/app/api/mobile/driver/tasks/upload-photo/route.ts` - Presigned URL endpoint: fileName/contentType/sizeBytes validation, JPEG/PNG + 10MB guard, generateUploadUrl with 'inspections' prefix
- `apps/web/src/lib/storage/presigned.ts` - Added 'inspections' to DocumentCategory union type

## Decisions Made
- Used `withMobileAuth` (not old `validateMobileToken`) to stay consistent with tasks/complete and tasks/skip — all task endpoints share the same auth wrapper
- Added `'inspections'` to `DocumentCategory` rather than bypassing the type — keeps TypeScript strict and future R2 policies can target this prefix specifically

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added 'inspections' to DocumentCategory union in presigned.ts**
- **Found during:** Task 1 (writing upload-photo route)
- **Issue:** `generateUploadUrl` accepts `DocumentCategory` which was `'trucks' | 'routes' | 'drivers' | 'support' | 'messages'` — passing `'inspections'` would cause a TypeScript type error
- **Fix:** Added `'inspections'` to the union type
- **Files modified:** `apps/web/src/lib/storage/presigned.ts`
- **Verification:** `tsc --noEmit` passes (only pre-existing validator.ts error remains)
- **Committed in:** `5ec6077` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (Rule 1 - type correctness)
**Impact on plan:** Required for TypeScript compilation. No scope creep.

## Issues Encountered
- Pre-existing `.next/types/validator.ts` TypeScript error (deleted route `[stopId]/messages`) continues to appear — confirmed pre-existing from 44-01 and 44-02, unrelated to this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Both endpoints are deployed-ready; InspectionModeScreen (Plan 04) can call them directly
- fail endpoint accepts `{ result: { photoUrls: string[], note?: string } }` — exact shape Plan 04 will send
- upload-photo endpoint returns `{ uploadUrl, s3Key }` — Plan 04 uses two-step upload: PUT to uploadUrl then include s3Key in fail body

---
*Phase: 44-workflow-engine-3-inspection-mode*
*Completed: 2026-04-24*
