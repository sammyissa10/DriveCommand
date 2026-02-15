# Architecture Research: Fleet Intelligence Features Integration

**Domain:** Fleet management dashboard with GPS tracking, safety events, and fuel monitoring
**Researched:** 2026-02-15
**Confidence:** HIGH

## Integration Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     App Router Route Groups (Shared Layout)                 │
├─────────────────────────────────────────────────────────────────────────────┤
│  (owner)/                                                                    │
│    ├── layout.tsx          [Enhanced with Sidebar Navigation]               │
│    ├── dashboard/          [Existing fleet overview stats]                  │
│    ├── live-map/           [NEW: Live GPS tracking map]                     │
│    ├── safety/             [NEW: Safety events dashboard]                   │
│    ├── fuel/               [NEW: Fuel/energy dashboard]                     │
│    ├── trucks/             [Existing]                                       │
│    ├── drivers/            [Existing]                                       │
│    └── routes/             [Existing]                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                     Server Components (Data Fetching)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │Dashboard │  │Live Map  │  │  Safety  │  │   Fuel   │                   │
│  │Page (SC) │  │Page (SC) │  │Page (SC) │  │Page (SC) │                   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘                   │
│       │             │              │             │                          │
│       ↓             ↓              ↓             ↓                          │
│  Server Actions  Server Actions  Server Actions  Server Actions            │
│  (Aggregations)  (GPS Data)      (Events Data)  (Fuel Data)                │
├─────────────────────────────────────────────────────────────────────────────┤
│                     Client Components (Interactivity)                        │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐               │
│  │ Map Component  │  │ Chart Component│  │ Chart Component│               │
│  │ (dynamic, CSR) │  │  (use client)  │  │  (use client)  │               │
│  │   Leaflet      │  │    Recharts    │  │    Recharts    │               │
│  └────────────────┘  └────────────────┘  └────────────────┘               │
├─────────────────────────────────────────────────────────────────────────────┤
│                     Data Access Layer (Repository Pattern)                  │
│  ┌──────────────────────────────────────────────────────────────────┐      │
│  │  TenantRepository → Prisma Client + withTenantRLS Extension      │      │
│  │    ├── GPS Repository (NEW)                                      │      │
│  │    ├── SafetyEvent Repository (NEW)                              │      │
│  │    ├── FuelRecord Repository (NEW)                               │      │
│  │    ├── Truck Repository (Existing)                               │      │
│  │    ├── Driver Repository (Existing)                              │      │
│  │    └── Route Repository (Existing)                               │      │
│  └──────────────────────────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────────────────────────────┤
│                     PostgreSQL Database (RLS-Enabled)                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐                   │
│  │  Truck   │  │  Route   │  │ GPS      │  │  Safety  │                   │
│  │(Existing)│  │(Existing)│  │Location  │  │  Event   │                   │
│  └──────────┘  └──────────┘  │  (NEW)   │  │  (NEW)   │                   │
│                               └──────────┘  └──────────┘                   │
│                               ┌──────────┐                                 │
│                               │   Fuel   │                                 │
│                               │  Record  │                                 │
│                               │  (NEW)   │                                 │
│                               └──────────┘                                 │
│  All tables: RLS policies + tenantId isolation                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | Rendering Strategy |
|-----------|----------------|-------------------|
| **Sidebar Navigation** | Persistent navigation across all owner portal pages | Server Component in layout |
| **Live Map Page** | Server component wrapper that fetches truck locations | Server Component |
| **Map Component** | Interactive Leaflet map (window/document dependent) | Client Component (dynamic import, ssr: false) |
| **Safety Dashboard Page** | Server component that fetches safety event aggregations | Server Component |
| **Fuel Dashboard Page** | Server component that fetches fuel consumption aggregations | Server Component |
| **Chart Components** | Interactive Recharts charts (browser APIs for interactions) | Client Component ("use client") |
| **GPS Repository** | Data access for GPS locations with RLS tenant isolation | Server-side class |
| **SafetyEvent Repository** | Data access for safety events with RLS tenant isolation | Server-side class |
| **FuelRecord Repository** | Data access for fuel records with RLS tenant isolation | Server-side class |

## New Route Structure

### No New Route Groups Required

The existing `(owner)` route group is sufficient. New pages live alongside existing pages within the same group.

```
src/app/(owner)/
├── layout.tsx                    [MODIFIED: Add sidebar navigation]
├── dashboard/page.tsx            [Existing: Fleet overview stats]
├── live-map/                     [NEW]
│   └── page.tsx                  [Server component wrapper]
├── safety/                       [NEW]
│   └── page.tsx                  [Server component + client chart wrappers]
├── fuel/                         [NEW]
│   └── page.tsx                  [Server component + client chart wrappers]
├── trucks/                       [Existing]
├── drivers/                      [Existing]
└── routes/                       [Existing]
```

