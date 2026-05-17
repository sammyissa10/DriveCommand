export interface RouteStopInput {
  id: string;
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'SKIPPED';
  position: number;
  hasException?: boolean;
}

export interface RouteProgressResult {
  truckPosition: number; // 0-1, position along route
  completedStops: number;
  totalStops: number;
  currentStopIndex: number; // -1 if no current stop
  exceptionCount: number;
}

/**
 * Calculate route progress and truck position based on stop statuses
 *
 * Logic:
 * - truckPosition is percentage of completed stops (0-1)
 * - If a stop is IN_PROGRESS, truck is at that stop's position
 * - currentStopIndex is -1 if all completed or none started
 * - exceptionCount tracks total stops with exceptions
 */
export function computeRouteProgress(stops: RouteStopInput[]): RouteProgressResult {
  const totalStops = stops.length;

  if (totalStops === 0) {
    return {
      truckPosition: 0,
      completedStops: 0,
      totalStops: 0,
      currentStopIndex: -1,
      exceptionCount: 0,
    };
  }

  // Find current stop index
  const currentStopIndex = stops.findIndex((s) => s.status === 'IN_PROGRESS');

  // Count completed stops
  const completedStops = stops.filter((s) => s.status === 'COMPLETED').length;

  // Count exceptions
  const exceptionCount = stops.filter((s) => s.hasException === true).length;

  // Calculate truck position
  let truckPosition: number;

  if (currentStopIndex !== -1) {
    // Truck is at the current stop
    truckPosition = currentStopIndex / (totalStops - 1 || 1);
  } else if (completedStops === 0) {
    // No stops completed yet
    truckPosition = 0;
  } else if (completedStops >= totalStops) {
    // All stops completed
    truckPosition = 1;
  } else {
    // In transit between stops
    truckPosition = completedStops / (totalStops - 1 || 1);
  }

  return {
    truckPosition,
    completedStops,
    totalStops,
    currentStopIndex,
    exceptionCount,
  };
}
