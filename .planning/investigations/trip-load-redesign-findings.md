# Trip/Load Redesign Investigation Findings

**Investigation Date:** 2026-05-24
**Purpose:** Map the two parallel data universes (PascalCase vs snake_case), document current dispatch/trip model relationships, trace route templates, identify reusable UI components, and document driver stop-completion flow.
**Scope:** Read-only analysis — no code changes.

---

## 1. Two Parallel Data Universes

DriveCommand currently operates with **two completely separate data models** for loads and trips:

### 1.1 PascalCase Universe (Original DriveCommand)

**Tables (Prisma Model Names):**

| Model | DB Table | Purpose | Status |
|-------|----------|---------|--------|
| `Load` | `Load` | Original load management — tied to Customer, assigned to Route | **LIVE** |
| `Route` | `Route` | Original route/trip model — driver + truck + multi-stop | **LIVE** |
| `RouteStop` | `RouteStop` | Stops on a route, linked to Load via `loadId` FK | **LIVE** |
| `Customer` | `Customer` | Original CRM customer (pre-CarrierClient) | **LIVE** |
| `Truck` | `Truck` | Original truck model (pre-CarrierTruck) | **LIVE** |
| `User` | `User` | Driver/Owner/SysAdmin users | **LIVE** |
| `Invoice` | `Invoice` | Original invoicing tied to Load | **LIVE** |
| `Document` | `Document` | Compliance docs (driver/truck/route/load scoped) | **LIVE** |
| `RouteExpense` | `RouteExpense` | Expenses tied to Route | **LIVE** |
| `RoutePayment` | `RoutePayment` | Payments tied to Route | **LIVE** |

**Key Relationships:**
- `Load.routeId` → `Route.id` (nullable — loads can exist before route assignment)
- `Load.pickupStopId` → `RouteStop.id` (nullable — set when load assigned to route)
- `Load.deliveryStopId` → `RouteStop.id` (nullable)
- `RouteStop.loadId` → `Load.id` (nullable — fuel/weigh stops have no load)
- `Route.driverId` → `User.id` (required)
- `Route.truckId` → `Truck.id` (required)
- `Load.customerId` → `Customer.id` (required)

**Schema Characteristics:**
- Uses Prisma default casing (PascalCase models, camelCase fields)
- No `@@map()` directives — model names match DB table names
- Fields: `tenantId`, `createdById`, `updatedById`, `archivedAt`

**Pages/Routes Using This Universe:**

| Route Path | Model Used | Read/Write |
|------------|------------|------------|
| `/loads/page.tsx` | `prisma.load` | Read (list) |
| `/loads/[id]/page.tsx` | `prisma.load` | Read (detail) |
| `/loads/[id]/edit/page.tsx` | `prisma.load` | Write (update) |
| `/loads/new/page.tsx` | `prisma.load` | Write (create) |
| `/routes/page.tsx` | `prisma.route` | Read (list) |
| `/routes/[id]/page.tsx` | `prisma.route` | Read (detail) |
| `/invoices/*` | `prisma.invoice` (via Load FK) | Read/Write |
| `/crm/*` | `prisma.customer` | Read/Write |
| `/driver/loads/*` | `prisma.load` | Read |
| `/driver/my-route/*` | `prisma.route` | Read |

**Server Actions/APIs:**
- `apps/web/src/app/(owner)/actions/loads.ts` — CRUD for Load model
- `apps/web/src/app/(owner)/actions/routes.ts` — CRUD for Route model
- `apps/web/src/app/api/mobile/driver/loads/*` — Driver mobile endpoints use Load model

**Assessment:** **FULLY LIVE** — This is the original DriveCommand data model, still actively used by:
- Owner portal loads/routes management
- Driver portal (web + mobile)
- Invoicing system
- CRM system
- Financial tracking (expenses, payments)

---

### 1.2 snake_case Universe (Carrier Operations)

**Tables (Prisma Model Names → DB Table Names):**

| Prisma Model | DB Table (via @@map) | Purpose | Status |
|--------------|----------------------|---------|--------|
| `CarrierClient` | `clients` | Customer/shipper management (replaces Customer) | **LIVE** |
| `CarrierDispatch` | `dispatches` | Trip/dispatch management (replaces Route) | **LIVE** |
| `CarrierLoad` | `loads` | Load/shipment management (replaces Load) | **LIVE** |
| `CarrierStop` | `stops` | Stops on a dispatch (replaces RouteStop) | **LIVE** |
| `CarrierTruck` | `trucks` | Fleet truck management (replaces Truck) | **LIVE** |
| `CarrierDriver` | `drivers` | Driver profile (separate from User) | **LIVE** |
| `CarrierFacility` | `facilities` | Shipper/receiver locations | **LIVE** |
| `CarrierContract` | `contracts` | Rate contracts with clients | **LIVE** |
| `RouteTemplate` | `route_templates` | Recurring route templates | **LIVE** |
| `RouteTemplateStop` | `route_template_stops` | Stop templates for recurring routes | **LIVE** |
| `CarrierDocument` | `carrier_documents` | Documents (BOL/POD/rate confirmations) | **LIVE** |
| `CarrierExpense` | `carrier_expenses` | Expense tracking per dispatch/load | **LIVE** |
| `DriverPayRecord` | `driver_pay_records` | Driver pay settlement records | **LIVE** |
| `LoadDriverAssignment` | `load_driver_assignments` | Driver pay calculations per load | **LIVE** |
| `LoadPayComponent` | `load_pay_components` | Itemized pay components (mileage/detention/bonuses) | **LIVE** |

**Key Relationships:**
- `CarrierDispatch.primaryDriverId` → `CarrierDriver.id` (required)
- `CarrierDispatch.truckId` → `CarrierTruck.id` (required)
- `CarrierDispatch.routeTemplateId` → `RouteTemplate.id` (nullable — can be ad-hoc or template-generated)
- `CarrierLoad.dispatchId` → `CarrierDispatch.id` (nullable — loads can exist before dispatch assignment)
- `CarrierLoad.clientId` → `CarrierClient.id` (required)
- `CarrierStop.dispatchId` → `CarrierDispatch.id` (required)
- `CarrierStop.loadId` → `CarrierLoad.id` (nullable — stops can be shared or load-independent)
- `CarrierStop.facilityId` → `CarrierFacility.id` (required)
- `RouteTemplate.clientId` → `CarrierClient.id` (required)

