# Quick Task 446 — SUMMARY

**Task:** Fix broken carrier grid Edit buttons to point to real entity edit paths
**Date:** 2026-06-15
**Commit:** af7aafdb

## Changes Made

### Task 1: Fix Edit onClick targets in 6 grids (surgical 1-line change each)

| Grid | Old (404s) | New (works) |
|------|-----------|-------------|
| ClientsGrid.tsx | `/carrier/clients/${id}/edit` | `/carrier/clients/${id}?edit=true` |
| ContractsGrid.tsx | `/carrier/contracts/${id}/edit` | `/carrier/contracts/${id}?edit=true` |
| LoadsGrid.tsx | `/carrier/loads/${id}/edit` | `/carrier/loads/${id}` |
| DriversGrid.tsx | `/carrier/fleet/drivers/${id}/edit` | `/carrier/fleet/drivers/${id}` |
| TrucksGrid.tsx | `/carrier/fleet/trucks/${id}/edit` | `/carrier/fleet/trucks/${id}?mode=edit` |
| FacilitiesGrid.tsx | `/carrier/facilities/${id}/edit` | `/carrier/facilities/${id}` |

### Task 2: Contracts ?edit=true wiring (mirrors Clients pattern exactly)

**ContractDetail.tsx:** Added `initialEdit?: boolean` to props destructure + interface. Changed `useState(false)` → `useState(initialEdit ?? false)`.

**contracts/[id]/page.tsx:** Added `searchParams: Promise<{ edit?: string }>` to Props interface. Destructured `{ edit }` from awaited searchParams. Passed `initialEdit={edit === 'true'}` to `<ContractDetail>`.

## Confirmations

- ✅ DispatchesGrid.tsx NOT touched (Trips Edit guard preserved)
- ✅ No Delete handlers, no View targets, no QuickActions.tsx changed
- ✅ Contracts ?edit=true wiring mirrors Clients/[id]/page.tsx + ClientDetail.tsx pattern exactly
- ✅ Facilities Delete remains a known stub (out of scope, not fixed here)
- ✅ git diff shows exactly 8 files (13 insertions, 9 deletions)
- ✅ TypeScript strict — no `any`, all types explicit
