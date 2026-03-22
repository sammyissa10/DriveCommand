export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        <div className="h-8 w-36 animate-pulse rounded bg-muted" />
      </div>

      {/* 6 stat card skeletons */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6 shadow-sm animate-pulse">
            <div className="flex items-center justify-between">
              <div className="flex-1 space-y-3">
                <div className="h-3 w-20 rounded bg-muted" />
                <div className="h-8 w-14 rounded bg-muted" />
              </div>
              <div className="ml-4 h-12 w-12 flex-shrink-0 rounded-xl bg-muted" />
            </div>
          </div>
        ))}
      </div>

      {/* 3 widget skeletons */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6 shadow-sm animate-pulse">
            <div className="mb-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted" />
                <div className="h-5 w-32 rounded bg-muted" />
              </div>
              <div className="h-6 w-8 rounded-full bg-muted" />
            </div>
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-14 w-full rounded-lg bg-muted" />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
