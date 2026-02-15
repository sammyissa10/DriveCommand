# Architecture Research: Fleet Intelligence Features Integration

**Domain:** Fleet management dashboard with GPS tracking, safety events, and fuel monitoring
**Researched:** 2026-02-15
**Confidence:** HIGH

## Executive Summary

GPS tracking maps, safety analytics, and fuel efficiency dashboards integrate into the existing Next.js App Router + PostgreSQL + Prisma architecture through:

1. **New Prisma models** (GPSLocation, SafetyEvent, FuelRecord) with RLS tenant isolation
2. **Existing repository pattern** extended with new repository classes
3. **New server actions** following existing action pattern in `(owner)/actions/`
4. **Modified shared layout** to add Samsara-style sidebar navigation
5. **New route pages** within existing `(owner)` route group (no new groups needed)
6. **Client-only map component** (Leaflet via dynamic import, ssr: false)
7. **Client chart components** (Recharts with "use client") wrapped by server pages

**Key integration insight:** All v2.0 features follow the established v1.0 patterns (Server Component pages → Server Actions → Repositories → Prisma + RLS). The only architectural additions are client-only rendering for maps (DOM dependency) and charts (interactivity).

## Integration Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     App Router Route Groups (Shared Layout)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  (owner)/                                                                    │
│    ├── layout.tsx          [MODIFIED: Enhanced with Sidebar Navigation]     │
│    ├── dashboard/          [EXISTING: Fleet overview stats]                 │
│    ├── live-map/           [NEW: Live GPS tracking map]                     │
│    ├── safety/             [NEW: Safety events dashboard]                   │
│    ├── fuel/               [NEW: Fuel/energy dashboard]                     │
│    ├── trucks/             [EXISTING: Truck CRUD]                           │
│    ├── drivers/            [EXISTING: Driver management]                    │
│    └── routes/             [EXISTING: Route management]                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                     Server Components (Data Fetching)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │Dashboard │  │Live Map  │  │  Safety  │  │   Fuel   │                   │
│  │Page (SC) │  │Page (SC) │  │Page (SC) │  │Page (SC) │                   │
│  │EXISTING  │  │  NEW     │  │  NEW     │  │  NEW     │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       │             │              │             │                          │
│       ↓             ↓              ↓             ↓                          │
│  Server Actions  Server Actions  Server Actions  Server Actions            │
│  (EXISTING)      (NEW: gps.ts)   (NEW: safety)  (NEW: fuel.ts)             │
├─────────────────────────────────────────────────────────────────────────────┤
│                     Client Components (Interactivity)                        │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
│  │ Map Component  │  │ Chart Component│  │ Chart Component│               │
│  │ (dynamic, CSR) │  │  (use client)  │  │  (use client)  │               │
│  │   Leaflet      │  │    Recharts    │  │    Recharts    │               │
│  │     NEW        │  │      NEW       │  │      NEW       │               │
│  └────────────────┘  └────────────────┘  └────────────────┘               │
├─────────────────────────────────────────────────────────────────────────────┤
│                     Data Access Layer (Repository Pattern)                  │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │  TenantRepository → Prisma Client + withTenantRLS Extension      │      │
│  │    ├── GPS Repository (NEW)                                      │      │
│  │    ├── SafetyEvent Repository (NEW)                              │      │
│  │    ├── FuelRecord Repository (NEW)                               │      │
│  │    ├── Truck Repository (EXISTING)                               │      │
│  │    ├── Driver Repository (EXISTING)                              │      │
│  │    └── Route Repository (EXISTING)                               │      │
│  └──────────────────────────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────────────────────────────┤
│                     PostgreSQL Database (RLS-Enabled)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │  Truck   │  │  Route   │  │ GPS      │  │  Safety  │                   │
│  │(EXISTING)│  │(EXISTING)│  │Location  │  │  Event   │                   │
│  │          │  │          │  │  (NEW)   │  │  (NEW)   │                   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘                   │
│                               ┌──────────┐                                 │
│                               │   Fuel   │                                 │
│                               │  Record  │                                 │
│                               │  (NEW)   │                                 │
│                               └──────────┘                                 │
│  All tables: RLS policies + tenantId isolation (PATTERN CONTINUES)         │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Inventory: New vs Modified vs Existing

### MODIFIED Components (Enhance Existing)

| Component | Path | What Changes | Why |
|-----------|------|--------------|-----|
| **Owner Layout** | `src/app/(owner)/layout.tsx` | Add Sidebar component to shared layout | Persistent navigation across all owner portal pages |
| **Tenant Model** | `prisma/schema.prisma` | Add relations: `gpsLocations[]`, `safetyEvents[]`, `fuelRecords[]` | Link new data to tenant for RLS |
| **Truck Model** | `prisma/schema.prisma` | Add relations: `gpsLocations[]`, `safetyEvents[]`, `fuelRecords[]` | Track GPS/safety/fuel per truck |
| **User Model** | `prisma/schema.prisma` | Add relation: `safetyEvents[]` | Attribute safety events to drivers |
| **Route Model** | `prisma/schema.prisma` | Add relation: `safetyEvents[]` | Associate events with active routes |

### NEW Components (Build from Scratch)

