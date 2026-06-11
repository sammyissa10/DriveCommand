# Quick Task 437 — Summary

**Task:** Fix trip edit pencil 404 and gate it to planned trips
**Commit:** 55ff54bb
**Date:** 2026-06-11

## What changed

**File:** `apps/web/src/app/(owner)/carrier/trips/_grid/DispatchesGrid.tsx`

Single edit action definition changed (3 lines added, 1 changed):

- `onClick` URL: `/carrier/trips/${row.id}/edit` → `/carrier/trips/${row.id}`
- Added `disabled: row.status !== 'planned'`
- Added `disabledTooltip: 'Cannot edit an active or completed trip'`

## Verification

1. ✅ `next build` passes (exit 0)
2. ✅ Planned trip pencil → navigates to `/carrier/trips/<id>` (detail page with inline Edit dialog)
3. ✅ Non-planned trips (in_progress/completed/cancelled/tonu) → pencil greyed, cursor-not-allowed, tooltip "Cannot edit an active or completed trip"
4. ✅ No `/[id]/edit` route created
5. ✅ DispatchHeader.tsx untouched — inline Edit dialog unaffected
6. ✅ Status gate matches DispatchHeader exactly (`row.status !== 'planned'` covers all locked statuses)
7. ✅ User-facing copy says "trip", not "dispatch"
