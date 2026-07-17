import type { StatusTone } from '@/components/ui/ds';

// ---------------------------------------------------------------------------
// Shared types + helpers for the Performance Report (desktop + mobile views)
// ---------------------------------------------------------------------------

export interface PerformanceRow {
  dispatch_id: string;
  dispatch_number: string | null;
  driver_name: string;
  total_stops: number;
  on_time_pct: number | null;
  avg_dwell_minutes: number | null;
  actual_miles: string | null;
  total_expenses: string;
}

export function getMonthStartISO(): string {
  const d = new Date();
  d.setDate(1);
  return d.toISOString().split('T')[0];
}

export function getTodayISO(): string {
  return new Date().toISOString().split('T')[0];
}

export function fmtDollar(val: string): string {
  const n = parseFloat(val || '0');
  return `$${(isNaN(n) ? 0 : n).toFixed(2)}`;
}

/** Compact currency for tight spots: $1.2K, $42.7K. */
export function fmtCompactDollar(val: string | number): string {
  const n = typeof val === 'string' ? parseFloat(val) : val;
  const v = isNaN(n) ? 0 : n;
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(1)}K`;
  return `$${Math.round(v)}`;
}

export function fmtMiles(val: string | null): string | null {
  if (val == null) return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return `${n.toLocaleString()} mi`;
}

export function fmtDwell(min: number | null): string | null {
  if (min == null) return null;
  return `${Math.round(min)}m dwell`;
}

/** Desktop on-time text class (kept for the desktop table). */
export function onTimePctClass(pct: number): string {
  if (pct >= 90) return 'text-green-600 dark:text-green-400 font-medium';
  if (pct >= 70) return 'text-amber-600 dark:text-amber-400 font-medium';
  return 'text-red-600 dark:text-red-400 font-medium';
}

/** ds tone for an on-time % — good ≥90, watch ≥70, bad below. */
export function onTimeTone(pct: number | null): StatusTone {
  if (pct == null) return 'neutral';
  if (pct >= 90) return 'success';
  if (pct >= 70) return 'warning';
  return 'danger';
}

export interface PerformanceSummary {
  dispatches: number;
  onTimePct: number | null; // mean of rows that report it
  avgDwell: number | null; // mean of rows that report it
  totalMiles: number;
  totalExpenses: number;
}

export function summarize(rows: PerformanceRow[]): PerformanceSummary {
  let onTimeSum = 0;
  let onTimeCount = 0;
  let dwellSum = 0;
  let dwellCount = 0;
  let miles = 0;
  let expenses = 0;
  for (const r of rows) {
    if (r.on_time_pct != null) {
      onTimeSum += r.on_time_pct;
      onTimeCount += 1;
    }
    if (r.avg_dwell_minutes != null) {
      dwellSum += r.avg_dwell_minutes;
      dwellCount += 1;
    }
    if (r.actual_miles != null) miles += parseFloat(r.actual_miles) || 0;
    expenses += parseFloat(r.total_expenses || '0') || 0;
  }
  return {
    dispatches: rows.length,
    onTimePct: onTimeCount > 0 ? onTimeSum / onTimeCount : null,
    avgDwell: dwellCount > 0 ? dwellSum / dwellCount : null,
    totalMiles: miles,
    totalExpenses: expenses,
  };
}

export type PerfSort = 'recent' | 'ontime' | 'dwell';

export function sortRows(rows: PerformanceRow[], sort: PerfSort): PerformanceRow[] {
  const copy = [...rows];
  if (sort === 'ontime') {
    // Worst on-time first; nulls sink to the bottom.
    copy.sort((a, b) => (a.on_time_pct ?? 101) - (b.on_time_pct ?? 101));
  } else if (sort === 'dwell') {
    // Highest dwell first; nulls sink.
    copy.sort((a, b) => (b.avg_dwell_minutes ?? -1) - (a.avg_dwell_minutes ?? -1));
  }
  // 'recent' keeps the API order.
  return copy;
}