| Component | Path | Type | Purpose |
|-----------|------|------|---------|
| **Sidebar Navigation** | `src/components/navigation/sidebar.tsx` | Client Component | Persistent navigation with active states |
| **Live Map Page** | `src/app/(owner)/live-map/page.tsx` | Server Component | Fetch GPS data, render map wrapper |
| **Map Component** | `src/components/map/map.tsx` | Client Component | Leaflet map with markers |
| **Map Wrapper** | `src/components/map/map-wrapper.tsx` | Client Component | Dynamic import wrapper (ssr: false) |
| **Safety Dashboard Page** | `src/app/(owner)/safety/page.tsx` | Server Component | Fetch safety analytics, render charts |
| **Safety Score Chart** | `src/components/charts/safety-score-trend.tsx` | Client Component | Recharts line chart |
| **Events By Type Chart** | `src/components/charts/events-by-type.tsx` | Client Component | Recharts bar/pie chart |
| **Top Drivers Table** | `src/components/safety/top-drivers-table.tsx` | Server Component | Static table (no interactivity) |
| **Fuel Dashboard Page** | `src/app/(owner)/fuel/page.tsx` | Server Component | Fetch fuel analytics, render charts |
| **Fuel Trend Chart** | `src/components/charts/fuel-trend.tsx` | Client Component | Recharts line chart for MPG |
| **Cost Per Mile Chart** | `src/components/charts/cost-per-mile.tsx` | Client Component | Recharts bar chart |
| **GPS Server Actions** | `src/app/(owner)/actions/gps.ts` | Server Action | `getLatestTruckLocations()`, `getTruckTrail()` |
| **Safety Server Actions** | `src/app/(owner)/actions/safety.ts` | Server Action | `getSafetyScoreTrend()`, `getEventsByType()`, `getTopDriverIssues()` |
| **Fuel Server Actions** | `src/app/(owner)/actions/fuel.ts` | Server Action | `getFuelEfficiencyTrend()`, `getFuelCostPerMile()`, `getFuelByTruck()` |
| **GPS Repository** | `src/lib/db/repositories/gps.repository.ts` | Repository Class | Data access for GPS locations with RLS |
| **SafetyEvent Repository** | `src/lib/db/repositories/safety-event.repository.ts` | Repository Class | Data access for safety events with RLS |
| **FuelRecord Repository** | `src/lib/db/repositories/fuel-record.repository.ts` | Repository Class | Data access for fuel records with RLS |
| **GPSLocation Model** | `prisma/schema.prisma` | Prisma Model | GPS coordinates, speed, heading, timestamp |
| **SafetyEvent Model** | `prisma/schema.prisma` | Prisma Model | Event type, severity, location, metadata |
| **FuelRecord Model** | `prisma/schema.prisma` | Prisma Model | Quantity, cost, odometer, fuel type |
| **GPS Seed Script** | `prisma/seeds/gps-locations.ts` | Seed Script | Generate mock GPS trails |
| **Safety Seed Script** | `prisma/seeds/safety-events.ts` | Seed Script | Generate mock safety events |
| **Fuel Seed Script** | `prisma/seeds/fuel-records.ts` | Seed Script | Generate mock fuel fill-ups |

### EXISTING Components (No Changes)

| Component | Path | Status |
|-----------|------|--------|
| **Dashboard Page** | `src/app/(owner)/dashboard/page.tsx` | Unchanged (may add navigation link) |
| **Trucks Pages** | `src/app/(owner)/trucks/**` | Unchanged |
| **Drivers Pages** | `src/app/(owner)/drivers/**` | Unchanged |
| **Routes Pages** | `src/app/(owner)/routes/**` | Unchanged |
| **Documents Components** | `src/components/documents/**` | Unchanged |
| **Maintenance Components** | `src/components/maintenance/**` | Unchanged |
| **TenantRepository Base** | `src/lib/db/repositories/base.repository.ts` | Unchanged (new repos extend this) |
| **Prisma Client** | `src/lib/db/prisma.ts` | Unchanged |
| **RLS Extension** | `src/lib/db/extensions/tenant-rls.ts` | Unchanged (new repos use this) |

## Data Flow Changes

### NEW Data Flow 1: Live Map Real-Time Data

**Before:** No GPS tracking capability

**After:**
```
User visits /live-map
    ↓
Server Component (page.tsx) fetches latest GPS locations
    ↓
Server Action (getLatestTruckLocations) queries GPS data
    ↓
GPSRepository.getLatestByTenant() with RLS
    ↓
Prisma executes: SELECT DISTINCT ON (truckId) ... ORDER BY timestamp DESC
    ↓
PostgreSQL RLS filters by current_tenant_id()
    ↓
Returns typed location data to server component
    ↓
Server component passes data as props to MapWrapper (client)
    ↓
MapWrapper dynamically imports Map component (ssr: false)
    ↓
Map component renders Leaflet with markers for each truck
```

**Integration with existing:** GPS locations link to existing Truck table via `truckId` foreign key

### NEW Data Flow 2: Safety Dashboard Aggregations

**Before:** No safety event tracking

**After:**
```
User visits /safety
    ↓
Server Component (page.tsx) fetches safety analytics in parallel
    ↓
Promise.all([
  getSafetyScoreTrend({ days: 30 }),
  getEventsByType({ days: 30 }),
  getTopDriverIssues({ limit: 10 })
])
    ↓
Each server action queries SafetyEventRepository
    ↓
Repository uses Prisma groupBy/aggregate with RLS
    ↓
PostgreSQL executes aggregations filtered by current_tenant_id()
    ↓
Server component receives aggregated data (not raw events)
    ↓
Server component passes data to client chart components
    ↓
Client components render Recharts (LineChart, BarChart, PieChart)
```

**Integration with existing:** SafetyEvent table links to Truck (truckId), User/Driver (driverId), and Route (routeId) via foreign keys

### NEW Data Flow 3: Fuel Efficiency Calculations

**Before:** No fuel consumption tracking

**After:**
```
User visits /fuel
    ↓
Server Component (page.tsx) fetches fuel analytics in parallel
    ↓
Promise.all([
  getFuelEfficiencyTrend({ days: 30 }),
  getFuelCostPerMile({ days: 30 }),
  getFuelByTruck()
])
    ↓
Each server action queries FuelRecordRepository
    ↓
Repository uses raw SQL with window functions (LAG for odometer delta)
    ↓
PostgreSQL calculates MPG = (odometer - prev_odometer) / quantity
    ↓
Server component receives calculated MPG/cost data
    ↓
Server component passes data to client chart components
    ↓
Client components render Recharts fuel trend charts
```

**Integration with existing:** FuelRecord table links to Truck (truckId) for odometer tracking

### MODIFIED Data Flow: Seed Scripts with RLS

**Before:** Seed scripts create trucks, drivers, routes with RLS context

**After (enhanced):** Seed scripts ALSO create GPS locations, safety events, fuel records with SAME RLS pattern

```typescript
// SAME PATTERN as existing seed scripts:
await prisma.$transaction(async (tx) => {
  // Set tenant context (EXISTING PATTERN)
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

  // NEW: Insert GPS locations
  await tx.gPSLocation.createMany({ data: mockGPSLocations });

  // NEW: Insert safety events
  await tx.safetyEvent.createMany({ data: mockSafetyEvents });

  // NEW: Insert fuel records
  await tx.fuelRecord.createMany({ data: mockFuelRecords });
});
```

**Key insight:** No change to RLS transaction pattern, just more `createMany` calls within same transaction

## New Prisma Models (Full Schema)

### GPS Location Tracking

```prisma
model GPSLocation {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @db.Uuid
  truckId    String   @db.Uuid
  latitude   Decimal  @db.Decimal(10, 8)  // -90 to 90 with 8 decimal precision (~1.1mm accuracy)
  longitude  Decimal  @db.Decimal(11, 8)  // -180 to 180 with 8 decimal precision
  speed      Int?     // mph, nullable for stationary vehicles
  heading    Int?     // degrees 0-359, nullable
  altitude   Int?     // meters, nullable
  accuracy   Decimal? @db.Decimal(6, 2)  // meters, GPS accuracy estimate
  timestamp  DateTime @db.Timestamptz    // GPS reading time (NOT createdAt)
  createdAt  DateTime @default(now()) @db.Timestamptz  // DB insert time

  tenant Tenant @relation(fields: [tenantId], references: [id])
  truck  Truck  @relation(fields: [truckId], references: [id])

  @@index([tenantId])
  @@index([truckId])
  @@index([timestamp])
  @@index([tenantId, timestamp])  // For time-range queries per tenant (dashboard)
}
```

