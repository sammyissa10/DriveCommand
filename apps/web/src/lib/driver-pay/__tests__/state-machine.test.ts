import { describe, it, expect } from 'vitest';
import {
  canTransition,
  adjustmentTypeFor,
  type AssignmentSnapshotForFsm,
  type ComponentSnapshotForFsm,
} from '@/lib/driver-pay/state-machine';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeAssignment(
  overrides: Partial<AssignmentSnapshotForFsm> = {},
): AssignmentSnapshotForFsm {
  return {
    payStatus: 'DRAFT',
    paymentModel: 'FLAT',
    actualMiles: null,
    mileageSource: null,
    loadRevenue: null,
    overrideReason: null,
    isOverride: false,
    settlementId: null,
    ...overrides,
  };
}

function makeBasePay(type = 'BASE_PAY_FLAT'): ComponentSnapshotForFsm {
  return {
    componentType: type,
    category: 'BASE_PAY',
    originalComponentId: null,
    grossAmount: '500.00',
  };
}

function makeAdjustment(
  type: 'ADJUSTMENT_POSITIVE' | 'ADJUSTMENT_NEGATIVE' = 'ADJUSTMENT_POSITIVE',
): ComponentSnapshotForFsm {
  return {
    componentType: type,
    category: 'ADJUSTMENT',
    originalComponentId: 'original-comp-id',
    grossAmount: type === 'ADJUSTMENT_POSITIVE' ? '50.00' : '-50.00',
  };
}

// ---------------------------------------------------------------------------
// Valid transitions
// ---------------------------------------------------------------------------

describe('valid transitions', () => {
  it('DRAFT → submit → PENDING_REVIEW (BASE_PAY_FLAT, no override)', () => {
    const result = canTransition(makeAssignment({ payStatus: 'DRAFT' }), 'submit', [
      makeBasePay('BASE_PAY_FLAT'),
    ]);
    expect(result).toEqual({ ok: true, nextStatus: 'PENDING_REVIEW' });
  });

  it('DRAFT → submit → PENDING_REVIEW (with override + overrideReason)', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'DRAFT', isOverride: true, overrideReason: 'Special load rate' }),
      'submit',
      [makeBasePay()],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'PENDING_REVIEW' });
  });

  it('PENDING_REVIEW → approve → APPROVED (FLAT model, no miles/revenue needed)', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'PENDING_REVIEW', paymentModel: 'FLAT' }),
      'approve',
      [makeBasePay()],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'APPROVED' });
  });

  it('PENDING_REVIEW → approve → APPROVED (HOURLY model)', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'PENDING_REVIEW', paymentModel: 'HOURLY' }),
      'approve',
      [makeBasePay('BASE_PAY_HOURLY')],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'APPROVED' });
  });

  it('PENDING_REVIEW → approve → APPROVED (CPM with actualMiles + mileageSource)', () => {
    const result = canTransition(
      makeAssignment({
        payStatus: 'PENDING_REVIEW',
        paymentModel: 'CPM',
        actualMiles: '1250.50',
        mileageSource: 'GOOGLE',
      }),
      'approve',
      [makeBasePay('BASE_PAY_MILEAGE')],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'APPROVED' });
  });

  it('PENDING_REVIEW → approve → APPROVED (PERCENTAGE with loadRevenue > 0)', () => {
    const result = canTransition(
      makeAssignment({
        payStatus: 'PENDING_REVIEW',
        paymentModel: 'PERCENTAGE',
        loadRevenue: '5000.00',
      }),
      'approve',
      [makeBasePay('BASE_PAY_PERCENTAGE')],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'APPROVED' });
  });

  it('PENDING_REVIEW → dispute → DISPUTED', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'PENDING_REVIEW' }),
      'dispute',
      [],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'DISPUTED' });
  });

  it('PENDING_REVIEW → reject → DRAFT', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'PENDING_REVIEW' }),
      'reject',
      [],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'DRAFT' });
  });

  it('APPROVED → dispute → DISPUTED', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'APPROVED' }),
      'dispute',
      [],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'DISPUTED' });
  });

  it('DISPUTED → submit → PENDING_REVIEW (with BASE_PAY component)', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'DISPUTED' }),
      'submit',
      [makeBasePay()],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'PENDING_REVIEW' });
  });

  it('DISPUTED → reject → DRAFT', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'DISPUTED' }),
      'reject',
      [],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'DRAFT' });
  });

  it('PAID → correct → CORRECTED (with ADJUSTMENT_POSITIVE component present)', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'PAID' }),
      'correct',
      [makeAdjustment('ADJUSTMENT_POSITIVE')],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'CORRECTED' });
  });

  it('PAID → correct → CORRECTED (with ADJUSTMENT_NEGATIVE component present)', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'PAID' }),
      'correct',
      [makeAdjustment('ADJUSTMENT_NEGATIVE')],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'CORRECTED' });
  });

  it('CORRECTED → correct → CORRECTED (additional adjustments allowed)', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'CORRECTED' }),
      'correct',
      [makeAdjustment()],
    );
    expect(result).toEqual({ ok: true, nextStatus: 'CORRECTED' });
  });
});

