# Phase 11: Navigation & Data Foundation - Research

**Researched:** 2026-02-15
**Domain:** Sidebar navigation + GPS/Safety/Fuel data models + mock data seeding
**Confidence:** HIGH

## Summary

Phase 11 establishes the foundation for v2.0 fleet intelligence features by replacing owner portal navigation with a Samsara-style collapsible sidebar and creating RLS-protected data models (GPSLocation, SafetyEvent, FuelRecord) populated with realistic mock data. The sidebar uses shadcn/ui components with persistent collapse state and role-based menu items. Mock data generation follows existing RLS transaction patterns with idempotent seed scripts supporting a --reset flag. GPS trail realism is achieved through coordinate interpolation (not random points) using helper libraries like Turf.js rather than costly Google Maps API calls.

**Critical insight:** The user wants GPS trails to follow real road networks, not scattered random points. While Google Maps Directions API provides actual route coordinates, it costs money after free tier ($5/1000 requests) and requires API key management. OSRM (Open Source Routing Machine) is free but requires self-hosting infrastructure. For v2.0 mock data (development/demo), the optimal approach is **coordinate interpolation with Turf.js**: generate origin/destination pairs on known US interstate routes (I-5, I-10, I-80), then use `turf.lineString()` and `turf.along()` to create smooth GPS trails with realistic spacing (1 point per minute of travel). This avoids API costs while delivering visual realism for map/dashboard validation.

**Primary recommendation:** Use shadcn/ui Sidebar component (already installed) with collapsible sections for menu groups. Create GPSLocation, SafetyEvent, FuelRecord models with identical RLS patterns from v1.0 (same policies, same transaction context). Build idempotent seed scripts using Prisma `upsert()` for deterministic data and support `--reset` flag via environment variable (SEED_RESET=true). Generate realistic GPS trails via Turf.js interpolation between major US city pairs, seed safety events at random trail points, and create fuel records based on odometer progression.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Sidebar visual style:**
- Company logo + company name at the top of the sidebar (collapses to logo icon when sidebar is collapsed)
- Required components: logo, company name, logo-only collapsed state

**Menu organization:**
- Grouped sections with section headers (not a flat list)
- Samsara-style grouping: Dashboard (top) → Fleet Intelligence (Live Map, Safety, Fuel) → Fleet Management (Trucks, Drivers, Routes) → Maintenance
- Groups MUST use section headers (like "Fleet Intelligence", "Fleet Management")

**Mock data characteristics:**
- Medium fleet size: 20-30 trucks with corresponding drivers
- 30-day time range for all GPS, safety, and fuel data
- GPS trails should follow real road networks — user prefers Google Maps data if feasible (researcher to evaluate: Google Maps Directions API, OSRM, or pre-built coordinate sets along real US highways/interstates)
- Seed script must be idempotent (safe to run multiple times) with a --reset flag to clear all mock data

### Claude's Discretion

The planner should make final decisions on:

**Sidebar design:**
- Sidebar theme (dark navy vs matching current app theme)
- Collapse behavior (icon rail vs fully hidden)
- User profile/avatar placement (bottom of sidebar vs keeping current UserMenu)
- Collapse animation (smooth transition vs instant)
- Section header collapsibility (always visible vs collapsible groups)

**Navigation transition:**
- Top nav fate (replace completely vs keep thin bar for breadcrumbs/search)
- Driver portal navigation approach (sidebar vs keep current nav)
- System admin portal navigation approach (sidebar vs keep current nav)
- Mobile sidebar behavior (drawer overlay vs bottom tabs)

**Data model details:**
- Maintenance/Documents sidebar placement (standalone entries vs nested in detail pages)
- GPS coordinate precision (6 vs 8 decimal places)
- SafetyEvent metadata JSONB schema (structured vs freeform)
- FuelRecord cost tracking (required vs optional fields)

**Seed script behavior:**
- Reset flag implementation (--reset CLI flag vs environment variable SEED_RESET=true)
- GPS trail generation method (Google Maps API vs OSRM vs Turf.js interpolation)
- Safety event frequency (2-5 events per truck vs 10-20 events per driver)
- Fuel record cadence (weekly fill-ups vs odometer-triggered)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope

</user_constraints>

## Standard Stack

### Core (Already Installed from v1.0)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | 7.x | ORM with RLS extensions | Pure TypeScript, established RLS pattern via Client Extensions in v1.0 |
| PostgreSQL | 17.x | Database with RLS | RLS policies already configured for Tenant, Truck, User, Route, Document models |
| shadcn/ui | Latest | Component library | Already installed, includes Sidebar component (added 2024) |
| Lucide React | 0.564.0 | Icon library | Already installed from STACK.md, tree-shakeable icons |

### New Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|-------------|
| @faker-js/faker | 10.3.0 | Mock data generation | Industry standard for realistic seed data, active maintenance (Feb 7 2026), generates GPS coordinates/timestamps/names/VINs |
| @turf/turf | 7.x | Geospatial calculations | Open-source geospatial toolkit for coordinate interpolation, distance calculation, line slicing |
| @turf/along | 7.x | Coordinate interpolation | Creates intermediate GPS points along a LineString at specific distances (e.g., every 1 mile) |
| @turf/line-string | 7.x | LineString creation | Converts coordinate pairs into GeoJSON LineString for route representation |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Turf.js interpolation | Google Maps Directions API | Google Maps provides actual road-following routes with turn-by-turn accuracy, but costs $5/1000 requests after $200/month free credit, requires API key management, and introduces external dependency. For v2.0 mock data (dev/demo), Turf.js interpolation between major cities provides sufficient visual realism at zero cost. |
| Turf.js interpolation | OSRM self-hosted | OSRM is free and provides real road network routing, but requires self-hosting infrastructure (Docker container, OSM data downloads, server maintenance). For v2.0 where data is entirely synthetic, hosting costs outweigh benefit vs simple interpolation. |
| Faker.js | Chance.js | Chance.js less actively maintained (last update 2020), smaller ecosystem, fewer realistic generators for fleet data (VINs, license plates) |
| @turf/turf | geopy (Python) | geopy is Python-only, doesn't work in Node.js/Prisma seed scripts without shell execution. Turf.js is JavaScript-native and integrates directly with Prisma TypeScript seeds. |
| Idempotent upsert | createMany with skipDuplicates | upsert requires separate query per record (slow for 10K+ GPS points), skipDuplicates only works if ALL fields match (not just ID). For large datasets, createMany + skipDuplicates faster (batch insert) but requires full data match or manual cleanup. |

**Installation:**
```bash
# Already installed from v1.0 (verify in package.json)
# - @prisma/client
# - lucide-react
# - shadcn/ui components

# NEW: Mock data generation
npm install -D @faker-js/faker@^10.3.0

# NEW: Geospatial calculations for GPS trail interpolation
npm install @turf/turf @turf/along @turf/line-string
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   └── (owner)/
│       ├── layout.tsx              [MODIFIED: Add Sidebar component]
│       ├── live-map/               [NEW: Phase 12]
│       ├── safety/                 [NEW: Phase 13]
│       ├── fuel/                   [NEW: Phase 14]
│       └── actions/
│           ├── gps.ts              [NEW: GPS location queries]
│           ├── safety.ts           [NEW: Safety event aggregations]
│           └── fuel.ts             [NEW: Fuel record analytics]
├── components/
│   └── navigation/
│       └── sidebar.tsx             [NEW: Samsara-style sidebar]
├── lib/
│   └── db/
│       └── repositories/
│           ├── gps.repository.ts       [NEW: GPS data access]
│           ├── safety-event.repository.ts  [NEW: Safety data access]
│           └── fuel-record.repository.ts   [NEW: Fuel data access]
prisma/
├── schema.prisma                   [MODIFIED: Add GPSLocation, SafetyEvent, FuelRecord models]
├── migrations/
│   └── YYYYMMDD_add_fleet_intelligence_models/
│       └── migration.sql           [NEW: Create tables + RLS policies]
└── seeds/
    ├── seed.ts                     [MODIFIED: Orchestrate new seeds]
    ├── gps-locations.ts            [NEW: Generate GPS trails]
    ├── safety-events.ts            [NEW: Generate safety events]
    └── fuel-records.ts             [NEW: Generate fuel records]
```

