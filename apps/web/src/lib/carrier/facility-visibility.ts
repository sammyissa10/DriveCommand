/**
 * Who may see a driver residence facility. Spec Section 9, hard requirement.
 *
 * > *"A driver residence facility is visible only to that driver, the owner, and
 * > dispatchers with explicit permission. Not in the general picker, not
 * > suggested for other trips, excluded from exports. **Server-side filter, not
 * > a UI hide.**"*
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS A `where` FRAGMENT AND NOT A COMPONENT PROP
 * ---------------------------------------------------------------------------
 * A UI conditional is not a boundary. The phase's own stated drift is "privacy
 * done as a UI conditional", tested through the screen rather than the API, and
 * the reason it is called out is that every one of these lists is also reachable
 * as JSON: `/api/v1/carrier/facilities` returns rows, the trip and template
 * pages return them inside their payloads, and a `hidden` class in a table is
 * worth nothing to a `curl`. So the exclusion is a fragment that goes into the
 * Prisma `where`, and the rows never leave Postgres.
 *
 * **RLS is deliberately not the mechanism here.** It would be the right one, but
 * the app's connection currently bypasses it (a known, tracked pre-launch item),
 * so a policy written today would be a comment that looks like a control. This
 * filter works regardless of which database role the app connects as, and it
 * keeps working the day the RLS cutover lands.
 *
 * ---------------------------------------------------------------------------
 * DEFAULT DENY
 * ---------------------------------------------------------------------------
 * `viewer` is optional on every call, and omitting it means **exclude
 * residences**. That direction is chosen so an existing call site that has not
 * been taught about viewers — or a new one written next year — leaks nothing.
 * The failure mode of getting it wrong is a home address in a dropdown; the
 * failure mode of defaulting the other way is a home address in a dropdown for
 * everybody, forever, silently.
 */

import type { Prisma } from '@/generated/prisma';
import type { UserPermissions } from '@/lib/auth/permissions';

// ---------------------------------------------------------------------------
// Who is asking
// ---------------------------------------------------------------------------

export interface FacilityViewer {
  role: string;
  permissions?: UserPermissions | null;
  /**
   * The viewer's own `carrier_drivers.id`, when they are a driver.
   *
   * NOT `User.id` — `facilities.resident_driver_id` points at `CarrierDriver`,
   * and the two ids are different rows in different tables. Resolving it is the
   * caller's job (`carrierDriverIdForUser` below) because most callers already
   * hold it and the ones that do not are the ones that should pay for the read.
   */
  carrierDriverId?: string | null;
}

/**
 * May this viewer see every driver residence in the tenant?
 *
 * **OWNER always; MANAGER only on an explicit `true`.** That is a deliberate
 * inversion of this codebase's RBAC default and the one thing worth reading
 * twice before editing.
 *
 * `hasPermission` (`lib/auth/permissions.ts`) resolves a MANAGER key as
 * `permissions?.[key] !== false` — default-allow, so an owner switches things
 * OFF. That convention is right for *features*: a new report appearing for a
 * manager who was never told about it is a mild surprise. It is wrong for a home
 * address, where the same rule would hand every existing manager in every tenant
 * their drivers' houses on the deploy that shipped this file. Section 9 says
 * "dispatchers with **explicit** permission", and explicit means someone typed
 * yes.
 *
 * `fullAccess` does not grant it either, for the same reason: that master toggle
 * was set by owners who had never heard of this key, so reading it as consent
 * would be inventing consent retroactively.
 */
export function canSeeDriverResidences(viewer: FacilityViewer | null | undefined): boolean {
  if (!viewer) return false;
  if (viewer.role === 'OWNER') return true;
  if (viewer.role === 'MANAGER') return viewer.permissions?.driverResidences === true;
  return false;
}

// ---------------------------------------------------------------------------
// The filter
// ---------------------------------------------------------------------------

