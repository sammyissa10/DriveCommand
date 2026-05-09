---
phase: quick-178
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - apps/web/src/lib/carrier/fleet-drivers.ts
  - apps/web/src/lib/carrier/fleet-trucks.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
  - apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
  - apps/web/src/components/carrier/fleet/CarrierDriverList.tsx
  - apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
  - apps/web/src/components/carrier/fleet/CarrierTruckList.tsx
  - apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx
  - apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
  - apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx
  - apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx
autonomous: true

must_haves:
  truths:
    - "Owner can view a list of carrier drivers with CDL expiry color coding and status badges"
    - "Owner can create a new carrier driver linked to an existing DRIVER-role user (400 if already linked)"
    - "Owner can view and edit a carrier driver's details including pay configuration and see dispatch history"
    - "Owner can view a list of carrier trucks with registration/license expiry color coding and status badges"
    - "Owner can create and edit carrier trucks with all truck fields"
    - "Owner can view carrier truck detail with dispatch history"
  artifacts:
    - path: "apps/web/src/lib/carrier/fleet-drivers.ts"
      provides: "CarrierDriver CRUD functions"
      exports: ["listCarrierDrivers", "getCarrierDriver", "createCarrierDriver", "updateCarrierDriver"]
    - path: "apps/web/src/lib/carrier/fleet-trucks.ts"
      provides: "CarrierTruck CRUD functions"
      exports: ["listCarrierTrucks", "getCarrierTruck", "createCarrierTruck", "updateCarrierTruck"]
    - path: "apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx"
      provides: "Carrier drivers list page"
    - path: "apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx"
      provides: "Carrier trucks list page"
  key_links:
    - from: "apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx"
      to: "apps/web/src/lib/carrier/fleet-drivers.ts"
      via: "server-side data fetch"
      pattern: "listCarrierDrivers"
    - from: "apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts"
      to: "apps/web/src/lib/carrier/fleet-drivers.ts"
      via: "API route handler"
      pattern: "createCarrierDriver"
---

<objective>
Build carrier fleet management pages: carrier driver and carrier truck list/detail/edit pages with API routes. These pages manage the CarrierDriver and CarrierTruck catalog tables that feed into carrier dispatches.

Purpose: Enable owners to manage their carrier fleet (drivers + trucks) with compliance expiry visibility and dispatch history.
Output: 4 pages (driver list, driver detail, truck list, truck detail), 4 API routes, 4 components, 2 lib modules.
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@apps/web/src/generated/prisma/schema.prisma (CarrierDriver lines 1346-1379, CarrierTruck lines 1381-1411, CarrierDispatch lines 1478-1518)
@apps/web/src/lib/carrier/facilities.ts (reference pattern for lib CRUD module)
@apps/web/src/app/api/v1/carrier/facilities/route.ts (reference pattern for API routes)
@apps/web/src/app/(owner)/carrier/facilities/page.tsx (reference pattern for list page)
@apps/web/src/app/(owner)/carrier/facilities/[id]/page.tsx (reference pattern for detail page)
@apps/web/src/components/carrier/facilities/FacilityList.tsx (reference pattern for list component)
@apps/web/src/components/carrier/facilities/FacilityForm.tsx (reference pattern for form component)
</context>

<tasks>