### Pattern 1: Sidebar Navigation with shadcn/ui

**What:** Persistent collapsible sidebar navigation using shadcn/ui Sidebar component with grouped menu items
**When to use:** Replace top-nav pattern with sidebar when app has 5+ primary navigation sections
**Example:**
```typescript
// src/components/navigation/sidebar.tsx
"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { LayoutDashboard, MapPin, Shield, Fuel, Truck, Users, Route as RouteIcon, Wrench, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export function AppSidebar() {
  const pathname = usePathname()

  const isActive = (path: string) => pathname === path

  return (
    <Sidebar>
      <SidebarContent>
        {/* Company Logo & Name */}
        <div className="p-4 border-b">
          <div className="flex items-center gap-3">
            <img src="/logo.svg" alt="Logo" className="w-8 h-8" />
            <span className="font-semibold text-lg group-data-[state=collapsed]:hidden">
              DriveCommand
            </span>
          </div>
        </div>

        {/* Dashboard (ungrouped, top) */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive('/dashboard')}>
                <Link href="/dashboard">
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Fleet Intelligence Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Fleet Intelligence</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/live-map')}>
                  <Link href="/live-map">
                    <MapPin className="w-4 h-4" />
                    <span>Live Map</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/safety')}>
                  <Link href="/safety">
                    <Shield className="w-4 h-4" />
                    <span>Safety</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/fuel')}>
                  <Link href="/fuel">
                    <Fuel className="w-4 h-4" />
                    <span>Fuel</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Fleet Management Group */}
        <SidebarGroup>
          <SidebarGroupLabel>Fleet Management</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/trucks')}>
                  <Link href="/trucks">
                    <Truck className="w-4 h-4" />
                    <span>Trucks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/drivers')}>
                  <Link href="/drivers">
                    <Users className="w-4 h-4" />
                    <span>Drivers</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={isActive('/routes')}>
                  <Link href="/routes">
                    <RouteIcon className="w-4 h-4" />
                    <span>Routes</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Maintenance */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive('/maintenance')}>
                <Link href="/maintenance">
                  <Wrench className="w-4 h-4" />
                  <span>Maintenance</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}

// Modified layout to include sidebar
// src/app/(owner)/layout.tsx
import { AppSidebar } from '@/components/navigation/sidebar'
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar'

export default function OwnerLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="flex h-screen">
        <AppSidebar />
        <main className="flex-1 overflow-y-auto">
          <div className="p-4">
            <SidebarTrigger className="mb-4" />
            {children}
          </div>
        </main>
      </div>
    </SidebarProvider>
  )
}
```

**Why this approach:**
- shadcn/ui Sidebar component released in 2024, specifically designed for dashboard apps
- Persistent collapse state saved to localStorage (no server state needed)
- Keyboard shortcut (Cmd+B) built-in for accessibility
- Mobile responsive (switches to offcanvas drawer automatically)
- Active state highlighting via `usePathname()` hook
- Icon-only collapsed state (logo shrinks to icon, text hidden)

