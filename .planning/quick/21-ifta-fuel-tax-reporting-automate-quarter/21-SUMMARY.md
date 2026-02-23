---
phase: quick-21
plan: 01
subsystem: ifta-reporting
tags: [ifta, tax, gps, fuel, reporting, csv]
dependency_graph:
  requires:
    - GPSLocation model (Prisma)
    - FuelRecord model (Prisma)
    - requireRole / getTenantPrisma patterns
  provides:
    - /ifta page for quarterly IFTA reporting
    - getStateFromCoordinates utility
    - haversineDistance utility
    - getIFTAReport server action
    - generateIFTACSV server action
  affects:
    - src/components/navigation/sidebar.tsx (IFTA link added)
tech_stack:
  added: []
  patterns:
    - bounding-box state detection (approximate, appropriate for IFTA)
    - Haversine distance formula for GPS segment mileage
    - server action with requireRole + withTenantRLS
    - searchParams-based navigation (same as lane-analytics)
    - CSV blob download via URL.createObjectURL
key_files:
  created:
    - src/lib/geo/state-lookup.ts
    - src/app/(owner)/actions/ifta.ts
    - src/app/(owner)/ifta/page.tsx
    - src/components/ifta/ifta-quarter-selector.tsx
    - src/components/ifta/ifta-report-table.tsx
  modified:
    - src/components/navigation/sidebar.tsx
decisions:
  - Bounding-box state detection (not polygon) — intentionally approximate for IFTA, saves complexity and a dependency
  - States ordered by area ascending in bounding box array — smaller states win border overlaps (e.g. DC over VA/MD)
  - generateIFTACSV made async — required by use server directive (all exports in server action files must be async)
  - Native HTML table with Tailwind — consistent with codebase pattern (no shadcn table component in project)
  - GPS segment mileage attributed to starting-ping state — standard IFTA convention
  - Location string fallback for fuel records without lat/lng — extracts 2-letter state code via regex
  - UNKNOWN bucket for unresolvable fuel records — preserves data rather than silently dropping
  - fetchCache = force-no-store — tax data must never be stale cached
metrics:
  duration: 291s
  completed: 2026-02-23
  tasks_completed: 2
  files_created: 5
  files_modified: 1
---

# Phase quick-21: IFTA Fuel Tax Reporting Summary

**One-liner:** Automated IFTA quarterly reports from GPS ping segments (Haversine miles per state) and FuelRecord lat/lng with bounding-box state detection and CSV export.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | State lookup utility and IFTA server action | 43b3772 | src/lib/geo/state-lookup.ts, src/app/(owner)/actions/ifta.ts |
| 2 | IFTA page UI with quarter selector, report table, and CSV download | a06caf8 | src/app/(owner)/ifta/page.tsx, src/components/ifta/*, sidebar.tsx |

## What Was Built

**State Lookup Utility** (`src/lib/geo/state-lookup.ts`):
- `getStateFromCoordinates(lat, lng): string | null` — bounding-box US state detection for all 50 states + DC
- States ordered by area ascending so smaller states win border overlap
- `haversineDistance(lat1, lng1, lat2, lng2): number` — great-circle distance in miles
- `US_STATES: Record<string, string>` — code-to-name map

**IFTA Server Action** (`src/app/(owner)/actions/ifta.ts`):
- `getIFTAReport(quarter, year)` — aggregates GPS mileage per state + fuel gallons per state
- GPS: consecutive pings per truck → Haversine segments → attributed to starting-ping state
- Fuel: lat/lng → getStateFromCoordinates; fallback to location string regex; bucket as UNKNOWN if unresolvable
- `generateIFTACSV(rows, totals, quarter, year)` — CSV with headers + totals row

**IFTA Page** (`/ifta`):
- Server component with requireRole([OWNER, MANAGER])
- Reads quarter/year from searchParams, defaults to current quarter/year
- fetchCache = force-no-store

**Quarter Selector** (`src/components/ifta/ifta-quarter-selector.tsx`):
- Link-based navigation (no client state) — year pills + quarter pills
- Year options: current year and 2 prior years
- Quarter options: Q1 (Jan-Mar) through Q4 (Oct-Dec)

**Report Table** (`src/components/ifta/ifta-report-table.tsx`):
- 3 summary cards: States Operated In, Total Miles Driven, Total Fuel Purchased
- Native HTML table with state code, state name, miles, gallons columns
- Totals row at bottom
- Empty state for quarters with no data
- "Download CSV" button triggering Blob download as `ifta-{year}-q{quarter}.csv`

**Sidebar** — Added IFTA Reports link under Intelligence section with FileSpreadsheet icon.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] `generateIFTACSV` was a non-async export in a `'use server'` file**
- **Found during:** Task 2 build (Turbopack error: "Server Actions must be async functions")
- **Issue:** Next.js enforces that all exports from `'use server'` files must be async functions
- **Fix:** Changed `export function generateIFTACSV` to `export async function generateIFTACSV` and updated page to `await` it
- **Files modified:** src/app/(owner)/actions/ifta.ts, src/app/(owner)/ifta/page.tsx
- **Commit:** a06caf8

**2. [Rule 3 - Missing component] `@/components/ui/table` does not exist in this project**
- **Found during:** Task 2 build (Module not found error)
- **Issue:** Plan referenced shadcn Table components but project only has: button, card, badge, input, select, switch, tabs, sheet, etc. No table component installed.
- **Fix:** Rewrote ifta-report-table.tsx using native HTML `<table>` with Tailwind classes, matching the established codebase pattern used in LaneProfitabilityTable
- **Files modified:** src/components/ifta/ifta-report-table.tsx
- **Commit:** a06caf8

## Self-Check: PASSED

All required artifact files exist:
- FOUND: src/lib/geo/state-lookup.ts
- FOUND: src/app/(owner)/actions/ifta.ts
- FOUND: src/app/(owner)/ifta/page.tsx
- FOUND: src/components/ifta/ifta-report-table.tsx
- FOUND: src/components/ifta/ifta-quarter-selector.tsx

Commits verified:
- FOUND: 43b3772 — feat(quick-21): add state lookup utility and IFTA server action
- FOUND: a06caf8 — feat(quick-21): add IFTA page UI with quarter selector, report table, and CSV download

Build: `npm run build` passes with 0 TypeScript errors. `/ifta` appears in route manifest as dynamic route.
