# Trips System — Technical Specification

## Overview

This document describes DriveCommand's trip management system (internally referred to as "dispatches" in the database). A Trip represents a single driver assignment connecting a truck, driver, and a sequence of stops. Trips orchestrate the complete lifecycle from planning through completion, including load attachment, stop sequencing, expense tracking, driver pay generation, and workflow automation.

The Trip model was renamed from `CarrierDispatch` to `Trip` in Phase 403 while maintaining backward compatibility via Prisma's `@@map("dispatches")` directive.

---

## Developer Guide

### How to Use This Document

This document is the single source of truth for understanding and extending the trips system. It is structured in three layers:

1. **Concepts and architecture** (sections 1-7) — read first to understand the domain model
2. **API reference** (sections 8-10) — endpoint specs for integrations
3. **Extension guide** (section 11) — how to add new trip features

### Key Files

| Purpose | Location |
|---------|----------|
| Prisma schema | `apps/web/prisma/schema.prisma` (line ~2192) |
| Trip library | `apps/web/src/lib/carrier/trips.ts` |
| API routes | `apps/web/src/app/api/v1/carrier/dispatches/` |
| Owner UI pages | `apps/web/src/app/(owner)/carrier/trips/` |
| Driver UI pages | `apps/web/src/app/(owner)/carrier/driver/trips/` |
| Mobile API | `apps/web/src/app/api/mobile/` |

---

## Core Concepts

**Trip** (model: `Trip`, table: `dispatches`)
A scheduled assignment of a driver and truck to execute a sequence of stops. A trip may contain zero or more loads. Each trip has a status workflow: `planned` → `in_progress` → `completed` (or `cancelled` / `tonu`).

**Dispatch Number**
Auto-generated identifier in format `DC-YYYY-NNNNN` (e.g., `DC-2026-00042`). Sequential per tenant per year. Stored in the `notes` field as `[DISPATCH_NUMBER=DC-2026-00042]` for backward compatibility.

**CarrierStop** (model: `CarrierStop`, table: `carrier_stops`)
An individual stop within a trip. Stops have types (`pickup`, `delivery`, `relay`, `drop_hook`), status (`pending` → `arrived` → `completed` or `skipped`), and appointment windows. Stops are ordered by `sequenceOrder`.

**Route Template** (model: `RouteTemplate`)
A reusable template for recurring trips. When creating a trip from a template, stops are auto-inherited with their facility details and appointment window offsets. Templates can have recurrence rules for auto-generating the next trip on completion.

**Load-Trip Relationship**
A `CarrierLoad` can be attached to a trip via its `dispatchId` foreign key. When a load is created without a trip, its pickup/delivery stops are stored as JSON in `pendingStopsJson`. When attached to a trip, these are persisted as `CarrierStop` records.

**HOS Cycle**
Each trip specifies the Hours of Service cycle to use (default: `us_70` for US 70-hour/8-day cycle). Used for driver HOS compliance calculations.

**Relay Handoff**
For team-driver scenarios, a trip can specify a `relayHandoffStopId` where driver handoff occurs.

---

## Database Architecture

### Trip Model

