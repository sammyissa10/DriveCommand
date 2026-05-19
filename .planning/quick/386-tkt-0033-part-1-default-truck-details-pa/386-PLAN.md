# Quick Task 386: TKT-0033 Part 1 — Default truck details page to VIEW mode with Edit toggle

## Approach

The `page.tsx` is a server component for data fetching — it stays that way. A new `CarrierTruckDetailClient` client component holds `mode: 'view' | 'edit'` state (default `'view'`). The server component passes the fetched truck data as props to this client. View mode renders a new `CarrierTruckDetailsView` (read-only, all 17 fields); edit mode renders the existing `CarrierTruckForm` unchanged. Post-save return-to-view is wired via optional `onSuccess`/`onCancel` callbacks added to `CarrierTruckForm` (both optional — existing call sites are unaffected).

## Files Changed

| File | Action |
|------|--------|
| `apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx` | MODIFY — add optional `onSuccess`/`onCancel` props |
| `apps/web/src/components/carrier/fleet/CarrierTruckDetailsView.tsx` | CREATE — read-only display, all 17 fields |
| `apps/web/src/components/carrier/fleet/CarrierTruckDetailClient.tsx` | CREATE — mode state + toggle |
| `apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx` | MODIFY — use CarrierTruckDetailClient, remove compact details card |

## Tasks

### Task 1: Add optional callback props to CarrierTruckForm
- Add `onSuccess?: () => void` and `onCancel?: () => void` to `CarrierTruckFormProps`
- `handleSubmit` success (isEdit): call `onSuccess?.()` if provided, else `router.refresh()`
- Cancel button onClick: call `onCancel?.()` if provided, else `router.push('/carrier/fleet/trucks')`
- No changes to form internals, field layout, or submit logic

### Task 2: Create CarrierTruckDetailsView
- Groups matching CarrierTruckForm: Identity, Vehicle Specs, Weight & Capacity, Registration & Compliance, Notes
- All 17 fields: unitNumber, displayName, vin, year, make, model, truckType, grossWeightLbs, payloadCapacityLbs, currentOdometerMiles, licensePlate, licenseState, registrationExpiry, licenseExpiry, insuranceExpiry, status, notes
- Empty → '—'; dates → `toLocaleDateString` + days-remaining color; weights → `.toLocaleString()`
- truckType and status as styled Badge components

### Task 3: Create CarrierTruckDetailClient
- `'use client'` — holds `mode: 'view' | 'edit'` (default `'view'`)
- Card: header "Truck Details" + Edit button (view) or Cancel button (edit) top-right
- `handleSuccess` → `router.refresh()` + `setMode('view')`
- `handleCancel` → `setMode('view')`
- Passes `onSuccess` and `onCancel` to `CarrierTruckForm`

### Task 4: Refactor page.tsx
- Remove compact Truck Details card (all the read-only fields already displayed inline)
- Remove helpers that move to CarrierTruckDetailsView (daysUntil, expiryColorClass, formatDate, daysLabel, TRUCK_TYPE_LABELS, STATUS_CLASSES)
- Replace "Edit Truck" card with `<CarrierTruckDetailClient truck={...} />`
- Keep: back link, truck header (unitNumber h1 + status Badge + year/make/model p)
- Keep: DISPATCH_STATUS_CLASSES + dispatch history table
- Keep: AuditTrailFooter

### Task 5: TypeScript check
```
cd apps/web && npx tsc --noEmit
```
Must exit 0.

### Task 6: Commit
```
feat(trucks): default truck details page to view mode with edit toggle [TKT-0033 Part 1]
```
Then push.
