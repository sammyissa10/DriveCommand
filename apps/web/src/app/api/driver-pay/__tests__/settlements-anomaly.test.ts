/**
 * settlements-anomaly.test.ts
 *
 * Tests the settlement anomaly detection service:
 * - Returns null avg when fewer than 2 prior settlements (no anomaly)
 * - Detects >25% upward deviation
 * - Detects >25% downward deviation
 * - Does NOT flag <25% deviation
 * - Anomaly reason string contains direction word and percentages
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Decimal from 'decimal.js';

import {
  computeFourWeekAverage,
  detectSettlementAnomaly,
} from '@/lib/driver-pay/settlement-anomaly';

// ---------------------------------------------------------------------------
// Mock prisma for computeFourWeekAverage
// ---------------------------------------------------------------------------

function makePrismaWithSettlements(netPayValues: string[]) {
  return {
    driverSettlement: {
      findMany: vi.fn().mockResolvedValue(
        netPayValues.map((v) => ({
          netPay: { toString: () => v },
        })),
      ),
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('detectSettlementAnomaly — pure function', () => {
  it('returns isAnomaly=false when fourWeekAverage is null', () => {
    const result = detectSettlementAnomaly(new Decimal('1000.00'), null);

    expect(result.isAnomaly).toBe(false);
    expect(result.fourWeekAverage).toBeNull();
    expect(result.deviationPct).toBeNull();
    expect(result.reason).toBeNull();
  });

  it('detects >25% upward deviation', () => {
    const avg = new Decimal('1000.00');
    const current = new Decimal('1300.00'); // +30%

    const result = detectSettlementAnomaly(current, avg);

    expect(result.isAnomaly).toBe(true);
    expect(result.deviationPct?.toFixed(1)).toBe('30.0');
    expect(result.reason).toContain('higher');
    expect(result.reason).toContain('30.0%');
  });

  it('detects >25% downward deviation', () => {
    const avg = new Decimal('1000.00');
    const current = new Decimal('700.00'); // -30%

    const result = detectSettlementAnomaly(current, avg);

    expect(result.isAnomaly).toBe(true);
    expect(result.deviationPct?.toFixed(1)).toBe('-30.0');
    expect(result.reason).toContain('lower');
    expect(result.reason).toContain('30.0%');
  });

  it('does NOT flag deviation exactly at 25% boundary', () => {
    const avg = new Decimal('1000.00');
    const current = new Decimal('1250.00'); // exactly 25%

    const result = detectSettlementAnomaly(current, avg);

    // 25% is NOT > 25 (strict), so no anomaly
    expect(result.isAnomaly).toBe(false);
  });

  it('does NOT flag deviation below 25%', () => {
    const avg = new Decimal('1000.00');
    const current = new Decimal('1200.00'); // +20%

    const result = detectSettlementAnomaly(current, avg);

    expect(result.isAnomaly).toBe(false);
    expect(result.deviationPct?.toFixed(1)).toBe('20.0');
  });

  it('anomaly reason string contains average dollar amount', () => {
    const avg = new Decimal('1000.00');
    const current = new Decimal('1400.00'); // +40%

    const result = detectSettlementAnomaly(current, avg);

    expect(result.isAnomaly).toBe(true);
    expect(result.reason).toContain('$1000.00');
    expect(result.reason).toContain('$1400.00');
    expect(result.reason).toContain('40.0%');
    expect(result.reason).toContain('higher');
  });

  it('handles zero average gracefully (no division by zero)', () => {
    const avg = new Decimal('0');
    const current = new Decimal('500.00');

    const result = detectSettlementAnomaly(current, avg);

    // Zero avg → skip (isAnomaly=false to avoid division by zero)
    expect(result.isAnomaly).toBe(false);
  });
});

describe('computeFourWeekAverage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns null when fewer than 2 prior settlements', async () => {
    const prisma = makePrismaWithSettlements(['1000.00']);

    const avg = await computeFourWeekAverage(
      prisma as never,
      'tenant-A',
      'driver-1',
      new Date('2026-04-08'),
    );

    expect(avg).toBeNull();
  });

  it('returns null when 0 prior settlements', async () => {
    const prisma = makePrismaWithSettlements([]);

    const avg = await computeFourWeekAverage(
      prisma as never,
      'tenant-A',
      'driver-1',
      new Date('2026-04-08'),
    );

    expect(avg).toBeNull();
  });

  it('computes average of 4 prior settlements', async () => {
    const prisma = makePrismaWithSettlements([
      '1000.00',
      '900.00',
      '1100.00',
      '1000.00',
    ]);

    const avg = await computeFourWeekAverage(
      prisma as never,
      'tenant-A',
      'driver-1',
      new Date('2026-04-08'),
    );

    // (1000 + 900 + 1100 + 1000) / 4 = 1000
    expect(avg?.toFixed(2)).toBe('1000.00');
  });

  it('computes average of 2 prior settlements', async () => {
    const prisma = makePrismaWithSettlements(['800.00', '1200.00']);

    const avg = await computeFourWeekAverage(
      prisma as never,
      'tenant-A',
      'driver-1',
      new Date('2026-04-08'),
    );

    expect(avg?.toFixed(2)).toBe('1000.00');
  });

  it('queries with correct status filter (FINALIZED or PAID)', async () => {
    const prisma = makePrismaWithSettlements(['1000.00', '1000.00']);

    await computeFourWeekAverage(
      prisma as never,
      'tenant-A',
      'driver-1',
      new Date('2026-04-08'),
    );

    expect(prisma.driverSettlement.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: { in: ['FINALIZED', 'PAID'] },
        }),
      }),
    );
  });
});