<task type="auto">
  <name>Task 1: Lib modules + API routes for carrier drivers and trucks</name>
  <files>
    apps/web/src/lib/carrier/fleet-drivers.ts
    apps/web/src/lib/carrier/fleet-trucks.ts
    apps/web/src/app/api/v1/carrier/fleet/drivers/route.ts
    apps/web/src/app/api/v1/carrier/fleet/drivers/[id]/route.ts
    apps/web/src/app/api/v1/carrier/fleet/trucks/route.ts
    apps/web/src/app/api/v1/carrier/fleet/trucks/[id]/route.ts
  </files>
  <action>
    **fleet-drivers.ts** — Follow the facilities.ts pattern exactly. Functions:
    - `listCarrierDrivers(orgId, filters?)` — query `prisma.carrierDriver.findMany` with orgId, optional status/search filters, include `user: { select: { email: true } }` and `homeTerminal: { select: { id: true, name: true } }`. Return `{ items, total }`.
    - `getCarrierDriver(orgId, id)` — findFirst with orgId + id, include user, homeTerminal, and `primaryDispatches` (select: id, status, scheduledDeparture, actualMiles, plannedMiles + include driverPayRecords for net_pay). Also include `coDispatches` same shape.
    - `createCarrierDriver(orgId, data)` — accepts firstName, lastName, email, phone, cdlNumber, cdlState, cdlClass, cdlExpiry, homeTerminalId, payModel, payRate, payPeriod, userId, notes. If `userId` is provided, check `prisma.carrierDriver.findFirst({ where: { userId } })` — if exists, throw an error with message "User already linked to a carrier driver" (caller returns 400). Then `prisma.carrierDriver.create(...)`.
    - `updateCarrierDriver(orgId, id, data)` — partial update via `prisma.carrierDriver.update`.

    **fleet-trucks.ts** — Same pattern. Functions:
    - `listCarrierTrucks(orgId, filters?)` — query with orgId, optional status/truckType/search filters. Return `{ items, total }`.
    - `getCarrierTruck(orgId, id)` — findFirst with orgId + id, include `primaryDispatches` (select: id, status, scheduledDeparture, actualMiles, plannedMiles, primaryDriver: { select: { firstName, lastName } }).
    - `createCarrierTruck(orgId, data)` — accepts all CarrierTruck fields (unitNumber required, rest optional).
    - `updateCarrierTruck(orgId, id, data)` — partial update.

    **API routes** — Follow the facilities API pattern. Auth via `getSession()` with orgId check (same as facilities/route.ts pattern, NOT withCarrierAuth since that doesn't exist yet — use the getSession pattern from facilities).

    - `GET /api/v1/carrier/fleet/drivers` — calls listCarrierDrivers, supports ?status, ?search query params.
    - `POST /api/v1/carrier/fleet/drivers` — validates with Zod schema, calls createCarrierDriver. Catch "already linked" error and return 400.
    - `GET /api/v1/carrier/fleet/drivers/[id]` — calls getCarrierDriver.
    - `PATCH /api/v1/carrier/fleet/drivers/[id]` — validates partial schema, calls updateCarrierDriver.
    - `GET /api/v1/carrier/fleet/trucks` — calls listCarrierTrucks, supports ?status, ?truck_type, ?search.
    - `POST /api/v1/carrier/fleet/trucks` — validates with Zod schema, calls createCarrierTruck.
    - `GET /api/v1/carrier/fleet/trucks/[id]` — calls getCarrierTruck.
    - `PATCH /api/v1/carrier/fleet/trucks/[id]` — validates partial schema, calls updateCarrierTruck.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no type errors in new files.</verify>
  <done>All 6 files created, lib functions export correctly, API routes handle GET/POST/PATCH with proper auth and validation.</done>
</task>

<task type="auto">
  <name>Task 2: List and form components for carrier drivers and trucks</name>
  <files>
    apps/web/src/components/carrier/fleet/CarrierDriverList.tsx
    apps/web/src/components/carrier/fleet/CarrierDriverForm.tsx
    apps/web/src/components/carrier/fleet/CarrierTruckList.tsx
    apps/web/src/components/carrier/fleet/CarrierTruckForm.tsx
  </files>
  <action>
    All components are `'use client'`. Follow FacilityList.tsx and FacilityForm.tsx patterns.

    **Expiry color helper** — Create a shared helper (inline or in a small util) used by both driver and truck lists:
    ```
    function expiryColor(date: string | null): string
    ```
    Returns: green class if > 90 days, amber/yellow class if 30-90 days, red class if < 30 days or expired, muted if null.

    **CarrierDriverList.tsx** — Props: `drivers: CarrierDriverItem[]` (id, firstName, lastName, cdlClass, cdlExpiry, payModel, status).
    - Table columns: Driver Name (firstName + lastName, link to detail), CDL Class (Badge), CDL Expiry (color-coded date + days remaining), Pay Model (Badge: per_mile/percentage/flat_rate/per_stop), Status (Badge: active=green, inactive=gray, suspended=red).
    - Alert icon (AlertTriangle from lucide) on rows where cdlExpiry < 30 days.
    - Search input (by name), status filter dropdown.
    - "New Driver" button linking to a create form/modal or inline.

    **CarrierDriverForm.tsx** — Props: `driver?: CarrierDriverItem` (for edit mode), `facilities: { id, name }[]` (for homeTerminal select), onSubmit callback.
    - Fields: firstName, lastName, email, phone, userId (optional — for linking existing user), cdlNumber, cdlState (2-letter select), cdlClass (A/B/C select), cdlExpiry (date input), homeTerminalId (select from facilities), payModel (select: per_mile/percentage/flat_rate/per_stop), payRate (number — label changes per payModel: "Rate per Mile" / "Percentage" / "Flat Rate" / "Rate per Stop"), payPeriod (select: weekly/biweekly/monthly), notes.
    - Submits to POST (create) or PATCH (edit) via fetch to the API routes.

    **CarrierTruckList.tsx** — Props: `trucks: CarrierTruckItem[]` (id, unitNumber, vin, year, make, model, truckType, currentOdometerMiles, registrationExpiry, licenseExpiry, status).
    - Table columns: Unit # (link to detail), VIN, Year Make Model (combined), Truck Type (Badge), Odometer (formatted with commas + "mi"), Registration Expiry (color-coded), License Expiry (color-coded), Status (Badge).
    - Alert icon on rows where any expiry < 30 days.
    - Search input (by unit number, VIN), status filter, truckType filter.
    - "New Truck" button.

    **CarrierTruckForm.tsx** — Props: `truck?: CarrierTruckItem` (for edit), onSubmit callback.
    - Fields: unitNumber (required), vin, year (number), make, model, truckType (select: semi/box_truck/flatbed/reefer/tanker/day_cab/straight_truck), grossWeightLbs (number), payloadCapacityLbs (number), currentOdometerMiles (number, editable), licensePlate, licenseState (2-letter), registrationExpiry (date), licenseExpiry (date), status (select: active/inactive/maintenance/out_of_service), notes.
    - Submits to POST or PATCH.

    NOTE: The CarrierDriver schema does NOT have medicalCertExpiry or tankerEndorsement fields — only use fields that exist in the schema (cdlNumber, cdlClass, cdlState, cdlExpiry). The CarrierTruck schema does NOT have dotInspectionExpiry — only registrationExpiry, licenseExpiry, and insuranceExpiry exist. Use the actual schema fields.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no type errors. Components render without runtime errors.</verify>
  <done>All 4 components created with proper expiry color coding (green > 90d, amber 30-90d, red < 30d), badges, alert icons, search/filter, and forms with conditional fields.</done>
</task>

<task type="auto">
  <name>Task 3: Page routes for carrier fleet drivers and trucks</name>
  <files>
    apps/web/src/app/(owner)/carrier/fleet/drivers/page.tsx
    apps/web/src/app/(owner)/carrier/fleet/drivers/[id]/page.tsx
    apps/web/src/app/(owner)/carrier/fleet/trucks/page.tsx
    apps/web/src/app/(owner)/carrier/fleet/trucks/[id]/page.tsx
  </files>
  <action>
    Follow the facilities page patterns exactly (server components with getSession + redirect, data fetch, pass to client components).

    **fleet/drivers/page.tsx** — Server component:
    - Auth check via getSession(), redirect to /login if no session.
    - Call `listCarrierDrivers(orgId)`.
    - Render heading "Carrier Drivers", subtitle showing count, stat row with status counts (active/inactive/suspended).
    - Render `<CarrierDriverList>` with mapped items.

    **fleet/drivers/[id]/page.tsx** — Server component:
    - Auth check, get driver via `getCarrierDriver(orgId, id)`.
    - notFound() if not found.
    - Back link to /carrier/fleet/drivers.
    - Layout in two sections:
      1. **Compliance Card** — CDL number, class badge, state, CDL expiry with days-remaining callout (color-coded). Use a Card/section with border.
      2. **Pay Configuration Card** — payModel badge, payRate (formatted per model type), payPeriod, homeTerminal name.
    - Below: `<CarrierDriverForm>` in edit mode (pre-filled, PATCH on submit). Also fetch facilities list for homeTerminal select: `listFacilities(orgId)`.
    - Below form: **Dispatch History** table showing driver's dispatches (from the included primaryDispatches + coDispatches). Columns: Dispatch # (link to /carrier/dispatches/[id]), Date (scheduledDeparture formatted), Status (badge), Miles (actualMiles or plannedMiles), Role (Primary/Co-Driver). Sort by date descending.

    **fleet/trucks/page.tsx** — Server component:
    - Same auth pattern. Call `listCarrierTrucks(orgId)`.
    - Heading "Carrier Trucks", count subtitle, stat row with truckType counts.
    - Render `<CarrierTruckList>`.

    **fleet/trucks/[id]/page.tsx** — Server component:
    - Auth check, get truck via `getCarrierTruck(orgId, id)`.
    - notFound() if not found.
    - Back link to /carrier/fleet/trucks.
    - Detail section: unitNumber, VIN, year make model, truckType badge, GVWR, max payload, odometer (formatted), license plate + state, registrationExpiry (color-coded with days remaining), licenseExpiry (color-coded), insuranceExpiry (color-coded), status badge.
    - `<CarrierTruckForm>` in edit mode.
    - **Dispatch History** table from included primaryDispatches. Columns: Dispatch # (link), Date, Status, Miles, Driver name.
  </action>
  <verify>Run `npx tsc --noEmit` from apps/web — no type errors. Navigate to /carrier/fleet/drivers and /carrier/fleet/trucks in browser (pages render without errors).</verify>
  <done>All 4 pages render correctly: driver list with expiry coloring + alert icons, driver detail with compliance/pay sections + dispatch history, truck list with expiry coloring, truck detail with all fields + dispatch history.</done>
</task>

</tasks>

<verification>
- `cd apps/web && npx tsc --noEmit` passes with no errors in new files
- All 14 new files exist in the correct directories
- Driver list page shows CDL expiry color coding (green/amber/red)
- Truck list page shows registration and license expiry color coding
- Creating a driver with an already-linked userId returns 400
- Detail pages show dispatch history tables
</verification>

<success_criteria>
- Owner can browse /carrier/fleet/drivers and /carrier/fleet/trucks with search, filter, and expiry alerts
- Owner can create new carrier drivers (with duplicate-user-link protection) and trucks
- Owner can view and edit driver/truck details with proper compliance color coding
- Dispatch history tables appear on detail pages
- All API routes (GET/POST/PATCH) work for both drivers and trucks
</success_criteria>

<output>
After completion, create `.planning/quick/178-carrier-ops-fleet-management-pages-carri/178-SUMMARY.md`
</output>
