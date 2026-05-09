export default function DriversLoading() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <div className="h-8 w-36 animate-pulse rounded bg-muted" />
        <div className="h-4 w-48 animate-pulse rounded bg-muted" />
      </div>

      {/* Driver card grid skeletons — 3 columns */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-5 animate-pulse space-y-3"
          >
            {/* Avatar + name row */}
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 w-28 rounded bg-muted" />
                <div className="h-3 w-36 rounded bg-muted" />
              </div>
            </div>
            {/* Status badge */}
            <div className="h-6 w-20 rounded-full bg-muted" />
            {/* Detail row */}
            <div className="h-3 w-full rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