// ---------------------------------------------------------------------------
// Invalid transitions
// ---------------------------------------------------------------------------

describe('invalid transitions', () => {
  it('DRAFT → approve is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'DRAFT' }), 'approve', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('DRAFT → correct is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'DRAFT' }), 'correct', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('PENDING_REVIEW → correct is invalid', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'PENDING_REVIEW' }),
      'correct',
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('APPROVED → submit is invalid (reserved for settlement engine)', () => {
    const result = canTransition(makeAssignment({ payStatus: 'APPROVED' }), 'submit', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('APPROVED → approve is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'APPROVED' }), 'approve', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('APPROVED → correct is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'APPROVED' }), 'correct', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('PAID → submit is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'PAID' }), 'submit', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('PAID → approve is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'PAID' }), 'approve', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('PAID → dispute is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'PAID' }), 'dispute', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('PAID → reject is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'PAID' }), 'reject', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('DRAFT → dispute is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'DRAFT' }), 'dispute', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });

  it('DRAFT → reject is invalid', () => {
    const result = canTransition(makeAssignment({ payStatus: 'DRAFT' }), 'reject', []);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/Cannot transition from/);
  });
});

// ---------------------------------------------------------------------------
// Pre-condition failures
// ---------------------------------------------------------------------------

describe('pre-condition failures', () => {
  it('DRAFT → submit with NO BASE_PAY component → reason contains "base pay line"', () => {
    const result = canTransition(makeAssignment({ payStatus: 'DRAFT' }), 'submit', [
      {
        componentType: 'FUEL_SURCHARGE',
        category: 'ACCESSORIAL',
        originalComponentId: null,
        grossAmount: '50',
      },
    ]);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('base pay line');
  });

  it('DRAFT → submit with override but no overrideReason → reason contains "no reason was given"', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'DRAFT', isOverride: true, overrideReason: null }),
      'submit',
      [makeBasePay()],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('no reason was given');
  });

  it('DRAFT → submit with override but empty overrideReason → fails', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'DRAFT', isOverride: true, overrideReason: '   ' }),
      'submit',
      [makeBasePay()],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('no reason was given');
  });

  it('PENDING_REVIEW → approve, CPM, actualMiles = null → reason contains "actual miles"', () => {
    const result = canTransition(
      makeAssignment({
        payStatus: 'PENDING_REVIEW',
        paymentModel: 'CPM',
        actualMiles: null,
        mileageSource: 'GOOGLE',
      }),
      'approve',
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('actual miles');
  });

  it('PENDING_REVIEW → approve, CPM, mileageSource = null → reason contains "actual miles"', () => {
    const result = canTransition(
      makeAssignment({
        payStatus: 'PENDING_REVIEW',
        paymentModel: 'CPM',
        actualMiles: '1200',
        mileageSource: null,
      }),
      'approve',
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('actual miles');
  });

  it('PENDING_REVIEW → approve, PERCENTAGE, loadRevenue = null → reason contains "load revenue"', () => {
    const result = canTransition(
      makeAssignment({
        payStatus: 'PENDING_REVIEW',
        paymentModel: 'PERCENTAGE',
        loadRevenue: null,
      }),
      'approve',
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('load revenue');
  });

  it('PENDING_REVIEW → approve, PERCENTAGE, loadRevenue = "0" → reason contains "load revenue"', () => {
    const result = canTransition(
      makeAssignment({
        payStatus: 'PENDING_REVIEW',
        paymentModel: 'PERCENTAGE',
        loadRevenue: '0',
      }),
      'approve',
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('load revenue');
  });

  it('PAID → correct with NO ADJUSTMENT component → reason contains "adjustment line"', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'PAID' }),
      'correct',
      [makeBasePay()],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('adjustment line');
  });

  it('DISPUTED → submit with NO BASE_PAY component → reason contains "base pay line"', () => {
    const result = canTransition(
      makeAssignment({ payStatus: 'DISPUTED' }),
      'submit',
      [],
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('base pay line');
  });
});

