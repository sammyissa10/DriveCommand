import { describe, it, expect } from 'vitest';
import { deriveFleetSizeBucket } from '@/lib/validations/onboarding.schemas';

describe('deriveFleetSizeBucket — number → segmentation band', () => {
  it('maps 1–3 to OWNER_OPERATOR', () => {
    expect(deriveFleetSizeBucket(1)).toBe('OWNER_OPERATOR');
    expect(deriveFleetSizeBucket(3)).toBe('OWNER_OPERATOR');
  });

  it('maps 4–15 to SMALL', () => {
    expect(deriveFleetSizeBucket(4)).toBe('SMALL');
    expect(deriveFleetSizeBucket(15)).toBe('SMALL');
  });

  it('maps 16–50 to MEDIUM (upper bound inclusive)', () => {
    expect(deriveFleetSizeBucket(16)).toBe('MEDIUM');
    expect(deriveFleetSizeBucket(50)).toBe('MEDIUM');
  });

  it('maps 51+ to LARGE', () => {
    expect(deriveFleetSizeBucket(51)).toBe('LARGE');
    expect(deriveFleetSizeBucket(500)).toBe('LARGE');
  });
});