### Navigation Pattern: Sidebar in Shared Layout

**Current state:** Simple header with logo + UserMenu, no navigation links
**New state:** Persistent sidebar with navigation links to all sections

**Implementation approach:**

```typescript
// src/app/(owner)/layout.tsx (MODIFIED)
export default async function OwnerLayout({ children }) {
  // ... auth checks (unchanged)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="flex">
        {/* NEW: Sidebar navigation */}
        <Sidebar />

        <div className="flex-1">
          <header className="bg-white border-b border-gray-200">
            <div className="flex items-center justify-between px-6 py-4">
              <h1 className="text-xl font-semibold text-gray-900">DriveCommand</h1>
              <UserMenu />
            </div>
          </header>
          <main className="p-6">{children}</main>
        </div>
      </div>
    </div>
  );
}
```

**Sidebar component:**

```typescript
// src/components/navigation/sidebar.tsx (NEW)
"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Sidebar() {
  const pathname = usePathname();

  const navItems = [
    { href: '/dashboard', label: 'Dashboard', icon: DashboardIcon },
    { href: '/live-map', label: 'Live Map', icon: MapIcon },
    { href: '/safety', label: 'Safety', icon: ShieldIcon },
    { href: '/fuel', label: 'Fuel', icon: FuelIcon },
    { href: '/trucks', label: 'Trucks', icon: TruckIcon },
    { href: '/drivers', label: 'Drivers', icon: UserIcon },
    { href: '/routes', label: 'Routes', icon: RouteIcon },
  ];

  return (
    <aside className="w-64 bg-white border-r border-gray-200">
      <nav className="p-4 space-y-2">
        {navItems.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={pathname === item.href ? 'active' : ''}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

**Why this approach:**
- Sidebar is client component for active state tracking (usePathname)
- Layout remains server component for auth checks
- Sidebar preserves state on navigation (doesn't re-render)
- Matches Next.js App Router best practices for nested layouts

## New Prisma Models

### GPS Location Tracking

```prisma
model GPSLocation {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @db.Uuid
  truckId    String   @db.Uuid
  latitude   Decimal  @db.Decimal(10, 8)  // -90 to 90 with 8 decimal precision
  longitude  Decimal  @db.Decimal(11, 8)  // -180 to 180 with 8 decimal precision
  speed      Int?     // mph, nullable for stationary vehicles
  heading    Int?     // degrees 0-359, nullable
  altitude   Int?     // meters, nullable
  accuracy   Decimal? @db.Decimal(6, 2)  // meters, GPS accuracy estimate
  timestamp  DateTime @db.Timestamptz
  createdAt  DateTime @default(now()) @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  truck  Truck  @relation(fields: [truckId], references: [id])

  @@index([tenantId])
  @@index([truckId])
  @@index([timestamp])
  @@index([tenantId, timestamp])  // For time-range queries per tenant
}
```

**Rationale:**
- `Decimal` for coordinates ensures precision (Float has rounding issues)
- `timestamp` separate from `createdAt` (timestamp = GPS reading time, createdAt = DB insert time)
- Composite index on `[tenantId, timestamp]` optimizes dashboard queries
- Speed/heading/altitude nullable (not all GPS devices report these)

### Safety Events

```prisma
enum SafetyEventType {
  HARSH_BRAKING
  HARSH_ACCELERATION
  HARSH_CORNERING
  SPEEDING
  DISTRACTED_DRIVING
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
  metadata    Json?                // JSONB for event-specific data (video URL, telemetry)
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

**Rationale:**
- Enums for event type and severity (type-safe, indexed efficiently)
- `gForce` as Decimal (precision matters for safety scoring)
- `driverId` and `routeId` nullable (events can occur outside assigned routes)
- `metadata` JSONB for extensibility (dashcam URLs, detailed telemetry)
- Indexes on filters used in safety dashboard (eventType, severity, timestamp)

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
  quantity        Decimal   @db.Decimal(10, 2)  // Gallons or kWh
  unitCost        Decimal?  @db.Decimal(10, 4)  // Per gallon/kWh
  totalCost       Decimal?  @db.Decimal(10, 2)  // Total transaction cost
  odometer        Int       // Odometer reading at fill-up
  location        String?   // Station name or address
  latitude        Decimal?  @db.Decimal(10, 8)
  longitude       Decimal?  @db.Decimal(11, 8)
  timestamp       DateTime  @db.Timestamptz
  isEstimated     Boolean   @default(false)  // True for calculated consumption vs actual fill-ups
  notes           String?
  createdAt       DateTime  @default(now()) @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])
  truck  Truck  @relation(fields: [truckId], references: [id])

  @@index([tenantId])
  @@index([truckId])
  @@index([timestamp])
  @@index([tenantId, timestamp])
  @@index([isEstimated])  // Separate actual vs calculated records
}
```

**Rationale:**
- Enum for fuel type (supports electric/hybrid fleets)
- `quantity` unit depends on `fuelType` (gallons for diesel/gas, kWh for electric)
- `isEstimated` distinguishes actual fill-ups from calculated consumption
- `odometer` critical for MPG/efficiency calculations
- Nullable costs (some orgs track usage but not cost)

### Model Relation Updates

**Existing models need new relations:**

```prisma
model Tenant {
  // ... existing fields
  gpsLocations  GPSLocation[]
  safetyEvents  SafetyEvent[]
  fuelRecords   FuelRecord[]
}