// ---------------------------------------------------------------------------
// Error message shape
// ---------------------------------------------------------------------------

describe('error message shape', () => {
  const invalidCases: Array<{ assignment: AssignmentSnapshotForFsm; action: Parameters<typeof canTransition>[1]; components: ComponentSnapshotForFsm[] }> = [
    {
      assignment: makeAssignment({ payStatus: 'DRAFT' }),
      action: 'approve',
      components: [],
    },
    {
      assignment: makeAssignment({ payStatus: 'DRAFT' }),
      action: 'submit',
      components: [], // no base pay
    },
    {
      assignment: makeAssignment({ payStatus: 'PENDING_REVIEW', paymentModel: 'CPM', actualMiles: null, mileageSource: null }),
      action: 'approve',
      components: [],
    },
    {
      assignment: makeAssignment({ payStatus: 'PAID' }),
      action: 'correct',
      components: [], // no adjustment
    },
  ];

  it.each(invalidCases)(
    'every failure has ok=false, non-empty user-friendly reason string',
    ({ assignment, action, components }) => {
      const result = canTransition(assignment, action, components);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason.length).toBeGreaterThan(0);
        expect(result.reason).not.toMatch(/ERR_|E[0-9]+|throw/i);
        if (result.actionHint !== undefined) {
          expect(result.actionHint.length).toBeGreaterThan(0);
        }
      }
    },
  );

  it('no error reason contains ERR_ codes or numeric error codes', () => {
    const result = canTransition(makeAssignment({ payStatus: 'DRAFT' }), 'approve', []);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).not.toMatch(/ERR_|E[0-9]+|throw/i);
    }
  });
});

// ---------------------------------------------------------------------------
// adjustmentTypeFor helper
// ---------------------------------------------------------------------------

describe('correction sign — adjustmentTypeFor helper', () => {
  it('positive amount returns ADJUSTMENT_POSITIVE', () => {
    expect(adjustmentTypeFor(100)).toBe('ADJUSTMENT_POSITIVE');
    expect(adjustmentTypeFor('50.00')).toBe('ADJUSTMENT_POSITIVE');
    expect(adjustmentTypeFor(0.01)).toBe('ADJUSTMENT_POSITIVE');
  });

  it('negative amount returns ADJUSTMENT_NEGATIVE', () => {
    expect(adjustmentTypeFor(-100)).toBe('ADJUSTMENT_NEGATIVE');
    expect(adjustmentTypeFor('-50.00')).toBe('ADJUSTMENT_NEGATIVE');
    expect(adjustmentTypeFor(-0.01)).toBe('ADJUSTMENT_NEGATIVE');
  });

  it('zero amount throws', () => {
    expect(() => adjustmentTypeFor(0)).toThrow();
    expect(() => adjustmentTypeFor('0')).toThrow();
    expect(() => adjustmentTypeFor('0.00')).toThrow();
  });
});
