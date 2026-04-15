'use server';

import { requireRole } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId, tenantRawQuery } from '@/lib/context/tenant-context';
import { VehicleLocation } from '@/lib/maps/map-utils';
import { getVehicleStatus } from '@/lib/maps/vehicle-status';

// ─── Typed SQL result row interfaces ─────────────────────────────────────────

interface TruckGPSRow {
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
 * Get the latest GPS location for each vehicle in the fleet (enriched with driver + status)
 * Includes trucks with no GPS data (they appear with null lat/lng and 'no-location' status)
 * Used for SSR initial render of the live map page.
 */
export async function getLatestVehicleLocations(): Promise<VehicleLocation[]> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const tenantId = await requireTenantId();

  // Use tenantRawQuery to ensure RLS context is set for raw SQL
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
      WHERE t."tenantId" = ${tenantId}::uuid
        AND t."archivedAt" IS NULL
      ORDER BY t."licensePlate" ASC
    `
  )) as TruckGPSRow[];

  if (truckRows.length === 0) return [];

  const truckIds = truckRows.map((r: TruckGPSRow) => r.truckId);

  // Find drivers from active routes
  const routeDriverRows = (await tenantRawQuery((tx) =>
    tx.$queryRaw`
      SELECT r."truckId", u."firstName", u."lastName"
      FROM "Route" r
      JOIN "User" u ON r."driverId" = u.id
      WHERE r."tenantId" = ${tenantId}::uuid
        AND r.status = 'IN_PROGRESS'
        AND r."truckId" = ANY(${truckIds}::uuid[])
    `
  )) as DriverRow[];

  const driverMap = new Map<string, string>();
  for (const row of routeDriverRows) {
    driverMap.set(row.truckId, `${row.firstName} ${row.lastName}`);
  }

  // For trucks without an active route, check active loads
  const truckIdsNeedingLoadDriver = truckIds.filter((id: string) => !driverMap.has(id));
  if (truckIdsNeedingLoadDriver.length > 0) {
    const loadDriverRows = (await tenantRawQuery((tx) =>
      tx.$queryRaw`
        SELECT l."truckId", u."firstName", u."lastName"
        FROM "Load" l
        JOIN "User" u ON l."driverId" = u.id
        WHERE l."tenantId" = ${tenantId}::uuid
          AND l.status IN ('DISPATCHED', 'PICKED_UP', 'IN_TRANSIT')
          AND l."truckId" = ANY(${truckIdsNeedingLoadDriver}::uuid[])
        ORDER BY l."pickupDate" DESC
      `
    )) as DriverRow[];
    for (const row of loadDriverRows) {
      if (!driverMap.has(row.truckId)) {
        driverMap.set(row.truckId, `${row.firstName} ${row.lastName}`);
      }
    }
  }

  // Map rows to enriched VehicleLocation
  return truckRows.map((row: TruckGPSRow) => {
    const lat = row.latitude != null ? Number(row.latitude) : null;
    const lng = row.longitude != null ? Number(row.longitude) : null;
    const spd = row.speed != null ? Number(row.speed) : null;
    const hdg = row.heading != null ? Number(row.heading) : null;
    const ts = row.timestamp ?? null;
    const driverName = driverMap.get(row.truckId) ?? null;

    const status = getVehicleStatus(spd, ts ? new Date(ts) : null);

    return {
      id: row.gpsId ?? row.truckId,
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
}

/**
 * Get GPS route history for a vehicle
 * Returns GPS points for the specified time window (default: 24 hours)
 */
export async function getVehicleRouteHistory(
  truckId: string,
  hoursBack: number = 24
): Promise<Array<{ latitude: number; longitude: number; speed: number | null; timestamp: Date }>> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const cutoffTime = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

  const locations = await db.gPSLocation.findMany({
    where: {
      truckId,
      timestamp: { gte: cutoffTime },
    },
    orderBy: { timestamp: 'asc' },
    select: {
      latitude: true,
      longitude: true,
      speed: true,
      timestamp: true,
    },
  });

  // Convert Decimal lat/lng to Number
  return locations.map((loc: any) => ({
    latitude: Number(loc.latitude),
    longitude: Number(loc.longitude),
    speed: loc.speed,
    timestamp: loc.timestamp,
  }));
}

/**
 * Get comprehensive diagnostics for a vehicle
 * Returns truck info, latest GPS location, latest fuel record, engine state, and estimated fuel level
 */
export async function getVehicleDiagnostics(truckId: string) {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();

  // Fetch truck data, latest GPS, latest fuel, and active load in parallel
  const [truck, latestGPS, latestFuel, activeLoad] = await Promise.all([
    db.truck.findUnique({
      where: { id: truckId },
      select: {
        make: true,
        model: true,
        year: true,
        licensePlate: true,
        odometer: true,
      },
    }),
    db.gPSLocation.findFirst({
      where: { truckId },
      orderBy: { timestamp: 'desc' },
      select: {
        latitude: true,
        longitude: true,
        speed: true,
        heading: true,
        timestamp: true,
      },
    }),
    db.fuelRecord.findFirst({
      where: { truckId },
      orderBy: { timestamp: 'desc' },
      select: {
        quantity: true,
        timestamp: true,
        odometer: true,
      },
    }),
    db.load.findFirst({
      where: {
        truckId,
        status: { in: ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] },
      },
      orderBy: { pickupDate: 'desc' },
      select: {
        id: true,
        loadNumber: true,
        origin: true,
        destination: true,
        status: true,
        pickupDate: true,
        deliveryDate: true,
        driver: {
          select: {
            firstName: true,
            lastName: true,
          },
        },
      },
    }),
  ]);

  if (!truck) {
    throw new Error('Truck not found');
  }

  // Derive engine state from speed
  let engineState: 'running' | 'idle' | 'off' = 'off';
  if (latestGPS && latestGPS.speed !== null) {
    if (latestGPS.speed > 5) {
      engineState = 'running';
    } else if (latestGPS.speed > 0) {
      engineState = 'idle';
    }
  }

  // Estimate fuel level (simplified heuristic)
  let estimatedFuelLevel = 50; // Default to 50% if no fuel data
  if (latestFuel) {
    const milesSinceLastFill = truck.odometer - latestFuel.odometer;
    const estimatedGallonsUsed = milesSinceLastFill / 6; // Assume 6 MPG
    const estimatedGallonsRemaining = Math.max(
      0,
      Number(latestFuel.quantity) - estimatedGallonsUsed
    );
    estimatedFuelLevel = Math.round((estimatedGallonsRemaining / 150) * 100); // 150 gallon tank
    // Clamp to 0-100 range
    estimatedFuelLevel = Math.max(0, Math.min(100, estimatedFuelLevel));
  }

  return {
    truck,
    latestGPS: latestGPS
      ? {
          latitude: Number(latestGPS.latitude),
          longitude: Number(latestGPS.longitude),
          speed: latestGPS.speed,
          heading: latestGPS.heading,
          timestamp: latestGPS.timestamp,
        }
      : null,
    latestFuel: latestFuel
      ? {
          quantity: Number(latestFuel.quantity),
          timestamp: latestFuel.timestamp,
          odometer: latestFuel.odometer,
        }
      : null,
    engineState,
    estimatedFuelLevel,
    activeLoad: activeLoad
      ? {
          id: activeLoad.id,
          loadNumber: activeLoad.loadNumber,
          origin: activeLoad.origin,
          destination: activeLoad.destination,
          status: activeLoad.status as string,
          pickupDate: activeLoad.pickupDate,
          deliveryDate: activeLoad.deliveryDate,
          driverName: activeLoad.driver
            ? `${activeLoad.driver.firstName} ${activeLoad.driver.lastName}`
            : null,
        }
      : null,
  };
}
