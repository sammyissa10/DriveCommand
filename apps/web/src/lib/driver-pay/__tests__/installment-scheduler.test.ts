import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { scheduleInstallments } from '@/lib/driver-pay/installment-scheduler';

describe('scheduleInstallments', () => {
  it('splits $1000 / 3 to penny-exact [333.33, 333.33, 333.34]', () => {
    const result = scheduleInstallments({
      totalAmount: new Decimal('1000.00'),
      count: 3,
      startDate: new Date('2026-06-01'),
      intervalDays: 14,
    });
    expect(result.map((r) => r.amount.toString())).toEqual(['333.33', '333.33', '333.34']);
    const sum = result.reduce((acc, r) => acc.plus(r.amount), new Decimal(0));
    expect(sum.toString()).toBe('1000');
  });

  it('splits $100 / 4 evenly when no remainder', () => {
    const result = scheduleInstallments({
      totalAmount: new Decimal('100.00'),
      count: 4,
      startDate: new Date('2026-06-01'),
      intervalDays: 7,
    });
    expect(result.map((r) => r.amount.toString())).toEqual(['25', '25', '25', '25']);
  });

  it('schedules pay dates at intervalDays offsets', () => {
    const start = new Date('2026-06-01');
    const result = scheduleInstallments({
      totalAmount: new Decimal('600'),
      count: 3,
      startDate: start,
      intervalDays: 30,
    });
    expect(result[0].scheduledPayDate.toISOString().slice(0, 10)).toBe('2026-06-01');
    expect(result[1].scheduledPayDate.toISOString().slice(0, 10)).toBe('2026-07-01');
    expect(result[2].scheduledPayDate.toISOString().slice(0, 10)).toBe('2026-07-31');
  });

  it('marks installment 1 as parent and 2..N as non-parent', () => {
    const result = scheduleInstallments({
      totalAmount: new Decimal('300'),
      count: 3,
      startDate: new Date('2026-06-01'),
      intervalDays: 7,
    });
    expect(result[0].isParent).toBe(true);
    expect(result[1].isParent).toBe(false);
    expect(result[2].isParent).toBe(false);
    expect(result.map((r) => r.installmentNumber)).toEqual([1, 2, 3]);
    expect(result.every((r) => r.totalInstallments === 3)).toBe(true);
  });

  it('throws when count < 2', () => {
    expect(() =>
      scheduleInstallments({
        totalAmount: new Decimal('100'),
        count: 1,
        startDate: new Date(),
        intervalDays: 7,
      }),
    ).toThrow();
  });

  it('sum is always exactly equal to totalAmount (arbitrary amounts)', () => {
    const cases = [
      { total: '99.99', count: 3 },
      { total: '0.01', count: 2 },
      { total: '1000.00', count: 7 },
      { total: '500.00', count: 6 },
    ];
    for (const { total, count } of cases) {
      const result = scheduleInstallments({
        totalAmount: new Decimal(total),
        count,
        startDate: new Date('2026-01-01'),
        intervalDays: 14,
      });
      const sum = result.reduce((acc, r) => acc.plus(r.amount), new Decimal(0));
      expect(sum.toString()).toBe(new Decimal(total).toString());
    }
  });
});
