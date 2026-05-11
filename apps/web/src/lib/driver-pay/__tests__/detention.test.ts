import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { suggestDetention } from '@/lib/driver-pay/detention';

describe('suggestDetention', () => {
  it('earned detention: 4hr elapsed, 2hr free, $25/hr → 2hr × $25 = $50.00', () => {
    const result = suggestDetention({
      arrivedAt: new Date('2026-05-01T08:00:00Z'),
      departedAt: new Date('2026-05-01T12:00:00Z'),
      freeTimeMinutes: 120,
      detentionRate: new Decimal('25'),
    });
    expect(result).not.toBeNull();
    expect(result!.detentionHours.toFixed(2)).toBe('2.00');
    expect(result!.grossAmount.toFixed(2)).toBe('50.00');
  });

  it('within free time: 1.5hr elapsed, 2hr free → null', () => {
    const result = suggestDetention({
      arrivedAt: new Date('2026-05-01T08:00:00Z'),
      departedAt: new Date('2026-05-01T09:30:00Z'),
      freeTimeMinutes: 120,
      detentionRate: new Decimal('25'),
    });
    expect(result).toBeNull();
  });

  it('1 minute over free time: 2hr 1min elapsed → non-null, 0.02hr detention, $0.50', () => {
    // Exact: 1 minute = 1/60 hours ≈ 0.0167hr. toDecimalPlaces(2) = 0.02. 0.02 × $25 = $0.50.
    const result = suggestDetention({
      arrivedAt: new Date('2026-05-01T08:00:00Z'),
      departedAt: new Date('2026-05-01T10:01:00Z'),
      freeTimeMinutes: 120,
      detentionRate: new Decimal('25'),
    });
    expect(result).not.toBeNull();
    expect(result!.detentionHours.toFixed(2)).toBe('0.02');
    expect(result!.grossAmount.toFixed(2)).toBe('0.50');
  });

  it('exact boundary: 2hr elapsed = 2hr free → null', () => {
    const result = suggestDetention({
      arrivedAt: new Date('2026-05-01T08:00:00Z'),
      departedAt: new Date('2026-05-01T10:00:00Z'),
      freeTimeMinutes: 120,
      detentionRate: new Decimal('25'),
    });
    expect(result).toBeNull();
  });

  it('hours rounded to 2 decimal places: 2.5hr detention', () => {
    // 4.5hr elapsed, 2hr free = 2.5hr billable × $25 = $62.50
    const result = suggestDetention({
      arrivedAt: new Date('2026-05-01T08:00:00Z'),
      departedAt: new Date('2026-05-01T12:30:00Z'),
      freeTimeMinutes: 120,
      detentionRate: new Decimal('25'),
    });
    expect(result).not.toBeNull();
    expect(result!.detentionHours.toFixed(2)).toBe('2.50');
    expect(result!.grossAmount.toFixed(2)).toBe('62.50');
  });
});