model Truck {
  // ... existing fields
  gpsLocations  GPSLocation[]
  safetyEvents  SafetyEvent[]
  fuelRecords   FuelRecord[]
}

model User {
  // ... existing fields
  safetyEvents  SafetyEvent[]  // Driver-attributed safety events
}

model Route {
  // ... existing fields
  safetyEvents  SafetyEvent[]  // Events during this route
}
```

## Data Flow Patterns

### Pattern 1: Live Map Real-Time Data

**What:** Server component fetches latest GPS locations, client component renders interactive map
**When to use:** GPS tracking, any map-based visualization
**Trade-offs:** Client-only map increases JS bundle, but necessary for Leaflet

**Flow:**
```
1. Server Component (page.tsx)
   ↓
2. Server Action (getLatestTruckLocations)
   ↓
3. Repository (GPSRepository.getLatestByTenant)
   ↓
4. Prisma + RLS (SELECT DISTINCT ON (truckId) ... ORDER BY timestamp DESC)
   ↓
5. Return typed data to server component
   ↓
6. Pass data as props to dynamic client component
   ↓
7. Client Component (MapWrapper) dynamically imports actual Map
   ↓
8. Map Component renders Leaflet with markers
```

**Example:**
```typescript
// src/app/(owner)/live-map/page.tsx (Server Component)
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getLatestTruckLocations } from '@/app/(owner)/actions/gps';
import { MapWrapper } from '@/components/map/map-wrapper';

export default async function LiveMapPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const locations = await getLatestTruckLocations();

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Live Fleet Map</h1>
      <MapWrapper locations={locations} />
    </div>
  );
}

// src/components/map/map-wrapper.tsx (Client Component, dynamic import)
"use client";

import dynamic from 'next/dynamic';

const Map = dynamic(() => import('./map'), { ssr: false });

export function MapWrapper({ locations }) {
  return <Map locations={locations} />;
}

// src/components/map/map.tsx (Client Component, Leaflet)
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

// src/app/(owner)/actions/gps.ts (Server Action)
'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';

export async function getLatestTruckLocations() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  // Distinct on truckId, ordered by timestamp desc = latest location per truck
  const locations = await db.$queryRaw`
    SELECT DISTINCT ON (g."truckId")
      g."truckId",
      g.latitude,
      g.longitude,
      g.speed,
      g.heading,
      g.timestamp,
      t.make || ' ' || t.model AS "truckName"
    FROM "GPSLocation" g
    INNER JOIN "Truck" t ON g."truckId" = t.id
    WHERE g."tenantId" = current_tenant_id()
    ORDER BY g."truckId", g.timestamp DESC
  `;

  return locations;
}
```

### Pattern 2: Dashboard Aggregations with Charts

**What:** Server component fetches aggregated data, client component renders interactive charts
**When to use:** Any dashboard with charts (safety scores, fuel trends, maintenance alerts)
**Trade-offs:** Recharts requires client-side rendering for interactions (tooltips, zooming)

**Flow:**
```
1. Server Component (page.tsx)
   ↓
2. Multiple Server Actions in parallel (Promise.all)
   - getSafetyScoreTrend()
   - getEventsByType()
   - getTopDriverIssues()
   ↓
3. Repositories with aggregation queries
   ↓
4. Prisma aggregate/groupBy + RLS
   ↓
5. Return aggregated data to server component
   ↓
6. Pass data to client chart components
   ↓
