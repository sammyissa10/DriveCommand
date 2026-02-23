---
phase: quick-23
plan: 01
subsystem: loads / public-tracking
tags: [public-api, tracking, leaflet, prisma-schema, customer-facing]
dependency_graph:
  requires: [loads-system, gps-locations, prisma-schema]
  provides: [public-tracking-page, tracking-token-generation, copy-tracking-link]
  affects: [Load-model, dispatchLoad-action, load-detail-page]
tech_stack:
  added: []
  patterns: [public-route-no-auth, dynamic-import-ssr-false, globalThis.crypto.randomUUID]
key_files:
  created:
    - prisma/schema.prisma (trackingToken field + index)
    - src/app/api/track/[token]/route.ts
    - src/app/track/[token]/page.tsx
    - src/components/tracking/tracking-map.tsx
    - src/components/loads/copy-tracking-link.tsx
  modified:
    - src/app/(owner)/actions/loads.ts (dispatchLoad token generation)
    - src/app/(owner)/loads/[id]/page.tsx (CopyTrackingLinkButton)
decisions:
  - Use --accept-data-loss for prisma db push — safe because trackingToken is nullable (all existing loads get NULL, no uniqueness violation)
  - Public tracking page queries prisma directly (no auth, no RLS, no getTenantPrisma) — intentional for public access
  - API route and page both query DB directly — minor duplication is acceptable for this use case (page is server-rendered, API is for future use)
  - globalThis.crypto.randomUUID() for token generation — no import needed, available in Node 19+ and Next.js runtime
  - dynamic import with ssr:false for TrackingMap — Leaflet requires browser APIs (window, document)
  - Only DISPATCHED/PICKED_UP/IN_TRANSIT/DELIVERED shown in customer stepper — PENDING/INVOICED/CANCELLED are internal statuses
  - No financial data (rate, tenantId, customerId) exposed on public page or API
metrics:
  duration: 196s
  completed: "2026-02-23"
  tasks: 3
  files: 7
---

# Quick-23: Customer Shipment Tracking Page (Public) Summary

**One-liner:** Public /track/[token] page with Leaflet GPS map, status timeline, and auto-generated tracking token on dispatch.

## Tasks Completed

| # | Task | Commit | Files |
|---|------|--------|-------|
| 1 | Schema + API + dispatch token generation | fb89f57 | prisma/schema.prisma, loads.ts, /api/track/[token]/route.ts |
| 2 | Public tracking page with status timeline and Leaflet map | 0fcbf39 | track/[token]/page.tsx, tracking-map.tsx |
| 3 | Copy Tracking Link button on load detail page | 50c360e | copy-tracking-link.tsx, loads/[id]/page.tsx |

## What Was Built

### Schema Change
Added `trackingToken String? @unique` field to the `Load` model with `@@index([trackingToken])`. Pushed via `prisma db push --accept-data-loss` (safe: nullable field, NULLs do not violate uniqueness). Client regenerated via `prisma generate`.

### Token Generation
`dispatchLoad` in `src/app/(owner)/actions/loads.ts` now sets `trackingToken: globalThis.crypto.randomUUID()` alongside status DISPATCHED. Every dispatched load gets a unique, unguessable UUID token.

### Public API
`src/app/api/track/[token]/route.ts` — GET endpoint with no authentication, no RLS, no tenant context. Returns: loadNumber, status, origin, destination, deliveryDate, truck (make/model/licensePlate), driverFirstName, latestGPS. Returns 404 for unknown tokens. Excludes: rate, tenantId, customerId, notes.

### Public Tracking Page
`src/app/track/[token]/page.tsx` — standalone server component outside any auth-gated route group. Inherits root layout (fonts, globals.css, Toaster) but not the owner sidebar/auth layout. Features:
- DriveCommand header bar
- Load number + status badge
- 4-step customer status stepper (Order Confirmed → Picked Up → In Transit → Delivered)
- Two-column layout: shipment details card + Leaflet map
- GPS placeholder when no location data available
- "Powered by DriveCommand" footer
- Invalid tokens call `notFound()` → 404 page

### TrackingMap Component
`src/components/tracking/tracking-map.tsx` — client component with `'use client'`, imports `leaflet/dist/leaflet.css`. Renders `MapContainer` + `TileLayer` + `Marker` with blue divIcon truck SVG matching vehicle-marker pattern. Dynamic imported in tracking page with `{ ssr: false }`.

### Copy Tracking Link Button
`src/components/loads/copy-tracking-link.tsx` — client component. Constructs `/track/[token]` URL via `window.location.origin`, copies to clipboard with `navigator.clipboard.writeText`, shows sonner `toast.success`. Shown on load detail page only when `load.trackingToken` is truthy (i.e., dispatched loads only).

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED
- FOUND: src/app/api/track/[token]/route.ts
- FOUND: src/app/track/[token]/page.tsx
- FOUND: src/components/tracking/tracking-map.tsx
- FOUND: src/components/loads/copy-tracking-link.tsx
- Commits fb89f57, 0fcbf39, 50c360e all present in git log
- TypeScript: 0 errors (npx tsc --noEmit clean)
