/**
 * reports-permission-gating.test.ts — quick-554.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Every carrier report was gated in the UI and nowhere else.
 *
 *  - The sidebar hid a link a manager lacked permission for, and
 *    `PERMISSION_GATED_PATHS` had no `/carrier/reports/todays-trips` entry, so
 *    the page opened for anyone who typed the URL.
 *  - Worse, and the reason this file leans on the handlers rather than the
 *    constant: all five `/api/v1/carrier/reports/*` handlers checked ONLY that a
 *    session existed. Middleware never sees those paths — both of its guards are
 *    prefix matches on `/carrier`, and these are `/api/v1/carrier/...` — so every
 *    report's data was readable by ANY authenticated role, a driver included.
 *
 * Closing the constant alone would have fixed the page and left the data open,
 * which is why there are two suites here and not one.
 *
 * ─── WHAT IS AND IS NOT MOCKED ──────────────────────────────────────────────
 *
 * The assertions are on REAL `Response` objects returned by the REAL exported
 * route handlers. Only two things are stubbed, and neither is the thing under
 * test: `getSession` (there is no way to mint a real Supabase session for a
 * restricted manager without creating a user, and this task may not change data)
 * and the Prisma client (a permission check must be proven to run BEFORE any
 * query, so the query layer is deliberately inert). `hasPermission` — the actual
 * verdict — runs for real. This is the in-repo pattern from
 * `lib/driver-pay/__tests__/reports-rbac.test.ts`.
 *
 * The second suite mocks NOTHING AT ALL: it reads the real exported
 * `PERMISSION_GATED_PATHS` and asks whether it covers every reports page.
 *
 * ─── HOW THIS FAILS ─────────────────────────────────────────────────────────
 *
 * If `PERMISSION_GATED_PATHS` loses an entry — say someone deletes the
 * `todays-trips` row — the `middleware coverage` suite fails with the exact
 * route named and the message "reachable by URL without a permission check".
 * It resolves each route the way middleware actually does (`pathname.startsWith`
 * over the real array), so it catches a deletion, a typo in the path, and a
 * renamed route folder, not merely a missing literal string. Proven red by
 * removing the entry before this was committed.
 *
 * If a handler loses its `resolveReportAccess` call, the `403` cases in the
 * first suite fail: a restricted manager and a driver both start getting 200.
 */
import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { NextRequest } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

// ─── Module mocks — must precede the handler imports ─────────────────────────