/**
 * The `where` fragment that hides other people's homes.
 *
 * Three shapes, and the middle one is the whole point:
 *
 * ```
 *   owner / permitted dispatcher  ->  {}                        every facility
 *   the resident driver           ->  OR: non-residence, mine   theirs and no one else's
 *   anybody else                  ->  isDriverResidence: false  none at all
 * ```
 *
 * Returned as a spreadable object so a caller writes
 * `where: { orgId, ...facilityVisibilityWhere(viewer) }` and cannot accidentally
 * replace a filter they meant to add to.
 */
export function facilityVisibilityWhere(
  viewer?: FacilityViewer | null,
): Prisma.CarrierFacilityWhereInput {
  if (canSeeDriverResidences(viewer)) return {};

  const driverId = viewer?.carrierDriverId;
  if (driverId) {
    return {
      OR: [{ isDriverResidence: false }, { isDriverResidence: true, residentDriverId: driverId }],
    };
  }

  return { isDriverResidence: false };
}

/**
 * May this viewer see this one facility?
 *
 * The same rule as the `where`, for the paths that already hold a row — a detail
 * page, an export writer looping over records it fetched for another reason. Two
 * expressions of one rule is a drift risk, so the shared truth is
 * `canSeeDriverResidences` and this is arithmetic over it rather than a second
 * policy.
 */
export function canViewFacility(
  facility: { isDriverResidence: boolean; residentDriverId: string | null },
  viewer?: FacilityViewer | null,
): boolean {
  if (!facility.isDriverResidence) return true;
  if (canSeeDriverResidences(viewer)) return true;
  return Boolean(viewer?.carrierDriverId) && facility.residentDriverId === viewer?.carrierDriverId;
}

/**
 * Drop the rows this viewer may not see.
 *
 * **This is the export path.** Every CSV, PDF and report writer that has a list
 * of facility-bearing rows in hand runs it through here rather than trusting
 * that whatever fetched them applied the `where` — because an export is exactly
 * the code that gets written by copying a query from somewhere else.
 */
export function filterVisibleFacilities<
  T extends { isDriverResidence: boolean; residentDriverId: string | null },
>(rows: readonly T[], viewer?: FacilityViewer | null): T[] {
  if (canSeeDriverResidences(viewer)) return [...rows];
  return rows.filter((row) => canViewFacility(row, viewer));
}

/**
 * What a hidden residence is called instead of its name.
 *
 * One string, so a dispatcher sees the same words on a trip detail, a stop list
 * and a driver's phone.
 */
export const HIDDEN_RESIDENCE_LABEL = 'Driver’s home';

/**
 * Withhold a residence's identifying fields without removing the row.
 *
 * **The filter and the mask solve two different problems and both are needed.**
 * `facilityVisibilityWhere` is right for a picker: a residence must not be an
 * option, so it should not be in the list at all. It is wrong for a trip's own
 * stops, where dropping the row would delete the end stop from the itinerary and
 * make the trip look like it finishes at the last delivery — which is exactly
 * the untracked-return failure Part A exists to fix.
 *
 * So a stop list keeps the row and loses the address. A dispatcher without the
 * permission sees that the day closes at the driver's home; they do not see
 * where that is. The driver, the owner, and a permitted dispatcher see it in
 * full.
 *
 * Applied server-side, in the page or handler that fetched the row, before it is
 * serialised to the client. A component that receives a masked row has nothing
 * to leak.
 */
