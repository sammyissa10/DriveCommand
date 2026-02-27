# Phase 19: Multi-Stop Routes - Research

**Researched:** 2026-02-26
**Domain:** Prisma schema extension, Next.js server actions, Leaflet map markers, geofencing
**Confidence:** HIGH

---

## Summary

Phase 19 extends the existing Route model with an ordered list of stops (RouteStop). The codebase already has all required patterns in place: Prisma with PostgreSQL RLS, `@turf/turf` for geofence distance checks, `AddressAutocomplete` (Nominatim) for geocoding, `react-leaflet` with `Marker`/`Polyline` for maps, and the `geofence-check.ts` fire-and-forget pattern for GPS pings. This phase is primarily a schema addition + UI extension; no new libraries are required.

The existing geofence radius in the codebase is **500m (0.5 km)**, not 200m as stated in the phase description. The planner should use 500m to match the established constant in `geofence-check.ts`.

**Primary recommendation:** Mirror the `Load` geofence pattern exactly for `RouteStop` geofencing. Extend `route-form.tsx` with a controlled stop list (up/down reorder buttons, inline `AddressAutocomplete` per stop). Show stops as numbered `CircleMarker` layers in `react-leaflet`.

---

## User Constraints

No CONTEXT.md exists for this phase. All implementation choices are at Claude's discretion.

**Prior decisions from codebase that must be honored:**

| Decision | Source | Value |
|----------|--------|-------|
| Geocoding | `geofence-check.ts` line 22 | Nominatim OSM, no API key, 5s timeout, User-Agent header |
| Geofence radius | `geofence-check.ts` line 15 | `GEOFENCE_RADIUS_KM = 0.5` (500m) — NOT 200m as stated in phase description |
| Geofence idempotency | `Load.geofenceFlags` JSONB | Store per-stop arrived flag to prevent duplicate triggers |
| Coordinate precision | All existing tables | `DECIMAL(10,8)` lat, `DECIMAL(11,8)` lng |
| Timestamp type | All existing tables | `TIMESTAMPTZ` |
| RLS pattern | Every table | `tenant_isolation_policy` + `bypass_rls_policy` |
| Optimistic locking | `Route.version` | Already on Route; RouteStop does not need its own version |
| Auth pattern | `routes.ts` server actions | `requireRole(...)` first, then `getTenantPrisma()` |

---

## Standard Stack

### Core (already installed — no new installs needed)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@prisma/client` | 7.4.0 | ORM + DB migrations | Project ORM |
| `@turf/turf` | 7.3.4 | Geofence distance calc | Already used in `geofence-check.ts` |
| `react-leaflet` | 5.0.0 | Map markers for stop pins | Already used in live map |
| `leaflet` | 1.9.4 | Map rendering | Already installed |
| `zod` | 4.3.6 | Schema validation for server actions | Project standard |
| `@dnd-kit/*` | — | NOT installed — do not use drag-and-drop | Use up/down buttons instead |

**Installation:** No new packages required.

### UI Pattern for Stop Reordering

Use **up/down arrow buttons** (not drag-and-drop). Rationale:
- `@dnd-kit` is not installed
- Adding it for this feature is heavyweight
- Up/down buttons are well-understood in logistics forms
- Simpler to implement and test

---

## Architecture Patterns

### Recommended File Structure

```
prisma/
├── schema.prisma                                  # Add RouteStop model + enum
└── migrations/
    └── YYYYMMDD_add_route_stops/migration.sql    # New migration

src/
├── lib/
│   ├── validations/
│   │   └── route.schemas.ts                      # Add routeStopSchema
│   └── geofencing/
│       └── geofence-check.ts                     # Extend with RouteStop check
│
├── app/
│   ├── (owner)/
│   │   └── actions/
│   │       └── routes.ts                         # Extend createRoute/updateRoute for stops
│   └── (driver)/
│       └── actions/
│           └── driver-routes.ts                  # Extend getMyAssignedRoute to include stops
│
└── components/
    ├── routes/
    │   ├── route-form.tsx                        # Add stop editor section
    │   ├── route-detail.tsx                      # Add stop timeline section
    │   └── stop-editor.tsx                       # New: multi-stop editor component
    └── driver/
        └── route-detail-readonly.tsx             # Add active stop panel
```

