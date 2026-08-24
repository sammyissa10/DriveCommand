# quick-533 — Wire facility delete to the canonical soft-delete pattern

**Date:** 2026-08-24
**Prior art:** quick-530 (added `facilities.deleted_at`, fixed `softDeleteFacility`), quick-531 (facility-ownership error standardisation), quick-532 (read-only diagnosis of the delete no-op)

---

## Step 1 survey — how the siblings wire this pattern

### The pattern is generic, not per-entity

There is no `softDeleteFacility`-style server action per entity. The canonical pattern is **one generic pair of server actions keyed by a string union**:

- `apps/web/src/lib/carrier/soft-delete.ts` — `SoftDeletableEntity` union + `ENTITY_DISPLAY_NAMES` + `ENTITY_PLURAL_NAMES` + retention constants
- `apps/web/src/actions/carrier/soft-delete.ts` — `softDeleteRecords` / `restoreRecords` / `permanentlyDeleteRecords`, each holding its own `modelMap` from union member → Prisma delegate
- `apps/web/src/hooks/useSoftDelete.ts` — dialog state + optimistic toast with an 8s Undo that calls `restoreRecords`
- `apps/web/src/components/shared/DeleteConfirmationDialog.tsx` — the confirm dialog

### The seven grids already wired

| Grid | `entityType` |
|---|---|
| `carrier/clients/_grid/ClientsGrid.tsx` | `CarrierClient` |
| `carrier/contracts/_grid/ContractsGrid.tsx` | `CarrierContract` |
| `carrier/fleet/drivers/_grid/DriversGrid.tsx` | `CarrierDriver` |
| `carrier/fleet/trucks/_grid/TrucksGrid.tsx` | `CarrierTruck` |
| `carrier/loads/_grid/LoadsGrid.tsx` | `CarrierLoad` |
| `carrier/trips/_grid/DispatchesGrid.tsx` | `Trip` |
| `routes/_grid/RoutesGrid.tsx` | `Route` |

(The brief said five; it is seven. `Trip` and `Route` are wired the same way.)

### The canonical wiring, quoted in full — `ClientsGrid.tsx`

```tsx
import { useSoftDelete } from '@/hooks/useSoftDelete';
import { DeleteConfirmationDialog } from '@/components/shared/DeleteConfirmationDialog';

const {
  isPending: isDeletePending,
  dialogOpen,
  itemCount,
  itemName,
  requestDelete,
  confirmDelete,
  setDialogOpen,
} = useSoftDelete({
  entityType: 'CarrierClient',
  onSuccess: () => router.refresh(),
});

// row action
actions.push({
  id: 'delete',
  label: 'Delete',
  icon: Trash2,
  onClick: () => requestDelete(row.id),
  destructive: true,
});

// bulk action
const bulkActions = useMemo(
  () => [
    {
      id: 'delete',
      label: 'Delete',
      icon: Trash2,
      onClick: () => requestDelete(Array.from(selectedIds)),
      destructive: true,
    },
  ],
  [selectedIds, requestDelete]
);

// return: fragment wrapping GridShell + the dialog
<>
  <GridShell … />
  <DeleteConfirmationDialog
    open={dialogOpen}
    onOpenChange={setDialogOpen}
    onConfirm={confirmDelete}
    itemCount={itemCount}
    itemName={itemName}
    isLoading={isDeletePending}
  />
</>
```

Both paths funnel into the **same** `requestDelete`, which is why the bulk path gets confirmation for free — the row action and the bulk action differ only in whether they pass one id or an array.

### Every file that must change to add an eighth entity

1. `apps/web/src/lib/carrier/soft-delete.ts` — union + `ENTITY_DISPLAY_NAMES` + `ENTITY_PLURAL_NAMES` (both are `Record<SoftDeletableEntity, string>`, so both are compile-enforced)
2. `apps/web/src/actions/carrier/soft-delete.ts` — **three** `modelMap` objects, not two. `permanentlyDeleteRecords` holds a third; indexing it with a widened union is a compile error, so it must be updated in the same edit. Same file as the two named in scope.
3. `apps/web/src/app/(owner)/carrier/facilities/_grid/FacilitiesGrid.tsx` — hook, two call sites, dialog

Grep-verified: only those two `Record<SoftDeletableEntity, …>` maps exist repo-wide. `RecentlyDeletedGrid.tsx` uses the type only as a field annotation, so widening does not break it.

---

## BLOCKER FOUND DURING SURVEY — `facilities` has no `deleted_by_id`

`softDeleteRecords` writes:

```ts
data: { deletedAt: now, deletedById: userId }
```

through `(model as any).updateMany(...)`. **The `as any` means tsc cannot catch a missing column.** Verified two ways:

- `schema.prisma`: all seven currently-soft-deletable models declare `deletedById`; `CarrierFacility` declares only `deletedAt`.
- Production `information_schema.columns`: `clients`, `carrier_drivers` etc. have both `deleted_at` and `deleted_by_id`; `facilities` has **only** `deleted_at`.

Dropping `CarrierFacility` into the modelMaps unmodified would compile cleanly and then throw `Unknown argument 'deletedById'` at runtime on the first click — trading a silent no-op for a silent 500. `restoreRecords` has the same defect (`deletedById: null`).

**Resolution, within the no-DDL constraint:** build the mutation payload per entity, omitting `deletedById` for `CarrierFacility` only, with the reason stated at the site.

---

## Tasks

### Task 1 — extend the union and both label maps
`lib/carrier/soft-delete.ts`: add `CarrierFacility`, `'Facility'`, `'Facilities'`.

### Task 2 — extend the three modelMaps and guard the missing column
`actions/carrier/soft-delete.ts`: add `CarrierFacility: tenantPrisma.carrierFacility` to all three maps; make the `data` payload in `softDeleteRecords` and `restoreRecords` omit `deletedById` for facilities.

### Task 3 — replace both stubs in `FacilitiesGrid.tsx`
Row action and bulk action both call `requestDelete`; render `DeleteConfirmationDialog`; `onSuccess: () => router.refresh()`.

### Task 4 — verification
Probe the tsc gate with a deliberate error, confirm it reports **that** error, remove it, run the real typecheck, run the suite, diff against the pre-task commit.

---

## Out of scope (report only)

- Bulk request cost (step 5)
- `shell/QuickActions.tsx`, `shell/BulkActionsBar.tsx`, `shell/DeleteConfirmDialog.tsx` dead-code grep (step 6)
- `status: 'inactive'` in the DELETE response (step 7)
- The portal event-bubbling defect (explicitly deferred by the brief)
- Recently Deleted coverage for facilities — see SUMMARY
