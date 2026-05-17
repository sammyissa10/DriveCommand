'use client';

import { cn } from '@/lib/utils';
import type { VehicleStatusKey } from '@/lib/tracking/deriveStatusCounts';

interface FilterChipsProps {
  statusCounts: Record<VehicleStatusKey, number>;
  activeStatus: VehicleStatusKey;
  onStatusChange: (status: VehicleStatusKey) => void;
}

const STATUS_CONFIG: { key: VehicleStatusKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'moving', label: 'In Transit' },
  { key: 'idle', label: 'At Stop' },
  { key: 'offline', label: 'Offline' },
  { key: 'no-location', label: 'No GPS' },
];

export default function FilterChips({
  statusCounts,
  activeStatus,
  onStatusChange,
}: FilterChipsProps) {
  return (
    <div
      className="flex items-center gap-2 overflow-x-auto scrollbar-none"
      role="radiogroup"
      aria-label="Filter by vehicle status"
    >
      {STATUS_CONFIG.map(({ key, label }) => {
        const isActive = activeStatus === key;
        const count = statusCounts[key] ?? 0;

        return (
          <button
            key={key}
            type="button"
            role="radio"
            aria-checked={isActive}
            onClick={() => onStatusChange(key)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
              isActive
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
            )}
          >
            {label}
            <span
              className={cn(
                'text-xs px-1.5 py-0.5 rounded-full min-w-[1.5rem] text-center',
                isActive ? 'bg-primary-foreground/20' : 'bg-background'
              )}
            >
              {count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
