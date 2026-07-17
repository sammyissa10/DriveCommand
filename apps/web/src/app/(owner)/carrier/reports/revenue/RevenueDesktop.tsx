'use client';

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
import {
  CHART_COLORS,
  fmtDollar,
  buildChartData,
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
  fetchReport: () => void;
}

/** Revenue Report — desktop view (unchanged from the original page). */
export function RevenueDesktop({
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  clientId,
  setClientId,
  clients,
  report,
  loading,
  fetchReport,
}: Props) {
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
        <div className="rounded-lg border border-border bg-card overflow-x-auto">
          <table className="w-full text-sm border-collapse min-w-[600px]">
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