### Pattern 1: RouteStop Schema (Prisma)

**What:** New model linked to Route with ordered stops.
**When to use:** Whenever a route has intermediate pickup/delivery points.

```typescript
// Source: prisma/schema.prisma — mirrors Load model coordinate/JSONB patterns

enum RouteStopType {
  PICKUP
  DELIVERY
}

enum RouteStopStatus {
  PENDING
  ARRIVED
  DEPARTED
}

model RouteStop {
  id           String          @id @default(dbgenerated("gen_random_uuid()")) @db.Uuid
  routeId      String          @db.Uuid
  tenantId     String          @db.Uuid
  position     Int             // 1-based ordering
  type         RouteStopType
  address      String
  lat          Decimal?        @db.Decimal(10, 8)
  lng          Decimal?        @db.Decimal(11, 8)
  scheduledAt  DateTime?       @db.Timestamptz
  arrivedAt    DateTime?       @db.Timestamptz
  departedAt   DateTime?       @db.Timestamptz
  notes        String?
  status       RouteStopStatus @default(PENDING)
  geofenceHit  Boolean         @default(false)  // idempotency flag
  createdAt    DateTime        @default(now()) @db.Timestamptz
  updatedAt    DateTime        @updatedAt @db.Timestamptz

  route  Route  @relation(fields: [routeId], references: [id], onDelete: Cascade)
  tenant Tenant @relation(fields: [tenantId], references: [id])

  @@index([routeId])
  @@index([tenantId])
  @@index([routeId, position])
  @@index([status])
}
```

And on Route model, add:
```typescript
  stops  RouteStop[]
```

And on Tenant model, add:
```typescript
  routeStops  RouteStop[]
```

### Pattern 2: Migration SQL Structure

**What:** Hand-written migration SQL (project uses custom migrate.mjs).

```sql
-- Source: prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql — follow this pattern exactly

-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "RouteStopType" AS ENUM ('PICKUP', 'DELIVERY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "RouteStopStatus" AS ENUM ('PENDING', 'ARRIVED', 'DEPARTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable
CREATE TABLE "RouteStop" (
    "id"          UUID              NOT NULL DEFAULT gen_random_uuid(),
    "routeId"     UUID              NOT NULL,
    "tenantId"    UUID              NOT NULL,
    "position"    INTEGER           NOT NULL,
    "type"        "RouteStopType"   NOT NULL,
    "address"     TEXT              NOT NULL,
    "lat"         DECIMAL(10,8),
    "lng"         DECIMAL(11,8),
    "scheduledAt" TIMESTAMPTZ,
    "arrivedAt"   TIMESTAMPTZ,
    "departedAt"  TIMESTAMPTZ,
    "notes"       TEXT,
    "status"      "RouteStopStatus" NOT NULL DEFAULT 'PENDING',
    "geofenceHit" BOOLEAN           NOT NULL DEFAULT false,
    "createdAt"   TIMESTAMPTZ       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMPTZ       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RouteStop_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "RouteStop_routeId_idx" ON "RouteStop"("routeId");
CREATE INDEX "RouteStop_tenantId_idx" ON "RouteStop"("tenantId");
CREATE INDEX "RouteStop_routeId_position_idx" ON "RouteStop"("routeId", "position");
CREATE INDEX "RouteStop_status_idx" ON "RouteStop"("status");

-- FKs
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_routeId_fkey"
  FOREIGN KEY ("routeId") REFERENCES "Route"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RouteStop" ADD CONSTRAINT "RouteStop_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS (mandatory for every table — pattern from init migration)
ALTER TABLE "RouteStop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RouteStop" FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_policy ON "RouteStop"
  FOR ALL
  USING ("tenantId" = current_tenant_id())
  WITH CHECK ("tenantId" = current_tenant_id());

CREATE POLICY bypass_rls_policy ON "RouteStop"
  FOR ALL
  USING (current_setting('app.bypass_rls', TRUE)::text = 'on');
```

