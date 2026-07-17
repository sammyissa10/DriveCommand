import type { StatusTone } from '@/components/ui/ds';

// ---------------------------------------------------------------------------
// Shared types + helpers for the Driver Pay Report (desktop + mobile-web views)
// ---------------------------------------------------------------------------

export interface DriverPayRow {
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

/** Desktop badge classes (kept as-is for the desktop table). */
export const STATUS_BADGE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
  approved: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
  paid: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

export const STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  paid: 'Paid',
};

/** ds StatusPill tone per status — mirrors the desktop colors (amber/green/blue). */
export const STATUS_TONE: Record<string, StatusTone> = {
  pending: 'warning',
  approved: 'success',
  paid: 'accent',
};

export function statusLabel(status: string): string {
  return STATUS_LABEL[status] ?? status;
}

export function statusTone(status: string): StatusTone {
  return STATUS_TONE[status] ?? 'neutral';
}

export function fmtDollar(val: string): string {
  const num = parseFloat(val || '0');
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

export function fmtPayPeriod(start: string | null, end: string | null): string {
  if (!start) return '—';
  const s = start.slice(0, 10);
  const e = end ? end.slice(0, 10) : '';
  return e ? `${s} – ${e}` : s;
}

/** Sum a numeric-string field across rows. */
export function sumField(rows: DriverPayRow[], field: keyof DriverPayRow): number {
  return rows.reduce((acc, r) => acc + parseFloat((r[field] as string) || '0'), 0);
}