**Design rationale:**
- `Decimal` for coordinates (Float has rounding issues, causes drift over time)
- `timestamp` separate from `createdAt` (GPS reading time vs DB insert time)
- Composite index `[tenantId, timestamp]` optimizes "last 24 hours per tenant" queries
- Speed/heading/altitude nullable (not all GPS devices report these)
- `@db.Timestamptz` stores UTC, converts on display (tenant timezone in app layer)

### Safety Events

```prisma
enum SafetyEventType {
  HARSH_BRAKING
  HARSH_ACCELERATION
  HARSH_CORNERING
  SPEEDING
  DISTRACTED_DRIVING
  ROLLING_STOP
  SEATBELT_VIOLATION
  FOLLOWING_TOO_CLOSE
}

enum SafetyEventSeverity {
  LOW
  MEDIUM
  HIGH
  CRITICAL
}

model SafetyEvent {
  id          String               @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String               @db.Uuid
  truckId     String               @db.Uuid
  driverId    String?              @db.Uuid  // Nullable if route not assigned
  routeId     String?              @db.Uuid  // Nullable if no active route
  eventType   SafetyEventType
  severity    SafetyEventSeverity
  gForce      Decimal?             @db.Decimal(4, 2)  // G-force magnitude for braking/acceleration
  speed       Int?                 // mph at time of event
  speedLimit  Int?                 // Posted speed limit (for speeding events)
  latitude    Decimal              @db.Decimal(10, 8)
  longitude   Decimal              @db.Decimal(11, 8)
  timestamp   DateTime             @db.Timestamptz
  metadata    Json?                // JSONB for event-specific data (video URL, telemetry snapshot)
  createdAt   DateTime             @default(now()) @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  truck  Truck  @relation(fields: [truckId], references: [id])
  driver User?  @relation(fields: [driverId], references: [id])
  route  Route? @relation(fields: [routeId], references: [id])

  @@index([tenantId])
  @@index([truckId])
  @@index([driverId])
  @@index([routeId])
  @@index([eventType])
  @@index([severity])
  @@index([timestamp])
  @@index([tenantId, timestamp])  // Dashboard time-range queries
}
```

**Design rationale:**
- Enums for event type and severity (type-safe, indexed efficiently, prevents typos)
- `gForce` as Decimal (precision matters for safety scoring, not Int)
- `driverId` and `routeId` nullable (events can occur outside assigned routes, e.g., unauthorized use)
- `metadata` JSONB for extensibility (dashcam URLs, detailed telemetry, custom fields)
- Indexes on common filters (eventType, severity, timestamp) for dashboard queries

### Fuel/Energy Records

```prisma
enum FuelType {
  DIESEL
  GASOLINE
  ELECTRIC
  HYBRID
  CNG  // Compressed Natural Gas
  LPG  // Liquified Petroleum Gas
}

model FuelRecord {
  id              String    @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId        String    @db.Uuid
  truckId         String    @db.Uuid
  fuelType        FuelType
  quantity        Decimal   @db.Decimal(10, 2)  // Gallons or kWh depending on fuelType
  unitCost        Decimal?  @db.Decimal(10, 4)  // Per gallon/kWh (4 decimals for precision)
  totalCost       Decimal?  @db.Decimal(10, 2)  // Total transaction cost
  odometer        Int       // Odometer reading at fill-up (CRITICAL for MPG calculation)
  location        String?   // Station name or address
  latitude        Decimal?  @db.Decimal(10, 8)
  longitude       Decimal?  @db.Decimal(11, 8)
  timestamp       DateTime  @db.Timestamptz    // Fill-up time
  isEstimated     Boolean   @default(false)  // True for calculated consumption vs actual fill-ups
  notes           String?
  createdAt       DateTime  @default(now()) @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  truck  Truck  @relation(fields: [truckId], references: [id])

  @@index([tenantId])
  @@index([truckId])
  @@index([timestamp])
  @@index([tenantId, timestamp])
  @@index([isEstimated])  // Separate actual vs calculated records in queries
}
```

**Design rationale:**
- Enum for fuel type (supports electric/hybrid fleets, not just diesel)
- `quantity` unit depends on `fuelType` (gallons for diesel/gas, kWh for electric)
- `isEstimated` distinguishes actual fill-ups (user input) from calculated consumption (odometer delta)
- `odometer` CRITICAL for MPG calculations (miles = current_odometer - prev_odometer)
- Nullable costs (some orgs track usage but not cost for budgeting/compliance)
- `unitCost` 4 decimals (gas prices like $3.4599/gallon need precision)

### Model Relation Updates

**Existing models need new relations added:**

```prisma
model Tenant {
  // ... existing fields unchanged

  // NEW relations (add to end of model)
  gpsLocations  GPSLocation[]
  safetyEvents  SafetyEvent[]
  fuelRecords   FuelRecord[]
}

model Truck {
  // ... existing fields unchanged

  // NEW relations (add to end of model)
  gpsLocations  GPSLocation[]
  safetyEvents  SafetyEvent[]
  fuelRecords   FuelRecord[]
}

model User {
  // ... existing fields unchanged

  // NEW relations (add to end of model)
  safetyEvents  SafetyEvent[]  // Driver-attributed safety events
}

model Route {
  // ... existing fields unchanged

  // NEW relations (add to end of model)
  safetyEvents  SafetyEvent[]  // Events during this route
}
```

## Mock Data Generation Strategy

### Principle: RLS-Aware Seeding with Realistic Data

**Key constraint:** All seed scripts MUST respect RLS by setting `current_tenant_id` in transaction

**Design approach:**
1. Generate data per tenant in separate transactions
2. Create realistic GPS trails (simulated movement, not random points)
3. Link safety events to specific locations on GPS trails
4. Generate fuel records based on odometer progression from GPS data

### GPS Trail Generation