### Pattern 3: Stop Editor in route-form.tsx

**What:** Controlled React state for stops list inside existing `RouteForm`.
**When to use:** Route create and edit forms.

```typescript
// Source: src/components/routes/route-form.tsx — follows existing coordinate state pattern

interface StopDraft {
  id: string;           // client-side UUID for React key
  type: 'PICKUP' | 'DELIVERY';
  address: string;
  lat: number | null;
  lng: number | null;
  scheduledAt: string;  // datetime-local format
  notes: string;
}

// Managed with useState — serialize to hidden fields for form submission
// stops[0][address], stops[0][type], stops[0][lat], etc.
// Server action reads formData.getAll('stops[N][field]') or use indexed names
```

Key design: serialize each stop field as `stops_N_address`, `stops_N_type`, etc. (flat FormData keys, no JSON blobs). Server action iterates `i = 0..N` until no `stops_${i}_address`.

### Pattern 4: Geofence Check Extension

**What:** Extend `checkGeofenceAndAlert` to also check RouteStops.
**When to use:** After every GPS ping at `/api/gps/report`.

```typescript
// Source: src/lib/geofencing/geofence-check.ts — same distance()/point() pattern

const GEOFENCE_RADIUS_KM = 0.5; // KEEP AT 0.5 — matches existing constant

// Add to checkGeofenceAndAlert after existing Load check:

// Find active route for this driver/truck
const route = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  return tx.route.findFirst({
    where: { driverId, tenantId, status: { in: ['PLANNED', 'IN_PROGRESS'] } },
    include: {
      stops: {
        where: { status: 'PENDING', geofenceHit: false },
        orderBy: { position: 'asc' },
        take: 1,  // Only check the NEXT pending stop
      },
    },
  });
}, TX_OPTIONS);

if (!route?.stops[0]) return;
const nextStop = route.stops[0];

// Lazy geocode if lat/lng not cached
let stopLat = nextStop.lat ? Number(nextStop.lat) : null;
let stopLng = nextStop.lng ? Number(nextStop.lng) : null;
if (stopLat === null || stopLng === null) {
  const coords = await geocodeAddress(nextStop.address);
  if (coords) {
    [stopLat, stopLng] = coords;
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.routeStop.update({
        where: { id: nextStop.id },
        data: { lat: stopLat!, lng: stopLng! },
      });
    }, TX_OPTIONS);
  }
}

if (stopLat !== null && stopLng !== null) {
  const stopPoint = point([stopLng, stopLat]);
  const truckPoint = point([longitude, latitude]);
  const distKm = distance(truckPoint, stopPoint, { units: 'kilometers' });

  if (distKm <= GEOFENCE_RADIUS_KM) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.routeStop.update({
        where: { id: nextStop.id },
        data: {
          status: 'ARRIVED',
          arrivedAt: new Date(),
          geofenceHit: true,
        },
      });
    }, TX_OPTIONS);
  }
}
```

### Pattern 5: Stop Timeline on Dispatcher Detail

**What:** Vertical timeline showing all stops with status badges, inside `RouteDetail`.

```tsx
// Source: src/components/routes/route-detail.tsx — follows existing card section pattern
// Add as a new card section between Route Details and Assigned Driver

<div className="rounded-xl border border-border bg-card p-6 shadow-sm">
  <h2 className="mb-4 text-lg font-semibold text-card-foreground">Stops</h2>
  <ol className="space-y-3">
    {route.stops.map((stop, idx) => (
      <li key={stop.id} className="flex gap-3">
        {/* Position number */}
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
          {stop.position}
        </div>
        {/* Stop details */}
        <div className="flex-1 space-y-0.5">
          <p className="text-sm font-medium text-card-foreground">{stop.address}</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{stop.type}</span>
            <StopStatusBadge status={stop.status} />
          </div>
        </div>
      </li>
    ))}
  </ol>
</div>
```

### Pattern 6: Stop Pins on Leaflet Map (Optional Enhancement)

**What:** Add `CircleMarker` components for each stop on the route detail page map.

