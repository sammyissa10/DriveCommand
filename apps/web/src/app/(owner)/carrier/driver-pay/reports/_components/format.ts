/**
 * format.ts — Shared formatting utilities for report components.
 */

export function fmtMoney(s: string | number): string {
  const num = typeof s === 'string' ? parseFloat(s) : s;
  if (isNaN(num)) return '$0.00';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(num);
}

export function fmtDate(isoStr: string): string {
  try {
    return new Date(isoStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return isoStr;
  }
}

export function fmtPct(n: number | null): string {
  if (n === null) return '—';
  return `${n.toFixed(1)}%`;
}