```typescript
// prisma/seeds/gps-locations.ts
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

/**
 * Generate realistic GPS trail for a truck
 * Simulates movement from origin to destination with smooth path
 */
function generateGPSTrail(params: {
  truckId: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  startTime: Date;
  durationMinutes: number;
}): Prisma.GPSLocationCreateManyInput[] {
  const { truckId, origin, destination, startTime, durationMinutes } = params;
  const locations: Prisma.GPSLocationCreateManyInput[] = [];

  const intervalMinutes = 1; // Log every 1 minute
  const points = durationMinutes / intervalMinutes;

  for (let i = 0; i <= points; i++) {
    const progress = i / points;

    // Interpolate coordinates (linear path for simplicity)
    const latitude = origin.lat + (destination.lat - origin.lat) * progress;
    const longitude = origin.lng + (destination.lng - origin.lng) * progress;

    // Simulate speed variation (40-65 mph, slower near start/end)
    const speed = Math.round(40 + Math.random() * 25 * (1 - Math.abs(progress - 0.5) * 0.5));

    // Heading (bearing from origin to destination)
    const heading = Math.round(Math.atan2(
      destination.lng - origin.lng,
      destination.lat - origin.lat
    ) * 180 / Math.PI);

    locations.push({
      truckId,
      tenantId: '', // Will be set by RLS transaction context
      latitude: new Prisma.Decimal(latitude),
      longitude: new Prisma.Decimal(longitude),
      speed,
      heading: (heading + 360) % 360, // Normalize to 0-359
      altitude: Math.round(100 + Math.random() * 50), // Vary 100-150m
      accuracy: new Prisma.Decimal((Math.random() * 10 + 5).toFixed(2)), // 5-15m accuracy
      timestamp: new Date(startTime.getTime() + i * intervalMinutes * 60 * 1000),
    });
  }

  return locations;
}

export async function seedGPSLocations(tenantId: string, trucks: { id: string }[]) {
  await prisma.$transaction(async (tx) => {
    // Set RLS context (SAME PATTERN as existing seed scripts)
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

    const allLocations: Prisma.GPSLocationCreateManyInput[] = [];

    // Example routes
    const routes = [
      { origin: { lat: 37.7749, lng: -122.4194 }, destination: { lat: 34.0522, lng: -118.2437 } }, // SF to LA
      { origin: { lat: 34.0522, lng: -118.2437 }, destination: { lat: 36.7783, lng: -119.4179 } }, // LA to Fresno
    ];

    for (const truck of trucks) {
      const route = routes[Math.floor(Math.random() * routes.length)];

      const trail = generateGPSTrail({
        truckId: truck.id,
        origin: route.origin,
        destination: route.destination,
        startTime: new Date(Date.now() - 24 * 60 * 60 * 1000), // 24 hours ago
        durationMinutes: 6 * 60, // 6 hour drive
      });

      allLocations.push(...trail);
    }

    // Batch insert all GPS locations
    await tx.gPSLocation.createMany({
      data: allLocations.map(loc => ({ ...loc, tenantId })),
    });
  });
}
```

### Safety Event Generation (Linked to GPS)

```typescript
// prisma/seeds/safety-events.ts
export async function seedSafetyEvents(
  tenantId: string,
  trucks: { id: string }[],
  gpsLocations: { truckId: string; latitude: Decimal; longitude: Decimal; timestamp: Date }[]
) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

    const events: Prisma.SafetyEventCreateManyInput[] = [];

    for (const truck of trucks) {
      const truckLocations = gpsLocations.filter(loc => loc.truckId === truck.id);

      // Generate 2-5 random safety events per truck
      const eventCount = Math.floor(Math.random() * 3) + 2;

      for (let i = 0; i < eventCount; i++) {
        const randomLocation = truckLocations[Math.floor(Math.random() * truckLocations.length)];

        const eventTypes = ['HARSH_BRAKING', 'HARSH_ACCELERATION', 'SPEEDING', 'HARSH_CORNERING'];
        const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];

        const severities = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
        const severity = severities[Math.floor(Math.random() * severities.length)];

        events.push({
          tenantId,
          truckId: truck.id,
          driverId: null, // Would need driver assignment logic
          routeId: null,
          eventType: eventType as any,
          severity: severity as any,
          gForce: eventType.includes('BRAKING') || eventType.includes('ACCELERATION')
            ? new Prisma.Decimal((Math.random() * 2 + 0.5).toFixed(2)) // 0.5-2.5 G
            : null,
          speed: Math.round(Math.random() * 80 + 20), // 20-100 mph
          speedLimit: eventType === 'SPEEDING' ? Math.round(Math.random() * 20 + 55) : null, // 55-75 mph
          latitude: randomLocation.latitude,
          longitude: randomLocation.longitude,
          timestamp: randomLocation.timestamp,
          metadata: {},
        });
      }
    }

    await tx.safetyEvent.createMany({ data: events });
  });
}
```

### Fuel Record Generation (Based on Odometer)

```typescript
// prisma/seeds/fuel-records.ts
export async function seedFuelRecords(tenantId: string, trucks: { id: string; odometer: number }[]) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

    const records: Prisma.FuelRecordCreateManyInput[] = [];

    for (const truck of trucks) {
      // Generate 3-5 fill-ups per truck over last 30 days
      const fillUpCount = Math.floor(Math.random() * 3) + 3;

      let currentOdometer = truck.odometer;

      for (let i = 0; i < fillUpCount; i++) {
        // Simulate 200-500 miles between fill-ups
        const milesDriven = Math.floor(Math.random() * 300) + 200;
        currentOdometer += milesDriven;

        // Diesel fill-up: 50-150 gallons
        const gallons = Math.floor(Math.random() * 100) + 50;

        // Price per gallon: $3.20-$4.50
        const pricePerGallon = Math.random() * 1.3 + 3.2;

        records.push({
          tenantId,
          truckId: truck.id,
          fuelType: 'DIESEL',
          quantity: new Prisma.Decimal(gallons.toFixed(2)),
          unitCost: new Prisma.Decimal(pricePerGallon.toFixed(4)),
          totalCost: new Prisma.Decimal((gallons * pricePerGallon).toFixed(2)),
          odometer: currentOdometer,
          location: `Station ${i + 1}`,
          timestamp: new Date(Date.now() - (fillUpCount - i) * 7 * 24 * 60 * 60 * 1000), // Weekly
          isEstimated: false,
          notes: null,
        });
      }
    }

    await tx.fuelRecord.createMany({ data: records });
  });
}
```

### Main Seed Orchestration

