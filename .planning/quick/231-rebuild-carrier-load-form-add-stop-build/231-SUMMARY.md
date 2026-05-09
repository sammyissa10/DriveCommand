---
phase: quick-231
plan: 01
subsystem: carrier-ops/loads
tags: [load-form, stop-builder, r2-upload, financials, tenant-isolation]
dependency_graph:
  requires:
    - CarrierStop model (dispatchId required constraint)
    - /api/v1/carrier/documents (R2 upload endpoint)
    - StopBuilder / StopCard components
    - CarrierFacility model (facility lookup for tenant isolation)
  provides:
    - Rebuilt 5-section load form (create + edit)
    - Stop persistence on loads with dispatch assigned
    - Rate confirmation R2 upload wired
    - Financial preview with zero-row suppression
  affects:
    - apps/web/src/components/carrier/loads/LoadForm.tsx
    - apps/web/src/components/carrier/loads/LoadFinancials.tsx
    - apps/web/src/components/carrier/loads/LoadList.tsx
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    - apps/web/src/lib/carrier/loads.ts
tech_stack:
  patterns:
    - Stop persistence with dispatchId constraint (CarrierStop.dispatchId required — stops only persist when load has dispatch)
    - StopInput schema in Zod for API validation
    - persistStops helper: tenant isolation check + transaction for diff (create/update/delete)
    - R2 upload via /api/v1/carrier/documents as FormData POST
    - LoadFinancials hides zero rows (no $0.00 Detention clutter)
key_files:
  modified:
    - apps/web/src/components/carrier/loads/LoadForm.tsx
    - apps/web/src/components/carrier/loads/LoadFinancials.tsx
    - apps/web/src/components/carrier/loads/LoadList.tsx
    - apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx
    - apps/web/src/app/api/v1/carrier/loads/route.ts
    - apps/web/src/app/api/v1/carrier/loads/[id]/route.ts
    - apps/web/src/lib/carrier/loads.ts
decisions:
  - "Stops only persisted when load has a dispatchId (CarrierStop.dispatchId is required/non-nullable) — info banner shown otherwise"
  - "FSC removed from load form (inherited read-only from contract, computed in LoadFinancials)"
  - "LoadList uses load.client?.name from API include instead of clientMap lookup"
  - "Rate confirmation upload happens after load save (create mode: save first, get ID, then upload)"
metrics:
  completed: "2026-04-16"
  tasks: 2
  files: 7
---

# Phase quick-231 Plan 01: Rebuild Carrier Load Form + Stop Builder Summary

**One-liner:** Rebuilt carrier load form into 5 clean sections with active stop builder, R2 rate confirmation upload, and zero-row-suppressed financial preview.

## What Was Built

### Task 1: Rebuild LoadForm layout, remove dead fields, fix client display, add dynamic labels and R2 upload

Completely rebuilt `LoadForm.tsx` into 5 ordered sections:

1. **Client & Contract** — unchanged, client dropdown shows company names, contract auto-populates rate fields
2. **Freight Details** — removed PRO Number and Pallets fields; kept Load Type, Commodity Description, Weight, Pieces, Hazmat toggle, BOL Number, PO Number
3. **Stops** — `StopBuilder` now visible in both create AND edit modes. Info banner shown when load has no dispatch ("Stops will be saved when assigned to a dispatch"). Edit mode initializes stops from existing load data.
4. **Rate & Financials** — removed FSC Method/Rate editable fields (FSC is contract-inherited). Removed Appointments section entirely (moved to stop-level). Merged Broker Mode toggle into this section. Financial Preview (LoadFinancials) inline at bottom.
5. **References** — Rate Confirmation upload wired to R2 via `/api/v1/carrier/documents`. In edit mode fetches existing rate confirmation docs and shows download links. Driver Instructions textarea kept.

`LoadFinancials.tsx` updated to hide zero-value rows: FSC only shown if non-zero or has a note, Accessorial/Other only shown if non-zero, Detention row removed entirely (was always $0.00).

`LoadList.tsx` updated to use `load.client?.name` from the API response (the listLoads query already includes `client: { select: { name: true } }`), with clientMap as fallback. LoadItem interface updated to include `client: { name: string } | null`.

`[id]/page.tsx` maps `load.stops` from Prisma format to `StopBuilderStop[]` and passes as `initialData.stops` to LoadForm.

`lib/carrier/loads.ts` `getLoad` updated to include `facility: { select: { name: true, city: true, state: true } }` in stops include for the field mapping.

### Task 2: Wire stop persistence in load create/update API

Added `StopInputSchema` (Zod) to both `LoadCreateSchema` and `LoadUpdateSchema` in the API routes. The schema validates `facility_id`, `stop_type`, `sequence_order`, and optional stop-level fields.

Added `StopInput` type and `stops?: StopInput[]` to both `LoadCreateInput` and `LoadUpdateInput` in `lib/carrier/loads.ts`.

Added `persistStops()` helper function:
- Verifies all `facility_id` values belong to the org (tenant isolation — queries CarrierFacility with orgId filter)
- Fetches existing stops for the load
- Diffs: updates stops with matching IDs, creates stops without IDs, deletes existing stops not in payload (only if `status === 'pending'`)
- All operations run in a single Prisma `$transaction`

`createLoad` calls `persistStops` after creating the load when `dispatchId` is present.

`updateLoad` calls `persistStops` after updating using the effective dispatchId (newly assigned or pre-existing).

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check

### Files Verified
- `apps/web/src/components/carrier/loads/LoadForm.tsx` — exists, 5 sections, no dead fields
- `apps/web/src/components/carrier/loads/LoadFinancials.tsx` — exists, zero-row suppression applied
- `apps/web/src/components/carrier/loads/LoadList.tsx` — exists, uses load.client?.name
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` — exists, stops mapped and passed
- `apps/web/src/app/api/v1/carrier/loads/route.ts` — exists, StopInputSchema added
- `apps/web/src/app/api/v1/carrier/loads/[id]/route.ts` — exists, StopInputSchema added
- `apps/web/src/lib/carrier/loads.ts` — exists, persistStops helper added

### TypeScript
`npx tsc --noEmit` — passed (zero errors in src/, only pre-existing e2e test errors in e2e/ unrelated to this task)

### Commits
- `cc4da02` — feat(quick-231): rebuild load form with 5 sections, stop builder, R2 upload, hide zero rows
- `c0fcaf7` — feat(quick-231): wire stop persistence in load create/update API

## Self-Check: PASSED