**Source:** [shadcn/ui Sidebar Documentation](https://ui.shadcn.com/docs/components/radix/sidebar)

### Pattern 2: RLS-Aware Prisma Models (Extending v1.0 Pattern)

**What:** New models (GPSLocation, SafetyEvent, FuelRecord) with identical RLS policy structure to existing models
**When to use:** Every new tenant-scoped model in the system
**Example:**

```prisma
// prisma/schema.prisma

// EXISTING model (v1.0) - shows RLS pattern
model Truck {
  id          String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId    String   @db.Uuid
  make        String
  model       String
  year        Int
  vin         String
  licensePlate String
  odometer    Int
  createdAt   DateTime @default(now()) @db.Timestamptz
  updatedAt   DateTime @updatedAt @db.Timestamptz

  tenant Tenant @relation(fields: [tenantId], references: [id])

  // NEW relations (Phase 11)
  gpsLocations  GPSLocation[]
  safetyEvents  SafetyEvent[]
  fuelRecords   FuelRecord[]

  @@index([tenantId])
}

// NEW model (Phase 11) - SAME RLS pattern
model GPSLocation {
  id         String   @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  tenantId   String   @db.Uuid
  truckId    String   @db.Uuid
  latitude   Decimal  @db.Decimal(10, 8)  // -90 to 90 with 8 decimals (~1.1mm accuracy)
  longitude  Decimal  @db.Decimal(11, 8)  // -180 to 180 with 8 decimals
  speed      Int?     // mph, nullable for stationary
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
  @@index([tenantId, timestamp])  // Optimizes dashboard queries (last 24 hours per tenant)
}

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
  gForce      Decimal?             @db.Decimal(4, 2)  // G-force for braking/acceleration
  speed       Int?                 // mph at time of event
  speedLimit  Int?                 // Posted limit (for speeding events)
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
  odometer        Int       // CRITICAL for MPG calculation
  location        String?   // Station name/address
  latitude        Decimal?  @db.Decimal(10, 8)
  longitude       Decimal?  @db.Decimal(11, 8)
  timestamp       DateTime  @db.Timestamptz
  isEstimated     Boolean   @default(false)  // True for calculated vs actual fill-ups
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

// MODIFIED model (existing) - add new relations
model Tenant {
  // ... existing fields unchanged

  // NEW relations (Phase 11)
  gpsLocations  GPSLocation[]
  safetyEvents  SafetyEvent[]
  fuelRecords   FuelRecord[]
}

model User {
  // ... existing fields unchanged

  // NEW relations (Phase 11)
  safetyEvents  SafetyEvent[]  // Driver-attributed safety events
}

model Route {
  // ... existing fields unchanged

  // NEW relations (Phase 11)
  safetyEvents  SafetyEvent[]  // Events during this route
}
```

**RLS Migration SQL (generated by Prisma, manually verify policies match v1.0 pattern):**

```sql
-- migrations/YYYYMMDD_add_fleet_intelligence_models/migration.sql

-- Create enums
CREATE TYPE "SafetyEventType" AS ENUM (
  'HARSH_BRAKING',
  'HARSH_ACCELERATION',
  'HARSH_CORNERING',
  'SPEEDING',
  'DISTRACTED_DRIVING',
  'ROLLING_STOP',
  'SEATBELT_VIOLATION',
  'FOLLOWING_TOO_CLOSE'
);

CREATE TYPE "SafetyEventSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
CREATE TYPE "FuelType" AS ENUM ('DIESEL', 'GASOLINE', 'ELECTRIC', 'HYBRID', 'CNG', 'LPG');

-- Create tables
CREATE TABLE "GPSLocation" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "truckId" UUID NOT NULL REFERENCES "Truck"("id") ON DELETE CASCADE,
  "latitude" DECIMAL(10, 8) NOT NULL,
  "longitude" DECIMAL(11, 8) NOT NULL,
  "speed" INTEGER,
  "heading" INTEGER,
  "altitude" INTEGER,
  "accuracy" DECIMAL(6, 2),
  "timestamp" TIMESTAMPTZ NOT NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "SafetyEvent" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "truckId" UUID NOT NULL REFERENCES "Truck"("id") ON DELETE CASCADE,
  "driverId" UUID REFERENCES "User"("id") ON DELETE SET NULL,
  "routeId" UUID REFERENCES "Route"("id") ON DELETE SET NULL,
  "eventType" "SafetyEventType" NOT NULL,
  "severity" "SafetyEventSeverity" NOT NULL,
  "gForce" DECIMAL(4, 2),
  "speed" INTEGER,
  "speedLimit" INTEGER,
  "latitude" DECIMAL(10, 8) NOT NULL,
  "longitude" DECIMAL(11, 8) NOT NULL,
  "timestamp" TIMESTAMPTZ NOT NULL,
  "metadata" JSONB,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE "FuelRecord" (
  "id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenantId" UUID NOT NULL REFERENCES "Tenant"("id") ON DELETE CASCADE,
  "truckId" UUID NOT NULL REFERENCES "Truck"("id") ON DELETE CASCADE,
  "fuelType" "FuelType" NOT NULL,
  "quantity" DECIMAL(10, 2) NOT NULL,
  "unitCost" DECIMAL(10, 4),
  "totalCost" DECIMAL(10, 2),
  "odometer" INTEGER NOT NULL,
  "location" TEXT,
  "latitude" DECIMAL(10, 8),
  "longitude" DECIMAL(11, 8),
  "timestamp" TIMESTAMPTZ NOT NULL,
  "isEstimated" BOOLEAN NOT NULL DEFAULT false,
  "notes" TEXT,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX "GPSLocation_tenantId_idx" ON "GPSLocation"("tenantId");
CREATE INDEX "GPSLocation_truckId_idx" ON "GPSLocation"("truckId");
CREATE INDEX "GPSLocation_timestamp_idx" ON "GPSLocation"("timestamp");
CREATE INDEX "GPSLocation_tenantId_timestamp_idx" ON "GPSLocation"("tenantId", "timestamp");

CREATE INDEX "SafetyEvent_tenantId_idx" ON "SafetyEvent"("tenantId");
CREATE INDEX "SafetyEvent_truckId_idx" ON "SafetyEvent"("truckId");
CREATE INDEX "SafetyEvent_driverId_idx" ON "SafetyEvent"("driverId");
CREATE INDEX "SafetyEvent_routeId_idx" ON "SafetyEvent"("routeId");
CREATE INDEX "SafetyEvent_eventType_idx" ON "SafetyEvent"("eventType");
CREATE INDEX "SafetyEvent_severity_idx" ON "SafetyEvent"("severity");
CREATE INDEX "SafetyEvent_timestamp_idx" ON "SafetyEvent"("timestamp");
CREATE INDEX "SafetyEvent_tenantId_timestamp_idx" ON "SafetyEvent"("tenantId", "timestamp");

CREATE INDEX "FuelRecord_tenantId_idx" ON "FuelRecord"("tenantId");
CREATE INDEX "FuelRecord_truckId_idx" ON "FuelRecord"("truckId");
CREATE INDEX "FuelRecord_timestamp_idx" ON "FuelRecord"("timestamp");
CREATE INDEX "FuelRecord_tenantId_timestamp_idx" ON "FuelRecord"("tenantId", "timestamp");
CREATE INDEX "FuelRecord_isEstimated_idx" ON "FuelRecord"("isEstimated");

-- Enable RLS (CRITICAL: SAME PATTERN as v1.0 Truck/Route/User tables)
ALTER TABLE "GPSLocation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SafetyEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FuelRecord" ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (IDENTICAL PATTERN to existing v1.0 tables)
CREATE POLICY tenant_isolation_policy ON "GPSLocation"
  USING ("tenantId" = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation_policy ON "SafetyEvent"
  USING ("tenantId" = current_setting('app.current_tenant_id')::uuid);

CREATE POLICY tenant_isolation_policy ON "FuelRecord"
  USING ("tenantId" = current_setting('app.current_tenant_id')::uuid);

-- Force RLS (no BYPASSRLS for any user)
ALTER TABLE "GPSLocation" FORCE ROW LEVEL SECURITY;
ALTER TABLE "SafetyEvent" FORCE ROW LEVEL SECURITY;
ALTER TABLE "FuelRecord" FORCE ROW LEVEL SECURITY;
```

**Key insights:**
- RLS policies are IDENTICAL to v1.0 pattern (uses `current_setting('app.current_tenant_id')`)
- No changes to existing RLS transaction context mechanism from Phase 1
- New repositories extend same `TenantRepository` base class
- Indexes include composite `[tenantId, timestamp]` for dashboard queries (last 24 hours, last 30 days)

### Pattern 3: Realistic GPS Trail Generation with Turf.js Interpolation

**What:** Generate GPS trails that follow smooth paths between origin/destination pairs (not random scatter)
**When to use:** Mock data generation for map visualization where visual realism matters
**Trade-offs:** Not true road network routing (no turn-by-turn), but visually realistic on map and zero API cost

**Example:**

```typescript
// prisma/seeds/gps-locations.ts
import { PrismaClient, Prisma } from '@prisma/client';
import { faker } from '@faker-js/faker';
import * as turf from '@turf/turf';
import along from '@turf/along';
import lineString from '@turf/line-string';

const prisma = new PrismaClient();

/**
 * Major US city pairs for realistic interstate routes
 * These pairs represent common freight corridors
 */
const ROUTE_PAIRS = [
  // I-5 Corridor (West Coast)
  { origin: { lat: 47.6062, lng: -122.3321 }, destination: { lat: 34.0522, lng: -118.2437 }, name: "Seattle to Los Angeles" },
  { origin: { lat: 37.7749, lng: -122.4194 }, destination: { lat: 32.7157, lng: -117.1611 }, name: "San Francisco to San Diego" },

  // I-10 Corridor (Southern)
  { origin: { lat: 34.0522, lng: -118.2437 }, destination: { lat: 29.7604, lng: -95.3698 }, name: "Los Angeles to Houston" },
  { origin: { lat: 33.4484, lng: -112.0740 }, destination: { lat: 30.2672, lng: -97.7431 }, name: "Phoenix to Austin" },

  // I-80 Corridor (Northern)
  { origin: { lat: 37.7749, lng: -122.4194 }, destination: { lat: 41.2565, lng: -95.9345 }, name: "San Francisco to Omaha" },
  { origin: { lat: 41.8781, lng: -87.6298 }, destination: { lat: 40.7128, lng: -74.0060 }, name: "Chicago to New York" },

  // I-95 Corridor (East Coast)
  { origin: { lat: 42.3601, lng: -71.0589 }, destination: { lat: 25.7617, lng: -80.1918 }, name: "Boston to Miami" },
  { origin: { lat: 40.7128, lng: -74.0060 }, destination: { lat: 33.7490, lng: -84.3880 }, name: "New York to Atlanta" },

  // I-40 Corridor (Mid-South)
  { origin: { lat: 35.4676, lng: -97.5164 }, destination: { lat: 35.1495, lng: -90.0490 }, name: "Oklahoma City to Memphis" },
  { origin: { lat: 35.2271, lng: -80.8431 }, destination: { lat: 36.1627, lng: -86.7816 }, name: "Charlotte to Nashville" },
];

/**
 * Generate smooth GPS trail between two coordinates using Turf.js interpolation
 * Creates intermediate points at regular intervals (simulating GPS pings every 1 minute)
 *
 * @param params Origin, destination, start time, trip duration
 * @returns Array of GPS location records with realistic spacing
 */
function generateGPSTrail(params: {
  truckId: string;
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  startTime: Date;
  durationMinutes: number;
}): Prisma.GPSLocationCreateManyInput[] {
  const { truckId, origin, destination, startTime, durationMinutes } = params;

  // Create LineString from origin to destination
  const line = lineString([
    [origin.lng, origin.lat],  // Turf uses [lng, lat] format
    [destination.lng, destination.lat]
  ]);

  // Calculate total distance in miles
  const totalDistance = turf.length(line, { units: 'miles' });

  // Average truck speed: 55-65 mph
  const avgSpeed = 60;
  const expectedDuration = totalDistance / avgSpeed * 60; // minutes

  // Interpolate points every 1 mile along the route
  const intervalMiles = 1;
  const pointCount = Math.floor(totalDistance / intervalMiles);

  const locations: Prisma.GPSLocationCreateManyInput[] = [];

  for (let i = 0; i <= pointCount; i++) {
    const distanceFromOrigin = i * intervalMiles;
    const progress = distanceFromOrigin / totalDistance;

    // Get coordinate at this distance along the line
    const point = along(line, distanceFromOrigin, { units: 'miles' });
    const [lng, lat] = point.geometry.coordinates;

    // Simulate speed variation (slower near start/end, faster in middle)
    const speedVariation = 1 - Math.abs(progress - 0.5) * 0.3;
    const speed = Math.round(avgSpeed * speedVariation + faker.number.int({ min: -5, max: 5 }));

    // Calculate heading (bearing from current point to next)
    const heading = i < pointCount
      ? turf.bearing(point, along(line, (i + 1) * intervalMiles, { units: 'miles' }))
      : turf.bearing(point, lineString([[destination.lng, destination.lat]]));

    // Calculate timestamp based on distance traveled
    const minutesElapsed = (distanceFromOrigin / totalDistance) * durationMinutes;
    const timestamp = new Date(startTime.getTime() + minutesElapsed * 60 * 1000);

    locations.push({
      truckId,
      tenantId: '', // Will be set by RLS transaction context
      latitude: new Prisma.Decimal(lat.toFixed(8)),
      longitude: new Prisma.Decimal(lng.toFixed(8)),
      speed,
      heading: Math.round((heading + 360) % 360), // Normalize to 0-359
      altitude: faker.number.int({ min: 100, max: 2000 }), // Vary altitude
      accuracy: new Prisma.Decimal(faker.number.float({ min: 5, max: 15 }).toFixed(2)),
      timestamp,
    });
  }

  return locations;
}

/**
 * Seed GPS locations for all trucks in a tenant
 * Generates 30 days of historical GPS trails (3-5 routes per truck)
 */
export async function seedGPSLocations(tenantId: string, trucks: { id: string }[]) {
  await prisma.$transaction(async (tx) => {
    // Set RLS context (SAME PATTERN as existing v1.0 seed scripts)
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

    const allLocations: Prisma.GPSLocationCreateManyInput[] = [];

    for (const truck of trucks) {
      // Generate 3-5 routes per truck over last 30 days
      const routeCount = faker.number.int({ min: 3, max: 5 });

      for (let i = 0; i < routeCount; i++) {
        // Pick random route pair
        const routePair = faker.helpers.arrayElement(ROUTE_PAIRS);

        // Random start time in last 30 days
        const daysAgo = faker.number.int({ min: 0, max: 30 });
        const startTime = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

        // Calculate realistic trip duration based on distance
        const distance = turf.distance(
          [routePair.origin.lng, routePair.origin.lat],
          [routePair.destination.lng, routePair.destination.lat],
          { units: 'miles' }
        );
        const durationMinutes = (distance / 60) * 60; // 60 mph average

        const trail = generateGPSTrail({
          truckId: truck.id,
          origin: routePair.origin,
          destination: routePair.destination,
          startTime,
          durationMinutes,
        });

        allLocations.push(...trail);
      }
    }

    console.log(`Generated ${allLocations.length} GPS location records for ${trucks.length} trucks`);

    // Batch insert with tenant context
    await tx.gPSLocation.createMany({
      data: allLocations.map(loc => ({ ...loc, tenantId })),
    });
  });
}
```

**Why this approach:**
- **Visual realism:** Smooth interpolated lines on map (not random scatter)
- **Zero cost:** No API calls to Google Maps or OSRM
- **Realistic metadata:** Speed varies along route, heading calculated from bearing
- **Deterministic:** Same input produces same output (for testing)
- **Follows existing RLS pattern:** Uses transaction with `set_config()` like v1.0 truck seeds

**Source:** [Turf.js along() documentation](https://turfjs.org/docs/api/along)

### Pattern 4: Idempotent Seed Scripts with Reset Flag

**What:** Seed scripts that can run multiple times without errors or duplicates, with optional full reset
**When to use:** Development environments with frequent database resets, CI/CD pipelines
**Trade-offs:** `upsert()` is slower than `createMany()` but safer; `skipDuplicates` fast but requires exact match

**Example:**

```typescript
// prisma/seed.ts (Main orchestrator)
import { PrismaClient } from '@prisma/client';
import { seedGPSLocations } from './seeds/gps-locations';
import { seedSafetyEvents } from './seeds/safety-events';
import { seedFuelRecords } from './seeds/fuel-records';

const prisma = new PrismaClient();

async function main() {
  // Check for reset flag (environment variable or CLI arg)
  const shouldReset = process.env.SEED_RESET === 'true' || process.argv.includes('--reset');

  if (shouldReset) {
    console.log('🗑️  Reset flag detected. Clearing all mock data...');

    await prisma.$transaction(async (tx) => {
      // Delete in reverse dependency order
      await tx.fuelRecord.deleteMany({});
      await tx.safetyEvent.deleteMany({});
      await tx.gPSLocation.deleteMany({});

      console.log('✓ Mock data cleared');
    });
  }

  // Fetch existing tenant (assume demo tenant exists)
  const tenant = await prisma.tenant.findFirst({
    where: { slug: 'demo' },
  });

  if (!tenant) {
    throw new Error('Demo tenant not found. Run base seeds first.');
  }

  // Fetch existing trucks (assume base seeds already created trucks)
  const trucks = await prisma.truck.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, odometer: true },
  });

  if (trucks.length === 0) {
    throw new Error('No trucks found for demo tenant. Run base seeds first.');
  }

  console.log(`📍 Seeding GPS locations for ${trucks.length} trucks...`);
  await seedGPSLocations(tenant.id, trucks);

  console.log('🚨 Seeding safety events...');
  // Fetch GPS locations to link safety events to specific trail points
  const gpsLocations = await prisma.gPSLocation.findMany({
    where: { tenantId: tenant.id },
    select: { id: true, truckId: true, latitude: true, longitude: true, timestamp: true },
  });
  await seedSafetyEvents(tenant.id, trucks, gpsLocations);

  console.log('⛽ Seeding fuel records...');
  await seedFuelRecords(tenant.id, trucks);

  console.log('✅ Fleet intelligence mock data seeded successfully');
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Usage:**
```bash
# Normal seeding (idempotent, skips existing data)
npx prisma db seed

# Full reset + reseed
SEED_RESET=true npx prisma db seed

# Or with CLI flag
npx prisma db seed -- --reset
```

**Alternative: Upsert approach (safer but slower)**

```typescript
// For smaller datasets where exact control needed
export async function seedFuelRecordsWithUpsert(tenantId: string, trucks: { id: string }[]) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

    for (const truck of trucks) {
      // Generate deterministic seed ID (truckId + date)
      const recordDate = new Date('2026-01-15');
      const uniqueId = `${truck.id}-${recordDate.toISOString().split('T')[0]}`;

      await tx.fuelRecord.upsert({
        where: { id: uniqueId },
        create: {
          id: uniqueId,
          tenantId,
          truckId: truck.id,
          fuelType: 'DIESEL',
          quantity: new Prisma.Decimal('120.50'),
          odometer: 50000,
          timestamp: recordDate,
        },
        update: {
          // Update existing record (e.g., adjust quantity)
          quantity: new Prisma.Decimal('120.50'),
        },
      });
    }
  });
}
```

**Recommendation for Phase 11:**
- Use `createMany()` for GPS locations (10K+ records, performance critical)
- Check for existing records before seeding (count existing GPS locations for tenant)
- Provide `--reset` flag for full cleanup
- Document in README: "Run `SEED_RESET=true npx prisma db seed` to regenerate all mock data"

**Source:** [Prisma Seeding Documentation](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding)

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using Google Maps Directions API for Mock Data Generation

**What people do:** Call Google Maps Directions API in seed script for every route to get exact road coordinates

```typescript
// BAD: API calls in seed script
for (const truck of trucks) {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?origin=${origin}&destination=${dest}&key=${API_KEY}`
  );
  const route = await response.json();
  // Extract coordinates from response.routes[0].overview_polyline.points
}
```

**Why it's wrong:**
- **Cost:** Google Maps Directions API costs $5/1000 requests after $200/month free tier. Seeding 30 trucks × 5 routes = 150 API calls. Running seeds 10 times in dev = 1,500 calls = $7.50. Over a month of development, easily exceeds free tier.
- **API key management:** Requires storing API key in environment, rotation if compromised, quota monitoring.
- **External dependency:** Seed script fails if API is down or rate limited.
- **Unnecessary for mock data:** Visual realism for development/demos doesn't require turn-by-turn accuracy.

**Do this instead:**

Use Turf.js `along()` to interpolate coordinates between origin/destination (see Pattern 3). Zero cost, no API dependency, sufficient realism for map visualization.

**When Google Maps IS appropriate:** Production feature where users input arbitrary addresses and need real navigation (Phase 12+ with real user-generated routes).

### Anti-Pattern 2: Random GPS Coordinates Without Route Structure

**What people do:** Generate random lat/lng pairs within a bounding box

```typescript
// BAD: Random scatter (looks unrealistic on map)
const locations = Array.from({ length: 1000 }, () => ({
  latitude: faker.location.latitude({ min: 33, max: 49 }),  // US bounds
  longitude: faker.location.longitude({ min: -125, max: -65 }),
  timestamp: faker.date.recent({ days: 30 }),
}));
```

**Why it's wrong:**
- **Visually nonsensical:** Map shows trucks "teleporting" randomly across the country
- **Breaks safety event context:** Safety events (harsh braking) should occur on routes, not in random desert locations
- **Fails fuel record logic:** Can't calculate realistic MPG if truck "moves" 2000 miles between readings with no fuel consumed

**Do this instead:**

Generate structured routes with interpolated waypoints (Pattern 3). Each route should:
- Start at a major city (warehouse/distribution center)
- End at another major city
- Have intermediate GPS points showing travel along that path
- Have safety events occurring ON that path (not random locations)
- Have fuel records at realistic intervals (every 200-400 miles)

### Anti-Pattern 3: Non-Idempotent Seed Scripts

**What people do:** Seed script fails on second run or creates duplicates

```typescript
// BAD: Creates duplicates on every run
await prisma.gPSLocation.createMany({
  data: locations,  // No duplicate checking
});
```

**Why it's wrong:**
- **Development friction:** Developers must manually clear database before every seed (or migration resets)
- **CI/CD failures:** Test pipelines break if seeds run twice
- **Duplicate data:** Charts show inflated counts (10K GPS points become 20K after second run)

**Do this instead:**

Check for existing data before seeding:

```typescript
// GOOD: Check before seeding
const existingCount = await prisma.gPSLocation.count({
  where: { tenantId },
});

if (existingCount > 0) {
  console.log(`⏭️  Skipping GPS seeding (${existingCount} records already exist)`);
  return;
}

// Seed only if empty
await prisma.gPSLocation.createMany({ data: locations });
```

**Or provide reset flag (Pattern 4):**

```typescript
if (process.env.SEED_RESET === 'true') {
  await prisma.gPSLocation.deleteMany({ where: { tenantId } });
}
await prisma.gPSLocation.createMany({ data: locations });
```

### Anti-Pattern 4: Sidebar Navigation as Client-Only State

**What people do:** Store sidebar collapse state in component state only (lost on refresh)

```typescript
// BAD: State resets on every page navigation or refresh
const [collapsed, setCollapsed] = useState(false);
```

**Why it's wrong:**
- **Poor UX:** User collapses sidebar, navigates to another page, sidebar re-expands
- **Preference not persisted:** User has to collapse sidebar every session

**Do this instead:**

Use shadcn/ui SidebarProvider which persists state to localStorage automatically:

```typescript
// GOOD: SidebarProvider handles persistence
<SidebarProvider>
  <Sidebar />
  <main>{children}</main>
</SidebarProvider>
```

**Source:** [shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/radix/sidebar)

### Anti-Pattern 5: Breaking RLS Transaction Context in Seed Scripts

**What people do:** Create records outside of RLS transaction (no tenant context set)

```typescript
// BAD: No RLS context set
await prisma.gPSLocation.createMany({
  data: locations.map(loc => ({ ...loc, tenantId })),  // RLS policy BLOCKS this
});
```

**Why it's wrong:**
- **RLS policy violation:** `current_setting('app.current_tenant_id')` returns NULL, policy check fails
- **Silent failures:** Prisma may not throw clear error, records just don't insert
- **Bypasses isolation:** If RLS is disabled accidentally, creates data without proper tenant association

**Do this instead:**

Wrap all seed operations in transaction with `set_config()` (SAME PATTERN as v1.0 seeds):

```typescript
// GOOD: Set RLS context in transaction (v1.0 pattern)
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

  await tx.gPSLocation.createMany({
    data: locations.map(loc => ({ ...loc, tenantId })),
  });
});
```

**Critical verification:** After seeding, test cross-tenant isolation:

```typescript
// Verify: Query with different tenant context returns 0 results
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${differentTenantId}, TRUE)`;

  const count = await tx.gPSLocation.count();
  if (count > 0) {
    throw new Error('RLS VIOLATION: Cross-tenant data leak detected!');
  }
});
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| GPS coordinate interpolation | Custom linear interpolation math | Turf.js `along()` and `lineString()` | Turf handles spherical geometry (great-circle distance), avoids lat/lng edge cases (antimeridian crossing), battle-tested library |
| Realistic mock data generation | Custom random generators | @faker-js/faker with domain-specific methods | Faker has built-in generators for coordinates, timestamps, VINs, names with realistic distributions (not just random strings) |
| Collapsible sidebar navigation | Custom useState + CSS transitions | shadcn/ui Sidebar component | Shadcn handles keyboard shortcuts (Cmd+B), mobile responsive behavior, localStorage persistence, accessibility (ARIA attributes) |
| Distance calculations | Pythagorean theorem on lat/lng | Turf.js `distance()` with great-circle | Lat/lng are NOT Cartesian coordinates. At high latitudes, 1° longitude ≠ 1° latitude in miles. Turf uses Haversine formula for accurate spherical distance. |
| Sidebar collapse state persistence | Custom localStorage hooks | SidebarProvider (built-in to shadcn) | Provider handles serialization, hydration, SSR compatibility, cache invalidation automatically |