```typescript
// prisma/seed.ts
async function main() {
  // 1. Create tenant (EXISTING PATTERN)
  const tenant = await prisma.tenant.create({
    data: {
      name: 'Demo Fleet Inc',
      slug: 'demo',
      timezone: 'America/Los_Angeles',
    },
  });

  // 2. Create trucks (EXISTING PATTERN)
  await prisma.truck.createMany({
    data: [
      { tenantId: tenant.id, make: 'Freightliner', model: 'Cascadia', year: 2022, vin: 'VIN001', licensePlate: 'CA-ABC123', odometer: 50000 },
      { tenantId: tenant.id, make: 'Volvo', model: 'VNL 760', year: 2021, vin: 'VIN002', licensePlate: 'CA-XYZ789', odometer: 75000 },
      { tenantId: tenant.id, make: 'Kenworth', model: 'T680', year: 2023, vin: 'VIN003', licensePlate: 'CA-DEF456', odometer: 25000 },
    ],
  });

  const trucks = await prisma.truck.findMany({ where: { tenantId: tenant.id } });

  // 3. NEW: Seed GPS locations
  await seedGPSLocations(tenant.id, trucks);

  // 4. NEW: Seed safety events (requires GPS data to exist)
  const gpsLocations = await prisma.gPSLocation.findMany({ where: { tenantId: tenant.id } });
  await seedSafetyEvents(tenant.id, trucks, gpsLocations);

  // 5. NEW: Seed fuel records
  await seedFuelRecords(tenant.id, trucks);

  console.log('✓ Seeded GPS locations, safety events, and fuel records');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

**Key patterns:**
- Each seed function wraps in RLS transaction (sets `current_tenant_id`)
- Generate realistic, correlated data (safety events at GPS locations, fuel records based on odometer)
- Batch insert with `createMany` for performance
- Seed data designed to showcase dashboard features (varied events, trend data)

## Build Order: Dependency-Aware Implementation Sequence

### Phase 1: Database Schema & Infrastructure
**Duration estimate:** 1-2 days
**Why first:** All features depend on data models

**Tasks:**
1. Create Prisma models (GPSLocation, SafetyEvent, FuelRecord enums)
2. Add relations to existing models (Tenant, Truck, User, Route)
3. Generate Prisma migration
4. Apply RLS policies to new tables (copy pattern from existing tables)
5. Run migration on development database
6. Create repository classes (GPSRepository, SafetyEventRepository, FuelRecordRepository)
7. Verify repositories work with RLS (basic CRUD tests)

**Dependencies:** None
**Blocks:** Everything else
**Validation:**
- ✓ Migration applies without errors
- ✓ RLS policies created (verify with `\d+ "GPSLocation"` in psql)
- ✓ Repositories can insert/query with tenant context
- ✓ Cross-tenant queries return zero results

**Files created:**
- `prisma/migrations/YYYYMMDD_add_fleet_intelligence_models/migration.sql`
- `src/lib/db/repositories/gps.repository.ts`
- `src/lib/db/repositories/safety-event.repository.ts`
- `src/lib/db/repositories/fuel-record.repository.ts`

---

### Phase 2: Mock Data Generation
**Duration estimate:** 1 day
**Why second:** Need data to visualize in dashboards

**Tasks:**
1. Create GPS trail generation function (interpolated paths)
2. Create safety event generation function (linked to GPS locations)
3. Create fuel record generation function (based on odometer)
4. Add seed functions to main seed script
5. Run seeds for demo tenant
6. Verify data via Prisma Studio

**Dependencies:** Phase 1 (data models, repositories)
**Blocks:** Dashboard pages (need data to display)
**Validation:**
- ✓ GPS trails show realistic movement (not random scatter)
- ✓ Safety events occur at specific GPS locations
- ✓ Fuel records have progressive odometer readings
- ✓ MPG calculations possible (odometer deltas)

**Files created:**
- `prisma/seeds/gps-locations.ts`
- `prisma/seeds/safety-events.ts`
- `prisma/seeds/fuel-records.ts`
- Updated `prisma/seed.ts`

---

### Phase 3: Navigation Infrastructure
**Duration estimate:** 0.5 day
**Why third:** Can be done in parallel with Phase 2, no data dependency

**Tasks:**
1. Create Sidebar component (client component with usePathname)
2. Add navigation items (Dashboard, Live Map, Safety, Fuel, Trucks, Drivers, Routes)
3. Add icons (from Lucide React or similar)
4. Modify `(owner)/layout.tsx` to include Sidebar
5. Style active states, hover effects
6. Test responsive behavior (mobile collapse)

**Dependencies:** None (can parallel Phase 2)
**Blocks:** Navigation to new pages
**Validation:**
- ✓ Sidebar renders on all owner portal pages
- ✓ Active state highlights current page
- ✓ Navigation links work (even to pages that don't exist yet)
- ✓ Mobile view collapses/expands properly

**Files created/modified:**
- `src/components/navigation/sidebar.tsx` (NEW)
- `src/app/(owner)/layout.tsx` (MODIFIED)

---

### Phase 4: Live GPS Map
**Duration estimate:** 1-2 days
**Why fourth:** Independent of other dashboards, showcases GPS data

**Tasks:**
1. Install Leaflet dependencies (`npm install leaflet react-leaflet @types/leaflet`)
2. Create server action `getLatestTruckLocations()` in `actions/gps.ts`
3. Implement query: `SELECT DISTINCT ON (truckId) ... ORDER BY timestamp DESC`
4. Create Map component (Leaflet with markers)
5. Create MapWrapper component (dynamic import with ssr: false)
6. Create `/live-map/page.tsx` server component
7. Test with seed data, verify markers render
8. Add truck detail popup (show truck name, speed, last update)

**Dependencies:** Phase 1 (GPS model), Phase 2 (seed data), Phase 3 (sidebar link)
**Blocks:** Nothing
**Validation:**
- ✓ Map loads without "window is not defined" error
- ✓ Markers show latest location for each truck
- ✓ Clicking marker shows truck details in popup
- ✓ Map centers on fleet bounding box

**Files created:**
- `src/app/(owner)/live-map/page.tsx` (NEW)
- `src/app/(owner)/actions/gps.ts` (NEW)
- `src/components/map/map.tsx` (NEW)
- `src/components/map/map-wrapper.tsx` (NEW)

---

### Phase 5: Safety Dashboard
**Duration estimate:** 2 days
**Why fifth:** Independent of fuel, establishes chart component patterns

**Tasks:**
1. Install Recharts (`npm install recharts`)
2. Create server actions in `actions/safety.ts`:
   - `getSafetyScoreTrend({ days: 30 })`
   - `getEventsByType({ days: 30 })`
   - `getTopDriverIssues({ limit: 10 })`
3. Implement aggregation queries (groupBy or raw SQL)
4. Create chart components:
   - `SafetyScoreTrendChart` (LineChart)
   - `EventsByTypeChart` (BarChart or PieChart)
5. Create `TopDriversTable` component (server component, static table)
6. Create `/safety/page.tsx` with parallel data fetching
7. Test with seed data, verify charts render

**Dependencies:** Phase 1 (SafetyEvent model), Phase 2 (seed data), Phase 3 (sidebar link)
**Blocks:** Nothing
**Validation:**
- ✓ Charts render without errors
- ✓ Safety score trend shows 30-day data
- ✓ Events grouped by type accurately
- ✓ Top drivers table shows correct ranking
- ✓ Tooltips work on chart hover

**Files created:**
- `src/app/(owner)/safety/page.tsx` (NEW)
- `src/app/(owner)/actions/safety.ts` (NEW)
- `src/components/charts/safety-score-trend.tsx` (NEW)
- `src/components/charts/events-by-type.tsx` (NEW)
- `src/components/safety/top-drivers-table.tsx` (NEW)

---

### Phase 6: Fuel Dashboard
**Duration estimate:** 1.5 days
**Why sixth:** Similar pattern to safety, can reuse chart components

**Tasks:**
1. Create server actions in `actions/fuel.ts`:
   - `getFuelEfficiencyTrend({ days: 30 })` (MPG over time)
   - `getFuelCostPerMile({ days: 30 })` (cost breakdown per truck)
   - `getFuelByTruck()` (total consumption per truck)
2. Implement queries with window functions (LAG for odometer delta)
3. Create chart components:
   - `FuelTrendChart` (LineChart for MPG)
   - `CostPerMileChart` (BarChart)
4. Create fuel summary cards (total cost, average MPG, gallons consumed)
5. Create `/fuel/page.tsx` with parallel data fetching
6. Test MPG calculations against seed data

**Dependencies:** Phase 1 (FuelRecord model), Phase 2 (seed data), Phase 3 (sidebar link), Phase 5 (Recharts installed)
**Blocks:** Nothing
**Validation:**
- ✓ Fuel trend shows realistic MPG (5-8 for trucks)
- ✓ Cost per mile calculates correctly (odometer delta / total cost)
- ✓ Per-truck breakdown matches individual fill-ups
- ✓ Summary cards aggregate correctly

**Files created:**
- `src/app/(owner)/fuel/page.tsx` (NEW)
- `src/app/(owner)/actions/fuel.ts` (NEW)
- `src/components/charts/fuel-trend.tsx` (NEW)
- `src/components/charts/cost-per-mile.tsx` (NEW)
- `src/components/fuel/summary-cards.tsx` (NEW)

---

### Phase 7: Polish & Refinement
**Duration estimate:** 1 day
**Why last:** Optimization after features work

**Tasks:**
1. Add loading states (Suspense boundaries for each dashboard section)
2. Add error boundaries for charts (handle no data gracefully)
3. Optimize database indexes (review query plans with EXPLAIN ANALYZE)
4. Add date range filters to dashboards (7/30/90 day tabs)
5. Add export functionality (CSV download for safety/fuel reports)
6. Mobile responsive testing (sidebar collapse, chart responsive containers)
7. Performance testing (measure TTFB, LCP for dashboard pages)

**Dependencies:** Phases 4, 5, 6 (all features built)
**Blocks:** Nothing (final polish)
**Validation:**
- ✓ Loading states show during data fetch
- ✓ Error messages display when no data available
- ✓ Date filters change data correctly
- ✓ CSV exports contain correct data
- ✓ Mobile view usable (charts scroll, sidebar collapses)

**Files created/modified:**
- Various components with Suspense wrappers
- Error boundary components
- Export utility functions

---

## Integration Points Summary

| Integration Area | How It Works | Impact |
|------------------|--------------|--------|
| **Route Structure** | New pages in existing `(owner)` route group | No new route groups needed, URLs like `/live-map`, `/safety`, `/fuel` |
| **Layout Changes** | Add Sidebar to `(owner)/layout.tsx` | Sidebar persists across all owner pages (new + existing) |
| **Data Models** | New Prisma models with foreign keys to existing models | GPS→Truck, SafetyEvent→Truck/Driver/Route, FuelRecord→Truck |
| **Data Access** | New repositories extend `TenantRepository` base class | Same RLS pattern, no changes to existing repositories |
| **Server Actions** | New action files follow existing pattern | `actions/gps.ts`, `actions/safety.ts`, `actions/fuel.ts` coexist with `actions/trucks.ts`, etc. |
| **Component Pattern** | Server pages fetch data, client components render interactive UI | Matches existing pattern (e.g., TruckListPage → TruckList client wrapper) |
| **Seed Scripts** | New seed functions use same RLS transaction pattern | Set `current_tenant_id`, call `createMany`, same as existing truck/driver seeds |
| **Dependencies** | Leaflet (ssr: false), Recharts ("use client") | New dependencies, but isolated to map/chart components |
| **RLS Policies** | Apply same policy template to new tables | `tenant_isolation_policy` on GPSLocation, SafetyEvent, FuelRecord |

## Architectural Patterns (Established in v1.0, Continued in v2.0)

### Pattern 1: Server Component Page → Server Actions → Repository → Prisma + RLS

**What:** All data fetching flows through this layered architecture
**When:** Every page that displays tenant data (dashboards, CRUD pages)
**Trade-offs:** More boilerplate, but clear separation of concerns and testability

**Example (NEW for v2.0, follows EXISTING pattern):**
```typescript
// src/app/(owner)/safety/page.tsx (Server Component)
import { requireRole } from '@/lib/auth/server';  // EXISTING auth helper
import { UserRole } from '@/lib/auth/roles';       // EXISTING role enum
import { getSafetyScoreTrend } from '@/app/(owner)/actions/safety';  // NEW action

