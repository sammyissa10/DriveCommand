---
phase: quick-286
plan: "01"
subsystem: workflows
tags: [bug-fix, carrier-module, vehicle, checklist]
dependency_graph:
  requires: []
  provides: [verifyEntity-CarrierTruck]
  affects: [generatePlaybookInstance, StartChecklistDialog]
tech_stack:
  added: []
  patterns: [prisma.carrierTruck with orgId tenant scoping]
key_files:
  created: []
  modified:
    - apps/web/src/server/services/workflows/generatePlaybookInstance.ts
decisions:
  - "VEHICLE entity verification now uses prisma.carrierTruck with orgId instead of legacy prisma.truck with tenantId"
metrics:
  duration: "5 minutes"
  completed: "2026-04-25"
  tasks_completed: 1
  files_modified: 1
---

# Quick-286: Fix Vehicle Not Found Error in Start Checklist

## One-liner

Swapped `prisma.truck.findFirst` for `prisma.carrierTruck.findFirst` (with `orgId: tenantId`) in `verifyEntity()` so the Start Checklist dialog no longer throws "Vehicle not found" when selecting a CarrierTruck.

## What was done

**Task 1 — Swap legacy Truck lookup for CarrierTruck in verifyEntity()**

The `verifyEntity()` helper in `generatePlaybookInstance.ts` was querying the legacy `truck` table (`prisma.truck.findFirst({ where: { id: entityId, tenantId } })`). The Start Checklist dialog at `StartChecklistDialog.tsx:79` loads vehicle options from `/api/v1/carrier/fleet/trucks`, which is backed by the carrier-module `carrier_trucks` table (`CarrierTruck`). Since the `entityId` submitted to the `generate` mutation is a `CarrierTruck.id`, the legacy lookup always missed and threw "Vehicle not found".

**Root cause:**

Two separate fleet tables exist:
- `truck` — legacy fleet table (`tenantId` for tenant scoping)
- `carrier_trucks` — carrier-module table (`orgId` for tenant scoping)

The dialog was already correct (using carrier trucks). Only the server-side verification was pointing at the wrong table.

**Fix:**

```ts
// Before
const truck = await prisma.truck.findFirst({ where: { id: entityId, tenantId } });

// After
const truck = await prisma.carrierTruck.findFirst({
  where: { id: entityId, orgId: tenantId },
});
```

**Key nuance — orgId vs tenantId:**

The carrier module uses `orgId` (mapped to `org_id` column) as its tenant scoping field, not `tenantId`. This is the established convention across the carrier module (see `apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts:99` and `apps/web/src/actions/carrier/save-route-template.ts:111`). Using `orgId: tenantId` in the filter preserves tenant isolation.

**Unchanged:**
- `StartChecklistDialog.tsx` — was already correct, not touched
- `instance.ts` (tRPC router) — not touched
- DRIVER branch in `verifyEntity()` — still `prisma.user.findFirst`
- PARTNER branch in `verifyEntity()` — still `prisma.customer.findFirst`

## Verification

- `tsc --noEmit -p apps/web` — passes (no output = clean)
- `grep prisma.carrierTruck.findFirst generatePlaybookInstance.ts` → 1 match (VEHICLE branch)
- `grep prisma.truck.findFirst generatePlaybookInstance.ts` → 0 matches

## Deviations from Plan

None — plan executed exactly as written. One additional comment on line 40 was updated from "Truck for VEHICLE" to "CarrierTruck for VEHICLE" as specified.

## Self-Check: PASSED

- File modified: `apps/web/src/server/services/workflows/generatePlaybookInstance.ts` — FOUND
- Commit `5b42d39` exists — FOUND
- `prisma.carrierTruck.findFirst` present in VEHICLE branch — FOUND
- `prisma.truck.findFirst` absent from file — CONFIRMED
