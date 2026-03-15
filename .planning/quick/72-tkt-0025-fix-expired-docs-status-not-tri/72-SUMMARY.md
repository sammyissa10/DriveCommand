---
phase: quick-72
plan: "01"
subsystem: trucks
tags: [bug-fix, truck-status, document-metadata, compliance]
dependency_graph:
  requires: []
  provides: [documentMetadata expiry check in computeTruckStatus]
  affects: [truck status badges everywhere TruckWithRelations is consumed]
tech_stack:
  added: []
  patterns: [JSON field parsing with runtime type narrowing via cast]
key_files:
  created: []
  modified:
    - src/lib/trucks/compute-truck-status.ts
decisions:
  - "Keep TruckWithRelations.documentMetadata as unknown (matches Prisma JsonValue) and cast to DocumentMetadata | null only at the hasExpiredMetadataDate call site, avoiding TS2322 assignment errors from callers."
metrics:
  duration: 73s
  completed: "2026-03-15"
---

# Phase quick-72 Plan 01: Fix Expired Docs Status Not Triggering for documentMetadata Summary

**One-liner:** Extended `computeTruckStatus` to parse `registrationExpiry` and `insuranceExpiry` ISO date strings from the `documentMetadata` JSON field, so trucks with expired registration or insurance metadata correctly show "Expired Docs" status alongside the existing `Document` model check.

## What Was Built

`computeTruckStatus` previously only checked the `truck.documents` relation for expired docs. Trucks whose registration and insurance expiry dates are stored in the `documentMetadata` JSONB field were silently ignored, causing those trucks to show "Ready to Use" even when their docs were expired.

The fix adds:

1. A `DocumentMetadata` interface defining the four metadata fields (`registrationNumber`, `registrationExpiry`, `insuranceNumber`, `insuranceExpiry`).
2. A `hasExpiredMetadataDate` helper that accepts `DocumentMetadata | null | undefined`, iterates the two expiry fields, parses each with `new Date()`, validates the result is not `NaN`, and returns `true` if either date is before now.
3. An OR clause in the `hasExpiredDocs` expression that calls `hasExpiredMetadataDate(truck.documentMetadata as DocumentMetadata | null)` — fully backward-compatible with the existing `Document` model check.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Parse documentMetadata expiry dates in computeTruckStatus | d612c1d | src/lib/trucks/compute-truck-status.ts |

## Deviations from Plan

**1. [Rule 1 - Bug] Reverted documentMetadata interface field back to `unknown`**
- **Found during:** Task 1 verification (tsc --noEmit)
- **Issue:** Changing `TruckWithRelations.documentMetadata` from `unknown` to `DocumentMetadata | null` caused TS2322 in `src/app/(owner)/trucks/page.tsx` because Prisma's `JsonValue` type (which includes `string`, `number`, etc.) is not assignable to the narrower `DocumentMetadata | null` type.
- **Fix:** Reverted the interface field to `unknown` (preserving backward-compat with all callers) and applied the `DocumentMetadata | null` cast only at the `hasExpiredMetadataDate` call site inside `computeTruckStatus`, exactly as the plan's note suggested.
- **Files modified:** src/lib/trucks/compute-truck-status.ts
- **Commit:** d612c1d

## Verification

- `npx tsc --noEmit` passes with no errors
- `documentMetadata`, `registrationExpiry`, and `insuranceExpiry` all appear in the updated file
- Existing `Document` model expiry check preserved (OR, not replaced)

## Self-Check: PASSED

- FOUND: src/lib/trucks/compute-truck-status.ts
- FOUND: commit d612c1d