export default async function SafetyDashboardPage() {
  // EXISTING pattern: Auth check first
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // NEW: Fetch safety data (follows EXISTING pattern)
  const scoreTrend = await getSafetyScoreTrend({ days: 30 });

  // NEW: Pass to client chart component (follows EXISTING pattern of server → client)
  return <SafetyScoreTrendChart data={scoreTrend} />;
}

// src/app/(owner)/actions/safety.ts (Server Action)
'use server';

import { requireRole } from '@/lib/auth/server';           // EXISTING
import { UserRole } from '@/lib/auth/roles';               // EXISTING
import { getTenantPrisma } from '@/lib/context/tenant-context';  // EXISTING

export async function getSafetyScoreTrend({ days }: { days: number }) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);  // EXISTING pattern

  const db = await getTenantPrisma();  // EXISTING tenant-scoped Prisma client

  // NEW: Query safety events (uses EXISTING RLS mechanism)
  const scores = await db.safetyEvent.groupBy({
    by: ['timestamp'],
    _count: { id: true },
    where: {
      timestamp: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
    },
  });

  return scores;
}
```

**Key insight:** v2.0 features don't introduce new architectural patterns, just apply existing patterns to new data models.

### Pattern 2: Client-Only Components with Dynamic Import (Leaflet)

**What:** Components that require browser APIs use dynamic import with `ssr: false`
**When:** Maps (Leaflet), date pickers, browser-only libraries
**Trade-offs:** No SSR (loses initial render), but necessary for browser-dependent libraries

**Example:**
```typescript
// src/components/map/map-wrapper.tsx (Client Component)
"use client";

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamic import prevents server-side rendering
const Map = dynamic(() => import('./map'), {
  ssr: false,  // CRITICAL: Prevents "window is not defined" error
  loading: () => <Skeleton className="h-[600px] w-full" />,
});

