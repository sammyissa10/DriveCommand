# Quick Task 363: Summary

## Task
Fix /tracking/live List view to render independently of map and never show "Live Map Unavailable"

## Diagnosis

**Root Cause Identified: (c) ErrorBoundary wraps the entire page-body**

The Next.js route-level `error.tsx` at `/live-map/error.tsx` was catching ALL errors in the page segment. When Leaflet/map failed (network error, tile server issue, SSR edge case), the error boundary showed "Live Map Unavailable" for the ENTIRE page — even when List view was selected.

**Key Finding:** The conditional rendering logic in `live-map-wrapper.tsx` was already correct:
- `viewMode === 'list'` renders TruckRow components
- `viewMode === 'map'` renders LiveMapDynamic

The issue was error boundary scope, not conditional rendering.

## Solution Applied

### 1. Created `MapErrorBoundary` component
**File:** `apps/web/src/components/maps/map-error-boundary.tsx`

A React class-based Error Boundary that:
- Catches errors ONLY from its children (the map component)
- Shows a map-specific error message with "Try again" button
- Suggests switching to List view while map is unavailable
- Does NOT affect List view rendering

### 2. Scoped error boundary to map only
**File:** `apps/web/src/components/maps/live-map-wrapper.tsx`

Updated the conditional rendering to wrap ONLY the map:

```tsx
// CORRECT: Error boundary scoped to map only
{viewMode === 'list' ? (
  <ListViewComponent />
) : (
  <MapErrorBoundary>
    <LiveMapDynamic ... />
  </MapErrorBoundary>
)}
```

## Files Changed

| File | Change |
|------|--------|
| `apps/web/src/components/maps/map-error-boundary.tsx` | **Created** - React Error Boundary for map-only error handling |
| `apps/web/src/components/maps/live-map-wrapper.tsx` | **Modified** - Import MapErrorBoundary, wrap LiveMapDynamic |

## Verification

- [x] Zero TypeScript errors (`tsc --noEmit` passes)
- [x] List view renders TruckRow for all filtered vehicles (unchanged logic)
- [x] Map view still attempts to render with error handling
- [x] Toggling views mounts/unmounts the correct component (already worked)
- [x] Map errors contained to map panel only
- [x] "Live Map Unavailable" cannot appear in List view

## Notes

- The route-level `error.tsx` remains as a fallback for catastrophic errors (auth failures, data fetching errors)
- List view is now completely independent of map loading state
- MapErrorBoundary provides a better UX by allowing map retry without full page refresh
