'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SearchField,
  SegmentedControl,
  EntityRow,
  MonogramAvatar,
  StatusPill,
  EmptyState,
  type StatusTone,
  type SegmentOption,
} from '@/components/ui/ds';
import { NewClientSheet } from './NewClientSheet';
import type { ClientRow } from './_grid/types';

/** A client row enriched with load aggregates for the mobile Overview. */
export interface ClientMobileRow extends ClientRow {
  totalLoads: number;
  totalRevenue: number;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function moneyCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`;
  if (abs >= 1_000) return `$${Math.round(n / 1_000)}k`;
  return `$${Math.round(n)}`;
}

function rowMeta(c: ClientMobileRow): string {
  if (c.totalLoads === 0) return 'No loads yet';
  return `${c.totalLoads} load${c.totalLoads === 1 ? '' : 's'} · ${moneyCompact(c.totalRevenue)}`;
}

// ---------------------------------------------------------------------------
// Status mapping — carrier clients are active / inactive / blocked
// ---------------------------------------------------------------------------

function statusMeta(status: string): { tone: StatusTone; label: string } {
  switch (status) {
    case 'active':
      return { tone: 'success', label: 'Active' };
    case 'inactive':
      return { tone: 'neutral', label: 'Inactive' };
    case 'blocked':
      return { tone: 'danger', label: 'Blocked' };
    default:
      return { tone: 'neutral', label: status.charAt(0).toUpperCase() + status.slice(1) };
  }
}

type ClientFilter = 'all' | 'active' | 'inactive';

const FILTER_OPTIONS: SegmentOption<ClientFilter>[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
];

/**
 * Clients Overview — mobile-web design system view (carrier clients).
 * Rendered only at mobile widths; the desktop grid stays on `lg+`.
 */
export function ClientsMobile({
  clients,
  canCreate,
}: {
  clients: ClientMobileRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('all');
  const [createOpen, setCreateOpen] = useState(false);

  // Revenue + Loads are book-wide totals; Active is the count-filter KPI.
  const kpis = useMemo(() => {
    let active = 0;
    let revenue = 0;
    let loads = 0;
    for (const c of clients) {
      if (c.status === 'active') active += 1;
      revenue += c.totalRevenue;
      loads += c.totalLoads;
    }
    return { active, revenue, loads };
  }, [clients]);

  // Filter (segment/KPI) then search compose; sort by "who is worth my time".
  const visible = useMemo(() => {
    let list = clients;
    if (filter !== 'all') list = list.filter((c) => c.status === filter);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.primaryContact?.toLowerCase().includes(q) ?? false) ||
          (c.email?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) => b.totalRevenue - a.totalRevenue);
  }, [clients, filter, query]);

  const isFiltering = query.trim().length > 0 || filter !== 'all';
  const countLabel = `${clients.length} client${clients.length === 1 ? '' : 's'}`;

  return (
    <MobileScreen className="pb-6 pt-2">
      <LargeTitleHeader
        title="Clients"
        subtitle={countLabel}
        onBack={() => router.back()}
        onAdd={canCreate ? () => setCreateOpen(true) : undefined}
        addLabel="Add client"
      />

      <div className="space-y-3">
        <KPIRow>
          <KPICard value={moneyCompact(kpis.revenue)} label="Revenue" />
          <KPICard value={kpis.loads} label="Loads" />
          <KPICard
            value={kpis.active}
            label="Active"
            tone="success"
            active={filter === 'active'}
            onClick={() => setFilter((f) => (f === 'active' ? 'all' : 'active'))}
          />
        </KPIRow>

        <SearchField
          value={query}
          onChange={setQuery}
          placeholder="Search name or contact"
        />

        <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
      </div>

      {visible.length === 0 ? (
        isFiltering ? (
          <EmptyState
            icon={Users}
            title="No matching clients"
            message="Try a different search or filter."
          />
        ) : (
          <EmptyState
            icon={Users}
            title="No clients yet"
            message={canCreate ? 'Tap + in the top right to add your first client.' : 'Clients you add will appear here.'}
          />
        )
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((c) => {
            const s = statusMeta(c.status);
            return (
              <EntityRow
                key={c.id}
                leading={<MonogramAvatar name={c.name} />}
                title={c.name}
                subline={c.primaryContact ?? c.email ?? c.phone ?? undefined}
                meta={rowMeta(c)}
                pill={<StatusPill label={s.label} tone={s.tone} />}
                onClick={() => router.push(`/carrier/clients/${c.id}`)}
                ariaLabel={`${c.name}, ${s.label}`}
              />
            );
          })}
        </div>
      )}

      <NewClientSheet open={createOpen} onClose={() => setCreateOpen(false)} />
    </MobileScreen>
  );
}
