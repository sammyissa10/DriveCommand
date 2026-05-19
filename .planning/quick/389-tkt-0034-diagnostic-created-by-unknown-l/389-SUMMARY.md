---
phase: quick
plan: 389
ticket: TKT-0034
subsystem: carrier — fleet, dispatches, loads, clients, contracts, facilities, stops
tags: [diagnostic, audit-trail, createdById, updatedById, read-only]
dependency_graph:
  requires: [TKT-0015 Wave 2 migration (20260517150001)]
  provides: [fix-scope verdict for TKT-0034 follow-up]
  affects: [carrier_trucks, carrier_drivers, dispatches, loads, clients, contracts, facilities, stops]
tech_stack:
  patterns: [AuditTrailFooter, withAuditColumns, getTenantPrisma, bare-prisma]
key_files:
  read:
    - apps/web/prisma/schema.prisma (CarrierTruck + all carrier models)
    - apps/web/prisma/migrations/20260517150001_tkt0015_2b_wave2_fleet_audit_columns/migration.sql
    - apps/web/src/lib/carrier/fleet-trucks.ts
    - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    - apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
    - apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx
    - apps/web/src/components/audit-trail-footer.tsx
    - apps/web/src/lib/context/tenant-context.ts
    - .planning/debug/withauditcolumns-tag-creation-null.md
  written:
    - .planning/quick/389-tkt-0034-diagnostic-created-by-unknown-l/389-SUMMARY.md
decisions:
  - "Root cause is in the API write path: all carrier data-layer functions (fleet-trucks.ts, clients.ts, dispatches.ts, loads.ts, facilities.ts, contracts.ts, stops.ts) use the bare `prisma` client and never set createdById/updatedById. getTenantPrisma() is already fixed and auto-injects the audit columns when used."
  - "Fix scope is GLOBAL across all 8 carrier entities that display AuditTrailFooter."
metrics:
  completed_date: "2026-05-19"
  tasks: 5
---

# Phase quick Plan 389: TKT-0034 — "Created by Unknown" Diagnostic Summary

**One-liner:** Every carrier entity detail page shows "Unknown" because all carrier data-layer write functions use the bare `prisma` client instead of `getTenantPrisma()`, so `createdById`/`updatedById` are never set despite the DB columns existing and the `withAuditColumns` extension being ready.

---

## 1. TL;DR

The "Created by Unknown" and "Last updated by Unknown" labels appear on every carrier entity detail page (trucks, drivers, dispatches, loads, clients, contracts, facilities, stops). The DB columns (`created_by_id`, `updated_by_id`) exist in all relevant tables — added by migration `20260517150001`. The `withAuditColumns` Prisma extension that auto-populates them is in place and working. The `getTenantPrisma()` helper has already been fixed to forward the session userId to that extension.

The bug is solely in the **API write layer**: every carrier data-layer function (`fleet-trucks.ts`, `clients.ts`, `dispatches.ts`, `loads.ts`, `facilities.ts`, `contracts.ts`, `stops.ts`, `fleet-drivers.ts`) imports and uses the bare `prisma` singleton, bypassing `getTenantPrisma()` entirely. Because the extension never sees a userId, it no-ops on every write and leaves both columns NULL.

**Recommended fix scope: GLOBAL** — 8 carrier entities are affected by the same root cause.

---

## 2. Data Flow Map

```
Schema          DB columns         API write path     Data layer read    UI render
─────────────────────────────────────────────────────────────────────────────────────
CarrierTruck    created_by_id ✓    POST createTruck   getCarrierTruck    AuditTrailFooter
                updated_by_id ✓    does NOT set it    no include needed  → "Unknown"
                                   (bare prisma,       (page does its
                                   no createdById      own findUnique
                                   in payload)         selecting createdBy)
```

Step-by-step status:

