import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  ANY_AUTHENTICATED_PATHS,
  isDriverBlockedPath,
  isManagerBlockedPath,
} from '@/lib/auth/route-access';

/**
 * quick-575 — makes `/settings/my-notifications` reachable by every
 * authenticated role without widening any other route.
 *
 * THIS FILE FAILS if `/settings/my-notifications` is ever returned to
 * driver-blocked classification. That is the deterministic, server-free half
 * of the brief's step 5 — see `e2e/settings/my-notifications-reachability.spec.ts`
 * for the DOM-level half (quick-549: row/DOM assertions and source scans catch
 * different classes, and both are needed).
 */

describe('route-access classification matrix', () => {
  const cases: Array<{
    pathname: string;
    driverBlocked: boolean;
    managerOwnerOnlyBlocked: boolean;
  }> = [
    { pathname: '/settings/my-notifications', driverBlocked: false, managerOwnerOnlyBlocked: false },
    { pathname: '/settings/notifications', driverBlocked: true, managerOwnerOnlyBlocked: false },
    { pathname: '/settings/team-permissions', driverBlocked: true, managerOwnerOnlyBlocked: true },
    { pathname: '/settings/account', driverBlocked: true, managerOwnerOnlyBlocked: false },
    { pathname: '/settings', driverBlocked: true, managerOwnerOnlyBlocked: false },
    { pathname: '/carrier/dashboard', driverBlocked: true, managerOwnerOnlyBlocked: false },
    { pathname: '/home', driverBlocked: false, managerOwnerOnlyBlocked: false },
    { pathname: '/subscription', driverBlocked: true, managerOwnerOnlyBlocked: true },
  ];

  for (const { pathname, driverBlocked, managerOwnerOnlyBlocked } of cases) {
    it(`isDriverBlockedPath('${pathname}') === ${driverBlocked}`, () => {
      expect(isDriverBlockedPath(pathname)).toBe(driverBlocked);
    });

    it(`isManagerBlockedPath('${pathname}') === ${managerOwnerOnlyBlocked}`, () => {
      expect(isManagerBlockedPath(pathname)).toBe(managerOwnerOnlyBlocked);
    });
  }

  it('ANY_AUTHENTICATED_PATHS holds exactly one entry — widening it needs its own task', () => {
    expect(ANY_AUTHENTICATED_PATHS).toEqual(['/settings/my-notifications']);
  });
});

/**
 * Part B — a narrow source scan of middleware.ts.
 *
 * Follows the quick-546/549 rules: normalise CRLF (this repo is
 * core.autocrlf=true with no .gitattributes, so a scan that skips this passes
 * vacuously on Windows), assert the read actually found real content (a length
 * floor), and carry a counter-assertion so the scan cannot be satisfied by
 * deleting the guard wholesale.
 */
describe('middleware.ts source scan', () => {
  function readMiddleware(): string {
    const p = path.join(__dirname, '..', '..', '..', 'src', 'middleware.ts');
    const raw = fs.readFileSync(p, 'utf-8');
    return raw.replace(/\r\n/g, '\n');
  }

  it('was actually found — length floor', () => {
    const src = readMiddleware();
    expect(src.length).toBeGreaterThan(3000);
  });

  it('imports and calls isDriverBlockedPath from route-access', () => {
    const src = readMiddleware();
    expect(src).toMatch(/import\s*\{[^}]*isDriverBlockedPath[^}]*\}\s*from\s*['"]@\/lib\/auth\/route-access['"]/);
    expect(src).toContain('isDriverBlockedPath(pathname)');
  });

  it('imports and calls isManagerBlockedPath from route-access', () => {
    const src = readMiddleware();
    expect(src).toMatch(/import\s*\{[^}]*isManagerBlockedPath[^}]*\}\s*from\s*['"]@\/lib\/auth\/route-access['"]/);
    expect(src).toContain('isManagerBlockedPath(pathname)');
  });

  it('does not re-inline the classifier as OWNER_PATHS.some(', () => {
    const src = readMiddleware();
    expect(src).not.toContain('OWNER_PATHS.some(');
  });

  it('counter-assertion: the DRIVER guard itself is still present, not deleted wholesale', () => {
    const src = readMiddleware();
    expect(src).toContain("role === 'DRIVER'");
    expect(src).toContain("new URL('/home'");
  });
});
