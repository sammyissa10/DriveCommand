/**
 * Routes list page — uses Suspense streaming so the header/button render
 * instantly and the list streams in as the DB query resolves.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listRoutes, deleteRoute } from '@/app/(owner)/actions/routes';
import { RouteListWrapper } from './route-list-wrapper';

// ─── Async data section ───────────────────────────────────────────────────────

async function RouteListSection() {
  const routes = await listRoutes().catch((e) => {
    console.error('[routes] listRoutes failed:', e);
    return [];
  });
  return <RouteListWrapper initialRoutes={routes} deleteAction={deleteRoute} />;
}

// ─── Skeleton fallback ────────────────────────────────────────────────────────

function RouteListSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card shadow-sm animate-pulse">
      <div className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-16 w-full rounded-lg bg-muted" />
        ))}
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
// Synchronous — returns JSX immediately so the Suspense boundary activates
// and the skeleton shows before the DB query completes.

export default function RoutesPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Routes</h1>
          <p className="mt-1 text-muted-foreground">View and manage your routes</p>
        </div>
        <Link
          href="/routes/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Create Route
        </Link>
      </div>

      <Suspense fallback={<RouteListSkeleton />}>
        <RouteListSection />
      </Suspense>
    </div>
  );
}