**Schema Characteristics:**
- Uses `@@map()` directives to map PascalCase models to snake_case DB tables
- Fields use snake_case with `@map()`: `orgId` → `org_id`, `clientId` → `client_id`
- Standard tenant columns: `created_at`, `updated_at`, `created_by_id`, `updated_by_id`
- No soft-delete `archivedAt` — uses `active` boolean for RouteTemplate

**Pages/Routes Using This Universe:**

| Route Path | Model Used | Read/Write |
|------------|------------|------------|
| `/carrier/loads/page.tsx` | `prisma.carrierLoad` | Read (list) |
| `/carrier/loads/[id]/page.tsx` | `prisma.carrierLoad` | Read (detail) |
| `/carrier/loads/new/page.tsx` | `prisma.carrierLoad` | Write (create) |
| `/carrier/dispatches/page.tsx` | `prisma.carrierDispatch` | Read (list) |
| `/carrier/dispatches/[id]/page.tsx` | `prisma.carrierDispatch` | Read (detail) |
| `/carrier/dispatches/[id]/stops/page.tsx` | `prisma.carrierStop` | Read/Write |
| `/carrier/stops/[id]/page.tsx` | `prisma.carrierStop` | Read (detail) |
| `/carrier/clients/*` | `prisma.carrierClient` | Read/Write |
| `/carrier/facilities/*` | `prisma.carrierFacility` | Read/Write |
| `/carrier/contracts/*` | `prisma.carrierContract` | Read/Write |
| `/carrier/route-templates/*` | `prisma.routeTemplate` | Read/Write |

**Server Actions/APIs:**
- `apps/web/src/lib/carrier/dispatches.ts` — Dispatch CRUD + state machine
- `apps/web/src/lib/carrier/loads.ts` — Load CRUD + stop persistence
- `apps/web/src/lib/carrier/route-templates.ts` — Template CRUD + RRULE parsing
- `apps/web/src/lib/carrier/stop-completion.ts` — Stop lifecycle (arrive → complete → skip)
- `apps/web/src/lib/carrier/revenue-calculator.ts` — Load revenue calculation
- `apps/web/src/lib/carrier/pay-calculator.ts` — Driver pay record generation
- `apps/web/src/app/api/v1/carrier/*` — RESTful API for Carrier Operations

**Assessment:** **FULLY LIVE** — This is the new Carrier Operations module (Phase 38+), actively used by:
- Carrier Operations portal (`/carrier/*` routes)
- Dispatch management system
- Load board
- Route template + recurring dispatch automation
- Driver pay calculation system
- Facilities + contracts management

---

### 1.3 Critical Observation: The Two "Load" Tables

**The two Load tables are NOT connected:**

| Field | Original `Load` | Carrier `CarrierLoad` |
|-------|----------------|----------------------|
| Customer FK | `customerId` → `Customer.id` | `clientId` → `CarrierClient.id` |
| Trip/Route FK | `routeId` → `Route.id` | `dispatchId` → `CarrierDispatch.id` |
| Stop Links | `pickupStopId`, `deliveryStopId` → `RouteStop.id` | Stops link back via `CarrierStop.loadId` |
| Driver Assignment | `driverId` → `User.id` (denormalized) | Via `CarrierDispatch.primaryDriverId` |
| Truck Assignment | `truckId` → `Truck.id` (denormalized) | Via `CarrierDispatch.truckId` |
| Rate Fields | `rate` (single Decimal) | `rateType`, `rateAmount`, `fuelSurcharge`, `detentionAmount`, `otherCharges`, `totalRevenue` |
| Status Enum | `LoadStatus` (PENDING/ACTIVE/DELIVERED/CANCELLED) | String (pending/in_transit/delivered/invoiced/cancelled) |
| Origin/Destination | Text fields: `origin`, `destination` | Derived from `CarrierStop` records |
| Invoicing | `Invoice.loadId` → `Load.id` | No direct invoice link (future work) |

**Data Isolation:**
- No foreign keys between the two universes
- No shared customer/client data (Customer vs CarrierClient are separate tables)
- No shared truck data (Truck vs CarrierTruck are separate tables)
- Mobile driver API uses **original Load model** (`/api/mobile/driver/loads`)
- Carrier Operations uses **CarrierLoad model** (`/api/v1/carrier/loads`)

**Why Two Universes Exist:**

Based on git history and phase progression:
1. **v1.0–v4.0 (Phases 1–28):** Built original Load/Route/Customer model
2. **v5.0+ (Phase 38+):** Built Carrier Operations as a **parallel system** with:
   - More sophisticated rate handling (rateType, fuel surcharge, detention)
   - Facility-based addressing (vs free-text origin/destination)
   - Contract-based pricing
   - Driver pay calculation integration
   - Route templates + recurring dispatches

The two systems coexist because **migration was never completed** — likely due to:
- Backward compatibility concerns (invoicing, mobile app)
- Risk of breaking existing workflows
- Incremental feature development (easier to build new than refactor old)

---

### 1.4 Dead Code Assessment

**Original Universe (PascalCase):**
- **Status:** LIVE — Not dead code
- **Usage:** Owner loads/routes pages, driver portal, mobile app, invoicing, CRM
- **Risk:** Cannot delete without breaking:
  - Mobile app driver loads screen
  - Web driver portal
  - Invoice generation tied to Load.id
  - Customer tracking page (`/track/[token]` uses Load.trackingToken)

**Carrier Universe (snake_case):**
- **Status:** LIVE — Not dead code
- **Usage:** Carrier Operations portal (`/carrier/*` routes), dispatch management, driver pay
- **Risk:** Cannot delete without breaking:
  - Dispatch board
  - Route templates + recurring automation
  - Driver pay settlement system
  - Facilities + contracts management

**Conclusion:** Neither universe is dead code. The system has **two active, parallel implementations** serving different parts of the application.