```prisma
model Trip {
  id                 String    @id @default(dbgenerated("gen_random_uuid()"))
  orgId              String    @map("org_id")
  routeTemplateId    String?   @map("route_template_id")
  primaryDriverId    String    @map("primary_driver_id")
  coDriverId         String?   @map("co_driver_id")
  truckId            String    @map("truck_id")
  trailerId          String?   @map("trailer_id")
  dispatcherId       String?   @map("dispatcher_id")
  scheduledDeparture DateTime  @map("scheduled_departure")
  actualDeparture    DateTime? @map("actual_departure")
  scheduledArrival   DateTime? @map("scheduled_arrival")
  actualArrival      DateTime? @map("actual_arrival")
  status             String    @default("planned")
  relayHandoffStopId String?   @map("relay_handoff_stop_id")
  plannedMiles       Decimal?  @map("planned_miles")
  actualMiles        Decimal?  @map("actual_miles")
  hosCycle           String    @default("us_70")
  notes              String?
  createdById        String?   @map("created_by_id")
  updatedById        String?   @map("updated_by_id")
  deletedAt          DateTime? @map("deleted_at")
  deletedById        String?   @map("deleted_by_id")
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  // Relations
  tenant           Tenant            @relation(fields: [orgId], references: [id])
  createdBy        User?             @relation("TripCreatedBy", ...)
  updatedBy        User?             @relation("TripUpdatedBy", ...)
  deletedBy        User?             @relation("TripDeletedBy", ...)
  routeTemplate    RouteTemplate?    @relation(...)
  primaryDriver    CarrierDriver     @relation("PrimaryDriver", ...)
  coDriver         CarrierDriver?    @relation("CoDriver", ...)
  truck            CarrierTruck      @relation("PrimaryTruck", ...)
  trailer          CarrierTruck?     @relation("TrailerTruck", ...)
  dispatcher       User?             @relation("TripDispatcher", ...)
  stops            CarrierStop[]
  carrierLoads     CarrierLoad[]
  expenses         CarrierExpense[]
  driverPayRecords DriverPayRecord[]
  messages         FleetMessage[]
  documents        CarrierDocument[]

  @@map("dispatches")
}
```

### CarrierStop Model

```prisma
model CarrierStop {
  id                   String    @id @default(dbgenerated("gen_random_uuid()"))
  dispatchId           String    @map("dispatch_id")
  loadId               String?   @map("load_id")
  facilityId           String    @map("facility_id")
  sequenceOrder        Int       @map("sequence_order")
  stopType             String    @default("pickup")
  status               String    @default("pending")
  contactName          String?
  contactPhone         String?
  appointmentStart     DateTime? @map("appointment_start")
  appointmentEnd       DateTime? @map("appointment_end")
  commodityDescription String?
  pieces               Int?
  weightLbs            Decimal?
  bolRequired          Boolean   @default(true)
  podRequired          Boolean   @default(true)
  specialInstructions  String?
  checklistStatus      String?   @map("checklist_status")
  deferredReason       String?   @map("deferred_reason")
  checklistEntityId    String?   @map("checklist_entity_id")
  arrivedAt            DateTime? @map("arrived_at")
  departedAt           DateTime? @map("departed_at")
  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  trip      Trip             @relation(fields: [dispatchId], references: [id], onDelete: Cascade)
  load      CarrierLoad?     @relation(fields: [loadId], references: [id])
  facility  CarrierFacility  @relation(fields: [facilityId], references: [id])
  documents CarrierDocument[]
  messages  FleetMessage[]

  @@map("carrier_stops")
}
```

### Key Indexes

- `dispatches.org_id` — tenant isolation
- `dispatches.primary_driver_id` — driver assignment lookups
- `dispatches.status` — status filtering
- `carrier_stops.dispatch_id` — stop retrieval per trip
- `carrier_stops.sequence_order` — ordering

### RLS Policies

Both tables use standard DriveCommand tenant isolation:
- `tenant_isolation_policy` — restricts reads/writes to `org_id = current_setting('app.tenant_id')`
- `bypass_rls_policy` — allows system-level access when `app.bypass_rls = 'on'`

---

## Status Workflow

### Trip Status Machine

```
planned
  ├─→ in_progress (via start action)
  │     └─→ completed (all stops completed/skipped)
  │           ├─ Triggers: pay record generation
  │           ├─ Triggers: recurring dispatch auto-create (if template)
  │           └─ Triggers: ON_DISPATCH_DELIVER playbook
  │
  ├─→ cancelled
  │     └─ Cancels all pending loads attached to trip
  │
  └─→ tonu (Truck On Not Used)
        └─ Terminal state; no further transitions
```

### Stop Status Machine

```
pending
  └─→ arrived (driver marks arrival)
        └─→ completed (driver marks departure with BOL/POD)
              OR
        └─→ skipped (with reason)
```

### Transition Rules

