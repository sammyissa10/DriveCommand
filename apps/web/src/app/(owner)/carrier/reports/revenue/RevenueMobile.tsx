'use client';

import { useRouter } from 'next/navigation';
import { Download, TrendingUp } from 'lucide-react';
import {
  MobileScreen,
  LargeTitleHeader,
  KPIRow,
  KPICard,
  SectionHeader,
  FieldGroup,
  EmptyState,
  Skeleton,
  type FieldDef,
} from '@/components/ui/ds';
import {
  fmtDollar,
  fmtCompactDollar,
  fmtMonthLabel,
  buildMonthTotals,
  buildClientSummary,
  triggerCSVDownload,
  type RevenueReport,
  type CarrierClient,
} from './revenue-report-utils';

interface Props {
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  clientId: string;
  setClientId: (v: string) => void;
  clients: CarrierClient[];
  report: RevenueReport | null;
  loading: boolean;
}

/**
 * Revenue Report — mobile-web design system view (carrier).
 *
 * A read-only report has no create/edit. The desktop's multi-series bar chart
 * doesn't survive a phone width, so the mobile view keeps the money answers:
 * summary KPIs, a lightweight monthly-invoiced trend (pure CSS bars), and a
 * per-client breakdown. Filters auto-apply (the page refetches on change).
 */
export function RevenueMobile({
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  clientId,
  setClientId,
  clients,
  report,
  loading,
}: Props) {
  const router = useRouter();

  const rows = report?.monthly_by_client ?? [];
  const summary = report?.summary;
  const monthTotals = buildMonthTotals(rows);
  const clientSummary = buildClientSummary(rows);
  const maxMonth = Math.max(...monthTotals.map((m) => m.total), 1);

  const filterFields: FieldDef[] = [
    { key: 'from', label: 'From', input: { value: dateFrom, onChange: setDateFrom, type: 'date' } },
    { key: 'to', label: 'To', input: { value: dateTo, onChange: setDateTo, type: 'date' } },
    {
      key: 'client',
      label: 'Client',
      input: {
        value: clientId,
        onChange: setClientId,
        options: [{ label: 'All clients', value: '' }, ...clients.map((c) => ({ label: c.name, value: c.id }))],
      },
    },
  ];

  return (
    <MobileScreen className="pb-8 pt-2">
      <LargeTitleHeader title="Revenue" subtitle="Monthly revenue by client" onBack={() => router.back()} />

      <div className="space-y-6">
        {/* Filters — auto-apply on change */}
        <div>
          <SectionHeader title="Period" />
          <FieldGroup fields={filterFields} isEditing />
        </div>

        {/* Summary KPIs */}
        {summary ? (
          <KPIRow>
            <KPICard value={fmtCompactDollar(summary.total_invoiced)} label="Invoiced" tone="accent" />
            <KPICard value={fmtCompactDollar(summary.total_paid)} label="Paid" tone="success" />
            <KPICard value={fmtCompactDollar(summary.outstanding)} label="Outstanding" tone="warning" />
          </KPIRow>
        ) : null}

        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-[20px] bg-ds-card p-4">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="mt-2 h-3 w-1/2" />
              </div>
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={TrendingUp}
            title="No revenue for this period"
            message="Adjust the dates or client filter above."
          />
        ) : (
          <>
            {/* Monthly invoiced trend — CSS bars, no chart lib */}
            {monthTotals.length > 0 ? (
              <div>
                <SectionHeader title="Monthly invoiced" />
                <div className="space-y-2.5 rounded-[20px] bg-ds-card p-4">
                  {monthTotals.map((m) => (
                    <div key={m.month} className="flex items-center gap-3">
                      <span className="w-16 shrink-0 text-[12px] text-ds-txt3">{fmtMonthLabel(m.month)}</span>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-ds-elevated">
                        <div
                          className="h-full rounded-full bg-ds-accent"
                          style={{ width: `${Math.max((m.total / maxMonth) * 100, 2)}%` }}
                        />
                      </div>
                      <span className="w-14 shrink-0 text-right text-[12px] font-medium text-ds-txt2">
                        {fmtCompactDollar(m.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Per-client breakdown */}
            {clientSummary.length > 0 ? (
              <div>
                <SectionHeader title="By client" />
                <div className="space-y-3">
                  {clientSummary.map((r) => (
                    <div key={r.client_id} className="rounded-[20px] bg-ds-card p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-[15px] font-semibold text-ds-txt">{r.client_name}</p>
                          <p className="mt-0.5 text-[13px] text-ds-txt2">
                            {r.loads} load{r.loads === 1 ? '' : 's'} · {fmtCompactDollar(r.total_paid)} paid
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-[15px] font-semibold text-ds-txt">{fmtDollar(r.total_invoiced)}</p>
                          {r.outstanding > 0 ? (
                            <p className="mt-0.5 text-[12px] text-ds-warning">{fmtDollar(r.outstanding)} due</p>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {/* Export */}
            {clientSummary.length > 0 ? (
              <button
                type="button"
                onClick={() => triggerCSVDownload(clientSummary, dateFrom, dateTo)}
                className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-ds-card text-[16px] font-semibold text-ds-txt transition active:opacity-75"
              >
                <Download className="h-5 w-5 text-ds-txt2" />
                Export CSV
              </button>
            ) : null}
          </>
        )}
      </div>
    </MobileScreen>
  );
}
