'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * StatusTabs — Segmented tabs with counts for filtering records.
 *
 * Design rules:
 * - Tabs show a label and optional count
 * - Active tab is highlighted with primary background
 * - Touch targets are 44px minimum on mobile
 * - Uses semantic colors for accessibility
 *
 * @example
 * <StatusTabs
 *   value={activeTab}
 *   onValueChange={setActiveTab}
 *   tabs={[
 *     { value: 'all', label: 'All', count: 24 },
 *     { value: 'active', label: 'Active', count: 18 },
 *     { value: 'maintenance', label: 'In Shop', count: 3 },
 *     { value: 'outOfService', label: 'Out of Service', count: 3 },
 *   ]}
 * />
 */

export interface StatusTab {
  /** Unique value for the tab */
  value: string;
  /** Display label */
  label: string;
  /** Optional count badge */
  count?: number;
}

export interface StatusTabsProps {
  /** Currently selected tab value */
  value: string;
  /** Handler when tab changes */
  onValueChange: (value: string) => void;
  /** Array of tab definitions */
  tabs: StatusTab[];
  /** Additional className */
  className?: string;
}

export function StatusTabs({
  value,
  onValueChange,
  tabs,
  className,
}: StatusTabsProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-lg bg-muted p-1 gap-1',
        className
      )}
      role="tablist"
      aria-label="Status filter"
    >
      {tabs.map((tab) => {
        const isActive = tab.value === value;

        return (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onValueChange(tab.value)}
            className={cn(
              // Base styles
              'inline-flex items-center justify-center gap-1.5',
              'px-3 py-2 min-h-[36px] sm:min-h-[32px]',
              'rounded-md text-sm font-medium',
              'transition-all duration-fast',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              // Active state
              isActive
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/50'
            )}
          >
            <span>{tab.label}</span>
            {tab.count !== undefined && (
              <span
                className={cn(
                  'inline-flex items-center justify-center',
                  'min-w-[20px] h-5 px-1.5 rounded-full',
                  'text-xs font-medium tabular-nums',
                  isActive
                    ? 'bg-primary/10 text-primary'
                    : 'bg-muted-foreground/10 text-muted-foreground'
                )}
              >
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