| Step | Layer | Attribution preserved? |
|------|-------|----------------------|
| 1 | Schema — `CarrierTruck` has `createdById`/`updatedById` + `createdBy`/`updatedBy` relations | YES |
| 2 | DB — migration `20260517150001` added `created_by_id`/`updated_by_id` FKs to `carrier_trucks` | YES |
| 3 | API write (POST `createCarrierTruck`) — calls `prisma.carrierTruck.create({data:{...}})` with no `createdById` | **NO** |
| 4 | API write (PATCH `updateCarrierTruck`) — calls `prisma.carrierTruck.update({data:{...}})` with no `updatedById` | **NO** |
| 5 | Data layer read (`getCarrierTruck`) — does not include `createdBy`/`updatedBy` (but detail page fetches them separately) | N/A |
| 6 | UI read — page at `(owner)/carrier/fleet/trucks/[id]/page.tsx` does its own `prisma.carrierTruck.findUnique` with `createdBy`/`updatedBy` select | YES — query is correct |
| 7 | UI render — `AuditTrailFooter` in `audit-trail-footer.tsx` line 38: `createdByName?.trim() \|\| createdByEmail?.trim() \|\| 'Unknown'` | Returns 'Unknown' because relation is null |

---

## 3. Layer-by-Layer Findings

### Schema (Task 1)

`CarrierTruck` in `apps/web/prisma/schema.prisma`:

```prisma
createdById  String?  @map("created_by_id") @db.Uuid    // NEW (Wave 2)
updatedById  String?  @map("updated_by_id") @db.Uuid    // NEW (Wave 2)

createdBy    User?    @relation(name: "CarrierTruckCreatedBy", fields: [createdById], references: [id], onDelete: SetNull)
updatedBy    User?    @relation(name: "CarrierTruckUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull)
```

Both FK columns and both relation declarations are present. The pattern is consistent across all 8 carrier entities (CarrierClient, CarrierContract, CarrierFacility, CarrierDriver, CarrierTruck, CarrierDispatch, CarrierLoad, CarrierStop).

There is no `withAuditColumns` mixin or shared base model in the schema — audit columns are explicit per-model fields. The `withAuditColumns` is a **Prisma client extension**, not a schema construct.

Prior debug note `.planning/debug/withauditcolumns-tag-creation-null.md` documented that `withAuditColumns` no-ops when `userId === null`. That root cause was resolved for `getTenantPrisma()` (session userId is now forwarded), but the carrier module never calls `getTenantPrisma()` at all.

### DB Reality (Task 1)

Migration `20260517150001_tkt0015_2b_wave2_fleet_audit_columns/migration.sql` added `created_by_id UUID` and `updated_by_id UUID` with `ON DELETE SET NULL` FK constraints to all 8 relevant tables:

- `clients`, `contracts`, `facilities`, `carrier_drivers`, `carrier_trucks`, `dispatches`, `loads`, `stops`

No schema-DB drift. Columns exist in the DB. All values are NULL because they have never been populated by any write.

### API POST — createCarrierTruck (Task 2)

File: `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts`

```typescript
export async function POST(req: NextRequest) {
  const session = await getSession();
  // session.userId IS available here
  const carrierTruck = await createCarrierTruck(orgId, parsed.data);
  // session.userId is NEVER passed to createCarrierTruck
}
```

`createCarrierTruck` in `apps/web/src/lib/carrier/fleet-trucks.ts`:

```typescript
return prisma.carrierTruck.create({
  data: {
    ...rest,
    orgId,
    vehicleId,
    displayName: resolvedDisplayName,
    // createdById: <MISSING>
  },
});
```

`prisma` is the bare singleton from `@/lib/db/prisma`. The `withAuditColumns` extension is NOT on this client. No `createdById` is set. **POST does NOT persist attribution.**

### API PATCH — updateCarrierTruck (Task 2)

File: `apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts`

```typescript
export async function PATCH(req, { params }) {
  const session = await getSession();
  // session.userId IS available here
  const truck = await updateCarrierTruck(orgId, id, parsed.data);
  // session.userId is NEVER passed
}
```

`updateCarrierTruck` in `fleet-trucks.ts`:

```typescript
return prisma.carrierTruck.update({
  where: { id },
  data: { ...rest, ... },
  // updatedById: <MISSING>
});
```

**PATCH does NOT persist attribution.**

### Audit Helper (Task 2)

`withAuditColumns` exists at `apps/web/src/lib/db/extensions/audit-columns.ts`. It is composed onto the client returned by `createTenantClient()` (in `tenant-client.ts`). When `userId` is non-null it injects `createdById`/`updatedById` on writes.

