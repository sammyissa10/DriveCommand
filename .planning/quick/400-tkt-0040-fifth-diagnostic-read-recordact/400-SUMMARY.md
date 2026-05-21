---
phase: quick
plan: 400
subsystem: onboarding/activation-tracker
tags: [diagnostic, tkt-0040, read-only, activation-progress, carrier-routes]
dependency_graph:
  requires: []
  provides: [tkt-0040-fifth-diagnostic]
  affects: [onboarding/welcome, carrier-fleet-trucks, carrier-fleet-drivers, carrier-clients]
tech_stack:
  added: []
  patterns: [bypass_rls, FORCE ROW LEVEL SECURITY, after(), recordActivationEvent]
key_files:
  created:
    - .planning/quick/400-tkt-0040-fifth-diagnostic-read-recordact/400-SUMMARY.md
  modified: []
decisions:
  - "No code changes made — read-only diagnostic"
metrics:
  duration: ~25 minutes
  completed: 2026-05-21
---

# Phase quick Plan 400: TKT-0040 Fifth Diagnostic — recordActivationEvent vs Carrier Write Path

Read-only diagnostic tracing the full execution path of `recordActivationEvent` and confirming whether the carrier API POST routes call it, plus auditing schema `@@map` directives and identifying the precise gap between the activation writer and the carrier write path.

---

## 1. recordActivationEvent — Verbatim Body

File: `apps/web/src/lib/onboarding/activation-tracker.ts`

```ts
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

export type ActivationEventType =
  | 'first_real_truck'
  | 'first_real_driver'
  | 'first_real_client'
  | 'first_load_in_transit';

const FIELD_MAP: Record<ActivationEventType, string> = {
  first_real_truck: 'firstRealTruckAt',
  first_real_driver: 'firstRealDriverAt',
  first_real_client: 'firstRealClientAt',
  first_load_in_transit: 'firstLoadInTransitAt',
};

export async function recordActivationEvent(
  tenantId: string,
  event: ActivationEventType
): Promise<void> {
  try {
    const field = FIELD_MAP[event];
    const now = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Idempotency: only update if this field is not yet set.
      const current = await tx.activationProgress.findUnique({
        where: { tenantId },
        select: {
          firstRealTruckAt: true,
          firstRealDriverAt: true,
          firstRealClientAt: true,
          firstLoadInTransitAt: true,
          isActivated: true,
          accountCreatedAt: true,
        },
      });

      if (!current) return; // ActivationProgress row missing — skip silently

      // Skip if this event was already recorded (idempotency)
      const currentFieldValue = current[field as keyof typeof current];
      if (currentFieldValue !== null && currentFieldValue !== undefined) return;

      // Build the update — set this field to now
      const updateData: Record<string, unknown> = {
        [field]: now,
        updatedAt: now,
      };

      // Compute new completionPct based on which steps are now complete
      const truckDone = field === 'firstRealTruckAt' ? true : current.firstRealTruckAt !== null;
      const driverDone = field === 'firstRealDriverAt' ? true : current.firstRealDriverAt !== null;
      const clientDone = field === 'firstRealClientAt' ? true : current.firstRealClientAt !== null;
      const transitDone = field === 'firstLoadInTransitAt' ? true : current.firstLoadInTransitAt !== null;

      const newPct = 20 * (
        1 +
        (truckDone ? 1 : 0) +
        (driverDone ? 1 : 0) +
        (clientDone ? 1 : 0) +
        (transitDone ? 1 : 0)
      );
      updateData.completionPct = newPct;

      const nowActivated = newPct === 100;
      if (nowActivated) {
        updateData.isActivated = true;
      }

      await tx.activationProgress.update({
        where: { tenantId },
        data: updateData as any,
      });

      // Write AppEvent for this activation step
      await tx.appEvent.create({
        data: {
          tenantId,
          eventType: `activation.${event}`,
          properties: { tenantId, event, completionPct: newPct },
        },
      });

      // Write tenant.activated event if we just crossed 100% for the first time
      if (nowActivated && !current.isActivated) {
        const owner = await tx.user.findFirst({
          where: { tenantId, role: 'OWNER' },
          select: { email: true },
        });
        const daysToActivate = Math.ceil(
          (now.getTime() - current.accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        console.warn('[activation-tracker] tenant.activated firing', { tenantId, daysToActivate });
        await tx.appEvent.create({
          data: {
            tenantId,
            eventType: 'tenant.activated',
            properties: {
              tenantId,
              ownerEmail: owner?.email ?? '',
              completionPct: 100,
              daysToActivate,
            },
          },
        });
      }
    }, TX_OPTIONS);
  } catch (err) {
    // NEVER propagate — user action must succeed regardless of tracker outcome
    console.error('[activation-tracker] recordActivationEvent failed', { tenantId, event, err });

    // Best-effort: write error event (separate connection, bypass_rls)
    try {
      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        await tx.appEvent.create({
          data: {
            tenantId,
            eventType: 'activation.tracker.error',
            properties: {
              tenantId,
              intendedEvent: event,
              errorMessage: err instanceof Error ? err.message : String(err),
            },
          },
        });
      }, TX_OPTIONS);
    } catch {
      // Truly silent — if even the error event fails, swallow it
    }
  }
}
```

