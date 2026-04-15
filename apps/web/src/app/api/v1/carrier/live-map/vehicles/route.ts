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

interface DispatchRow {
  truckId: string;
  routeId: string;
  routeName: string | null;
  origin: string;
  destination: string;
}

interface LoadCountRow {
  routeId: string;
  loadCount: number;
}

interface NextStopRow {
  routeId: string;
  nextStopAddress: string;
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

    // Step 3.5: Query active routes for dispatch context (PLANNED or IN_PROGRESS, scheduled today)
    const dispatchRows = (await tenantRawQuery((tx) =>
      tx.$queryRaw`
        SELECT r.id AS "routeId", r."truckId", r.name AS "routeName", r.origin, r.destination
        FROM "Route" r
        WHERE r."tenantId" = ${orgId}::uuid
          AND r.status IN ('PLANNED', 'IN_PROGRESS')
          AND r."truckId" = ANY(${truckIds}::uuid[])
          AND r."scheduledDate"::date = CURRENT_DATE
          AND r."archivedAt" IS NULL
      `
    )) as DispatchRow[];

    // Build truckId → dispatch info map
    const dispatchMap = new Map<string, { routeId: string; routeName: string }>();
    for (const row of dispatchRows) {
      if (!dispatchMap.has(row.truckId)) {
        // Use route name if set; otherwise derive from origin > destination (city only)
        const originCity = row.origin.includes(',') ? row.origin.split(',')[0].trim() : row.origin;
        const destCity = row.destination.includes(',') ? row.destination.split(',')[0].trim() : row.destination;
        const routeName = row.routeName ?? `Route: ${originCity} > ${destCity}`;
        dispatchMap.set(row.truckId, { routeId: row.routeId, routeName });
      }
    }

    // Gather load counts and next pending stop for all active route IDs in one batch each
    const activeRouteIds = [...dispatchMap.values()].map((d) => d.routeId);

    const loadCountMap = new Map<string, number>();
    const nextStopMap = new Map<string, string>();

    if (activeRouteIds.length > 0) {
      const loadCountRows = (await tenantRawQuery((tx) =>
        tx.$queryRaw`
          SELECT l."routeId", COUNT(*)::int AS "loadCount"
          FROM "Load" l
          WHERE l."routeId" = ANY(${activeRouteIds}::uuid[])
            AND l."tenantId" = ${orgId}::uuid
            AND l."archivedAt" IS NULL
          GROUP BY l."routeId"
        `
      )) as LoadCountRow[];

      for (const row of loadCountRows) {
        loadCountMap.set(row.routeId, row.loadCount);
      }

      const nextStopRows = (await tenantRawQuery((tx) =>
        tx.$queryRaw`
          SELECT DISTINCT ON (rs."routeId")
            rs."routeId", rs.address AS "nextStopAddress"
          FROM "RouteStop" rs
          WHERE rs."routeId" = ANY(${activeRouteIds}::uuid[])
            AND rs."tenantId" = ${orgId}::uuid
            AND rs.status = 'PENDING'
          ORDER BY rs."routeId", rs.position ASC
        `
      )) as NextStopRow[];

      for (const row of nextStopRows) {
        nextStopMap.set(row.routeId, row.nextStopAddress);
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

      const dispatchEntry = dispatchMap.get(row.truckId) ?? null;
      const dispatch = dispatchEntry
        ? {
            routeName: dispatchEntry.routeName,
            loadCount: loadCountMap.get(dispatchEntry.routeId) ?? 0,
            nextStopAddress: nextStopMap.get(dispatchEntry.routeId) ?? null,
          }
        : null;

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
        dispatch,
      };
    });

    return NextResponse.json({ data: vehicles });
  } catch (error) {
    logger.error('Live map vehicles error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
