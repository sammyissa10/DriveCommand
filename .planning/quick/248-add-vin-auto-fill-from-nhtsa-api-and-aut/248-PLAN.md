---
phase: quick-248
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/prisma/schema.prisma
  - apps/web/prisma/migrations/20260417100001_add_vehicle_id_display_name/migration.sql
  - apps/web/src/lib/carrier/fleet-trucks.ts
  - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
  - apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
  - apps/web/src/components/carrier/fleet/CarrierTruckList.tsx
  - apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
  - apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
  - apps/web/src/app/(owner)/live-map/actions.ts
  - apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
  - apps/web/src/app/(driver)/my-route/page.tsx
  - apps/web/src/app/(driver)/actions/driver-routes.ts
autonomous: true
must_haves:
  truths:
    - "Entering a VIN and clicking Lookup auto-fills make, model, year, truck type, and GVWR from NHTSA"
    - "Every carrier truck has a globally unique VH-YYYY-NNNNN vehicle_id auto-assigned on creation"
    - "vehicle_id is visible as read-only badge on edit form and as a column in the trucks list"
    - "display_name is editable and shown in live map sidebar, dispatch header truck chip, and driver route page"
    - "Existing trucks have vehicle_id and display_name backfilled by migration"
  artifacts:
    - path: "apps/web/prisma/schema.prisma"
      provides: "vehicleId and displayName columns on CarrierTruck"
      contains: "vehicleId"
    - path: "apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx"
      provides: "VIN Lookup button, display_name field, vehicle_id badge"
    - path: "apps/web/src/lib/carrier/fleet-trucks.ts"
      provides: "generateVehicleId utility, vehicleId/displayName in create"
  key_links:
    - from: "CarrierTruckForm.tsx"
      to: "https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/"
      via: "client-side fetch on Lookup click"
      pattern: "vpic.nhtsa.dot.gov"
    - from: "fleet-trucks.ts createCarrierTruck"
      to: "prisma.carrierTruck MAX vehicleId query"
      via: "generateVehicleId before create"
      pattern: "generateVehicleId"
---

<objective>
Add VIN auto-fill from NHTSA API and auto-generated vehicle ID with editable display name to carrier trucks.

Purpose: Reduce manual data entry when adding trucks (VIN lookup fills make/model/year/type/GVWR) and give each truck a permanent system ID plus a human-friendly display name.
Output: Updated schema with vehicle_id + display_name, VIN lookup in form, display_name shown across live map/dispatch/driver route.
</objective>

