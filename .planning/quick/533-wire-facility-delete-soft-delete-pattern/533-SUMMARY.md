# quick-533 — Summary

**Date:** 2026-08-24
**Commits:** `f5784d7d`, `f77dc5cb`, `b96d6069`
**tsc:** 0 errors, gate probe-verified live
**Tests:** no regressions (working-tree failures are a strict subset of baseline)

---

## What shipped

Facilities now delete from the grid, through the same path as the other seven entities.

| File | Change |
|---|---|
| `lib/carrier/soft-delete.ts` | `CarrierFacility` added to the union and both label maps; new `HAS_DELETED_BY` map |
| `actions/carrier/soft-delete.ts` | `CarrierFacility` added to all **three** modelMaps; `deletedById` omitted for facilities in the two mutating payloads |
| `carrier/facilities/_grid/FacilitiesGrid.tsx` | both stubs replaced; `DeleteConfirmationDialog` rendered |
| `api/v1/carrier/facilities/[id]/route.ts` | `status: 'inactive'` → `status: 'deleted'` + `deletedAt` |

---

## The blocker the brief did not anticipate

**`facilities` has `deleted_at` but no `deleted_by_id`.** Every other soft-deletable table has both — verified in `schema.prisma` *and* against production `information_schema.columns`.

`softDeleteRecords` writes `data: { deletedAt, deletedById }` through `(model as any)`. **The `as any` means tsc cannot see the missing column.** Adding `CarrierFacility` to the modelMaps unmodified would have compiled clean and thrown `Unknown argument 'deletedById'` on the first click — trading a silent no-op for a silent 500, which is worse than the bug being fixed.

Resolution within the no-DDL constraint: `HAS_DELETED_BY: Record<SoftDeletableEntity, boolean>` in the constants file, consulted when building the payload. A `Record` rather than an inline `entityType === 'CarrierFacility'` check because it is the only part of that `as any` path a type-checker can still police — a ninth entity fails the build until someone states which kind it is.

---

## Step 5 — bulk delete cost

**No. The bulk path issues exactly ONE request for N facilities**, not N.

`requestDelete(Array.from(selectedIds))` passes the whole array to `softDeleteRecords`, which issues a single `updateMany` with `id: { in: ids }`. Undo is likewise one `updateMany`. There is nothing to decide separately — no bulk endpoint is needed, and adding one would be redundant.

(The N-request shape the brief anticipated would only have arisen had the grid been wired to the per-id REST route, which the decision explicitly ruled out. That is a second, independent argument for the decision.)

---

## Step 6 — dead shell components

**Zero importers, from anywhere:**

- `components/data-grid/shell/QuickActions.tsx`
- `components/data-grid/shell/BulkActionsBar.tsx`
- `components/data-grid/shell/DeleteConfirmDialog.tsx`

`shell/index.ts` exports the `./shared/*` versions, not these. The only references found are **between the three of them** — `shell/QuickActions.tsx` and `shell/BulkActionsBar.tsx` each import `./DeleteConfirmDialog`. That is a closed island: nothing outside reaches in.

**Safe to remove as a set in a later task.** Removing only one or two would break the survivors — they must go together.

---

## Step 7 — the `'inactive'` status

**Nothing consumed it, so it was changed** (as the brief directed).

Correction to the brief's premise: it stated the grid stub meant "there is no working facility delete path in the UI". There were in fact two working callers of the DELETE route, both on the **detail** page — `DeleteFacilityButton.tsx` and `FacilityEditMobile.tsx`. The gap was the grid specifically. Both callers branch on `res.ok` and read `data.error`; neither reads `data.status`, and no other code does either.

---

## Steps 8 & 9 — verification

**tsc probe.** Injected `const __probe533: number = "not a number"` into `lib/carrier/soft-delete.ts`. tsc reported *that* error and only that error, in the file actually edited — so semantic checking was live, not blinded by a stray parse error under `.next/`. Probe removed; real run is **0 errors**. No stale `__probe*` files left behind.

**Test suite.** Baseline established in a detached git worktree at `HEAD` rather than by stashing — a `next dev` server was live on :3000, and stashing poisons Turbopack's on-disk cache.

| | Files | Tests |
|---|---|---|
| Baseline (`157d1c18`) | 18 failed | 66 failed |
| Working tree | 14 failed | 61 failed |

The working-tree failing set is a **strict subset** of baseline. **Zero regressions.**

The 4 extra baseline failures are all `driver-pay/__tests__/exporters/*.golden.test.ts`, and are an artifact of the worktree: `packages/*/dist` is gitignored, so a fresh checkout lacks it. This is the exact recurring trap already recorded in CLAUDE.md.

All 14 shared failures are pre-existing and unrelated — workflow-engine tRPC routers, auth guards, validation schemas, notifications. None imports any file this task touched. (Two mention "soft-delete", but that is the workflow engine's own separate `isActive` + `deletedAt` scheme on playbooks and step templates.)

---

## Follow-ups this task deliberately did not do

1. **Facilities do not appear in Recently Deleted.** `recently-deleted/page.tsx` runs seven hardcoded queries and each `select`s a `deletedBy` relation — which facilities have no column for. So a deleted facility is recoverable only via the 8-second Undo toast; after that it needs SQL. This is the largest remaining gap and is a direct consequence of the missing `deleted_by_id`. Fixing it properly wants that column, i.e. DDL, which this task was forbidden.
2. **Bulk-bar selection lingering** in the seven sibling grids (fixed here only).
3. **Portal event-bubbling defect** — explicitly deferred by the brief.
4. **The dead `shell/*` island** — see step 6.
5. **No residence guard on the generic action.** `softDeleteFacility` applies `facilityVisibilityWhere(viewer)`; `softDeleteRecords` applies no per-entity visibility check for any entity. Not a new exposure via the UI — the grid's `listFacilities(orgId)` call passes no viewer, so `facilityVisibilityWhere` defaults to `isDriverResidence: false` and residences never reach the grid. But the server action would honour an id typed by hand. Worth a deliberate decision rather than an assumption.