```tsx
// Source: src/components/maps/route-history-layer.tsx — Polyline pattern
// Use CircleMarker (from react-leaflet) — simpler than custom Marker, no icon management

import { CircleMarker, Popup } from 'react-leaflet';

// Stop colors by status
const STOP_COLORS = {
  PENDING: '#94a3b8',   // slate-400
  ARRIVED: '#3b82f6',  // blue-500
  DEPARTED: '#22c55e', // green-500
} as const;

{stops.map((stop) => (
  <CircleMarker
    key={stop.id}
    center={[Number(stop.lat), Number(stop.lng)]}
    radius={10}
    pathOptions={{ color: STOP_COLORS[stop.status], fillOpacity: 0.8 }}
  >
    <Popup>{stop.position}. {stop.address} ({stop.type})</Popup>
  </CircleMarker>
))}
```

Note: The route detail page does not currently have a map; this pattern is for if/when a stop map is added. It is optional for this phase.

### Pattern 7: Driver Portal Active Stop Display

**What:** Show the current next pending stop prominently in `RouteDetailReadOnly`.

```tsx
// Source: src/components/driver/route-detail-readonly.tsx — dl/dt/dd card pattern

// Derive the active stop (first PENDING or ARRIVED)
const activeStop = route.stops
  ?.filter(s => s.status !== 'DEPARTED')
  .sort((a, b) => a.position - b.position)[0] ?? null;

// Show as a highlighted card above the route detail section
{activeStop && (
  <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
    <p className="text-xs font-semibold uppercase tracking-wider text-blue-600">
      Next Stop — {activeStop.type}
    </p>
    <p className="mt-1 text-sm font-medium text-blue-900">{activeStop.address}</p>
    {activeStop.scheduledAt && (
      <p className="mt-0.5 text-xs text-blue-700">
        Scheduled: {format(activeStop.scheduledAt, 'MMM d, h:mm a')}
      </p>
    )}
    <div className="mt-2">
      <StopStatusBadge status={activeStop.status} />
    </div>
  </div>
)}
```

### Anti-Patterns to Avoid

- **Storing stops as JSONB on Route:** Hard to query, index, or update individual stop status. Use a proper relation table.
- **Using drag-and-drop:** `@dnd-kit` not installed; adds build complexity for minimal UX gain over up/down buttons.
- **Sending JSON blobs via FormData:** Use flat indexed field names (`stops_0_address`, `stops_0_type`) — easier to parse server-side with standard `FormData.get()` calls.
- **Checking ALL stops in geofence:** Only check the next pending stop (lowest `position` where `status = PENDING` and `geofenceHit = false`). Checking all stops creates race conditions and unnecessary DB load.
- **Departing via geofence:** Only auto-set `arrivedAt`/status=ARRIVED via geofence. `departedAt`/DEPARTED should be manual driver action (button in driver portal) to avoid false positives from brief GPS dwell.
- **Forgetting `onDelete: Cascade`:** If a Route is deleted, its stops must cascade. This is already handled in the schema above.
- **Not setting `geofenceHit` atomically with status update:** Set both in the same transaction to prevent duplicate alerts from concurrent pings.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Distance calculation | Custom haversine for geofence | `distance()` from `@turf/turf` | Already imported in `geofence-check.ts`; handles ellipsoidal earth |
| Address autocomplete | Raw Nominatim fetch | `AddressAutocomplete` component | Already exists at `src/components/shared/address-autocomplete.tsx` |
| Coordinate caching | Refetch every ping | Store `lat`/`lng` on `RouteStop` (lazy geocode on first ping, then cached) | Nominatim rate limits; existing pattern from `Load` model |
| Tenant isolation | Manual `WHERE tenantId=` | `getTenantPrisma()` + RLS policies in migration | Every table must have both `tenant_isolation_policy` and `bypass_rls_policy` |
| Map markers | Custom SVG icon setup | `CircleMarker` from `react-leaflet` | No icon URL/asset issues; simpler than `divIcon` for stops |

**Key insight:** The Load geofence pattern in `geofence-check.ts` is the exact template to follow for RouteStop geofencing. Do not design a new pattern; extend the existing file.

---

## Common Pitfalls

