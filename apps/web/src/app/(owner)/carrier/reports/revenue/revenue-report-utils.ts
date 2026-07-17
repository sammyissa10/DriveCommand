// ---------------------------------------------------------------------------
// Shared types + helpers for the Revenue Report (desktop + mobile-web views)
// ---------------------------------------------------------------------------

export interface RevenueRow {
  month: string;
  client_id: string;
  client_name: string;
  loads_count: number;
  total_invoiced: string;
  total_paid: string;
  outstanding: string;
}

export interface RevenueSummary {
  total_invoiced: string;
  total_paid: string;
  outstanding: string;
  period_start: string;
  period_end: string;
}

export interface RevenueReport {
  monthly_by_client: RevenueRow[];
  summary: RevenueSummary;
}

export interface CarrierClient {
  id: string;
  name: string;
}

/** Aggregated per-client for the summary table / breakdown. */
export interface ClientSummaryRow {
  client_id: string;
  client_name: string;
  loads: number;
  total_invoiced: number;
  total_paid: number;
  outstanding: number;
}

/** Total invoiced per month, chronological — the mobile trend series. */
export interface MonthTotal {
  month: string;
  total: number;
}

export const CHART_COLORS = [
  '#3b82f6', '#22c55e', '#f59e0b', '#a855f7',
  '#f43f5e', '#06b6d4', '#f97316', '#84cc16',
];

export function getCurrentYearStart(): string {
  return `${new Date().getFullYear()}-01-01`;
}

export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function fmtDollar(val: string | number): string {
  const num = typeof val === 'string' ? parseFloat(val) : val;
  return `$${(isNaN(num) ? 0 : num).toFixed(2)}`;
}

/** Compact currency for tight spots (KPI cards): $1.2K, $42.7K, $1.3M. */
export function fmtCompactDollar(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  const v = isNaN(n) ? 0 : n;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

/** "2026-03" → "Mar 2026" for axis / row labels. */
export function fmtMonthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  if (!y || !m) return month;
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

export function buildChartData(rows: RevenueRow[]): Record<string, unknown>[] {
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

export function buildMonthTotals(rows: RevenueRow[]): MonthTotal[] {
  const byMonth: Record<string, number> = {};
  for (const r of rows) {
    byMonth[r.month] = (byMonth[r.month] ?? 0) + parseFloat(r.total_invoiced || '0');
  }
  return Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({ month, total }));
}

export function buildClientSummary(rows: RevenueRow[]): ClientSummaryRow[] {
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

export function triggerCSVDownload(rows: ClientSummaryRow[], dateFrom: string, dateTo: string) {
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
