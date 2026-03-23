---
phase: 31-driver-core-screens
plan: 02
subsystem: ui
tags: [react-native, expo, tanstack-query, nativewind, driver-portal, mobile, api-client]

requires:
  - phase: 31-driver-core-screens
    plan: 01
    provides: GET /api/mobile/driver/dashboard endpoint returning activeLoad, stopsCompleted, hosHoursRemaining, todayMiles, recentAlerts
  - phase: 30-mobile-auth-navigation
    provides: AuthContext with token, useAuthContext hook, ScreenWrapper/Card/Badge/EmptyState shared UI components

provides:
  - driverApi object in @drivecommand/api-client with getDashboard, getLoads, getLoad, updateLoadStatus
  - DashboardData, LoadSummary, LoadDetail TypeScript interfaces in api-client
  - TanStack Query QueryClientProvider wrapping app root with staleTime 30s, retry 2
  - apps/mobile/app/(driver)/index.tsx — fully functional driver dashboard screen
  - apps/mobile/components/driver/StatChip.tsx — stat chip component for numeric metrics

affects: [31-driver-core-screens plan 03 (loads list + load detail), 32-owner-portal, all future mobile screens using TanStack Query]

tech-stack:
  added:
    - "@tanstack/react-query ^5.95.0 — data fetching, caching, background refetch"
  patterns:
    - "api-client driverApi pattern: thin wrappers over apiRequest with typed return generics"
    - "QueryProvider at root level — single QueryClient instance, staleTime 30s prevents redundant refetches, retry 2 for transient failures"
    - "useQuery with queryKey per resource type — ['driver-dashboard'] for dashboard, will be ['driver-loads', status] for loads"
    - "Pull-to-refresh via RefreshControl tied to isRefetching + refetch() — standard mobile data refresh UX"
    - "DB enum → mobile label mapping at display layer (DISPATCHED=Accepted, IN_TRANSIT=En Route) — consistent with API status translation pattern from plan 31-01"

key-files:
  created:
    - packages/api-client/src/driver.ts
    - apps/mobile/context/QueryProvider.tsx
    - apps/mobile/components/driver/StatChip.tsx
  modified:
    - packages/api-client/src/index.ts
    - packages/api-client/src/client.ts
    - packages/api-client/tsconfig.json
    - apps/mobile/app/_layout.tsx
    - apps/mobile/app/(driver)/index.tsx
    - apps/mobile/package.json

key-decisions:
  - "apiRequest exported from client.ts so driver.ts and future api modules reuse the same fetch wrapper without duplicating auth/error handling"
  - "api-client tsconfig.json requires noEmit:false — root tsconfig extends expo/tsconfig.base which sets noEmit:true, causing tsc to not emit dist files without this override"
  - "QueryProvider wraps above AuthProvider in root layout — QueryClient must be available before auth queries run"
  - "Navigation to loads tab uses router.push with 'as any' cast — Expo Router typed routes don't include route group paths in their union type, matching existing pattern in app/index.tsx"

patterns-established:
  - "driverApi pattern: all driver screen queries go through driverApi in @drivecommand/api-client — screens never call fetch directly"
  - "Dashboard structure: active load card (most prominent) → stats row → recent alerts — establishes visual hierarchy for driver home screen"
  - "StatChip: reusable numeric stat display component, flex-1 in row for equal-width distribution"

duration: 5min
completed: 2026-03-23
---

# Phase 31 Plan 02: API Client + Driver Dashboard Summary

**TanStack Query infrastructure + full driver dashboard screen with active load card (prominent), 3 stat chips, and recent alerts — connected to live REST API via driverApi in @drivecommand/api-client**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-23T03:55:52Z
- **Completed:** 2026-03-23T04:00:46Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments

- `driverApi` object in api-client with 4 methods (getDashboard, getLoads, getLoad, updateLoadStatus) + typed response interfaces
- `QueryProvider` at root with staleTime 30s / retry 2 — shared infrastructure for all mobile screens going forward
- Driver dashboard screen: active load card with sky-blue accent border (most prominent element), empty state with "View All Loads" CTA, 3 stat chips (Miles Today / Stops Done / HOS Left), recent alerts list with time-ago formatting

## Task Commits

1. **Task 1: Extend api-client with driver endpoints + install TanStack Query** - `2866333` (feat)
2. **Task 2: Build driver dashboard screen** - `b7769ec` (feat)

## Files Created/Modified

