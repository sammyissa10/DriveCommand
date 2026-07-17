import { Skeleton } from '@/components/ui/skeleton';
import { MobileScreen } from '@/components/ui/ds';

export default function LiveMapLoading() {
  return (
    <>
      {/* Mobile-web ds skeleton — dark surface so navigation never flashes the
          light shell background. */}
      <div className="lg:hidden -m-4">
        <MobileScreen className="pb-10 pt-2">
          <div className="space-y-6">
            <div className="space-y-2 pt-2">
              <div className="h-8 w-40 animate-pulse rounded-[10px] bg-ds-card" />
              <div className="h-4 w-24 animate-pulse rounded bg-ds-card" />
            </div>
            <div className="h-[60vh] animate-pulse rounded-[20px] bg-ds-card" />
          </div>
        </MobileScreen>
      </div>

      {/* Desktop skeleton (lg and up) — unchanged */}
      <div className="hidden lg:flex h-[calc(100vh-8rem)] flex-col">
        {/* Header with title and legend */}
        <div className="mb-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <Skeleton className="h-8 w-48 mb-2" />
              <Skeleton className="h-4 w-40" />
            </div>
            <Skeleton className="h-10 w-[200px]" />
          </div>

          {/* Status legend */}
          <div className="flex items-center gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-2">
                <Skeleton className="w-3 h-3 rounded-full" />
                <Skeleton className="h-4 w-16" />
              </div>
            ))}
          </div>
        </div>

        {/* Map area */}
        <div className="flex-1 rounded-lg border bg-muted/10 flex items-center justify-center min-h-[400px]">
          <p className="text-muted-foreground">Loading map...</p>
        </div>
      </div>
    </>
  );
}
