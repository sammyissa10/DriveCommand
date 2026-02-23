---
phase: quick-20
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - prisma/schema.prisma
  - src/app/api/gps/report/route.ts
  - src/lib/geofencing/geofence-check.ts
  - src/lib/email/send-geofence-alert.ts
  - src/emails/geofence-arrival-alert.tsx
autonomous: true

must_haves:
  truths:
    - "When a truck arrives within 500m of a load's pickup address, the load status auto-advances from DISPATCHED to PICKED_UP"
    - "When a truck arrives within 500m of a load's delivery address, the load status auto-advances from IN_TRANSIT to DELIVERED"
    - "Dispatcher (OWNER/MANAGER users in the tenant) receive an email alert when a truck arrives at any stop"
    - "Customer receives the existing load-status notification email on auto-advance (reuses existing sendNotificationAndLogInteraction)"
    - "Arrival alerts are not sent twice for the same stop (idempotent per load + stop type)"
  artifacts:
    - path: "src/lib/geofencing/geofence-check.ts"
      provides: "Haversine distance calculation and geofence trigger logic"
    - path: "src/lib/email/send-geofence-alert.ts"
      provides: "Dispatcher email send helper for arrival alerts"
    - path: "src/emails/geofence-arrival-alert.tsx"
      provides: "React Email template for dispatcher arrival notification"
    - path: "src/app/api/gps/report/route.ts"
      provides: "GPS report endpoint — extended with geofence check after each ping"
  key_links:
    - from: "src/app/api/gps/report/route.ts"
      to: "src/lib/geofencing/geofence-check.ts"
      via: "checkGeofenceAndAlert() called after GPSLocation saved"
      pattern: "checkGeofenceAndAlert"
    - from: "src/lib/geofencing/geofence-check.ts"
      to: "prisma.load (status update)"
      via: "prisma.$transaction with bypass_rls"
      pattern: "load\\.update.*status"
    - from: "src/lib/geofencing/geofence-check.ts"
      to: "src/lib/email/send-geofence-alert.ts"
      via: "sendGeofenceAlert() called on arrival detection"
      pattern: "sendGeofenceAlert"
---

<objective>
Auto-detect truck arrival at load pickup and delivery stops using GPS geofencing, advance load status automatically, and notify dispatcher and customer.

Purpose: Dispatchers currently must manually update load status as drivers call or text to report arrivals. Geofencing removes that manual step — GPS pings auto-trigger status transitions and send notifications to dispatcher and customer the moment the truck enters a stop's radius.

Output:
- Schema: `pickupLat`, `pickupLng`, `deliveryLat`, `deliveryLng`, `geofenceFlags` added to Load
- Geofence check library: haversine distance + trigger logic
- Dispatcher email template + send helper
- GPS report API extended: geofence check fires after each ping (fire-and-forget)
</objective>

<execution_context>
@C:/Users/sammy/.claude/get-shit-done/workflows/execute-plan.md
@C:/Users/sammy/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Schema migration — add geofence coordinate fields to Load</name>
  <files>prisma/schema.prisma</files>
  <action>
Add the following nullable fields to the `Load` model in `prisma/schema.prisma`:

```prisma
pickupLat    Decimal? @db.Decimal(10, 8)   // Geocoded from origin address
pickupLng    Decimal? @db.Decimal(11, 8)
deliveryLat  Decimal? @db.Decimal(10, 8)   // Geocoded from destination address
deliveryLng  Decimal? @db.Decimal(11, 8)
geofenceFlags Json?                         // JSONB: tracks which alerts have fired
                                            // shape: { pickupAlerted: boolean, deliveryAlerted: boolean }
```

Place these fields before the `createdAt` field in the Load model. All fields are nullable — existing loads will have null coordinates and will be geocoded lazily on first GPS ping.

After editing the schema file, run:
```
npx prisma db push
```

Do NOT run `prisma migrate dev` — the project uses `db push` (consistent with quick-7, quick-9, quick-14 patterns).
  </action>
  <verify>
Run `npx prisma db push` — should output "Your database is now in sync with your Prisma schema."
Run `npx prisma generate` to regenerate the Prisma client.
Run `npx tsc --noEmit` to confirm no type errors from the schema change.
  </verify>
  <done>
