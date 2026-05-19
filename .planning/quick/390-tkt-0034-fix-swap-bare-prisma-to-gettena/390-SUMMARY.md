---
phase: quick
plan: 390
subsystem: carrier-data-layer
ticket: TKT-0034
tags: [audit-columns, prisma, tenant-client, write-paths, carrier]
key-files:
  modified:
    - apps/web/src/lib/carrier/clients.ts
    - apps/web/src/lib/carrier/contracts.ts
    - apps/web/src/lib/carrier/facilities.ts
    - apps/web/src/lib/carrier/fleet-trucks.ts
    - apps/web/src/lib/carrier/fleet-drivers.ts
    - apps/web/src/lib/carrier/dispatches.ts
    - apps/web/src/lib/carrier/loads.ts
    - apps/web/src/lib/carrier/stops.ts
decisions:
  - reads stay on bare prisma singleton; writes use getTenantPrisma() per plan constraint
  - deletes stay on bare prisma (no audit injection applies to deletes)
  - persistStops accepts tenantPrisma as first param so tx inherits extension chain
  - recurring dispatch in after() closes over tenantPrisma hoisted before after()
metrics:
  duration: ~40 minutes
  completed: 2026-05-19
  tasks: 2
  files: 8
---

# Phase quick Plan 390: TKT-0034 Fix — Swap Bare Prisma to getTenantPrisma() on Carrier Write Paths

Swapped bare `prisma` to `getTenantPrisma()` on every WRITE call in the 8 carrier data-layer files. The `withAuditColumns(userId)` extension now sees the session userId on each write and auto-stamps `created_by_id` / `updated_by_id`. No schema changes, no migrations, no UI changes, no payload field threading.

## Files Modified and Write Functions Swapped

### clients.ts
- `createClient` — `tenantPrisma.carrierClient.create`
- `updateClient` — `tenantPrisma.carrierClient.update`
- `softDeleteClient` — `tenantPrisma.carrierClient.update` (status → inactive)

### contracts.ts
- `createContract` — `tenantPrisma.carrierContract.create` (inside 5-attempt retry loop)
- `updateContract` — `tenantPrisma.carrierContract.update`
- `softDeleteContract` — `tenantPrisma.carrierContract.update` (status → cancelled)

### facilities.ts
- `createFacility` — `tenantPrisma.carrierFacility.create`
- `updateFacility` — `tenantPrisma.carrierFacility.update`
- `softDeleteFacility` — `tenantPrisma.carrierFacility.update` (facilityType prefix soft-delete)

### fleet-trucks.ts
- `createCarrierTruck` — `tenantPrisma.carrierTruck.create`
- `updateCarrierTruck` — `tenantPrisma.carrierTruck.update`

### fleet-drivers.ts
- `createCarrierDriver` — `tenantPrisma.carrierDriver.create` (main create), `tenantPrisma.carrierDriver.update` (linked-user backfill), `tenantPrisma.driverInvitation.updateMany` + `tenantPrisma.driverInvitation.create`
- `resendCarrierDriverInvitation` — `tenantPrisma.driverInvitation.updateMany` + `tenantPrisma.driverInvitation.create`
- `updateCarrierDriver` — `tenantPrisma.carrierDriver.update`

### dispatches.ts
- `createDispatch` — `tenantPrisma.carrierDispatch.create`, `tenantPrisma.dispatchOverrideAudit.create`, `tenantPrisma.carrierStop.create` (template stops loop)
- `updateDispatch` — `tenantPrisma.carrierDispatch.update`, `tenantPrisma.carrierStop.create` (template re-create loop); `carrierStop.deleteMany` left on bare prisma (delete is neutral)
- `transitionDispatchStatus` — all 4 paths: `tenantPrisma.carrierDispatch.update` (planned→in_progress), `tenantPrisma.carrierDispatch.update` (in_progress→completed), `tenantPrisma.carrierLoad.updateMany` + `tenantPrisma.carrierDispatch.update` (planned→cancelled), `tenantPrisma.carrierDispatch.update` (planned→tonu); recurring dispatch `after()` uses `tenantPrisma` hoisted before `after()` registration

### loads.ts
- `createLoad` — `tenantPrisma.carrierLoad.create`, `tenantPrisma.carrierLoad.update` (pendingStopsJson)
- `updateLoad` — `tenantPrisma.carrierLoad.update` (main update + pendingStopsJson variants), `tenantPrisma.carrierStop.updateMany` (migrate-stops), `tenantPrisma.carrierLoad.update` (revenue recalc), `tenantPrisma.carrierDispatch.update` (plannedMiles write-back); `carrierStop.deleteMany` left on bare prisma
- `persistStops` — signature changed to accept `tenantPrisma: PrismaClient` as first param; `prisma.$transaction` → `tenantPrisma.$transaction`; `tx` inherits extension chain; both call sites in createLoad/updateLoad pass `tenantPrisma`

