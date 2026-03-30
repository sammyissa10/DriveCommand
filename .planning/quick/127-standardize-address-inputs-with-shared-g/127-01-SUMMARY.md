---
phase: quick-127-standardize-address-inputs
plan: 01
subsystem: api, ui
tags: [geocoding, nominatim, proxy, address-autocomplete, route-form, prisma]

# Dependency graph
requires:
  - phase: packages/types
    provides: shared TypeScript interface package
provides:
  - AddressResult shared type in @drivecommand/types
  - POST /api/geocoding/autocomplete server-side proxy with 60s in-memory cache
  - Web AddressAutocomplete component routes through proxy instead of calling Nominatim directly
  - RouteStop lat/lng fields populated when user selects from autocomplete suggestions
affects: [quick-127-02, mobile-geocoding, route-creation, route-editing]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - Server-side geocoding proxy: all browser geocoding requests go through /api/geocoding/autocomplete, never directly to Nominatim
    - In-memory proxy cache: Map<string, {data, timestamp}> with configurable TTL for deduplication
    - Proxy response mapping: proxy normalizes Nominatim response to AddressResult[], client maps to internal Place shape

key-files:
  created:
    - apps/web/src/app/api/geocoding/autocomplete/route.ts
  modified:
    - packages/types/src/index.ts
    - apps/web/src/components/shared/address-autocomplete.tsx
    - apps/web/src/components/routes/route-form.tsx
    - apps/web/src/app/(owner)/actions/routes.ts

key-decisions:
  - "Proxy uses 60s in-memory Map cache keyed by lowercase-trimmed query to prevent duplicate upstream calls; response also gets Cache-Control: public, max-age=300 for HTTP caching"
  - "AddressResult type kept in packages/types so mobile can reuse it in plan 02; internal Place interface in address-autocomplete.tsx left unchanged to avoid breaking all consumers"
  - "stopCoords stored in a Map<clientId, {lat,lng}> so reordering stops doesn't corrupt coordinates"
  - "Graceful degradation: proxy returns empty array on any upstream error rather than propagating 500"

patterns-established:
  - "Geocoding proxy pattern: POST body {query: string}, returns AddressResult[], zero client-side Nominatim calls"
  - "Stop coordinate flow: onPlaceSelect -> setStopCoords -> hidden input stops_N_lat/lng -> server action parseFloat"

# Metrics
duration: 8min
completed: 2026-03-30
---

# Quick Task 127 Plan 01: Geocoding Proxy + Web Autocomplete Fix Summary

**Server-side Nominatim proxy at /api/geocoding/autocomplete with 60s cache, web AddressAutocomplete switched to proxy, and RouteStop lat/lng coordinates now populated in database**

## Performance

- **Duration:** ~8 min
- **Started:** 2026-03-30T04:50:53Z
- **Completed:** 2026-03-30T04:58:xx Z
- **Tasks:** 2
- **Files modified:** 4 (+ 1 created)

## Accomplishments
- Created `POST /api/geocoding/autocomplete` proxy with 60s in-memory cache and `Cache-Control: public, max-age=300` header
- Eliminated all direct browser-to-Nominatim calls (Nominatim ToS violation) by routing through the server proxy
- Fixed long-standing bug where `RouteStop.lat` / `RouteStop.lng` were always `null` in the database after route creation/editing

## Task Commits

Each task was committed atomically:

1. **Task 1: Shared AddressResult type + geocoding proxy endpoint** - `01b953b` (feat)
2. **Task 2: Update web AddressAutocomplete to use proxy + fix RouteStop coordinates** - `a3fefa8` (feat)

## Files Created/Modified
- `packages/types/src/index.ts` - Added `AddressResult` interface (formatted_address, latitude, longitude, place_id)
- `apps/web/src/app/api/geocoding/autocomplete/route.ts` - New: POST handler, Nominatim proxy, 60s in-memory cache, graceful degradation
- `apps/web/src/components/shared/address-autocomplete.tsx` - Replaced direct Nominatim fetch with POST to /api/geocoding/autocomplete; internal Place interface and haversineDistanceMiles export unchanged
- `apps/web/src/components/routes/route-form.tsx` - Added stopCoords Map state; hidden inputs stops_N_lat/stops_N_lng per stop
- `apps/web/src/app/(owner)/actions/routes.ts` - Both createRoute and updateRoute parse lat/lng from FormData and pass to Prisma create/createMany

## Decisions Made
- Internal `Place` interface in `address-autocomplete.tsx` was left unchanged to avoid breaking all four consumers (route-form x3, load-form x2). The proxy response is mapped at the call site.
- `stopCoords` uses a `Map<clientId, Coords>` rather than an index-based array so stop reordering doesn't corrupt coordinate associations.
- Proxy doesn't require auth — it lives under `/api/` where Next.js middleware protects it for logged-in app users.
- `packages/types` dist folder is gitignored; `npm run build` regenerates it. Only source changes are committed.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Built packages/types before web tsc check**
- **Found during:** Task 1 verification
- **Issue:** `@drivecommand/types` exports from `dist/`, which hadn't been rebuilt after adding `AddressResult`. TypeScript reported "Module has no exported member 'AddressResult'".
- **Fix:** Ran `npm run build` in `packages/types` to regenerate dist before running `tsc --noEmit` on apps/web.
- **Files modified:** None (dist is gitignored, build is a pre-check step)
- **Verification:** `npx tsc --noEmit` in apps/web passed cleanly afterward.
- **Committed in:** Not a separate commit — resolved during Task 1 verification.

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Routine build step needed before type-checking a package that exports from dist. No scope creep.

## Issues Encountered
- None beyond the packages/types build step above.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Proxy endpoint is live and tested; plan 02 can import `AddressResult` from `@drivecommand/types` for mobile
- All existing web consumers (load-form, customer-form, driver-invite-form) work unchanged — only the fetch URL changed
- RouteStop coordinates will populate going forward for any stop selected via autocomplete

## Self-Check: PASSED

- packages/types/src/index.ts: FOUND
- apps/web/src/app/api/geocoding/autocomplete/route.ts: FOUND
- apps/web/src/components/shared/address-autocomplete.tsx: FOUND
- apps/web/src/components/routes/route-form.tsx: FOUND
- apps/web/src/app/(owner)/actions/routes.ts: FOUND
- 127-01-SUMMARY.md: FOUND
- Commit 01b953b: FOUND
- Commit a3fefa8: FOUND

---
*Phase: quick-127-standardize-address-inputs*
*Completed: 2026-03-30*
