---
phase: quick-107
plan: "01"
subsystem: gps-tracking
tags: [mobile, auth, gps, driver]
dependency_graph:
  requires:
    - apps/web/src/lib/auth/mobile-auth.ts
    - apps/web/src/lib/auth/session.ts
  provides:
    - Dual-auth GPS report endpoint accepting both Bearer token and cookie session
  affects:
    - apps/web/src/app/api/gps/report/route.ts
tech_stack:
  added: []
  patterns:
    - "Try-mobile-then-fallback auth pattern: validateMobileToken(req) ?? getSession()"
key_files:
  modified:
    - apps/web/src/app/api/gps/report/route.ts
decisions:
  - "Normalize userId/tenantId from either auth source into shared locals — avoids duplicating downstream logic"
  - "validateMobileToken is called first so mobile Bearer header short-circuits getSession() cookie read"
metrics:
  duration_minutes: 5
  completed_date: "2026-03-25"
  tasks_completed: 1
  tasks_total: 1
  files_changed: 1
---

# Quick-107: Fix GPS Report Endpoint to Accept Mobile Bearer Auth

**One-liner:** Dual-auth GPS endpoint using `validateMobileToken(req) ?? getSession()` so mobile Bearer tokens and web cookie sessions both succeed.

## What Was Done

Added mobile Bearer token authentication to `POST /api/gps/report` alongside the existing cookie-based web auth. The mobile driver app was receiving 401 errors because the endpoint only called `getSession()` (cookie-based), which returns null for requests with `Authorization: Bearer <token>`.

## Changes

### `apps/web/src/app/api/gps/report/route.ts`
- Added import: `validateMobileToken` from `@/lib/auth/mobile-auth`
- Replaced single `getSession()` call with dual-auth: `validateMobileToken(req) ?? getSession()`
- Extracted `const { userId, tenantId } = session` after auth resolves — normalizes both `MobileAuthContext` and `SessionData` into the same shape
- Updated all downstream references (`driverId`, `tenantId` on Load/Route queries, GPSLocation create, geofence check) to use the normalized locals
- Auth logic and 401/403 flow unchanged in structure; role check works identically for both auth types

## Auth Flow

```
POST /api/gps/report
  └─ validateMobileToken(req)
       ├─ Bearer header present & valid → MobileAuthContext { userId, tenantId, role }
       └─ null (no header or invalid)
           └─ getSession()
                ├─ Cookie present & valid → SessionData { userId, tenantId, role }
                └─ null → 401 Not authenticated
  └─ role !== 'DRIVER' → 403 Forbidden
  └─ ...GPS write logic (uses normalized userId, tenantId)...
  └─ 201 ok
```

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

- [x] `apps/web/src/app/api/gps/report/route.ts` exists and imports `validateMobileToken`
- [x] Commit `10af065` exists
- [x] TypeScript compiles clean for this file (one pre-existing unrelated error in live-map.tsx)

## Self-Check: PASSED