### Pitfall 1: Geofence Radius Mismatch

**What goes wrong:** Phase description says 200m but code uses 500m.
**Why it happens:** The `GEOFENCE_RADIUS_KM = 0.5` constant in `geofence-check.ts` was established in Quick-20 at 500m, not 200m.
**How to avoid:** Use `GEOFENCE_RADIUS_KM = 0.5` (500m) to be consistent with the existing Load geofence. If 200m is truly desired, change the constant for all geofences, not just RouteStop.
**Warning signs:** If you see `GEOFENCE_RADIUS_KM = 0.2` in a new stop-check function, it diverges from established behavior.

### Pitfall 2: RLS Missing on RouteStop

**What goes wrong:** RouteStop table created without RLS policies — data leaks between tenants.
**Why it happens:** Easy to forget when writing migration SQL.
**How to avoid:** Every new table migration MUST include `ENABLE ROW LEVEL SECURITY`, `FORCE ROW LEVEL SECURITY`, `tenant_isolation_policy`, and `bypass_rls_policy`.
**Warning signs:** Dispatcher sees stops from other tenants on route detail page.

### Pitfall 3: `position` Gaps After Delete/Reorder

**What goes wrong:** Deleting stop 2 of [1,2,3] leaves gaps — [1,3]. Frontend re-render shows wrong sequence numbers.
**Why it happens:** Position stored as integer without renormalization.
**How to avoid:** On any stop delete or reorder, renormalize all positions in the same server action call. Use `prisma.routeStop.updateMany` with individual updates inside a transaction.
**Warning signs:** Stop timeline shows "1, 3" instead of "1, 2" after deletion.

### Pitfall 4: FormData Stop Serialization

**What goes wrong:** Stops submitted as `stops=JSON.stringify(...)` — server action receives a single string instead of structured fields.
**Why it happens:** Tempting to serialize complex state as JSON.
**How to avoid:** Use flat indexed field names. In the server action, loop `i = 0, 1, 2...` reading `formData.get('stops_${i}_address')` until it returns null. This is idiomatic with Next.js `useActionState` + `FormData`.
**Warning signs:** Server action receives `stops = "[{...}]"` — a string instead of structured values.

### Pitfall 5: Driver Portal Shows Stale Stop Status

**What goes wrong:** Driver portal is a server component (`async function MyRoutePage`) that fetches once on page load. Geofence auto-arrive won't reflect until page refresh.
**Why it happens:** Server component renders are not real-time.
**How to avoid:** This is acceptable for Phase 19 (no WebSocket/polling requirement). The GpsTracker client component already handles the ping loop. Document that stop status updates require page refresh in the driver portal — or add a manual refresh button.
**Warning signs:** Driver sees PENDING status even after arriving at a stop.

### Pitfall 6: Forgetting `include: { stops: true }` in Existing Queries

**What goes wrong:** `getRoute()`, `getMyAssignedRoute()`, and `checkGeofenceAndAlert()` do not automatically include stops — they must be updated to include the new relation.
**Why it happens:** Prisma requires explicit `include` for relations.
**How to avoid:** Update all three queries to include `stops: { orderBy: { position: 'asc' } }`.
**Warning signs:** Route detail page shows no stops section despite stops existing in DB.

### Pitfall 7: Cascade Delete Not Set

**What goes wrong:** Deleting a Route fails with FK constraint error if RouteStop rows exist.
**Why it happens:** Default Prisma FK behavior is RESTRICT.
**How to avoid:** Use `onDelete: Cascade` on `RouteStop.routeId` FK (already specified in Pattern 1 above). Verify migration SQL uses `ON DELETE CASCADE`.
**Warning signs:** `prisma.route.delete()` throws `P2003` foreign key constraint error.

---

## Code Examples

Verified patterns from existing codebase:

### Server Action Pattern (from routes.ts)