vi.mock('@/lib/auth/supabase', () => ({
  getSession: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({ prisma: {} }));

vi.mock('@/lib/context/tenant-context', () => ({
  getTenantPrisma: vi.fn(),
  getTenantPrismaForOrg: vi.fn(),
  requireTenantId: vi.fn().mockResolvedValue('tenant-A'),
}));

// The report query layer is stubbed so a 200 proves the gate let the request
// through, not that a database answered. A permission check that runs AFTER the
// query has already leaked the work even if it hides the bytes.
vi.mock('@/lib/carrier/reports', () => ({
  getRevenueReport: vi.fn().mockResolvedValue({}),
  getDriverPayReport: vi.fn().mockResolvedValue({}),
  getAgingReport: vi.fn().mockResolvedValue({}),
  getPerformanceReport: vi.fn().mockResolvedValue({}),
}));

vi.mock('@/lib/carrier/board-lookup', () => ({
  // `now` is required: the handler serialises `facts.now.toISOString()`, so a
  // stub without it 500s and would have made the 200 cases look like gate
  // failures rather than fixture gaps.
  loadBoardFacts: vi
    .fn()
    .mockResolvedValue({ trips: [], drivers: [], trucks: [], now: new Date('2026-08-27T00:00:00Z') }),
}));

vi.mock('@/lib/carrier/board-view', () => ({
  todaysTripsReport: vi.fn().mockReturnValue([]),
  applyReportFilters: vi.fn().mockReturnValue([]),
  reportFilterOptions: vi.fn().mockReturnValue({}),
}));

import { getSession } from '@/lib/auth/supabase';
import {
  PERMISSION_GATED_PATHS,
  DEFAULT_MANAGER_PERMISSIONS,
  type UserPermissions,
} from '@/lib/auth/permissions';

import { GET as revenueGET } from '@/app/api/v1/carrier/reports/revenue/route';
import { GET as driverPayGET } from '@/app/api/v1/carrier/reports/driver-pay/route';
import { GET as agingGET } from '@/app/api/v1/carrier/reports/aging/route';
import { GET as performanceGET } from '@/app/api/v1/carrier/reports/performance/route';
import { GET as todaysTripsGET } from '@/app/api/v1/carrier/reports/todays-trips/route';

// ─── The routes under test ───────────────────────────────────────────────────

/**
 * `page` and `permission` are what the OTHER suite checks; `handler` and `api`
 * are what this one calls. They live in one table on purpose — a report added
 * with an API but no page entry, or vice versa, is the drift both suites exist
 * to catch.
 */
const REPORT_ROUTES = [
  {
    name: 'revenue',
    page: '/carrier/reports/revenue',
    api: 'http://localhost/api/v1/carrier/reports/revenue',
    permission: 'revenueReport' as const,
    handler: revenueGET,
  },
  {
    name: 'driver-pay',
    page: '/carrier/reports/driver-pay',
    api: 'http://localhost/api/v1/carrier/reports/driver-pay',
    permission: 'driverPayReport' as const,
    handler: driverPayGET,
  },
  {
    name: 'aging',
    page: '/carrier/reports/aging',
    api: 'http://localhost/api/v1/carrier/reports/aging',
    permission: 'arAgingReport' as const,
    handler: agingGET,
  },
  {
    name: 'performance',
    page: '/carrier/reports/performance',
    api: 'http://localhost/api/v1/carrier/reports/performance',
    permission: 'performanceReport' as const,
    handler: performanceGET,
  },
  {
    name: 'todays-trips',
    page: '/carrier/reports/todays-trips',
    api: 'http://localhost/api/v1/carrier/reports/todays-trips',
    // Shares `performanceReport` deliberately — a key of its own would ship
    // granting nothing, because `hasPermission` is default-all-true and no
    // stored manager record would carry it. See the report page's own header.
    permission: 'performanceReport' as const,
    handler: todaysTripsGET,
  },
] as const;

// ─── Session fixtures ────────────────────────────────────────────────────────

const owner = { userId: 'u1', tenantId: 'tenant-A', role: 'OWNER' };
const driver = { userId: 'u4', tenantId: 'tenant-A', role: 'DRIVER' };

function manager(overrides: Partial<UserPermissions>) {
  return {
    userId: 'u2',
    tenantId: 'tenant-A',
    role: 'MANAGER',
    permissions: { ...DEFAULT_MANAGER_PERMISSIONS, ...overrides } as UserPermissions,
  };
}

// ─── Suite 1: the real handlers, the real responses ──────────────────────────

describe.each(REPORT_ROUTES)(
  '$name report API is gated server-side',
  ({ api, permission, handler }) => {
    beforeEach(() => vi.clearAllMocks());

    const call = () => handler(new NextRequest(api));

    it('401 when there is no session', async () => {
      (getSession as Mock).mockResolvedValue(null);
      expect((await call()).status).toBe(401);
    });

    it('403 for a DRIVER — middleware never sees this path', async () => {
      // The regression that matters most. `/api/v1/carrier/...` does not start
      // with `/carrier`, so the middleware DRIVER redirect cannot fire here and
      // the handler is the only thing standing between a driver and the data.
      (getSession as Mock).mockResolvedValue(driver);
      expect((await call()).status).toBe(403);
    });

    it('403 for a MANAGER whose permission is explicitly false', async () => {
      (getSession as Mock).mockResolvedValue(manager({ [permission]: false }));
      expect((await call()).status).toBe(403);
    });

    it('200 for a MANAGER who holds the permission', async () => {
      (getSession as Mock).mockResolvedValue(manager({ [permission]: true }));
      expect((await call()).status).toBe(200);
    });

    it('200 for a MANAGER with fullAccess despite a stale explicit false', async () => {
      // Not a hypothetical: the team-permissions UI greys the granular toggles
      // out when Full Access is on and never clears their stored values, so this
      // exact record is what an owner produces by restricting a report and then
      // promoting the manager. Middleware lets them onto the page; if this
      // returned 403 the page would load and never fetch.
      (getSession as Mock).mockResolvedValue(
        manager({ [permission]: false, fullAccess: true })
      );
      expect((await call()).status).toBe(200);
    });

    it('200 for an OWNER', async () => {
      (getSession as Mock).mockResolvedValue(owner);
      expect((await call()).status).toBe(200);
    });

    it('403 for a session with no tenant', async () => {
      (getSession as Mock).mockResolvedValue({ ...owner, tenantId: '' });
      expect((await call()).status).toBe(403);
    });
  }
);

// ─── Suite 2: no mocks at all — the real constant ────────────────────────────

describe('middleware coverage of the reports pages', () => {
  it('scanned a plausible number of routes (integrity floor)', () => {
    // A table that silently emptied would make every assertion below pass
    // vacuously. This repo has been bitten by exactly that.
    expect(REPORT_ROUTES.length).toBeGreaterThanOrEqual(5);
    expect(PERMISSION_GATED_PATHS.length).toBeGreaterThanOrEqual(10);
  });

  it.each(REPORT_ROUTES)(
    '$page is covered by PERMISSION_GATED_PATHS with the permission its UI uses',
    ({ page, permission }) => {
      // Resolved the way middleware.ts:179 actually resolves it, so a deleted
      // entry, a typo in the path and a renamed route folder all fail here —
      // not merely a missing literal string.
      const gate = PERMISSION_GATED_PATHS.find((g) => page.startsWith(g.path));

      expect(
        gate,
        `${page} is reachable by URL without a permission check. It has no entry ` +
          'in PERMISSION_GATED_PATHS, so middleware waves a restricted MANAGER ' +
          'straight through while the sidebar hides the link — UI enforcement ' +
          'with nothing behind it.'
      ).toBeDefined();

      expect(
        gate?.permission,
        `${page} is gated on "${gate?.permission}" by middleware but on ` +
          `"${permission}" by its navigation entries and its API. Two answers to ` +
          'one question is how this class of hole starts.'
      ).toBe(permission);
    }
  );
});

// ─── Suite 3: the handlers really do call the shared gate ────────────────────

describe('every report route handler uses the shared gate', () => {
  const API_DIR = path.resolve(__dirname, '..', '..', '..', 'app', 'api', 'v1', 'carrier', 'reports');

  /** Repo is core.autocrlf=true — normalise or this reads differently on Windows. */
  function readRoute(name: string): string {
    return fs
      .readFileSync(path.join(API_DIR, name, 'route.ts'), 'utf8')
      .replace(/\r\n/g, '\n');
  }

  it.each(REPORT_ROUTES)('$name calls resolveReportAccess with $permission', ({ name, permission }) => {
    const src = readRoute(name);

    // Integrity floor: a bad path would return '' and satisfy nothing below by
    // accident, so assert the file was actually found and is real source.
    expect(src.length, `${name}/route.ts read as empty — check API_DIR`).toBeGreaterThan(200);

    expect(
      src.includes(`resolveReportAccess('${permission}')`),
      `${name}/route.ts does not call resolveReportAccess('${permission}'). ` +
        'A report handler that resolves its own session is how all five of these ' +
        'came to check nothing but "is anyone logged in".'
    ).toBe(true);

    // The old shape must not come back alongside the new one. `getSession` here
    // means the handler is judging identity for itself again.
    expect(
      src.includes('getSession'),
      `${name}/route.ts calls getSession directly. Identity is resolved once, by ` +
        'resolveReportAccess, so the gate and the handler cannot disagree about ' +
        'who is asking.'
    ).toBe(false);
  });
});