`prisma/schema.prisma` Load model contains all 5 new fields. `db push` exits cleanly. TypeScript compiles without errors.
  </done>
</task>

<task type="auto">
  <name>Task 2: Geofence library, dispatcher email, and GPS report extension</name>
  <files>
    src/lib/geofencing/geofence-check.ts
    src/lib/email/send-geofence-alert.ts
    src/emails/geofence-arrival-alert.tsx
    src/app/api/gps/report/route.ts
  </files>
  <action>
**A. Create `src/lib/geofencing/geofence-check.ts`**

This module does the heavy lifting: geocoding, distance check, status transition, notifications.

```typescript
/**
 * Geofence arrival detection for loads.
 *
 * Called after each GPS ping. Checks if a driver's truck is within
 * GEOFENCE_RADIUS_KM of a load's pickup or delivery coordinates.
 * If so: advances load status, notifies dispatcher, notifies customer.
 *
 * All operations are fire-and-forget — errors logged, never thrown.
 */

import { distance, point } from '@turf/turf';
import { prisma } from '@/lib/db/prisma';
import { sendGeofenceAlert } from '@/lib/email/send-geofence-alert';

const GEOFENCE_RADIUS_KM = 0.5; // 500 metres

/**
 * Geocode an address string using Nominatim (OpenStreetMap).
 * Returns [lat, lng] or null if geocoding fails.
 * Free, no API key required. Respects OSM usage policy (low-volume requests only).
 */
async function geocodeAddress(address: string): Promise<[number, number] | null> {
  try {
    const encoded = encodeURIComponent(address);
    const url = `https://nominatim.openstreetmap.org/search?q=${encoded}&format=json&limit=1`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'DriveCommand/1.0 fleet-management' },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.length) return null;
    return [parseFloat(data[0].lat), parseFloat(data[0].lon)];
  } catch {
    return null;
  }
}

/**
 * Main geofence check. Called after each successful GPS ping.
 * Errors are caught and logged — never thrown to the caller.
 */
