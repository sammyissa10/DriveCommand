import { Skeleton } from '@/components/ui/skeleton';
import { Card } from '@/components/ui/card';

export default function SafetyLoading() {
  return (
    <div className="space-y-6">
      {/* Header skeleton */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <Skeleton className="h-10 w-[200px]" />
      </div>

      {/* Top row: Score card + Event distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="h-[350px]">
          <div className="p-6 space-y-4">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-24 w-24 rounded-full mx-auto" />
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </div>
        </Card>
        <Card className="h-[350px] lg:col-span-2">
          <div className="p-6">
            <Skeleton className="h-6 w-40 mb-4" />
            <Skeleton className="h-[280px] w-full" />
          </div>
        </Card>
      </div>

      {/* Trend chart: full width */}
      <Card className="h-[350px]">
        <div className="p-6">
          <Skeleton className="h-6 w-48 mb-4" />
          <Skeleton className="h-[280px] w-full" />
        </div>
      </Card>

      {/* Bottom row: Leaderboard + Thresholds */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {[1, 2].map((i) => (
          <Card key={i} className="h-[400px]">
            <div className="p-6 space-y-4">
              <Skeleton className="h-6 w-40" />
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map((j) => (
                  <Skeleton key={j} className="h-12 w-full" />
                ))}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
