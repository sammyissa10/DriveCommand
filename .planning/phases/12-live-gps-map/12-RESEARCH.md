# Phase 12: Live GPS Map - Research

**Researched:** 2026-02-15
**Domain:** Interactive GPS mapping with Leaflet + React-Leaflet in Next.js 15 App Router
**Confidence:** HIGH

## Summary

Phase 12 builds the Live GPS Map page showing real-time fleet vehicle locations with interactive markers, route history trails, and vehicle detail sidebars. The implementation uses React-Leaflet 5.x (wraps Leaflet 1.9.x) loaded via Next.js dynamic import with `ssr: false` to avoid hydration errors. Vehicle markers use color-coded DivIcons (green/yellow/red for moving/idle/offline status) with react-leaflet-cluster for automatic marker grouping at high zoom-out levels (20+ vehicles). Route history displays as Polyline breadcrumb trails showing past 24 hours of GPS data from the existing GPSLocation table (seeded in Phase 11). The detail sidebar uses shadcn/ui Sheet component with vehicle diagnostics pulled from the latest GPS record. Real-time updates use client-side polling (30-second intervals with router.refresh()) instead of WebSockets due to Vercel serverless constraints.

**Critical insight:** Leaflet requires browser APIs (window, document) that don't exist during Next.js server-side rendering. The standard solution is NOT to wrap the entire page component in dynamic import, but to create a separate client component for the map itself and import that with `ssr: false`. This allows the page layout (header, sidebar navigation) to SSR normally while only the map renders client-side. Additionally, Leaflet CSS must be imported in a client component or global stylesheet—importing in a server component causes build errors.

**Primary recommendation:** Create a client component `<LiveMap>` in `src/components/maps/live-map.tsx` that imports Leaflet and React-Leaflet. The page component (`app/(owner)/live-map/page.tsx`) dynamically imports this with `ssr: false` and passes GPS data fetched via server action. Use `L.divIcon()` for vehicle markers (not image icons) to enable dynamic color coding via CSS classes. Implement marker clustering with react-leaflet-cluster (handles 50K+ markers efficiently). Store selected vehicle ID in client state and fetch vehicle details via server action when marker is clicked. Poll for GPS updates every 30 seconds using `useEffect` interval + `router.refresh()` pattern. Use Turf.js `bbox()` to calculate initial map bounds from all vehicle positions, then call `map.fitBounds()` on mount.

## Standard Stack

### Core (Already Installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Next.js | 15.x | Framework with App Router | Server components, dynamic imports with ssr control |
| shadcn/ui | Latest | Component library | Sheet component for vehicle detail sidebar (already used in Phase 11) |
| Prisma | 7.x | ORM with RLS | GPSLocation queries with tenant isolation (already configured) |
| @turf/turf | 7.x | Geospatial calculations | bbox() for map bounds, distance() for clustering (installed in Phase 11) |

### New Dependencies
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| leaflet | 1.9.x | Core mapping library | Industry standard open-source map library, 38K+ stars, zero API costs for basic usage |
| react-leaflet | 5.x | React bindings for Leaflet | Official React wrapper, v5 supports React 19 + Next.js 15, declarative component API |
| react-leaflet-cluster | 3.x | Marker clustering | Handles 50K+ markers efficiently, automatic clustering/unclustering on zoom, TypeScript support |
| @types/leaflet | 1.9.x | TypeScript definitions | Type safety for Leaflet API |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Leaflet | Google Maps JavaScript API | Google Maps costs $7/1000 map loads after $200/month free tier. Fleet maps with 10+ users viewing daily = $200+/month. Leaflet is free, sufficient for vehicle tracking. Google Maps appropriate when geocoding/directions needed (Phase 13+). |
| Leaflet | Mapbox GL JS | Mapbox costs $5/1000 map sessions after 50K/month free tier. Pricing similar to Google. Mapbox has better 3D/vector tiles, but overkill for 2D fleet tracking. |
| react-leaflet-cluster | Manual clustering logic | Manual clustering requires quadtree data structure, zoom-level calculations, viewport clipping. react-leaflet-cluster handles all edge cases (10K+ markers, mobile perf, cluster splitting). |
| Client-side polling | WebSockets (Socket.io) | WebSockets require stateful server (incompatible with Vercel serverless). Polling at 30s intervals sufficient for "live" GPS (hardware reports every 1-5 min anyway). For dedicated hosting, WebSockets reduce latency. |
| DivIcon markers | Image icon markers (PNG/SVG) | Image icons require separate files for each status (moving.png, idle.png, offline.png). DivIcon uses CSS classes for color, single icon component. Easier maintenance. |

**Installation:**
```bash
# NEW: Mapping libraries
npm install leaflet@^1.9.0 react-leaflet@^5.0.0 react-leaflet-cluster@^3.0.0

# NEW: TypeScript definitions
npm install -D @types/leaflet@^1.9.0
```

## Architecture Patterns

### Recommended Project Structure
```
src/
├── app/
│   └── (owner)/
│       └── live-map/
│           ├── page.tsx                [NEW: Server component, fetches initial GPS data]
│           └── actions.ts              [NEW: Server actions for GPS queries]
├── components/
│   ├── maps/
│   │   ├── live-map.tsx               [NEW: Client component with Leaflet map]
│   │   ├── vehicle-marker.tsx         [NEW: DivIcon marker component]
│   │   └── route-history-layer.tsx   [NEW: Polyline layer for GPS trails]
│   └── vehicle/
│       └── vehicle-details-sheet.tsx  [NEW: Sheet sidebar with diagnostics]
├── lib/
│   ├── maps/
│   │   ├── vehicle-status.ts          [NEW: Status calculation (moving/idle/offline)]
│   │   └── map-utils.ts               [NEW: fitBounds helper, marker color logic]
│   └── db/
│       └── repositories/
│           └── gps.repository.ts      [EXISTING: From Phase 11]
public/
└── leaflet/                            [NEW: Leaflet CSS and marker assets]
    ├── leaflet.css                     [COPY: From node_modules/leaflet/dist]
    └── images/                         [COPY: Default marker icons if needed]
```

### Pattern 1: Leaflet in Next.js 15 App Router with Dynamic Import

**What:** Load Leaflet map as client component via dynamic import to avoid SSR hydration errors
**When to use:** Any Leaflet usage in Next.js App Router (Leaflet requires browser APIs)
**Example:**

