export default function LoadsLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="h-8 w-36 animate-pulse rounded bg-muted" />
        <div className="h-4 w-64 animate-pulse rounded bg-muted" />
      </div>

      {/* 4 stat card skeletons */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
            <div className="h-4 w-20 rounded bg-muted mb-2" />
            <div className="h-8 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Table row skeletons */}
      <div className="rounded-lg border border-border bg-card">
        <div className="h-10 w-full rounded-t-lg bg-muted animate-pulse" />
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 w-full animate-pulse bg-card px-4 flex items-center gap-4">
              <div className="h-4 w-24 rounded bg-muted" />
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-4 w-20 rounded bg-muted ml-auto" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
