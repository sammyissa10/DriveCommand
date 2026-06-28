/**
 * Clients overview page — built on the design system.
 *
 * Features:
 * - KPI cards (total clients, active, on hold, revenue MTD)
 * - Segmented status tabs with counts
 * - Wide search with filter button
 * - Sortable table with type-aware filters (desktop)
 * - Card list with status badges (mobile)
 * - Suspense streaming for fast initial render
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listClients, deleteClient } from '@/app/(owner)/actions/clients';
import { ClientsKPICards, type ClientKPIData } from './_components/ClientsKPICards';
import { ClientsPageClient } from './_components/ClientsPageClient';
import { logger } from '@/lib/logger';
import { SampleDataBanner } from '@/components/onboarding/sample-data-banner';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import type { ClientWithRelations } from '@/lib/clients/compute-client-status';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Compute KPI data from clients ────────────────────────────────────────────

function computeKPIData(clients: ClientWithRelations[]): ClientKPIData {
  let active = 0;
  let onHold = 0;

  clients.forEach((client) => {
    if (client.status === 'active') {
      active++;
    } else if (client.status === 'on_hold') {
      onHold++;
    }
  });

  return {
    total: clients.length,
    active,
    onHold,
    // Revenue MTD would require invoice data - leaving null for now
    revenueMTD: null,
  };
}

// ─── Async data section ───────────────────────────────────────────────────────

async function ClientsContent() {
  const [clients, tenantId] = await Promise.all([
    listClients().catch((e) => {
      logger.error('[clients] listClients failed:', e);
      return [];
    }),
    requireTenantId().catch(() => ''),
  ]);

  const hasSampleRecords = clients.some((c) => c.isSample);

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

  const kpiData = computeKPIData(clients as ClientWithRelations[]);

  return (
    <>
      {sampleDataSeeded && hasSampleRecords && tenantId && (
        <SampleDataBanner tenantId={tenantId} />
      )}

      {/* KPI Cards */}
      <ClientsKPICards data={kpiData} />

      {/* Data Grid with optimistic updates */}
      <ClientsPageClient
        clients={clients as ClientWithRelations[]}
        deleteAction={deleteClient}
      />
    </>
  );
}

// ─── Skeleton fallback ────────────────────────────────────────────────────────

function ClientsContentSkeleton() {
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

export default function ClientsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Clients
          </h1>
          <p className="mt-1 text-muted-foreground">
            View and manage your customers
          </p>
        </div>
        <Link
          href="/clients/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Client
        </Link>
      </div>

      {/* Content with Suspense */}
      <Suspense fallback={<ClientsContentSkeleton />}>
        <ClientsContent />
      </Suspense>
    </div>
  );
}
