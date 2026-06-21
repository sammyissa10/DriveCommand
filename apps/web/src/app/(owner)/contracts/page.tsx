/**
 * Contracts overview page — built on the design system.
 *
 * Features:
 * - KPI cards (total contracts, active, expiring soon, expired)
 * - Segmented status tabs with counts
 * - Wide search with filter button
 * - Sortable table with type-aware filters (desktop)
 * - Card list with status badges (mobile)
 * - Suspense streaming for fast initial render
 */

import { Suspense } from 'react';
import Link from 'next/link';
import { Plus } from 'lucide-react';
import { listContracts, deleteContract } from '@/app/(owner)/actions/contracts';
import { ContractsKPICards, type ContractKPIData } from './_components/ContractsKPICards';
import { ContractsPageClient } from './_components/ContractsPageClient';
import { logger } from '@/lib/logger';
import type { ContractWithRelations } from '@/lib/contracts/compute-contract-status';
import { Skeleton } from '@/components/ui/skeleton';
import { computeContractStatus } from '@/lib/contracts/compute-contract-status';

// ─── Compute KPI data from contracts ──────────────────────────────────────────

function computeKPIData(contracts: ContractWithRelations[]): ContractKPIData {
  let active = 0;
  let expiring = 0;
  let expired = 0;

  contracts.forEach((contract) => {
    const { status } = computeContractStatus(contract);
    if (status === 'Active' || status === 'Pending') {
      active++;
    } else if (status === 'Expiring Soon') {
      expiring++;
    } else if (status === 'Expired') {
      expired++;
    }
  });

  return {
    total: contracts.length,
    active,
    expiring,
    expired,
  };
}

// ─── Async data section ───────────────────────────────────────────────────────

async function ContractsContent() {
  const contracts = await listContracts().catch((e) => {
    logger.error('[contracts] listContracts failed:', e);
    return [];
  });

  const kpiData = computeKPIData(contracts as ContractWithRelations[]);

  return (
    <>
      {/* KPI Cards */}
      <ContractsKPICards data={kpiData} />

      {/* Data Grid with optimistic updates */}
      <ContractsPageClient
        contracts={contracts as ContractWithRelations[]}
        deleteAction={deleteContract}
      />
    </>
  );
}

// ─── Skeleton fallback ────────────────────────────────────────────────────────

function ContractsContentSkeleton() {
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

export default function ContractsPage() {
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Contracts
          </h1>
          <p className="mt-1 text-muted-foreground">
            Manage client rate agreements
          </p>
        </div>
        <Link
          href="/contracts/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors shrink-0"
        >
          <Plus className="h-4 w-4" />
          Add Contract
        </Link>
      </div>

      {/* Content with Suspense */}
      <Suspense fallback={<ContractsContentSkeleton />}>
        <ContractsContent />
      </Suspense>
    </div>
  );
}
