export default function MyRouteLoading() {
  return (
    <div className="space-y-4 lg:space-y-6 animate-pulse">
      {/* Page heading */}
      <div className="flex flex-col gap-1.5">
        <div className="h-8 w-36 rounded bg-muted" />
        <div className="h-4 w-48 rounded bg-muted" />
      </div>

      {/* Dispatch header card skeleton */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="h-5 w-32 rounded bg-muted" />
            <div className="h-4 w-48 rounded bg-muted" />
          </div>
          <div className="h-6 w-20 rounded-full bg-muted" />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="h-3 w-10 rounded bg-muted" />
            <div className="h-4 w-28 rounded bg-muted" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-16 rounded bg-muted" />
            <div className="h-4 w-20 rounded bg-muted" />
          </div>
        </div>
      </div>

      {/* Stops timeline card skeleton */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-5 shadow-sm">
        <div className="h-4 w-24 rounded bg-muted mb-4" />
        <ol className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i} className="flex gap-3 items-start">
              <div className="h-7 w-7 shrink-0 rounded-full bg-muted mt-0.5" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-40 rounded bg-muted" />
                <div className="h-3 w-56 rounded bg-muted" />
                <div className="h-3 w-32 rounded bg-muted" />
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
