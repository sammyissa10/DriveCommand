import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import {
  calcCpm,
  calcFuelSurcharge,
  calcHourly,
  calcFlat,
  calcPercentage,
  calcDaily,
  calcSplit,
  calcDetention,
  calcFederalOT,
  calcStateDailyOT,
  computeGrossAmount,
} from '@/lib/driver-pay/calculator';

describe('calcCpm', () => {
  it('calcCpm: 412 miles × $0.58/mi × 1.0 = $238.96', () => {
    const result = calcCpm(new Decimal('412'), new Decimal('0.58'), new Decimal('1.0'));
    expect(result.toFixed(2)).toBe('238.96');
  });

  it('calcCpm: loaded_miles_only — pass 380 loaded miles (not 412 total) → $220.40', () => {
    // loaded_miles_only: caller passes loaded miles as quantity
    const result = calcCpm(new Decimal('380'), new Decimal('0.58'), new Decimal('1.0'));
    expect(result.toFixed(2)).toBe('220.40');
  });
});

describe('calcFuelSurcharge', () => {
  it('calcFuelSurcharge: 412 mi × $0.08 = $32.96', () => {
    const result = calcFuelSurcharge(new Decimal('412'), new Decimal('0.08'));
    expect(result.toFixed(2)).toBe('32.96');
  });
});

describe('calcHourly', () => {
  it('calcHourly: 45 hr × $22.50 × 1.5 = $1518.75', () => {
    const result = calcHourly(new Decimal('45'), new Decimal('22.50'), new Decimal('1.5'));
    expect(result.toFixed(2)).toBe('1518.75');
  });
});

describe('calcFlat', () => {
  it('calcFlat: $250 × 2.0 = $500.00', () => {
    const result = calcFlat(new Decimal('250'), new Decimal('2.0'));
    expect(result.toFixed(2)).toBe('500.00');
  });
});

describe('calcPercentage', () => {
  it('calcPercentage: $4500 revenue × 0.80 = $3600.00', () => {
    const result = calcPercentage(new Decimal('4500'), new Decimal('0.80'));
    expect(result.toFixed(2)).toBe('3600.00');
  });
});

describe('calcDaily', () => {
  it('calcDaily: 3 days × $175 = $525.00', () => {
    const result = calcDaily(new Decimal('3'), new Decimal('175'));
    expect(result.toFixed(2)).toBe('525.00');
  });
});

describe('calcSplit', () => {
  it('calcSplit: $1200 total × 35% = $420.00', () => {
    const result = calcSplit(new Decimal('1200'), new Decimal('35'));
    expect(result.toFixed(2)).toBe('420.00');
  });
});

describe('calcDetention', () => {
  it('calcDetention: 4hr elapsed, 2hr free, $25/hr → 2hr billable = $50.00', () => {
    const arrived = new Date('2026-05-01T08:00:00Z');
    const departed = new Date('2026-05-01T12:00:00Z');
    const result = calcDetention(arrived, departed, 120, new Decimal('25'));
    expect(result.toFixed(2)).toBe('50.00');
  });

  it('calcDetention: 1.5hr elapsed, 2hr free → billable = 0, grossAmount = $0.00', () => {
    const arrived = new Date('2026-05-01T08:00:00Z');
    const departed = new Date('2026-05-01T09:30:00Z');
    const result = calcDetention(arrived, departed, 120, new Decimal('25'));
    expect(result.toFixed(2)).toBe('0.00');
  });
});

describe('calcFederalOT', () => {
  it('calcFederalOT: 50hr week × $22 base × 1.5 OT → (50-40) × $22 × 1.5 = $330.00', () => {
    const result = calcFederalOT(new Decimal('50'), new Decimal('22'), new Decimal('1.5'));
    expect(result.toFixed(2)).toBe('330.00');
  });
});

describe('calcStateDailyOT', () => {
  it('calcStateDailyOT: 10hr day × $22 × 1.5 with 8hr threshold → (10-8) × $22 × 1.5 = $66.00', () => {
    const result = calcStateDailyOT(
      new Decimal('10'),
      new Decimal('8'),
      new Decimal('22'),
      new Decimal('1.5'),
    );
    expect(result.toFixed(2)).toBe('66.00');
  });
});

describe('computeGrossAmount dispatcher', () => {
  it('routes BASE_PAY_MILEAGE to calcCpm: 412mi × $0.58 × 1.0 = $238.96', () => {
    const result = computeGrossAmount({
      componentType: 'BASE_PAY_MILEAGE',
      quantity: new Decimal('412'),
      rate: new Decimal('0.58'),
      multiplier: new Decimal('1.0'),
    });
    expect(result.toFixed(2)).toBe('238.96');
  });
});