`getTenantPrisma()` in `apps/web/src/lib/context/tenant-context.ts` is **already fixed** (contrary to the debug note which said "not implemented"):

```typescript
export async function getTenantPrisma(): Promise<PrismaClient> {
  const tenantId = await requireTenantId();
  const session = await getSession();
  return createTenantClient(tenantId, session?.userId ?? null);
}
```

The extension is correct and the helper is wired. The problem is that the carrier module **never calls `getTenantPrisma()`** — it uses `import { prisma } from '@/lib/db/prisma'` directly throughout.

User ID source in API routes: `session.userId` from `getSession()` — which reads from `app_metadata` per the Phase 37.6 hardening. This is the correct source; it just never gets forwarded.

### Data Layer Include (Task 3)

`getCarrierTruck` in `fleet-trucks.ts` does NOT include `createdBy`/`updatedBy`:

```typescript
export async function getCarrierTruck(orgId: string, id: string) {
  return prisma.carrierTruck.findFirst({
    where: { id, orgId },
    include: {
      primaryDispatches: { ... },
      // createdBy: <MISSING>
      // updatedBy: <MISSING>
    },
  });
}
```

However, this is NOT the cause of the "Unknown" display. The detail page at `apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx` does a **separate** `prisma.carrierTruck.findUnique` specifically to fetch audit data:

```typescript
const [truck, truckAudit] = await Promise.all([
  getCarrierTruck(orgId, id),
  prisma.carrierTruck.findUnique({
    where: { id },
    select: {
      createdBy: { select: { firstName: true, lastName: true, email: true } },
      updatedBy: { select: { firstName: true, lastName: true, email: true } },
      createdAt: true,
      updatedAt: true,
    },
  }).catch(() => null),
]);
```

The read query is correct. The relation returns `null` only because `createdById` IS null in the DB row.

### UI Fallback Expression (Task 3)

File: `apps/web/src/components/audit-trail-footer.tsx`, lines 37–40:

```typescript
const createdActor =
  createdByName?.trim() || createdByEmail?.trim() || 'Unknown';
const updatedActor =
  updatedByName?.trim() || updatedByEmail?.trim() || 'Unknown';
```

The page passes:
- `createdByName`: `truckAudit.createdBy ? \`${firstName} ${lastName}\`.trim() || null : null`
- `createdByEmail`: `truckAudit.createdBy?.email ?? null`

Since `truckAudit.createdBy` is `null` (FK is NULL in DB), both `createdByName` and `createdByEmail` are `null`, and the fallback `'Unknown'` is rendered. The component and the page logic are correct.

---

## 4. Cross-Entity Matrix

All 8 carrier entities that render `AuditTrailFooter` were investigated. Every entity has the same root cause: data-layer write functions use bare `prisma`, never setting `createdById`/`updatedById`.

| Entity | Schema cols? | DB cols? (migration) | API writes createdById? | Data layer include? | UI reads correct field? | Visible "Unknown"? |
|--------|-------------|---------------------|------------------------|--------------------|-----------------------|--------------------|
| CarrierTruck | YES — `created_by_id`, `updated_by_id` | YES — `20260517150001` | **NO** — `fleet-trucks.ts` uses bare `prisma`, no `createdById` in payload | N/A — page has separate findUnique | YES — `truckAudit.createdBy` | **YES** |
| CarrierDriver | YES — `created_by_id`, `updated_by_id` | YES — `20260517150001` | **NO** — `fleet-drivers.ts` uses bare `prisma`, no `createdById` in payload | N/A — page has separate findUnique (via `getTenantPrisma()` for other query, but audit findUnique is still bare) | YES — `driverAudit.createdBy` | **YES** |
| CarrierDispatch | YES — `created_by_id`, `updated_by_id` | YES — `20260517150001` | **NO** — `dispatches.ts` uses bare `prisma`. `currentUserId` is passed in but only used for override audit, never set as `createdById` | N/A — page has separate findUnique | YES — `dispatchAudit.createdBy` | **YES** |
| CarrierLoad | YES — `created_by_id`, `updated_by_id` | YES — `20260517150001` | **NO** — `loads.ts` uses bare `prisma`, no `createdById` in payload | N/A — page has separate findUnique | YES — `loadAudit.createdBy` | **YES** |
| CarrierClient | YES — `created_by_id`, `updated_by_id` | YES — `20260517150001` | **NO** — `clients.ts` uses bare `prisma`, no `createdById` in payload | N/A — page has separate findUnique | YES — `clientAudit.createdBy` | **YES** |
| CarrierContract | YES — `created_by_id`, `updated_by_id` | YES — `20260517150001` | **NO** — `contracts.ts` uses bare `prisma`, no `createdById` in payload | N/A — page has separate findUnique | YES — `contractAudit.createdBy` | **YES** |
| CarrierFacility | YES — `created_by_id`, `updated_by_id` | YES — `20260517150001` | **NO** — `facilities.ts` uses bare `prisma`, no `createdById` in payload | N/A — page has separate findUnique | YES — `facilityAudit.createdBy` | **YES** |
| CarrierStop | YES — `created_by_id`, `updated_by_id` | YES — `20260517150001` | **NO** — `stops.ts` uses bare `prisma`, no `createdById` in payload | N/A — page has separate findUnique | YES — `stopAudit.createdBy` | **YES** |