export function MapWrapper({ locations }) {
  return <Map locations={locations} />;
}

// src/components/map/map.tsx (Client Component, actual Leaflet code)
"use client";

import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

export default function Map({ locations }) {
  return (
    <MapContainer center={[37.7749, -122.4194]} zoom={10}>
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      {locations.map(loc => (
        <Marker key={loc.truckId} position={[loc.latitude, loc.longitude]}>
          <Popup>{loc.truckName}</Popup>
        </Marker>
      ))}
    </MapContainer>
  );
}
```

**Why this approach:**
- Leaflet accesses `window` during initialization
- Next.js throws error if imported in server component
- `dynamic(..., { ssr: false })` ensures client-only rendering
- Loading state shows placeholder during JavaScript load

### Pattern 3: Aggregation Queries with Raw SQL (Complex Analytics)

**What:** Use Prisma's `$queryRaw` for complex aggregations (window functions, CTEs)
**When:** Analytics requiring GROUP BY, LAG/LEAD, or multi-step calculations
**Trade-offs:** Lose type safety, but gain SQL expressiveness

**Example:**
```typescript
export async function getFuelEfficiencyTrend({ days }: { days: number }) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  // Use raw SQL for window functions (LAG)
  const mpgTrend = await db.$queryRaw`
    WITH fuel_with_delta AS (
      SELECT
        DATE(f.timestamp) AS date,
        f."truckId",
        f.odometer,
        f.quantity,
        LAG(f.odometer) OVER (PARTITION BY f."truckId" ORDER BY f.timestamp) AS prev_odometer
      FROM "FuelRecord" f
      WHERE f."tenantId" = current_tenant_id()
        AND f.timestamp >= NOW() - INTERVAL '${days} days'
        AND f."isEstimated" = false
    )
    SELECT
      date,
      ROUND(AVG((odometer - prev_odometer)::numeric / quantity), 2) AS mpg
    FROM fuel_with_delta
    WHERE prev_odometer IS NOT NULL
    GROUP BY date
    ORDER BY date ASC
  `;

  return mpgTrend;
}
```

**Why this approach:**
- Prisma's `groupBy` doesn't support window functions (LAG, LEAD)
- CTEs make multi-step logic readable
- `current_tenant_id()` ensures RLS enforcement in raw SQL
- Performance: DB calculates MPG instead of fetching all records to app

### Pattern 4: Parallel Data Fetching with Promise.all

**What:** Fetch independent datasets in parallel, not sequentially
**When:** Dashboard pages with multiple widgets (score trend + event breakdown + top drivers)
**Trade-offs:** Slightly more complex code, but 3x faster page loads

**Example:**
```typescript
export default async function SafetyDashboardPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // BAD: Sequential (150ms total if each takes 50ms)
  // const scoreTrend = await getSafetyScoreTrend();
  // const eventsByType = await getEventsByType();
  // const topDrivers = await getTopDriverIssues();

  // GOOD: Parallel (50ms total, max of all queries)
  const [scoreTrend, eventsByType, topDrivers] = await Promise.all([
    getSafetyScoreTrend({ days: 30 }),
    getEventsByType({ days: 30 }),
    getTopDriverIssues({ limit: 10 }),
  ]);

  return (
    <div>
      <SafetyScoreTrendChart data={scoreTrend} />
      <EventsByTypeChart data={eventsByType} />
      <TopDriversTable drivers={topDrivers} />
    </div>
  );
}
```

**Applies to:** All dashboard pages (safety, fuel, existing dashboard)

## Anti-Patterns to Avoid

### Anti-Pattern 1: Fetching GPS Data Without Time Bounds

**What people do:** Query all GPS locations without date filters

```typescript
// BAD: Fetches entire GPS history (millions of rows over time)
const locations = await db.gPSLocation.findMany({
  where: { truckId },
});
```

**Why it's wrong:** GPS data grows unbounded. A truck logging every 30 seconds generates 2,880 records/day. After 1 year: ~1M records per truck. Querying all crashes database and app.

**Do this instead:**

```typescript
// GOOD: Time-bounded query with limit
const locations = await db.gPSLocation.findMany({
  where: {
    truckId,
    timestamp: {
      gte: new Date(Date.now() - 24 * 60 * 60 * 1000),  // Last 24 hours
    },
  },
  orderBy: { timestamp: 'desc' },
  take: 1000,  // Safety limit
});
```

**Additional optimization:** PostgreSQL table partitioning by timestamp

```sql
-- In migration: Partition GPS table by month
CREATE TABLE "GPSLocation" (
  -- ... columns
) PARTITION BY RANGE (timestamp);

CREATE TABLE "GPSLocation_2026_02" PARTITION OF "GPSLocation"
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### Anti-Pattern 2: Client-Side Aggregations

**What people do:** Fetch all safety events to client, calculate scores in React

```typescript
// BAD: 10,000 events × 500 bytes = 5MB JSON sent to browser
const events = await fetch('/api/safety-events');
const scores = events.reduce((acc, event) => {
  // Complex scoring logic in client JavaScript
}, {});
```

**Why it's wrong:**
- Large data transfer (slow on mobile)
- Client-side calculation blocks UI rendering
- Scoring logic duplicated (server validation needs it too)
- Security risk (exposes raw event data)

**Do this instead:**

```typescript
// GOOD: Aggregate on server, return only scores (~100 rows × 50 bytes = 5KB)
export async function getSafetyScores() {
  const db = await getTenantPrisma();

  const scores = await db.$queryRaw`
    SELECT
      "driverId",
      100 - SUM(severity_weight) AS score
    FROM safety_events_with_weights
    GROUP BY "driverId"
  `;

  return scores;
}
```

### Anti-Pattern 3: Sequential Queries Instead of Parallel

**What people do:** Sequential awaits for independent data

```typescript
// BAD: 3 sequential queries = 3 × 50ms = 150ms
const scoreTrend = await getSafetyScoreTrend();
const eventsByType = await getEventsByType();
const topDrivers = await getTopDriverIssues();
```

**Why it's wrong:** Each query waits for previous to complete, even though they're independent

**Do this instead:**

```typescript
// GOOD: Parallel fetch = max(50ms, 50ms, 50ms) = 50ms
const [scoreTrend, eventsByType, topDrivers] = await Promise.all([
  getSafetyScoreTrend(),
  getEventsByType(),
  getTopDriverIssues(),
]);
```

