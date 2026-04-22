export default function DriverHoursLoading() {
  return (
    <div className="space-y-4 lg:space-y-6 animate-pulse">
      {/* Page heading */}
      <div className="flex flex-col gap-1.5">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-4 w-56 rounded bg-muted" />
      </div>

      {/* 2x2 status card grid */}
      <div className="grid grid-cols-2 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-4 shadow-sm h-20 flex flex-col justify-between"
          >
            <div className="h-3 w-20 rounded bg-muted" />
            <div className="h-6 w-16 rounded bg-muted" />
          </div>
        ))}
      </div>

      {/* Day bar skeleton */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 shadow-sm">
        <div className="h-4 w-32 rounded bg-muted mb-3" />
        <div className="h-12 w-full rounded bg-muted" />
      </div>
    </div>
  );
}
