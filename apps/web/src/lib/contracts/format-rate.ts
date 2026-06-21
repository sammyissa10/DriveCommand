/**
 * Rate formatting utilities for contracts.
 *
 * Formats rate values based on rate type (per_mile, flat, percentage, hourly).
 */

import type { Prisma } from '@/generated/prisma';

export type RateType = 'per_mile' | 'flat' | 'percentage' | 'hourly';

/**
 * Format a rate value based on the rate type.
 */
export function formatRate(
  rate: Prisma.Decimal | number | null,
  rateType: string
): string {
  if (rate === null || rate === undefined) {
    return '—';
  }

  const numRate = typeof rate === 'number' ? rate : parseFloat(rate.toString());

  switch (rateType) {
    case 'per_mile':
      return `$${numRate.toFixed(2)}/mi`;
    case 'flat':
      return `$${numRate.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    case 'percentage':
      return `${numRate.toFixed(1)}%`;
    case 'hourly':
      return `$${numRate.toFixed(2)}/hr`;
    default:
      return `$${numRate.toFixed(2)}`;
  }
}

/**
 * Format detention time in minutes to "X hours Y minutes" or "X hours".
 */
export function formatDetentionTime(minutes: number): string {
  if (minutes === 0) {
    return '0 hours';
  }

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (mins === 0) {
    return `${hours} hours`;
  }

  return `${hours} hours ${mins} minutes`;
}