```typescript
// src/app/(owner)/live-map/page.tsx (SERVER COMPONENT)
import { Suspense } from 'react'
import dynamic from 'next/dynamic'
import { getLatestVehicleLocations } from './actions'

// Dynamic import with ssr: false (CRITICAL for Leaflet)
const LiveMap = dynamic(
  () => import('@/components/maps/live-map'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen">
        <div className="text-muted-foreground">Loading map...</div>
      </div>
    )
  }
)

export default async function LiveMapPage() {
  // Fetch initial GPS data in server component
  const vehicles = await getLatestVehicleLocations()

  return (
    <div className="h-screen flex flex-col">
      <header className="border-b p-4">
        <h1 className="text-2xl font-bold">Live Fleet Map</h1>
      </header>
      <div className="flex-1 relative">
        <Suspense fallback={<div>Loading...</div>}>
          <LiveMap initialVehicles={vehicles} />
        </Suspense>
      </div>
    </div>
  )
}
```

```typescript
// src/components/maps/live-map.tsx (CLIENT COMPONENT)
'use client'

import { useEffect, useState } from 'react'
import { MapContainer, TileLayer, useMap } from 'react-leaflet'
import MarkerClusterGroup from 'react-leaflet-cluster'
import { useRouter } from 'next/navigation'
import * as turf from '@turf/turf'
import 'leaflet/dist/leaflet.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'

interface Vehicle {
  id: string
  truckId: string
  latitude: number
  longitude: number
  speed: number | null
  heading: number | null
  timestamp: Date
  truck: {
    make: string
    model: string
    licensePlate: string
  }
}

interface LiveMapProps {
  initialVehicles: Vehicle[]
}

function FitBoundsOnMount({ vehicles }: { vehicles: Vehicle[] }) {
  const map = useMap()

  useEffect(() => {
    if (vehicles.length === 0) return

    // Calculate bounding box from all vehicle positions
    const points = vehicles.map(v => [v.longitude, v.latitude])
    const bbox = turf.bbox(turf.featureCollection(
      points.map(p => turf.point(p))
    ))

    // Fit map to show all vehicles with padding
    map.fitBounds([
      [bbox[1], bbox[0]], // Southwest
      [bbox[3], bbox[2]]  // Northeast
    ], { padding: [50, 50], maxZoom: 15 })
  }, [map, vehicles])

  return null
}

export default function LiveMap({ initialVehicles }: LiveMapProps) {
  const router = useRouter()
  const [vehicles, setVehicles] = useState(initialVehicles)
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null)

  // Polling for real-time updates (30 second interval)
  useEffect(() => {
    const interval = setInterval(() => {
      // Trigger re-fetch via router refresh (Next.js 15 pattern)
      router.refresh()
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [router])

  // Update vehicles when server refresh occurs
  useEffect(() => {
    setVehicles(initialVehicles)
  }, [initialVehicles])

  // Default center (US center if no vehicles)
  const defaultCenter: [number, number] = [39.8283, -98.5795]

  return (
    <>
      <MapContainer
        center={vehicles.length > 0
          ? [vehicles[0].latitude, vehicles[0].longitude]
          : defaultCenter
        }
        zoom={6}
        style={{ height: '100%', width: '100%' }}
        className="z-0"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Fit bounds on mount */}
        <FitBoundsOnMount vehicles={vehicles} />

        {/* Marker clustering for 20+ vehicles */}
        <MarkerClusterGroup chunkedLoading>
          {vehicles.map(vehicle => (
            <VehicleMarker
              key={vehicle.id}
              vehicle={vehicle}
              onClick={() => setSelectedVehicleId(vehicle.truckId)}
            />
          ))}
        </MarkerClusterGroup>

        {/* Route history layer (separate component) */}
        {selectedVehicleId && (
          <RouteHistoryLayer truckId={selectedVehicleId} />
        )}
      </MapContainer>

      {/* Vehicle details sidebar */}
      {selectedVehicleId && (
        <VehicleDetailsSheet
          truckId={selectedVehicleId}
          open={!!selectedVehicleId}
          onClose={() => setSelectedVehicleId(null)}
        />
      )}
    </>
  )
}
```

**Why this approach:**
- Page component stays as server component (can use async/await for data fetching)
- Only map component loads client-side (reduces JavaScript bundle)
- Loading state shows immediately while Leaflet loads
- router.refresh() triggers server component re-render with fresh data
- No hydration mismatch errors