<context>
@apps/web/prisma/schema.prisma (CarrierTruck model around line 1408)
@apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
@apps/web/src/components/carrier/fleet/CarrierTruckList.tsx
@apps/web/src/lib/carrier/fleet-trucks.ts
@apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
@apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
@apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
@apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
@apps/web/src/app/(owner)/live-map/actions.ts
@apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
@apps/web/src/app/(driver)/my-route/page.tsx
@apps/web/src/app/(driver)/actions/driver-routes.ts
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration + backend (vehicle_id, display_name, VIN generate logic)</name>
  <files>
    apps/web/prisma/schema.prisma
    apps/web/prisma/migrations/20260417100001_add_vehicle_id_display_name/migration.sql
    apps/web/src/lib/carrier/fleet-trucks.ts
    apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
  </files>
  <action>
    1. **Schema** — Add two fields to CarrierTruck model in schema.prisma:
       - `vehicleId String? @unique @map("vehicle_id") @db.VarChar(50)` (nullable so migration can backfill, but always set on new creates)
       - `displayName String? @map("display_name") @db.VarChar(200)`

    2. **Migration SQL** — Create migration `20260417100001_add_vehicle_id_display_name`:
       ```sql
       ALTER TABLE "carrier_trucks" ADD COLUMN "vehicle_id" VARCHAR(50);
       ALTER TABLE "carrier_trucks" ADD COLUMN "display_name" VARCHAR(200);

       -- Backfill vehicle_id for existing rows: VH-YYYY-NNNNN where YYYY = current year
       UPDATE "carrier_trucks"
       SET "vehicle_id" = 'VH-' || EXTRACT(YEAR FROM CURRENT_DATE)::TEXT || '-' || LPAD((ROW_NUMBER() OVER (ORDER BY "created_at"))::TEXT, 5, '0')
       WHERE "vehicle_id" IS NULL;

       -- Backfill display_name from unit_number
       UPDATE "carrier_trucks"
       SET "display_name" = "unit_number"
       WHERE "display_name" IS NULL;

       -- Now make vehicle_id NOT NULL and add unique constraint
       ALTER TABLE "carrier_trucks" ALTER COLUMN "vehicle_id" SET NOT NULL;
       CREATE UNIQUE INDEX "carrier_trucks_vehicle_id_key" ON "carrier_trucks"("vehicle_id");
       ```
       After writing the SQL, the migration auto-deploy hook will fire. Then update schema.prisma to make vehicleId non-nullable: `vehicleId String @unique @map("vehicle_id") @db.VarChar(50)`.

    3. **fleet-trucks.ts** — Add `generateVehicleId()` async function:
       - Query: `SELECT "vehicle_id" FROM "carrier_trucks" ORDER BY "vehicle_id" DESC LIMIT 1` using `prisma.$queryRawUnsafe`
       - Parse the NNNNN suffix, increment by 1
       - If no rows exist, start at 00001
       - Format: `VH-${currentYear}-${paddedSequence}`
       - Call this in `createCarrierTruck` before `prisma.carrierTruck.create`
       - Set `vehicleId` from generated value
       - Set `displayName` to `data.displayName || data.unitNumber`
       - Add `displayName` to `CarrierTruckCreateInput` and `CarrierTruckUpdateInput`

    4. **API route POST** — Add `displayName` as optional string to `CarrierTruckCreateSchema` zod schema.

    5. **API route PATCH** (`[id]/route.ts`) — Add `displayName` as optional string to the update schema.

    6. Run `npx prisma generate` (from apps/web) to regenerate the client.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes with no errors related to CarrierTruck
    - `npx prisma validate` succeeds
    - Check that the migration SQL is syntactically correct
  </verify>
  <done>
    - CarrierTruck model has vehicleId (unique, not null) and displayName (nullable) columns
    - Existing rows backfilled: vehicle_id = VH-2026-NNNNN, display_name = unit_number
    - createCarrierTruck auto-generates globally unique vehicle_id
    - API accepts displayName on POST and PATCH
  </done>
</task>

