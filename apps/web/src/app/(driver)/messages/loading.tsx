export default function DriverMessagesLoading() {
  return (
    <div className="space-y-4 lg:space-y-6 animate-pulse">
      {/* Page heading */}
      <div className="flex flex-col gap-1.5">
        <div className="h-8 w-44 rounded bg-muted" />
        <div className="h-4 w-64 rounded bg-muted" />
      </div>

      {/* Messaging panel skeleton */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card shadow-sm h-64" />
    </div>
  );
}
