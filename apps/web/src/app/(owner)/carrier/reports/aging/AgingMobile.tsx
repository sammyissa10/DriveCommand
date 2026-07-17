'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SegmentedControl,
  SectionHeader,
  StatusPill,
  EmptyState,
  Skeleton,
  type SegmentOption,
} from '@/components/ui/ds';
import {
  AGING_BUCKETS,
  KPI_TONE,
  fmtDollar,
  fmtCompactDollar,
  toAgingClient,
  agingTotals,
  sortClients,
  oldestBalance,
  type AgingRow,
  type AgingSort,
} from './aging-report-utils';

interface Props {
  rows: AgingRow[];
  loading: boolean;
}

const META_TONE = {
  muted: 'text-ds-txt3',
  warning: 'text-ds-warning',
  danger: 'text-ds-danger',
} as const;

const SORT_OPTIONS: SegmentOption<AgingSort>[] = [
  { label: 'At risk', value: 'risk' },
  { label: 'Balance', value: 'balance' },
  { label: 'Name', value: 'name' },
];

/** A stacked risk-ramp bar for a set of bucket amounts. Zero segments are skipped. */
function StackedBar({ buckets, height = 10 }: { buckets: number[]; height?: number }) {
  const total = buckets.reduce((a, b) => a + b, 0);
  return (
    <div
      className="flex w-full overflow-hidden rounded-full bg-ds-elevated"
      style={{ height }}
      aria-hidden
    >
      {total > 0
        ? buckets.map((v, i) =>
            v > 0 ? (
              <div key={i} style={{ width: `${(v / total) * 100}%`, backgroundColor: AGING_BUCKETS[i].color }} />
            ) : null,
          )
        : null}
    </div>
  );
}

/**
 * AR Aging Report — mobile-web design system view (carrier).
 *
 * Answers "who owes me, how much, and how worried should I be." The desktop's
 * 6-column table becomes: portfolio KPIs, a stacked aging-distribution bar with
 * legend, and a most-overdue-first client worklist where each card carries its
 * own mini aging bar + oldest-money callout. Over-credit-limit is promoted from
 * a faint row tint to a danger pill. Tap a client → their detail.
 */
export function AgingMobile({ rows, loading }: Props) {
  const router = useRouter();
  const [sort, setSort] = useState<AgingSort>('risk');

  const clients = useMemo(() => rows.map(toAgingClient), [rows]);
  const totals = useMemo(() => agingTotals(clients), [clients]);
  const sorted = useMemo(() => sortClients(clients, sort), [clients, sort]);

  const countLabel =
    clients.length === 0 ? 'Accounts receivable' : `${clients.length} client${clients.length === 1 ? '' : 's'} with a balance`;

  return (
    <MobileScreen className="pb-8 pt-2">
      <LargeTitleHeader title="AR Aging" subtitle={countLabel} onBack={() => router.back()} />

      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="rounded-[20px] bg-ds-card p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-2 w-full" />
            </div>
          ))}
        </div>
      ) : clients.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nothing outstanding"
          message="Client balances owed to you will show up here, bucketed by age."
        />
      ) : (
        <div className="space-y-6">
          {/* Portfolio KPIs */}
          <KPIRow>
            <KPICard value={fmtCompactDollar(totals.total)} label="Outstanding" tone={KPI_TONE.outstanding} />
            <KPICard value={fmtCompactDollar(totals.overdue)} label="Overdue" tone={KPI_TONE.overdue} />
            <KPICard value={fmtCompactDollar(totals.over90)} label="90+ days" tone={KPI_TONE.over90} />
          </KPIRow>

          {/* Aging distribution */}
          <div>
            <SectionHeader title="Aging breakdown" />
            <div className="rounded-[20px] bg-ds-card p-4">
              <StackedBar buckets={totals.buckets} />
              <p className="mt-2 text-[12px] text-ds-txt3">{totals.pctCurrent}% current</p>
              <div className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                {AGING_BUCKETS.map((b, i) => (
                  <div key={b.label} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: b.color }} />
                    <span className="text-[13px] text-ds-txt2">{b.label}</span>
                    <span className="ml-auto text-[13px] font-medium text-ds-txt tabular-nums">
                      {fmtCompactDollar(totals.buckets[i])}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Client worklist */}
          <div>
            <SectionHeader title="By client" />
            <SegmentedControl options={SORT_OPTIONS} value={sort} onChange={setSort} />
            <div className="mt-3 space-y-3">
              {sorted.map((c) => {
                const oldest = oldestBalance(c);
                return (
                  <button
                    key={c.clientId}
                    type="button"
                    onClick={() => router.push(`/carrier/clients/${c.clientId}`)}
                    aria-label={`${c.clientName}, ${fmtDollar(c.total)} outstanding`}
                    className="w-full rounded-[20px] bg-ds-card p-4 text-left transition active:opacity-75"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-ds-txt">{c.clientName}</span>
                        {c.overCreditLimit ? <StatusPill label="Over limit" tone="danger" /> : null}
                      </div>
                      <span className="shrink-0 text-[15px] font-semibold text-ds-txt tabular-nums">
                        {fmtDollar(c.total)}
                      </span>
                    </div>
                    <div className="mt-3">
                      <StackedBar buckets={c.buckets} height={8} />
                    </div>
                    <p className={`mt-2 text-[12px] ${META_TONE[oldest.tone]}`}>{oldest.text}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </MobileScreen>
  );
}
