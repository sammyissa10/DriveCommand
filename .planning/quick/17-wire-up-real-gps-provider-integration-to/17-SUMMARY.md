---
phase: quick-17
plan: 01
subsystem: integrations
tags: [samsara, gps, telematics, eld, rest-api, live-map]

# Dependency graph
requires:
  - phase: quick-14
    provides: TenantIntegration model and integrations settings UI framework
provides:
  - Samsara REST API client with vehicle location fetching and VIN-based truck matching
  - POST sync endpoint for cron or manual GPS data pull
  - Settings UI for API token entry, masked display, and Sync Now button
  - saveIntegrationConfig server action for secure credential storage
affects: [live-map, fleet-tracking, cron-jobs]

# Tech tracking
tech-stack:
  added: []
  patterns: [samsara-rest-api-direct-fetch, vin-based-vehicle-matching, dual-auth-endpoint]

key-files:
  created:
    - src/lib/integrations/samsara.ts
    - src/app/api/integrations/samsara/sync/route.ts
  modified:
    - src/app/(owner)/actions/integrations.ts
    - src/app/(owner)/settings/integrations/integrations-manager.tsx
    - src/app/(owner)/settings/integrations/page.tsx

key-decisions:
  - "Direct fetch() for Samsara API — no external SDK needed for simple REST calls"
  - "VIN normalization (trim + uppercase) for reliable vehicle matching across systems"
  - "Dual auth on sync endpoint: CRON_SECRET for automation, OWNER session for manual UI trigger"
  - "saveIntegrationConfig restricted to OWNER role only (not MANAGER) — API keys are sensitive"
  - "configMap passed from server page to client component to display masked existing tokens"

patterns-established:
  - "ELD integration pattern: fetch locations -> match by VIN -> bulk insert GPSLocation"
  - "Dual-auth API endpoint: CRON_SECRET bearer OR session fallback"

# Metrics
duration: 3min
completed: 2026-02-20
---

# Quick-17: Wire Up Real GPS Provider Integration Summary

**Samsara REST API client with VIN-based truck matching, GPS sync endpoint with dual auth, and settings UI for API token management**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-02-20T13:41:00Z
- **Completed:** 2026-02-20T13:44:14Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments
- Samsara API client fetches all vehicle locations with pagination support via plain fetch()
- VIN-based matching connects Samsara vehicles to DriveCommand trucks with bulk GPSLocation insert
- Sync endpoint supports both automated cron (CRON_SECRET) and manual trigger (OWNER session)
- Settings UI allows token entry, masked display with edit button, and manual Sync Now trigger
- Live map automatically displays Samsara data — no changes needed to existing map components

## Task Commits

Each task was committed atomically:

1. **Task 1: Samsara API client and sync endpoint** - `587fe9c` (feat)
2. **Task 2: Settings UI for API token and save config action** - `907bdf5` (feat)

## Files Created/Modified
- `src/lib/integrations/samsara.ts` - Samsara REST API client: fetchSamsaraLocations (with pagination) and syncSamsaraLocations (VIN matching + bulk insert)
- `src/app/api/integrations/samsara/sync/route.ts` - POST endpoint with dual auth (CRON_SECRET or OWNER session), looks up enabled integration, triggers sync
- `src/app/(owner)/actions/integrations.ts` - Added saveIntegrationConfig server action (OWNER-only) with provider-to-category mapping
- `src/app/(owner)/settings/integrations/integrations-manager.tsx` - Samsara card no longer Coming Soon, API token input/masked display, Sync Now button
- `src/app/(owner)/settings/integrations/page.tsx` - Builds configMap from TenantIntegration rows, passes to client component

## Decisions Made
- Direct fetch() for Samsara API — no external SDK needed for simple REST calls
- VIN normalization (trim + uppercase) for reliable vehicle matching across systems
- Dual auth on sync endpoint: CRON_SECRET for automated cron, OWNER session for manual UI trigger
- saveIntegrationConfig restricted to OWNER only (not MANAGER) — API keys are sensitive credentials
- configMap passed from server page to client to display masked existing tokens without re-fetching

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

To use the Samsara integration:
1. Add `CRON_SECRET` environment variable for automated sync (optional, only needed for cron-based sync)
2. Enter Samsara API token in Settings > Integrations > Samsara
3. Ensure truck VINs in DriveCommand match the VINs registered in Samsara

## Next Phase Readiness
- Samsara integration is production-ready for fleet owners with Samsara hardware
- Future: Add cron job to auto-sync on schedule (e.g., every 5 minutes)
- Future: KeepTruckin integration can follow the same pattern (fetch + VIN match + bulk insert)

---
*Quick task: quick-17*
*Completed: 2026-02-20*