| From | To | Conditions |
|------|-----|------------|
| `planned` | `in_progress` | Driver/truck assigned; sets `actualDeparture` |
| `planned` | `cancelled` | Owner action; cascades to pending loads |
| `planned` | `tonu` | Owner action; terminal |
| `in_progress` | `completed` | All stops `completed` or `skipped` |

### Locked Fields

When a trip transitions to `in_progress`:
- `primaryDriverId` — locked (cannot reassign mid-trip)
- `truckId` — locked (cannot change truck mid-trip)
- `routeTemplateId` — locked (template changes only on planned trips)

---

## Library Functions

### `listTrips(orgId, filters)`

Lists trips with pagination and filtering.

```typescript
interface ListTripsFilters {
  status?: string;           // 'planned' | 'in_progress' | 'completed' | 'cancelled' | 'tonu'
  dateFrom?: string;         // ISO date string
  dateTo?: string;           // ISO date string
  driverId?: string;         // Filter by primary driver
  routeTemplateId?: string;  // Filter by template
  needsAssignment?: boolean; // Trips without driver/truck
  page?: number;             // 1-indexed
  pageSize?: number;         // Default 25
}
```

Returns trips with aggregated stop completion counts.

### `getTrip(orgId, id)`

Fetches a single trip with all related data:
- Stops (ordered by `sequenceOrder`)
- Loads
- Expenses
- Pay records
- Driver/truck details

### `createTrip(orgId, data)`

Creates a new trip.

```typescript
interface TripCreateInput {
  primaryDriverId: string;
  truckId: string;
  coDriverId?: string;
  trailerId?: string;
  dispatcherId?: string;
  routeTemplateId?: string;
  scheduledDeparture?: string;
  scheduledArrival?: string;
  plannedMiles?: number;
  hosCycle?: string;
  notes?: string;
  // Phase 45: Dispatch enforcement
  overrideReason?: string;
  overrideForEntityType?: 'DRIVER';
  overrideForEntityId?: string;
  currentUserId?: string;
}
```

**Side effects:**
- Auto-generates dispatch number (`DC-YYYY-NNNNN`)
- If `routeTemplateId` provided: inherits stops with facility details and appointment offsets
- Validates driver `isDispatchReady` status (Phase 45); requires `overrideReason` if not ready
- Sends dispatch assigned notification
- Spawns `ON_DISPATCH_CREATE` playbook

### `updateTrip(orgId, id, data)`

Updates trip details. Enforces locked field rules when `status = 'in_progress'`.

### `transitionTripStatus(orgId, id, newStatus, notes?)`

Transitions trip status with validation.

**Completion side effects:**
- Validates all stops are `completed` or `skipped`
- Generates `DriverPayRecord` via `generateDriverPayRecords()`
- If template with recurrence: auto-creates next occurrence
- Spawns `ON_DISPATCH_DELIVER` playbook
- Records activation event

### `reorderTripStops(orgId, tripId, stopOrder)`

Reorders stops via drag-drop. Only allowed on `planned` trips.

```typescript
stopOrder: string[]  // Array of stop IDs in new order
```

### `addLoadToTrip(orgId, tripId, loadId)`

Attaches a load to a trip.

**Side effects:**
- Sets `load.dispatchId = tripId`
- Persists `load.pendingStopsJson` as `CarrierStop` records
- Clears `pendingStopsJson` after persistence

---

## API Reference

### Owner Portal Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/carrier/dispatches` | List trips with filters |
| POST | `/api/v1/carrier/dispatches` | Create new trip |
| GET | `/api/v1/carrier/dispatches/[id]` | Get trip detail |
| PATCH | `/api/v1/carrier/dispatches/[id]` | Update trip |
| POST | `/api/v1/carrier/dispatches/[id]/start` | Start trip (planned → in_progress) |
| PATCH | `/api/v1/carrier/dispatches/[id]/status` | Transition trip status |
| POST | `/api/v1/carrier/dispatches/[id]/remove-load` | Detach load from trip |
| POST | `/api/v1/carrier/trips/[id]/loads` | Add load to trip |
| POST | `/api/v1/carrier/trips/[id]/reorder` | Reorder stops |
| GET | `/api/v1/carrier/live-map/trips` | Trips for live fleet map |

