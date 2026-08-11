/**
 * Driver-residence privacy — the hard requirement in spec Section 9.
 *
 * > *"A driver residence facility is visible only to that driver, the owner, and
 * > dispatchers with explicit permission. Not in the general picker, not
 * > suggested for other trips, excluded from exports. Server-side filter, not a
 * > UI hide."*
 *
 * ---------------------------------------------------------------------------
 * WHY THESE ASSERT ON A `where` FRAGMENT
 * ---------------------------------------------------------------------------
 * The phase's own stated drift is "privacy done as a UI conditional, tested
 * through the screen". Testing a component proves a component; the rows are
 * still in the payload. So the unit under test is the fragment that goes into
 * the Prisma `where` and the mask applied before serialisation — the two places
 * the rule actually lives.
 *
 * The one thing worth reading twice is the MANAGER case. Every other permission
 * in this codebase is default-allow (`permissions?.[key] !== false`, so an owner
 * switches things off), and this one is the deliberate inversion: Section 9 says
 * "dispatchers with **explicit** permission", and default-allow would hand every
 * existing manager in every tenant their drivers' home addresses on the deploy
 * that shipped the feature.
 */

import { describe, expect, it } from 'vitest';

import {
  HIDDEN_RESIDENCE_LABEL,
  canSeeDriverResidences,
  canViewFacility,
  facilityVisibilityWhere,
  filterVisibleFacilities,
  maskFacilitiesForViewer,
  maskFacilityForViewer,
  staffViewer,
  type FacilityViewer,
} from '@/lib/carrier/facility-visibility';
import { DEFAULT_MANAGER_PERMISSIONS, type UserPermissions } from '@/lib/auth/permissions';

const OWNER: FacilityViewer = { role: 'OWNER', permissions: null, carrierDriverId: null };
const MANAGER_PLAIN: FacilityViewer = {
  role: 'MANAGER',
  permissions: { ...DEFAULT_MANAGER_PERMISSIONS },
  carrierDriverId: null,
};
const MANAGER_PERMITTED: FacilityViewer = {
  role: 'MANAGER',
  permissions: { ...DEFAULT_MANAGER_PERMISSIONS, driverResidences: true },
  carrierDriverId: null,
};
const DRIVER_A: FacilityViewer = { role: 'DRIVER', permissions: null, carrierDriverId: 'drv-a' };
const DRIVER_B: FacilityViewer = { role: 'DRIVER', permissions: null, carrierDriverId: 'drv-b' };

const residenceOfA = {
  isDriverResidence: true,
  residentDriverId: 'drv-a',
  name: '14 Oak Street',
  city: 'Milwaukee',
  state: 'WI',
  latitude: 43.0,
  longitude: -87.9,
};
const yard = {
  isDriverResidence: false,
  residentDriverId: null,
  name: 'MILWAUKEE YARD',
  city: 'Milwaukee',
  state: 'WI',
  latitude: 43.1,
  longitude: -88.0,
};

// ---------------------------------------------------------------------------

describe('who may see every residence', () => {
  it('an owner always may', () => {
    expect(canSeeDriverResidences(OWNER)).toBe(true);
  });

  it('a manager may NOT by default — the one inverted permission', () => {
    // The default permission set says `driverResidences: false`. If this ever
    // flips, every dispatcher in every tenant gains home addresses silently.
    expect(DEFAULT_MANAGER_PERMISSIONS.driverResidences).toBe(false);
    expect(canSeeDriverResidences(MANAGER_PLAIN)).toBe(false);
  });

  it('a manager may only on an explicit true', () => {
    expect(canSeeDriverResidences(MANAGER_PERMITTED)).toBe(true);
    // Absent is not consent. This is what "not false" would have got wrong for
    // every manager whose stored permissions predate the key.
    expect(canSeeDriverResidences({ role: 'MANAGER', permissions: {} as UserPermissions })).toBe(
      false,
    );
    expect(canSeeDriverResidences({ role: 'MANAGER', permissions: null })).toBe(false);
  });

  it('fullAccess does not grant it', () => {
    // That master toggle was set by owners who had never heard of this key, so
    // reading it as consent would be inventing consent retroactively.
    expect(
      canSeeDriverResidences({
        role: 'MANAGER',
        permissions: { ...DEFAULT_MANAGER_PERMISSIONS, fullAccess: true },
      }),
    ).toBe(false);
  });

  it('a driver never sees everyone’s, and nor does an absent viewer', () => {
    expect(canSeeDriverResidences(DRIVER_A)).toBe(false);
    expect(canSeeDriverResidences(null)).toBe(false);
    expect(canSeeDriverResidences(undefined)).toBe(false);
  });
});

