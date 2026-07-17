'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SearchField,
  SegmentedControl,
  StatusPill,
  EmptyState,
  type StatusTone,
  type SegmentOption,
} from '@/components/ui/ds';

export interface InvoiceMobileRow {
  id: string;
  invoiceNumber: string;
  status: string;
  total: number;
  dueDate: string; // ISO
}

export interface InvoiceStats {
  total: number;
  draft: number;
  overdue: number;
  paidAmount: number;
  outstandingAmount: number;
}

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SENT: { label: 'Sent', tone: 'accent' },
  PAID: { label: 'Paid', tone: 'success' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, tone: 'neutral' as StatusTone };
}

function fmtDollar(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n)}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

type Scope = 'all' | 'open' | 'paid';
const SCOPE_OPTIONS: SegmentOption<Scope>[] = [
  { label: 'All', value: 'all' },
  { label: 'Open', value: 'open' },
  { label: 'Paid', value: 'paid' },
];
const OPEN_STATUSES = new Set(['DRAFT', 'SENT', 'OVERDUE']);

/**
 * Invoices Overview — mobile-web design system view.
 * Money-forward cards (total + status on the right), the aggregate KPIs match
 * the desktop stat row, and Open/Paid scope + search narrow the list.
 */
export function InvoicesMobile({ rows, stats }: { rows: InvoiceMobileRow[]; stats: InvoiceStats }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');

  const visible = useMemo(() => {
    let list = rows;
    if (scope === 'open') list = list.filter((r) => OPEN_STATUSES.has(r.status));
    else if (scope === 'paid') list = list.filter((r) => r.status === 'PAID');
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => r.invoiceNumber.toLowerCase().includes(q));
    return list;
  }, [rows, scope, query]);

  const hasAny = rows.length > 0;
  const isFiltering = query.trim().length > 0 || scope !== 'all';
  const countLabel =
    `${stats.total} invoice${stats.total === 1 ? '' : 's'}` + (stats.overdue > 0 ? ` · ${stats.overdue} overdue` : '');

  return (
    <MobileScreen className="pb-8 pt-2">
      <LargeTitleHeader
        title="Invoices"
        subtitle={countLabel}
        onBack={() => router.back()}
        onAdd={() => router.push('/invoices/new')}
        addLabel="New invoice"
      />

      {hasAny ? (
        <div className="space-y-3">
          <KPIRow>
            <KPICard value={fmtCompact(stats.outstandingAmount)} label="Outstanding" tone="warning" />
            <KPICard value={fmtCompact(stats.paidAmount)} label="Paid" tone="success" />
            <KPICard value={stats.overdue} label="Overdue" tone="danger" />
          </KPIRow>
          <SearchField value={query} onChange={setQuery} placeholder="Search invoice #" />
          <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </div>
      ) : null}

      {visible.length === 0 ? (
        isFiltering ? (
          <EmptyState icon={Receipt} title="No matching invoices" message="Try a different search or filter." />
        ) : (
          <EmptyState
            icon={Receipt}
            title="No invoices yet"
            message="Tap + in the top right to create your first invoice."
          />
        )
      ) : (
        <div className="mt-3 space-y-3">
          {visible.map((r) => {
            const s = statusMeta(r.status);
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => router.push(`/invoices/${r.id}`)}
                aria-label={`Invoice ${r.invoiceNumber}, ${fmtDollar(r.total)}, ${s.label}`}
                className="w-full rounded-[20px] bg-ds-card p-4 text-left transition active:opacity-75"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ds-txt">{r.invoiceNumber}</p>
                    <p className="mt-0.5 text-[13px] text-ds-txt2">Due {fmtDate(r.dueDate)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[15px] font-semibold text-ds-txt tabular-nums">{fmtDollar(r.total)}</span>
                    <StatusPill label={s.label} tone={s.tone} />
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </MobileScreen>
  );
}