**Conclusion: GLOBAL — all 8 carrier entities with `AuditTrailFooter` are affected by the identical root cause.**

---

## 5. Hypothesis Ranking Table

| # | Hypothesis | Evidence For | Evidence Against | Confidence |
|---|-----------|--------------|------------------|-----------|
| 1 | **API write path omits `createdById`/`updatedById`** — carrier data-layer functions (fleet-trucks.ts et al.) use bare `prisma` and never include these fields in `data:{}` payloads | All 8 carrier lib files verified: zero references to `createdById`/`updatedById` in any create/update payload. API routes have `session.userId` but never forward it. | None | **HIGH** |
| 2 | **`getTenantPrisma()` not used** — carrier module bypasses the `withAuditColumns` extension by importing bare `prisma` instead of using `getTenantPrisma()` | All 20 files in `apps/web/src/lib/carrier/` use `import { prisma } from '@/lib/db/prisma'`. None call `getTenantPrisma()`. The `withAuditColumns` extension only runs on clients returned by `createTenantClient`. | None | **HIGH** |
| 3 | **Schema columns present but never written** — the DB has `created_by_id`/`updated_by_id` on all 8 tables (confirmed by migration), but they are always NULL because no write path sets them | Migration `20260517150001` confirmed. Schema relations confirmed. Data layer read queries are correct. `createdBy` join returns null because FK is null. | None | **HIGH** |
| 4 | **Data layer read missing `include`** — `getCarrierTruck` (and sibling functions) don't include `createdBy`/`updatedBy` | `getCarrierTruck` confirmed missing include | This is NOT the cause of "Unknown": the detail pages do a separate `findUnique` with the correct select for audit fields. The include gap is a minor redundancy, not the bug. | **LOW** (not the bug) |
| 5 | **`withAuditColumns` extension bug (null guard)** — extension no-ops when `userId` is null | Prior debug note confirmed this behavior. `audit-columns.ts` lines 77-80 short-circuit on null userId. | `getTenantPrisma()` is already fixed to pass `session?.userId`. This is only relevant because carrier code never calls `getTenantPrisma()` at all (Hypothesis 2 is the real cause). | **MED** (contributing factor, not standalone) |
| 6 | **Session shape mismatch (`user_metadata` vs `app_metadata`)** — userId read from wrong claim | Phase 37.6 hardened auth to read from `app_metadata`. `getSession()` returns correct userId. | `session.userId` is available in both truck API routes — it's just never used. | **LOW** (not the bug) |
| 7 | **UI component reads wrong field name** — `AuditTrailFooter` uses wrong prop | `audit-trail-footer.tsx` lines 37-40 verified: correct fallback chain using passed-in `createdByName`/`createdByEmail`. Page builds names from `truckAudit.createdBy.firstName/lastName`. | Component behavior is correct; it shows "Unknown" legitimately when both name and email are null. | **LOW** (not the bug) |

---

## 6. Recommended Fix Scope

**GLOBAL — all 8 carrier entities must be fixed in a single coordinated effort.**

The root cause is structural: every carrier data-layer function bypasses `getTenantPrisma()`. The fix is to update each of the 8 carrier lib files to accept a `userId` parameter and include it in the `data:` payload of every `create` and `update` call, **OR** switch those functions to use `getTenantPrisma()` (which auto-injects audit columns via the extension). Each approach has tradeoffs:

