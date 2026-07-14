import { cn } from '@/lib/utils';

/**
 * Content-shaped skeleton block in `ds.elevated` fill with an 800ms shimmer.
 * Never a spinner on data screens.
 */
export function Skeleton({
  className,
  style,
}: {
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      className={cn('animate-pulse rounded-lg bg-ds-elevated [animation-duration:800ms]', className)}
      style={style}
    />
  );
}

/** Skeleton shaped like an EntityRow card — for Overview loading states. */
export function EntityRowSkeleton() {
  return (
    <div className="flex min-h-[92px] items-center gap-3 rounded-[20px] bg-ds-card p-4">
      <Skeleton className="h-11 w-11 rounded-full" />
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-3 w-2/5" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    </div>
  );
}

/** N stacked EntityRow skeletons with the standard 12px gap. */
export function EntityListSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <EntityRowSkeleton key={i} />
      ))}
    </div>
  );
}
