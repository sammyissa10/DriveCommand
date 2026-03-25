---
phase: 35
plan: "03"
subsystem: mobile-owner
tags: [owner, drivers, compliance, rest-api, react-native, navigation]
dependency_graph:
  requires: [35-01, 35-02]
  provides: [owner-driver-list, owner-driver-detail, compliance-status]
  affects: [owner-dashboard, api-client]
tech_stack:
  added: []
  patterns: [compliance-status-computation, deterministic-avatar-color, deep-link-tel-mailto]
key_files:
  created:
    - apps/web/src/app/api/mobile/owner/drivers/route.ts
    - apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts
    - apps/mobile/app/(owner)/drivers/index.tsx
    - apps/mobile/app/(owner)/drivers/[id].tsx
    - apps/mobile/app/(owner)/drivers/_layout.tsx
  modified:
    - packages/api-client/src/owner.ts
    - packages/api-client/src/index.ts
    - apps/mobile/app/(owner)/index.tsx
decisions:
  - "User model has no phone field — phone always null in driver contact; only email contact link rendered"
  - "drivers.tsx moved to drivers/index.tsx to match loads/ pattern (file+dir coexistence in Expo Router)"
  - "Compliance status computed server-side from Document.expiryDate — no DB schema changes needed"
metrics:
  duration: "421s (~7min)"
  completed: "2026-03-25"
  tasks: 5
  files_affected: 8
---

# Phase 35 Plan 03: Owner Driver Management Summary

## One-liner
Owner driver list with compliance dots + full detail screen (load, docs, incidents, contact deep links) backed by two new REST endpoints with server-side compliance computation.

## What Was Built

### REST API
- `GET /api/mobile/owner/drivers` — all active drivers with compliance status (ok/warning/critical), HOS, current load number, expired/expiring doc counts
- `GET /api/mobile/owner/drivers/[id]` — full driver detail: current load, compliance documents with VALID/EXPIRING/EXPIRED status, last 3 incidents, HOS entry

### Compliance Logic
`computeComplianceStatus` helper: iterates `Document.expiryDate` fields — CRITICAL if any expired, WARNING if any within 30 days, OK otherwise. Identical logic used in both endpoints.

### Mobile Screens
- `drivers/index.tsx` — FlashList with DriverCard: deterministic avatar color (hash → 8 palette colors), initials, HOS dot, compliance dot (green/amber/red), current load label. Filter tabs All/On Duty/Off Duty with counts, pull-to-refresh.
- `drivers/[id].tsx` — Full detail: large avatar header, HOS badge, current load card (tappable → load detail), compliance docs list, contact section (mailto/tel deep links), recent incidents, quick actions (Send Message → fleet, View Loads).

### Dashboard Navigation
`DriverStatusChip` in the owner dashboard is now wrapped in a `Pressable` that navigates to `/(owner)/drivers/[id]`.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Routing] Reorganized drivers.tsx → drivers/index.tsx**
- **Found during:** Task 4 (creating drivers/[id].tsx)
- **Issue:** Having both `drivers.tsx` and `drivers/` directory at the same level causes ambiguity in Expo Router. The `loads` screen uses `loads/index.tsx` pattern.
- **Fix:** Moved `drivers.tsx` to `drivers/index.tsx` to match the established loads pattern.
- **Files modified:** `apps/mobile/app/(owner)/drivers/index.tsx` (renamed from drivers.tsx)
- **Commit:** 067095e

**2. [Rule 1 - Missing data] Phone field not on User model**
- **Found during:** Task 1
- **Issue:** The plan spec mentioned phone as a contact field. The Prisma User model has no `phone` field (only `email`, `firstName`, `lastName`). Phone exists only on `DriverInvitation`.
- **Fix:** API returns `phone: null` always; the detail screen only renders the phone row when `data.phone` is non-null.
- **Files modified:** Both driver endpoint files

## Self-Check: PASSED

- [x] `apps/web/src/app/api/mobile/owner/drivers/route.ts` — EXISTS
- [x] `apps/web/src/app/api/mobile/owner/drivers/[id]/route.ts` — EXISTS
- [x] `apps/mobile/app/(owner)/drivers/index.tsx` — EXISTS
- [x] `apps/mobile/app/(owner)/drivers/[id].tsx` — EXISTS
- [x] `apps/mobile/app/(owner)/drivers/_layout.tsx` — EXISTS
- [x] Commits: 86349d4, c2496f8, 721a2d0, 067095e — all verified in git log