**Key insight:** For geospatial operations (GPS data, routes, distances), ALWAYS use a library (Turf.js, geopy). Lat/lng math has edge cases (poles, antimeridian, spherical geometry) that break naive implementations.

## Common Pitfalls

### Pitfall 1: GPS Coordinates as Float Instead of Decimal

**What goes wrong:** Storing GPS coordinates as PostgreSQL `FLOAT` or JavaScript `number` causes drift over time

**Why it happens:**
- Floats use binary representation (IEEE 754)
- Lat/lng values like 37.7749 have rounding errors in binary
- After repeated reads/writes, coordinates "drift" (37.7749 → 37.77490234375 → 37.77490356...)
- On a map, truck appears to move when it's stationary

**How to avoid:**
```prisma
// WRONG
latitude  Float  // Binary float, rounding errors

// CORRECT
latitude  Decimal  @db.Decimal(10, 8)  // Exact decimal storage, 8 decimal places = ~1.1mm accuracy
```

**In JavaScript:**
```typescript
// WRONG
const lat = 37.7749;  // JavaScript number (binary float)

// CORRECT
import { Prisma } from '@prisma/client';
const lat = new Prisma.Decimal('37.7749');  // Exact decimal
```

**Warning signs:**
- GPS coordinates change when no updates occurred
- Map markers "jitter" or move slightly on re-render
- Distance calculations between same points return different values