### Behavior analysis

- **DB lookup before stamping?** Yes — `tx.activationProgress.findUnique({ where: { tenantId } })` is called first. If the row does not exist (`!current`), the function returns silently without writing anything.
- **Checks existence in legacy/old tables?** No. Only `ActivationProgress` is queried.
- **Writes to Prisma model:** `tx.activationProgress.update({ where: { tenantId }, data: updateData })` and `tx.appEvent.create(...)`.
- **tenantId resolution:** The `tenantId` parameter is passed in directly by the caller. In carrier routes, callers pass `session.tenantId` (read from Supabase auth `app_metadata`) as `orgId`, then pass `orgId` to `recordActivationEvent`. The value is the same UUID that keys the `ActivationProgress.tenantId` field.
- **Prisma client used:** The bare `prisma` singleton from `@/lib/db/prisma` — NOT the tenant-scoped `getTenantPrisma()` client. The bare client has no `withTenantRLS` extension and no `withAuditColumns` extension applied. It connects as the `postgres` role which has `BYPASSRLS` privilege.
- **RLS interaction:** `ActivationProgress` has `FORCE ROW LEVEL SECURITY` (migration `20260429000001_tenant_self_onboarding`, line 375). However, `FORCE ROW LEVEL SECURITY` does NOT override `BYPASSRLS` — the PostgreSQL docs confirm "With both FORCE ROW LEVEL SECURITY and BYPASSRLS, the BYPASSRLS attribute takes precedence." The `postgres` role therefore bypasses all RLS on `ActivationProgress`. The `set_config('app.bypass_rls', 'on', TRUE)` call in the transaction is redundant but harmless.
- **Silent failure path:** Any exception inside the outer `try` block is caught, logged via `console.error`, and swallowed. An error `AppEvent` is written to `AppEvent` (best-effort). The caller NEVER sees an error.

---

## 2. All Call Sites of recordActivationEvent

| File | Line | Event | Context |
|------|------|-------|---------|
| `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts` | 119 | `'first_real_truck'` | Inside POST handler, outside `after()`, guarded by `if (!carrierTruck.isSample)`. Awaited synchronously before `return NextResponse.json(...)`. |
| `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts` | 93 | `'first_real_driver'` | Inside POST handler, outside `after()`, NO `isSample` guard (always fires for any `carrierDriver`). Awaited synchronously before `return NextResponse.json(...)`. |
| `apps/web/src/app/api/v1/carrier/clients/route.ts` | 104 | `'first_real_client'` | Inside POST handler, outside `after()`, guarded by `if (!client.isSample)`. Awaited synchronously before `return NextResponse.json(...)`. |
| `apps/web/src/lib/carrier/dispatches.ts` | 619 | `'first_load_in_transit'` | Inside `transitionDispatchStatus`, guarded by `realLoadCount > 0` on non-sample loads. |
| `apps/web/src/app/api/auth/accept-invitation/route.ts` | 255 | `'first_real_driver'` | Inside invitation-accept handler, fires when `userRole === 'DRIVER'`. Uses `invitation.tenantId`. |
| `apps/web/src/app/(owner)/actions/customers.ts` | 75 | `'first_real_client'` | Inside legacy `createCustomer` server action. |
| `apps/web/src/app/(owner)/actions/drivers.ts` | 205 | `'first_real_driver'` | Inside legacy `inviteDriver` server action (fires at invite time, not accept time). |
| `apps/web/src/app/(owner)/actions/loads.ts` | 608 | `'first_load_in_transit'` | Inside legacy `updateLoadStatus` server action, when `newStatus === 'IN_TRANSIT' && !load.isSample`. |
| `apps/web/src/app/(owner)/actions/trucks.ts` | 130 | `'first_real_truck'` | Inside legacy `createTruck` server action. |