### Request/Response Schemas

**Create Trip Request:**
```typescript
{
  primaryDriverId: string;      // required
  truckId: string;              // required
  coDriverId?: string;
  trailerId?: string;
  dispatcherId?: string;
  routeTemplateId?: string;
  scheduledDeparture?: string;  // ISO datetime
  scheduledArrival?: string;    // ISO datetime
  plannedMiles?: number;
  hosCycle?: string;            // default: 'us_70'
  notes?: string;
  overrideReason?: string;      // required if driver not ready
  overrideForEntityType?: 'DRIVER';
  overrideForEntityId?: string;
}
```

**Status Transition Request:**
```typescript
{
  status: 'in_progress' | 'completed' | 'cancelled' | 'tonu';
  notes?: string;
}
```

**Error Responses:**

| Code | Scenario |
|------|----------|
| 400 | Invalid status transition |
| 400 | Stops not complete (on completion attempt) |
| 400 | Driver not ready (without override) |
| 403 | Unauthorized (wrong tenant/role) |
| 404 | Trip not found |

---

## UI Components

### Owner Portal Pages

| Path | Component | Purpose |
|------|-----------|---------|
| `/carrier/trips` | `DispatchesGrid` | Trip list with search, filter, pagination |
| `/carrier/trips/new` | `NewTripFormClient` | Create trip form |
| `/carrier/trips/[id]` | Trip detail page | View trip with stops, loads, expenses |
| `/carrier/trips/[id]/plan` | `TripPlanEditor` | Drag-drop stop reorder |

### Key Components

**DispatchesGrid** (`_grid/DispatchesGrid.tsx`)
- TanStack Table with server-side pagination
- Search by dispatch number, driver name
- Filter by status, date range
- Soft-delete support (shows deleted items differently)

**TripPlanEditor** (`trips/TripPlanEditor.tsx`)
- Drag-drop stop reordering via `@dnd-kit`
- Auto-save on reorder
- Only enabled for `planned` trips

**StopCard** (`trips/StopCard.tsx`)
- Visual card for each stop in trip plan
- Shows facility, appointment window, status
- Drag handle for reordering

**DispatchHeader** (`dispatches/DispatchHeader.tsx`)
- Trip metadata display
- Status badge with transition actions
- Driver/truck assignment info

**StopTimeline** (`dispatches/StopTimeline.tsx`)
- Vertical timeline of stops
- BOL/POD upload status per stop
- Arrival/departure timestamps

**DispatchLoadsPanel** (`dispatches/DispatchLoadsPanel.tsx`)
- List of loads attached to trip
- Add load action
- Load detail links

---

## Workflow Integration

### Playbook Triggers

The trips system integrates with the Workflow Engine via playbook triggers:

| Event | Trigger | Fires When |
|-------|---------|------------|
| Dispatch Created | `ON_DISPATCH_CREATE` | New trip created |
| Dispatch Started | `ON_DISPATCH_DEPART` | Trip transitions to `in_progress` |
| Dispatch Delivered | `ON_DISPATCH_DELIVER` | Trip transitions to `completed` |

### Stop Checklists

Stops support workflow checklists via:
- `checklistStatus`: `pending` | `in_progress` | `completed` | `deferred`
- `deferredReason`: Explanation if deferred
- `checklistEntityId`: FK to workflow `PlaybookInstance`

---

## Driver Pay Integration

### Pay Record Generation

When a trip completes, `generateDriverPayRecords()` is called:

1. Calculates pay based on trip miles, load rates, and driver pay rules
2. Creates `DriverPayRecord` entries for each driver (primary + co-driver)
3. Links records to the trip via `tripId`

### Pay Calculation Factors

- Planned vs actual miles
- Load linehaul rates
- Driver pay rate type (per mile, percentage, flat)
- Detention, layover, accessorial charges