**Source:** [PostgreSQL Numeric Types Documentation](https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-NUMERIC-DECIMAL)

### Pitfall 2: Forgetting Composite Indexes for Time-Range Queries

**What goes wrong:** Dashboard queries (`WHERE tenantId = X AND timestamp > Y`) become slow as data grows

**Why it happens:**
- Single-column index on `tenantId` requires full table scan of tenant's rows to filter by timestamp
- Single-column index on `timestamp` requires scanning all tenants' data to filter by tenantId
- PostgreSQL can't efficiently combine both conditions

**How to avoid:**
```sql
-- WRONG: Only single-column indexes
CREATE INDEX "GPSLocation_tenantId_idx" ON "GPSLocation"("tenantId");
CREATE INDEX "GPSLocation_timestamp_idx" ON "GPSLocation"("timestamp");

-- CORRECT: Composite index for common query pattern
CREATE INDEX "GPSLocation_tenantId_timestamp_idx" ON "GPSLocation"("tenantId", "timestamp");
```

**Query pattern that benefits:**
```sql
-- Dashboard query: "Show GPS locations for my fleet in last 24 hours"
SELECT * FROM "GPSLocation"
WHERE "tenantId" = 'abc123'
  AND "timestamp" >= NOW() - INTERVAL '24 hours'
ORDER BY "timestamp" DESC;

-- With composite index: Index scan (fast)
-- Without composite index: Sequential scan of all tenant rows (slow)
```