---

## 3. Carrier POST Route Audit

### 3a. Truck — `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts`

- **Imports recordActivationEvent?** Yes (line 9): `import { recordActivationEvent } from '@/lib/onboarding/activation-tracker'`
- **Calls recordActivationEvent?** Yes (line 119): `await recordActivationEvent(orgId, 'first_real_truck')`
- **Placement:** Outside `after()`, awaited synchronously before the `return NextResponse.json({ data: carrierTruck }, { status: 201 })` on line 125
- **Guard:** `if (!carrierTruck.isSample)` — passes for all real user creates (schema default `@default(false)`)
- **Arguments:** `orgId` (= `session.tenantId`), `'first_real_truck'`
- **tenantId source:** `session.tenantId` from `getSession()` (reads from Supabase `app_metadata.tenantId`)
- **Prisma write target (truck creation):** `tenantPrisma.carrierTruck.create(...)` inside `createCarrierTruck()` in `apps/web/src/lib/carrier/fleet-trucks.ts` line 164

### 3b. Driver — `apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts`

- **Imports recordActivationEvent?** Yes (line 9): `import { recordActivationEvent } from '@/lib/onboarding/activation-tracker'`
- **Calls recordActivationEvent?** Yes (line 93): `await recordActivationEvent(orgId, 'first_real_driver')`
- **Placement:** Outside `after()`, awaited synchronously before the `return NextResponse.json(...)` on line 98
- **Guard:** None — fires unconditionally for every `carrierDriver` create, including samples (unlike truck/client routes which check `isSample`)
- **Arguments:** `orgId` (= `session.tenantId`), `'first_real_driver'`
- **tenantId source:** `session.tenantId` from `getSession()`
- **Prisma write target (driver creation):** `tenantPrisma.carrierDriver.create(...)` inside `createCarrierDriver()` in `apps/web/src/lib/carrier/fleet-drivers.ts` line 199

### 3c. Client — `apps/web/src/app/api/v1/carrier/clients/route.ts`

- **Imports recordActivationEvent?** Yes (line 7): `import { recordActivationEvent } from '@/lib/onboarding/activation-tracker'`
- **Calls recordActivationEvent?** Yes (line 104): `await recordActivationEvent(orgId, 'first_real_client')`
- **Placement:** Outside `after()`, awaited synchronously before the `return NextResponse.json({ data: client }, { status: 201 })` on line 110
- **Guard:** `if (!client.isSample)` — passes for all real user creates
- **Arguments:** `orgId` (= `session.tenantId`), `'first_real_client'`
- **tenantId source:** `session.tenantId` from `getSession()`
- **Prisma write target (client creation):** `tenantPrisma.carrierClient.create(...)` inside `createClient()` in `apps/web/src/lib/carrier/clients.ts` line 217

---

## 4. schema.prisma @@map Directives

| Model | @@map value | Notes |
|-------|-------------|-------|
| `Truck` | **none** | Table name defaults to `"Truck"` (PascalCase, Prisma convention without @@map) |
| `Customer` | **none** | Table name defaults to `"Customer"` |
| `User` | **none** | Table name defaults to `"User"` |
| `Driver` (model) | **does not exist** | No model named `Driver` in schema. Driver-like models are `CarrierDriver` and the legacy driver-as-User pattern |
| `CarrierDriver` | `@@map("carrier_drivers")` | Postgres table: `carrier_drivers` |
| `CarrierTruck` | `@@map("carrier_trucks")` | Postgres table: `carrier_trucks` |
| `CarrierClient` | `@@map("clients")` | Postgres table: `clients` |
| `ActivationProgress` | **none** | Table name defaults to `"ActivationProgress"` (PascalCase) — confirmed by migration DDL: `CREATE TABLE IF NOT EXISTS "ActivationProgress"` |

**Key observation:** The `ActivationProgress` model has no `@@map` directive. Its Postgres table is literally `"ActivationProgress"` (quoted, case-sensitive). The `recordActivationEvent` function writes to `tx.activationProgress` (Prisma model name), which correctly maps to the `"ActivationProgress"` table. No name mismatch exists between model and table.

