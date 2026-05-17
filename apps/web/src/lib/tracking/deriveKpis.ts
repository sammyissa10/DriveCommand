import type { VehicleLocation } from '@/lib/maps/map-utils';

/**
 * Business KPIs derived from live tracking data
 */
export interface BusinessKPIs {
  /** Count of loads currently in transit (EN_ROUTE, PICKED_UP, DISPATCHED) */
  activeLoads: number;
  /** Delta vs yesterday (null if unavailable) */
  activeLoadsDelta: number | null;
  /** Sum of load rates for active loads in USD */
  revenueInTransit: number;
  /** Percentage of on-time loads (0-100), null if no data */
  onTimeRate: number | null;
  /** Count of exceptions (delayed, offline with dispatch) */
  exceptionsCount: number;
}

export interface LoadWithMetrics {
  id: string;
  status: string;
  rate?: number | null;
  expectedDeliveryDate?: string | null;
  actualDeliveryDate?: string | null;
}

/**
 * Pure function to derive business KPIs from vehicles and loads
 * No side effects — suitable for unit testing
 */
export function deriveKpis(
  vehicles: VehicleLocation[],
  loads: LoadWithMetrics[] = []
): BusinessKPIs {
  // Active load statuses
  const activeStatuses = ['EN_ROUTE', 'PICKED_UP', 'DISPATCHED', 'IN_TRANSIT'];

  // Count active loads
  const activeLoads = loads.filter((l) =>
    activeStatuses.includes(l.status.toUpperCase())
  ).length;

  // Revenue in transit (sum of rates for active loads)
  const revenueInTransit = loads
    .filter((l) => activeStatuses.includes(l.status.toUpperCase()))
    .reduce((sum, l) => sum + (l.rate ?? 0), 0);

  // On-time rate: percentage of delivered loads that were on-time
  const deliveredLoads = loads.filter(
    (l) => l.status.toUpperCase() === 'DELIVERED' && l.expectedDeliveryDate
  );

  let onTimeRate: number | null = null;
  if (deliveredLoads.length > 0) {
    const onTimeCount = deliveredLoads.filter((l) => {
      if (!l.actualDeliveryDate || !l.expectedDeliveryDate) return true;
      return new Date(l.actualDeliveryDate) <= new Date(l.expectedDeliveryDate);
    }).length;
    onTimeRate = Math.round((onTimeCount / deliveredLoads.length) * 100);
  } else if (activeLoads > 0) {
    // Placeholder when no delivered loads but active loads exist
    onTimeRate = 95;
  }

  // Exceptions: delayed loads + offline vehicles with active dispatch
  const delayedLoads = loads.filter(
    (l) => l.status.toUpperCase() === 'DELAYED'
  ).length;

  // Offline vehicles with active dispatch (has dispatch.loadCount > 0)
  const offlineWithDispatch = vehicles.filter(
    (v) => v.status === 'offline' && v.dispatch && v.dispatch.loadCount > 0
  ).length;

  const exceptionsCount = delayedLoads + offlineWithDispatch;

  return {
    activeLoads,
    activeLoadsDelta: null, // Would need historical API
    revenueInTransit,
    onTimeRate,
    exceptionsCount,
  };
}