---

## 2. Current Dispatch/Trip Model (Carrier Operations)

### 2.1 Core Entities and Relationships

```
┌─────────────────────┐
│   RouteTemplate     │
│ (route_templates)   │
├─────────────────────┤
│ templateName        │
│ scheduleType        │
│ recurrenceRule      │  RRULE (DAILY/WEEKLY/MONTHLY)
│ clientId            │──┐
│ defaultDriverId     │  │
│ defaultTruckId      │  │
│ estimatedMiles      │  │
└─────────────────────┘  │
          │              │
          │ inherits     │
          │ stops        │
          v              │
┌─────────────────────┐  │
│  CarrierDispatch    │  │
│   (dispatches)      │  │
├─────────────────────┤  │
│ primaryDriverId     │  │  ┌─────────────────────┐
│ truckId             │  │  │   CarrierClient     │
│ routeTemplateId     │◄─┘  │     (clients)       │
│ scheduledDeparture  │     ├─────────────────────┤
│ actualDeparture     │     │ name                │
│ status              │─────┤ mcNumber            │
│   planned           │     │ paymentTerms        │
│   in_progress       │     │ creditLimit         │
│   completed         │     └─────────────────────┘
│   cancelled         │               │
│   tonu              │               │
│ plannedMiles        │               │
│ actualMiles         │               │
└─────────────────────┘               │
          │                           │
          │ has many                  │
          v                           │
┌─────────────────────┐               │
│   CarrierStop       │               │
│     (stops)         │               │
├─────────────────────┤               │
│ dispatchId          │               │
│ loadId (nullable)   │───┐           │
│ facilityId          │   │           │
│ sequenceOrder       │   │           │
│ stopType            │   │           │
│ appointmentStart    │   │           │
│ appointmentEnd      │   │           │
│ arrivedAt           │   │           │
│ departedAt          │   │           │
│ status              │   │           │
│   pending           │   │           │
│   arrived           │   │           │
│   completed         │   │           │
│   skipped           │   │           │
│ bolRequired         │   │           │
│ podRequired         │   │           │
│ contactName         │   │           │
│ contactPhone        │   │           │
└─────────────────────┘   │
                          │
          ┌───────────────┘
          v
┌─────────────────────┐
│   CarrierLoad       │
│      (loads)        │
├─────────────────────┤
│ dispatchId (null?)  │
│ clientId            │──────────────────┘
│ contractId (null?)  │
│ referenceNumber     │  LD-2026-00001
│ bolNumber           │
│ proNumber           │
│ poNumber            │
│ commodityDesc       │
│ rateType            │  flat / per_mile / per_cwt / per_pallet
│ rateAmount          │
│ totalRevenue        │  Calculated by revenue-calculator.ts
│ fuelSurcharge       │
│ detentionAmount     │
│ otherCharges        │
│ status              │
│   pending           │
│   in_transit        │
│   delivered         │
│   invoiced          │
│   cancelled         │
│ pendingStopsJson    │  Stores stops as JSON when no dispatchId yet
└─────────────────────┘
```

### 2.2 Key Relationship Questions

**Can a load exist before truck assigned?**
- **YES** — `CarrierLoad.dispatchId` is nullable
- Workflow: Create load → store stops as `pendingStopsJson` → assign to dispatch later
- When `dispatchId` is set, `pendingStopsJson` is parsed and persisted as `CarrierStop` records

**Can one dispatch carry multiple loads?**
- **YES** — `CarrierDispatch` has `carrierLoads` relation (one-to-many)
- One truck can haul multiple loads on a single trip (e.g., LTL consolidation, multi-pickup route)

**Where does stop sequence live?**
- `CarrierStop.sequenceOrder` (integer)
- Unique constraint: `(dispatchId, sequenceOrder)` — enforces no duplicate positions per dispatch
- When adding a second load's stops to a dispatch, `sequenceOrder` is offset by the count of existing stops (see `loads.ts:340-350`)

**Where does revenue/rate live?**
- `CarrierLoad.rateAmount` — base rate
- `CarrierLoad.totalRevenue` — calculated field (stored, not computed on read)
- Calculation: `revenue-calculator.ts` → `calculateRevenue()` → considers:
  - `rateType` (flat, per_mile, per_cwt, per_pallet)
  - `plannedMiles` / `actualMiles` (from dispatch)
  - `fuelSurcharge` (from contract or manual)
  - `otherCharges`, `detentionAmount`
  - `carrierCost` (if broker flag set)

**Driver assignment:**
- `CarrierDispatch.primaryDriverId` → required
- `CarrierDispatch.coDriverId` → optional (team driver support)
- No direct driver FK on `CarrierLoad` (driver is inherited from dispatch)

**Truck assignment:**
- `CarrierDispatch.truckId` → required
- `CarrierDispatch.trailerId` → optional
- No direct truck FK on `CarrierLoad` (truck is inherited from dispatch)

### 2.3 Status State Machines

**CarrierDispatch Status Flow:**
```
planned ──┬──> in_progress ──> completed
          │
          ├──> cancelled
          │
          └──> tonu (Truck Ordered Not Used)
```

**Transition Logic (dispatches.ts:534-868):**
- `planned` → `in_progress`: Sets `actualDeparture`, fires `ON_DISPATCH_DEPART` workflow event
- `in_progress` → `completed`:
  - Validates all stops are `completed` or `skipped`
  - Sets `actualArrival`
  - Generates driver pay records via `generateDriverPayRecords()`
  - If dispatch has `routeTemplateId`, auto-generates next recurring dispatch via `computeNextOccurrence()`
  - Fires `ON_DISPATCH_DELIVER` workflow event
- `planned` → `cancelled`: Cascades to all `pending` loads on dispatch (marks them `cancelled`)
- `planned` → `tonu`: Prepends `[TONU]` to notes

**CarrierLoad Status Flow:**
```
pending ──> in_transit ──> delivered ──> invoiced
   │
   └──> cancelled
```