**Warning signs:**
- Dashboard loads quickly with 100 GPS records, slows to 5+ seconds at 10K records
- EXPLAIN ANALYZE shows "Seq Scan" instead of "Index Scan"
- Database CPU spikes when viewing dashboards

**Verify index usage:**
```sql
EXPLAIN ANALYZE
SELECT * FROM "GPSLocation"
WHERE "tenantId" = 'abc123'
  AND "timestamp" >= NOW() - INTERVAL '24 hours';

-- Should show: Index Scan using GPSLocation_tenantId_timestamp_idx
```

### Pitfall 3: Seed Scripts Assuming Empty Database

**What goes wrong:** Seed script fails or creates duplicates when run after initial seeding

**Why it happens:**
- Developer runs `npx prisma db seed` twice during development
- CI/CD pipeline runs seeds multiple times (after each migration)
- Unique constraints fail (`ERROR: duplicate key value violates unique constraint`)

**How to avoid:**

**Option 1: Check before seeding**
```typescript
const existingCount = await prisma.gPSLocation.count({ where: { tenantId } });
if (existingCount > 0) {
  console.log(`⏭️  Skipping (${existingCount} records exist)`);
  return;
}
```

**Option 2: Use upsert for deterministic IDs**
```typescript
await prisma.fuelRecord.upsert({
  where: { id: `${truckId}-2026-01-15` },  // Deterministic ID
  create: { /* data */ },
  update: { /* data */ },
});
```

**Option 3: Provide reset flag**
```typescript
if (process.env.SEED_RESET === 'true') {
  await prisma.gPSLocation.deleteMany({ where: { tenantId } });
}
```

**Warning signs:**
- Error: "duplicate key value violates unique constraint"
- Dashboard shows 2x expected data (20 trucks become 40 after second seed)
- Test failures due to unexpected record counts

### Pitfall 4: Sidebar Navigation Without Mobile Responsive Behavior

**What goes wrong:** Sidebar overlays content on mobile, making app unusable

**Why it happens:**
- Desktop sidebar uses `position: fixed` with `left: 0`
- On mobile (narrow screens), fixed sidebar covers main content
- No collapse/drawer behavior for small screens

**How to avoid:**

Use shadcn/ui SidebarProvider which handles responsive behavior automatically:

```typescript
// CORRECT: SidebarProvider detects screen size and switches modes
<SidebarProvider>
  <Sidebar />  {/* Persistent sidebar on desktop */}
  <main>{children}</main>
</SidebarProvider>

// On mobile (<768px): Sidebar becomes drawer (offcanvas)
// On desktop (≥768px): Sidebar is persistent with collapse toggle
```

**Manual responsive handling (if not using shadcn):**
```typescript
// Fallback approach if custom sidebar
const [mobileOpen, setMobileOpen] = useState(false);
const isMobile = useMediaQuery('(max-width: 768px)');

return (
  <>
    {isMobile ? (
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent side="left">
          <SidebarContent />
        </SheetContent>
      </Sheet>
    ) : (
      <aside className="fixed left-0 h-screen">
        <SidebarContent />
      </aside>
    )}
  </>
);
```

**Warning signs:**
- App works on desktop but unusable on mobile
- Content hidden behind sidebar on phone/tablet
- No way to access main content on small screens

**Test checklist:**
- [ ] Desktop (1920px): Sidebar visible, collapsible
- [ ] Tablet (768px): Sidebar switches to drawer
- [ ] Mobile (375px): Drawer opens on hamburger click, closes after navigation

### Pitfall 5: Not Validating GPS Coordinate Ranges

**What goes wrong:** Invalid coordinates (lat > 90, lng > 180) inserted into database, break map rendering

**Why it happens:**
- Faker.js `latitude()` can generate edge cases (exactly 90.00000000)
- Coordinate calculations produce values outside valid range
- No database constraint or validation

**How to avoid:**

**Database constraint:**
```sql
ALTER TABLE "GPSLocation"
  ADD CONSTRAINT valid_latitude CHECK (latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT valid_longitude CHECK (longitude BETWEEN -180 AND 180);
```

**Zod validation in seed script:**
```typescript
import { z } from 'zod';

const GPSCoordinateSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

// Validate before inserting
const coord = {
  latitude: parseFloat(lat.toFixed(8)),
  longitude: parseFloat(lng.toFixed(8)),
};

GPSCoordinateSchema.parse(coord);  // Throws if invalid
```

**Clamp values in generation:**
```typescript
const latitude = Math.max(-90, Math.min(90, calculatedLat));
const longitude = Math.max(-180, Math.min(180, calculatedLng));
```

**Warning signs:**
- Leaflet map shows error: "Invalid LatLng object"
- Map doesn't render or shows blank tiles
- Database insert fails with constraint violation

## Code Examples

### Example 1: Complete Sidebar Navigation with Role-Based Menu Items

