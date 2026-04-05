'use client';

import { useEffect, useState } from 'react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgingRow {
  client_id: string;
  client_name: string;
  bucket_0_30: string;
  bucket_31_60: string;
  bucket_61_90: string;
  bucket_over_90: string;
  total_outstanding: string;
  over_credit_limit: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDollar(val: string | number): string {
  const num = typeof val === 'string' ? parseFloat(val || '0') : val;
  return `$${num.toFixed(2)}`;
}

function sumColumn(rows: AgingRow[], key: keyof AgingRow): number {
  return rows.reduce((acc, r) => acc + parseFloat(String(r[key] || '0')), 0);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function AgingReportPage() {
  const [rows, setRows] = useState<AgingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/v1/carrier/reports/aging')
      .then((r) => (r.ok ? r.json() : Promise.reject(r)))
      .then((json) => setRows(json.data ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, []);

  const sum0_30 = sumColumn(rows, 'bucket_0_30');
  const sum31_60 = sumColumn(rows, 'bucket_31_60');
  const sum61_90 = sumColumn(rows, 'bucket_61_90');
  const sumOver90 = sumColumn(rows, 'bucket_over_90');
  const sumTotal = sumColumn(rows, 'total_outstanding');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          AR Aging Report
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Accounts receivable bucketed by age
        </p>
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No data for selected period
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Client</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">0–30 Days</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">31–60 Days</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">61–90 Days</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">90+ Days</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground whitespace-nowrap">Total Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => (
                <tr
                  key={r.client_id}
                  className={[
                    idx % 2 === 1 ? 'bg-muted/50' : '',
                    r.over_credit_limit
                      ? 'bg-red-50 dark:bg-red-900/20'
                      : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <td className="px-4 py-3 font-medium">{r.client_name}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.bucket_0_30)}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.bucket_31_60)}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.bucket_61_90)}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.bucket_over_90)}</td>
                  <td className="px-4 py-3 text-right font-semibold">
                    {fmtDollar(r.total_outstanding)}
                  </td>
                </tr>
              ))}
            </tbody>
            {/* Summary row */}
            <tfoot>
              <tr className="border-t-2 border-border font-bold">
                <td className="px-4 py-3">Total</td>
                <td className="px-4 py-3 text-right">{fmtDollar(sum0_30)}</td>
                <td className="px-4 py-3 text-right">{fmtDollar(sum31_60)}</td>
                <td className="px-4 py-3 text-right">{fmtDollar(sum61_90)}</td>
                <td className="px-4 py-3 text-right">{fmtDollar(sumOver90)}</td>
                <td className="px-4 py-3 text-right">{fmtDollar(sumTotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
