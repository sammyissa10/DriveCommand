---
phase: quick-341
plan: "01"
subsystem: notifications
tags:
  - notifications
  - server-action
  - prisma
  - bug-fix
dependency_graph:
  requires:
    - quick-339 (notif-trace instrumentation)
    - quick-340 (defaultPrisma swap)
  provides:
    - createAssignment load prefetch returns non-null for valid loadIds
    - dispatchNotification('load.assigned') fires with real load data
  affects:
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
tech_stack:
  added: []
  patterns:
    - "Prisma nested include: carrierLoad -> stops -> facility"
key_files:
  modified:
    - apps/web/src/app/(owner)/actions/load-driver-assignments.ts
decisions:
  - "Use Option A (single findUnique with nested stops include) — one round trip, no template changes, schema supports it cleanly"
metrics:
  duration: "~10 minutes"
  completed: "2026-05-15"
  tasks_completed: 1
  files_modified: 1
---

# Phase quick-341 Plan 01: Fix createAssignment Load Prefetch Field Summary

Fix the silent null in `createAssignment`'s notification prefetch by querying the correct Prisma model (`carrierLoad` instead of the legacy `load`) and pulling origin/destination cities from the stops -> facility join.

## What Was Done

### Task 1: Rewrite createAssignment load prefetch to use carrierLoad + stops/facility join

**File modified:** `apps/web/src/app/(owner)/actions/load-driver-assignments.ts`
**Lines affected:** ~239–300 (the Promise.all prefetch and the `if (load && driver)` dispatch block)
**Commit:** `da1fb2b`

**Edit 1 — Prefetch rewrite (lines ~239–251 before, ~239–268 after):**

Before:
```ts
defaultPrisma.load.findUnique({
  where: { id: loadId },
  select: { loadNumber: true, origin: true, destination: true },
})
```

After:
```ts
defaultPrisma.carrierLoad.findUnique({
  where: { id: loadId },
  select: {
    referenceNumber: true,
    stops: {
      select: {
        stopType: true,
        sequenceOrder: true,
        facility: { select: { city: true } },
      },
      orderBy: { sequenceOrder: 'asc' },
    },
  },
})
```

**Edit 2 — Dispatch payload derivation (new code before `before-dispatch` log):**
```ts
const pickupStop = load.stops.find((s) => s.stopType?.toLowerCase() === 'pickup');
const deliveryStops = load.stops.filter((s) => s.stopType?.toLowerCase() === 'delivery');
const deliveryStop = deliveryStops.length > 0 ? deliveryStops[deliveryStops.length - 1] : undefined;
const originCity = pickupStop?.facility?.city ?? '';
const destCity = deliveryStop?.facility?.city ?? '';
const loadNumber = load.referenceNumber ?? '';
```

Then the dispatch payload uses `loadNumber`, `originCity`, `destCity` as variables instead of `load.loadNumber`, `load.origin`, `load.destination`.

## Schema-Level Root Cause

`LoadDriverAssignment.load` relation (schema line 2702):
```
load CarrierLoad @relation(fields: [loadId], references: [id], onDelete: Restrict)
```

This means `loadId` in `createAssignment` is a FK to `CarrierLoad.id`. `CarrierLoad` is `@@map("loads")` (schema line 2029) — it is the real `loads` table.

The legacy `Load` model (schema line 1025) is a completely different table. It has `loadNumber`, `origin`, `destination` fields — but those IDs never match what `createAssignment` receives, so `defaultPrisma.load.findUnique({ where: { id: loadId } })` always returned `null`, silently short-circuiting the `if (load && driver)` guard and skipping `dispatchNotification` entirely.

`CarrierLoad` (schema line 1980–1983) has:
- `referenceNumber String? @map("reference_number")` — the user-facing load identifier
- `stops CarrierStop[]` (line 2015) — stops with `stopType`, `sequenceOrder`, and `facility CarrierFacility`
- `CarrierFacility.city String?` (schema line 1751) — the city used for origin/destination

## Why Option A

Option A (single `findUnique` with nested `include` for stops + facility) was chosen because:
- One Prisma round trip — no extra queries
- Schema relations exist and Prisma resolves them cleanly
- No changes needed to notification templates, dispatcher, or any other file
- The notification payload contract already accepts `string` for all fields; `''` fallbacks satisfy it
- Option B (two separate queries) would be more verbose with no benefit

## Verification Command Outputs

**`npx tsc --noEmit` (from apps/web):** Exit 0, no errors.

**Vitest (notifications + load-driver-assignments tests):**
```
Test Files  4 passed (4)
      Tests  26 passed (26)
   Duration  1.73s
```
- `src/lib/notifications/__tests__/dispatcher.test.ts` — 6 tests passed
- `src/lib/notifications/__tests__/template-renderer.test.ts` — 7 tests passed
- `src/lib/notifications/__tests__/recipient-resolver.test.ts` — 6 tests passed
- `src/app/(owner)/actions/__tests__/load-driver-assignments.test.ts` — 7 tests passed

**`npm run build` (apps/web):** Build succeeded — 211 static pages generated, all routes compiled.

**Grep checks:**
- `defaultPrisma.carrierLoad.findUnique` — 1 match (correct)
- `defaultPrisma.load.` — 0 matches (old wrong-model call gone)
- `load.referenceNumber` + `load.stops` — 2+ matches in the dispatch block
- All 3 `[notif-trace]` log lines (`caller:prefetch-result`, `caller:before-dispatch`, `caller:after-dispatch`) — 3 matches, unchanged

## Deviations from Plan

None — plan executed exactly as written.

## Expected Next Observable Behavior in Production

- `[notif-trace] caller:prefetch-result load=true driver=true` for any valid driver assignment (was always `load=false` before this fix)
- `[notif-trace] caller:before-dispatch trigger=load.assigned` fires immediately after
- `[notif-trace] caller:after-dispatch trigger=load.assigned` confirms `dispatchNotification` completed
- New rows appear in `NotificationSendLog` for `load.assigned` trigger
- Drivers receive push notifications when assigned to loads, with `loadNumber` (from `referenceNumber`), `originCity`, and `destCity` populated from real stop data (empty strings if load has no dispatched stops yet)

## Self-Check: PASSED

- [x] `apps/web/src/app/(owner)/actions/load-driver-assignments.ts` — file exists and modified
- [x] Commit `da1fb2b` — verified in git log
- [x] `defaultPrisma.load.findUnique` gone (0 grep matches)
- [x] `defaultPrisma.carrierLoad.findUnique` present (1 grep match)
- [x] All 3 trace logs intact
- [x] tsc exit 0
- [x] 26/26 vitest tests passed
- [x] Build succeeded
