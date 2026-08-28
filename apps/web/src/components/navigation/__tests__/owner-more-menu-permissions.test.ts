/**
 * owner-more-menu-permissions.test.ts — quick-554.
 *
 * The mobile More menu imported no auth at all and every item in it was
 * ungated — not only Reports. A manager whose owner had switched Revenue off saw
 * no Revenue link on a laptop and a Revenue link on a phone.
 *
 * These cases cannot be reached from a browser in this repo: proving them needs
 * a MANAGER with a restricted permission, and creating one is a data change
 * quick-554 is not allowed to make. So the filter is a pure exported function
 * and it is asserted directly, which is stronger evidence than a browser check
 * that can only ever exercise an owner.
 */
import { describe, it, expect } from 'vitest';
import {
  visibleMenuSections,
  OWNER_MORE_MENU_SECTIONS,
} from '@/components/navigation/owner-more-menu';
import {
  DEFAULT_MANAGER_PERMISSIONS,
  PERMISSION_GATED_PATHS,
  type UserPermissions,
} from '@/lib/auth/permissions';

function hrefsFor(viewer: {
  role: string;
  permissions?: Partial<UserPermissions>;
  isLoaded?: boolean;
}): string[] {
  return visibleMenuSections(OWNER_MORE_MENU_SECTIONS, {
    role: viewer.role,
    permissions: viewer.permissions
      ? ({ ...DEFAULT_MANAGER_PERMISSIONS, ...viewer.permissions } as UserPermissions)
      : null,
    isLoaded: viewer.isLoaded ?? true,
  }).flatMap((s) => s.items.map((i) => i.href));
}

describe('mobile More menu permission filtering', () => {
  it('scanned a plausible menu (integrity floor)', () => {
    // A menu that silently emptied would make every assertion below pass
    // vacuously.
    const all = OWNER_MORE_MENU_SECTIONS.flatMap((s) => s.items);
    expect(all.length).toBeGreaterThanOrEqual(12);
    expect(all.filter((i) => i.permission).length).toBeGreaterThanOrEqual(9);
  });

  it('an OWNER sees everything, Team Permissions included', () => {
    const hrefs = hrefsFor({ role: 'OWNER' });
    expect(hrefs).toContain('/carrier/reports/revenue');
    expect(hrefs).toContain('/carrier/reports/todays-trips');
    expect(hrefs).toContain('/settings/team-permissions');
  });

  it('AR Aging has no entry for an OWNER, but the other four reports still do — quick-567', () => {
    // Pinned as a decision, not left as a deleted line: quick-566 removed the
    // desktop sidebar entry and this menu is the mirror. The href must be
    // absent for the MOST permissive viewer — an OWNER — so this cannot be
    // satisfied by a permission simply being switched off, and it must be
    // paired with the positive half (quick-563's rule) or a passing assertion
    // would equally describe a Reports section that had vanished entirely.
    // Route, page, API, the arAgingReport permission key and its
    // PERMISSION_GATED_PATHS row are untouched — reversing this is re-adding
    // one line to owner-more-menu.tsx's Reports section.
    const hrefs = hrefsFor({ role: 'OWNER' });
    expect(hrefs).not.toContain('/carrier/reports/aging');
    expect(hrefs).toContain('/carrier/reports/revenue');
    expect(hrefs).toContain('/carrier/reports/driver-pay');
    expect(hrefs).toContain('/carrier/reports/performance');
    expect(hrefs).toContain('/carrier/reports/todays-trips');
  });

  it('a MANAGER never sees Team Permissions — middleware bounces them off it', () => {
    // OWNER_ONLY_PATHS in middleware.ts redirects a MANAGER away from
    // /settings/team-permissions outright, so offering the link was showing them
    // a door that slams.
    expect(hrefsFor({ role: 'MANAGER', permissions: {} })).not.toContain(
      '/settings/team-permissions'
    );
  });

  it.each([
    ['revenueReport', '/carrier/reports/revenue'],
    ['driverPayReport', '/carrier/reports/driver-pay'],
    ['performanceReport', '/carrier/reports/performance'],
    ['clients', '/carrier/clients'],
    ['contracts', '/carrier/contracts'],
    ['templates', '/carrier/templates'],
    ['carrierDrivers', '/carrier/fleet/drivers'],
    ['carrierTrucks', '/carrier/fleet/trucks'],
    ['facilities', '/carrier/facilities'],
  ] as const)('a MANAGER denied %s loses %s', (permission, href) => {
    expect(hrefsFor({ role: 'MANAGER', permissions: { [permission]: false } })).not.toContain(href);
    expect(hrefsFor({ role: 'MANAGER', permissions: { [permission]: true } })).toContain(href);
  });

  it("Today's Trips follows performanceReport, the same key its page and API use", () => {
    expect(
      hrefsFor({ role: 'MANAGER', permissions: { performanceReport: false } })
    ).not.toContain('/carrier/reports/todays-trips');
  });

  it('fullAccess overrides a stale explicit false', () => {
    // Reachable state, not a hypothetical: the team-permissions UI greys the
    // granular toggles out when Full Access is on and never clears their values.
    // Middleware honours fullAccess, so a menu that did not would hide a link to
    // a page that opens.
    expect(
      hrefsFor({ role: 'MANAGER', permissions: { revenueReport: false, fullAccess: true } })
    ).toContain('/carrier/reports/revenue');
  });

  it('shows everything while auth has not loaded — the filter fails OPEN', () => {
    // `useAuth()` starts at { user: null, isLoaded: false }. Filtering in that
    // window hides every gated item, and on a phone this menu IS the navigation,
    // so an owner on a slow connection would get Invoices/Payroll/Support and
    // nothing else. Observed on the first build of this change, not imagined.
    //
    // Safe only because quick-554 put the real gate in middleware and in every
    // report API: an unfiltered link now leads to a redirect, not to data.
    const unloaded = hrefsFor({ role: '', isLoaded: false });
    const owner = hrefsFor({ role: 'OWNER' });
    expect(unloaded).toEqual(owner);
    expect(unloaded).toContain('/carrier/reports/revenue');
  });

  it('an empty section is dropped rather than rendered as a bare header', () => {
    const sections = visibleMenuSections(OWNER_MORE_MENU_SECTIONS, {
      role: 'MANAGER',
      permissions: {
        ...DEFAULT_MANAGER_PERMISSIONS,
        revenueReport: false,
        driverPayReport: false,
        arAgingReport: false,
        performanceReport: false,
      } as UserPermissions,
      isLoaded: true,
    });
    expect(sections.map((s) => s.label)).not.toContain('Reports');
  });
});

describe('the menu agrees with middleware about which key gates which route', () => {
  it('every gated menu item uses the same permission PERMISSION_GATED_PATHS does', () => {
    // The whole defect class in one assertion: two navigation surfaces and a
    // middleware gate answering one question differently is how a link ends up
    // hidden on a laptop and offered on a phone.
    const mismatches: string[] = [];

    for (const section of OWNER_MORE_MENU_SECTIONS) {
      for (const item of section.items) {
        if (!item.permission) continue;
        const gate = PERMISSION_GATED_PATHS.find((g) => item.href.startsWith(g.path));
        if (!gate) continue; // not every menu href is a middleware-gated path
        if (gate.permission !== item.permission) {
          mismatches.push(
            `${item.href}: menu gates on "${item.permission}", middleware on "${gate.permission}"`
          );
        }
      }
    }

    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });
});