describe('the query filter', () => {
  it('excludes residences by DEFAULT — an untaught call site leaks nothing', () => {
    expect(facilityVisibilityWhere()).toEqual({ isDriverResidence: false });
    expect(facilityVisibilityWhere(null)).toEqual({ isDriverResidence: false });
    expect(facilityVisibilityWhere(MANAGER_PLAIN)).toEqual({ isDriverResidence: false });
  });

  it('lets a permitted viewer through unfiltered', () => {
    expect(facilityVisibilityWhere(OWNER)).toEqual({});
    expect(facilityVisibilityWhere(MANAGER_PERMITTED)).toEqual({});
  });

  it('lets a driver see their own and nobody else’s', () => {
    expect(facilityVisibilityWhere(DRIVER_A)).toEqual({
      OR: [{ isDriverResidence: false }, { isDriverResidence: true, residentDriverId: 'drv-a' }],
    });
  });

  it('is spreadable, so a caller adds to a filter rather than replacing one', () => {
    const where = { orgId: 'org-1', ...facilityVisibilityWhere(MANAGER_PLAIN) };
    expect(where).toEqual({ orgId: 'org-1', isDriverResidence: false });
  });

  it('staffViewer never claims to be a driver', () => {
    // Owner-portal pages are role-guarded, so the driver id would never be
    // consulted and looking it up would be a query per page load for nothing.
    expect(staffViewer({ role: 'MANAGER', permissions: null }).carrierDriverId).toBeNull();
  });
});

describe('the per-row check', () => {
  it('lets everyone see a facility that is not a residence', () => {
    expect(canViewFacility(yard, null)).toBe(true);
    expect(canViewFacility(yard, DRIVER_B)).toBe(true);
  });

  it('lets driver A see A’s home and not driver B', () => {
    expect(canViewFacility(residenceOfA, DRIVER_A)).toBe(true);
    // The phase's stated verification: call the API as driver B.
    expect(canViewFacility(residenceOfA, DRIVER_B)).toBe(false);
  });

  it('lets an owner and a permitted dispatcher see it, and a plain one not', () => {
    expect(canViewFacility(residenceOfA, OWNER)).toBe(true);
    expect(canViewFacility(residenceOfA, MANAGER_PERMITTED)).toBe(true);
    expect(canViewFacility(residenceOfA, MANAGER_PLAIN)).toBe(false);
  });
});

describe('the export filter', () => {
  it('drops rows the viewer may not see', () => {
    const rows = [yard, residenceOfA];
    expect(filterVisibleFacilities(rows, MANAGER_PLAIN)).toEqual([yard]);
    expect(filterVisibleFacilities(rows, DRIVER_B)).toEqual([yard]);
    expect(filterVisibleFacilities(rows, DRIVER_A)).toHaveLength(2);
    expect(filterVisibleFacilities(rows, OWNER)).toHaveLength(2);
  });
});

describe('the mask', () => {
  it('keeps the row and loses the address', () => {
    // A trip's own stops must keep the end stop visible — dropping the row would
    // make the trip look like it finishes at the last delivery, which is the
    // untracked return Part A exists to fix.
    const masked = maskFacilityForViewer(residenceOfA, MANAGER_PLAIN);
    expect(masked.name).toBe(HIDDEN_RESIDENCE_LABEL);
    expect(masked.city).toBeNull();
    expect(masked.state).toBeNull();
  });

  it('nulls the COORDINATES too — a pin on a house is an address', () => {
    const masked = maskFacilityForViewer(residenceOfA, DRIVER_B);
    expect(masked.latitude).toBeNull();
    expect(masked.longitude).toBeNull();
  });

  it('leaves a facility the viewer may see completely untouched', () => {
    expect(maskFacilityForViewer(residenceOfA, DRIVER_A)).toEqual(residenceOfA);
    expect(maskFacilityForViewer(residenceOfA, OWNER)).toEqual(residenceOfA);
    expect(maskFacilityForViewer(yard, MANAGER_PLAIN)).toEqual(yard);
  });

  it('masks a list the same way', () => {
    const [first, second] = maskFacilitiesForViewer([yard, residenceOfA], MANAGER_PLAIN);
    expect(first.name).toBe('MILWAUKEE YARD');
    expect(second.name).toBe(HIDDEN_RESIDENCE_LABEL);
  });
});
