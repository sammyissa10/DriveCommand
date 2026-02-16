import { Skeleton } from '@/components/ui/skeleton';

export default function LiveMapLoading() {
  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col">
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
  );
}