```typescript
// src/components/navigation/sidebar.tsx
"use client"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar"
import {
  LayoutDashboard,
  MapPin,
  Shield,
  Fuel,
  Truck,
  Users,
  Route as RouteIcon,
  Wrench,
  Settings,
  LogOut,
} from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useUser } from '@clerk/nextjs'
import { UserRole } from '@/lib/auth/roles'

export function AppSidebar() {
  const pathname = usePathname()
  const { user } = useUser()

  const isActive = (path: string) => pathname === path
  const userRole = user?.publicMetadata?.role as UserRole

  // Role-based menu filtering
  const showFleetIntelligence = [UserRole.OWNER, UserRole.MANAGER].includes(userRole)
  const showFleetManagement = [UserRole.OWNER, UserRole.MANAGER].includes(userRole)

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <Truck className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col group-data-[state=collapsed]:hidden">
            <span className="font-semibold text-sm">DriveCommand</span>
            <span className="text-xs text-muted-foreground">{user?.organizationMemberships[0]?.organization.name}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Dashboard (always visible) */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive('/dashboard')}>
                <Link href="/dashboard">
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Dashboard</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>

        {/* Fleet Intelligence (Owner/Manager only) */}
        {showFleetIntelligence && (
          <SidebarGroup>
            <SidebarGroupLabel>Fleet Intelligence</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/live-map')}>
                    <Link href="/live-map">
                      <MapPin className="w-4 h-4" />
                      <span>Live Map</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/safety')}>
                    <Link href="/safety">
                      <Shield className="w-4 h-4" />
                      <span>Safety</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/fuel')}>
                    <Link href="/fuel">
                      <Fuel className="w-4 h-4" />
                      <span>Fuel</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Fleet Management (Owner/Manager only) */}
        {showFleetManagement && (
          <SidebarGroup>
            <SidebarGroupLabel>Fleet Management</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/trucks')}>
                    <Link href="/trucks">
                      <Truck className="w-4 h-4" />
                      <span>Trucks</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/drivers')}>
                    <Link href="/drivers">
                      <Users className="w-4 h-4" />
                      <span>Drivers</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={isActive('/routes')}>
                    <Link href="/routes">
                      <RouteIcon className="w-4 h-4" />
                      <span>Routes</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {/* Maintenance */}
        <SidebarGroup>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton asChild isActive={isActive('/maintenance')}>
                <Link href="/maintenance">
                  <Wrench className="w-4 h-4" />
                  <span>Maintenance</span>
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link href="/settings">
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}
```

**Source:** [shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/radix/sidebar)

### Example 2: Complete GPS Trail Generation with Safety Event Linking

```typescript
// prisma/seeds/safety-events.ts
import { PrismaClient, Prisma, SafetyEventType, SafetyEventSeverity } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

/**
 * Generate safety events linked to specific GPS locations on routes
 * Creates realistic safety events (harsh braking, speeding) at actual GPS coordinates
 */
export async function seedSafetyEvents(
  tenantId: string,
  trucks: { id: string }[],
  gpsLocations: { id: string; truckId: string; latitude: Prisma.Decimal; longitude: Prisma.Decimal; timestamp: Date }[]
) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

    const events: Prisma.SafetyEventCreateManyInput[] = [];

    for (const truck of trucks) {
      // Get GPS locations for this truck
      const truckLocations = gpsLocations.filter(loc => loc.truckId === truck.id);

      if (truckLocations.length === 0) continue;

      // Generate 5-15 random safety events per truck
      const eventCount = faker.number.int({ min: 5, max: 15 });

      for (let i = 0; i < eventCount; i++) {
        // Pick random GPS location from truck's route
        const randomLocation = faker.helpers.arrayElement(truckLocations);

        // Pick random event type
        const eventType = faker.helpers.arrayElement([
          SafetyEventType.HARSH_BRAKING,
          SafetyEventType.HARSH_ACCELERATION,
          SafetyEventType.HARSH_CORNERING,
          SafetyEventType.SPEEDING,
        ]);

        // Severity correlated with event type
        const severity = eventType === SafetyEventType.SPEEDING
          ? faker.helpers.arrayElement([SafetyEventSeverity.MEDIUM, SafetyEventSeverity.HIGH, SafetyEventSeverity.CRITICAL])
          : faker.helpers.arrayElement([SafetyEventSeverity.LOW, SafetyEventSeverity.MEDIUM, SafetyEventSeverity.HIGH]);

        // G-force for braking/acceleration events
        const gForce = [SafetyEventType.HARSH_BRAKING, SafetyEventType.HARSH_ACCELERATION].includes(eventType)
          ? new Prisma.Decimal(faker.number.float({ min: 0.5, max: 2.5 }).toFixed(2))  // 0.5-2.5 G
          : null;

        // Speed and speed limit for speeding events
        const speed = faker.number.int({ min: 45, max: 95 });
        const speedLimit = eventType === SafetyEventType.SPEEDING
          ? faker.number.int({ min: 55, max: 75 })  // Posted limit lower than speed
          : null;

        events.push({
          tenantId,
          truckId: truck.id,
          driverId: null,  // Could link to driver if route assignment exists
          routeId: null,
          eventType,
          severity,
          gForce,
          speed,
          speedLimit,
          latitude: randomLocation.latitude,
          longitude: randomLocation.longitude,
          timestamp: randomLocation.timestamp,
          metadata: {
            // Example: dashcam screenshot URL, full telemetry snapshot
            context: faker.helpers.arrayElement(['Highway', 'City streets', 'Residential', 'Interstate']),
          },
        });
      }
    }

    console.log(`Generated ${events.length} safety events for ${trucks.length} trucks`);

    await tx.safetyEvent.createMany({
      data: events,
    });
  });
}
```

### Example 3: Fuel Record Generation with Realistic Odometer Progression