export async function checkGeofenceAndAlert(params: {
  tenantId: string;
  driverId: string;
  truckId: string;
  latitude: number;
  longitude: number;
}): Promise<void> {
  try {
    const { tenantId, driverId, truckId, latitude, longitude } = params;

    // Find active load for this driver/truck with relevant status
    const load = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.load.findFirst({
        where: {
          tenantId,
          truckId,
          driverId,
          status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] },
        },
        include: {
          customer: { select: { email: true, contactName: true, companyName: true, emailNotifications: true } },
          driver: { select: { firstName: true, lastName: true } },
          truck: { select: { make: true, model: true, licensePlate: true } },
        },
      });
    });

    if (!load) return;

    // Read geofence flags (default all false)
    const flags = (load.geofenceFlags as { pickupAlerted?: boolean; deliveryAlerted?: boolean } | null) ?? {};

    const truckPoint = point([longitude, latitude]);

    // ── Pickup geofence (DISPATCHED → PICKED_UP) ─────────────────────────
    if (load.status === 'DISPATCHED' && !flags.pickupAlerted) {
      // Ensure pickup coordinates are cached on the Load record
      let pickupLat = load.pickupLat ? Number(load.pickupLat) : null;
      let pickupLng = load.pickupLng ? Number(load.pickupLng) : null;

      if (pickupLat === null || pickupLng === null) {
        const coords = await geocodeAddress(load.origin);
        if (coords) {
          [pickupLat, pickupLng] = coords;
          // Cache geocoded coordinates for future pings
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            await tx.load.update({
              where: { id: load.id },
              data: { pickupLat: pickupLat!, pickupLng: pickupLng! },
            });
          });
        }
      }

      if (pickupLat !== null && pickupLng !== null) {
        const pickupPoint = point([pickupLng, pickupLat]);
        const distKm = distance(truckPoint, pickupPoint, { units: 'kilometers' });

        if (distKm <= GEOFENCE_RADIUS_KM) {
          // Advance status and mark alert as sent (atomic)
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            await tx.load.update({
              where: { id: load.id },
              data: {
                status: 'PICKED_UP',
                geofenceFlags: { ...flags, pickupAlerted: true },
              },
            });
          });

          // Notify dispatcher (non-blocking)
          sendGeofenceAlert({
            tenantId,
            loadId: load.id,
            loadNumber: load.loadNumber,
            stopType: 'pickup',
            stopAddress: load.origin,
            driverName: load.driver
              ? `${load.driver.firstName || ''} ${load.driver.lastName || ''}`.trim()
              : 'Driver',
            licensePlate: load.truck?.licensePlate ?? '',
          }).catch((e) => console.error('Geofence dispatcher alert failed:', e));

          // Notify customer via existing flow (non-blocking)
          notifyCustomer(load, 'PICKED_UP').catch((e) =>
            console.error('Geofence customer notify failed:', e)
          );
        }
      }
    }

    // ── Delivery geofence (IN_TRANSIT → DELIVERED) ────────────────────────
    if (load.status === 'IN_TRANSIT' && !flags.deliveryAlerted) {
      let deliveryLat = load.deliveryLat ? Number(load.deliveryLat) : null;
      let deliveryLng = load.deliveryLng ? Number(load.deliveryLng) : null;

      if (deliveryLat === null || deliveryLng === null) {
        const coords = await geocodeAddress(load.destination);
        if (coords) {
          [deliveryLat, deliveryLng] = coords;
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            await tx.load.update({
              where: { id: load.id },
              data: { deliveryLat: deliveryLat!, deliveryLng: deliveryLng! },
            });
          });
        }
      }

      if (deliveryLat !== null && deliveryLng !== null) {
        const deliveryPoint = point([deliveryLng, deliveryLat]);
        const distKm = distance(truckPoint, deliveryPoint, { units: 'kilometers' });

        if (distKm <= GEOFENCE_RADIUS_KM) {
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            await tx.load.update({
              where: { id: load.id },
              data: {
                status: 'DELIVERED',
                geofenceFlags: { ...flags, deliveryAlerted: true },
              },
            });
          });

          sendGeofenceAlert({
            tenantId,
            loadId: load.id,
            loadNumber: load.loadNumber,
            stopType: 'delivery',
            stopAddress: load.destination,
            driverName: load.driver
              ? `${load.driver.firstName || ''} ${load.driver.lastName || ''}`.trim()
              : 'Driver',
            licensePlate: load.truck?.licensePlate ?? '',
          }).catch((e) => console.error('Geofence dispatcher alert failed:', e));

          notifyCustomer(load, 'DELIVERED').catch((e) =>
            console.error('Geofence customer notify failed:', e)
          );
        }
      }
    }
  } catch (error) {
    console.error('Geofence check error:', error);
  }
}

/**
 * Send customer email using the existing load-status notification.
 * Imported inline to avoid circular dep — replicates loads/actions.ts pattern.
 */
async function notifyCustomer(load: any, newStatus: string): Promise<void> {
  if (!load.customer?.email || !load.customer.emailNotifications) return;

  const { sendLoadStatusEmail } = await import('@/lib/email/customer-notifications');

  const driverName = load.driver
    ? `${load.driver.firstName || ''} ${load.driver.lastName || ''}`.trim() || 'Assigned Driver'
    : 'TBD';
  const truckInfo = load.truck
    ? `${load.truck.make} ${load.truck.model} (${load.truck.licensePlate})`
    : 'TBD';

  await sendLoadStatusEmail(load.customer.email, {
    customerName: load.customer.contactName || load.customer.companyName,
    loadNumber: load.loadNumber,
    status: newStatus,
    origin: load.origin,
    destination: load.destination,
    driverName,
    truckInfo,
    trackingUrl: `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.drivecommand.com'}/loads/${load.id}`,
  });
}
```

**B. Create `src/emails/geofence-arrival-alert.tsx`**

React Email template for dispatcher notification:

```tsx
import {
  Html, Head, Body, Container, Section, Text, Button, Hr,
} from '@react-email/components';

export interface GeofenceArrivalAlertProps {
  loadNumber: string;
  stopType: 'pickup' | 'delivery';
  stopAddress: string;
  driverName: string;
  licensePlate: string;
  loadUrl: string;
}

