/**
 * Unit tests for mapDriverOptions (quick-502).
 *
 * Proves the two branches that matter for the workflow contract:
 * a linked driver's option value is User.id, and a pending (unlinked)
 * driver is rendered but disabled with a stable non-User sentinel id.
 */
import { describe, it, expect } from 'vitest';
import { mapDriverOptions } from './mapDriverOptions';

describe('mapDriverOptions', () => {
  it('linked driver (userId set) maps to an enabled option whose id is the User.id', () => {
    const result = mapDriverOptions([{ id: 'cd1', userId: 'user-abc', name: 'Marcus' }]);

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ id: 'user-abc', label: 'Marcus', disabled: false });
  });

  it('pending driver (userId null) maps to a disabled option whose id is NOT a real userId', () => {
    const result = mapDriverOptions([{ id: 'cd2', userId: null, name: 'Jane' }]);

    expect(result).toHaveLength(1);
    expect(result[0].disabled).toBe(true);
    expect(result[0].id).not.toBe(null);
    expect(result[0].id.startsWith('pending:')).toBe(true);
    expect(result[0].id).toBe('pending:cd2');
    expect(result[0].label).toBe('Jane');
    expect(result[0].hint).toContain('Invite pending - driver must accept before onboarding');
  });
});