```typescript
// prisma/seeds/fuel-records.ts
import { PrismaClient, Prisma, FuelType } from '@prisma/client';
import { faker } from '@faker-js/faker';

const prisma = new PrismaClient();

/**
 * Generate fuel records with realistic odometer progression
 * Simulates fill-ups every 200-400 miles based on starting odometer
 */
export async function seedFuelRecords(
  tenantId: string,
  trucks: { id: string; odometer: number }[]
) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;

    const allRecords: Prisma.FuelRecordCreateManyInput[] = [];

    for (const truck of trucks) {
      // Generate 8-12 fill-ups over last 30 days
      const fillUpCount = faker.number.int({ min: 8, max: 12 });

      let currentOdometer = truck.odometer;

      for (let i = 0; i < fillUpCount; i++) {
        // Miles driven since last fill-up (200-400 miles)
        const milesSinceLastFill = faker.number.int({ min: 200, max: 400 });
        currentOdometer += milesSinceLastFill;

        // Diesel fuel fill-up (50-150 gallons)
        const gallons = faker.number.float({ min: 50, max: 150, precision: 0.1 });

        // Realistic diesel prices: $3.20-$4.50/gallon
        const pricePerGallon = faker.number.float({ min: 3.20, max: 4.50, precision: 0.0001 });

        const totalCost = gallons * pricePerGallon;

        // Fill-up timestamp (distributed over last 30 days)
        const daysAgo = Math.floor((fillUpCount - i) * (30 / fillUpCount));
        const timestamp = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

        allRecords.push({
          tenantId,
          truckId: truck.id,
          fuelType: FuelType.DIESEL,
          quantity: new Prisma.Decimal(gallons.toFixed(2)),
          unitCost: new Prisma.Decimal(pricePerGallon.toFixed(4)),
          totalCost: new Prisma.Decimal(totalCost.toFixed(2)),
          odometer: currentOdometer,
          location: faker.helpers.arrayElement([
            'Love\'s Travel Stop',
            'Pilot Flying J',
            'TA Petro',
            'Shell',
            'Chevron',
          ]),
          timestamp,
          isEstimated: false,
          notes: null,
        });
      }
    }

    console.log(`Generated ${allRecords.length} fuel records for ${trucks.length} trucks`);

    await tx.fuelRecord.createMany({
      data: allRecords,
    });
  });
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Top navigation bar | Samsara-style collapsible sidebar | 2024 | Industry standard for fleet/logistics dashboards (Samsara, Motive, Geotab all use sidebar). More menu items fit, better grouping, persistent collapse state. |
| Google Maps API for all mapping | Leaflet for basic maps, Google Maps only when needed | 2023-2024 | Leaflet is free and open-source, sufficient for fleet tracking. Save Google Maps budget for geocoding/directions. |
| Random mock data generation | Structured, correlated mock data (GPS trails → safety events → fuel records) | Ongoing | Modern dashboards need realistic data for validation. Random scatter doesn't test edge cases or visual quality. |
| Manual localStorage state management | shadcn/ui SidebarProvider with built-in persistence | 2024 | Provider pattern handles serialization, SSR hydration, mobile responsive automatically. |
| Float for coordinates | Decimal for coordinates | Always (best practice) | Float drift causes GPS "jitter" over time. Decimal ensures exact storage. |

**Deprecated/outdated:**
- **Google Maps JavaScript API v2:** Deprecated 2010, removed 2013. Use v3 or Leaflet.
- **react-leaflet v3:** Use v5+ (released 2024) for React 19 compatibility.
- **faker (old npm package):** Abandoned 2020, security vulnerabilities. Use @faker-js/faker (active fork).
- **Top-nav only dashboards:** Modern fleet dashboards (Samsara, Motive) all use sidebar navigation for better information density.

## Open Questions

1. **GPS Trail Realism vs Cost**
   - What we know: Google Maps Directions API provides actual road-following routes ($5/1000 requests after free tier), OSRM is free but requires self-hosting, Turf.js interpolation is free but less realistic.
   - What's unclear: User preference between "perfect realism" (Google Maps) vs "good enough" (Turf.js) for v2.0 mock data.
   - Recommendation: Start with Turf.js interpolation for Phase 11 (zero cost, sufficient visual realism). If user feedback demands higher realism, add Google Maps API in Phase 12 when building actual live map with user-generated routes.

2. **Sidebar Collapse Behavior**
   - What we know: shadcn/ui Sidebar supports "offcanvas" (fully hidden), "icon" (icon rail), or "none" (no collapse) modes.
   - What's unclear: User preference between icon rail (Samsara pattern: shows icons only when collapsed) vs fully hidden (more screen space for map).
   - Recommendation: Default to "icon" mode (matches Samsara UX). User can configure in settings later if needed.

3. **Mock Data Volume**
   - What we know: 20-30 trucks × 5 routes × 1 point/minute × 360 minutes = ~36K-54K GPS records for 30 days.
   - What's unclear: Will seed script performance be acceptable (batch insert of 50K+ records), or should we reduce to 1 point every 5 minutes?
   - Recommendation: Start with 1 point/minute for realistic map trails (smooth lines). If seed script is too slow (>30 seconds), reduce to 1 point every 2-5 minutes in later optimization.

4. **Driver Portal Sidebar**
   - What we know: Driver portal currently has simple top nav (only sees assigned route).
   - What's unclear: Should driver portal adopt sidebar pattern (consistency) or keep top nav (simpler, fewer menu items)?
   - Recommendation: Keep driver portal with top nav for Phase 11 (drivers only need 2-3 menu items: My Route, Documents, Profile). Sidebar adds complexity without benefit for limited menu.

5. **System Admin Portal Sidebar**
   - What we know: System admin portal manages cross-tenant data (tenant list, suspend/delete).
   - What's unclear: Should system admin portal use sidebar (consistency) or stay separate (different user base, different needs)?
   - Recommendation: Keep system admin portal separate for Phase 11 (different route group, different layout). If user feedback requests consistency, unify in Phase 15 (polish phase).

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [shadcn/ui Sidebar Component](https://ui.shadcn.com/docs/components/radix/sidebar) - Official shadcn sidebar documentation (HIGH confidence)
- [Prisma Seeding Documentation](https://www.prisma.io/docs/orm/prisma-migrate/workflows/seeding) - Official Prisma seed script patterns (HIGH confidence)
- [Turf.js along() API](https://turfjs.org/docs/api/along) - Coordinate interpolation method (HIGH confidence)
- [Turf.js lineString() API](https://turfjs.org/docs/api/line-string) - LineString creation (HIGH confidence)
- [@faker-js/faker Location API](https://fakerjs.dev/api/location) - GPS coordinate generation (HIGH confidence)
- [PostgreSQL Decimal Type](https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-NUMERIC-DECIMAL) - Why Decimal over Float for coordinates (HIGH confidence)

**Stack Documentation (from STACK.md):**
- Lucide React, Recharts, date-fns already documented in STACK.md (HIGH confidence)
- shadcn/ui Sidebar component added in 2024, included in STACK.md (HIGH confidence)

### Secondary (MEDIUM confidence)

**Comparison Articles:**
- [The true cost of the Google Maps API and how Radar compares in 2026](https://radar.com/blog/google-maps-api-cost) - Pricing comparison (MEDIUM confidence)
- [Google Maps Platform Pricing](https://mapsplatform.google.com/pricing/) - Official pricing (HIGH confidence)
- [OSRM vs Google Maps](https://stackshare.io/stackups/google-maps-vs-osrm) - Feature comparison (MEDIUM confidence)
- [Leaving Google Maps? Use OSRM for Routing](https://janakachathuranga.medium.com/leaving-google-maps-use-osrm-for-routing-aa1afc912df3) - Migration guide (MEDIUM confidence)

**Geospatial Programming:**
- [Turf.js Official Site](https://turfjs.org/) - Geospatial toolkit overview (HIGH confidence)
- [IPython Cookbook: Creating a route planner for a road network](https://ipython-books.github.io/147-creating-a-route-planner-for-a-road-network/) - Route planning concepts (MEDIUM confidence)

**UI/UX Patterns:**
- [Meet the New Samsara Platform Experience](https://www.samsara.com/blog/meet-the-new-samsara-platform-experience) - Samsara sidebar design reference (HIGH confidence)
- [Dashboard Menus – Samsara Help Center](https://kb.samsara.com/hc/en-us/articles/4404415451149-Dashboard-Menus) - Samsara navigation documentation (HIGH confidence)
- [Using the new Shadcn Sidebar](https://www.achromatic.dev/blog/shadcn-sidebar) - Implementation guide (MEDIUM confidence)

**Mock Data & Seeding:**
- [Prisma Fake Data: The Ultimate Guide to Flawless Seeding](https://researchhub.blog/prisma-fake-data-ultimate-guide-seeding) - Seeding best practices (MEDIUM confidence)
- [How to Reset Your PostgreSQL Database Using Prisma](https://medium.com/@ayiaware/how-to-reset-your-postgresql-database-using-prisma-in-early-development-b36831b0f32b) - Reset patterns (MEDIUM confidence)

### Tertiary (LOW confidence)

**Community Examples (needs verification):**
- [GitHub: shadcn-ui-sidebar](https://github.com/salimi-my/shadcn-ui-sidebar) - Community sidebar example (LOW confidence, verify against official docs)
- Various Medium articles on GPS data generation (LOW confidence, cross-reference with official Turf.js docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All libraries already installed (shadcn, Faker.js verified in STACK.md) or well-documented (Turf.js official docs)
- Architecture: HIGH - Extends existing v1.0 RLS patterns, sidebar component official from shadcn
- Mock data generation: MEDIUM-HIGH - Turf.js interpolation verified in official docs, but not previously used in project
- GPS realism trade-offs: MEDIUM - Google Maps pricing verified, but optimal approach depends on user tolerance for cost vs realism

**Research date:** 2026-02-15
**Valid until:** 60 days (stable domains: sidebar UI patterns, Prisma seeding, geospatial libraries)

**Areas requiring validation during planning:**
- User preference for GPS realism (Google Maps API vs Turf.js interpolation)
- Sidebar collapse behavior (icon rail vs fully hidden)
- Mock data volume (1 point/minute vs 1 point/5 minutes for performance)
- Driver/admin portal sidebar adoption (consistency vs simplicity)