**Source:** [React Leaflet on Next.js 15 (App router)](https://xxlsteve.net/blog/react-leaflet-on-next-15/)

### Pattern 2: Color-Coded Vehicle Markers with DivIcon

**What:** Custom vehicle markers using Leaflet DivIcon with CSS classes for status colors
**When to use:** Dynamic marker styling based on data (status, speed, alerts)
**Example:**

```typescript
// src/components/maps/vehicle-marker.tsx
'use client'

import { Marker, Popup } from 'react-leaflet'
import { divIcon } from 'leaflet'
import { Truck } from 'lucide-react'
import { getVehicleStatus } from '@/lib/maps/vehicle-status'

interface VehicleMarkerProps {
  vehicle: {
    id: string
    truckId: string
    latitude: number
    longitude: number
    speed: number | null
    timestamp: Date
    truck: {
      make: string
      model: string
      licensePlate: string
    }
  }
  onClick: () => void
}

export function VehicleMarker({ vehicle, onClick }: VehicleMarkerProps) {
  const status = getVehicleStatus(vehicle.speed, vehicle.timestamp)

  // Status colors: green (moving), yellow (idle), red (offline)
  const statusColors = {
    moving: 'bg-green-500 border-green-700',
    idle: 'bg-yellow-500 border-yellow-700',
    offline: 'bg-red-500 border-red-700'
  }

  // Create DivIcon with dynamic color
  const icon = divIcon({
    html: `
      <div class="relative">
        <div class="w-10 h-10 rounded-full ${statusColors[status]} border-2 flex items-center justify-center shadow-lg">
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"></path>
            <path d="M15 18H9"></path>
            <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"></path>
            <circle cx="17" cy="18" r="2"></circle>
            <circle cx="7" cy="18" r="2"></circle>
          </svg>
        </div>
        ${vehicle.heading !== null ? `
          <div class="absolute -top-2 -right-2 w-4 h-4 bg-white rounded-full border border-gray-300 flex items-center justify-center"
               style="transform: rotate(${vehicle.heading}deg)">
            <div class="w-0 h-0 border-l-2 border-r-2 border-b-4 border-transparent border-b-blue-600"></div>
          </div>
        ` : ''}
      </div>
    `,
    className: 'vehicle-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  })

  return (
    <Marker
      position={[vehicle.latitude, vehicle.longitude]}
      icon={icon}
      eventHandlers={{
        click: onClick
      }}
    >
      <Popup>
        <div className="p-2">
          <h3 className="font-semibold">{vehicle.truck.make} {vehicle.truck.model}</h3>
          <p className="text-sm text-muted-foreground">{vehicle.truck.licensePlate}</p>
          <p className="text-xs mt-1">
            Status: <span className="font-medium">{status}</span>
          </p>
          {vehicle.speed !== null && (
            <p className="text-xs">Speed: {vehicle.speed} mph</p>
          )}
        </div>
      </Popup>
    </Marker>
  )
}
```

```typescript
// src/lib/maps/vehicle-status.ts
export type VehicleStatus = 'moving' | 'idle' | 'offline'

/**
 * Determine vehicle status based on speed and last GPS update time
 */
export function getVehicleStatus(
  speed: number | null,
  lastUpdate: Date
): VehicleStatus {
  const minutesSinceUpdate = (Date.now() - lastUpdate.getTime()) / (1000 * 60)

  // Offline if no GPS update in 10+ minutes
  if (minutesSinceUpdate > 10) {
    return 'offline'
  }

  // Idle if speed is 0 or null (stopped)
  if (speed === null || speed < 5) {
    return 'idle'
  }

  // Moving if speed >= 5 mph
  return 'moving'
}
```

**Why this approach:**
- DivIcon allows dynamic HTML/CSS (no image file management)
- Tailwind classes enable responsive color changes
- Heading arrow rotates based on vehicle.heading value
- Status logic centralized in utility function (testable)
- Popup shows quick info, click opens full sidebar

**Source:** [Creating Custom Styles Leaflet Icons With DivIcon and CSS](https://www.drupal.org/node/2554137)

### Pattern 3: Route History as Polyline Breadcrumb Trail

**What:** Display past 24 hours of GPS data as color-coded polyline trail
**When to use:** Show historical movement path for selected vehicle
**Example:**

```typescript
// src/components/maps/route-history-layer.tsx
'use client'

import { useEffect, useState } from 'react'
import { Polyline, Popup } from 'react-leaflet'
import { getVehicleRouteHistory } from '@/app/(owner)/live-map/actions'

interface RouteHistoryLayerProps {
  truckId: string
}

interface GPSPoint {
  latitude: number
  longitude: number
  speed: number | null
  timestamp: Date
}

export function RouteHistoryLayer({ truckId }: RouteHistoryLayerProps) {
  const [points, setPoints] = useState<GPSPoint[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadHistory() {
      setLoading(true)
      const history = await getVehicleRouteHistory(truckId, 24) // Last 24 hours
      setPoints(history)
      setLoading(false)
    }

    loadHistory()
  }, [truckId])

  if (loading || points.length === 0) {
    return null
  }

  // Convert points to Leaflet LatLng array
  const positions: [number, number][] = points.map(p => [p.latitude, p.longitude])

  // Color gradient based on speed (blue=slow, red=fast)
  const getSpeedColor = (speed: number | null) => {
    if (speed === null || speed < 10) return '#3b82f6' // Blue (slow/stopped)
    if (speed < 40) return '#eab308' // Yellow (moderate)
    if (speed < 60) return '#f97316' // Orange (fast)
    return '#ef4444' // Red (very fast)
  }

  // Group points into segments by speed for color coding
  const segments: { positions: [number, number][], color: string }[] = []
  let currentSegment: { positions: [number, number][], color: string } | null = null

  points.forEach((point, idx) => {
    const pos: [number, number] = [point.latitude, point.longitude]
    const color = getSpeedColor(point.speed)

    if (!currentSegment || currentSegment.color !== color) {
      // Start new segment
      if (currentSegment) {
        segments.push(currentSegment)
      }
      currentSegment = { positions: [pos], color }
    } else {
      // Add to current segment
      currentSegment.positions.push(pos)
    }
  })

  if (currentSegment) {
    segments.push(currentSegment)
  }

  return (
    <>
      {segments.map((segment, idx) => (
        <Polyline
          key={idx}
          positions={segment.positions}
          pathOptions={{
            color: segment.color,
            weight: 4,
            opacity: 0.7,
            lineCap: 'round',
            lineJoin: 'round'
          }}
        >
          <Popup>
            <div className="text-xs">
              <p>Route segment {idx + 1}</p>
              <p className="text-muted-foreground">
                {segment.positions.length} GPS points
              </p>
            </div>
          </Popup>
        </Polyline>
      ))}
    </>
  )
}
```

```typescript
// src/app/(owner)/live-map/actions.ts (Server Action)
'use server'

import { prisma } from '@/lib/db/client'
import { getCurrentTenantId } from '@/lib/auth/tenant'

export async function getVehicleRouteHistory(
  truckId: string,
  hoursBack: number = 24
) {
  const tenantId = await getCurrentTenantId()

  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000)

  const locations = await prisma.gPSLocation.findMany({
    where: {
      tenantId,
      truckId,
      timestamp: {
        gte: cutoffTime
      }
    },
    orderBy: {
      timestamp: 'asc'
    },
    select: {
      latitude: true,
      longitude: true,
      speed: true,
      timestamp: true
    }
  })

  return locations.map(loc => ({
    latitude: Number(loc.latitude),
    longitude: Number(loc.longitude),
    speed: loc.speed,
    timestamp: loc.timestamp
  }))
}
```

**Why this approach:**
- Color-coded segments show speed variation (blue=stopped, red=fast)
- Polyline weights and opacity balance visibility without cluttering
- Lazy-loaded (only when vehicle selected) to reduce initial render cost
- Server action handles RLS tenant isolation automatically
- GPS points ordered by timestamp for chronological path

**Source:** [Leaflet Polyline documentation](https://leafletjs.com/reference.html#polyline)

### Pattern 4: Vehicle Details Sheet with Real-Time Diagnostics

**What:** Slide-out sidebar showing vehicle diagnostics when marker clicked
**When to use:** Display detailed information without leaving map view
**Example:**

```typescript
// src/components/vehicle/vehicle-details-sheet.tsx
'use client'

import { useEffect, useState } from 'react'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import { getVehicleDiagnostics } from '@/app/(owner)/live-map/actions'
import { Fuel, Gauge, MapPin, Clock, Activity } from 'lucide-react'

interface VehicleDetailsSheetProps {
  truckId: string
  open: boolean
  onClose: () => void
}

interface VehicleDiagnostics {
  truck: {
    make: string
    model: string
    year: number
    licensePlate: string
    odometer: number
  }
  latestGPS: {
    latitude: number
    longitude: number
    speed: number | null
    heading: number | null
    timestamp: Date
  } | null
  latestFuel: {
    quantity: number
    timestamp: Date
  } | null
  engineState: 'running' | 'idle' | 'off'
  estimatedFuelLevel: number // Percentage 0-100
}

export function VehicleDetailsSheet({ truckId, open, onClose }: VehicleDetailsSheetProps) {
  const [diagnostics, setDiagnostics] = useState<VehicleDiagnostics | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!open) return

    async function loadDiagnostics() {
      setLoading(true)
      const data = await getVehicleDiagnostics(truckId)
      setDiagnostics(data)
      setLoading(false)
    }

    loadDiagnostics()

    // Refresh diagnostics every 30 seconds while sheet is open
    const interval = setInterval(loadDiagnostics, 30000)
    return () => clearInterval(interval)
  }, [truckId, open])

  if (loading || !diagnostics) {
    return (
      <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <div className="flex items-center justify-center h-full">
            <div className="text-muted-foreground">Loading vehicle data...</div>
          </div>
        </SheetContent>
      </Sheet>
    )
  }

  const { truck, latestGPS, latestFuel, engineState, estimatedFuelLevel } = diagnostics

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>
            {truck.make} {truck.model}
          </SheetTitle>
          <SheetDescription>
            {truck.year} • {truck.licensePlate}
          </SheetDescription>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Location */}
          {latestGPS && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="w-4 h-4" />
                Location
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Latitude</p>
                  <p className="font-mono">{latestGPS.latitude.toFixed(6)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Longitude</p>
                  <p className="font-mono">{latestGPS.longitude.toFixed(6)}</p>
                </div>
              </div>
              <div className="text-xs text-muted-foreground">
                <Clock className="w-3 h-3 inline mr-1" />
                Last update: {new Date(latestGPS.timestamp).toLocaleString()}
              </div>
            </div>
          )}

          {/* Speed & Heading */}
          {latestGPS && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Gauge className="w-4 h-4" />
                Movement
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="text-muted-foreground">Speed</p>
                  <p className="text-2xl font-bold">
                    {latestGPS.speed !== null ? `${latestGPS.speed} mph` : 'Stopped'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Heading</p>
                  <p className="text-2xl font-bold">
                    {latestGPS.heading !== null ? `${latestGPS.heading}°` : '—'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Engine State */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Activity className="w-4 h-4" />
              Engine
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${
                engineState === 'running' ? 'bg-green-500' :
                engineState === 'idle' ? 'bg-yellow-500' :
                'bg-red-500'
              }`} />
              <span className="text-sm capitalize">{engineState}</span>
            </div>
          </div>

          {/* Fuel Level */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Fuel className="w-4 h-4" />
              Fuel Level
            </div>
            <div className="space-y-1">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Estimated</span>
                <span className="font-bold">{estimatedFuelLevel}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    estimatedFuelLevel > 50 ? 'bg-green-500' :
                    estimatedFuelLevel > 25 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${estimatedFuelLevel}%` }}
                />
              </div>
              {latestFuel && (
                <p className="text-xs text-muted-foreground">
                  Last fill: {new Date(latestFuel.timestamp).toLocaleDateString()}
                  ({latestFuel.quantity.toFixed(1)} gal)
                </p>
              )}
            </div>
          </div>

          {/* Odometer */}
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm font-medium">
              Odometer
            </div>
            <p className="text-2xl font-bold">{truck.odometer.toLocaleString()} mi</p>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
```

```typescript
// src/app/(owner)/live-map/actions.ts (continued)
export async function getVehicleDiagnostics(truckId: string) {
  const tenantId = await getCurrentTenantId()

  const truck = await prisma.truck.findUnique({
    where: { id: truckId, tenantId },
    select: {
      make: true,
      model: true,
      year: true,
      licensePlate: true,
      odometer: true
    }
  })

  if (!truck) {
    throw new Error('Truck not found')
  }

  // Latest GPS location
  const latestGPS = await prisma.gPSLocation.findFirst({
    where: { tenantId, truckId },
    orderBy: { timestamp: 'desc' },
    select: {
      latitude: true,
      longitude: true,
      speed: true,
      heading: true,
      timestamp: true
    }
  })

  // Latest fuel record
  const latestFuel = await prisma.fuelRecord.findFirst({
    where: { tenantId, truckId },
    orderBy: { timestamp: 'desc' },
    select: {
      quantity: true,
      timestamp: true,
      odometer: true
    }
  })

  // Calculate engine state from speed
  const engineState = !latestGPS ? 'off' :
    (latestGPS.speed && latestGPS.speed > 5) ? 'running' :
    (latestGPS.speed !== null && latestGPS.speed > 0) ? 'idle' :
    'off'

  // Estimate fuel level (simplified: assumes 6 mpg, 150 gal tank)
  const MPG = 6
  const TANK_SIZE = 150
  const milesSinceLastFill = latestFuel
    ? truck.odometer - Number(latestFuel.odometer)
    : 0
  const estimatedGallonsUsed = milesSinceLastFill / MPG
  const estimatedGallonsRemaining = latestFuel
    ? Math.max(0, Number(latestFuel.quantity) - estimatedGallonsUsed)
    : TANK_SIZE / 2 // Default to 50% if no fuel record
  const estimatedFuelLevel = Math.round((estimatedGallonsRemaining / TANK_SIZE) * 100)

  return {
    truck,
    latestGPS: latestGPS ? {
      latitude: Number(latestGPS.latitude),
      longitude: Number(latestGPS.longitude),
      speed: latestGPS.speed,
      heading: latestGPS.heading,
      timestamp: latestGPS.timestamp
    } : null,
    latestFuel: latestFuel ? {
      quantity: Number(latestFuel.quantity),
      timestamp: latestFuel.timestamp
    } : null,
    engineState,
    estimatedFuelLevel
  }
}
```

**Why this approach:**
- Sheet component slides from right (mobile-friendly, doesn't hide map completely)
- Auto-refresh every 30 seconds while open (diagnostics stay current)
- Fuel level estimated based on odometer progression + last fill-up (realistic for v2.0 mock data)
- Engine state derived from speed (realistic heuristic: speed > 5 mph = running)
- Color-coded indicators (green/yellow/red) for quick status assessment

**Source:** [shadcn/ui Sheet component](https://www.shadcn.io/ui/sheet)

## Anti-Patterns to Avoid

### Anti-Pattern 1: Importing Leaflet in Server Component

**What people do:** Import Leaflet CSS or components in a server component

```typescript
// BAD: Server component importing Leaflet
// app/(owner)/live-map/page.tsx
import 'leaflet/dist/leaflet.css' // ERROR: Leaflet requires browser APIs
import { MapContainer } from 'react-leaflet'

export default async function LiveMapPage() {
  return <MapContainer>...</MapContainer>
}
```

**Why it's wrong:**
- Leaflet uses `window`, `document`, `navigator` which don't exist during SSR
- Next.js throws error: "ReferenceError: window is not defined"
- Build fails or produces hydration mismatch

**Do this instead:**

Create a separate client component for the map:

```typescript
// GOOD: Client component imports Leaflet
// components/maps/live-map.tsx
'use client'
import 'leaflet/dist/leaflet.css'
import { MapContainer } from 'react-leaflet'

export default function LiveMap() {
  return <MapContainer>...</MapContainer>
}

// Server component uses dynamic import
// app/(owner)/live-map/page.tsx
import dynamic from 'next/dynamic'

const LiveMap = dynamic(() => import('@/components/maps/live-map'), { ssr: false })

export default function LiveMapPage() {
  return <LiveMap />
}
```

**Source:** [How to use react-leaflet in Nextjs with TypeScript](https://andresmpa.medium.com/how-to-use-react-leaflet-in-nextjs-with-typescript-surviving-it-21a3379d4d18)

### Anti-Pattern 2: Using Image Icons Instead of DivIcon for Dynamic Markers

**What people do:** Create separate PNG/SVG files for each marker state

```typescript
// BAD: Separate images for each state
const movingIcon = L.icon({ iconUrl: '/markers/truck-green.png' })
const idleIcon = L.icon({ iconUrl: '/markers/truck-yellow.png' })
const offlineIcon = L.icon({ iconUrl: '/markers/truck-red.png' })

// Conditional rendering requires multiple components
{status === 'moving' && <Marker icon={movingIcon} />}
{status === 'idle' && <Marker icon={idleIcon} />}
{status === 'offline' && <Marker icon={offlineIcon} />}
```

**Why it's wrong:**
- Requires creating/maintaining 3+ image files
- Adding new status (e.g., "maintenance") requires new image
- Can't dynamically change color (must swap entire icon)
- Image load time affects map render performance

**Do this instead:**

Use DivIcon with CSS classes for dynamic styling:

```typescript
// GOOD: Single DivIcon with CSS classes
const icon = divIcon({
  html: `<div class="vehicle-marker ${statusColors[status]}">
    <svg>...</svg>
  </div>`,
  className: 'vehicle-marker-wrapper'
})

<Marker icon={icon} />
```

**When image icons ARE appropriate:** Static markers that never change (e.g., warehouse locations, gas stations).

### Anti-Pattern 3: Fetching GPS Data in Client Component

**What people do:** Fetch GPS data directly in the client component via API route

```typescript
// BAD: Client-side data fetching
'use client'
export default function LiveMap() {
  const [vehicles, setVehicles] = useState([])

  useEffect(() => {
    fetch('/api/gps/locations')
      .then(res => res.json())
      .then(setVehicles)
  }, [])

  return <MapContainer>...</MapContainer>
}
```

**Why it's wrong:**
- No server-side rendering (slower initial page load, poor SEO)
- Exposes API route that must duplicate RLS tenant isolation logic
- Client sees loading spinner instead of map with initial data
- Requires creating separate API route handler

**Do this instead:**

Fetch in server component, pass as props:

```typescript
// GOOD: Server component fetches data
// app/(owner)/live-map/page.tsx (server component)
export default async function LiveMapPage() {
  const vehicles = await getLatestVehicleLocations() // Server action

  return <LiveMap initialVehicles={vehicles} />
}

// components/maps/live-map.tsx (client component)
'use client'
export default function LiveMap({ initialVehicles }) {
  const [vehicles, setVehicles] = useState(initialVehicles)
  // Map renders immediately with data
  return <MapContainer>...</MapContainer>
}
```

**Benefits:** Initial data available on first render, RLS handled by server action automatically, no API route needed.

### Anti-Pattern 4: Not Using Marker Clustering for 20+ Vehicles

**What people do:** Render all markers individually without clustering

```typescript
// BAD: No clustering (20+ vehicles = cluttered map at high zoom-out)
{vehicles.map(v => <Marker key={v.id} position={[v.lat, v.lng]} />)}
```

**Why it's wrong:**
- Map becomes unreadable at low zoom (20+ markers overlap)
- Performance degrades with 50+ markers (each marker renders separately)
- User can't distinguish individual vehicles in dense areas

**Do this instead:**

Wrap markers in MarkerClusterGroup:

```typescript
// GOOD: Automatic clustering
<MarkerClusterGroup chunkedLoading>
  {vehicles.map(v => <Marker key={v.id} position={[v.lat, v.lng]} />)}
</MarkerClusterGroup>
```

**When clustering is NOT needed:** Fewer than 10 markers OR markers are always far apart (different cities).

**Source:** [react-leaflet-cluster npm](https://www.npmjs.com/package/react-leaflet-cluster)

### Anti-Pattern 5: Using WebSockets on Vercel Serverless

**What people do:** Implement Socket.io for real-time GPS updates

```typescript
// BAD: WebSocket on Vercel (doesn't work)
import { Server } from 'socket.io'

export default function handler(req, res) {
  const io = new Server(res.socket.server)
  io.on('connection', (socket) => {
    // Send GPS updates every 5 seconds
  })
}
```

**Why it's wrong:**
- Vercel serverless functions are stateless (each request gets new instance)
- WebSocket connections require long-lived server process
- Connection drops after 10-30 seconds on Vercel

**Do this instead:**

Use client-side polling with router.refresh():

```typescript
// GOOD: Polling with Next.js 15 router.refresh()
'use client'
export default function LiveMap({ initialVehicles }) {
  const router = useRouter()

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh() // Triggers server component re-fetch
    }, 30000) // 30 seconds

    return () => clearInterval(interval)
  }, [router])

  return <MapContainer>...</MapContainer>
}
```

**When WebSockets ARE appropriate:** Self-hosted Next.js on dedicated server (not serverless), or using separate WebSocket service (Pusher, Ably).

**Source:** [Next.js + WebSocket / Real-time examples](https://github.com/vercel/next.js/discussions/14950)

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Marker clustering algorithm | Custom quadtree with viewport calculations | react-leaflet-cluster | Handles 50K+ markers, automatic cluster splitting on zoom, optimized for mobile, battle-tested across thousands of apps |
| Map bounds calculation | Manual min/max lat/lng loop | Turf.js `bbox()` | Turf handles edge cases (antimeridian crossing, poles, empty arrays), returns GeoJSON bbox format compatible with Leaflet |
| Custom map tiles | Self-hosted tile server (OSM data + rendering) | OpenStreetMap tile servers | OSM provides free CDN-hosted tiles worldwide, handles 400M+ tiles/day, your hosting costs would be $100+/month |
| Polyline simplification | Douglas-Peucker algorithm implementation | Turf.js `simplify()` | Simplification prevents 10K+ point polylines from lagging browser, Turf handles spherical geometry correctly |
| Real-time updates on serverless | WebSocket server or long-polling | Client-side polling + router.refresh() | Vercel serverless doesn't support long-lived connections, polling at 30s intervals sufficient for GPS (hardware reports every 1-5 min anyway) |

**Key insight:** For mapping, ALWAYS use established libraries (Leaflet, Turf.js, react-leaflet-cluster). Map edge cases (viewport wrapping, coordinate systems, clustering performance) have been solved comprehensively by these tools.

## Common Pitfalls

### Pitfall 1: Leaflet CSS Not Loaded or Loaded in Wrong Order

**What goes wrong:** Map renders blank or markers appear unstyled

**Why it happens:**
- Leaflet CSS not imported (map renders but has no styles)
- CSS imported after component styles (specificity conflict)
- CSS imported in server component (build error)

**How to avoid:**

Import Leaflet CSS at TOP of client component (before other imports):

```typescript
// CORRECT ORDER
'use client'
import 'leaflet/dist/leaflet.css' // FIRST
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css'
import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css'
import './custom-map-styles.css' // Your custom styles LAST

import { MapContainer } from 'react-leaflet'
// ... rest of component
```

**Alternative:** Import in global CSS (`app/globals.css`):

```css
/* app/globals.css */
@import 'leaflet/dist/leaflet.css';
@import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';
@import 'react-leaflet-cluster/dist/assets/MarkerCluster.Default.css';
```

**Warning signs:**
- Map tiles load but no zoom controls visible
- Markers appear as plain text instead of icons
- Console error: "Leaflet is not defined"

### Pitfall 2: Map Container Height Not Set

**What goes wrong:** Map renders as 0px height (invisible)

**Why it happens:**
- MapContainer requires explicit height (doesn't auto-size to content)
- Parent div has no height (flex container without flex-1)
- Tailwind h-full not working (parent isn't full height)

**How to avoid:**

Set explicit height on MapContainer:

```typescript
// WRONG: No height specified
<MapContainer>...</MapContainer>

// CORRECT: Inline style or className
<MapContainer
  style={{ height: '100%', width: '100%' }}
  className="h-screen" // OR Tailwind class
>
  ...
</MapContainer>

// If using h-full, ensure parent is full height
<div className="h-screen"> {/* Parent MUST have explicit height */}
  <MapContainer className="h-full w-full">...</MapContainer>
</div>
```

**Warning signs:**
- Page loads but no map visible
- Inspect element shows `<div class="leaflet-container" style="height: 0px">`

### Pitfall 3: Decimal Coordinates Not Converted to Number

**What goes wrong:** Marker positions are NaN, markers don't render

**Why it happens:**
- Prisma returns Decimal type for latitude/longitude
- Leaflet expects JavaScript number
- TypeScript doesn't catch this (Decimal.toString() returns string)

**How to avoid:**

Convert Decimal to Number when fetching GPS data:

```typescript
// WRONG: Decimal passed directly to Leaflet
const location = await prisma.gPSLocation.findFirst({
  select: { latitude: true, longitude: true }
})
<Marker position={[location.latitude, location.longitude]} />
// ERROR: [Decimal, Decimal] instead of [number, number]

// CORRECT: Convert to Number
const location = await prisma.gPSLocation.findFirst({
  select: { latitude: true, longitude: true }
})
<Marker position={[
  Number(location.latitude),
  Number(location.longitude)
]} />
```

**Automatic conversion in server action:**

```typescript
export async function getLatestVehicleLocations() {
  const locations = await prisma.gPSLocation.findMany({
    select: { latitude: true, longitude: true }
  })

  // Convert all Decimals to Numbers
  return locations.map(loc => ({
    ...loc,
    latitude: Number(loc.latitude),
    longitude: Number(loc.longitude)
  }))
}
```

**Warning signs:**
- Map renders but no markers appear
- Console error: "Invalid LatLng object: (NaN, NaN)"
- TypeScript shows no error but runtime fails

### Pitfall 4: Polling Doesn't Update Map Data

**What goes wrong:** Map shows initial data but never refreshes

**Why it happens:**
- router.refresh() called but component doesn't re-render with new data
- Server component data cached by Next.js (not revalidated)
- Props not updated when parent re-renders

**How to avoid:**

Ensure server component fetches fresh data on each render:

```typescript
// app/(owner)/live-map/page.tsx (Server Component)
export const dynamic = 'force-dynamic' // CRITICAL: Disable caching
export const revalidate = 0 // Revalidate on every request

export default async function LiveMapPage() {
  // This function runs on EVERY router.refresh()
  const vehicles = await getLatestVehicleLocations()

  return <LiveMap initialVehicles={vehicles} />
}

// components/maps/live-map.tsx (Client Component)
'use client'
export default function LiveMap({ initialVehicles }) {
  const router = useRouter()
  const [vehicles, setVehicles] = useState(initialVehicles)

  // Update local state when props change
  useEffect(() => {
    setVehicles(initialVehicles)
  }, [initialVehicles])

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh() // Triggers server component re-render
    }, 30000)
    return () => clearInterval(interval)
  }, [router])

  return <MapContainer>...</MapContainer>
}
```

**Warning signs:**
- Polling interval fires (can verify in console) but map doesn't update
- Network tab shows no new requests to server
- Data only refreshes on hard page reload

**Source:** [usePolling: Custom Hook for Auto-Fetching in Next.js](https://www.davegray.codes/posts/usepolling-custom-hook-for-auto-fetching-in-nextjs)

### Pitfall 5: Marker Clustering Breaking Custom Icons

**What goes wrong:** DivIcon markers lose styling when clustered

**Why it happens:**
- MarkerClusterGroup clones marker elements
- CSS classes not applied to cloned markers
- iconCreateFunction not specified for cluster icons

**How to avoid:**

Ensure DivIcon className is set (not just html):

```typescript
// WRONG: Only HTML, no className
const icon = divIcon({
  html: '<div class="vehicle-marker">...</div>'
  // Missing className property
})

// CORRECT: Both html AND className
const icon = divIcon({
  html: '<div class="vehicle-marker bg-green-500">...</div>',
  className: 'vehicle-marker-wrapper', // CRITICAL for clustering
  iconSize: [40, 40]
})
```

**Custom cluster icon (optional):**

```typescript
<MarkerClusterGroup
  iconCreateFunction={(cluster) => {
    const count = cluster.getChildCount()
    return divIcon({
      html: `<div class="cluster-icon">${count}</div>`,
      className: 'custom-cluster',
      iconSize: [40, 40]
    })
  }}
>
  {markers}
</MarkerClusterGroup>
```

**Warning signs:**
- Individual markers styled correctly, but clustered markers unstyled
- Cluster icons show as plain text
- CSS classes not applied after zoom/clustering

## Code Examples

### Example 1: Complete Live Map Page with Server/Client Split

```typescript
// src/app/(owner)/live-map/page.tsx (SERVER COMPONENT)
import dynamic from 'next/dynamic'
import { getLatestVehicleLocations } from './actions'

// Force dynamic rendering (no caching for real-time data)
export const dynamic = 'force-dynamic'
export const revalidate = 0

// Dynamic import with SSR disabled
const LiveMap = dynamic(
  () => import('@/components/maps/live-map'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-screen bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading map...</p>
        </div>
      </div>
    )
  }
)

export default async function LiveMapPage() {
  // Fetch initial GPS data (server-side, with RLS)
  const vehicles = await getLatestVehicleLocations()

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Live Fleet Map</h1>
          <p className="text-sm text-muted-foreground">
            {vehicles.length} vehicles tracked
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-green-500"></div>
            <span className="text-xs">Moving</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
            <span className="text-xs">Idle</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-full bg-red-500"></div>
            <span className="text-xs">Offline</span>
          </div>
        </div>
      </header>

      {/* Map Container */}
      <div className="flex-1 relative">
        <LiveMap initialVehicles={vehicles} />
      </div>
    </div>
  )
}
```

```typescript
// src/app/(owner)/live-map/actions.ts (SERVER ACTIONS)
'use server'

import { prisma } from '@/lib/db/client'
import { getCurrentTenantId } from '@/lib/auth/tenant'

export async function getLatestVehicleLocations() {
  const tenantId = await getCurrentTenantId()

  // Get most recent GPS location for each truck
  const locations = await prisma.$queryRaw<{
    id: string
    truckId: string
    latitude: string
    longitude: string
    speed: number | null
    heading: number | null
    timestamp: Date
    make: string
    model: string
    licensePlate: string
  }[]>`
    SELECT DISTINCT ON (gps."truckId")
      gps.id,
      gps."truckId",
      gps.latitude,
      gps.longitude,
      gps.speed,
      gps.heading,
      gps.timestamp,
      t.make,
      t.model,
      t."licensePlate"
    FROM "GPSLocation" gps
    INNER JOIN "Truck" t ON gps."truckId" = t.id
    WHERE gps."tenantId" = ${tenantId}::uuid
    ORDER BY gps."truckId", gps.timestamp DESC
  `

  return locations.map(loc => ({
    id: loc.id,
    truckId: loc.truckId,
    latitude: Number(loc.latitude),
    longitude: Number(loc.longitude),
    speed: loc.speed,
    heading: loc.heading,
    timestamp: loc.timestamp,
    truck: {
      make: loc.make,
      model: loc.model,
      licensePlate: loc.licensePlate
    }
  }))
}
```

### Example 2: Custom Polling Hook for Real-Time Updates

```typescript
// src/hooks/use-polling.ts
'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

/**
 * Custom hook for polling server data at regular intervals
 * Uses Next.js router.refresh() to trigger server component re-render
 */
export function usePolling(intervalMs: number = 30000) {
  const router = useRouter()

  useEffect(() => {
    // Refresh immediately on mount
    router.refresh()

    // Set up polling interval
    const interval = setInterval(() => {
      router.refresh()
    }, intervalMs)

    return () => clearInterval(interval)
  }, [router, intervalMs])
}

// Usage in LiveMap component
'use client'
export default function LiveMap({ initialVehicles }) {
  usePolling(30000) // Poll every 30 seconds

  return <MapContainer>...</MapContainer>
}
```

**Source:** [usePolling: Custom Hook for Auto-Fetching in Next.js](https://www.davegray.codes/posts/usepolling-custom-hook-for-auto-fetching-in-nextjs)

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Google Maps for all fleet tracking | Leaflet for basic tracking, Google Maps only when needed | 2020-2023 | Leaflet eliminates $200+/month Google Maps costs for basic vehicle markers and polylines. Google Maps appropriate for geocoding/directions (Phase 13+). |
| Image-based marker icons | DivIcon with CSS/SVG | 2021+ | DivIcon enables dynamic styling (color changes without image swaps), reduces asset management, better performance (no image loading). |
| Custom marker clustering algorithms | react-leaflet-cluster library | 2022+ | Library handles 50K+ markers efficiently with automatic zoom-based clustering, eliminates need for custom quadtree implementation. |
| WebSocket for all real-time updates | Client-side polling on serverless | 2023+ (Vercel rise) | Polling at 30s intervals sufficient for GPS (hardware reports every 1-5 min). WebSockets require dedicated server, incompatible with serverless. |
| Separate API routes for data fetching | Server actions in Next.js 15 | 2024 (Next.js 13+) | Server actions eliminate API route boilerplate, RLS context automatic, better TypeScript safety. |

**Deprecated/outdated:**
- **Leaflet 0.7.x:** Use Leaflet 1.9.x+ (v0.7 from 2014, missing modern features like retina support)
- **react-leaflet v3.x:** Use v5.x+ (v5 supports React 19, v3 incompatible with Next.js 15)
- **Manual CSS import via `<link>` in head:** Import CSS in component (Next.js handles bundling automatically)
- **Google Maps for basic markers/polylines:** Free alternatives (Leaflet + OSM tiles) sufficient for 90% of fleet tracking use cases

## Open Questions

1. **Polling Interval for Real-Time Updates**
   - What we know: GPS hardware typically reports every 1-5 minutes, 30-second polling is standard for "live" fleet maps
   - What's unclear: User tolerance for staleness (is 30s acceptable or need 10s polling?)
   - Recommendation: Start with 30s interval (reduces server load), add manual "Refresh" button for instant updates. Monitor user feedback—if complaints about staleness, reduce to 15s.

2. **Map Tile Provider (OSM vs Mapbox vs Google)**
   - What we know: OpenStreetMap free but limited styling, Mapbox costs $5/1000 sessions, Google costs $7/1000 loads
   - What's unclear: User preference for map aesthetics vs cost
   - Recommendation: Start with OSM tiles (zero cost, sufficient clarity for vehicle tracking). If user feedback requests better styling/satellite view, upgrade to Mapbox (cheaper than Google).

3. **Route History Display (Always On vs On-Demand)**
   - What we know: Polylines for all vehicles clutter map, on-demand loads only when vehicle selected
   - What's unclear: User workflow—view many trails simultaneously or one at a time?
   - Recommendation: On-demand only (click vehicle marker → show trail). If user feedback requests "view all trails" mode, add toggle button in header.

4. **Marker Clustering Threshold**
   - What we know: react-leaflet-cluster defaults to clustering when markers overlap, customizable via maxClusterRadius
   - What's unclear: User preference for aggressive clustering (cleaner map) vs less clustering (see more vehicles)
   - Recommendation: Use default settings (maxClusterRadius: 80px). Monitor user feedback—if complaints about over-clustering, reduce to 50px.

5. **Vehicle Detail Sheet: Auto-Close on Map Click**
   - What we know: Sheet stays open until manually closed, some users prefer auto-close when clicking map
   - What's unclear: User preference (persistent sidebar vs auto-close)
   - Recommendation: Keep sheet open until manual close (matches Samsara UX, allows comparing multiple vehicles). Add escape key handler for quick close.

## Sources

### Primary (HIGH confidence)

**Official Documentation:**
- [React Leaflet v5.x Documentation](https://react-leaflet.js.org/) - Official React-Leaflet docs (HIGH confidence)
- [Leaflet 1.9 API Reference](https://leafletjs.com/reference.html) - Core Leaflet API (HIGH confidence)
- [react-leaflet-cluster npm](https://www.npmjs.com/package/react-leaflet-cluster) - Official clustering library (HIGH confidence)
- [Next.js 15 Dynamic Imports](https://nextjs.org/docs/app/building-your-application/optimizing/lazy-loading) - Official Next.js docs (HIGH confidence)
- [shadcn/ui Sheet Component](https://www.shadcn.io/ui/sheet) - Official shadcn component (HIGH confidence)

**Verified Patterns:**
- [React Leaflet on Next.js 15 (App router)](https://xxlsteve.net/blog/react-leaflet-on-next-15/) - Next.js 15 + Leaflet integration guide (HIGH confidence, published Jan 2026)
- [How to use react-leaflet in Nextjs with TypeScript](https://andresmpa.medium.com/how-to-use-react-leaflet-in-nextjs-with-typescript-surviving-it-21a3379d4d18) - SSR avoidance patterns (HIGH confidence)

### Secondary (MEDIUM confidence)

**Integration Guides:**
- [How to Integrate Leaflet Maps into Your Next.js App with TypeScript](https://tech-talk.the-experts.nl/how-to-integrate-leaflet-maps-into-your-next-js-app-with-typescript-efa9411cc493) - TypeScript setup (MEDIUM confidence)
- [Making React-Leaflet work with NextJS](https://placekit.io/blog/articles/making-react-leaflet-work-with-nextjs-493i) - Common pitfalls (MEDIUM confidence)

**Real-Time Data Patterns:**
- [usePolling: Custom Hook for Auto-Fetching in Next.js](https://www.davegray.codes/posts/usepolling-custom-hook-for-auto-fetching-in-nextjs) - Polling pattern (MEDIUM confidence)
- [Real-Time Web Communication: Long/Short Polling, WebSockets, and SSE Explained + Next.js code](https://medium.com/@brinobruno/real-time-web-communication-long-short-polling-websockets-and-sse-explained-next-js-code-958cd21b67fa) - Polling vs WebSocket comparison (MEDIUM confidence)

**Custom Markers & Styling:**
- [Creating Custom Styles Leaflet Icons With DivIcon and CSS](https://www.drupal.org/node/2554137) - DivIcon patterns (MEDIUM confidence)
- [Markers With Custom Icons - Leaflet](https://leafletjs.com/examples/custom-icons/) - Official Leaflet custom icon guide (HIGH confidence)
- [Create custom map marker icon with Leaflet](https://www.geoapify.com/create-custom-map-marker-icon/) - Marker customization (MEDIUM confidence)

**Map Interactions:**
- [Leaflet: Fit Polyline in View](https://dzone.com/articles/leaflet-fit-polyline-in-view) - fitBounds usage (MEDIUM confidence)
- [View bounds | React Leaflet](https://react-leaflet.js.org/docs/example-view-bounds/) - Official React-Leaflet bounds example (HIGH confidence)

### Tertiary (LOW confidence)

**Community Examples (needs verification):**
- [GitHub: react-leaflet discussions](https://github.com/PaulLeCam/react-leaflet/discussions) - Community troubleshooting (LOW confidence, verify against official docs)
- Various Medium articles on Leaflet clustering (LOW confidence, cross-reference with official react-leaflet-cluster docs)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - Leaflet 1.9.x and React-Leaflet 5.x current stable versions, react-leaflet-cluster actively maintained (last update Jan 2026)
- Architecture: HIGH - Next.js 15 dynamic import pattern verified in official docs, server/client split established best practice
- Real-time updates: MEDIUM - Polling pattern verified but optimal interval depends on user requirements
- Custom markers: HIGH - DivIcon documented in Leaflet core, CSS approach verified across multiple sources

**Research date:** 2026-02-15
**Valid until:** 60 days (stable domain: mapping libraries, Next.js patterns well-established)

**Areas requiring validation during planning:**
- Polling interval (30s vs 15s vs 10s) based on user tolerance for staleness
- Map tile provider (OSM vs Mapbox vs Google) based on aesthetics vs cost preference
- Route history display mode (on-demand vs always-on) based on user workflow
- Marker clustering aggressiveness (default vs custom maxClusterRadius)
