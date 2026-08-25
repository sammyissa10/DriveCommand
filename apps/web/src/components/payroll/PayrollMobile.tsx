'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DollarSign } from 'lucide-react';
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
import { formatDateOnly } from '@/lib/utils/date';

export interface PayrollMobileRow {
  id: string;
  driverName: string;
  periodStart: string; // ISO
  periodEnd: string; // ISO
  totalPay: number;
  status: string;
}

export interface PayrollStats {
  total: number;
  draft: number;
  approved: number;
  totalPaid: number;
}

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  APPROVED: { label: 'Approved', tone: 'accent' },
  PAID: { label: 'Paid', tone: 'success' },
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
// `pay_period_start` / `pay_period_end` are `@db.Date` — see lib/utils/date.ts.
function fmtPeriod(startIso: string, endIso: string): string {
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${formatDateOnly(startIso, opts)} – ${formatDateOnly(endIso, opts)}`;
}

type Scope = 'all' | 'DRAFT' | 'APPROVED' | 'PAID';
const SCOPE_OPTIONS: SegmentOption<Scope>[] = [
  { label: 'All', value: 'all' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Paid', value: 'PAID' },
];

/**
 * Payroll Overview — mobile-web design system view.
 * Money-forward per-record cards (driver + period, total + status right); KPIs
 * mirror the desktop stat row; a status scope + driver search narrow the list.
 */
export function PayrollMobile({ rows, stats }: { rows: PayrollMobileRow[]; stats: PayrollStats }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<Scope>('all');

  const visible = useMemo(() => {
    let list = rows;
    if (scope !== 'all') list = list.filter((r) => r.status === scope);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((r) => r.driverName.toLowerCase().includes(q));
    return list;
  }, [rows, scope, query]);

  const hasAny = rows.length > 0;
  const isFiltering = query.trim().length > 0 || scope !== 'all';
  const countLabel =
    `${stats.total} record${stats.total === 1 ? '' : 's'}` +
    (stats.approved > 0 ? ` · ${stats.approved} pending` : '');

  return (
    <MobileScreen className="pb-8 pt-2">
      <LargeTitleHeader
        title="Payroll"
        subtitle={countLabel}
        onBack={() => router.back()}
        onAdd={() => router.push('/payroll/new')}
        addLabel="New payroll record"
      />

      {hasAny ? (
        <div className="space-y-3">
          <KPIRow>
            <KPICard value={fmtCompact(stats.totalPaid)} label="Paid" tone="success" />
            <KPICard value={stats.approved} label="Approved" tone="accent" />
            <KPICard value={stats.draft} label="Draft" tone="neutral" />
          </KPIRow>
          <SearchField value={query} onChange={setQuery} placeholder="Search driver" />
          <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={setScope} />
        </div>
      ) : null}

      {visible.length === 0 ? (
        isFiltering ? (
          <EmptyState icon={DollarSign} title="No matching records" message="Try a different search or filter." />
        ) : (
          <EmptyState
            icon={DollarSign}
            title="No payroll records yet"
            message="Tap + in the top right to create your first record."
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
                onClick={() => router.push(`/payroll/${r.id}`)}
                aria-label={`${r.driverName}, ${fmtDollar(r.totalPay)}, ${s.label}`}
                className="w-full rounded-[20px] bg-ds-card p-4 text-left transition active:opacity-75"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[15px] font-semibold text-ds-txt">{r.driverName}</p>
                    <p className="mt-0.5 text-[13px] text-ds-txt2">{fmtPeriod(r.periodStart, r.periodEnd)}</p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="text-[15px] font-semibold text-ds-txt tabular-nums">{fmtDollar(r.totalPay)}</span>
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