---

## Recurring Dispatch Auto-Generation

When a trip with a `routeTemplateId` completes:

1. Check if template has a recurrence rule
2. Calculate next scheduled departure based on rule
3. Create new trip inheriting template stops
4. Link to same template for continued recurrence

Supported recurrence patterns:
- Daily
- Weekly (specific days)
- Bi-weekly
- Monthly (day of month)

---

## Audit Trail

All trips support full audit tracking:

| Field | Purpose |
|-------|---------|
| `createdById` | User who created the trip |
| `createdAt` | Creation timestamp |
| `updatedById` | User who last modified |
| `updatedAt` | Last modification timestamp |
| `deletedAt` | Soft delete timestamp |
| `deletedById` | User who deleted |

Audit info is displayed in the `AuditTrailFooter` component on trip detail pages.

---

## Extension Guide

### Adding a New Trip Field

1. Add field to `Trip` model in `prisma/schema.prisma`
2. Run `npx prisma migrate dev --name add_field_name`
3. Update `TripCreateInput` / `TripUpdateInput` in `lib/carrier/trips.ts`
4. Update API route schemas in `api/v1/carrier/dispatches/`
5. Update UI forms in `carrier/trips/`

### Adding a New Stop Type

1. Add to stop type enum (if using enum) or document new string value
2. Update stop type validation in API routes
3. Update `StopCard` component to handle new type
4. Update `StopTimeline` styling if needed

### Adding a New Trip Status

1. Update status transition validation in `transitionTripStatus()`
2. Add any side effects for the new status
3. Update status badge rendering in UI
4. Update filter options in `DispatchesGrid`

---

## Data Flow Diagram

```
Owner Creates Trip
    │
    ▼
POST /api/v1/carrier/dispatches
    │
    ├─→ createTrip()
    │     ├─ Auto-generate dispatch number
    │     ├─ Validate driver readiness (Phase 45)
    │     ├─ If template: inherit stops + planned miles
    │     ├─ Create Trip record (status: 'planned')
    │     ├─ Send dispatch notification
    │     └─ Spawn ON_DISPATCH_CREATE playbook
    │
    ▼
Owner Attaches Load
    │
    ▼
POST /api/v1/carrier/trips/[id]/loads
    │
    ├─→ addLoadToTrip()
    │     ├─ Set load.dispatchId = tripId
    │     ├─ Persist pendingStopsJson as CarrierStop records
    │     └─ Clear pendingStopsJson
    │
    ▼
Owner Starts Trip
    │
    ▼
POST /api/v1/carrier/dispatches/[id]/start
    │
    ├─→ transitionTripStatus('in_progress')
    │     ├─ Set actualDeparture timestamp
    │     ├─ Lock primaryDriver/truck
    │     ├─ Notify driver
    │     └─ Spawn ON_DISPATCH_DEPART playbook
    │
    ▼
Driver Completes Stops
    │
    ▼
(Stop status updates via stop API)
    │
    ▼
Driver/Owner Completes Trip
    │
    ▼
PATCH /api/v1/carrier/dispatches/[id]/status (completed)
    │
    ├─→ transitionTripStatus('completed')
    │     ├─ Validate all stops completed/skipped
    │     ├─ Generate DriverPayRecord
    │     ├─ Auto-create next recurring dispatch (if template)
    │     ├─ Spawn ON_DISPATCH_DELIVER playbook
    │     └─ Record activation event
```

---

## Related Documentation

- [Workflow Engine Specification](./workflow-engine.md) — Playbook triggers and checklists
- [Driver Pay Technical Spec](./DriverPay_TechnicalSpec_v4.md) — Pay calculation details
- [Database Security Spec](./DatabaseSecurity_MultiTenant_Spec_v1.md) — RLS policies

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2026-06-11 | Initial documentation |
| — | Phase 403 | Model renamed CarrierDispatch → Trip |
| — | Phase 45 | Added dispatch enforcement (driver readiness) |
| — | Phase 37.7 | Driver map + navigation integration |