### stops.ts
- `createStop` — `tenantPrisma.carrierStop.create` (all facility/dispatch/load reads remain on bare prisma)
- `updateStop` — `tenantPrisma.carrierStop.update`

## Key Decisions

### Reads stay on bare prisma
Constraint from CONTEXT.md: "DO NOT change READ paths". All `findFirst`, `findMany`, `findUnique`, `count`, `aggregate` calls remain on the bare `prisma` singleton.

### Deletes stay on bare prisma
Delete operations (`deleteMany`) are not audit-injection targets (no `createdById`/`updatedById` on deletes). Leaving them on bare `prisma` minimizes diff and respects the read-path constraint in spirit.

### persistStops — tenant client as parameter
`persistStops` runs writes inside `prisma.$transaction(async (tx) => {...})`. The `tx` inherits the extension chain of whichever Prisma instance `$transaction` was called on. Changing the signature to accept `tenantPrisma: PrismaClient` and calling `tenantPrisma.$transaction(...)` means all `tx.carrierStop.createMany` / `tx.carrierStop.update` calls automatically get audit-column injection. Both call sites in `createLoad` and `updateLoad` pass the locally-bound `tenantPrisma`.

### `after()` in transitionDispatchStatus — hoist before registration
The recurring dispatch creation inside `after(async () => {...})` runs after the HTTP response. The `getTenantPrisma()` reads from request headers which won't be available in the deferred callback. Per plan guidance: `const tenantPrisma = await getTenantPrisma()` is called at the top of `transitionDispatchStatus` (synchronously in the request scope) and closed over inside the `after()` callback.

### DispatchOverrideAudit in createDispatch
`DispatchOverrideAudit` is in `EXEMPT_AUDIT_MODELS` so the extension pass-through means no audit column injection will occur, but using `tenantPrisma` is still correct for consistency and ensures RLS coverage.

## Write Paths Intentionally NOT Swapped

| Path | Reason |
|------|--------|
| `dispatch-generator.ts` | Cron-driven dispatch generation — no user session, out of scope |
| `stop-completion.ts` | Driver-side stop status flips — separate ticket scope |
| `deleteCarrierDriver` transaction | Delete operations; no audit injection applies |
| `prisma.carrierStop.deleteMany` in updateDispatch/updateLoad | Delete is neutral; stays on bare prisma per plan |
| `expenses.ts`, `documents.ts`, `compliance.ts`, etc. | Not in the 8-entity scope |

## 8 Entities × POST/PATCH Matrix

| Entity | POST (create) | PATCH (update) |
|--------|--------------|----------------|
| CarrierTruck | FIXED (fleet-trucks.ts createCarrierTruck) | FIXED (fleet-trucks.ts updateCarrierTruck) |
| CarrierDriver | FIXED (fleet-drivers.ts createCarrierDriver) | FIXED (fleet-drivers.ts updateCarrierDriver) |
| CarrierDispatch | FIXED (dispatches.ts createDispatch) | FIXED (dispatches.ts updateDispatch + transitionDispatchStatus) |
| CarrierLoad | FIXED (loads.ts createLoad) | FIXED (loads.ts updateLoad) |
| CarrierClient | FIXED (clients.ts createClient) | FIXED (clients.ts updateClient) |
| CarrierContract | FIXED (contracts.ts createContract) | FIXED (contracts.ts updateContract) |
| CarrierFacility | FIXED (facilities.ts createFacility) | FIXED (facilities.ts updateFacility) |
| CarrierStop | FIXED (stops.ts createStop + persistStops) | FIXED (stops.ts updateStop + persistStops) |

## Deviations from Plan

None — plan executed exactly as written.

## TypeScript Check

`npx tsc --noEmit` from `apps/web` passed with zero new errors. Pre-existing framer-motion/zustand/nuqs/d3-geo errors are acceptable noise (pre-existing before this task).

## Self-Check: PASSED

- All 8 carrier lib files confirmed modified
- Zero `createdById:` or `updatedById:` added to any data payload (29 getTenantPrisma additions, 0 manual audit field additions)
- Commits 3192ee63 (Task 1) and dba86cd8 (Task 2) exist in git log
- persistStops signature change confirmed in git diff with both call sites updated
- TypeScript check: zero new errors

---

TKT-0034 fix shipped. All carrier write paths now stamp audit columns. Historical NULL rows intentionally left as-is.
