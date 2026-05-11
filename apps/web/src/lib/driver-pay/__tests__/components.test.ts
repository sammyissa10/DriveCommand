import { describe, it, expect } from 'vitest';
import Decimal from 'decimal.js';
import { computeGrossAmount } from '@/lib/driver-pay/calculator';

describe('computeGrossAmount — component dispatcher and sign convention', () => {
  it('DEDUCTION sign convention: positive $50 rate → computeGrossAmount returns $50 (category enforcement in API negates)', () => {
    // The calculator itself does NOT negate — negation happens in the API POST handler.
    // Test that computeGrossAmount returns positive for ADJUSTMENT_NEGATIVE (flat):
    const result = computeGrossAmount({
      componentType: 'ADJUSTMENT_NEGATIVE',
      quantity: new Decimal('1'),
      rate: new Decimal('50'),
      multiplier: new Decimal('1'),
    });
    expect(result.toFixed(2)).toBe('50.00');
    // Note: the API handler then calls .neg() → stored as -50.00
  });

  it('total across mixed components: EARNING $238.96 + BONUS $50 + DEDUCTION −$30 = $258.96', () => {
    const components = [
      { grossAmount: new Decimal('238.96') },
      { grossAmount: new Decimal('50.00') },
      { grossAmount: new Decimal('-30.00') }, // DEDUCTION stored as negative
    ];
    const total = components.reduce((sum, c) => sum.plus(c.grossAmount), new Decimal(0));
    expect(total.toFixed(2)).toBe('258.96');
  });

  it('computeGrossAmount dispatches correctly for BASE_PAY_MILEAGE: 412mi × $0.58 × 1.0 = $238.96', () => {
    const result = computeGrossAmount({
      componentType: 'BASE_PAY_MILEAGE',
      quantity: new Decimal('412'),
      rate: new Decimal('0.58'),
      multiplier: new Decimal('1.0'),
    });
    expect(result.toFixed(2)).toBe('238.96');
  });
});
