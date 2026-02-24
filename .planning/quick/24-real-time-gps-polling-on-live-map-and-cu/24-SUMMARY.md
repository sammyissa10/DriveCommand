---
phase: quick-24
plan: 01
subsystem: maps/tracking
tags: [gps, polling, real-time, live-map, tracking, visibility-api]
dependency_graph:
  requires:
    - src/app/(owner)/live-map/actions.ts (getLatestVehicleLocations)
    - src/app/api/track/[token]/route.ts (existing public tracking API)
    - src/components/tracking/tracking-map-wrapper.tsx
  provides:
    - GET /api/gps/locations (authenticated fleet GPS polling)
    - LiveMapWrapper polling logic (30s interval + visibility-aware)
    - TrackingPoller component (public tracking page polling)
  affects:
    - src/components/maps/live-map.tsx (removed router.refresh polling)
    - src/app/(owner)/live-map/page.tsx (passes tagId to wrapper)
    - src/app/track/[token]/page.tsx (delegates to TrackingPoller)
tech_stack:
  added: []
  patterns:
    - setInterval + document.visibilityState for visibility-aware polling
    - visibilitychange event listener for immediate catch-up fetch
    - useRef for stable closure references to mutable values (tagId)
    - Server component initial fetch + client component polling pattern
key_files:
  created:
    - src/app/api/gps/locations/route.ts
    - src/components/tracking/tracking-poller.tsx
  modified:
    - src/components/maps/live-map-wrapper.tsx
    - src/components/maps/live-map.tsx
    - src/app/(owner)/live-map/page.tsx
    - src/app/track/[token]/page.tsx
decisions:
  - Skip fetch inside setInterval when document.visibilityState === 'hidden' (not pause/resume interval)
  - Add visibilitychange listener for immediate catch-up on tab focus
  - useRef for tagId in wrapper closure (avoids stale closure without adding tagId to interval deps)
  - Reuse existing GET /api/track/[token] for tracking page polling (no new endpoint needed)
  - Server component keeps initial data fetch (SEO + fast first paint); TrackingPoller handles live updates
  - secondsAgo counter driven by 1s timer reset on lastUpdated state change
metrics:
  duration: 256s
  completed: "2026-02-24"
  tasks: 2
  files_affected: 6
---

# Phase quick-24 Plan 01: Real-Time GPS Polling Summary

**One-liner:** 30-second client-side GPS polling on live map and customer tracking with visibility-aware pause/resume and "Updated Xs ago" indicator.

## What Was Built

Both the fleet live map and the public customer tracking page were static on first render, requiring manual refresh to see updated truck positions. This task wired up client-side polling on both pages:

1. **GET /api/gps/locations** — new authenticated endpoint (OWNER/MANAGER) that delegates to the existing `getLatestVehicleLocations()` server action. Accepts optional `tagId` query param for tag filtering.

2. **LiveMapWrapper** — rewritten with `useEffect` + `setInterval` at 30s. Checks `document.visibilityState` before each fetch and skips when hidden. Adds a `visibilitychange` listener to immediately fetch when the tab becomes visible again. Renders "Last updated Xs ago" below the map via a 1s counter that resets on each successful poll. Uses `useRef` to hold `tagId` in a stable reference for the polling closure.

3. **LiveMap** — removed the `router.refresh()` polling `useEffect` and `useRouter` import. The existing `useEffect(() => setVehicles(initialVehicles), [initialVehicles])` sync is retained — this is how polled data flows from the wrapper into the map without remounting `MapContainer`.

4. **TrackingPoller** — new `'use client'` component that owns all the live-updating UI for the customer tracking page: status badge, 4-step stepper, shipment details card, live map via `TrackingMapWrapper`, and "Updated Xs ago" indicator. Polls `GET /api/track/${token}` every 30s with the same visibility-aware pattern.

5. **Tracking page** — simplified to a thin server component that fetches `initialData` from Prisma (for SEO/fast first paint) and renders `<TrackingPoller token={token} initialData={initialData} />`. Header and footer stay in the server component.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | GPS locations API + live map polling | 7b3dc78 | api/gps/locations/route.ts, live-map-wrapper.tsx, live-map.tsx, live-map/page.tsx |
| 2 | TrackingPoller + simplified tracking page | 8b8be7c | tracking-poller.tsx, track/[token]/page.tsx |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `src/app/api/gps/locations/route.ts` — FOUND
- `src/components/maps/live-map-wrapper.tsx` — FOUND (rewritten)
- `src/components/maps/live-map.tsx` — FOUND (router.refresh removed)
- `src/components/tracking/tracking-poller.tsx` — FOUND
- `src/app/track/[token]/page.tsx` — FOUND (simplified)
- Commit 7b3dc78 — FOUND
- Commit 8b8be7c — FOUND
- `npx tsc --noEmit` — PASSED (no errors)
