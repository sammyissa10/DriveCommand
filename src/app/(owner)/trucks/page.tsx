/**
 * Trucks list page — uses Suspense streaming so the header/button render
 * instantly and the list streams in as the DB query resolves.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listTrucks, deleteTruck } from '@/app/(owner)/actions/trucks';
import { TruckListWrapper } from './truck-list-wrapper';

// ─── Async data section ───────────────────────────────────────────────────────

async function TruckListSection() {
  const trucks = await listTrucks().catch((e) => {
    console.error('[trucks] listTrucks failed:', e);
    return [];
  });
  return <TruckListWrapper initialTrucks={trucks} deleteAction={deleteTruck} />;
}

// ─── Skeleton fallback ────────────────────────────────────────────────────────

function TruckListSkeleton() {
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

export default function TrucksPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Trucks</h1>
          <p className="mt-1 text-muted-foreground">View and manage your fleet</p>
        </div>
        <Link
          href="/trucks/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-4 w-4" />
          Add Truck
        </Link>
      </div>

      <Suspense fallback={<TruckListSkeleton />}>
        <TruckListSection />
      </Suspense>
    </div>
  );
}