7. Client Components render Recharts (LineChart, BarChart, PieChart)
```

**Example:**
```typescript
// src/app/(owner)/safety/page.tsx (Server Component)
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import {
  getSafetyScoreTrend,
  getEventsByType,
  getTopDriverIssues,
} from '@/app/(owner)/actions/safety';
import { SafetyScoreTrendChart } from '@/components/charts/safety-score-trend';
import { EventsByTypeChart } from '@/components/charts/events-by-type';
import { TopDriversTable } from '@/components/safety/top-drivers-table';

export default async function SafetyDashboardPage() {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  // Parallel fetch all dashboard data
  const [scoreTrend, eventsByType, topDrivers] = await Promise.all([
    getSafetyScoreTrend({ days: 30 }),
    getEventsByType({ days: 30 }),
    getTopDriverIssues({ limit: 10 }),
  ]);

  return (
    <div>
      <h1 className="text-3xl font-bold mb-6">Safety Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <SafetyScoreTrendChart data={scoreTrend} />
        <EventsByTypeChart data={eventsByType} />
      </div>

      <TopDriversTable drivers={topDrivers} />
    </div>
  );
}

// src/components/charts/safety-score-trend.tsx (Client Component)
"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export function SafetyScoreTrendChart({ data }) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Safety Score Trend (30 Days)</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis domain={[0, 100]} />
          <Tooltip />
          <Line type="monotone" dataKey="score" stroke="#8884d8" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// src/app/(owner)/actions/safety.ts (Server Action)
'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma } from '@/lib/context/tenant-context';

export async function getSafetyScoreTrend({ days }: { days: number }) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  // Aggregate safety events per day, calculate score
  const events = await db.safetyEvent.groupBy({
    by: ['timestamp'],
    _count: { id: true },
    _avg: { severity: true },  // Assuming severity mapped to numeric
    where: {
      timestamp: {
        gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      },
    },
  });

  // Transform to daily scores (example scoring logic)
  const trend = events.map(day => ({
    date: day.timestamp.toISOString().split('T')[0],
    score: 100 - (day._count.id * 5),  // Simplified scoring
  }));

  return trend;
}
```

### Pattern 3: Seed Scripts with RLS Isolation

**What:** Mock data generation respecting multi-tenant RLS policies
**When to use:** Development, demo environments, testing
**Trade-offs:** Must bypass RLS carefully to avoid leaking data between tenants

**Approach:**

**Option A: Use app.bypass_rls session variable (Recommended)**

```typescript
// prisma/seeds/gps-locations.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function seedGPSLocations(tenantId: string, truckIds: string[]) {
  // Wrap in transaction with RLS context set
  await prisma.$transaction(async (tx) => {
    // Set tenant context for RLS
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

    const locations = [];

    for (const truckId of truckIds) {
      // Generate 100 mock locations per truck (simulate movement)
      for (let i = 0; i < 100; i++) {
        locations.push({
          tenantId,
          truckId,
          latitude: 37.7749 + (Math.random() - 0.5) * 0.1,  // San Francisco area
          longitude: -122.4194 + (Math.random() - 0.5) * 0.1,
          speed: Math.floor(Math.random() * 70),
          heading: Math.floor(Math.random() * 360),
          timestamp: new Date(Date.now() - i * 60 * 1000),  // 1 min intervals
        });
      }
    }

    // Batch insert with RLS enforced
    await tx.gPSLocation.createMany({ data: locations });
  });
}

// Usage in main seed script
async function main() {
  const tenant = await prisma.tenant.create({
    data: { name: 'Demo Fleet Inc', slug: 'demo' },
  });

  const trucks = await prisma.truck.createMany({
    data: [
      { tenantId: tenant.id, make: 'Freightliner', model: 'Cascadia', year: 2022, vin: 'VIN1', licensePlate: 'ABC123', odometer: 50000 },
      { tenantId: tenant.id, make: 'Volvo', model: 'VNL', year: 2021, vin: 'VIN2', licensePlate: 'XYZ789', odometer: 75000 },
    ],
  });

  const truckIds = await prisma.truck.findMany({ where: { tenantId: tenant.id } }).then(t => t.map(t => t.id));

  await seedGPSLocations(tenant.id, truckIds);
  await seedSafetyEvents(tenant.id, truckIds);
  await seedFuelRecords(tenant.id, truckIds);
}
```

**Option B: Admin connection with BYPASSRLS (For admin tasks)**

```typescript
// lib/db/admin-prisma.ts
import { PrismaClient } from '@prisma/client';

// Admin client bypasses RLS entirely (use sparingly!)
export const adminPrisma = new PrismaClient({
  datasourceUrl: process.env.ADMIN_DATABASE_URL,  // Connection string with RLS-bypass user
});

