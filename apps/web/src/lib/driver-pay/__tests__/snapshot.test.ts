import { describe, it, expect } from 'vitest';
import { computeIsOverride } from '@/lib/driver-pay/snapshot';

const base = {
  payType: 'CPM',
  baseRate: { toString: () => '0.5500' },
  rateUnit: 'PER_MILE',
  loadedMilesOnly: false,
  fuelSurchargeRate: null,
  perDiemEnabled: false,
  perDiemRate: null,
};

describe('computeIsOverride', () => {
  it('returns false when all fields are identical', () => {
    expect(computeIsOverride(base, base)).toBe(false);
  });

  it('returns true when payType differs', () => {
    const assignment = { ...base, payType: 'HOURLY' };
    expect(computeIsOverride(assignment, base)).toBe(true);
  });

  it('returns true when baseRate differs', () => {
    const assignment = { ...base, baseRate: { toString: () => '0.6000' } };
    expect(computeIsOverride(assignment, base)).toBe(true);
  });

  it('returns true when rateUnit differs', () => {
    const assignment = { ...base, rateUnit: 'PER_HOUR' };
    expect(computeIsOverride(assignment, base)).toBe(true);
  });

  it('returns true when loadedMilesOnly differs', () => {
    const assignment = { ...base, loadedMilesOnly: true };
    expect(computeIsOverride(assignment, base)).toBe(true);
  });

  it('returns true when fuelSurchargeRate changes from null to a value', () => {
    const assignment = { ...base, fuelSurchargeRate: { toString: () => '0.05' } };
    expect(computeIsOverride(assignment, base)).toBe(true);
  });

  it('returns true when perDiemEnabled differs', () => {
    const assignment = { ...base, perDiemEnabled: true };
    expect(computeIsOverride(assignment, base)).toBe(true);
  });
});
