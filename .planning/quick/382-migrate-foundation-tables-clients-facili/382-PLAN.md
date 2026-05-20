# Quick Task 382: Migrate Foundation Tables to DataGrid

## Overview

Migrate four Foundation group tables (Clients, Facilities, Trucks, Drivers) from bespoke table components to the standardized DataGrid component system.

## Current State Analysis

### Existing Components
| Page | Component | Columns | Features |
|------|-----------|---------|----------|
| `/carrier/clients` | `ClientList.tsx` | Name, Status, Primary Contact, Email, Location | Search, status filter, role-based New button |
| `/carrier/facilities` | `FacilityList.tsx` | Name, Type, Location, Contact, Notes | Search, type filter, New button |
| `/carrier/fleet/trucks` | `CarrierTruckList.tsx` | Unit#, VehicleID, VIN, Year/Make/Model, Type, Odometer, RegExpiry, LicExpiry, Status | Search, status+type filter, expiry alerts, New button |
| `/carrier/fleet/drivers` | `CarrierDriverList.tsx` | Driver, CDL Class, CDL Expiry, Pay Model, Status | Search, status filter, expiry alerts, New button |

### DataGrid API Available
- `GridShell` - Responsive container (table on desktop, cards on mobile)
- `StatusBadge` - Tinted background badges (success/warning/danger/info/purple/neutral)
- `QuickActions` - Row-level actions (view/edit/delete)
- `ExtendedColumnDef` with `meta.dataType` for auto-sorting
- Search, pagination, column visibility built-in

---

## Tasks

### Task 1: Migrate Facilities Page (Simplest)

**Files to create:**
- `apps/web/src/app/(owner)/carrier/facilities/_grid/types.ts`
- `apps/web/src/app/(owner)/carrier/facilities/_grid/columns.tsx`
- `apps/web/src/app/(owner)/carrier/facilities/_grid/FacilitiesGrid.tsx`

**Files to modify:**
- `apps/web/src/app/(owner)/carrier/facilities/page.tsx` - Replace FacilityList with FacilitiesGrid

**Files to move to legacy:**
- `apps/web/src/components/carrier/facilities/FacilityList.tsx` → `apps/web/src/legacy/2026-05-20/components/carrier/facilities/FacilityList.tsx`

**Column definitions:**
| Column | dataType | freezable | Notes |
|--------|----------|-----------|-------|
| name | text | true (frozen) | Primary identifier, link to detail |
| facilityType | text | false | StatusBadge (shipper=info, receiver=success, terminal=purple, fuel_stop=warning, other=neutral) |
| location | text | false | Computed city+state |
| contactName | text | false | From contacts[0].name or contactName |
| notes | text | false | Truncate to 60 chars |

**Mobile cardFields:** `['facilityType', 'location']`

---

### Task 2: Migrate Trucks Page

**Files to create:**
- `apps/web/src/app/(owner)/carrier/fleet/trucks/_grid/types.ts`
- `apps/web/src/app/(owner)/carrier/fleet/trucks/_grid/columns.tsx`
- `apps/web/src/app/(owner)/carrier/fleet/trucks/_grid/TrucksGrid.tsx`

**Files to modify:**
- `apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx` - Replace CarrierTruckList with TrucksGrid

**Files to move to legacy:**
- `apps/web/src/components/carrier/fleet/CarrierTruckList.tsx` → `apps/web/src/legacy/2026-05-20/components/carrier/fleet/CarrierTruckList.tsx`

**Column definitions:**
| Column | dataType | freezable | Notes |
|--------|----------|-----------|-------|
| unitNumber | text | true (frozen) | Primary, with displayName + isSample pill |
| vehicleId | text | false | Monospace font |
| vin | text | false | Monospace font, NOT editable |
| yearMakeModel | text | false | Computed: year + make + model |
| truckType | text | false | StatusBadge by type |
| currentOdometerMiles | number | false | Formatted with commas + "mi" |
| registrationExpiry | date | false | With urgency badge (danger <0, warning <30d) |
| licenseExpiry | date | false | With urgency badge |
| status | text | false | StatusBadge (active=success, maintenance=warning, out_of_service=danger, inactive=neutral) |

**Mobile cardFields:** `['status', 'truckType', 'registrationExpiry']`

---

### Task 3: Migrate Clients Page

**Files to create:**
- `apps/web/src/app/(owner)/carrier/clients/_grid/types.ts`
- `apps/web/src/app/(owner)/carrier/clients/_grid/columns.tsx`
- `apps/web/src/app/(owner)/carrier/clients/_grid/ClientsGrid.tsx`

**Files to modify:**
- `apps/web/src/app/(owner)/carrier/clients/page.tsx` - Replace ClientList with ClientsGrid

**Files to move to legacy:**
- `apps/web/src/components/carrier/clients/ClientList.tsx` → `apps/web/src/legacy/2026-05-20/components/carrier/clients/ClientList.tsx`

**Column definitions:**
| Column | dataType | freezable | Notes |
|--------|----------|-----------|-------|
| name | text | true (frozen) | Primary, with isSample pill, link to detail |
| status | text | false | StatusBadge (active=success, inactive=warning, blocked=danger) |
| primaryContact | text | false | |
| email | text | false | |
| location | text | false | Computed city+state |

**Mobile cardFields:** `['status', 'primaryContact', 'location']`

---

### Task 4: Migrate Drivers Page (Most Complex)

**Files to create:**
- `apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/types.ts`
- `apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/columns.tsx`
- `apps/web/src/app/(owner)/carrier/fleet/drivers/_grid/DriversGrid.tsx`

**Files to modify:**
- `apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx` - Replace CarrierDriverList with DriversGrid

**Files to move to legacy:**
- `apps/web/src/components/carrier/fleet/CarrierDriverList.tsx` → `apps/web/src/legacy/2026-05-20/components/carrier/fleet/CarrierDriverList.tsx`

**Column definitions:**
| Column | dataType | freezable | Notes |
|--------|----------|-----------|-------|
| name | text | true (frozen) | Computed firstName+lastName, with isSample pill + expiry alert icon |
| cdlClass | text | false | StatusBadge info "Class X" or "—" |
| cdlExpiry | date | false | With urgency badge + days remaining text |
| payModel | text | false | StatusBadge by model (per_mile=info, percentage=purple, flat_rate=warning, per_stop=success) |
| status | text | false | StatusBadge (active=success, inactive=neutral, suspended=danger) |

**Mobile cardFields:** `['status', 'cdlExpiry', 'payModel']`

---

## Constraints

- DO NOT modify `/src/components/data-grid/` — use it as-is
- Every column MUST declare `dataType` in `meta`
- StatusBadge for ALL status pills (no inline badges)
- VIN and phone columns are NOT editable (flag if old behavior differs)
- Expiration dates: danger if past-due, warning if <30 days
- Move old components to `/src/legacy/2026-05-20/` with console.warn in dev mode
- TypeScript strict, no `any`

## Verification Checklist (per page)

- [ ] List renders correctly
- [ ] View row navigates to detail page
- [ ] Sort works on all columns (especially numeric/date)
- [ ] Search works
- [ ] Filter by status/type works
- [ ] New button works (respects role permissions where applicable)
- [ ] Mobile card view at 375px shows correct fields
- [ ] Expiration urgency badges render (test with near-expiry data)
- [ ] TypeScript compiles with no errors