// In migration/seed scripts that create tenants:
const tenant = await adminPrisma.tenant.create({
  data: { name: 'New Tenant' },
});
```

**Why this approach:**
- Seed scripts MUST set tenant context per transaction (prevents cross-tenant contamination)
- Batch inserts with `createMany` after setting context (efficient)
- Each tenant seeded in separate transaction with correct `current_tenant_id`
- Admin client only for tenant creation, not for tenant-scoped data

## Map Component Rendering Strategy

### Client-Only with Dynamic Import (Required)

**Why client-only:**
- Leaflet accesses `window` and `document` during initialization
- Next.js server rendering throws "window is not defined" errors
- `react-leaflet` is not SSR-compatible

**Implementation:**

```typescript
// src/components/map/map-wrapper.tsx
"use client";

import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';

// Dynamic import with ssr: false prevents server-side rendering
const Map = dynamic(() => import('./map'), {
  ssr: false,
  loading: () => <Skeleton className="h-[600px] w-full" />,
});

export function MapWrapper({ locations }) {
  return <Map locations={locations} />;
}
```

**Key points:**
- `ssr: false` is REQUIRED (not optional)
- `loading` component shows placeholder during import
- Wrapper component can be used in server component pages
- Actual map component (`./map`) has Leaflet imports

**Dependencies needed:**

```bash
npm install leaflet react-leaflet
npm install -D @types/leaflet
```

## Chart Component Rendering Strategy

### Client Components with "use client" (Recommended)

**Why client components:**
- Recharts uses browser APIs for SVG rendering and interactions
- Tooltips, hover effects, animations require client-side JavaScript
- Server rendering charts provides no SEO benefit (charts are not indexable content)

**When to use server vs client:**

| Scenario | Component Type | Rationale |
|----------|---------------|-----------|
| Dashboard page wrapper | Server Component | Auth checks, parallel data fetching |
| Data aggregation/queries | Server Action | Database access, RLS enforcement |
| Chart rendering (Recharts) | Client Component | Interactivity (tooltips, zoom, filters) |
| Static summary cards | Server Component | No interactivity needed |

**Implementation:**

```typescript
// src/components/charts/fuel-trend.tsx
"use client";

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

interface FuelTrendChartProps {
  data: { date: string; mpg: number }[];
}

