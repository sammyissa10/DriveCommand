'use client';

/**
 * LoadingSkeleton - Loading state skeleton for DataGrid.
 *
 * Shows animated skeleton rows matching the grid structure.
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface LoadingSkeletonProps {
  /** Number of skeleton rows to display */
  rowCount?: number;
  /** Number of columns to display */
  columnCount?: number;
  /** Additional CSS class */
  className?: string;
  /** Show selection checkbox column */
  showSelection?: boolean;
}

// ---------------------------------------------------------------------------
// Seeded random for consistent skeleton widths
// ---------------------------------------------------------------------------

function seededRandom(seed: number): () => number {
  return () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function LoadingSkeleton({
  rowCount = 10,
  columnCount = 5,
  className,
  showSelection = false,
}: LoadingSkeletonProps) {
  // Use a stable seed for consistent widths
  const random = seededRandom(42);

  // Generate skeleton widths for each cell
  const widths = React.useMemo(() => {
    const result: number[][] = [];
    for (let row = 0; row < rowCount; row++) {
      const rowWidths: number[] = [];
      for (let col = 0; col < columnCount; col++) {
        // Generate widths between 40% and 90%
        rowWidths.push(40 + random() * 50);
      }
      result.push(rowWidths);
    }
    return result;
  }, [rowCount, columnCount]);

  return (
    <div className={cn('w-full', className)}>
      {/* Header skeleton */}
      <div className="flex h-10 border-b border-border bg-muted/50">
        {showSelection && (
          <div className="flex items-center justify-center w-12 border-r border-border">
            <Skeleton className="h-4 w-4" />
          </div>
        )}
        {Array.from({ length: columnCount }).map((_, colIndex) => (
          <div
            key={`header-${colIndex}`}
            className="flex items-center px-3 border-r border-border"
            style={{ width: 150, minWidth: 80 }}
          >
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>

      {/* Row skeletons */}
      {Array.from({ length: rowCount }).map((_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="flex h-9 border-b border-border"
        >
          {showSelection && (
            <div className="flex items-center justify-center w-12 border-r border-border">
              <Skeleton className="h-4 w-4" />
            </div>
          )}
          {Array.from({ length: columnCount }).map((_, colIndex) => (
            <div
              key={`cell-${rowIndex}-${colIndex}`}
              className="flex items-center px-3 border-r border-border"
              style={{ width: 150, minWidth: 80 }}
            >
              <Skeleton
                className="h-4"
                style={{ width: `${widths[rowIndex]?.[colIndex] ?? 60}%` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
