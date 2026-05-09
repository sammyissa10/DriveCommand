'use client';

// TODO: credit_limit field not yet added to CarrierClient schema.
// When credit management is built, add credit_limit via migration and
// highlight rows here where total_outstanding > credit_limit.

import { useEffect, useState } from 'react';

interface AgingRow {
  client_id: string;
  client_name: string;
  bucket_0_30: string;
  bucket_31_60: string;
  bucket_61_90: string;
  bucket_over_90: string;
  total_outstanding: string;
  over_credit_limit: false;
}

interface ClientFinancialsProps {
  clientId: string;
  outstandingAR: string | null;
}

function fmt(val: string | null | undefined): string {
  const n = parseFloat(val ?? '0');
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

export function ClientFinancials({ clientId, outstandingAR }: ClientFinancialsProps) {
  const [agingRow, setAgingRow] = useState<AgingRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch('/api/v1/carrier/reports/aging');
        if (!res.ok) throw new Error('Failed to load aging report');
        const json = await res.json();
        const rows: AgingRow[] = json.data ?? [];
        const row = rows.find((r) => r.client_id === clientId) ?? null;
        setAgingRow(row);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error loading data');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [clientId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 rounded-lg bg-muted/40 animate-pulse" />
        <div className="h-32 rounded-lg bg-muted/40 animate-pulse" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Outstanding AR</p>
          <p className="mt-1 text-2xl font-bold text-foreground">{fmt(outstandingAR)}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Invoiced but not yet paid</p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-sm text-muted-foreground">Total Outstanding (Aging)</p>
          <p className="mt-1 text-2xl font-bold text-foreground">
            {agingRow ? fmt(agingRow.total_outstanding) : fmt('0')}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">Across all aging buckets</p>
        </div>
      </div>

      {/* Aging buckets table */}
      {agingRow ? (
        <div className="rounded-lg border border-border overflow-hidden">
          <div className="bg-muted/50 border-b border-border px-4 py-3">
            <h4 className="text-sm font-semibold text-foreground">AR Aging Buckets</h4>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 border-b border-border">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">0–30 Days</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">31–60 Days</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">61–90 Days</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">90+ Days</th>
                  <th className="text-left px-4 py-3 font-medium text-muted-foreground">Total Outstanding</th>
                </tr>
              </thead>
              <tbody>
                <tr className="divide-x divide-border">
                  <td className="px-4 py-4 font-medium text-foreground">{fmt(agingRow.bucket_0_30)}</td>
                  <td className="px-4 py-4 text-foreground">{fmt(agingRow.bucket_31_60)}</td>
                  <td className="px-4 py-4 text-foreground">{fmt(agingRow.bucket_61_90)}</td>
                  <td className="px-4 py-4 text-orange-600 dark:text-orange-400 font-medium">
                    {fmt(agingRow.bucket_over_90)}
                  </td>
                  <td className="px-4 py-4 font-bold text-foreground">
                    {fmt(agingRow.total_outstanding)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No aging data found for this client.</p>
        </div>
      )}
    </div>
  );
}