export function FuelTrendChart({ data }: FuelTrendChartProps) {
  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <h3 className="text-lg font-semibold mb-4">Fuel Efficiency Trend</h3>
      <ResponsiveContainer width="100%" height={300}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="date" />
          <YAxis label={{ value: 'MPG', angle: -90, position: 'insideLeft' }} />
          <Tooltip />
          <Line type="monotone" dataKey="mpg" stroke="#10b981" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
```

**Dependencies needed:**

```bash
npm install recharts
```

**No TypeScript types needed** (Recharts includes built-in types)

## Dashboard Data Flow for Aggregations

### Safety Score Calculation

**Query strategy:**

```typescript
// src/app/(owner)/actions/safety.ts
export async function getSafetyScoreByDriver(options: { days: number }) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  // Aggregate events per driver with severity weighting
  const scores = await db.safetyEvent.groupBy({
    by: ['driverId'],
    _count: { id: true },
    _sum: {
      // Map severity to numeric (assuming enum ordinals or custom scoring)
      severity: true,  // Would need custom SQL for complex scoring
    },
    where: {
      timestamp: {
        gte: new Date(Date.now() - options.days * 24 * 60 * 60 * 1000),
      },
      driverId: { not: null },
    },
  });

  // Join with driver names
  const driversWithScores = await Promise.all(
    scores.map(async (score) => {
      const driver = await db.user.findUnique({
        where: { id: score.driverId },
        select: { firstName: true, lastName: true },
      });

      // Calculate safety score (100 baseline - penalties)
      const eventPenalty = score._count.id * 2;
      const safetyScore = Math.max(0, 100 - eventPenalty);

      return {
        driverId: score.driverId,
        driverName: `${driver?.firstName} ${driver?.lastName}`,
        eventCount: score._count.id,
        safetyScore,
      };
    })
  );

  return driversWithScores.sort((a, b) => b.safetyScore - a.safetyScore);
}
```

**Alternative: Raw SQL for complex aggregations**

```typescript
export async function getSafetyScoreByDriver(options: { days: number }) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  const scores = await db.$queryRaw`
    SELECT
      u.id AS "driverId",
      u."firstName" || ' ' || u."lastName" AS "driverName",
      COUNT(se.id) AS "eventCount",
      GREATEST(0, 100 - (
        COUNT(se.id) * 2 +
        SUM(CASE
          WHEN se.severity = 'CRITICAL' THEN 10
          WHEN se.severity = 'HIGH' THEN 5
          WHEN se.severity = 'MEDIUM' THEN 2
          ELSE 1
        END)
      )) AS "safetyScore"
    FROM "User" u
    LEFT JOIN "SafetyEvent" se ON u.id = se."driverId"
      AND se.timestamp >= NOW() - INTERVAL '${options.days} days'
      AND se."tenantId" = current_tenant_id()
    WHERE u."tenantId" = current_tenant_id()
      AND u.role = 'DRIVER'
    GROUP BY u.id, u."firstName", u."lastName"
    ORDER BY "safetyScore" DESC
  `;

  return scores;
}
```

**Rationale:**
- Use Prisma `groupBy` for simple aggregations (counts, sums)
- Use raw SQL for complex scoring logic (CASE statements, weighted sums)
- Always filter by `current_tenant_id()` in raw queries (RLS doesn't auto-apply)
- Parallel `Promise.all` for independent queries (scores + driver lookups)

### Fuel Dashboard Aggregations

**MPG calculation over time:**

```typescript
export async function getFuelEfficiencyTrend(options: { days: number }) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  // Get fuel records with odometer deltas
  const records = await db.$queryRaw`
    WITH fuel_with_delta AS (
      SELECT
        DATE(f.timestamp) AS date,
        f."truckId",
        f.odometer,
        f.quantity,
        LAG(f.odometer) OVER (PARTITION BY f."truckId" ORDER BY f.timestamp) AS prev_odometer
      FROM "FuelRecord" f
      WHERE f."tenantId" = current_tenant_id()
        AND f.timestamp >= NOW() - INTERVAL '${options.days} days'
        AND f."isEstimated" = false
      ORDER BY f.timestamp
    )
    SELECT
      date,
      ROUND(AVG((odometer - prev_odometer)::numeric / quantity), 2) AS mpg
    FROM fuel_with_delta
    WHERE prev_odometer IS NOT NULL  -- Exclude first record per truck
    GROUP BY date
    ORDER BY date ASC
  `;

  return records;
}
```

**Cost per mile:**

```typescript
export async function getFuelCostPerMile(options: { truckId?: string; days: number }) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  const costPerMile = await db.$queryRaw`
    WITH fuel_with_delta AS (
      SELECT
        f."truckId",
        t.make || ' ' || t.model AS "truckName",
        SUM(f."totalCost") AS "totalCost",
        MAX(f.odometer) - MIN(f.odometer) AS "milesDriven"
      FROM "FuelRecord" f
      INNER JOIN "Truck" t ON f."truckId" = t.id
      WHERE f."tenantId" = current_tenant_id()
        AND f.timestamp >= NOW() - INTERVAL '${options.days} days'
        AND f."totalCost" IS NOT NULL
        ${options.truckId ? Prisma.sql`AND f."truckId" = ${options.truckId}::uuid` : Prisma.empty}
      GROUP BY f."truckId", t.make, t.model
      HAVING MAX(f.odometer) - MIN(f.odometer) > 0
    )
    SELECT
      "truckId",
      "truckName",
      "totalCost",
      "milesDriven",
      ROUND(("totalCost" / "milesDriven")::numeric, 4) AS "costPerMile"
    FROM fuel_with_delta
    ORDER BY "costPerMile" DESC
  `;

  return costPerMile;
}
```

**Rationale:**
- Window functions (LAG) calculate odometer deltas efficiently
- CTEs (WITH clauses) make complex queries readable
- Filter `isEstimated = false` for actual fill-ups (not calculated consumption)
- RLS enforced via `current_tenant_id()` in WHERE clauses

## Anti-Patterns to Avoid

### Anti-Pattern 1: Fetching GPS Data Without Time Bounds

**What people do:** Query all GPS locations without date filters

```typescript
// BAD: Fetches entire GPS history (could be millions of rows)
const locations = await db.gPSLocation.findMany({
  where: { truckId },
});
```

**Why it's wrong:** GPS data grows unbounded; a truck logging every 30 seconds generates 2,880 records/day. After 1 year: ~1M records per truck.

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

**Additional optimization:** PostgreSQL partitioning by timestamp

```sql
-- In migration: Partition GPS table by month
CREATE TABLE "GPSLocation" (
  -- ... columns
) PARTITION BY RANGE (timestamp);

