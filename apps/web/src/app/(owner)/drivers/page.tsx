/**
 * Drivers overview page — rebuilt on the design system.
 *
 * Features:
 * - KPI cards (total drivers, active & compliant, expiring soon, needs action)
 * - Segmented status tabs with counts
 * - Wide search with filter button
 * - Sortable table with type-aware filters (desktop)
 * - Card list with compliance alerts prominent (mobile)
 * - Suspense streaming for fast initial render
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { UserPlus } from 'lucide-react';
import { listDrivers, deleteDriver } from '@/app/(owner)/actions/drivers';
import { DriversKPICards, type DriverKPIData } from './_components/DriversKPICards';
import { DriversPageClient } from './_components/DriversPageClient';
import { logger } from '@/lib/logger';
import { SampleDataBanner } from '@/components/onboarding/sample-data-banner';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { computeDriverStatus, type DriverWithRelations } from '@/lib/drivers/compute-driver-status';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Compute KPI data from drivers ────────────────────────────────────────────

function computeKPIData(drivers: DriverWithRelations[]): DriverKPIData {
  let activeCompliant = 0;
  let expiringSoon = 0;
  let needsAction = 0;

  drivers.forEach((driver) => {
    const { status } = computeDriverStatus(driver);

    if (status === 'Active') {
      activeCompliant++;
    }

    if (status === 'Expiring Soon') {
      expiringSoon++;
    }

    if (status === 'Expired Docs' || status === 'Deactivated') {
      needsAction++;
    }
  });

  return {
    total: drivers.length,
    activeCompliant,
    expiringSoon,
    needsAction,
  };
}

// ─── Async data section ───────────────────────────────────────────────────────

async function DriversContent() {
  const [drivers, tenantId] = await Promise.all([
    listDrivers().catch((e) => {
      logger.error('[drivers] listDrivers failed:', e);
      return [];
    }),
    requireTenantId().catch(() => ''),
  ]);

  const hasSampleRecords = drivers.some((d) => d.isSample);

  let sampleDataSeeded = false;
  if (hasSampleRecords && tenantId) {
    try {
      const prismaClient = await getTenantPrisma();
      const tenant = await prismaClient.tenant.findFirst({
        select: { sampleDataSeeded: true },
      });
      sampleDataSeeded = tenant?.sampleDataSeeded ?? false;
    } catch {
      // Non-critical — banner is hidden by default
    }
  }

  const kpiData = computeKPIData(drivers);

  return (
    <>
      {sampleDataSeeded && hasSampleRecords && tenantId && (
        <SampleDataBanner tenantId={tenantId} />
      )}

      {/* KPI Cards */}
      <DriversKPICards data={kpiData} />

      {/* Data Grid with optimistic updates */}
      <DriversPageClient drivers={drivers} deleteAction={deleteDriver} />
    </>
  );
}

// ─── Skeleton fallback ────────────────────────────────────────────────────────

function DriversContentSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards Skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-lg border border-border bg-card p-4 space-y-2"
          >
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-16" />
          </div>
        ))}
      </div>

      {/* Tabs Skeleton */}
      <Skeleton className="h-10 w-80" />

      {/* Search Skeleton */}
      <Skeleton className="h-12 w-full" />

      {/* Table Skeleton */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DriversPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Drivers
          </h1>
          <p className="mt-1 text-muted-foreground">
            View and manage your drivers
          </p>
        </div>
        <Link
          href="/drivers/invite"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <UserPlus className="h-4 w-4" />
          Invite Driver
        </Link>
      </div>

      {/* Content with Suspense */}
      <Suspense fallback={<DriversContentSkeleton />}>
        <DriversContent />
      </Suspense>
    </div>
  );
}