export function GeofenceArrivalAlert({
  loadNumber,
  stopType,
  stopAddress,
  driverName,
  licensePlate,
  loadUrl,
}: GeofenceArrivalAlertProps) {
  const isPickup = stopType === 'pickup';
  const headerColor = isPickup ? '#1e40af' : '#059669';
  const stopLabel = isPickup ? 'Pickup Location' : 'Delivery Location';
  const headline = isPickup
    ? `Truck arrived at pickup — Load ${loadNumber}`
    : `Truck arrived at delivery — Load ${loadNumber}`;

  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f6f9fc', fontFamily: 'system-ui, sans-serif' }}>
        <Container style={{ margin: '0 auto', padding: '20px 0', maxWidth: '600px' }}>
          <Section style={{ backgroundColor: headerColor, padding: '20px', borderRadius: '8px 8px 0 0' }}>
            <Text style={{ color: '#ffffff', fontSize: '22px', fontWeight: 'bold', margin: 0, textAlign: 'center' as const }}>
              {headline}
            </Text>
          </Section>

          <Section style={{ backgroundColor: '#ffffff', padding: '32px', borderRadius: '0 0 8px 8px' }}>
            <Text style={{ fontSize: '14px', color: '#374151', margin: '0 0 24px' }}>
              GPS geofencing detected the truck entering the {stopType} zone.
              The load status has been automatically updated.
            </Text>

            <Section style={{ backgroundColor: '#f9fafb', padding: '20px', borderRadius: '6px', border: '1px solid #e5e7eb', marginBottom: '24px' }}>
              <Text style={{ fontSize: '14px', margin: '6px 0', color: '#374151' }}>
                <strong>Load #:</strong> {loadNumber}
              </Text>
              <Hr style={{ borderColor: '#e5e7eb', margin: '12px 0' }} />
              <Text style={{ fontSize: '14px', margin: '6px 0', color: '#374151' }}>
                <strong>{stopLabel}:</strong> {stopAddress}
              </Text>
              <Text style={{ fontSize: '14px', margin: '6px 0', color: '#374151' }}>
                <strong>Driver:</strong> {driverName}
              </Text>
              <Text style={{ fontSize: '14px', margin: '6px 0', color: '#374151' }}>
                <strong>Truck:</strong> {licensePlate}
              </Text>
            </Section>

            <Section style={{ textAlign: 'center' as const }}>
              <Button
                href={loadUrl}
                style={{ backgroundColor: headerColor, color: '#ffffff', padding: '12px 32px', borderRadius: '6px', fontSize: '15px', fontWeight: 'bold', textDecoration: 'none', display: 'inline-block' }}
              >
                View Load
              </Button>
            </Section>
          </Section>

          <Section style={{ marginTop: '24px' }}>
            <Text style={{ fontSize: '12px', color: '#9ca3af', textAlign: 'center' as const, margin: 0 }}>
              DriveCommand — Automated Geofence Alert
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
```

**C. Create `src/lib/email/send-geofence-alert.ts`**

Find all OWNER and MANAGER users for the tenant, send each an arrival alert email:

```typescript
import { prisma } from '@/lib/db/prisma';
import { resend, FROM_EMAIL } from './resend-client';
import { GeofenceArrivalAlert } from '@/emails/geofence-arrival-alert';

export interface GeofenceAlertData {
  tenantId: string;
  loadId: string;
  loadNumber: string;
  stopType: 'pickup' | 'delivery';
  stopAddress: string;
  driverName: string;
  licensePlate: string;
}

/**
 * Send arrival alert to all OWNER and MANAGER users in the tenant.
 * Throws on failure so caller can catch and log.
 */
export async function sendGeofenceAlert(data: GeofenceAlertData): Promise<void> {
  // Find dispatcher email addresses (bypass RLS — called from non-session context)
  const dispatchers = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.user.findMany({
      where: {
        tenantId: data.tenantId,
        role: { in: ['OWNER', 'MANAGER'] },
        isActive: true,
      },
      select: { email: true },
    });
  });

  if (!dispatchers.length) return;

  const loadUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://app.drivecommand.com'}/loads/${data.loadId}`;
  const stopLabel = data.stopType === 'pickup' ? 'Pickup' : 'Delivery';
  const subject = `Truck arrived at ${stopLabel} — Load ${data.loadNumber}`;

  const emails = dispatchers.map((d) => d.email);

  await resend.emails.send({
    from: FROM_EMAIL,
    to: emails,
    subject,
    react: GeofenceArrivalAlert({
      loadNumber: data.loadNumber,
      stopType: data.stopType,
      stopAddress: data.stopAddress,
      driverName: data.driverName,
      licensePlate: data.licensePlate,
      loadUrl,
    }),
  });
}
```

**D. Extend `src/app/api/gps/report/route.ts`**

After step 7 (return success), add a fire-and-forget geofence check. Import `checkGeofenceAndAlert` at the top of the file. After the GPSLocation record is created (after the prisma transaction in step 6), add:

```typescript
// 7. Fire geofence check — fire-and-forget, never blocks GPS response
checkGeofenceAndAlert({
  tenantId: session.tenantId,
  driverId: session.userId,
  truckId: route.truckId,
  latitude,
  longitude,
}).catch((e) => console.error('Geofence check error:', e));

