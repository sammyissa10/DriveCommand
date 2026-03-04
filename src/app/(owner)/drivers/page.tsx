/**
 * Drivers list page — uses Suspense streaming so the header/button render
 * instantly and the list streams in as the DB query resolves.
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { listDrivers, deactivateDriver, reactivateDriver } from '@/app/(owner)/actions/drivers';
import { DriverListWrapper } from './driver-list-wrapper';

// ─── Async data section ───────────────────────────────────────────────────────

async function DriverListSection() {
  const drivers = await listDrivers().catch((e) => {
    console.error('[drivers] listDrivers failed:', e);
    return [];
  });
  return (
    <DriverListWrapper
      initialDrivers={drivers}
      deactivateAction={deactivateDriver}
      reactivateAction={reactivateDriver}
    />
  );
}

// ─── Skeleton fallback ────────────────────────────────────────────────────────

function DriverListSkeleton() {
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

export default function DriversPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Drivers</h1>
          <p className="mt-1 text-muted-foreground">View and manage your drivers</p>
        </div>
        <Link
          href="/drivers/invite"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          <UserPlus className="h-4 w-4" />
          Invite Driver
        </Link>
      </div>

      <Suspense fallback={<DriverListSkeleton />}>
        <DriverListSection />
      </Suspense>
    </div>
  );
}