**Option A — Explicit userId parameter (lower risk, surgical):**
- Each API route extracts `session.userId` and passes it down to the lib function
- Lib function adds `createdById` / `updatedById` to the `data:` payload
- Files to change: 8 API route files (POST/PATCH handlers) + 8 lib files

**Option B — Switch to `getTenantPrisma()` in lib functions (cleaner, higher risk):**
- Carrier lib functions become async and call `getTenantPrisma()` internally
- Extension auto-injects audit columns — no explicit userId threading needed
- Risk: carrier lib functions currently accept `orgId` as a parameter and use bare `prisma`; switching to `getTenantPrisma()` requires those functions to be called in a request context (they already are, so this should be safe)
- Files to change: 8 lib files only

Either option addresses all 8 entities simultaneously. Fixing only trucks would leave the identical bug on 7 other entities.

**Precise files that would need to change (fix scope, not fix content):**

Write paths (API routes):
- `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` (POST)
- `apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts` (PATCH)
- `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` (POST)
- `apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts` (PATCH)
- `apps/web/src/app/api/v1/carrier/dispatches/route.ts` (POST)
- `apps/web/src/app/api/v1/carrier/dispatches/[id]/route.ts` (PATCH)
- `apps/web/src/app/api/v1/carrier/loads/route.ts` (POST)
- `apps/web/src/app/api/v1/carrier/loads/[id]/route.ts` (PATCH)
- `apps/web/src/app/api/v1/carrier/clients/route.ts` (POST)
- `apps/web/src/app/api/v1/carrier/clients/[id]/route.ts` (PATCH/PUT)
- `apps/web/src/app/api/v1/carrier/contracts/route.ts` (POST)
- `apps/web/src/app/api/v1/carrier/contracts/[id]/route.ts` (PATCH/PUT)
- `apps/web/src/app/api/v1/carrier/facilities/route.ts` (POST)
- `apps/web/src/app/api/v1/carrier/facilities/[id]/route.ts` (PATCH/PUT)
- `apps/web/src/app/api/v1/carrier/stops/route.ts` (POST)
- `apps/web/src/app/api/v1/carrier/stops/[id]/route.ts` (PATCH/PUT)

Data layer write functions:
- `apps/web/src/lib/carrier/fleet-trucks.ts` — `createCarrierTruck`, `updateCarrierTruck`
- `apps/web/src/lib/carrier/fleet-drivers.ts` — `createCarrierDriver`, `updateCarrierDriver`
- `apps/web/src/lib/carrier/dispatches.ts` — `createDispatch`, `updateDispatch`
- `apps/web/src/lib/carrier/loads.ts` — `createLoad`, `updateLoad`
- `apps/web/src/lib/carrier/clients.ts` — `createClient`, `updateClient`
- `apps/web/src/lib/carrier/contracts.ts` — `createContract`, `updateContract`
- `apps/web/src/lib/carrier/facilities.ts` — `createFacility`, `updateFacility`
- `apps/web/src/lib/carrier/stops.ts` — `createStop`, `updateStop`

No schema changes, no migrations, and no UI changes are needed.

---

## 7. Open Questions / Things Requiring User Input

1. **Fix approach preference (Option A vs B):** Does the user prefer explicit `userId` threading through function signatures (surgical, verbose) or switching carrier lib functions to use `getTenantPrisma()` internally (cleaner, requires lib functions to be request-context-aware)? Both are viable.

2. **Historical rows:** All rows created before the fix will permanently show "Unknown" — the columns cannot be backfilled because the writer's identity was never recorded. Is this acceptable, or should a one-time backfill attempt be made (e.g., setting `created_by_id = org_owner_id` for all historical rows where `created_by_id IS NULL`)?

3. **`createDispatch` has `currentUserId` already** — `dispatches.ts` already receives `currentUserId` for override audit purposes. This makes the dispatch fix simpler: just add `createdById: data.currentUserId` to the `prisma.carrierDispatch.create` payload. Does the user want this handled as a special case in the fix plan, or treated uniformly with all other entities?

---

TKT-0034 diagnostic complete. Recommended fix scope: GLOBAL