**When NOT to parallelize:** Dependent queries (second needs result of first)

### Anti-Pattern 4: Polling Server Actions for Real-Time Updates

**What people do:** Poll server actions every 5 seconds for live GPS

```typescript
// BAD: Server actions not designed for high-frequency polling
useEffect(() => {
  const interval = setInterval(async () => {
    const locations = await getLatestTruckLocations();
    setLocations(locations);
  }, 5000);
}, []);
```

**Why it's wrong:**
- Server actions have overhead (authentication, RLS setup per call)
- No WebSocket support (inefficient HTTP polling)
- Stale data (5-second gaps)

**Do this instead for v2.0 (acceptable polling):**

```typescript
// ACCEPTABLE: Route handler with caching, longer poll interval
useEffect(() => {
  const interval = setInterval(async () => {
    const res = await fetch('/api/gps/latest');  // Cached for 10s
    const locations = await res.json();
    setLocations(locations);
  }, 30000);  // 30-second refresh (not true real-time, but acceptable for v2.0)
}, []);
```

**Future enhancement (v2.1+):** WebSocket/SSE for true real-time

### Anti-Pattern 5: Ignoring RLS in Seed Scripts

**What people do:** Create seed data without setting tenant context

```typescript
// BAD: RLS blocks inserts (current_tenant_id() returns NULL)
await prisma.gPSLocation.createMany({
  data: locations,  // Fails: RLS policy checks current_tenant_id() = tenantId
});
```

**Why it's wrong:** RLS policies require `current_tenant_id()` to be set; without it, inserts are blocked by WITH CHECK clause

**Do this instead:**

```typescript
// GOOD: Set tenant context in transaction (SAME PATTERN as existing truck seeds)
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
  await tx.gPSLocation.createMany({ data: locations });
});
```

## Technology Choices (New Dependencies)

### Leaflet for Maps (vs Mapbox, Google Maps)

**Decision:** Use Leaflet with OpenStreetMap tiles

**Rationale:**
- **Cost:** Free for unlimited use (OpenStreetMap tiles), no API key
- **Features:** Sufficient for basic GPS tracking (markers, popups, polylines)
- **React integration:** react-leaflet maintained and documented
- **Limitations:** No satellite imagery (would need Mapbox), less polished than Google Maps

**When to reconsider:** If client wants satellite view, custom styling, or geocoding (would switch to Mapbox)

**Installation:**
```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

### Recharts for Dashboards (vs Chart.js, D3)

**Decision:** Use Recharts for all dashboard charts

**Rationale:**
- **React-first:** Composable components (`<LineChart>`, `<BarChart>`)
- **Declarative:** No imperative canvas API (Chart.js) or complex D3 selections
- **TypeScript:** Built-in types, good autocomplete
- **Responsive:** `<ResponsiveContainer>` handles resizing automatically
- **Bundle size:** ~100KB gzipped (acceptable for dashboard)

**When to reconsider:** If need highly custom visualizations or 3D charts (would use D3 directly)

**Installation:**
```bash
npm install recharts
```

### Server-Sent Events (SSE) for Future Real-Time (vs WebSockets)

**Decision (future v2.1+):** Use SSE for real-time GPS updates, not WebSockets

**Rationale:**
- **Vercel compatibility:** SSE works on Vercel serverless, WebSockets don't
- **Simplicity:** HTTP-based, automatic reconnection
- **Browser support:** Built-in EventSource API
- **Use case fit:** Unidirectional (server → client), which matches GPS tracking

**When to reconsider:** If need bidirectional communication (e.g., driver chat)

**Current v2.0:** Acceptable polling every 30 seconds (not true real-time)

## Sources

**Next.js Architecture & Patterns:**
- [Getting Started: Server and Client Components | Next.js](https://nextjs.org/docs/app/getting-started/server-and-client-components) — Server vs client component patterns, when to use each
- [Data Fetching: Data Fetching Patterns and Best Practices | Next.js](https://nextjs.org/docs/14/app/building-your-application/data-fetching/patterns) — Parallel fetching, caching, revalidation
- [A guide to Next.js layouts and nested layouts - LogRocket Blog](https://blog.logrocket.com/guide-next-js-layouts-nested-layouts/) — Shared layouts, route groups

**Map Integration:**
- [How to use Leaflet with Next.js and Vector Tiles | Leaflet | MapTiler](https://docs.maptiler.com/leaflet/examples/nextjs/) — Dynamic import pattern for Leaflet in Next.js
- [Create an Asset Tracker with Next.js and React Leaflet | Paige Niedringhaus](https://www.paigeniedringhaus.com/blog/create-an-asset-tracker-with-next-js-and-react-leaflet/) — Practical GPS tracking implementation

**Charts & Dashboards:**
- [ECharts vs. Recharts vs. Chart.js - Average Programmer Blog](https://theaverageprogrammer.hashnode.dev/choosing-the-right-charting-library-for-your-nextjs-dashboard) — Chart library comparison for Next.js
- [Next.js Charts with Recharts - A Useful Guide](https://app-generator.dev/docs/technologies/nextjs/integrate-recharts.html) — Recharts integration patterns

**Fleet Management Data Models:**
- [How to Design Database for Fleet Management Systems - GeeksforGeeks](https://www.geeksforgeeks.org/dbms/how-to-design-database-for-fleet-management-systems/) — GPS, fuel, maintenance schema patterns
- [🚚 How to Design a Fleet Management System | by Ahmed Aboulkanatir | Jan, 2026 | Medium](https://medium.com/@ahmadlamber/how-to-design-a-fleet-management-system-7ca790dffccf) — System architecture for fleet tracking

**PostgreSQL Geospatial:**
- [PostGIS: Geo queries | Supabase Docs](https://supabase.com/docs/guides/database/extensions/postgis) — Geospatial data types, distance queries
- [Analyzing GPS trajectories at scale with Postgres, MobilityDB, & Citus - Citus Data](https://www.citusdata.com/blog/2020/11/09/analyzing-gps-trajectories-at-scale-with-postgres-mobilitydb/) — GPS data optimization patterns

**Multi-Tenant RLS with Prisma:**
- [Securing Multi-Tenant Applications Using Row Level Security in PostgreSQL with Prisma ORM | Medium](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35) — RLS patterns extended to new tables
- [Using Row-Level Security in Prisma | Atlas Guides](https://atlasgo.io/guides/orms/prisma/row-level-security) — Migration patterns for RLS policies

---

*Architecture research for: DriveCommand Fleet Intelligence Features*
*Researched: 2026-02-15*
*Confidence: HIGH — All patterns verified against existing v1.0 codebase and official documentation*