```typescript
// Source: src/app/(owner)/actions/routes.ts

'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { revalidatePath } from 'next/cache';

export async function createRouteWithStops(prevState: any, formData: FormData) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]); // ALWAYS FIRST

  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Parse stops from flat FormData fields
  const stops: Array<{ address: string; type: string; scheduledAt?: string; notes?: string }> = [];
  let i = 0;
  while (formData.get(`stops_${i}_address`)) {
    stops.push({
      address: formData.get(`stops_${i}_address`) as string,
      type: formData.get(`stops_${i}_type`) as string,
      scheduledAt: (formData.get(`stops_${i}_scheduledAt`) as string) || undefined,
      notes: (formData.get(`stops_${i}_notes`) as string) || undefined,
    });
    i++;
  }

  const route = await prisma.route.create({
    data: {
      tenantId,
      // ... other fields ...
      stops: {
        create: stops.map((stop, idx) => ({
          tenantId,
          position: idx + 1,
          type: stop.type as 'PICKUP' | 'DELIVERY',
          address: stop.address,
          scheduledAt: stop.scheduledAt ? new Date(stop.scheduledAt) : null,
          notes: stop.notes || null,
        })),
      },
    },
  });

  revalidatePath('/routes');
}
```

### RLS Bypass Pattern (for GPS report API route)

```typescript
// Source: src/app/api/gps/report/route.ts — fire-and-forget geofence check

// After writing GPS location:
checkRouteStopGeofence({
  tenantId: session.tenantId,
  driverId: session.userId,
  truckId: route.truckId,
  latitude,
  longitude,
}).catch((e) => console.error('RouteStop geofence check error:', e));
```

### Prisma RLS Bypass in API Route

```typescript
// Source: src/app/api/gps/report/route.ts — bypass RLS in system-level operations

const result = await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
  return tx.routeStop.update({ ... });
}, TX_OPTIONS);
```

### Stop Position Renormalization

```typescript
// In updateRouteStops server action — atomic reorder within transaction
await prisma.$transaction(async () => {
  for (let i = 0; i < reorderedStops.length; i++) {
    await prisma.routeStop.update({
      where: { id: reorderedStops[i].id },
      data: { position: i + 1 },
    });
  }
});
```

---

## Key File Inventory

Files to READ before writing code for each plan:

### Plan 19-01 (RouteStop Model)

| File | Why |
|------|-----|
| `prisma/schema.prisma` | Add `RouteStopType`, `RouteStopStatus` enums + `RouteStop` model + relations on `Route` and `Tenant` |
| `prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql` | Migration SQL pattern to follow |
| `prisma/migrations/20260214000003_add_route_model/migration.sql` | RLS policy pattern |
| `src/lib/validations/route.schemas.ts` | Add `routeStopSchema` |
| `src/app/(owner)/actions/routes.ts` | Extend `createRoute`, `updateRoute`, `getRoute` |

### Plan 19-02 (Dispatcher UI)

| File | Why |
|------|-----|
| `src/components/routes/route-form.tsx` | Add stop editor section (controlled state + hidden fields) |
| `src/components/shared/address-autocomplete.tsx` | Reuse for per-stop address input |
| `src/components/routes/route-detail.tsx` | Add stop timeline section |
| `src/app/(owner)/routes/[id]/route-page-client.tsx` | Pass stops to child components |
| `src/app/(owner)/routes/[id]/page.tsx` | Pass stops from `getRoute` response |

### Plan 19-03 (Driver App + Geofence)

| File | Why |
|------|-----|
| `src/lib/geofencing/geofence-check.ts` | Extend with RouteStop check — use same functions |
| `src/app/api/gps/report/route.ts` | Call new RouteStop geofence function fire-and-forget |
| `src/app/(driver)/actions/driver-routes.ts` | Include stops in `getMyAssignedRoute` |
| `src/app/(driver)/my-route/page.tsx` | Pass stops to driver component |
| `src/components/driver/route-detail-readonly.tsx` | Add active stop panel |

---

## State of the Art

| Old Approach | Current Approach | Impact for Phase 19 |
|--------------|------------------|---------------------|
| Single origin/destination on Route | Multi-stop RouteStop child table | New model; no migration of existing routes needed — stops are optional |
| Load.geofenceFlags JSONB for idempotency | RouteStop.geofenceHit boolean field | Simpler — one flag per stop, not a dynamic JSONB object |
| Manual status updates only | Geofence auto-arrives on GPS ping | Follow exact Load pattern |

