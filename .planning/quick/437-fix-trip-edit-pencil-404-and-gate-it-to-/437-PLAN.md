# Quick Task 437 — Fix trip edit pencil 404 and gate it to planned trips

## Goal
Fix the edit (pencil) button in the Trips list grid so it:
1. Routes to `/carrier/trips/<id>` (detail page) instead of the non-existent `/carrier/trips/<id>/edit`.
2. Is disabled with tooltip for any status other than `planned`, matching the detail-page `isLocked || isInProgress` gate in DispatchHeader.tsx.

## Context
- Stale href from Dispatches→Trips rename (diagnosed as quick-437).
- `QuickAction` interface already supports `disabled` and `disabledTooltip` — no new components needed.
- Locked statuses (from DispatchHeader line 247–248): `in_progress`, `completed`, `cancelled`, `tonu`.
- `planned` is the only editable status.

## Tasks

### Task 1 — Fix edit action in DispatchesGrid.tsx
**File:** `apps/web/src/app/(owner)/carrier/trips/_grid/DispatchesGrid.tsx`

Change the `edit` QuickAction (lines ~157–162) from:
```ts
{
  id: 'edit',
  label: 'Edit',
  icon: Pencil,
  onClick: () => router.push(`/carrier/trips/${row.id}/edit`),
},
```
To:
```ts
{
  id: 'edit',
  label: 'Edit',
  icon: Pencil,
  onClick: () => router.push(`/carrier/trips/${row.id}`),
  disabled: row.status !== 'planned',
  disabledTooltip: 'Cannot edit an active or completed trip',
},
```

That's the entire change. No other files touched.

## Verification
- `row.status !== 'planned'` disables for `in_progress`, `completed`, `cancelled`, `tonu` — matches DispatchHeader gate exactly.
- `disabledTooltip` is shown as tooltip text when button is greyed/cursor-not-allowed (QuickActions.tsx lines 148–150, 163).
- No new route created. No DispatchHeader change. No schema change.
