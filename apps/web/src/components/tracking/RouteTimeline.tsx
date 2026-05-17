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
  hasException?: boolean;
}

/**
 * Extract city abbreviation from address string
 * Looks for "City, ST" pattern and returns abbreviated city name
 */
function extractCityAbbrev(address: string): string {
  // Try to match "City, ST" pattern
  const match = address.match(/([^,]+),\s*([A-Z]{2})/);
  if (match) {
    const city = match[1].trim();
    // Abbreviate long city names (>8 chars)
    if (city.length > 8) {
      return city.substring(0, 8) + '...';
    }
    return city;
  }
  // Fallback: take first word of address
  const firstWord = address.split(/[\s,]/)[0];
  return firstWord.substring(0, 8);
}

/**
 * Format scheduled time as "HH:MM AM/PM"
 */
function formatStopTime(scheduledAt?: string): string {
  if (!scheduledAt) return 'TBD';
  const date = new Date(scheduledAt);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

interface RouteTimelineProps {
  stops: RouteStopData[];
  className?: string;
}

export function RouteTimeline({ stops, className }: RouteTimelineProps) {
  // Handle empty case with graceful degradation
  if (stops.length === 0) {
    return (
      <div className={cn('flex items-center justify-center h-12', className)}>
        {/* TODO: Backend API doesn't populate dispatch.stops yet. Wire getLatestVehicleLocations to include RouteStop data */}
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
      hasException: s.hasException,
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
      {/* Background line (dashed for upcoming segments) */}
      <div className="absolute left-0 right-0 h-0.5 border-t-2 border-dashed border-n-300 top-1/2 -translate-y-1/2" />

      {/* Progress line (solid green from start to truck position) */}
      <div
        className="absolute left-0 h-0.5 bg-status-success top-1/2 -translate-y-1/2 transition-all duration-500"
        style={{ width: `${truckPosition * 100}%` }}
      />

      {/* Current segment (pulsing blue after completed, before truck) */}
      {currentStopIndex > 0 && (
        <div
          className="absolute h-0.5 bg-status-info animate-pulse top-1/2 -translate-y-1/2 transition-all duration-500"
          style={{
            left: `${((currentStopIndex - 1) / (stops.length - 1 || 1)) * 100}%`,
            width: `${(1 / (stops.length - 1 || 1)) * 100}%`,
          }}
        />
      )}

      {/* Exception segments (red solid) */}
      {stops.map((stop, idx) => {
        if (!stop.hasException || idx === 0) return null;
        return (
          <div
            key={`exception-${stop.id}`}
            className="absolute h-0.5 bg-status-danger top-1/2 -translate-y-1/2"
            style={{
              left: `${((idx - 1) / (stops.length - 1 || 1)) * 100}%`,
              width: `${(1 / (stops.length - 1 || 1)) * 100}%`,
            }}
          />
        );
      })}

      {/* Stops container */}
      <div className="relative flex items-center justify-between w-full px-2">
        {stops.length <= 4 ? (
          // Show all stops
          stops.map((stop, idx) => (
            <RouteStop
              key={stop.id}
              state={getStopState(stop)}
              type={stop.type}
              label={{
                city: extractCityAbbrev(stop.address),
                time: formatStopTime(stop.scheduledAt),
              }}
              isException={stop.hasException}
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
              label={{
                city: extractCityAbbrev(visibleStops[0].address),
                time: formatStopTime(visibleStops[0].scheduledAt),
              }}
              isException={visibleStops[0].hasException}
              isFirst
            />
            <RouteStop
              state={getStopState(visibleStops[1])}
              type={visibleStops[1].type}
              label={{
                city: extractCityAbbrev(visibleStops[1].address),
                time: formatStopTime(visibleStops[1].scheduledAt),
              }}
              isException={visibleStops[1].hasException}
            />

            {/* +N more badge with diamond shape */}
            <div className="flex items-center justify-center">
              <div className="relative w-4 h-4 rotate-45 bg-n-300 flex items-center justify-center">
                <span className="-rotate-45 text-[8px] font-bold text-foreground">
                  +{collapsedCount}
                </span>
              </div>
            </div>

            <RouteStop
              state={getStopState(visibleStops[2])}
              type={visibleStops[2].type}
              label={{
                city: extractCityAbbrev(visibleStops[2].address),
                time: formatStopTime(visibleStops[2].scheduledAt),
              }}
              isException={visibleStops[2].hasException}
            />
            <RouteStop
              state={getStopState(visibleStops[3])}
              type={visibleStops[3].type}
              label={{
                city: extractCityAbbrev(visibleStops[3].address),
                time: formatStopTime(visibleStops[3].scheduledAt),
              }}
              isException={visibleStops[3].hasException}
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
        <div className="bg-background p-1 rounded-full border-2 border-status-info shadow-sm">
          <Truck className="w-4 h-4 text-status-info" />
        </div>
      </div>
    </div>
  );
}
