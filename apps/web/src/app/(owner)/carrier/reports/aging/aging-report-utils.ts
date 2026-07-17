import type { StatusTone } from '@/components/ui/ds';

// ---------------------------------------------------------------------------
// Shared types + helpers for the AR Aging Report (desktop + mobile-web views)
// ---------------------------------------------------------------------------

export interface AgingRow {
  client_id: string;
  client_name: string;
  bucket_0_30: string;
  bucket_31_60: string;
  bucket_61_90: string;
  bucket_over_90: string;
  total_outstanding: string;
  over_credit_limit: boolean;
}

/** Numeric, display-ready view of a client's aging row. */
export interface AgingClient {
  clientId: string;
  clientName: string;
  buckets: [number, number, number, number]; // 0-30, 31-60, 61-90, 90+
  total: number;
  overdue: number; // 31+ days
  over90: number;
  overCreditLimit: boolean;
}

/** Bucket metadata — order matters (current → most overdue). Colors are a risk ramp. */
export const AGING_BUCKETS: { label: string; color: string }[] = [
  { label: '0–30', color: '#22c55e' }, // green — current
  { label: '31–60', color: '#eab308' }, // amber
  { label: '61–90', color: '#f97316' }, // orange
  { label: '90+', color: '#ef4444' }, // red — critical
];

export function fmtDollar(val: string | number): string {
  const num = typeof val === 'string' ? parseFloat(val || '0') : val;
  return `$${(isNaN(num) ? 0 : num).toFixed(2)}`;
}

/** Compact currency for KPI cards: $1.2K, $42.7K, $1.3M. */
export function fmtCompactDollar(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  const v = isNaN(n) ? 0 : n;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

const num = (s: string) => parseFloat(s || '0') || 0;

export function toAgingClient(r: AgingRow): AgingClient {
  const buckets: [number, number, number, number] = [
    num(r.bucket_0_30),
    num(r.bucket_31_60),
    num(r.bucket_61_90),
    num(r.bucket_over_90),
  ];
  return {
    clientId: r.client_id,
    clientName: r.client_name,
    buckets,
    total: num(r.total_outstanding),
    overdue: buckets[1] + buckets[2] + buckets[3],
    over90: buckets[3],
    overCreditLimit: r.over_credit_limit,
  };
}

export interface AgingTotals {
  buckets: [number, number, number, number];
  total: number;
  overdue: number;
  over90: number;
  pctCurrent: number; // 0–100
}

export function agingTotals(clients: AgingClient[]): AgingTotals {
  const buckets: [number, number, number, number] = [0, 0, 0, 0];
  for (const c of clients) {
    buckets[0] += c.buckets[0];
    buckets[1] += c.buckets[1];
    buckets[2] += c.buckets[2];
    buckets[3] += c.buckets[3];
  }
  const total = buckets[0] + buckets[1] + buckets[2] + buckets[3];
  const overdue = buckets[1] + buckets[2] + buckets[3];
  return {
    buckets,
    total,
    overdue,
    over90: buckets[3],
    pctCurrent: total > 0 ? Math.round((buckets[0] / total) * 100) : 0,
  };
}

export type AgingSort = 'risk' | 'balance' | 'name';

/** Weight older money heavier so the worst payers surface first. */
function riskScore(c: AgingClient): number {
  return c.buckets[1] + 2 * c.buckets[2] + 4 * c.buckets[3];
}

export function sortClients(clients: AgingClient[], sort: AgingSort): AgingClient[] {
  const copy = [...clients];
  if (sort === 'name') {
    copy.sort((a, b) => a.clientName.localeCompare(b.clientName, undefined, { numeric: true }));
  } else if (sort === 'balance') {
    copy.sort((a, b) => b.total - a.total);
  } else {
    copy.sort((a, b) => riskScore(b) - riskScore(a) || b.total - a.total);
  }
  return copy;
}

/**
 * The oldest bucket with money in it — the collections headline for a client.
 * Returns the label, amount, and a ds text tone (danger for 90+, warning for
 * any overdue, muted/success when fully current).
 */
export function oldestBalance(c: AgingClient): { text: string; tone: 'muted' | 'warning' | 'danger' } {
  if (c.buckets[3] > 0) return { text: `${fmtDollar(c.buckets[3])} past 90 days`, tone: 'danger' };
  if (c.buckets[2] > 0) return { text: `${fmtDollar(c.buckets[2])} in 61–90 days`, tone: 'warning' };
  if (c.buckets[1] > 0) return { text: `${fmtDollar(c.buckets[1])} in 31–60 days`, tone: 'warning' };
  if (c.buckets[0] > 0) return { text: 'All current', tone: 'muted' };
  return { text: 'No balance', tone: 'muted' };
}

export const KPI_TONE: Record<'outstanding' | 'overdue' | 'over90', StatusTone> = {
  outstanding: 'accent',
  overdue: 'warning',
  over90: 'danger',
};
