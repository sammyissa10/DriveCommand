---
phase: quick-221
plan: "01"
subsystem: maps
tags: [leaflet, react-memo, useMemo, fleet-map, bug-fix]
dependency_graph:
  requires: []
  provides: [stable-vehicle-markers]
  affects: [apps/web/src/components/maps/vehicle-marker.tsx]
tech_stack:
  added: []
  patterns: [React.memo, useMemo for Leaflet divIcon stability]
key_files:
  created: []
  modified:
    - apps/web/src/components/maps/vehicle-marker.tsx
decisions:
  - Remove Leaflet Popup entirely — VehicleDetailsSheet sidebar already shows all vehicle info
  - Memoize divIcon with useMemo to prevent Leaflet from remounting marker DOM every 30s poll
  - Wrap in React.memo to skip re-renders when vehicle data hasn't changed
metrics:
  duration: "5 minutes"
  completed: "2026-04-14"
  tasks_completed: 1
  files_modified: 1
---

# Quick-221: Fix Blinking Marker Tooltip on Live Fleet Map

**One-liner:** Eliminated marker blink loop by removing competing Leaflet Popup and memoizing divIcon to prevent remount on every 30-second poll refresh.

## What Was Fixed

Two bugs caused the blinking behavior on the Live Fleet Map:

**Bug 1 — Popup/sidebar conflict:** The `<Popup>` inside `<Marker>` opened on click at the same time as the `onClick` handler that opens VehicleDetailsSheet. The Popup captured mouse events, triggering mouseout on the marker, creating a rapid open/close blink loop. The Popup was redundant — VehicleDetailsSheet already shows all the same information in greater detail.

**Bug 2 — Icon recreation on every render:** `divIcon()` was called inline in the render function. On every 30-second poll, React re-rendered VehicleMarker with updated vehicle data, producing a new `divIcon` object reference on each render. Leaflet interpreted the new reference as a changed icon and remounted the marker DOM, causing visible flicker.

## Changes Made

**`apps/web/src/components/maps/vehicle-marker.tsx`** — `145bef3`
- Removed `<Popup>` component and its JSX entirely
- Removed `Popup` from the `react-leaflet` import
- Added `useMemo` to memoize `divIcon()` with dependencies on values that actually affect icon output: `latitude`, `longitude`, `heading`, `licensePlate`, `speed`, `timestamp`, `status`, `colors.bg`, `colors.border`
- Removed `popupAnchor` from divIcon options (no longer needed)
- Moved the null guard (skip render when GPS data missing) to AFTER the `useMemo` call to comply with React rules of hooks
- Wrapped the component export in `React.memo` to skip re-renders when vehicle data hasn't changed between polls

## Deviations from Plan

None — plan executed exactly as written.

## Verification

- `npx tsc --noEmit` passes with zero errors in source files (3 pre-existing e2e test errors unrelated to this change)
- Popup removed from render output
- divIcon memoized, stable across poll cycles
- React.memo prevents unnecessary re-renders

## Self-Check: PASSED

- File exists: `apps/web/src/components/maps/vehicle-marker.tsx` — FOUND
- Commit `145bef3` exists — FOUND
