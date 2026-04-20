---
phase: quick-264
plan: 01
subsystem: carrier-ops
tags: [dispatch, loads, transactions, notifications, cron]
dependency_graph:
  requires: [prisma-schema, in-app-notifications, route-templates]
  provides: [transactional-dispatch-generation, dispatch-load-stops-auto-creation]
  affects: [carrier-auto-dispatch-cron, route-templates-generate-endpoint]
tech_stack:
  added: [dispatch_generated enum value]
  patterns: [prisma.$transaction per date, after() fire-and-forget notifications, pure data function pattern]
key_files:
  created:
    - apps/web/prisma/migrations/20260420100001_add_dispatch_generated_notification_type/migration.sql
  modified:
    - apps/web/prisma/schema.prisma
    - apps/web/src/lib/carrier/dispatch-generator.ts
    - apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts
    - apps/web/src/app/api/v1/carrier/route-templates/[id]/generate/route.ts
decisions:
  - Keep dispatch-generator.ts as pure data function; callers own notification side-effects via after()
  - Transaction wraps dispatch+load+stops per date so partial failures roll back entirely
  - needsAssignment=true when driver/truck conflict OR template has no clientId
metrics:
  duration: ~15 minutes
  completed: 2026-04-20
  tasks_completed: 2
  files_modified: 4
  files_created: 1
---

# Phase quick-264: Fix Nightly Dispatch Generator Summary

**One-liner:** Transactional dispatch+load+stops auto-generation from route templates with after() notifications and rollback on failure.

## What Was Built

The nightly dispatch generator previously only created `CarrierDispatch` records — loads and stops had to be created manually afterward. This task rewrote `generateDispatches` to create all three entities atomically in a single `prisma.$transaction` per scheduled date.

### Core Changes

**`dispatch-generator.ts`** — Full rewrite of the per-date generation block:
- Each date's work is wrapped in `prisma.$transaction(async (tx) => { ... })` — if load or stop creation fails, the dispatch is also rolled back
- If `template.clientId` is set: auto-generates `CarrierLoad` with `LD-YYYY-NNNNN` referenceNumber (same pattern as `loads.ts`), contract rateType/rateAmount/FSC copied from template contract
- If `template.clientId` is absent: skips load creation, sets `needsAssignment=true` in notes
- Stops receive `loadId` FK (or null), `appointmentStart`/`appointmentEnd` computed from `scheduledDeparture + offset_min`, `bolRequired`/`podRequired` flags from template stops, address snapshot in notes JSON
- `GenerationResult` extended with `loadsCreated`, `stopsCreated`, `notifications[]`
- Function stays a pure data function — no `after()` or `createNotification` calls inside it

**`carrier-auto-dispatch/route.ts`** (cron):
- Iterates `result.notifications` after each `generateDispatches` call
- Fires `after(() => createNotification(...))` for each: `dispatch_generated` type for clean dispatches, `needs_assignment` for those with conflicts or missing clientId
- Summary response now includes `total_loads_created` and `total_stops_created`

**`route-templates/[id]/generate/route.ts`** (manual endpoint):
- Same `after()` notification wiring as cron route
- Response enriched with `loads_created` and `stops_created`
- Added optional `date` field as alias for `generate_through_date` (defaults to today if neither provided)

**Schema migration:**
- Added `dispatch_generated` to `InAppNotificationType` enum
- Migration `20260420100001_add_dispatch_generated_notification_type` applied to production DB

## Commits

| Hash | Description |
|------|-------------|
| b27c1e8 | feat(quick-264): rewrite generateDispatches to create dispatch+load+stops in transaction |
| c3f4e7d | feat(quick-264): wire after() notifications in cron route and manual generate endpoint |

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- `apps/web/src/lib/carrier/dispatch-generator.ts` — exists, contains `$transaction`, `appointmentStart`, `referenceNumber`, `notifications`
- `apps/web/src/app/api/cron/carrier-auto-dispatch/route.ts` — exists, contains `createNotification`, `total_loads_created`
- `apps/web/src/app/api/v1/carrier/route-templates/[id]/generate/route.ts` — exists, contains `createNotification`, `loads_created`
- `apps/web/prisma/schema.prisma` — `dispatch_generated` in InAppNotificationType enum
- Migration `20260420100001_add_dispatch_generated_notification_type` — applied to production DB
- `npx tsc --noEmit` — zero errors in modified files (pre-existing e2e test errors only)
- `npx prisma validate` — schema valid
