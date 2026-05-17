import { Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RouteStop } from './RouteStop';
import { computeRouteProgress } from '@/lib/tracking/computeRouteProgress';

export interface RouteStopData {
  id: string;
  type: 'pickup' | 'delivery' | 'fuel' | 'weigh';
  status: 'COMPLETED' | 'IN_PROGRESS' | 'PENDING' | 'SKIPPED';
  address: string;
  scheduledAt?: string;
  arrivedAt?: string;
}

interface RouteTimelineProps {
  stops: RouteStopData[];
  className?: string;
}

export function RouteTimeline({ stops, className }: RouteTimelineProps) {
  // Handle empty case
  if (stops.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-12', className)}>
        <span className="text-xs text-muted-foreground">No active route</span>
      </div>
    );
  }

  // Compute progress
  const { truckPosition, currentStopIndex } = computeRouteProgress(
    stops.map((s, idx) => ({
      id: s.id,
      status: s.status,
      position: idx,
    }))
  );

  // Determine which stops to show
  let visibleStops: RouteStopData[];
  let collapsedCount = 0;

  if (stops.length <= 4) {
    // Show all stops for 1-4 stops
    visibleStops = stops;
  } else {
    // 5+ stops: show first 2 + last 2 with "+N more" in between
    visibleStops = [stops[0], stops[1], stops[stops.length - 2], stops[stops.length - 1]];
    collapsedCount = stops.length - 4;
  }

  // Map stop status to visual state
  const getStopState = (
    stop: RouteStopData
  ): 'completed' | 'current' | 'upcoming' | 'skipped' => {
    switch (stop.status) {
      case 'COMPLETED':
        return 'completed';
      case 'IN_PROGRESS':
        return 'current';
      case 'PENDING':
        return 'upcoming';
      case 'SKIPPED':
        return 'skipped';
    }
  };

  return (
    <div className={cn('relative flex items-center h-12', className)}>
      {/* Background line */}
      <div className="absolute left-0 right-0 h-0.5 bg-gray-200 top-1/2 -translate-y-1/2" />

      {/* Progress line (green from start to truck position) */}
      <div
        className="absolute left-0 h-0.5 bg-green-500 top-1/2 -translate-y-1/2 transition-all duration-500"
        style={{ width: `${truckPosition * 100}%` }}
      />

      {/* Stops container */}
      <div className="relative flex items-center justify-between w-full px-2">
        {stops.length <= 4 ? (
          // Show all stops
          stops.map((stop, idx) => (
            <RouteStop
              key={stop.id}
              state={getStopState(stop)}
              type={stop.type}
              isFirst={idx === 0}
              isLast={idx === stops.length - 1}
            />
          ))
        ) : (
          // Show collapsed view
          <>
            <RouteStop
              state={getStopState(visibleStops[0])}
              type={visibleStops[0].type}
              isFirst
            />
            <RouteStop
              state={getStopState(visibleStops[1])}
              type={visibleStops[1].type}
            />

            {/* +N more badge */}
            <div className="flex items-center justify-center">
              <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                +{collapsedCount} more
              </span>
            </div>

            <RouteStop
              state={getStopState(visibleStops[2])}
              type={visibleStops[2].type}
            />
            <RouteStop
              state={getStopState(visibleStops[3])}
              type={visibleStops[3].type}
              isLast
            />
          </>
        )}
      </div>

      {/* Truck icon positioned at truck position */}
      <div
        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 transition-all duration-500"
        style={{ left: `${truckPosition * 100}%` }}
      >
        <div className="bg-background p-1 rounded-full border-2 border-blue-500 shadow-sm">
          <Truck className="w-4 h-4 text-blue-600" />
        </div>
      </div>
    </div>
  );
}
