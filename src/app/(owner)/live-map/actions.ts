'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { VehicleLocation } from '@/lib/maps/map-utils';

/**
 * Get the latest GPS location for each vehicle in the fleet
 * Uses DISTINCT ON to fetch only the most recent position per truck
 * Optionally filters by tag
 */
export async function getLatestVehicleLocations(tagId?: string): Promise<VehicleLocation[]> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();

  // Build query with conditional tag filter
  // @ts-ignore - Raw query typing
  const results = tagId
    ? await db.$queryRaw`
        SELECT DISTINCT ON (gps."truckId")
          gps.id, gps."truckId", gps.latitude, gps.longitude, gps.speed, gps.heading, gps.timestamp,
          t.make, t.model, t."licensePlate"
        FROM "GPSLocation" gps
        INNER JOIN "Truck" t ON gps."truckId" = t.id
        INNER JOIN "TagAssignment" ta ON ta."truckId" = t.id AND ta."tagId" = ${tagId}::uuid
        WHERE gps."tenantId" = ${tenantId}::uuid
        ORDER BY gps."truckId", gps.timestamp DESC
      `
    : await db.$queryRaw`
        SELECT DISTINCT ON (gps."truckId")
          gps.id, gps."truckId", gps.latitude, gps.longitude, gps.speed, gps.heading, gps.timestamp,
          t.make, t.model, t."licensePlate"
        FROM "GPSLocation" gps
        INNER JOIN "Truck" t ON gps."truckId" = t.id
        WHERE gps."tenantId" = ${tenantId}::uuid
        ORDER BY gps."truckId", gps.timestamp DESC
      `;

  // Map results and convert Decimal lat/lng to Number
  return (results as any[]).map((row) => ({
    id: row.id,
    truckId: row.truckId,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    speed: row.speed ? Number(row.speed) : null,
    heading: row.heading ? Number(row.heading) : null,
    timestamp: row.timestamp,
    truck: {
      make: row.make,
      model: row.model,
      licensePlate: row.licensePlate,
    },
  }));
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

  // @ts-ignore - Prisma 7 extension type issue
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

  // Fetch truck data, latest GPS, and latest fuel in parallel
  const [truck, latestGPS, latestFuel] = await Promise.all([
    // @ts-ignore - Prisma 7 extension type issue
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
    // @ts-ignore - Prisma 7 extension type issue
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
    // @ts-ignore - Prisma 7 extension type issue
    db.fuelRecord.findFirst({
      where: { truckId },
      orderBy: { timestamp: 'desc' },
      select: {
        quantity: true,
        timestamp: true,
        odometer: true,
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
  };
}