**Existing behavior preserved:** Routes with zero RouteStop records continue to work exactly as before. The stop editor in `route-form.tsx` starts empty by default (0 stops) and dispatchers can add stops as needed.

---

## Open Questions

1. **Should departing a stop be automatic (geofence exit) or manual?**
   - What we know: Load model only auto-sets on approach (arrival); departure is implicit from next status transition.
   - What's unclear: Phase description says `departed` is part of the status enum but doesn't specify trigger.
   - Recommendation: Make `DEPARTED` a **manual** driver action (button in driver portal). Auto-departure via geofence exit is unreliable (driver may linger). This simplifies Phase 19 significantly.

2. **Should Route origin/destination become the first/last RouteStop, or remain separate fields?**
   - What we know: `Route.origin` and `Route.destination` are existing required fields used in many places (route list display, page titles, driver portal heading).
   - What's unclear: Whether to consolidate.
   - Recommendation: Keep `Route.origin` and `Route.destination` as-is. RouteStops are additive intermediate stops. This avoids migrating existing data and breaking 10+ display components.

3. **Geofence radius: 200m (phase description) vs 500m (existing code)?**
   - What we know: `geofence-check.ts` line 15 sets `GEOFENCE_RADIUS_KM = 0.5` (500m). Phase description says 200m.
   - Recommendation: Use 500m for consistency. If 200m is desired, it should be a project-wide decision to change the constant, not a per-feature divergence.

---

## Sources

### Primary (HIGH confidence — directly read from codebase)

- `prisma/schema.prisma` — Route model, Load model, field types, index patterns
- `prisma/migrations/20260214000003_add_route_model/migration.sql` — RLS policy SQL patterns
- `prisma/migrations/20260226000002_add_rls_missing_tables/migration.sql` — Migration structure with idempotent enums
- `src/lib/geofencing/geofence-check.ts` — Geofence radius (500m), turf distance pattern, geocode caching pattern
- `src/app/api/gps/report/route.ts` — Fire-and-forget geofence call pattern
- `src/components/routes/route-form.tsx` — Form structure, coordinate state, `useActionState` pattern
- `src/components/shared/address-autocomplete.tsx` — Nominatim autocomplete component API
- `src/app/(owner)/actions/routes.ts` — Server action auth pattern, optimistic locking
- `src/app/(driver)/actions/driver-routes.ts` — Driver-scoped query pattern
- `src/app/(driver)/my-route/page.tsx` — Driver portal page structure
- `src/components/driver/route-detail-readonly.tsx` — Driver portal display pattern
- `src/components/driver/gps-tracker.tsx` — GPS ping interval (30s), `/api/gps/report` endpoint
- `src/components/maps/live-map.tsx` — Leaflet + react-leaflet usage
- `src/components/maps/vehicle-marker.tsx` — Marker/divIcon pattern
- `src/components/maps/route-history-layer.tsx` — Polyline/CircleMarker pattern
- `src/lib/db/extensions/tenant-rls.ts` — `withTenantRLS` / `getTenantPrisma` behavior
- `src/lib/context/tenant-context.ts` — Tenant context helpers
- `package.json` — Installed packages (confirmed no dnd-kit, turf@7.3.4 installed)

### Secondary (MEDIUM confidence)

- react-leaflet v5 CircleMarker API: stable, matches existing Polyline usage in route-history-layer.tsx

---

## Metadata

**Confidence breakdown:**
- Schema design: HIGH — mirrors Load model pattern exactly, fully read from codebase
- Geofence integration: HIGH — geofence-check.ts fully read, pattern clear
- Route form extension: HIGH — route-form.tsx fully read, controlled state approach is clear
- Driver portal integration: HIGH — driver-routes.ts and route-detail-readonly.tsx fully read
- Migration SQL: HIGH — prior migrations fully read and pattern verified
- Leaflet stop markers: MEDIUM — CircleMarker is standard react-leaflet; route detail page has no map currently

**Research date:** 2026-02-26
**Valid until:** 2026-03-26 (stable libraries; 30-day window)
