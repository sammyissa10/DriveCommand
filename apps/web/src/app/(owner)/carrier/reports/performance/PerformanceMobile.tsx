'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Gauge } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SegmentedControl,
  SectionHeader,
  FieldGroup,
  PrimaryButton,
  StatusPill,
  EmptyState,
  Skeleton,
  type FieldDef,
  type SegmentOption,
} from '@/components/ui/ds';
import {
  fmtCompactDollar,
  fmtMiles,
  fmtDwell,
  onTimeTone,
  summarize,
  sortRows,
  type PerformanceRow,
  type PerfSort,
} from './performance-report-utils';

interface Props {
  rows: PerformanceRow[];
  loading: boolean;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  driverFilter: string;
  setDriverFilter: (v: string) => void;
  fetchRows: () => void;
}

const SORT_OPTIONS: SegmentOption<PerfSort>[] = [
  { label: 'Recent', value: 'recent' },
  { label: 'On-time', value: 'ontime' },
  { label: 'Dwell', value: 'dwell' },
];

/**
 * Performance Report — mobile-web design system view (carrier).
 *
 * Answers "are dispatches running on time, and where's the drag." The desktop
 * 7-column table becomes fleet KPIs (on-time / dwell / dispatches) + a
 * per-dispatch worklist where each card leads with a color-coded on-time pill.
 * Sort surfaces the worst performers. Dates apply via the button (server
 * refetch); the driver filter is live/client-side.
 */
export function PerformanceMobile({
  rows,
  loading,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  driverFilter,
  setDriverFilter,
  fetchRows,
}: Props) {
  const router = useRouter();
  const [sort, setSort] = useState<PerfSort>('recent');

  const uniqueDrivers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.driver_name))).sort(),
    [rows],
  );

  // Driver filter is client-side; sort is applied after.
  const visible = useMemo(() => {
    const filtered = driverFilter ? rows.filter((r) => r.driver_name === driverFilter) : rows;
    return sortRows(filtered, sort);
  }, [rows, driverFilter, sort]);

  const summary = useMemo(() => summarize(visible), [visible]);

  const filterFields: FieldDef[] = [
    { key: 'from', label: 'From', input: { value: dateFrom, onChange: setDateFrom, type: 'date' } },
    { key: 'to', label: 'To', input: { value: dateTo, onChange: setDateTo, type: 'date' } },
    {
      key: 'driver',
      label: 'Driver',
      input: {
        value: driverFilter,
        onChange: setDriverFilter,
        options: [{ label: 'All drivers', value: '' }, ...uniqueDrivers.map((n) => ({ label: n, value: n }))],
      },
    },
  ];

  return (
    <MobileScreen className="pb-8 pt-2">
      <LargeTitleHeader title="Performance" subtitle="On-time & dwell by dispatch" onBack={() => router.back()} />

      <div className="space-y-6">
        {/* Fleet KPIs */}
        <KPIRow>
          <KPICard
            value={summary.onTimePct != null ? `${Math.round(summary.onTimePct)}%` : '—'}
            label="On-time"
            tone={onTimeTone(summary.onTimePct)}
          />
          <KPICard
            value={summary.avgDwell != null ? `${Math.round(summary.avgDwell)}m` : '—'}
            label="Avg dwell"
            tone="accent"
          />
          <KPICard value={summary.dispatches} label="Dispatches" tone="neutral" />
        </KPIRow>

        {/* Filters — dates apply on the button (server refetch); driver is live */}
        <div>
          <SectionHeader title="Period" />
          <FieldGroup fields={filterFields} isEditing />
          <div className="mt-3">
            <PrimaryButton label={loading ? 'Loading…' : 'Apply'} onClick={fetchRows} loading={loading} />
          </div>
        </div>

        {/* Dispatch worklist */}
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="rounded-[20px] bg-ds-card p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : visible.length === 0 ? (
          <EmptyState
            icon={Gauge}
            title={rows.length === 0 ? 'No dispatches in this period' : 'No dispatches for this driver'}
            message={rows.length === 0 ? 'Adjust the dates and tap Apply.' : 'Try a different driver filter.'}
          />
        ) : (
          <div>
            <SectionHeader title="By dispatch" />
            <SegmentedControl options={SORT_OPTIONS} value={sort} onChange={setSort} />
            <div className="mt-3 space-y-3">
              {visible.map((r) => {
                const meta = [
                  `${r.total_stops} stop${r.total_stops === 1 ? '' : 's'}`,
                  fmtDwell(r.avg_dwell_minutes),
                  fmtMiles(r.actual_miles),
                ]
                  .filter(Boolean)
                  .join(' · ');
                return (
                  <button
                    key={r.dispatch_id}
                    type="button"
                    onClick={() => router.push(`/carrier/trips/${r.dispatch_id}`)}
                    aria-label={`${r.dispatch_number ?? 'Dispatch'}, ${r.driver_name}${r.on_time_pct != null ? `, ${Math.round(r.on_time_pct)}% on-time` : ''}`}
                    className="w-full rounded-[20px] bg-ds-card p-4 text-left transition active:opacity-75"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-[15px] font-semibold text-ds-txt">
                          {r.dispatch_number ?? 'Dispatch'}
                        </p>
                        <p className="mt-0.5 truncate text-[13px] text-ds-txt2">{r.driver_name}</p>
                        {meta ? <p className="mt-0.5 text-[12px] text-ds-txt3">{meta}</p> : null}
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        {r.on_time_pct != null ? (
                          <StatusPill label={`${Math.round(r.on_time_pct)}% on-time`} tone={onTimeTone(r.on_time_pct)} />
                        ) : (
                          <span className="text-[12px] text-ds-txt3">No on-time data</span>
                        )}
                        <span className="text-[12px] text-ds-txt3 tabular-nums">
                          {fmtCompactDollar(r.total_expenses)} exp
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </MobileScreen>
  );
}
