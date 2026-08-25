/**
 * Phase 9-web — who may open a driver's walkaround.
 *
 * THIS IS THE MOST IMPORTANT FILE IN PHASE 9-WEB, and the reason is structural
 * rather than a matter of care.
 *
 * The full-screen checklist cannot live under `src/app/(driver)/`, because that
 * group's layout unconditionally renders the branded header, `DriverNav` and
 * `DriverBottomNav` around every child — there is no web equivalent of
 * `tabBarStyle: { display: 'none' }`, so the only way to take over the viewport
 * is to not be inside the group. But `(driver)/layout.tsx:28-36` is ALSO where
 * the driver portal's authentication lives:
 *
 *     const session = await getSession();
 *     if (!session) redirect("/sign-in");
 *     const role = await getRole();
 *     if (role !== UserRole.DRIVER) redirect("/unauthorized");
 *
 * Escaping the chrome escapes the guard. A new route group therefore has to
 * re-establish BOTH, and "we remembered to copy the auth check" is not a thing
 * to leave as a habit — so it is a function, in one place, that every entry
 * point calls and one integration test drives against real rows.
 *
 * Two questions, both of which have to be asked:
 *
 *   1. Is this a driver?  (role)
 *   2. Is this THEIR trip? (ownership)
 *
 * The second is not implied by the first. Without it, any driver in the tenant
 * could open any driver's walkaround by editing the id in the URL, sign it, and
 * put a truck they have never seen on the road with a valid-looking DVIR
 * against someone else's name. Same shape as `startTrip`'s own ownership check,
 * which the gate deliberately does not replace: the gate answers "may this trip
 * start", not "is this your trip", and both have to be answered.
 */

import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { UserRole } from '@/lib/auth/roles';

// ---------------------------------------------------------------------------
// Verdict
// ---------------------------------------------------------------------------

export type InspectionAccess =
  | {
      allowed: true;
      /** The `CarrierDriver.id` behind the session user — trips key on this, not `User.id`. */
      carrierDriverId: string;
      truckId: string;
      tripStatus: string;
    }
  | { allowed: false; reason: 'NOT_A_DRIVER' | 'NO_DRIVER_PROFILE' | 'NOT_YOUR_TRIP' };

/**
 * The refusals are deliberately NOT distinguished to the user.
 *
 * A driver poking at ids learns nothing from the response: "not assigned to
 * you" and "no such trip" are one screen, exactly as `startTrip` already
 * returns one sentence for both. The three reasons exist for the log and for
 * the test, which needs to prove that each is refused for its own cause rather
 * than all three failing for one shared accident.
 */
export const INSPECTION_ACCESS_DENIED_MESSAGE =
  'This trip is not assigned to you.';

// ---------------------------------------------------------------------------
// The guard
// ---------------------------------------------------------------------------

export async function resolveInspectionAccess(args: {
  role: UserRole | string | null;
  userId: string;
  tenantId: string;
  dispatchId: string;
}): Promise<InspectionAccess> {
  const { role, userId, tenantId, dispatchId } = args;

  // ── 1. Role ───────────────────────────────────────────────────────────────
  // Checked here and not only in the layout. The layout is one call site; this
  // function is called by the page, the blocked page and every mutation, and a
  // server action reached from a stale tab does not re-run a layout.
  if (role !== UserRole.DRIVER) return { allowed: false, reason: 'NOT_A_DRIVER' };

  const tenantPrisma = await getTenantPrismaForOrg(tenantId);

  // ── 2. A driver profile in THIS tenant ────────────────────────────────────
  const carrierDriver = await tenantPrisma.carrierDriver.findFirst({
    where: { userId, orgId: tenantId },
    select: { id: true },
  });
  if (!carrierDriver) return { allowed: false, reason: 'NO_DRIVER_PROFILE' };

  // ── 3. Their trip ─────────────────────────────────────────────────────────
  // `orgId` is restated even though `getTenantPrismaForOrg` scopes the client:
  // belt and braces on the one query whose failure mode is another driver's
  // signature on this truck's DVIR.
  const trip = await tenantPrisma.trip.findFirst({
    where: { id: dispatchId, orgId: tenantId, primaryDriverId: carrierDriver.id },
    select: { truckId: true, status: true },
  });
  if (!trip) return { allowed: false, reason: 'NOT_YOUR_TRIP' };

  return {
    allowed: true,
    carrierDriverId: carrierDriver.id,
    truckId: trip.truckId,
    tripStatus: trip.status,
  };
}
