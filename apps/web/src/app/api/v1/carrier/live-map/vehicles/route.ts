import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { tenantRawQuery } from '@/lib/context/tenant-context';
import { getVehicleStatus } from '@/lib/maps/vehicle-status';
import { VehicleLocation } from '@/lib/maps/map-utils';
import { logger } from '@/lib/logger';

interface TruckRow {
  truckId: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  licensePlate: string;
  gpsId: string | null;
  latitude: unknown;
  longitude: unknown;
  speed: number | null;
  heading: number | null;
  timestamp: Date | null;
}

interface DriverRow {
  truckId: string;
  firstName: string;
  lastName: string;
}

/**
 * GET /api/v1/carrier/live-map/vehicles
 *
 * Returns all trucks for the tenant, enriched with their latest GPS ping,
 * currently assigned driver, and computed status. Trucks with no GPS data
 * are included with null lat/lng and status = 'no-location'.
 *
 * Used by the live map sidebar and vehicle list for 30-second polling.
 */
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const orgId = session.tenantId;
    if (!orgId) {
      return NextResponse.json({ error: 'No organization' }, { status: 403 });
    }

    // Step 1: Fetch all active trucks with their latest GPS ping (LEFT JOIN so no-GPS trucks included)
    const truckRows = (await tenantRawQuery((tx) =>
      tx.$queryRaw`
        SELECT
          t.id AS "truckId",
          t.make,
          t.model,
          t.year,
          t.vin,
          t."licensePlate",
          gps.id AS "gpsId",
          gps.latitude,
          gps.longitude,
          gps.speed,
          gps.heading,
          gps.timestamp
        FROM "Truck" t
        LEFT JOIN LATERAL (
          SELECT g.id, g.latitude, g.longitude, g.speed, g.heading, g.timestamp
          FROM "GPSLocation" g
          WHERE g."truckId" = t.id
          ORDER BY g.timestamp DESC
          LIMIT 1
        ) gps ON TRUE
        WHERE t."tenantId" = ${orgId}::uuid
          AND t."archivedAt" IS NULL
        ORDER BY t."licensePlate" ASC
      `
    )) as TruckRow[];

    if (truckRows.length === 0) {
      return NextResponse.json({ data: [] });
    }

    const truckIds = truckRows.map((r: TruckRow) => r.truckId);

    // Step 2: Find driver from active routes (IN_PROGRESS)
    const routeDriverRows = (await tenantRawQuery((tx) =>
      tx.$queryRaw`
        SELECT r."truckId", u."firstName", u."lastName"
        FROM "Route" r
        JOIN "User" u ON r."driverId" = u.id
        WHERE r."tenantId" = ${orgId}::uuid
          AND r.status = 'IN_PROGRESS'
          AND r."truckId" = ANY(${truckIds}::uuid[])
      `
    )) as DriverRow[];

    // Build truckId → driverName map from routes
    const driverMap = new Map<string, string>();
    for (const row of routeDriverRows) {
      driverMap.set(row.truckId, `${row.firstName} ${row.lastName}`);
    }

    // Step 3: For trucks not covered by an active route, check active loads
    const truckIdsWithRouteDriver = new Set(driverMap.keys());
    const truckIdsNeedingLoadDriver = truckIds.filter(
      (id: string) => !truckIdsWithRouteDriver.has(id)
    );

    if (truckIdsNeedingLoadDriver.length > 0) {
      const loadDriverRows = (await tenantRawQuery((tx) =>
        tx.$queryRaw`
          SELECT l."truckId", u."firstName", u."lastName"
          FROM "Load" l
          JOIN "User" u ON l."driverId" = u.id
          WHERE l."tenantId" = ${orgId}::uuid
            AND l.status IN ('DISPATCHED', 'PICKED_UP', 'IN_TRANSIT')
            AND l."truckId" = ANY(${truckIdsNeedingLoadDriver}::uuid[])
          ORDER BY l."pickupDate" DESC
        `
      )) as DriverRow[];

      // Use first matching load driver per truck
      for (const row of loadDriverRows) {
        if (!driverMap.has(row.truckId)) {
          driverMap.set(row.truckId, `${row.firstName} ${row.lastName}`);
        }
      }
    }

    // Step 4: Map to VehicleLocation
    const vehicles: VehicleLocation[] = truckRows.map((row: TruckRow) => {
      const lat = row.latitude != null ? Number(row.latitude) : null;
      const lng = row.longitude != null ? Number(row.longitude) : null;
      const spd = row.speed != null ? Number(row.speed) : null;
      const hdg = row.heading != null ? Number(row.heading) : null;
      const ts = row.timestamp ?? null;
      const driverName = driverMap.get(row.truckId) ?? null;

      const status = getVehicleStatus(spd, ts ? new Date(ts) : null);

      return {
        id: row.gpsId ?? row.truckId, // fallback to truckId if no GPS row
        truckId: row.truckId,
        latitude: lat,
        longitude: lng,
        speed: spd,
        heading: hdg,
        timestamp: ts,
        truck: {
          make: row.make,
          model: row.model,
          licensePlate: row.licensePlate,
          year: row.year,
          vin: row.vin,
        },
        driver: driverName ? { name: driverName } : null,
        status,
      };
    });

    return NextResponse.json({ data: vehicles });
  } catch (error) {
    logger.error('Live map vehicles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
