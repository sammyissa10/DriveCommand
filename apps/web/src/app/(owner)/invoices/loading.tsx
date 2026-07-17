import { MobileScreen } from '@/components/ui/ds';

export default function InvoicesLoading() {
  return (
    <>
      {/* Mobile-web ds skeleton — dark surface so navigating between the list,
          detail, new and edit screens never flashes the light shell background. */}
      <div className="lg:hidden -m-4">
        <MobileScreen className="pb-10 pt-2">
          <div className="space-y-6">
            <div className="space-y-2 pt-2">
              <div className="h-8 w-40 animate-pulse rounded-[10px] bg-ds-card" />
              <div className="h-4 w-24 animate-pulse rounded bg-ds-card" />
            </div>
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-[20px] bg-ds-card" />
              ))}
            </div>
          </div>
        </MobileScreen>
      </div>

      {/* Desktop skeleton (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-1">
          <div className="h-8 w-36 animate-pulse rounded bg-muted" />
          <div className="h-4 w-52 animate-pulse rounded bg-muted" />
        </div>

        {/* 4 stat card skeletons */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-lg border border-border bg-card p-4 animate-pulse">
              <div className="h-4 w-24 rounded bg-muted mb-2" />
              <div className="h-8 w-20 rounded bg-muted" />
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
                <div className="h-6 w-16 rounded-full bg-muted ml-auto" />
                <div className="h-4 w-20 rounded bg-muted" />
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
