/**
 * LoadingSkeleton Component
 *
 * Skeleton loader for grid data fetching states.
 * Organic feel with varying widths.
 */

import { cn } from '@/lib/utils';

export interface LoadingSkeletonProps {
  /** Number of skeleton rows to display */
  rows?: number;
  /** Number of columns to display */
  columns?: number;
  /** Whether to show header skeleton */
  showHeader?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * LoadingSkeleton displays animated skeleton rows during data loading.
 *
 * Design: Varying widths (40%, 60%, 30%, 50%) for organic feel
 * Animation: animate-pulse wrapped in motion-safe
 * Colors: bg-muted on background
 *
 * @example
 * <LoadingSkeleton rows={5} columns={4} showHeader />
 */
export function LoadingSkeleton({
  rows = 5,
  columns = 4,
  showHeader = true,
  className,
}: LoadingSkeletonProps) {
  // Varying widths for organic feel (cycles through these percentages)
  const widths = ['40%', '60%', '30%', '50%'];

  return (
    <div className={cn('w-full', className)}>
      {/* Header skeleton */}
      {showHeader && (
        <div className="flex h-10 items-center gap-4 border-b border-border/40 px-4">
          {Array.from({ length: columns }).map((_, i) => (
            <div
              key={`header-${i}`}
              className="motion-safe:animate-pulse"
              style={{ width: widths[i % widths.length] }}
            >
              <div className="h-3 rounded-md bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Row skeletons */}
      <div className="divide-y divide-border/40">
        {Array.from({ length: rows }).map((_, rowIndex) => (
          <div
            key={`row-${rowIndex}`}
            className="flex h-12 items-center gap-4 px-4"
            style={{ height: 'var(--grid-row-height, 48px)' }}
          >
            {Array.from({ length: columns }).map((_, colIndex) => (
              <div
                key={`cell-${rowIndex}-${colIndex}`}
                className="motion-safe:animate-pulse"
                style={{ width: widths[(rowIndex + colIndex) % widths.length] }}
              >
                <div className="h-4 rounded-md bg-muted" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
