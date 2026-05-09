/**
 * RouteStop auto-create/delete/resequence utility.
 *
 * Called inside Prisma transactions whenever a Load is assigned to or removed from a Route.
 * Maintains the invariant: every Load on a Route has exactly two RouteStops —
 * a PICKUP stop (from load.origin) and a DELIVERY stop (from load.destination).
 *
 * Stop sequencing: all PICKUP stops first (1..N, ordered by existing position),
 * then all DELIVERY stops (N+1..N+M, ordered by existing position). 1-based.
 */

import type { Prisma } from '@/generated/prisma';

type TransactionClient = Prisma.TransactionClient;

interface LoadForSync {
  id: string;
  origin: string;
  destination: string;
  pickupLat: Prisma.Decimal | number | null;
  pickupLng: Prisma.Decimal | number | null;
  deliveryLat: Prisma.Decimal | number | null;
  deliveryLng: Prisma.Decimal | number | null;
}

interface CreateRouteStopsParams {
  routeId: string;
  tenantId: string;
  load: LoadForSync;
}

/**
 * Create PICKUP and DELIVERY RouteStops for a load being assigned to a route.
 * Calls resequenceRouteStops after creation.
 * Must be called inside a Prisma $transaction.
 *
 * Returns { pickupStopId, deliveryStopId } — caller should update the Load with these.
 */
export async function createRouteStopsForLoad(
  tx: TransactionClient,
  params: CreateRouteStopsParams
): Promise<{ pickupStopId: string; deliveryStopId: string }> {
  const { routeId, tenantId, load } = params;

  // Determine next position (will be resequenced after, but need a placeholder)
  const existingCount = await tx.routeStop.count({ where: { routeId } });

  const pickupStop = await tx.routeStop.create({
    data: {
      routeId,
      tenantId,
      loadId: load.id,
      type: 'PICKUP',
      address: load.origin,
      lat: load.pickupLat != null ? load.pickupLat : null,
      lng: load.pickupLng != null ? load.pickupLng : null,
      position: existingCount + 1,
      status: 'PENDING',
      geofenceHit: false,
    },
    select: { id: true },
  });

  const deliveryStop = await tx.routeStop.create({
    data: {
      routeId,
      tenantId,
      loadId: load.id,
      type: 'DELIVERY',
      address: load.destination,
      lat: load.deliveryLat != null ? load.deliveryLat : null,
      lng: load.deliveryLng != null ? load.deliveryLng : null,
      position: existingCount + 2,
      status: 'PENDING',
      geofenceHit: false,
    },
    select: { id: true },
  });

  // Update load with stop IDs
  await tx.load.update({
    where: { id: load.id },
    data: {
      pickupStopId: pickupStop.id,
      deliveryStopId: deliveryStop.id,
    },
  });

  // Resequence: all PICKUPs first, then all DELIVERYs
  await resequenceRouteStops(tx, routeId);

  return {
    pickupStopId: pickupStop.id,
    deliveryStopId: deliveryStop.id,
  };
}

/**
 * Delete RouteStops for a load being removed from a route.
 * Nulls out pickupStopId/deliveryStopId on the Load.
 * Calls resequenceRouteStops after deletion.
 * Must be called inside a Prisma $transaction.
 */
export async function deleteRouteStopsForLoad(
  tx: TransactionClient,
  params: { routeId: string; loadId: string }
): Promise<void> {
  const { routeId, loadId } = params;

  // Null out the stop IDs on the load first (foreign key constraint)
  await tx.load.update({
    where: { id: loadId },
    data: {
      pickupStopId: null,
      deliveryStopId: null,
    },
  });

  // Delete stops belonging to this load on this route
  await tx.routeStop.deleteMany({
    where: { routeId, loadId },
  });

  // Resequence remaining stops
  await resequenceRouteStops(tx, routeId);
}

/**
 * Full resequence of all stops for a route.
 * Order: all PICKUP stops first (preserving their relative order), then all DELIVERY stops.
 * Assigns 1-based positions.
 * Must be called inside a Prisma $transaction.
 */
export async function resequenceRouteStops(
  tx: TransactionClient,
  routeId: string
): Promise<void> {
  const allStops = await tx.routeStop.findMany({
    where: { routeId },
    orderBy: { position: 'asc' },
    select: { id: true, type: true, position: true },
  });

  const pickups = allStops.filter((s) => s.type === 'PICKUP');
  const deliveries = allStops.filter((s) => s.type === 'DELIVERY');

  const ordered = [...pickups, ...deliveries];

  await Promise.all(
    ordered.map((stop, index) =>
      tx.routeStop.update({
        where: { id: stop.id },
        data: { position: index + 1 },
      })
    )
  );
}
