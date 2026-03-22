/**
 * Samsara Fleet API client for GPS vehicle location sync.
 *
 * Uses plain fetch() against the Samsara REST API v1.
 * Fetches vehicle locations and writes GPSLocation records
 * matched by VIN to Truck records.
 */

import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

// ── Types ──────────────────────────────────────────────────────────

interface SamsaraVehicleLocation {
  id: string;
  name: string;
  vin: string;
  location: {
    latitude: number;
    longitude: number;
    speedMilesPerHour: number;
    heading: number;
    time: string; // ISO 8601
  };
}

interface SamsaraLocationsResponse {
  data: SamsaraVehicleLocation[];
  pagination?: {
    endCursor: string;
    hasNextPage: boolean;
  };
}

export interface SyncResult {
  synced: number;
  unmatched: string[];
}

// ── Fetch Samsara Locations ────────────────────────────────────────

/**
 * Fetch all vehicle locations from Samsara Fleet API.
 * Handles pagination automatically.
 */
export async function fetchSamsaraLocations(
  apiToken: string
): Promise<SamsaraVehicleLocation[]> {
  const allVehicles: SamsaraVehicleLocation[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL('https://api.samsara.com/fleet/vehicles/locations');
    if (cursor) {
      url.searchParams.set('after', cursor);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(
        `Samsara API error ${response.status}: ${errorText}`
      );
    }

    const body: SamsaraLocationsResponse = await response.json();

    if (body.data) {
      allVehicles.push(...body.data);
    }

    cursor = body.pagination?.hasNextPage
      ? body.pagination.endCursor
      : undefined;
  } while (cursor);

  return allVehicles;
}

// ── Sync Samsara Locations to GPSLocation table ────────────────────

/**
 * Orchestrates the full Samsara GPS sync:
 * 1. Fetch all vehicle positions from Samsara
 * 2. Load tenant trucks
 * 3. Match by VIN (normalized: trim + uppercase)
 * 4. Bulk-insert GPSLocation records
 */
export async function syncSamsaraLocations(
  tenantId: string,
  apiToken: string
): Promise<SyncResult> {
  // 1. Fetch locations from Samsara
  const samsaraVehicles = await fetchSamsaraLocations(apiToken);

  if (samsaraVehicles.length === 0) {
    return { synced: 0, unmatched: [] };
  }

  // 2. Load all trucks for this tenant (bypass RLS with set_config)
  const trucks = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
    return tx.truck.findMany({
      where: { tenantId },
      select: { id: true, vin: true },
    });
  }, TX_OPTIONS);

  // 3. Build VIN -> truckId lookup (normalized)
  const vinToTruckId = new Map<string, string>();
  for (const truck of trucks) {
    vinToTruckId.set(truck.vin.trim().toUpperCase(), truck.id);
  }

  // 4. Match and prepare GPS records
  const unmatched: string[] = [];
  const gpsRecords: Array<{
    tenantId: string;
    truckId: string;
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
    timestamp: Date;
  }> = [];

  for (const vehicle of samsaraVehicles) {
    if (!vehicle.vin || !vehicle.location) {
      continue;
    }

    const normalizedVin = vehicle.vin.trim().toUpperCase();
    const truckId = vinToTruckId.get(normalizedVin);

    if (!truckId) {
      unmatched.push(
        `${vehicle.name || 'Unknown'} (VIN: ${vehicle.vin})`
      );
      console.warn(
        `[Samsara Sync] Unmatched vehicle: ${vehicle.name} (VIN: ${vehicle.vin})`
      );
      continue;
    }

    const loc = vehicle.location;
    gpsRecords.push({
      tenantId,
      truckId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      speed: loc.speedMilesPerHour != null
        ? Math.round(loc.speedMilesPerHour)
        : null,
      heading: loc.heading != null ? Math.round(loc.heading) : null,
      timestamp: new Date(loc.time),
    });
  }

  // 5. Bulk insert (bypass RLS)
  if (gpsRecords.length > 0) {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, TRUE)`;
      // @ts-ignore - Prisma 7 extension type issue
      await tx.gPSLocation.createMany({ data: gpsRecords });
    }, TX_OPTIONS);
  }

  return {
    synced: gpsRecords.length,
    unmatched,
  };
}
