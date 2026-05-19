'use client';

/**
 * EmptyState - Empty state component for DataGrid.
 *
 * Shows different messages for no data vs filtered empty states.
 */

import * as React from 'react';
import { Inbox, SearchX } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface EmptyStateProps {
  /** Type of empty state */
  type: 'no-data' | 'filtered-empty';
  /** Callback when "Clear filters" is clicked (for filtered-empty type) */
  onClearFilters?: () => void;
  /** Additional CSS class */
  className?: string;
  /** Custom title */
  title?: string;
  /** Custom description */
  description?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function EmptyState({
  type,
  onClearFilters,
  className,
  title,
  description,
}: EmptyStateProps) {
  const isNoData = type === 'no-data';

  const defaultTitle = isNoData ? 'No data yet' : 'No results found';
  const defaultDescription = isNoData
    ? 'Add your first item to get started.'
    : 'Try adjusting your search or filters.';

  const Icon = isNoData ? Inbox : SearchX;

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center py-16 px-4',
        className
      )}
    >
      <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-muted mb-4">
        <Icon className="h-7 w-7 text-muted-foreground/50" />
      </div>
      <h3 className="text-sm font-semibold text-foreground">
        {title ?? defaultTitle}
      </h3>
      <p className="mt-1 text-sm text-muted-foreground text-center max-w-sm">
        {description ?? defaultDescription}
      </p>
      {!isNoData && onClearFilters && (
        <Button
          variant="outline"
          size="sm"
          className="mt-4"
          onClick={onClearFilters}
        >
          Clear filters
        </Button>
      )}
    </div>
  );
}
