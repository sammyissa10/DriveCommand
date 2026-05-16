import type { VehicleLocation } from '@/lib/maps/map-utils';

export type VehicleStatusKey = 'moving' | 'idle' | 'offline' | 'no-location' | 'all';

/**
 * Pure function to count vehicles by status
 * Returns counts for each status plus 'all' total
 */
export function deriveStatusCounts(
  vehicles: VehicleLocation[]
): Record<VehicleStatusKey, number> {
  const counts: Record<VehicleStatusKey, number> = {
    moving: 0,
    idle: 0,
    offline: 0,
    'no-location': 0,
    all: vehicles.length,
  };

  for (const v of vehicles) {
    const status = v.status as keyof typeof counts;
    if (status in counts && status !== 'all') {
      counts[status]++;
    }
  }

  return counts;
}
