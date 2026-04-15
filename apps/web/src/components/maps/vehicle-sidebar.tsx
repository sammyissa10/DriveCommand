'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { VehicleLocation } from '@/lib/maps/map-utils';
import { STATUS_COLORS, STATUS_LABELS, VehicleStatus } from '@/lib/maps/vehicle-status';

interface VehicleSidebarProps {
  vehicles: VehicleLocation[];
  onVehicleClick: (vehicle: VehicleLocation) => void;
  selectedVehicleId: string | null;
}

type SortMode = 'status' | 'unit';

const STATUS_PRIORITY: Record<VehicleStatus, number> = {
  moving: 0,
  idle: 1,
  offline: 2,
  'no-location': 3,
};

function formatRelativeTime(timestamp: Date | null | string): string {
  if (!timestamp) return 'Never';
  const ts = new Date(timestamp);
  const diffMs = Date.now() - ts.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr} hr ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

export default function VehicleSidebar({
  vehicles,
  onVehicleClick,
  selectedVehicleId,
}: VehicleSidebarProps) {
  const [sortMode, setSortMode] = useState<SortMode>('status');

  const sorted = [...vehicles].sort((a, b) => {
    if (sortMode === 'status') {
      const diff = STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status];
      if (diff !== 0) return diff;
      return a.truck.licensePlate.localeCompare(b.truck.licensePlate);
    }
    // Sort by license plate alphabetically
    return a.truck.licensePlate.localeCompare(b.truck.licensePlate);
  });

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Sort controls */}
      <div className="flex items-center gap-1 px-3 py-2 border-b shrink-0">
        <span className="text-xs text-muted-foreground mr-1">Sort:</span>
        <button
          onClick={() => setSortMode('status')}
          className={cn(
            'text-xs px-2 py-1 rounded',
            sortMode === 'status'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          Status
        </button>
        <button
          onClick={() => setSortMode('unit')}
          className={cn(
            'text-xs px-2 py-1 rounded',
            sortMode === 'unit'
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-muted'
          )}
        >
          Unit #
        </button>
        <span className="ml-auto text-xs text-muted-foreground">{vehicles.length} trucks</span>
      </div>

      {/* Vehicle list */}
      <div className="overflow-y-auto flex-1">
        {sorted.length === 0 && (
          <div className="px-4 py-8 text-center text-sm text-muted-foreground">
            No vehicles match the current filters
          </div>
        )}
        {sorted.map((vehicle) => {
          const colors = STATUS_COLORS[vehicle.status];
          const isSelected = vehicle.truckId === selectedVehicleId;

          return (
            <button
              key={vehicle.truckId}
              onClick={() => onVehicleClick(vehicle)}
              className={cn(
                'w-full text-left px-3 py-2.5 border-b hover:bg-muted/50 transition-colors',
                isSelected && 'bg-accent'
              )}
            >
              {/* Row top: license plate + status dot */}
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-sm truncate">{vehicle.truck.licensePlate}</span>
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className={cn('w-2 h-2 rounded-full', colors.bg)} />
                  <span className="text-xs text-muted-foreground">
                    {STATUS_LABELS[vehicle.status]}
                  </span>
                </div>
              </div>

              {/* Row middle: make/model/year */}
              <div className="text-xs text-muted-foreground truncate mt-0.5">
                {vehicle.truck.year} {vehicle.truck.make} {vehicle.truck.model}
              </div>

              {/* Row bottom: driver + last seen */}
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-xs truncate">
                  {vehicle.driver ? vehicle.driver.name : (
                    <span className="text-muted-foreground italic">Unassigned</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {formatRelativeTime(vehicle.timestamp)}
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
