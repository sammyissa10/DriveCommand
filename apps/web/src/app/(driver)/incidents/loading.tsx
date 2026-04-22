export default function DriverIncidentsLoading() {
  return (
    <div className="space-y-4 lg:space-y-6 animate-pulse">
      {/* Page heading */}
      <div className="flex flex-col gap-1.5">
        <div className="h-8 w-40 rounded bg-muted" />
        <div className="h-4 w-60 rounded bg-muted" />
      </div>

      {/* Incident card skeletons */}
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card px-4 py-3 shadow-sm h-16 flex flex-col justify-center gap-1.5"
          >
            <div className="h-4 w-36 rounded bg-muted" />
            <div className="h-3 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
