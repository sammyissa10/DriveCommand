export type VehicleStatus = 'moving' | 'idle' | 'offline';

export function getVehicleStatus(speed: number | null, lastUpdate: Date): VehicleStatus {
  const tenMinutesAgo = Date.now() - (10 * 60 * 1000);

  // Check if offline (no GPS update in 10+ minutes)
  if (lastUpdate.getTime() < tenMinutesAgo) {
    return 'offline';
  }

  // Check if idle (speed is null or < 5 mph)
  if (speed === null || speed < 5) {
    return 'idle';
  }

  // Otherwise, vehicle is moving
  return 'moving';
}

export const STATUS_COLORS = {
  moving: {
    bg: 'bg-green-500',
    border: 'border-green-700',
  },
  idle: {
    bg: 'bg-yellow-500',
    border: 'border-yellow-700',
  },
  offline: {
    bg: 'bg-red-500',
    border: 'border-red-700',
  },
} as const;