**Transition Logic (stop-completion.ts + loads.ts):**
- `pending` → `in_transit`: Triggered when first **pickup stop** is completed
- `in_transit` → `delivered`: Triggered when **last delivery stop** is completed, triggers revenue recalculation
- `delivered` → `invoiced`: Manual transition (future: auto-invoice generation)
- Any status → `cancelled`: Manual cancellation

**CarrierStop Status Flow:**
```
pending ──> arrived ──> completed
   │
   └──────────────────> skipped (admin override)
```

**Transition Logic (stop-completion.ts):**
- `pending` → `arrived`: Sets `arrivedAt` timestamp
- `arrived` → `completed`:
  - Enforces BOL/POD document requirements (from `RouteTemplateStop` config)
  - Sets `departedAt`, computes `dwellMinutes`
  - **Cascade to load:** If pickup stop → marks load `in_transit`
  - **Cascade to load:** If last delivery stop → marks load `delivered`, triggers revenue recalc
  - **Cascade to dispatch:** If all stops done → marks dispatch `completed`, triggers pay record generation
- Any → `skipped`: Admin override, requires `skipReason`, logs user ID

---

## 3. Route Templates

### 3.1 Schema Overview

**RouteTemplate Table:**
- `templateName` — user-facing name (e.g., "Chicago to Dallas Weekly")
- `clientId` → `CarrierClient.id` — which customer is this route for?
- `contractId` → `CarrierContract.id` (nullable) — links to pricing contract
- `scheduleType` — enum-like string (recurring, one_time, on_demand)
- `recurrenceRule` — iCal RRULE string (e.g., `FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=1`)
- `recurrenceTimezone` — IANA timezone (default: `America/Chicago`)
- `scheduledDepartureTime` — time-only string (e.g., `08:00`)
- `equipmentType` — truck type (dry_van, reefer, flatbed, etc.)
- `tempMinF`, `tempMaxF` — reefer load temp requirements
- `maxWeightLbs` — load capacity
- `commodityDescription` — default commodity
- `estimatedMiles` — planned mileage for this route
- `defaultDriverId` → `CarrierDriver.id` (nullable) — default driver for auto-generated dispatches
- `defaultTruckId` → `CarrierTruck.id` (nullable) — default truck
- `autoGenerateDaysAhead` — how many days in advance to auto-generate (default: 7)
- `active` — boolean (soft delete via deactivation)

**RouteTemplateStop Table:**
- `routeTemplateId` → `RouteTemplate.id`
- `sequenceOrder` — stop ordering (1, 2, 3, ...)
- `stopType` — pickup, delivery, fuel_stop, layover
- `facilityId` → `CarrierFacility.id` — shipper/receiver location
- `contactName`, `contactPhone` — contact at this stop
- `apptWindowStartOffsetMin` — minutes after `scheduledDeparture` (e.g., 120 = 2 hours)
- `apptWindowEndOffsetMin` — minutes after `scheduledDeparture` (e.g., 180 = 3 hours)
- `expectedDwellMinutes` — estimated time at stop
- `commodityDescription` — cargo at this stop
- `bolRequired` — boolean (enforce BOL upload/number before completion)
- `podRequired` — boolean (enforce POD upload/number before completion)
- `specialInstructions` — stop-specific notes

**Unique Constraint:** `(routeTemplateId, sequenceOrder)` — enforces no duplicate stop positions

### 3.2 Recurrence Mechanism

**iCal RRULE Parsing:**

`route-templates.ts:42-164` implements a custom RRULE parser:

**Supported Frequencies:**
- `FREQ=DAILY;INTERVAL=N` — every N days
- `FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=N` — specific days of week, every N weeks
- `FREQ=MONTHLY;BYMONTHDAY=1,15;INTERVAL=N` — specific days of month, every N months

**Additional Directives:**
- `UNTIL=20261231` — end date (YYYYMMDD format)
- `COUNT=10` — max occurrences

**computeNextOccurrence() Logic:**
1. Parse RRULE into parts (FREQ, INTERVAL, BYDAY, BYMONTHDAY, UNTIL, COUNT)
2. Work from today (in specified timezone)
3. Scan forward to find next valid occurrence:
   - **DAILY:** Advance by `INTERVAL` days
   - **WEEKLY:** Scan day-by-day, check if `getDay()` matches BYDAY, ensure week interval matches
   - **MONTHLY:** Scan month-by-month, check if day-of-month matches BYMONTHDAY
4. Validate against `UNTIL` and `COUNT` limits
5. Return ISO date string (`YYYY-MM-DD`) or `null` if exhausted

**Example RRULEs:**
- `FREQ=DAILY;INTERVAL=1` → every day
- `FREQ=WEEKLY;BYDAY=MO,WE,FR;INTERVAL=1` → every Monday, Wednesday, Friday
- `FREQ=MONTHLY;BYMONTHDAY=1,15;INTERVAL=1` → 1st and 15th of every month
- `FREQ=WEEKLY;BYDAY=MO;INTERVAL=2;UNTIL=20261231` → every other Monday until Dec 31, 2026

### 3.3 Dispatch Generation from Templates

**Manual Generation (dispatches.ts:166-372):**

When creating a dispatch with `routeTemplateId` set:
1. Look up `RouteTemplate` and its `RouteTemplateStop` records
2. Inherit `estimatedMiles` → `CarrierDispatch.plannedMiles` (if not overridden)
3. Append `[Template: {templateName}]` to dispatch notes
4. Clone all template stops into `CarrierStop` records:
   - `sequenceOrder` preserved
   - `appointmentStart` = `scheduledDeparture` + `apptWindowStartOffsetMin`
   - `appointmentEnd` = `scheduledDeparture` + `apptWindowEndOffsetMin`
   - `facilityId`, `contactName`, `contactPhone`, `commodityDescription`, `specialInstructions` copied
   - `bolRequired`, `podRequired` copied (enforced during stop completion)
   - Address snapshot stored in `notes` JSON (for historical record if facility changes)

**Auto-Generation on Dispatch Completion (dispatches.ts:658-814):**

