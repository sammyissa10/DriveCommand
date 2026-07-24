import { describe, expect, it } from 'vitest';
import { routeDriverBlockedLabel } from './driver-blocked-label';

describe('routeDriverBlockedLabel', () => {
  it("maps 'INVITE_PENDING' -> 'Invitation pending'", () => {
    expect(routeDriverBlockedLabel('INVITE_PENDING')).toBe('Invitation pending');
  });

  it("maps 'ACCESS_REVOKED' -> 'Portal access revoked'", () => {
    expect(routeDriverBlockedLabel('ACCESS_REVOKED')).toBe('Portal access revoked');
  });

  it('maps null -> null', () => {
    expect(routeDriverBlockedLabel(null)).toBeNull();
  });
});
