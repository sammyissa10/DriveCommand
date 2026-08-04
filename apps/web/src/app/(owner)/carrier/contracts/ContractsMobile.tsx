'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SearchField,
  SegmentedControl,
  EntityRow,
  StatusPill,
  EmptyState,
  type StatusTone,
  type SegmentOption,
} from '@/components/ui/ds';
import { isOneTimeContract, ONE_TIME_LABEL } from '@/lib/carrier/one-time-contract';
import type { ContractRow } from './_grid/types';

// ---------------------------------------------------------------------------
// Formatting — mirrors the desktop grid's columns.tsx so the two views agree
// ---------------------------------------------------------------------------

function formatRate(rateType: string | null, baseRate: string | null): string | null {
  if (!baseRate) return null;
  const n = parseFloat(baseRate);
  if (Number.isNaN(n)) return null;
  const formatted = n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  switch (rateType) {
    case 'per_mile': return `${formatted}/mi`;
    case 'flat': return `${formatted} flat`;
    case 'per_hour': return `${formatted}/hr`;
    case 'per_load': return `${formatted}/load`;
    case 'percentage': return `${n}%`;
    default: return formatted;
  }
}

function formatDate(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Carrier contract lifecycle: active / pending / expired / terminated (+ the
// derived "expiring soon" renewal signal, surfaced like a driver's CDL expiry).
function statusMeta(status: string): { tone: StatusTone; label: string } {
  switch (status) {
    case 'active': return { tone: 'success', label: 'Active' };
    case 'pending': return { tone: 'warning', label: 'Pending' };
    case 'expired': return { tone: 'danger', label: 'Expired' };
    case 'terminated': return { tone: 'neutral', label: 'Terminated' };
    default: return { tone: 'neutral', label: status.charAt(0).toUpperCase() + status.slice(1) };
  }
}

/** Square document tile — a contract is a "thing", not a person, so no monogram. */
function ContractTile() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-ds-avatar">
      <FileText className="h-5 w-5 text-ds-txt2" />
    </div>
  );
}

type ContractFilter = 'all' | 'active' | 'expiring';

const FILTER_OPTIONS: SegmentOption<ContractFilter>[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Expiring', value: 'expiring' },
];

/**
 * Contracts Overview — mobile-web design system view (carrier contracts).
 * Rendered only at mobile widths; the desktop grid stays on `lg+`.
 */
export function ContractsMobile({
  contracts,
  canCreate,
}: {
  contracts: ContractRow[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<ContractFilter>('all');

  const kpis = useMemo(() => {
    let active = 0;
    let expiring = 0;
    for (const c of contracts) {
      if (c.status === 'active') active += 1;
      if (c.isExpiringSoon) expiring += 1;
    }
    return { total: contracts.length, active, expiring };
  }, [contracts]);

  // Filter (segment/KPI) then search compose; renewals float to the top, then
  // newest contract number first (CN numbers increment over time).
  const visible = useMemo(() => {
    let list = contracts;
    if (filter === 'active') list = list.filter((c) => c.status === 'active');
    else if (filter === 'expiring') list = list.filter((c) => c.isExpiringSoon);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (c) =>
          c.contractNumber.toLowerCase().includes(q) ||
          c.clientName.toLowerCase().includes(q),
      );
    }
    return [...list].sort((a, b) => {
      if (a.isExpiringSoon !== b.isExpiringSoon) return a.isExpiringSoon ? -1 : 1;
      return b.contractNumber.localeCompare(a.contractNumber);
    });
  }, [contracts, filter, query]);

  const isFiltering = query.trim().length > 0 || filter !== 'all';
  const countLabel = `${contracts.length} contract${contracts.length === 1 ? '' : 's'}`;
  const hasAny = contracts.length > 0;

  return (
    <MobileScreen className="pb-6 pt-2">
      <LargeTitleHeader
        title="Contracts"
        subtitle={countLabel}
        onBack={() => router.back()}
        onAdd={canCreate ? () => router.push('/carrier/contracts/new') : undefined}
        addLabel="New contract"
      />

      {/* Chrome only once there's ≥1 contract — three zeros over an empty list is noise. */}
      {hasAny ? (
        <div className="space-y-3">
          <KPIRow>
            <KPICard value={kpis.total} label="Total" />
            <KPICard
              value={kpis.active}
              label="Active"
              tone="success"
              active={filter === 'active'}
              onClick={() => setFilter((f) => (f === 'active' ? 'all' : 'active'))}
            />
            <KPICard
              value={kpis.expiring}
              label="Expiring"
              tone="warning"
              active={filter === 'expiring'}
              onClick={() => setFilter((f) => (f === 'expiring' ? 'all' : 'expiring'))}
            />
          </KPIRow>

          <SearchField
            value={query}
            onChange={setQuery}
            placeholder="Search contract # or client"
          />

          <SegmentedControl options={FILTER_OPTIONS} value={filter} onChange={setFilter} />
        </div>
      ) : null}

      {visible.length === 0 ? (
        isFiltering ? (
          <EmptyState
            icon={FileText}
            title="No matching contracts"
            message="Try a different search or filter."
          />
        ) : (
          <EmptyState
            icon={FileText}
            title="No contracts yet"
            message={canCreate ? 'Tap + in the top right to add your first contract.' : 'Contracts you add will appear here.'}
          />
        )
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((c) => {
            const s = statusMeta(c.status);
            const rate = formatRate(c.rateType, c.baseRate);
            const exp = formatDate(c.expirationDate);
            // A single-day spot contract is an agreement for one trip. Named
            // first in the meta line so it cannot be read as a standing one
            // (document-import Phase 3, item 3).
            const metaParts = [
              isOneTimeContract(c) ? ONE_TIME_LABEL : null,
              rate,
              exp ? `exp ${exp}` : null,
            ].filter(Boolean) as string[];
            return (
              <EntityRow
                key={c.id}
                leading={<ContractTile />}
                title={c.contractNumber}
                subline={c.clientName}
                meta={metaParts.length ? metaParts.join(' · ') : undefined}
                metaTone={c.isExpiringSoon ? 'warning' : 'muted'}
                pill={<StatusPill label={s.label} tone={s.tone} />}
                onClick={() => router.push(`/carrier/contracts/${c.id}`)}
                ariaLabel={`Contract ${c.contractNumber}, ${c.clientName}, ${s.label}`}
              />
            );
          })}
        </div>
      )}
    </MobileScreen>
  );
}
