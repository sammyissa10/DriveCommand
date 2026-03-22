/**
 * Motive (KeepTruckin) Fleet API client for GPS vehicle location sync.
 *
 * Uses plain fetch() against the Motive REST API v1.
 * Fetches vehicle locations and writes GPSLocation records
 * matched by VIN to Truck records.
 */

import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

// ── Types ──────────────────────────────────────────────────────────

interface MotiveVehicle {
  id: number;
  number: string;
  vin: string;
  current_location: {
    lat: number;
    lon: number;
    speed: number;
    bearing: number;
    located_at: string; // ISO 8601
  };
}

interface MotiveVehiclesResponse {
  vehicles: MotiveVehicle[];
  pagination?: {
    per_page: number;
    page_no: number;
    total: number;
  };
}

export interface SyncResult {
  synced: number;
  unmatched: string[];
}

// ── Fetch Motive Locations ─────────────────────────────────────────

/**
 * Fetch all vehicle locations from Motive (KeepTruckin) Fleet API.
 * Handles pagination automatically.
 */
export async function fetchMotiveLocations(
  apiToken: string
): Promise<MotiveVehicle[]> {
  const allVehicles: MotiveVehicle[] = [];
  let pageNo = 1;

  do {
    const url = new URL('https://api.keeptruckin.com/v1/vehicles');
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page_no', String(pageNo));

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
        `Motive API error ${response.status}: ${errorText}`
      );
    }

    const body: MotiveVehiclesResponse = await response.json();

    if (body.vehicles) {
      allVehicles.push(...body.vehicles);
    }

    // Check if there are more pages
    const pagination = body.pagination;
    if (
      pagination &&
      pagination.total > pagination.page_no * pagination.per_page
    ) {
      pageNo++;
    } else {
      break;
    }
  } while (true);

  return allVehicles;
}

// ── Sync Motive Locations to GPSLocation table ─────────────────────

/**
 * Orchestrates the full Motive GPS sync:
 * 1. Fetch all vehicle positions from Motive
 * 2. Load tenant trucks
 * 3. Match by VIN (normalized: trim + uppercase)
 * 4. Bulk-insert GPSLocation records
 */
export async function syncMotiveLocations(
  tenantId: string,
  apiToken: string
): Promise<SyncResult> {
  // 1. Fetch locations from Motive
  const motiveVehicles = await fetchMotiveLocations(apiToken);

  if (motiveVehicles.length === 0) {
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

  for (const vehicle of motiveVehicles) {
    if (!vehicle.vin || !vehicle.current_location) {
      continue;
    }

    const normalizedVin = vehicle.vin.trim().toUpperCase();
    const truckId = vinToTruckId.get(normalizedVin);

    if (!truckId) {
      unmatched.push(
        `${vehicle.number || 'Unknown'} (VIN: ${vehicle.vin})`
      );
      console.warn(
        `[Motive Sync] Unmatched vehicle: ${vehicle.number} (VIN: ${vehicle.vin})`
      );
      continue;
    }

    const loc = vehicle.current_location;
    gpsRecords.push({
      tenantId,
      truckId,
      latitude: loc.lat,
      longitude: loc.lon,
      speed: loc.speed != null ? Math.round(loc.speed) : null,
      heading: loc.bearing != null ? Math.round(loc.bearing) : null,
      timestamp: new Date(loc.located_at),
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
