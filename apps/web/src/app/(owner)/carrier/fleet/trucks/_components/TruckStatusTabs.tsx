'use client';

import { cn } from '@/lib/utils';
import type { TruckStatusCounts } from '../_grid/types';

/**
 * TruckStatusTabs — Segmented tabs with counts for filtering by status.
 */

export type TruckStatusFilter = 'all' | 'active' | 'maintenance' | 'out_of_service';

interface TruckStatusTabsProps {
  counts: TruckStatusCounts;
  activeTab: TruckStatusFilter;
  onTabChange: (tab: TruckStatusFilter) => void;
}

const tabs: { id: TruckStatusFilter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'active', label: 'Active' },
  { id: 'maintenance', label: 'In Shop' },
  { id: 'out_of_service', label: 'Out of Service' },
];

export function TruckStatusTabs({
  counts,
  activeTab,
  onTabChange,
}: TruckStatusTabsProps) {
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 w-fit">
      {tabs.map((tab) => {
        const count = counts[tab.id];
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors',
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
            <span
              className={cn(
                'inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded text-xs',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
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
