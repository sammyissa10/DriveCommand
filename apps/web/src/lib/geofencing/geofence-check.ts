/**
 * Geofence arrival detection for loads.
 *
 * Called after each GPS ping. Checks if a driver's truck is within
 * GEOFENCE_RADIUS_KM of a load's pickup or delivery coordinates.
 * If so: advances load status, notifies dispatcher, notifies customer.
 *
 * All operations are fire-and-forget — errors logged, never thrown.
 *
 * @bypass_rls reason: system-operation
 * WHY: GPS ping processing is a system-level operation triggered by the GPS report
 *      endpoint (/api/gps/report), which has no user session — only a device token.
 *      The tenantId and driverId come from the validated GPS device token, not from
 *      an HTTP session context that RLS could use.
 * SCOPE: Reads Load + related models for the driver's active load, then writes
 *        Load.status and creates notifications — all scoped to tenantId + driverId.
 * SAFETY: tenantId and driverId are extracted from a cryptographically verified
 *         device/driver token by the GPS endpoint before calling this function.
 *         All write operations update only records matching tenantId + driverId.
 */

import { distance, point } from '@turf/turf';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendGeofenceAlert } from '@/lib/email/send-geofence-alert';
import { logger } from '@/lib/logger';
import { geocodeAddress } from '@/lib/geo/geocode';

const GEOFENCE_RADIUS_KM = 0.5; // 500 metres

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
    }, TX_OPTIONS);

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
          ({ lat: pickupLat, lng: pickupLng } = coords);
          // Cache geocoded coordinates for future pings
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            await tx.load.update({
              where: { id: load.id },
              data: { pickupLat: pickupLat!, pickupLng: pickupLng! },
            });
          }, TX_OPTIONS);
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
          }, TX_OPTIONS);

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
          }).catch((e) => logger.error('Geofence dispatcher alert failed:', e));

          // Notify customer via existing flow (non-blocking)
          notifyCustomer(load, 'PICKED_UP').catch((e) =>
            logger.error('Geofence customer notify failed:', e)
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
          ({ lat: deliveryLat, lng: deliveryLng } = coords);
          await prisma.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
            await tx.load.update({
              where: { id: load.id },
              data: { deliveryLat: deliveryLat!, deliveryLng: deliveryLng! },
            });
          }, TX_OPTIONS);
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
          }, TX_OPTIONS);

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
          }).catch((e) => logger.error('Geofence dispatcher alert failed:', e));

          notifyCustomer(load, 'DELIVERED').catch((e) =>
            logger.error('Geofence customer notify failed:', e)
          );
        }
      }
    }

    // ── RouteStop geofence (auto-arrive at next pending stop) ──────────
    const route = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.route.findFirst({
        where: {
          driverId,
          tenantId,
          status: { in: ['PLANNED', 'IN_PROGRESS'] },
        },
        include: {
          stops: {
            where: { status: 'PENDING', geofenceHit: false },
            orderBy: { position: 'asc' },
            take: 1, // Only the NEXT pending stop
          },
        },
      });
    }, TX_OPTIONS);

    if (route?.stops[0]) {
      const nextStop = route.stops[0];

      // Lazy geocode if lat/lng not cached
      let stopLat = nextStop.lat ? Number(nextStop.lat) : null;
      let stopLng = nextStop.lng ? Number(nextStop.lng) : null;

      if (stopLat === null || stopLng === null) {
        const coords = await geocodeAddress(nextStop.address);
        if (coords) {
          ({ lat: stopLat, lng: stopLng } = coords);
          // Cache geocoded coordinates on RouteStop row
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
        const stopTruckPoint = point([longitude, latitude]);
        const distKm = distance(stopTruckPoint, stopPoint, { units: 'kilometers' });

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
    }
  } catch (error) {
    logger.error('Geofence check error:', error);
  }
}

/**
 * Send customer email using the existing load-status notification.
 * Imported inline to avoid circular dep — replicates loads/actions.ts pattern.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    tenantId: load.tenantId,
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
