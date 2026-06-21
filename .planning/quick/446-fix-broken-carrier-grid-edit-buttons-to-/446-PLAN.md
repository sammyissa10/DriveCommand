# Quick Task 446 — Fix Broken Carrier Grid Edit Buttons

## Goal
Repoint each carrier grid's row Edit pencil to the entity's real, working edit path instead of the phantom `/[base]/[id]/edit` route that 404s.

## Task 1: Fix Edit onClick targets in 6 grids

### Files
- `apps/web/src/app/(owner)/carrier/clients/_grid/ClientsGrid.tsx` — line 90
- `apps/web/src/app/(owner)/carrier/contracts/_grid/ContractsGrid.tsx` — line 89
- `apps/web/src/app/(owner)/carrier/loads/_grid/LoadsGrid.tsx` — line 162
- `apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/DriversGrid.tsx` — line 90
- `apps/web/src/app/(owner)/carrier/fleet/trucks/_grid/TrucksGrid.tsx` — line 90
- `apps/web/src/app/(owner)/carrier/facilities/_grid/FacilitiesGrid.tsx` — line 74

### Changes per grid (Edit onClick only)
| Entity | Old target | New target |
|--------|-----------|------------|
| Clients | `/carrier/clients/${id}/edit` | `/carrier/clients/${id}?edit=true` |
| Contracts | `/carrier/contracts/${id}/edit` | `/carrier/contracts/${id}?edit=true` |
| Loads | `/carrier/loads/${id}/edit` | `/carrier/loads/${id}` |
| Drivers | `/carrier/fleet/drivers/${id}/edit` | `/carrier/fleet/drivers/${id}` |
| Trucks | `/carrier/fleet/trucks/${id}/edit` | `/carrier/fleet/trucks/${id}?mode=edit` |
| Facilities | `/carrier/facilities/${id}/edit` | `/carrier/facilities/${id}` |

Do NOT touch: View actions, Delete actions, DispatchesGrid.

## Task 2: Wire ?edit=true to ContractDetail (mirror Clients pattern)

### Files
- `apps/web/src/app/(owner)/carrier/contracts/[id]/ContractDetail.tsx`
- `apps/web/src/app/(owner)/carrier/contracts/[id]/page.tsx`

### Changes
**ContractDetail.tsx**: Add `initialEdit?: boolean` to props destructure and interface; change `useState(false)` → `useState(initialEdit ?? false)`.

**page.tsx**: Add `searchParams: Promise<{ edit?: string }>` to Props; destructure `{ edit }` from awaited searchParams; pass `initialEdit={edit === 'true'}` to `<ContractDetail>`.
