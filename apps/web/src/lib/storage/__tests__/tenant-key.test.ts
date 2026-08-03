/**
 * Tenant-prefix validation (audit C9).
 *
 * The check itself is one line; what matters is that it refuses the cases the
 * fifteen inline copies were each written to refuse, and one they were not.
 */

import { describe, it, expect } from 'vitest';
import { assertTenantKey, isTenantKey, tenantKeyPrefix, TenantKeyError } from '../tenant-key';

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';

describe('isTenantKey', () => {
  it('accepts a key this tenant owns', () => {
    expect(isTenantKey(`tenant-${A}/imports/abc-manifest.pdf`, A)).toBe(true);
  });

  it('rejects another tenant’s key', () => {
    expect(isTenantKey(`tenant-${B}/imports/abc-manifest.pdf`, A)).toBe(false);
  });

  it('rejects a key that merely starts with a similar id', () => {
    // The trailing slash in the prefix is what stops `tenant-1111…1111extra/`
    // from passing as `tenant-1111…1111/`.
    expect(isTenantKey(`tenant-${A}extra/imports/x.pdf`, A)).toBe(false);
  });

  it('rejects traversal, which no key we generate contains', () => {
    expect(isTenantKey(`tenant-${A}/imports/../../${B}/secret.pdf`, A)).toBe(false);
    expect(isTenantKey(`tenant-${A}\\imports\\x.pdf`, A)).toBe(false);
  });

  it('rejects empty input rather than treating it as a match', () => {
    expect(isTenantKey('', A)).toBe(false);
    expect(isTenantKey(`tenant-${A}/imports/x.pdf`, '')).toBe(false);
  });
});

describe('assertTenantKey', () => {
  it('throws TenantKeyError for a foreign key', () => {
    expect(() => assertTenantKey(`tenant-${B}/imports/x.pdf`, A)).toThrow(TenantKeyError);
  });

  it('never echoes the key back — an error string is a leak surface', () => {
    try {
      assertTenantKey(`tenant-${B}/imports/payroll-secret.pdf`, A);
      throw new Error('should have thrown');
    } catch (e) {
      expect((e as Error).message).not.toMatch(/payroll-secret/);
      expect((e as Error).message).not.toMatch(B);
    }
  });

  it('passes silently for an owned key', () => {
    expect(() => assertTenantKey(`tenant-${A}/imports/x.pdf`, A)).not.toThrow();
  });
});

describe('tenantKeyPrefix', () => {
  it('matches what generateUploadUrl builds', () => {
    expect(tenantKeyPrefix(A, 'imports')).toBe(`tenant-${A}/imports/`);
  });
});
