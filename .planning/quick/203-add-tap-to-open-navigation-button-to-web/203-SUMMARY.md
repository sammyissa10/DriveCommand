---
phase: quick-203
plan: "01"
subsystem: web/driver-portal
tags: [navigation, maps, driver-ux, route-stops]
dependency_graph:
  requires: []
  provides: [navigate-button-on-route-stops]
  affects: [driver-route-detail-view]
tech_stack:
  added: []
  patterns: [google-maps-directions-url, lucide-icon, anchor-tag-external]
key_files:
  modified:
    - apps/web/src/components/driver/route-detail-readonly.tsx
decisions:
  - "Used lat/lng Decimal-compatible union type to avoid importing Prisma types into component"
  - "Template literal coerces Decimal.toString() naturally in Google Maps URL"
metrics:
  duration: "5 minutes"
  completed: "2026-04-12"
  tasks_completed: 1
  files_changed: 1
---

# Phase quick-203 Plan 01: Navigate Button on Web Driver Route Stops Summary

One-tap Google Maps navigation from web driver route detail — Navigate buttons on PENDING/ARRIVED stops using lat/lng coordinates with address string fallback.

## What Was Built

Added Navigate buttons to `route-detail-readonly.tsx` for drivers using the web portal on mobile devices. Previously drivers had to manually copy/paste stop addresses into maps. Now they get one-tap navigation identical in behavior to the mobile app.

### Changes

**`apps/web/src/components/driver/route-detail-readonly.tsx`**
- Imported `Navigation` icon from `lucide-react`
- Extended `RouteStop` interface with `lat` and `lng` fields typed as `number | { toString(): string } | null` — compatible with Prisma's `Decimal` type without importing Prisma packages into the component
- Added `buildNavigationUrl(stop)` helper: uses `lat,lng` coordinates when available, falls back to `encodeURIComponent(stop.address)` — produces a `https://www.google.com/maps/dir/?api=1&destination=...` URL
- Active Stop Panel: large Navigate button (`min-h-[48px]`, `text-sm`, `px-4 py-2.5`) placed before the status badge — always shown since activeStop is always non-DEPARTED
- All Stops list: smaller Navigate button (`min-h-[36px]`, `text-xs`, `px-3 py-1.5`) inside each stop's `flex-1 min-w-0` div, conditionally rendered when `stop.status !== 'DEPARTED'`
- Both buttons open in `target="_blank"` with `rel="noopener noreferrer"`

## Verification

- TypeScript compiles cleanly (`npx tsc --noEmit -p apps/web/tsconfig.json` — no errors)
- PENDING and ARRIVED stops show Navigate button; DEPARTED stops do not
- Google Maps URL pattern: `google.com/maps/dir/?api=1&destination=...`
- Active stop button meets 48px touch target minimum
- No other files modified

## Deviations from Plan

**1. [Rule 1 - Bug] Prisma Decimal type incompatibility**
- **Found during:** Task 1 TypeScript verification
- **Issue:** Plan specified `lat: number | null` but Prisma returns `Decimal | null` for the field — caused TS2322 type error in my-route/page.tsx
- **Fix:** Changed interface to `lat: number | { toString(): string } | null` — Prisma's `Decimal` satisfies this shape, template literal coercion produces correct `"lat,lng"` string in URL
- **Files modified:** apps/web/src/components/driver/route-detail-readonly.tsx
- **Commit:** cb5afe1

## Self-Check: PASSED

- [FOUND] apps/web/src/components/driver/route-detail-readonly.tsx
- [FOUND] commit cb5afe1
