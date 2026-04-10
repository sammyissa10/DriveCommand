'use client';

import { useEffect, useState, useCallback } from 'react';
import { CheckCheck } from 'lucide-react';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface DriverPayRow {
  id: string;
  driver_name: string;
  dispatch_number: string | null;
  total_miles: number;
  base_pay: string;
  bonuses: string;
  tips: string;
  deductions: string;
  reimbursements: string;
  net_pay: string;
  status: string;
  pay_period_start: string | null;
  pay_period_end: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  paid: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  paid: 'Paid',
};

function fmtDollar(val: string): string {
  const num = parseFloat(val || '0');
  return `$${num.toFixed(2)}`;
}

function fmtPayPeriod(start: string | null, end: string | null): string {
  if (!start) return '—';
  const s = start.slice(0, 10);
  const e = end ? end.slice(0, 10) : '';
  return e ? `${s} – ${e}` : s;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function DriverPayReportPage() {
  const [rows, setRows] = useState<DriverPayRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [driverFilter, setDriverFilter] = useState('');
  const [payPeriodStart, setPayPeriodStart] = useState('');
  const [payPeriodEnd, setPayPeriodEnd] = useState('');
  const [approving, setApproving] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (payPeriodStart) params.set('pay_period_start', payPeriodStart);
      if (payPeriodEnd) params.set('pay_period_end', payPeriodEnd);
      params.set('pageSize', '200');
      const res = await fetch(`/api/v1/carrier/reports/driver-pay?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load driver pay report');
      const json = await res.json();
      setRows(json.data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [payPeriodStart, payPeriodEnd]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  // Unique driver names for filter dropdown (derived from fetched data)
  const uniqueDrivers = Array.from(new Set(rows.map((r) => r.driver_name))).sort();

  // Apply client-side driver filter
  const filtered = driverFilter
    ? rows.filter((r) => r.driver_name === driverFilter)
    : rows;

  const pendingRows = filtered.filter((r) => r.status === 'pending');
  const hasPending = pendingRows.length > 0;

  async function handleMarkPaid(id: string) {
    if (!window.confirm('Mark this pay record as paid? This cannot be undone.')) return;
    setMarkingPaidId(id);
    try {
      const res = await fetch(`/api/v1/carrier/pay-records/${id}/mark-paid`, {
        method: 'PATCH',
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? 'Failed to mark as paid');
      }
      toast.success('Pay record marked as paid');
      fetchRows();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to mark pay record as paid');
    } finally {
      setMarkingPaidId(null);
    }
  }

  async function handleBulkApprove() {
    setApproving(true);
    let successCount = 0;
    let errorCount = 0;
    for (const row of pendingRows) {
      try {
        const res = await fetch(`/api/v1/carrier/pay-records/${row.id}/approve`, {
          method: 'PATCH',
        });
        if (res.ok) {
          successCount++;
        } else {
          errorCount++;
        }
      } catch {
        errorCount++;
      }
    }
    setApproving(false);
    if (successCount > 0) {
      toast.success(`Approved ${successCount} record${successCount !== 1 ? 's' : ''}`);
    }
    if (errorCount > 0) {
      toast.error(`${errorCount} record${errorCount !== 1 ? 's' : ''} failed to approve`);
    }
    if (successCount > 0) {
      fetchRows();
    }
  }

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