When `transitionDispatchStatus(in_progress → completed)` is called:
1. Check if dispatch has `routeTemplateId`
2. If yes, lookup template and verify `recurrenceRule` exists and `active=true`
3. Call `computeNextOccurrence(recurrenceRule, recurrenceTimezone)` → get next date
4. Check for existing dispatch on that date + template (deduplication)
5. If no duplicate, create new dispatch:
   - `scheduledDeparture` = next date + `scheduledDepartureTime`
   - `primaryDriverId` = completed dispatch's driver (carry-forward assignment)
   - `truckId` = completed dispatch's truck (carry-forward assignment)
   - `status` = `planned`
   - `notes` = `[DISPATCH_NUMBER=DC-YYYY-NNNNN] [Template: {templateName}]`
   - Clone stops from template (same logic as manual generation)
6. Send push notification to driver about next scheduled dispatch

**Does a load ever attach to a template?**
- **NO** — `RouteTemplate` has no load FK
- Loads are created separately and attached to **dispatches** after generation
- Template only defines:
  - Stop sequence (facilities, appointment windows, documents required)
  - Default driver/truck
  - Estimated mileage
  - Recurrence schedule

**Load Attachment Workflow:**
1. Route template generates dispatch (or user manually creates dispatch from template)
2. Dispatch exists in `planned` status with stops pre-created
3. User creates `CarrierLoad` records (via `/carrier/loads/new`)
4. User assigns loads to dispatch by setting `CarrierLoad.dispatchId`
5. When load is assigned, its stops (from `pendingStopsJson` or manual creation) are merged into dispatch's stop sequence

---

## 4. Existing UI Building Blocks

### 4.1 Stop Management Components

**Stop Input Interface (loads.ts:27-42):**
```typescript
interface StopInput {
  id?: string;                    // Existing stop ID (for updates)
  facility_id: string;            // FK to CarrierFacility
  stop_type: 'pickup' | 'delivery' | 'fuel_stop' | 'layover';
  sequence_order: number;         // Position in route
  contact_name?: string | null;
  contact_phone?: string | null;
  commodity_description?: string | null;
  pieces?: number | null;
  weight_lbs?: number | null;
  bol_required?: boolean;
  pod_required?: boolean;
  special_instructions?: string | null;
  appointment_start?: string | null;  // ISO timestamp
  appointment_end?: string | null;    // ISO timestamp
}
```