// 8. Return success
return NextResponse.json({ ok: true }, { status: 201 });
```

Add the import at the top of the file:
```typescript
import { checkGeofenceAndAlert } from '@/lib/geofencing/geofence-check';
```

The existing step numbering (steps 1-7) remains unchanged. The geofence check becomes step 7 (non-blocking) and the return becomes step 8.
  </action>
  <verify>
Run `npx tsc --noEmit` — should pass with no errors.
Run `npx next build` to confirm no build errors.
Simulate geofence trigger manually:
  1. Note a DISPATCHED load's id, its origin address, and the assigned truck/driver ids.
  2. POST to `/api/gps/report` with lat/lng matching the origin address coordinates (use Nominatim search: `https://nominatim.openstreetmap.org/search?q=<origin>&format=json` to get coords).
  3. Verify: load status in DB changed to `PICKED_UP`, `geofenceFlags.pickupAlerted = true`, dispatcher received email.
  </verify>
  <done>
TypeScript compiles clean. `next build` succeeds. Geofencing library, email template, and send helper all exist. GPS report route imports and calls `checkGeofenceAndAlert` in fire-and-forget pattern. A GPS ping within 500m of a load's pickup transitions status DISPATCHED→PICKED_UP. A ping within 500m of delivery transitions IN_TRANSIT→DELIVERED. Each alert fires only once per stop per load (idempotent via geofenceFlags JSON). Dispatchers receive arrival email. Customer receives existing load-status email.
  </done>
</task>

</tasks>

<verification>
- `prisma/schema.prisma` Load model has: `pickupLat`, `pickupLng`, `deliveryLat`, `deliveryLng` (Decimal nullable), `geofenceFlags` (Json nullable)
- `npx prisma db push` ran cleanly
- `src/lib/geofencing/geofence-check.ts` exports `checkGeofenceAndAlert`
- `src/emails/geofence-arrival-alert.tsx` exports `GeofenceArrivalAlert`
- `src/lib/email/send-geofence-alert.ts` exports `sendGeofenceAlert`
- `src/app/api/gps/report/route.ts` calls `checkGeofenceAndAlert` after GPS save (fire-and-forget)
- `npx tsc --noEmit` passes
- `npx next build` passes
</verification>

<success_criteria>
GPS pings within 500m of a load's pickup or delivery stop automatically:
1. Advance the load status (DISPATCHED→PICKED_UP or IN_TRANSIT→DELIVERED)
2. Email all dispatcher/owner users in the tenant with an arrival alert
3. Email the customer using the existing load-status notification
4. Never fire the same alert twice for the same stop
5. Never slow down or error the GPS ping response (fire-and-forget pattern)
</success_criteria>

<output>
After completion, create `.planning/quick/20-geofencing-alerts-auto-detect-truck-arri/20-SUMMARY.md` using the summary template.
Update `.planning/STATE.md` to record quick-20 as complete.
</output>
