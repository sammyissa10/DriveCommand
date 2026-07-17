'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCheck, Wallet } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SegmentedControl,
  SectionHeader,
  FieldGroup,
  StatusPill,
  EmptyState,
  Skeleton,
  type FieldDef,
  type SegmentOption,
} from '@/components/ui/ds';
import {
  fmtDollar,
  fmtCompactDollar,
  fmtPayPeriod,
  statusLabel,
  statusTone,
  sumField,
  type DriverPayRow,
} from './driver-pay-report-utils';

interface Props {
  rows: DriverPayRow[];
  loading: boolean;
  driverFilter: string;
  setDriverFilter: (v: string) => void;
  payPeriodStart: string;
  setPayPeriodStart: (v: string) => void;
  payPeriodEnd: string;
  setPayPeriodEnd: (v: string) => void;
  approving: boolean;
  markingPaidId: string | null;
  handleBulkApprove: () => void;
  handleMarkPaid: (id: string) => void;
}

type StatusScope = 'all' | 'pending' | 'approved' | 'paid';
const SCOPE_OPTIONS: SegmentOption<StatusScope>[] = [
  { label: 'All', value: 'all' },
  { label: 'Pending', value: 'pending' },
  { label: 'Approved', value: 'approved' },
  { label: 'Paid', value: 'paid' },
];

/**
 * Driver Pay Report — mobile-web design system view (carrier).
 *
 * Read-only report with two live actions (bulk approve, mark-paid). The desktop
 * 12-column table collapses to per-record cards; approve/mark-paid stay inline.
 * Filters auto-apply (dates refetch; driver + status filter client-side).
 */
export function DriverPayMobile({
  rows,
  loading,
  driverFilter,
  setDriverFilter,
  payPeriodStart,
  setPayPeriodStart,
  payPeriodEnd,
  setPayPeriodEnd,
  approving,
  markingPaidId,
  handleBulkApprove,
  handleMarkPaid,
}: Props) {
  const router = useRouter();
  const [scope, setScope] = useState<StatusScope>('all');

  const uniqueDrivers = useMemo(
    () => Array.from(new Set(rows.map((r) => r.driver_name))).sort(),
    [rows],
  );

  // Driver filter applies to counts/KPIs; the status scope only narrows the list.
  const driverScoped = useMemo(
    () => (driverFilter ? rows.filter((r) => r.driver_name === driverFilter) : rows),
    [rows, driverFilter],
  );

  const counts = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let paid = 0;
    for (const r of driverScoped) {
      if (r.status === 'pending') pending += 1;
      else if (r.status === 'approved') approved += 1;
      else if (r.status === 'paid') paid += 1;
    }
    return { pending, approved, paid, netPay: sumField(driverScoped, 'net_pay') };
  }, [driverScoped]);

  const visible = useMemo(
    () => (scope === 'all' ? driverScoped : driverScoped.filter((r) => r.status === scope)),
    [driverScoped, scope],
  );

  const pendingCount = counts.pending;

  const filterFields: FieldDef[] = [
    { key: 'start', label: 'Period start', input: { value: payPeriodStart, onChange: setPayPeriodStart, type: 'date' } },
    { key: 'end', label: 'Period end', input: { value: payPeriodEnd, onChange: setPayPeriodEnd, type: 'date' } },
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
      <LargeTitleHeader title="Driver Pay" subtitle="Pay records by driver and period" onBack={() => router.back()} />

      <div className="space-y-6">
        {/* Filters — auto-apply on change */}
        <div>
          <SectionHeader title="Period" />
          <FieldGroup fields={filterFields} isEditing />
        </div>

        {/* Summary KPIs */}
        <KPIRow>
          <KPICard value={fmtCompactDollar(counts.netPay)} label="Net pay" tone="accent" />
          <KPICard value={counts.pending} label="Pending" tone="warning" />
          <KPICard value={counts.paid} label="Paid" tone="success" />
        </KPIRow>

        {/* Bulk approve — the primary action when anything's pending */}
        {pendingCount > 0 ? (
          <button
            type="button"
            onClick={handleBulkApprove}
            disabled={approving}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-ds-success text-[16px] font-semibold text-white transition active:opacity-75 disabled:opacity-35"
          >
            <CheckCheck className="h-5 w-5" />
            {approving ? 'Approving…' : `Approve all pending (${pendingCount})`}
          </button>
        ) : null}

        <SegmentedControl options={SCOPE_OPTIONS} value={scope} onChange={setScope} />

        {/* Records */}
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
            icon={Wallet}
            title={driverScoped.length === 0 ? 'No pay records for this period' : 'No matching records'}
            message={driverScoped.length === 0 ? 'Adjust the dates or driver filter above.' : 'Try a different status filter.'}
          />
        ) : (
          <div className="space-y-3">
            {visible.map((r) => {
              const meta = [r.dispatch_number, r.total_miles ? `${r.total_miles} mi` : null]
                .filter(Boolean)
                .join(' · ');
              return (
                <div key={r.id} className="rounded-[20px] bg-ds-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-semibold text-ds-txt">{r.driver_name}</p>
                      <p className="mt-0.5 text-[13px] text-ds-txt2">{fmtPayPeriod(r.pay_period_start, r.pay_period_end)}</p>
                      {meta ? <p className="mt-0.5 text-[12px] text-ds-txt3">{meta}</p> : null}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="text-[15px] font-semibold text-ds-txt">{fmtDollar(r.net_pay)}</p>
                      <div className="mt-1 flex justify-end">
                        <StatusPill label={statusLabel(r.status)} tone={statusTone(r.status)} />
                      </div>
                    </div>
                  </div>

                  {r.status === 'approved' ? (
                    <button
                      type="button"
                      onClick={() => handleMarkPaid(r.id)}
                      disabled={markingPaidId === r.id}
                      className="mt-3 flex h-11 w-full items-center justify-center rounded-[12px] bg-ds-accent/[0.16] text-[15px] font-semibold text-ds-accent transition active:opacity-75 disabled:opacity-35"
                    >
                      {markingPaidId === r.id ? 'Marking…' : 'Mark as paid'}
                    </button>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </MobileScreen>
  );
}