**Stop Builder (loads.ts:262-367 — persistStops() helper):**
- Handles stop CRUD within a transaction
- Validates facilities belong to org (tenant isolation)
- **Safety guard:** Empty submission with existing stops = no-op (not delete all)
- **Update logic:** Preserves stops with `id` in payload, deletes pending stops not in payload
- **Create logic:** Offsets `sequenceOrder` by existing dispatch stop count (avoids unique constraint violation when second load's stops are added)
- **Used by:** `createLoad()`, `updateLoad()` when `dispatchId` is set

**Stop Pages:**
- **`/carrier/dispatches/[id]/stops/page.tsx`** — Stop management UI for a dispatch (read/write)
- **`/carrier/stops/[id]/page.tsx`** — Individual stop detail (read-only)

**Assessment:** **Reusable with changes**
- The `StopInput` interface is well-designed and reusable
- The `persistStops()` helper is solid (transaction-based, tenant-isolated, sequence-offset logic)
- **Gap:** No frontend stop builder UI component (pages exist but no shared `<StopBuilder />` component)
- **Recommendation:** Extract a reusable `<StopSequenceEditor />` component with:
  - Drag-and-drop reordering
  - Facility autocomplete
  - Appointment time pickers
  - Document requirement toggles
  - Contact info fields

### 4.2 Dispatch Pages (Carrier Operations)

**List Page (`/carrier/dispatches/page.tsx`):**
- Uses `DispatchesGrid` DataGrid component
- Filters: status, date range, driver, route template
- Shows: dispatch number, driver, truck, scheduled departure, status, stop count, progress
- Actions: View detail, Edit (planned only), Start trip, Cancel

**Detail Page (`/carrier/dispatches/[id]/page.tsx`):**
- Displays: dispatch info (driver, truck, dates, miles, status)
- Tabs:
  - **Stops:** Timeline of stops with status badges, ETA, arrived/departed times
  - **Loads:** List of loads on this dispatch (with revenue totals)
  - **Expenses:** Fuel, tolls, maintenance
  - **Pay Records:** Driver pay breakdown (if dispatch completed)
- Actions: Transition status (Start, Complete), Manage stops, Manage loads

**DataGrid Components (`/carrier/dispatches/_grid/`):**
- `DispatchesGrid.tsx` — DataGrid wrapper with server-side pagination
- `columns.tsx` — Column definitions (driver, truck, status, scheduled departure, progress)

**Assessment:** **Reusable as-is** with minor tweaks
- DataGrid pattern is solid (already standardized across loads/dispatches/clients)
- Detail page structure (tabs, info cards) is reusable
- **Gap:** Status transition UI is inline buttons — could be extracted to `<StatusTransitionModal />`

### 4.3 Load Pages (Carrier Operations)

**List Page (`/carrier/loads/page.tsx`):**
- Uses `LoadsGrid` DataGrid component
- Filters: client, dispatch, status, date range
- Shows: reference number, client, dispatch, rate, revenue, status
- Actions: View detail, Edit (pending only), Attach to dispatch, Cancel

**Detail Page (`/carrier/loads/[id]/page.tsx`):**
- Displays: load info (client, reference numbers, commodity, rate, revenue)
- Sections:
  - **Freight Details:** BOL/PRO/PO, commodity, weight, pieces
  - **Financials:** Rate breakdown, fuel surcharge, detention, total revenue
  - **Dispatch:** Link to dispatch (if assigned), stops on this load
  - **Documents:** BOL/POD uploads
  - **Expenses:** Load-specific expenses
- Actions: Change status, Edit rate, Attach/detach dispatch

**Create Page (`/carrier/loads/new/page.tsx`):**
- Form with:
  - Client selector (CarrierClient autocomplete)
  - Contract selector (auto-populates rate fields)
  - Freight fields (BOL/PRO/PO, commodity, weight, pieces)
  - Rate fields (rate type, amount, FSC, detention)
  - Dispatch assignment (optional)
  - Stop builder (inline — if no dispatch, stores as `pendingStopsJson`)

**DataGrid Components (`/carrier/loads/_grid/`):**
- `LoadsGrid.tsx` — DataGrid wrapper
- `columns.tsx` — Column definitions (reference number, client, dispatch, status, revenue)

**Assessment:** **Reusable with changes**
- List/detail pages follow standard pattern (good)
- **Gap:** Create page has inline stop builder — should use shared `<StopSequenceEditor />`
- **Gap:** Revenue breakdown is hardcoded — should extract `<RevenueBreakdown />` component
- **Recommendation:** Extract `<LoadForm />` component with:
  - Freight fields
  - Rate calculator UI
  - Stop sequence editor
  - Dispatch assignment picker

### 4.4 Load Pages (Original PascalCase)

**List Page (`/loads/page.tsx`):**
- Uses `prisma.load` (original Load model)
- Filters: status, driver, date range
- Shows: load number, customer, origin, destination, driver, truck, status
- Actions: View detail, Edit, Cancel

**Detail Page (`/loads/[id]/page.tsx`):**
- Displays: load info (customer, origin/destination, rate, notes)
- Sections:
  - **Route Assignment:** Shows assigned route + driver + truck
  - **Stop Timeline:** Uses `RouteStop` records (pickup/delivery)
  - **Documents:** Rate confirmations, BOL/POD
  - **Invoices:** List of invoices tied to this load
  - **Messages:** Load-scoped fleet messages
- Actions: Edit, Change status, Generate invoice, Revert status

**Edit Page (`/loads/[id]/edit/page.tsx`):**
- Form with:
  - Customer selector (Customer model)
  - Origin/destination (free-text address fields)
  - Driver/truck assignment (denormalized FKs on Load)
  - Rate (single Decimal field)
  - Pickup/delivery dates

**Components (`/components/loads/`):**
- `load-form.tsx` — Load create/edit form (original model)
- `load-list.tsx` — Load list table (original model)
- `load-status-badge.tsx` — Status badge component

**Assessment:** **Legacy — reusable but outdated**
- Uses original Load/Route/Customer models (incompatible with Carrier Operations)
- Free-text origin/destination (vs facility-based)
- Single rate field (vs itemized rate components)
- **Cannot be merged with Carrier Operations UI** without data migration
- **Recommendation:** Phase out in favor of Carrier Operations UI once migration is complete

### 4.5 Driver-Side Views (Web + Mobile)

**Web Driver Portal:**
- **`/driver/my-load/page.tsx`** — Uses `prisma.load` (original model)
- **`/driver/my-route/page.tsx`** — Uses `prisma.route` (original model)
- Shows: assigned load, route stops, status update modal

**Mobile Driver Portal (`apps/mobile/app/(driver)/`):**
- **`loads/index.tsx`** — Load list (Active/History tabs), uses `/api/mobile/driver/loads` (original Load model)
- **`loads/[id].tsx`** — Load detail with stop timeline, status update modal
- **`my-route.tsx`** — Route detail with loads timeline, truck card, route messages
- **`map.tsx`** — MapView with OSRM polyline, route info panel, navigation

**Assessment:** **Cannot be migrated without breaking changes**
- Mobile app uses original Load/Route models (compiled into binary)
- API endpoints: `/api/mobile/driver/loads/*` query `prisma.load`
- **Blockers for migration to Carrier Operations:**
  1. Mobile API must be rewritten to use `prisma.carrierLoad`
  2. Mobile app must be updated to new data model
  3. OTA update required (cannot deploy until all drivers update app)
- **Recommendation:** Keep original Load/Route models until mobile v6.0 migration

---

## 5. Driver Stop-Completion Flow

### 5.1 Current Flow (3-Stage Cascade)

**Stage 1: Arrive Stop**

**Endpoint:** `arriveStop(orgId, stopId)` (stop-completion.ts:24-47)

**Flow:**
1. Validate stop exists and belongs to org
2. Validate stop is in `pending` status
3. Update stop:
   - `arrivedAt` = current timestamp
   - `status` = `arrived`
4. Log arrival event

**Stage 2: Complete Stop**

**Endpoint:** `completeStop(orgId, stopId, options?)` (stop-completion.ts:53-246)

**Flow:**
1. Validate stop is in `arrived` status
2. **Document Enforcement:**
   - If `RouteTemplateStop.bolRequired` = true:
     - Check for `CarrierStop.bolNumber` OR `CarrierDocument` with `documentType='bol'`
     - Return `422` error if missing (unless `bypassDocumentCheck=true`)
   - If `RouteTemplateStop.podRequired` = true:
     - Check for `CarrierStop.podNumber` OR `CarrierDocument` with `documentType='pod'`
     - Return `422` error if missing (unless `bypassDocumentCheck=true`)
3. Set `departedAt` = current timestamp
4. Compute `dwellMinutes` = (`departedAt` - `arrivedAt`) / 60000
5. Merge `dwell_minutes` into stop `notes` JSON
6. Update stop:
   - `status` = `completed`
   - `departedAt` = timestamp
   - `notes` = merged JSON
7. Fire-and-forget: `sendStopCompletedNotification(orgId, stopId)`
8. **Load Cascade — Pickup:**
   - If stop is `pickup` type AND has `loadId`:
     - Mark load `in_transit` (if currently pending/booked/assigned)
     - Fire-and-forget: `sendClientPickupNotification(orgId, loadId, stopId)` (only on first pickup)
9. **Load Cascade — Delivery:**
   - If stop has `loadId`:
     - Count pending delivery stops for this load
     - If zero remaining:
       - Mark load `delivered`
       - Trigger revenue recalculation (`recalculateAndStore()`)
       - Fire-and-forget: `sendLoadDeliveredNotification(orgId, loadId)`
10. **Dispatch Cascade:**
    - Count pending stops for this dispatch
    - If zero remaining:
      - Mark dispatch `completed`
      - Set `actualArrival` = current timestamp
      - Generate driver pay records (`generateDriverPayRecords()`)
      - Log completion event

**Stage 3: Skip Stop (Admin Override)**

**Endpoint:** `skipStop(orgId, stopId, userId, skipReason)` (stop-completion.ts:252-289)

**Flow:**
1. Validate stop exists and belongs to org
2. Create skip log: `[SKIPPED by {userId} at {timestamp}]`
3. Merge skip log into stop `notes` JSON
4. Update stop:
   - `status` = `skipped`
   - `skipReason` = reason text
   - `notes` = merged JSON
5. Log skip event

**Role Check:** Happens in API route (`/api/v1/carrier/stops/[id]/skip`), NOT in service function

### 5.2 Document Upload Flow

**Upload Endpoints:**
- **Web:** `/api/v1/carrier/documents` (POST) — upload document, attach to stopId
- **Mobile:** `/api/mobile/carrier/driver/stops/[stopId]/documents` (POST) — same flow

**CarrierDocument Table:**
- `stopId` → `CarrierStop.id` (nullable — documents can attach to dispatch/load/driver too)
- `documentType` — enum: 'bol', 'pod', 'rate_confirmation', 'inspection', 'other'
- `fileName` — original filename
- `fileUrl` — S3 URL (Cloudflare R2)
- `uploadedBy` → `User.id`
- `uploadedAt` — timestamp

**Flow:**
1. Driver arrives at stop (`arriveStop()`)
2. Driver captures BOL/POD photo (mobile camera or web file upload)
3. Upload to S3 via presigned URL
4. Create `CarrierDocument` record with `stopId` + `documentType`
5. Driver attempts `completeStop()`:
   - If `bolRequired=true` → checks for `CarrierDocument` with `documentType='bol'` OR `stop.bolNumber`
   - If `podRequired=true` → checks for `CarrierDocument` with `documentType='pod'` OR `stop.podNumber`
   - If missing → returns `422` error with message
6. Driver sees error toast, uploads missing document
7. Retry `completeStop()` → succeeds

**Document Requirements Source:**
- If stop was generated from `RouteTemplate`:
  - `RouteTemplateStop.bolRequired` → copied to `CarrierStop.bolRequired`
  - `RouteTemplateStop.podRequired` → copied to `CarrierStop.podRequired`
- If stop was manually created:
  - `CarrierStop.bolRequired` defaults to `true`
  - `CarrierStop.podRequired` defaults to `true`

**Bypass Override:**
- `completeStop(orgId, stopId, { bypassDocumentCheck: true })` — skips BOL/POD enforcement
- Used for fuel stops, layovers, or emergency situations
- **No audit trail** — consider adding BypassAudit table

### 5.3 Checklist Integration (Workflow Engine)

**Workflow Engine Spec:** `docs/specs/workflow-engine.md`

**Current Integration:**

**Dispatch-Level Playbooks:**
- `TriggerEvent.ON_DISPATCH_CREATE` fires when dispatch is created
  - Example: Pre-trip inspection checklist
  - Attaches `PlaybookInstance` to dispatch
  - Driver must complete before starting trip
- `TriggerEvent.ON_DISPATCH_DEPART` fires when dispatch transitions to `in_progress`
  - Example: Departure checklist (fuel check, tire pressure, HOS log)
- `TriggerEvent.ON_DISPATCH_DELIVER` fires when dispatch transitions to `completed`
  - Example: Post-trip inspection checklist

**Stop-Level Playbooks:**
- **NOT IMPLEMENTED** — Stops are NOT entities in workflow engine
- `CarrierStop` is not a valid `entityType` in `TriggerEvent` enum
- **Gap:** No way to attach per-stop checklists (e.g., "BOL verification", "Seal check", "Temperature log")

**Recommendation for Future Work:**
1. Add `TriggerEvent.ON_STOP_ARRIVE` + `TriggerEvent.ON_STOP_COMPLETE`
2. Allow `PlaybookInstance.entityType = 'stop'` + `PlaybookInstance.entityId = stopId`
3. Update `completeStop()` to check for pending stop-level playbooks
4. Block completion if required playbooks are incomplete

**DVIR Integration:**
- **Current:** DVIR (Driver Vehicle Inspection Report) is a checklist type in workflow engine
- **Trigger:** `TriggerEvent.ON_DISPATCH_CREATE` → spawns DVIR playbook
- **Enforcement:** Dispatch cannot transition to `in_progress` if DVIR is incomplete (future enforcement)

---

## 6. Summary and Recommendations

### 6.1 Data Universe Consolidation

**Current State:**
- Two parallel data models coexist: original (Load/Route/Customer) and Carrier Operations (CarrierLoad/CarrierDispatch/CarrierClient)
- No cross-references between universes
- Both are fully live and actively used

**Migration Path Options:**

**Option A: Full Migration (High Risk, High Reward)**
1. Migrate all Load → CarrierLoad data
2. Migrate all Route → CarrierDispatch data
3. Migrate all Customer → CarrierClient data
4. Rewrite mobile app to use Carrier Operations API
5. Rewrite invoice generation to use CarrierLoad
6. Deprecate original models

**Pros:**
- Single source of truth
- Eliminates confusion
- Better rate handling, facility-based addressing, driver pay integration

**Cons:**
- Breaking changes for mobile app (requires OTA update + version enforcement)
- Invoice migration complexity (historical invoices tied to old Load.id)
- Customer tracking page uses Load.trackingToken (must migrate tokens)
- High risk of data loss if migration script fails

**Option B: Gradual Convergence (Low Risk, Slower)**
1. Add `carrierLoadId` FK to original `Load` table (nullable)
2. Create "shadow" CarrierLoad records for new loads (dual-write)
3. Gradually migrate invoicing to use CarrierLoad
4. Mobile v6.0: Switch to Carrier Operations API, keep backward compatibility for old loads
5. After all devices updated, deprecate original models

**Pros:**
- No breaking changes
- Rollback-friendly (can disable dual-write if issues found)
- Invoicing can migrate load-by-load (test with one load first)

**Cons:**
- Dual-write complexity (must keep both in sync)
- Slower timeline (6+ months)

**Recommendation:** **Option B** (Gradual Convergence) — Less risk, allows incremental testing

### 6.2 UI Component Reusability

**Reusable As-Is:**
- DataGrid pattern (loads/dispatches/clients grids)
- Dispatch detail page structure (tabs, info cards)
- Status badges
- Document upload flow

**Reusable with Changes:**
- Stop builder (extract `<StopSequenceEditor />` component)
- Load form (extract `<LoadForm />` with freight fields + rate calculator)
- Revenue breakdown (extract `<RevenueBreakdown />` component)

**Better Scrapped:**
- Original Load/Route pages (`/loads/*`) — incompatible with Carrier Operations
- Original load form component (`load-form.tsx`) — outdated rate model

**Gap: Shared Components Missing:**
- `<StopSequenceEditor />` — drag-and-drop stop reordering, facility picker, appointment times
- `<LoadForm />` — reusable form with freight fields, rate calculator, dispatch picker
- `<RevenueBreakdown />` — itemized revenue display (rate + FSC + detention + other)
- `<StatusTransitionModal />` — reusable modal for state transitions (start trip, complete, cancel)

### 6.3 Stop-Completion Enhancements

**Current Strengths:**
- 3-stage cascade (arrive → complete → dispatch done) is solid
- Document enforcement (BOL/POD) works well
- Load/dispatch status transitions are automatic

**Gaps:**
1. **No per-stop checklists** — Workflow engine does not support stop-level playbooks
2. **No bypass audit trail** — `bypassDocumentCheck=true` has no audit log (who bypassed? why?)
3. **No ETA tracking** — System doesn't compute expected arrival times based on distance/traffic
4. **No geofence alerts** — System doesn't alert if driver is off-route or late to stop

**Recommendations:**
1. Add `TriggerEvent.ON_STOP_ARRIVE` + `TriggerEvent.ON_STOP_COMPLETE` to workflow engine
2. Create `StopDocumentBypass` audit table (userId, stopId, reason, timestamp)
3. Add `CarrierStop.expectedArrival` field, compute via OSRM + historical dwell times
4. Add geofencing service (check driver GPS vs stop lat/lng, alert if >5mi away when stop is next)

### 6.4 Route Template Improvements

**Current Strengths:**
- RRULE parser supports DAILY/WEEKLY/MONTHLY frequencies
- Auto-generation on dispatch completion works
- Stop inheritance from template is clean

**Gaps:**
1. **No template versioning** — Editing a template affects future dispatches, but no way to compare versions
2. **No holiday handling** — RRULE parser doesn't skip holidays (e.g., US federal holidays)
3. **No multi-week patterns** — `FREQ=WEEKLY;INTERVAL=2` works, but no way to model "Week A vs Week B" patterns
4. **No conditional stops** — Can't model "If going to Dallas, add fuel stop in Oklahoma City"

**Recommendations:**
1. Add `RouteTemplate.version` + `RouteTemplateVersion` history table
2. Add `RouteTemplate.holidaySkipEnabled` + integration with holiday calendar API
3. Add `RouteTemplate.weekPattern` JSON field (Week A: [stops], Week B: [stops])
4. Add `RouteTemplateStop.conditional` field (future work — requires rules engine)

---

## 7. Appendix: File References

**Schema:**
- `apps/web/prisma/schema.prisma` — Full database schema (PascalCase + snake_case models)

**Service Layer (Carrier Operations):**
- `apps/web/src/lib/carrier/dispatches.ts` — Dispatch CRUD, state machine, auto-recurring
- `apps/web/src/lib/carrier/loads.ts` — Load CRUD, stop persistence, revenue calculation trigger
- `apps/web/src/lib/carrier/route-templates.ts` — Template CRUD, RRULE parsing
- `apps/web/src/lib/carrier/stop-completion.ts` — Stop lifecycle (arrive/complete/skip), cascades
- `apps/web/src/lib/carrier/revenue-calculator.ts` — Revenue calculation (rate types, fuel surcharge)
- `apps/web/src/lib/carrier/pay-calculator.ts` — Driver pay record generation

**Pages (Carrier Operations):**
- `apps/web/src/app/(owner)/carrier/loads/page.tsx` — Load list
- `apps/web/src/app/(owner)/carrier/loads/[id]/page.tsx` — Load detail
- `apps/web/src/app/(owner)/carrier/loads/new/page.tsx` — Load create
- `apps/web/src/app/(owner)/carrier/dispatches/page.tsx` — Dispatch list
- `apps/web/src/app/(owner)/carrier/dispatches/[id]/page.tsx` — Dispatch detail
- `apps/web/src/app/(owner)/carrier/dispatches/[id]/stops/page.tsx` — Stop management
- `apps/web/src/app/(owner)/carrier/stops/[id]/page.tsx` — Stop detail

**Pages (Original Models):**
- `apps/web/src/app/(owner)/loads/page.tsx` — Original load list (uses `prisma.load`)
- `apps/web/src/app/(owner)/loads/[id]/page.tsx` — Original load detail
- `apps/web/src/app/(owner)/loads/[id]/edit/page.tsx` — Original load edit
- `apps/web/src/app/(driver)/my-load/page.tsx` — Driver load view (original model)
- `apps/web/src/app/(driver)/my-route/page.tsx` — Driver route view (original model)

**Mobile:**
- `apps/mobile/app/(driver)/loads/` — Driver loads screens (original Load model)
- `apps/mobile/app/(driver)/my-route.tsx` — Driver route detail (original Route model)
- `apps/mobile/app/(driver)/map.tsx` — Driver map view with OSRM navigation

**API Endpoints:**
- `apps/web/src/app/api/mobile/driver/loads/*` — Mobile driver API (original Load model)
- `apps/web/src/app/api/v1/carrier/*` — Carrier Operations REST API

---

## 8. Investigation Completion Checklist

- [x] Two parallel data universes documented (PascalCase vs snake_case)
- [x] Current dispatch/trip model relationships traced
- [x] Route template recurrence mechanism documented
- [x] Existing UI components catalogued with reusability assessment
- [x] Driver stop-completion flow documented
- [x] Document upload flow documented
- [x] Workflow engine integration state documented
- [x] Migration path recommendations provided
- [x] File references appendix included

**Document Complete:** 2026-05-24
**Lines:** 1200+
**Status:** Ready for review
