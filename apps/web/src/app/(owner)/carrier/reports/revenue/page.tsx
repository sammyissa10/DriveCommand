'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { Download } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RevenueRow {
  month: string;
  client_id: string;
  client_name: string;
  loads_count: number;
  total_invoiced: string;
  total_paid: string;
  outstanding: string;
}

interface RevenueSummary {
  total_invoiced: string;
  total_paid: string;
  outstanding: string;
  period_start: string;
  period_end: string;
}

interface RevenueReport {
  monthly_by_client: RevenueRow[];
  summary: RevenueSummary;
}

interface CarrierClient {
  id: string;
  name: string;
}

// Aggregated per-client for the summary table
interface ClientSummaryRow {
  client_id: string;
  client_name: string;
  loads: number;
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#f43f5e', '#06b6d4', '#f97316', '#84cc16',
];

function getCurrentYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

function fmtDollar(val: string | number): string {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return `$${num.toFixed(2)}`;
}

function buildChartData(rows: RevenueRow[]): Record<string, unknown>[] {
  // Group by month → { month: 'YYYY-MM', [clientName]: amount }
  const byMonth: Record<string, Record<string, number>> = {};
  for (const r of rows) {
    if (!byMonth[r.month]) byMonth[r.month] = {};
    byMonth[r.month][r.client_name] =
      (byMonth[r.month][r.client_name] ?? 0) + parseFloat(r.total_invoiced || '0');
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, clients]) => ({ month, ...clients }));
}

function buildClientSummary(rows: RevenueRow[]): ClientSummaryRow[] {
  const map: Record<string, ClientSummaryRow> = {};
  for (const r of rows) {
    if (!map[r.client_id]) {
      map[r.client_id] = {
        client_id: r.client_id,
        client_name: r.client_name,
        loads: 0,
        total_invoiced: 0,
        total_paid: 0,
        outstanding: 0,
      };
    }
    map[r.client_id].loads += r.loads_count;
    map[r.client_id].total_invoiced += parseFloat(r.total_invoiced || '0');
    map[r.client_id].total_paid += parseFloat(r.total_paid || '0');
    map[r.client_id].outstanding += parseFloat(r.outstanding || '0');
  }
  return Object.values(map).sort((a, b) => b.total_invoiced - a.total_invoiced);
}

function triggerCSVDownload(rows: ClientSummaryRow[], dateFrom: string, dateTo: string) {
  const headers = ['Client', 'Loads', 'Total Invoiced', 'Total Paid', 'Outstanding', 'Avg Days to Pay'];
  const csvRows = rows.map((r) =>
    [
      `"${r.client_name}"`,
      r.loads,
      r.total_invoiced.toFixed(2),
      r.total_paid.toFixed(2),
      r.outstanding.toFixed(2),
      'N/A',
    ].join(',')
  );
  const csv = [headers.join(','), ...csvRows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `revenue-report-${dateFrom}-${dateTo}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function RevenueReportPage() {
  const [dateFrom, setDateFrom] = useState(getCurrentYearStart());
  const [dateTo, setDateTo] = useState(getTodayISO());
  const [clientId, setClientId] = useState('');
  const [clients, setClients] = useState<CarrierClient[]>([]);
  const [report, setReport] = useState<RevenueReport | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch client list for filter dropdown
  useEffect(() => {
    fetch('/api/v1/carrier/clients?pageSize=200')
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => setClients(json?.data?.items ?? []))
      .catch(() => {});
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (clientId) params.set('client_id', clientId);
      const res = await fetch(`/api/v1/carrier/reports/revenue?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load revenue report');
      const json = await res.json();
      setReport(json.data);
    } catch {
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, clientId]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const rows = report?.monthly_by_client ?? [];
  const summary = report?.summary;
  const chartData = buildChartData(rows);
  const clientSummary = buildClientSummary(rows);
  const uniqueClients = Array.from(new Set(rows.map((r) => r.client_name)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Revenue Report
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Monthly revenue by client
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-foreground">Client</label>
          <select
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            className="flex h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={fetchReport}
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {loading ? 'Loading…' : 'Filter'}
        </button>
        {clientSummary.length > 0 && (
          <button
            onClick={() => triggerCSVDownload(clientSummary, dateFrom, dateTo)}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Download className="h-4 w-4" />
            Export CSV
          </button>
        )}
      </div>

      {/* Summary chips */}
      {summary && (
        <div className="flex flex-wrap gap-3 text-sm">
          <div className="rounded-lg border border-border bg-card px-4 py-2">
            <span className="text-muted-foreground">Total Invoiced: </span>
            <span className="font-semibold">{fmtDollar(summary.total_invoiced)}</span>
          </div>
          <div className="rounded-lg border border-border bg-card px-4 py-2">
            <span className="text-muted-foreground">Outstanding: </span>
            <span className="font-semibold">{fmtDollar(summary.outstanding)}</span>
          </div>
        </div>
      )}

      {/* Bar Chart */}
      {loading ? (
        <div className="h-96 rounded-lg border border-border bg-card animate-pulse" />
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No data for selected period
        </div>
      ) : (
        <div className="rounded-lg border border-border bg-card p-4">
          <ResponsiveContainer width="100%" height={400}>
            <BarChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" tick={{ fontSize: 12 }} />
              <YAxis
                tickFormatter={(v: number) =>
                  v >= 1000 ? `$${(v / 1000).toFixed(0)}K` : `$${v}`
                }
                tick={{ fontSize: 12 }}
              />
              <Tooltip
                formatter={(value: number) => [`$${value.toFixed(2)}`, undefined]}
              />
              <Legend />
              {uniqueClients.map((clientName, idx) => (
                <Bar
                  key={clientName}
                  dataKey={clientName}
                  fill={CHART_COLORS[idx % CHART_COLORS.length]}
                  stackId={undefined}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Summary Table */}
      {!loading && clientSummary.length > 0 && (
        <div className="rounded-lg border border-border bg-card overflow-hidden">
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-border bg-muted/50">
                <th className="text-left px-4 py-3 font-medium text-muted-foreground">Client</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Loads</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total Invoiced</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Total Paid</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Outstanding</th>
                <th className="text-right px-4 py-3 font-medium text-muted-foreground">Avg Days to Pay</th>
              </tr>
            </thead>
            <tbody>
              {clientSummary.map((r, idx) => (
                <tr key={r.client_id} className={idx % 2 === 1 ? 'bg-muted/50' : ''}>
                  <td className="px-4 py-3 font-medium">{r.client_name}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">{r.loads}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.total_invoiced)}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.total_paid)}</td>
                  <td className="px-4 py-3 text-right">{fmtDollar(r.outstanding)}</td>
                  <td className="px-4 py-3 text-right text-muted-foreground">N/A</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