export interface MaskableFacility {
  isDriverResidence: boolean;
  residentDriverId: string | null;
  name: string;
  city?: string | null;
  state?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  zip?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export function maskFacilityForViewer<T extends MaskableFacility>(
  row: T,
  viewer?: FacilityViewer | null,
): T {
  if (canViewFacility(row, viewer)) return row;

  return {
    ...row,
    name: HIDDEN_RESIDENCE_LABEL,
    ...(row.city !== undefined ? { city: null } : {}),
    ...(row.state !== undefined ? { state: null } : {}),
    ...(row.addressLine1 !== undefined ? { addressLine1: null } : {}),
    ...(row.addressLine2 !== undefined ? { addressLine2: null } : {}),
    ...(row.zip !== undefined ? { zip: null } : {}),
    // Coordinates are an address. A map pin on a house is the same disclosure as
    // the street line, and it is the one people forget.
    ...(row.latitude !== undefined ? { latitude: null } : {}),
    ...(row.longitude !== undefined ? { longitude: null } : {}),
  };
}

/** `maskFacilityForViewer` over a list. */
export function maskFacilitiesForViewer<T extends MaskableFacility>(
  rows: readonly T[],
  viewer?: FacilityViewer | null,
): T[] {
  return rows.map((row) => maskFacilityForViewer(row, viewer));
}

// ---------------------------------------------------------------------------
// Resolving the two ids this module needs
// ---------------------------------------------------------------------------

/**
 * The minimal Prisma surface this module needs, so the helpers below compose
 * with a tenant-scoped client, a bare client, or a transaction handle without
 * any of them importing each other.
 */
type FacilityReader = {
  carrierDriver: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
  carrierFacility: {
    findFirst(args: unknown): Promise<{ id: string } | null>;
  };
};

/**
 * A login's `carrier_drivers.id`, or null if this user is not a driver.
 *
 * `CarrierDriver.userId` is the link and it is nullable — a driver row can exist
 * before an invitation is accepted — so "no row" is an ordinary answer and not
 * an error.
 */
export async function carrierDriverIdForUser(
  db: FacilityReader,
  orgId: string,
  userId: string,
): Promise<string | null> {
  const row = await db.carrierDriver.findFirst({
    where: { orgId, userId, deletedAt: null },
    select: { id: true },
  });
  return row?.id ?? null;
}

/**
 * A viewer for an owner-portal page, with no database round trip.
 *
 * `carrierDriverId` is null because these pages are role-guarded to OWNER and
 * MANAGER: a driver never renders them, so the id would never be consulted and
 * looking it up would be a query per page load for nothing. Use
 * `viewerFromSession` anywhere a DRIVER can actually be the viewer — the driver
 * portal, and any endpoint both roles reach.
 */
export function staffViewer(session: {
  role: string;
  permissions?: UserPermissions | null;
}): FacilityViewer {
  return { role: session.role, permissions: session.permissions ?? null, carrierDriverId: null };
}

/**
 * Build a viewer from a session.
 *
 * The `carrierDriverId` lookup runs only for a DRIVER — for anyone else the id
 * would never be consulted (their answer comes from `canSeeDriverResidences`),
 * and a query per facility list for nothing is a query per facility list for
 * nothing.
 *
 * Callers that cannot supply a role — a background job, a cron — pass nothing
 * and get the restrictive answer, which is the correct default for code with no
 * human behind it.
 */
export async function viewerFromSession(
  db: FacilityReader,
  orgId: string,
  session: { userId: string; role: string; permissions?: UserPermissions | null },
): Promise<FacilityViewer> {
  const carrierDriverId =
    session.role === 'DRIVER' ? await carrierDriverIdForUser(db, orgId, session.userId) : null;
  return { role: session.role, permissions: session.permissions ?? null, carrierDriverId };
}

/**
 * One driver's residence facility, subject to the same visibility rule.
 *
 * The `DRIVER_RESIDENCE` end stop policy resolves through here and nowhere else.
 * Putting the check inside the lookup rather than at its call site is what makes
 * "not suggested for other trips" structural: a dispatcher without the
 * permission asking for driver B's residence gets null, and the policy then
 * reports `UNAVAILABLE` — the same answer they would get if the driver had no
 * address on file, which is the correct amount of information to leak, namely
 * none.
 */
export async function residenceFacilityForDriver(
  db: FacilityReader,
  orgId: string,
  carrierDriverId: string,
  viewer?: FacilityViewer | null,
): Promise<string | null> {
  const permitted =
    canSeeDriverResidences(viewer) || viewer?.carrierDriverId === carrierDriverId;
  if (!permitted) return null;

  const row = await db.carrierFacility.findFirst({
    where: {
      orgId,
      isDriverResidence: true,
      residentDriverId: carrierDriverId,
      deletedAt: null,
    },
    select: { id: true },
  });
  return row?.id ?? null;
}
