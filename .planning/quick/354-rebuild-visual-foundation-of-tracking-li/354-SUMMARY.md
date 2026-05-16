---
phase: quick-354
plan: 01
subsystem: tracking-ui
tags: [ui, kpis, filters, maps, visualization]
dependency_graph:
  requires: [live-map-wrapper, live-map, vehicle-status]
  provides: [business-kpis, status-filters, view-toggle, desaturated-maps]
  affects: [tracking-dashboard, fleet-monitoring]
tech_stack:
  added: [MapTiler, Stadia Maps, framer-motion animations]
  patterns: [pure functions, semantic colors, keyboard accessibility]
key_files:
  created:
    - apps/web/src/lib/tracking/deriveKpis.ts
    - apps/web/src/lib/tracking/deriveStatusCounts.ts
    - apps/web/src/components/tracking/KpiCard.tsx
    - apps/web/src/components/tracking/KpiStrip.tsx
    - apps/web/src/components/tracking/FilterChips.tsx
    - apps/web/src/components/tracking/ViewToggle.tsx
    - apps/web/src/components/tracking/MapStyleConfig.ts
  modified:
    - apps/web/src/components/maps/live-map-wrapper.tsx
    - apps/web/src/components/maps/live-map.tsx
decisions:
  - title: Pure derivation functions for testability
    rationale: Separated KPI logic from UI to enable unit testing and predictable behavior
  - title: MapTiler Dataviz Light as primary tile layer
    rationale: Desaturated professional aesthetic improves visual hierarchy for vehicle markers
  - title: Semantic color on value text only (not card backgrounds)
    rationale: Maintains visual restraint while still communicating status clearly
metrics:
  duration_minutes: 25
  completed_date: 2026-05-16
  tasks_completed: 1
  files_created: 7
  files_modified: 2
---

# Quick Task 354: Rebuild Visual Foundation of Tracking Live

**One-liner:** Business-focused KPIs with status filters, map/list toggle, and desaturated tile layers transform telemetry dashboard into senior-grade logistics command center

## Objective

Replace telemetry-focused KPI dashboard with business metrics (Active Loads, Revenue In-Transit, On-Time Rate, Exceptions), add status filter chips with live counts, implement Map/List view toggle with animations, and deploy desaturated map tiles for better visual hierarchy.

## What Was Built

### Pure Functions

1. **`deriveKpis.ts`** — Pure function calculating business KPIs from vehicles and loads
   - Active Loads (EN_ROUTE, PICKED_UP, DISPATCHED statuses)
   - Revenue In-Transit (sum of active load rates)
   - On-Time Rate (percentage of delivered loads meeting expected date, or 95% placeholder)
   - Exceptions Count (delayed loads + offline vehicles with dispatch)
   - Returns `BusinessKPIs` interface with all 5 fields

2. **`deriveStatusCounts.ts`** — Pure function returning counts per `VehicleStatus` plus 'all'

### KPI Components

3. **`KpiCard.tsx`** — Individual KPI card component (67 lines, under 80 limit)
   - Props: label, value, delta, variant, indicator
   - Semantic color on value text only (success/warning/danger/neutral)
   - Red dot indicator for exceptions
   - Framer-motion opacity+y animation
   - Keyboard accessible with focus ring

4. **`KpiStrip.tsx`** — 4-card business KPI strip
   - Active Loads with delta vs yesterday (placeholder)
   - Revenue In-Transit formatted as $XXX,XXX or $X.XM
   - On-Time Rate with semantic coloring (green ≥95, amber 85-94, red <85)
   - Exceptions with red dot when > 0

### Filter and View Components

5. **`FilterChips.tsx`** — Status filter chips with live counts
   - 5 chips: All, In Transit, At Stop, Offline, No GPS
   - Displays count in badge from `deriveStatusCounts()`
   - Active chip filled, others outline style
   - Keyboard accessible with ARIA radio roles

6. **`ViewToggle.tsx`** — Map/List segmented control
   - Map and List options with lucide-react icons
   - Framer-motion animated indicator (layoutId for shared element transition)
   - 180ms cross-fade when switching views
   - Keyboard accessible with ARIA radio roles

### Map Configuration

7. **`MapStyleConfig.ts`** — Tile layer configuration
   - Primary: MapTiler Dataviz Light (requires `NEXT_PUBLIC_MAPTILER_KEY`)
   - Fallback 1: Stadia Alidade Smooth (free, no key)
   - Fallback 2: OSM with CSS filter (grayscale + desaturation)
   - `getMapTileConfig()` function returns best available

### Integration

8. **Updated `live-map-wrapper.tsx`**
   - Added `viewMode: 'map' | 'list'` state
   - Added `activeStatusFilter: VehicleStatusKey` state
   - Integrated `KpiStrip` at top of Live tab
   - Added filter bar with `FilterChips` and `ViewToggle`
   - `AnimatePresence` cross-fade between Map and List views
   - Removed VehicleFilterBar (status filtering now in FilterChips)

9. **Updated `live-map.tsx`**
   - Imported `getMapTileConfig()` and `MAP_CSS_FILTER`
   - TileLayer uses dynamic config based on env vars
   - CSS filter applied via `.desaturated-tiles` class

## Key Decisions

### 1. Pure Functions for KPI Derivation
**Decision:** Extract KPI logic into pure functions
**Rationale:** Enables unit testing, predictable behavior, and reusability

### 2. Semantic Color on Value Text Only
**Decision:** Apply status colors to value text, not card backgrounds
**Rationale:** Maintains visual restraint while communicating status clearly

### 3. MapTiler Dataviz Light as Primary
**Decision:** Use MapTiler Dataviz Light with fallback chain
**Rationale:** Desaturated professional aesthetic improves visual hierarchy

### 4. Status Filter Replaces VehicleFilterBar
**Decision:** Move status filtering to top-level toolbar
**Rationale:** Filter affects both map and list views; toolbar makes it accessible in both modes

## Verification Results

### TypeScript Compilation
```bash
npx tsc --noEmit -p apps/web/tsconfig.json
```
**Result:** ✅ Passes with no errors

### Line Count Verification
```bash
wc -l apps/web/src/components/tracking/KpiCard.tsx
```
**Result:** ✅ 67 lines (under 80 line requirement)

## Environment Variables

For production, set:
- `NEXT_PUBLIC_MAPTILER_KEY` — MapTiler API key for Dataviz Light tiles

Without this key, the map will fall back to Stadia Alidade Smooth (free) or OSM with CSS desaturation.

## Commits

| Hash     | Message                                                                 |
|----------|-------------------------------------------------------------------------|
| 095b0b45 | feat(quick-354): rebuild visual foundation of /tracking/live |

## Duration

**Total time:** ~25 minutes
**Date:** 2026-05-16
