'use client';

import { CheckCheck } from 'lucide-react';
import {
  STATUS_BADGE,
  STATUS_LABEL,
  fmtDollar,
  fmtPayPeriod,
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
  fetchRows: () => void;
  handleBulkApprove: () => void;
  handleMarkPaid: (id: string) => void;
}

/** Driver Pay Report — desktop view (unchanged from the original page). */
export function DriverPayDesktop({
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
  fetchRows,
  handleBulkApprove,
  handleMarkPaid,
}: Props) {
  const uniqueDrivers = Array.from(new Set(rows.map((r) => r.driver_name))).sort();
  const filtered = driverFilter ? rows.filter((r) => r.driver_name === driverFilter) : rows;
  const pendingRows = filtered.filter((r) => r.status === 'pending');
  const hasPending = pendingRows.length > 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Driver Pay Report
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Pay records by driver and period
        </p>
      </div>

      {/* Filters + Bulk Approve */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Period Start</label>
          <input
            type="date"
            value={payPeriodStart}
            onChange={(e) => setPayPeriodStart(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Period End</label>
          <input
            type="date"
            value={payPeriodEnd}
            onChange={(e) => setPayPeriodEnd(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Driver</label>
          <select
            value={driverFilter}
            onChange={(e) => setDriverFilter(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All drivers</option>
            {uniqueDrivers.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchRows}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Filter'}
        </button>
        {hasPending && (
          <button
            onClick={handleBulkApprove}
            disabled={approving}
            className="inline-flex items-center gap-2 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 transition-colors disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            {approving ? 'Approving…' : `Approve All Pending (${pendingRows.length})`}
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No data for selected period
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Driver</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Pay Period</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Dispatch #</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Miles</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Base Pay</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Bonuses</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Tips</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Deductions</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Reimb.</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Net Pay</th>
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Status</th>
                <th className="text-center px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr key={r.id} className={idx % 2 === 1 ? 'bg-muted/50' : ''}>
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{r.driver_name}</td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {fmtPayPeriod(r.pay_period_start, r.pay_period_end)}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                    {r.dispatch_number ?? '—'}
                  </td>
                  <td className="px-4 py-3 text-right">{r.total_miles}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.base_pay)}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.bonuses)}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.tips)}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.deductions)}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.reimbursements)}</td>
                  <td className="px-4 py-3 text-right font-semibold">{fmtDollar(r.net_pay)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[r.status] ?? STATUS_BADGE.pending
                      }`}
                    >
                      {STATUS_LABEL[r.status] ?? r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {r.status === 'approved' && (
                      <button
                        onClick={() => void handleMarkPaid(r.id)}
                        disabled={markingPaidId === r.id}
                        className="inline-flex items-center rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors disabled:opacity-50"
                      >
                        {markingPaidId === r.id ? 'Marking...' : 'Mark as Paid'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