<task type="auto">
  <name>Task 2: VIN Lookup + display_name/vehicle_id in CarrierTruckForm</name>
  <files>
    apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
  </files>
  <action>
    1. **Add VIN Lookup** — Next to the VIN input, add a "Lookup" button (Search icon + text):
       - Add `isLookingUp` state (boolean)
       - On click (or VIN field blur when VIN is 17 chars): call `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json` via `fetch`
       - Parse response JSON: `Results` array, find items by `Variable` field:
         - `"Make"` → set `make` field (use `Value` if not null/empty)
         - `"Model"` → set `model` field
         - `"Model Year"` → set `year` field (parse int)
         - `"Body Class"` → map to truckType: if Value contains "Truck" → "dry_van" (but dry_van isn't in the enum, so map: contains "Truck" but not "Tractor" → "box_truck", contains "Tractor" → "day_cab", contains "Trailer" → skip). Actually map: "Truck" in value → "semi" (default truck), "Tractor" in value → "day_cab"
         - `"Gross Vehicle Weight Rating From"` → set `grossWeightLbs` (parseInt the Value string)
       - Check `ErrorCode` on each result item: if all results have ErrorCode containing "0", consider it success
       - On success: `toast.success("Vehicle details filled from VIN")`
       - On error/no data: `toast.error("VIN not found — please enter details manually")`
       - Show `Loader2` spinner on the Lookup button while fetching
       - VIN field layout: use a flex row with Input taking flex-1 and Button beside it

    2. **Add displayName field** — Below unitNumber, add a "Display Name" input:
       - Optional field, placeholder "e.g. Big Red, Unit Alpha, Truck 7"
       - Add `displayName` to the `values` state, initialize from `truck?.displayName ?? ''`
       - Include in the submit body: `displayName: values.displayName || undefined`

    3. **Add vehicleId read-only badge** — On edit form only (isEdit === true):
       - Above the form fields grid, show a small badge/chip: "Vehicle ID: VH-2026-00001"
       - Use a muted background badge style: `<div className="flex items-center gap-2 text-sm text-muted-foreground"><span className="font-medium">Vehicle ID</span><Badge variant="secondary" className="font-mono">{truck.vehicleId}</Badge></div>`
       - Add `vehicleId` to `CarrierTruckData` interface

    4. **Update CarrierTruckData interface** — Add:
       - `vehicleId: string | null` (null for new trucks not yet saved)
       - `displayName: string | null`
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes
    - Form renders VIN field with Lookup button
    - displayName field appears below unit number
    - vehicleId badge appears only in edit mode
  </verify>
  <done>
    - VIN Lookup button calls NHTSA API client-side and auto-fills make/model/year/truckType/GVWR
    - Success and error toasts appear appropriately
    - displayName is editable in create and edit forms
    - vehicleId shows as read-only badge on edit form
  </done>
</task>

<task type="auto">
  <name>Task 3: Show vehicle_id + display_name across list, live map, dispatch, driver route</name>
  <files>
    apps/web/src/components/carrier/fleet/CarrierTruckList.tsx
    apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx
    apps/web/src/components/carrier/dispatches/DispatchHeader.tsx
    apps/web/src/app/(owner)/live-map/actions.ts
    apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts
    apps/web/src/app/(driver)/my-route/page.tsx
    apps/web/src/app/(driver)/actions/driver-routes.ts
  </files>
  <action>
    1. **CarrierTruckList.tsx** — Add "Vehicle ID" column to the table:
       - Add `vehicleId: string` and `displayName: string | null` to `CarrierTruckItem` interface
       - Add table header "Vehicle ID" after "Unit #"
       - Add table cell showing `t.vehicleId` in `font-mono text-xs text-muted-foreground`
       - Also update the Unit # cell: show `t.displayName || t.unitNumber` as the link text, and if displayName differs from unitNumber, show unitNumber as a smaller subtitle below
       - Add displayName to search filter (search by displayName too)

    2. **Dispatch detail** — In `apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx`:
       - Update the truck query `select` to include `displayName` alongside `unitNumber`
       - Pass `truckDisplayName` to DispatchHeader (compute as `truck?.displayName || truck?.unitNumber || '—'`)
       - In `DispatchHeader.tsx`: accept optional `truckDisplayName` prop, show it instead of raw `truckUnit` in the truck chip. Show `truckUnit` (unitNumber) as subtitle if different from displayName.
       - Also add `displayName` to the `trucksForAttach` array items and show `displayName || unitNumber` in the truck reassign dropdown options

    3. **Live map sidebar** — In `apps/web/src/app/(owner)/live-map/actions.ts`:
       - In the raw SQL query for carrier trucks (around line 420-430), add `ct.display_name AS "displayName"` to the SELECT
       - In the mapped return object, add `displayName` field
       - Where `licensePlate: ct.license_plate ?? ct.unit_number` is set, keep as-is but also pass displayName
       - In `apps/web/src/app/api/v1/carrier/live-map/vehicles/route.ts`: add `displayName` to the CarrierTruckRow interface and the SELECT query (`ct.display_name AS "displayName"`), include in the response object alongside truck data

    4. **Driver portal route tab** — In `apps/web/src/app/(driver)/actions/driver-routes.ts`:
       - Add `displayName: true` to the truck select in both dispatchInclude locations
       - In `apps/web/src/app/(driver)/my-route/page.tsx`: show `dispatch.truck.displayName || dispatch.truck.unitNumber` instead of just `dispatch.truck.unitNumber`

    5. **Fallback rule everywhere**: always use `displayName || unitNumber` pattern — never show null/empty displayName.
  </action>
  <verify>
    - `cd apps/web && npx tsc --noEmit` passes with zero errors
    - Truck list table shows Vehicle ID column
    - Dispatch header shows display name
    - Driver my-route page shows display name
  </verify>
  <done>
    - Vehicle ID column visible in carrier trucks list
    - display_name (with unitNumber fallback) shown in: truck list, dispatch header truck chip, live map sidebar, driver route page
    - No TypeScript errors across the codebase
  </done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` — zero errors
- `npx prisma validate` — schema valid
- Migration SQL is idempotent-safe and backfills existing rows
- NHTSA API call works client-side (no CORS issues — NHTSA API allows browser requests)
- All unitNumber references still work (display_name is additive, not replacing)
</verification>

<success_criteria>
- VIN Lookup button auto-fills make/model/year/truckType/GVWR from NHTSA API
- Every new truck gets a globally unique VH-YYYY-NNNNN vehicle_id
- Existing trucks backfilled with vehicle_id and display_name
- display_name shown across truck list, dispatch detail, live map, driver route
- vehicle_id shown as read-only badge on edit form and column in list
- Zero TypeScript errors
</success_criteria>
