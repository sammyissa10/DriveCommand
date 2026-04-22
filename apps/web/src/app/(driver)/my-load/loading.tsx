export default function MyLoadLoading() {
  return (
    <div className="space-y-4 lg:space-y-6 animate-pulse">
      {/* Page heading */}
      <div className="flex flex-col gap-1.5">
        <div className="h-8 w-36 rounded bg-muted" />
        <div className="h-4 w-52 rounded bg-muted" />
      </div>

      {/* Load card skeletons */}
      <div className="space-y-2">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card px-4 py-3 lg:p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="h-4 w-32 rounded bg-muted" />
              <div className="h-5 w-16 rounded-full bg-muted" />
            </div>
            <div className="mt-1.5 h-3 w-24 rounded bg-muted" />
          </div>
        ))}
      </div>
    </div>
  );
}
