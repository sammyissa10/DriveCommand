'use server';

import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { VehicleLocation } from '@/lib/maps/map-utils';

/**
 * Get the latest GPS location for each vehicle in the fleet
 * Uses DISTINCT ON to fetch only the most recent position per truck
 */
export async function getLatestVehicleLocations(): Promise<VehicleLocation[]> {
  await requireRole([UserRole.OWNER, UserRole.MANAGER]);

  const db = await getTenantPrisma();
  const tenantId = await requireTenantId();

  // Use raw SQL with DISTINCT ON to get most recent GPS location per truck
  // @ts-ignore - Raw query typing
  const results = await db.$queryRaw`
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
