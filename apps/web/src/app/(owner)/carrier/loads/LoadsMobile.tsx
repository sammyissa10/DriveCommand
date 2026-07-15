'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Package } from 'lucide-react';
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
  Skeleton,
  type StatusTone,
} from '@/components/ui/ds';

// ---------------------------------------------------------------------------
// Data — same endpoint + shape the desktop LoadsGrid uses
// ---------------------------------------------------------------------------

interface ApiLoad {
  id: string;
  referenceNumber: string;
  clientId: string;
  client: { name: string } | null;
  dispatchId: string | null;
  dispatch: { id: string; notes: string | null } | null;
  loadType: string;
  status: string;
  totalRevenue: string | null;
  isSample: boolean;
}

interface LoadRowData {
  id: string;
  referenceNumber: string;
  clientName: string;
  dispatchNumber: string | null;
  loadType: string;
  status: string;
  totalRevenue: string | null;
}

function extractDispatchNumber(notes: string | null): string | null {
  if (!notes) return null;
  const m = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return m ? m[1] : null;
}

const LOAD_TYPE_LABEL: Record<string, string> = {
  ftl: 'FTL',
  ltl: 'LTL',
  partial: 'Partial',
  expedited: 'Expedited',
  intermodal: 'Intermodal',
};

/**
 * Tones follow the desktop's intent. Its "invoiced" is purple, which the ds has no
 * equivalent for (vip amber is reserved for VIP tags), so invoiced reads as success
 * like delivered — both are good end states and the label carries the difference.
 * Deliberately not tinting invoiced as warning: being billed isn't a problem.
 */
const STATUS_META: Record<string, { tone: StatusTone; label: string }> = {
  pending: { tone: 'neutral', label: 'Pending' },
  in_transit: { tone: 'accent', label: 'In transit' },
  delivered: { tone: 'success', label: 'Delivered' },
  invoiced: { tone: 'success', label: 'Invoiced' },
  cancelled: { tone: 'danger', label: 'Cancelled' },
};
function statusMeta(s: string) {
  return STATUS_META[s] ?? { tone: 'neutral' as StatusTone, label: s.replace(/_/g, ' ') };
}

function fmtMoney(v: string | null): string | null {
  if (v == null) return null;
  const n = Number(v);
  if (isNaN(n)) return null;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

type Scope = 'all' | 'active' | 'delivered';
const SCOPE_OPTIONS: { label: string; value: Scope }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Delivered', value: 'delivered' },
];

/** Square tile — a load is a thing, not a person. */
function LoadTile() {
  return (
    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-ds-avatar">
      <Package className="h-5 w-5 text-ds-txt2" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loads overview — mobile-web design system view (carrier)
// ---------------------------------------------------------------------------

export function LoadsMobile({
  clientMap,
  canCreate,
}: {
  clientMap: Record<string, string>;
  canCreate: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<LoadRowData[] | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>('all');

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: '1', pageSize: '100' });
    fetch(`/api/v1/carrier/loads?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        const items = (json?.data?.items ?? []) as ApiLoad[];
        setRows(
          items.map((it) => ({
            id: it.id,
            referenceNumber: it.referenceNumber,
            clientName: it.client?.name || clientMap[it.clientId] || 'Unknown client',
            dispatchNumber: it.dispatch ? extractDispatchNumber(it.dispatch.notes) : null,
            loadType: it.loadType,
            status: it.status,
            totalRevenue: it.totalRevenue,
          })),
        );
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [clientMap]);

  const counts = useMemo(() => {
    let active = 0;
    let delivered = 0;
    let invoiced = 0;
    for (const r of rows ?? []) {
      if (r.status === 'pending' || r.status === 'in_transit') active += 1;
      else if (r.status === 'delivered') delivered += 1;
      else if (r.status === 'invoiced') invoiced += 1;
    }
    return { active, delivered, invoiced };
  }, [rows]);

  const visible = useMemo(() => {
    let list = rows ?? [];
    if (status) list = list.filter((r) => r.status === status);
    if (scope === 'active') list = list.filter((r) => r.status === 'pending' || r.status === 'in_transit');
    else if (scope === 'delivered') list = list.filter((r) => r.status === 'delivered');

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (r) =>
          r.referenceNumber.toLowerCase().includes(q) ||
          r.clientName.toLowerCase().includes(q) ||
          (r.dispatchNumber?.toLowerCase().includes(q) ?? false),
      );
    }
    return [...list].sort((a, b) => a.referenceNumber.localeCompare(b.referenceNumber, undefined, { numeric: true }));
  }, [rows, status, scope, query]);

  const hasAny = (rows?.length ?? 0) > 0;
  const isFiltering = query.trim().length > 0 || status !== null || scope !== 'all';
  const countLabel = rows === null ? ' ' : `${rows.length} load${rows.length === 1 ? '' : 's'}`;

  function toggleStatus(next: string) {
    setStatus((s) => (s === next ? null : next));
  }

  return (
    <MobileScreen className="pb-6 pt-2">
      {/* A bottom-tab root — no back chevron (§ nav) */}
      <LargeTitleHeader
        title="Loads"
        subtitle={countLabel}
        onAdd={canCreate ? () => router.push('/carrier/loads/new') : undefined}
        addLabel="New load"
      />

      {hasAny ? (
        <div className="space-y-3">
          <KPIRow>
            <KPICard
              value={counts.active}
              label="Active"
              tone="accent"
              active={status === 'in_transit'}
              onClick={() => toggleStatus('in_transit')}
            />
            <KPICard
              value={counts.delivered}
              label="Delivered"
              tone="success"
              active={status === 'delivered'}
              onClick={() => toggleStatus('delivered')}
            />
            <KPICard
              value={counts.invoiced}
              label="Invoiced"
              tone="neutral"
              active={status === 'invoiced'}
              onClick={() => toggleStatus('invoiced')}
            />
          </KPIRow>

          <SearchField value={query} onChange={setQuery} placeholder="Search ref #, client, or trip" />

          <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </div>
      ) : null}

      {rows === null ? (
        <div className="mt-3 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="min-h-[92px] rounded-[20px] bg-ds-card p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-2 h-3 w-1/2" />
              <Skeleton className="mt-2 h-3 w-1/4" />
            </div>
          ))}
        </div>
      ) : visible.length === 0 ? (
        isFiltering ? (
          <EmptyState icon={Package} title="No matching loads" message="Try a different search or filter." />
        ) : (
          <EmptyState
            icon={Package}
            title="No loads yet"
            message={canCreate ? 'Tap + in the top right to book your first load.' : 'Loads booked for your fleet will appear here.'}
          />
        )
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((r) => {
            const s = statusMeta(r.status);
            const money = fmtMoney(r.totalRevenue);
            const meta = [LOAD_TYPE_LABEL[r.loadType] ?? r.loadType, money, r.dispatchNumber]
              .filter(Boolean)
              .join(' · ');
            return (
              <EntityRow
                key={r.id}
                leading={<LoadTile />}
                title={r.referenceNumber}
                subline={r.clientName}
                meta={meta || undefined}
                pill={<StatusPill label={s.label} tone={s.tone} />}
                onClick={() => router.push(`/carrier/loads/${r.id}`)}
                ariaLabel={`Load ${r.referenceNumber}, ${s.label}`}
              />
            );
          })}
        </div>
      )}
    </MobileScreen>
  );
}