CREATE TABLE "GPSLocation_2026_02" PARTITION OF "GPSLocation"
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
```

### Anti-Pattern 2: Client-Side Safety Score Calculations

**What people do:** Fetch all safety events to client, calculate scores in React

```typescript
// BAD: 10,000 events sent to browser, calculated in JavaScript
const events = await fetch('/api/safety-events');
const scores = events.reduce((acc, event) => {
  // Complex scoring logic in client
}, {});
```

**Why it's wrong:**
- Large data transfer (10,000 events × 500 bytes = 5MB JSON)
- Client-side calculation blocks UI rendering
- Scoring logic duplicated (server and client)
- Security risk (exposes raw event data)

**Do this instead:**

```typescript
// GOOD: Aggregate on server, return only scores
export async function getSafetyScores() {
  const db = await getTenantPrisma();

  const scores = await db.$queryRaw`
    SELECT
      "driverId",
      -- Complex scoring logic in SQL
      100 - SUM(severity_weight) AS score
    FROM safety_events_with_weights
    GROUP BY "driverId"
  `;

  return scores;  // ~100 rows × 50 bytes = 5KB
}
```

### Anti-Pattern 3: Separate Queries Instead of Parallel Fetches

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

**When NOT to parallelize:** Dependent queries (need result of first for second)

```typescript
// Correct sequential: Second query depends on first result
const truck = await db.truck.findUnique({ where: { id } });
const latestLocation = await db.gPSLocation.findFirst({
  where: { truckId: truck.id },
  orderBy: { timestamp: 'desc' },
});
```

### Anti-Pattern 4: Server Actions for Real-Time Updates

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

**Do this instead:**

For true real-time (not in initial milestone):

```typescript
// FUTURE: WebSocket/SSE for real-time updates
const ws = new WebSocket('/api/gps/stream');
ws.onmessage = (event) => {
  const location = JSON.parse(event.data);
  updateMap(location);
};
```

For initial milestone (acceptable polling):

```typescript
// ACCEPTABLE: Route handler with caching, longer poll interval
useEffect(() => {
  const interval = setInterval(async () => {
    const res = await fetch('/api/gps/latest');  // Cached for 10s
    const locations = await res.json();
    setLocations(locations);
  }, 30000);  // 30-second refresh (not true real-time)
}, []);
```

### Anti-Pattern 5: Ignoring RLS in Seed Scripts

**What people do:** Create seed data without setting tenant context

```typescript
// BAD: RLS blocks inserts (no tenant context set)
await prisma.gPSLocation.createMany({
  data: locations,  // Fails: current_tenant_id() is NULL
});
```

**Why it's wrong:** RLS policies require `current_tenant_id()` to be set; without it, inserts are blocked

**Do this instead:**

```typescript
// GOOD: Set tenant context in transaction
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
  await tx.gPSLocation.createMany({ data: locations });
});
```

## Build Order (Dependency-Aware)

### Phase 1: Database Schema & Seed Foundation
**Why first:** All features depend on data models

1. Create Prisma models (GPSLocation, SafetyEvent, FuelRecord)
2. Generate migration with RLS policies
3. Run migration
4. Create repository classes (GPSRepository, SafetyEventRepository, FuelRecordRepository)
5. Create seed scripts with RLS-aware tenant context
6. Seed demo data for development

**Dependencies:** None
**Blocks:** Everything else
**Validation:** Query seed data via Prisma Studio, verify RLS isolation

---

### Phase 2: Navigation Infrastructure
**Why second:** Shared layout change affects all pages

1. Create Sidebar component (client component with usePathname)
2. Add navigation links (Dashboard, Live Map, Safety, Fuel, Trucks, Drivers, Routes)
3. Modify `(owner)/layout.tsx` to include Sidebar
4. Style active states and responsive behavior

**Dependencies:** None
**Blocks:** Nothing (can be done in parallel with Phase 1)
**Validation:** Navigate between existing pages, verify sidebar persists

---

### Phase 3: Live GPS Map
**Why third:** Independent of other new features, showcases new data

1. Install Leaflet dependencies (`leaflet`, `react-leaflet`)
2. Create server action `getLatestTruckLocations()` in `actions/gps.ts`
3. Create Map component (client, Leaflet)
4. Create MapWrapper component (dynamic import, ssr: false)
5. Create `/live-map/page.tsx` (server component)
6. Test with seed data

**Dependencies:** Phase 1 (GPS data), Phase 2 (navigation link)
**Blocks:** Nothing
**Validation:** Map loads, markers show truck locations, tooltips display truck names

---

### Phase 4: Safety Dashboard
**Why fourth:** Independent of fuel, leverages existing chart patterns

1. Install Recharts dependency
2. Create server actions in `actions/safety.ts`:
   - `getSafetyScoreTrend()`
   - `getEventsByType()`
   - `getTopDriverIssues()`
3. Create chart components (SafetyScoreTrendChart, EventsByTypeChart)
4. Create TopDriversTable component
5. Create `/safety/page.tsx` (server component with parallel fetches)
6. Test with seed data

**Dependencies:** Phase 1 (SafetyEvent data), Phase 2 (navigation link)
**Blocks:** Nothing
**Validation:** Charts render, data aggregates correctly, scores calculate properly

---

### Phase 5: Fuel Dashboard
**Why fifth:** Similar pattern to safety, can reuse chart components

1. Create server actions in `actions/fuel.ts`:
   - `getFuelEfficiencyTrend()`
   - `getFuelCostPerMile()`
   - `getFuelByTruck()`
2. Create chart components (FuelTrendChart, CostPerMileChart)
3. Create fuel summary cards component
4. Create `/fuel/page.tsx` (server component with parallel fetches)
5. Test with seed data, verify MPG calculations

**Dependencies:** Phase 1 (FuelRecord data), Phase 2 (navigation link), Phase 4 (Recharts installed)
**Blocks:** Nothing
**Validation:** Fuel trends display, MPG calculations accurate, cost breakdowns correct

---

### Phase 6: Polish & Performance
**Why last:** Optimization after features work

1. Add loading states (Suspense boundaries)
2. Add error boundaries for charts
3. Optimize database indexes (review query plans)
4. Add date range filters to dashboards
5. Add export functionality (CSV download for safety/fuel reports)
6. Mobile responsive testing

**Dependencies:** Phases 3, 4, 5 (all features built)
**Blocks:** Nothing (final polish)
**Validation:** Load testing, mobile testing, error simulation

---

## Integration Points Summary

| Integration Area | How It Works |
|------------------|--------------|
| **Route Structure** | New pages in existing `(owner)` route group, no new groups needed |
| **Layout Changes** | Add Sidebar to `(owner)/layout.tsx`, preserve existing header/auth |
| **Data Access** | New repositories extend TenantRepository pattern, use existing RLS extension |
| **Server Actions** | New action files (`gps.ts`, `safety.ts`, `fuel.ts`) follow existing pattern in `actions/` |
| **Component Pattern** | Server components for pages/data fetching, client components for maps/charts |
| **Seed Scripts** | Respect RLS by setting `current_tenant_id` in transactions, batch insert with `createMany` |
| **Dependencies** | Leaflet (dynamic import, ssr: false), Recharts ("use client"), existing Next.js/Prisma/Clerk |

## Sources

**Next.js App Router & Layouts:**
- [Getting Started: Layouts and Pages | Next.js](https://nextjs.org/docs/app/getting-started/layouts-and-pages)
- [A guide to Next.js layouts and nested layouts - LogRocket Blog](https://blog.logrocket.com/guide-next-js-layouts-nested-layouts/)

**Map Component Integration:**
- [How to use Leaflet with Next.js and Vector Tiles | Leaflet | MapTiler](https://docs.maptiler.com/leaflet/examples/nextjs/)
- [Displaying a Leaflet Map in NextJS | by Tomisin Abiodun | Medium](https://medium.com/@tomisinabiodun/displaying-a-leaflet-map-in-nextjs-85f86fccc10c)

**Charts & Server Components:**
- [Next.js Charts with Recharts - A Useful Guide](https://app-generator.dev/docs/technologies/nextjs/integrate-recharts.html)
- [Getting Started: Server and Client Components | Next.js](https://nextjs.org/docs/app/getting-started/server-and-client-components)

**Data Fetching Patterns:**
- [Data Fetching: Data Fetching Patterns and Best Practices | Next.js](https://nextjs.org/docs/14/app/building-your-application/data-fetching/patterns)
- [Getting Started: Fetching Data | Next.js](https://nextjs.org/docs/app/getting-started/fetching-data)

**Fleet Management Data Models:**
- [How to Design Database for Fleet Management Systems - GeeksforGeeks](https://www.geeksforgeeks.org/dbms/how-to-design-database-for-fleet-management-systems/)
- [Driver Behavior Monitoring: Complete Fleet Safety Guide 2026](https://oxmaint.com/industries/fleet-management/driver-behavior-monitoring-complete-fleet-safety-guide-2026)

**Multi-Tenant RLS with Prisma:**
- [Securing Multi-Tenant Applications Using Row Level Security in PostgreSQL with Prisma ORM | by Franco Labuschagne | Medium](https://medium.com/@francolabuschagne90/securing-multi-tenant-applications-using-row-level-security-in-postgresql-with-prisma-orm-4237f4d4bd35)
- [Using Row-Level Security in Prisma | Atlas Guides](https://atlasgo.io/guides/orms/prisma/row-level-security)

---

*Architecture research for: DriveCommand Fleet Intelligence Features*
*Researched: 2026-02-15*
*Confidence: HIGH*