**Key observation on tenant ID field naming:** The carrier models (`CarrierTruck`, `CarrierDriver`, `CarrierClient`) use `orgId` (mapping to `org_id` in SQL) as their tenant scoping field. The `ActivationProgress` model uses `tenantId` (mapping to `"tenantId"` in SQL — no `@map` on the field). The carrier routes pass `session.tenantId` as `orgId` to carrier library functions, and the SAME value (`session.tenantId`) is passed directly to `recordActivationEvent(orgId, event)`. Since `session.tenantId` and the `ActivationProgress.tenantId` FK both reference `Tenant.id`, the UUID values match. There is no tenant ID field name mismatch causing the writes to target a wrong row.

---

## 5. Gap Analysis

### Path A: What updates activation_progress

`recordActivationEvent` in `apps/web/src/lib/onboarding/activation-tracker.ts`:

1. Uses bare `prisma` (no RLS extension)
2. Opens a transaction, sets `app.bypass_rls = 'on'` (redundant for `postgres` role which has BYPASSRLS)
3. Calls `tx.activationProgress.findUnique({ where: { tenantId } })`
4. **If `current` is `null`: returns silently with no write, no error, no log at WARN or ERROR level**
5. If `current` exists and the event field is already set: returns silently (idempotency)
6. If `current` exists and the field is null: updates `firstReal*At`, recalculates `completionPct`, writes two `AppEvent` rows

The `ActivationProgress` row is created **only** during tenant provisioning in `apps/web/src/lib/onboarding/provision-tenant.ts` (Step 9, line 126: `tx.activationProgress.create({ data: { tenantId: tenant.id, ... } })`). This provisioning path was introduced in migration `20260429000001_tenant_self_onboarding`.

**Any tenant whose account was created before this migration was applied, OR whose account was provisioned via an older code path that did not include Step 9, will have NO `ActivationProgress` row.** When `recordActivationEvent` runs for such a tenant, `current` is `null`, the function returns immediately, and the carrier write appears to succeed (from the user's perspective) while the activation tracker silently does nothing.

### Path B: What the carrier UI writes

The carrier portal POST routes (`/api/v1/carrier/fleet/trucks`, `/api/v1/carrier/fleet/drivers`, `/api/v1/carrier/clients`) call the respective library functions (`createCarrierTruck`, `createCarrierDriver`, `createClient`) which use `getTenantPrisma()` — a tenant-scoped Prisma client with `withTenantRLS` applied. These functions write to:
- `tenantPrisma.carrierTruck.create(...)` → `"carrier_trucks"` table
- `tenantPrisma.carrierDriver.create(...)` → `"carrier_drivers"` table
- `tenantPrisma.carrierClient.create(...)` → `"clients"` table

These writes succeed regardless of whether an `ActivationProgress` row exists.

### Precise gap

All three carrier POST routes (truck, driver, client) DO import and call `recordActivationEvent` synchronously before returning the 201 response. The call uses the correct `tenantId` value. The `ActivationProgress` model has no `@@map` mismatch. The write path mechanics are correct.

The gap is: **`recordActivationEvent` opens with `tx.activationProgress.findUnique({ where: { tenantId } })` and silently returns (line 64: `if (!current) return;`) if no `ActivationProgress` row exists for the tenant.** The row is only created during tenant provisioning via `provision-tenant.ts`. For Jordan Expedite — a tenant created before the self-onboarding migration (`20260429000001_tenant_self_onboarding`) or via a pre-Step-9 provisioning code path — no `ActivationProgress` row was ever seeded. Every call to `recordActivationEvent` from every carrier route hits the `!current` guard and exits silently. The `activation_progress` table row for Jordan Expedite simply does not exist, so no amount of truck/driver/client creates will ever update it.

---

## 6. Final Output (REQUIRED — exact format)

TKT-0040 fifth diagnostic complete. activation_progress is updated by [apps/web/src/lib/onboarding/activation-tracker.ts → recordActivationEvent → tx.activationProgress.update({ where: { tenantId } })], carrier UI writes via [POST /api/v1/carrier/fleet/trucks → createCarrierTruck → tenantPrisma.carrierTruck.create / POST /api/v1/carrier/fleet/drivers → createCarrierDriver → tenantPrisma.carrierDriver.create / POST /api/v1/carrier/clients → createClient → tenantPrisma.carrierClient.create], gap is [recordActivationEvent silently no-ops on line 64 (`if (!current) return`) when no ActivationProgress row exists for the tenant — Jordan Expedite's ActivationProgress row was never seeded because the account predates provision-tenant.ts Step 9 (migration 20260429000001_tenant_self_onboarding), so every carrier create call hits the missing-row guard and exits without writing].
