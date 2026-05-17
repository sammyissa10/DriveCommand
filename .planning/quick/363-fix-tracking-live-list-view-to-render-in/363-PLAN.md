# Quick Task 363: Fix /tracking/live List view to render independently of map

## Diagnosis

**Root Cause: (c) ErrorBoundary wraps the entire page-body and swallows List view with the map's error message**

The Next.js route-level `error.tsx` at `/live-map/error.tsx` catches ANY error in the page segment, including Leaflet failures. When the map throws (network error, tile server issue, SSR edge case), the error boundary renders "Live Map Unavailable" for the entire page — even if the user selected List view.

**Current State:**
- The conditional rendering in `live-map-wrapper.tsx` (lines 281-330) IS correct
- `viewMode === 'list'` properly renders TruckRow components
- `viewMode === 'map'` properly renders LiveMapDynamic
- BUT: Route-level error.tsx catches errors from the entire page

**Evidence:**
- `error.tsx` at line 15: `<h1>Live Map Unavailable</h1>`
- This is a Next.js error boundary file (route segment error boundary)
- Catches errors from children including LiveMapWrapper → LiveMapDynamic

## Solution

Scope the error boundary to ONLY wrap the map component:

1. **Create a client-side MapErrorBoundary component** that wraps only the `LiveMapDynamic` component
2. **Keep the route-level error.tsx** as a fallback for truly catastrophic errors
3. **Update live-map-wrapper.tsx** to wrap only the map view with the error boundary

This ensures:
- List view always renders independently, even if map fails
- Map errors show a localized "Map unavailable" message only in the map panel
- Route-level error.tsx only triggers for data fetching or auth errors

## Tasks

### Task 1: Create MapErrorBoundary component
**File:** `apps/web/src/components/maps/map-error-boundary.tsx`

Create a React Error Boundary class component that:
- Catches errors ONLY from its children (the map)
- Shows a map-specific error message
- Provides a "Try again" reset button
- Does NOT affect List view

### Task 2: Update live-map-wrapper.tsx to scope error boundary
**File:** `apps/web/src/components/maps/live-map-wrapper.tsx`

Wrap ONLY the `<LiveMapDynamic>` component with `<MapErrorBoundary>`:
- DO: `{viewMode === 'list' ? <TruckList /> : <MapErrorBoundary><LiveMapDynamic /></MapErrorBoundary>}`
- DON'T: `<MapErrorBoundary>{viewMode === 'list' ? <TruckList /> : <LiveMapDynamic />}</MapErrorBoundary>`

## Verification
- [ ] Zero TypeScript errors
- [ ] List view renders TruckRow for all filtered vehicles
- [ ] Map view still attempts to render (working or not)
- [ ] Toggling views mounts/unmounts the correct component
- [ ] Deliberately throwing inside LiveMap does not affect List view
- [ ] "Live Map Unavailable" never appears in List view
