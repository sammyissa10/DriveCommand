'use client';

import { Truck, ChevronDown, MoreVertical } from 'lucide-react';
import { cn } from '@/lib/utils';
import { VehicleLocation } from '@/lib/maps/map-utils';
import { StatusPill, StatusType } from './StatusPill';
import { ExceptionFlag } from './ExceptionFlag';
import { RouteTimeline, RouteStopData } from './RouteTimeline';

// Type augmentation: VehicleDispatch needs stops: RouteStopData[], hasException: boolean, exceptionType?: string
// See: apps/web/src/lib/maps/map-utils.ts
interface TruckRowProps {
  vehicle: VehicleLocation;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onVehicleClick: (vehicle: VehicleLocation) => void;
}

function deriveStatus(vehicle: VehicleLocation): StatusType {
  // No dispatch = no route
  if (!vehicle.dispatch) {
    return 'no-route';
  }

  // Check for exception state - exceptions make on-time status become at-risk
  const hasException = (vehicle.dispatch as any).hasException === true;

  // Has dispatch, check vehicle status
  if (vehicle.status === 'moving') {
    return hasException ? 'at-risk' : 'on-time'; // exception overrides on-time
  }

  if (vehicle.status === 'idle') {
    return 'at-risk'; // amber
  }

  if (vehicle.status === 'offline') {
    return 'delayed'; // red
  }

  // Fallback
  return 'no-route';
}

function getDriverInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatRelativeTime(timestamp: Date | string | null): string {
  if (!timestamp) return 'Never';
  const date = typeof timestamp === 'string' ? new Date(timestamp) : timestamp;
  const diffMs = Date.now() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

// Status-based truck icon colors (using semantic tokens)
const TRUCK_ICON_COLORS: Record<StatusType, string> = {
  'on-time': 'text-status-success',
  'delayed': 'text-status-danger',
  'early': 'text-status-info',
  'at-risk': 'text-status-warning',
  'no-route': 'text-n-400',
};

export function TruckRow({
  vehicle,
  isExpanded,
  onToggleExpand,
  onVehicleClick,
}: TruckRowProps) {
  const status = deriveStatus(vehicle);
  const driverInitials = vehicle.driver ? getDriverInitials(vehicle.driver.name) : '?';

  // TODO: Backend API doesn't populate dispatch.stops yet
  // When wired, map dispatch.stops to RouteStopData[]
  const routeStops: RouteStopData[] = (vehicle.dispatch as any)?.stops?.map((s: any) => ({
    id: s.id,
    type: s.type.toLowerCase() as RouteStopData['type'],
    status: s.status,
    address: s.address,
    scheduledAt: s.scheduledAt,
    arrivedAt: s.arrivedAt,
    hasException: s.hasException ?? false,
  })) ?? [];

  // Extract exception info from dispatch
  const hasException = (vehicle.dispatch as any)?.hasException === true;
  const exceptionType = (vehicle.dispatch as any)?.exceptionType ?? 'other';

  const handleRowClick = () => {
    onVehicleClick(vehicle);
  };

  const handleExpandClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onToggleExpand();
  };

  const handleKebabClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: open context menu
  };

  return (
    <button
      className="w-full h-24 border-b hover:bg-muted/50 transition-colors text-left"
      onClick={handleRowClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleRowClick();
        }
      }}
    >
      <div className="h-full flex items-center px-4 gap-4">
        {/* Left zone (w-56) */}
        <div className="w-56 shrink-0 flex items-center gap-3">
          {/* Truck icon */}
          <Truck className={cn('w-6 h-6', TRUCK_ICON_COLORS[status])} />

          {/* Unit + driver */}
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm truncate">
              {vehicle.truck.licensePlate}
            </div>

            {/* Driver avatar + name */}
            <div className="flex items-center gap-2 mt-1">
              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <span className="text-xs font-medium text-primary">
                  {driverInitials}
                </span>
              </div>
              <span className="text-xs text-muted-foreground truncate">
                {vehicle.driver ? vehicle.driver.name : 'Unassigned'}
              </span>
            </div>

            {/* Last location timestamp */}
            <div className="text-xs text-muted-foreground mt-1">
              {formatRelativeTime(vehicle.timestamp)}
            </div>
          </div>
        </div>

        {/* Middle zone (flex-1, min-w-[480px]) */}
        <div className="flex-1 min-w-[480px] overflow-hidden">
          <RouteTimeline stops={routeStops} />
        </div>

        {/* Right zone (w-60) */}
        <div className="w-60 shrink-0 flex items-center justify-end gap-4">
          {/* Status pill + exception flag + ETA delta */}
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-1.5">
              <StatusPill status={status} />
              {hasException && (
                <ExceptionFlag type={exceptionType} />
              )}
            </div>
            {/* ETA delta placeholder */}
            <span className="text-xs text-muted-foreground">On Time</span>
          </div>

          {/* Expand chevron */}
          <button
            onClick={handleExpandClick}
            className="p-2 hover:bg-muted rounded transition-colors"
            aria-label={isExpanded ? 'Collapse row' : 'Expand row'}
          >
            <ChevronDown
              className={cn(
                'w-5 h-5 text-muted-foreground transition-transform',
                isExpanded && 'rotate-180'
              )}
            />
          </button>

          {/* Kebab menu */}
          <button
            onClick={handleKebabClick}
            className="p-2 hover:bg-muted rounded transition-colors"
            aria-label="More options"
          >
            <MoreVertical className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>
      </div>
    </button>
  );
}