- `packages/api-client/src/driver.ts` — driverApi with 4 methods, DashboardData/LoadSummary/LoadDetail interfaces
- `packages/api-client/src/client.ts` — exported apiRequest function for reuse by driver module
- `packages/api-client/src/index.ts` — re-exports driverApi, DashboardData, LoadSummary, LoadDetail
- `packages/api-client/tsconfig.json` — added noEmit:false to override expo base config inheritance
- `apps/mobile/context/QueryProvider.tsx` — QueryClient with staleTime 30s, retry 2; QueryClientProvider wrapper
- `apps/mobile/app/_layout.tsx` — QueryProvider wrapping added around AuthProvider
- `apps/mobile/app/(driver)/index.tsx` — full dashboard screen with TanStack Query, load card, stats, alerts
- `apps/mobile/components/driver/StatChip.tsx` — numeric stat chip component (value + label)
- `apps/mobile/package.json` — @tanstack/react-query ^5.95.0 added

## Decisions Made

- Exported `apiRequest` from `client.ts` so the new `driver.ts` module reuses the same fetch wrapper (auth headers, error handling, 401 logout trigger) without duplication
- Added `"noEmit": false` to `packages/api-client/tsconfig.json` — root tsconfig inherits from `expo/tsconfig.base` which sets `noEmit: true`; without this override, `npm run build` silently succeeded but emitted nothing to `dist/`
- QueryProvider positioned above AuthProvider in root layout — QueryClient must be initialized before any auth-dependent queries can run
- Used `router.push('/(driver)/loads' as any)` — Expo Router typed route union doesn't include route group paths; this matches the pattern already in use in `app/index.tsx` which uses `/(owner)` and `/(driver)` with the same type error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] api-client tsconfig inherited noEmit:true from expo base, blocking dist emission**
- **Found during:** Task 2 (dashboard screen — discovered when TypeScript couldn't find driverApi in dist)
- **Issue:** The api-client package extends root tsconfig which extends `expo/tsconfig.base`. That base config has `"noEmit": true`. Build ran successfully but wrote no files to dist/, causing the mobile app to read stale dist without driverApi
- **Fix:** Added `"noEmit": false` to `packages/api-client/tsconfig.json` compilerOptions to override the inherited setting
- **Files modified:** packages/api-client/tsconfig.json
- **Verification:** After fix, `npm run build` generated driver.js, driver.d.ts, and updated index.d.ts in dist/; TypeScript errors for driverApi resolved
- **Committed in:** b7769ec (Task 2 commit)

**2. [Rule 3 - Blocking] apiRequest not exported — driver.ts couldn't reuse it**
- **Found during:** Task 1 (creating driver.ts)
- **Issue:** `apiRequest` was an internal function in client.ts not exported; driver.ts needed it to make HTTP calls with auth headers
- **Fix:** Changed `async function apiRequest` to `export async function apiRequest` in client.ts; updated index.ts to re-export it
- **Files modified:** packages/api-client/src/client.ts, packages/api-client/src/index.ts
- **Verification:** TypeScript compiles clean; driver.ts correctly imports and uses apiRequest
- **Committed in:** 2866333 (Task 1 commit)

---

**Total deviations:** 2 auto-fixed (2 blocking issues)
**Impact on plan:** Both fixes necessary for the plan to work. No scope creep.

## Issues Encountered

- Pre-existing TypeScript errors in apps/mobile (app/index.tsx Expo Router typed routes, ExternalLink.tsx, lib/storage.ts MMKV) were present before this plan and not introduced by it. Not fixed as they are out of scope for this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- TanStack Query infrastructure ready for all subsequent mobile screens (plan 31-03: loads list + load detail)
- `driverApi.getLoads()` and `driverApi.getLoad()` ready to use in loads screens — follow the same `useQuery` pattern established here
- Status labels: mobile sends `{ status: "ACCEPTED" | "EN_ROUTE" | "DELIVERED" }` to `driverApi.updateLoadStatus()` — load detail screen (plan 31-03) uses this contract for status transitions

## Self-Check: PASSED

All key files verified present:
- FOUND: packages/api-client/src/driver.ts
- FOUND: apps/mobile/context/QueryProvider.tsx
- FOUND: apps/mobile/app/(driver)/index.tsx
- FOUND: apps/mobile/components/driver/StatChip.tsx
- FOUND: .planning/phases/31-driver-core-screens/31-02-SUMMARY.md

All commits verified:
- FOUND: 2866333 feat(31-02): extend api-client with driver endpoints + install TanStack Query
- FOUND: b7769ec feat(31-02): build driver dashboard screen + StatChip component

---
*Phase: 31-driver-core-screens*
*Completed: 2026-03-23*
