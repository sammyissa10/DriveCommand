// Shared driver source for Route.driverId / RouteDriver.driverId (coDriverIds) pickers.
//
// TKT-0084 root cause: `/routes/new` sourced its picker from listDrivers(), which is
// `prisma.user.findMany({ role: 'DRIVER', isActive: true, isSample: false })`. A DRIVER-role
// User row only exists once a carrier driver has ACCEPTED their portal invitation (see
// apps/web/src/app/api/auth/accept-invitation/route.ts). Any driver added at
// /carrier/fleet/drivers/new who hasn't accepted yet (or has no email, or had portal access
// revoked) has no User row and was silently absent from the New Route selector even though
// they show up on /carrier/fleet/drivers and /carrier/trips/new.
//
// Fix shape (mirrors the quick-503 "show it, but explain the block" pattern): list the full
// carrier roster, but only rows with a linked DRIVER-role User.id are `assignable` — the id
// submitted to the form is always a real User.id, never a CarrierDriver.id (that regression
// is TKT-0074, fixed in quick-477).
import { getTenantPrisma } from '@/lib/context/tenant-context';

export interface RouteAssignableDriver {
  /** DRIVER-role User.id — the ONLY value that may be submitted as Route.driverId. */
  id: string | null;
  carrierDriverId: string | null;
  firstName: string | null;
  lastName: string | null;
  assignable: boolean;
  blockedReason: 'INVITE_PENDING' | 'ACCESS_REVOKED' | null;
}

/**
 * Pure mapper — no imports, framework-free, testable in isolation (mirrors
 * apps/web/src/lib/dispatch/driver-readiness-label.ts).
 */
export function routeDriverBlockedLabel(
  reason: RouteAssignableDriver['blockedReason']
): string | null {
  if (reason === 'INVITE_PENDING') return 'Invitation pending';
  if (reason === 'ACCESS_REVOKED') return 'Portal access revoked';
  return null;
}

/**
 * Full carrier-roster + orphan-DRIVER-User source for route driver pickers.
 *
 * - Every active, non-sample, non-deleted carrier driver is returned.
 * - A carrier driver with no linked User (never accepted invite) is `assignable: false`,
 *   `blockedReason: 'INVITE_PENDING'`, `id: null` — deliberately unselectable.
 * - A carrier driver linked to a User whose portal access was revoked (isActive: false),
 *   OR whose linked User is not DRIVER-role (e.g. an OWNER-role account — 2 such rows exist
 *   in prod), is `assignable: false`, `blockedReason: 'ACCESS_REVOKED'`.
 * - DRIVER-role Users with no carrier record (legacy /drivers/invite path) are appended,
 *   always assignable — this list must never shrink versus today's listDrivers() behavior.
 * - `opts.includeUserIds` force-includes specific User ids (e.g. the driver currently
 *   assigned to a route being edited) as `assignable: true` even if now deactivated,
 *   preserving quick-479 behavior.
 */
export async function listRouteAssignableDrivers(
  orgId: string,
  opts?: { includeUserIds?: Array<string | null | undefined> }
): Promise<RouteAssignableDriver[]> {
  const tenantPrisma = await getTenantPrisma();

  const [roster, orphanUsers] = await Promise.all([
    tenantPrisma.carrierDriver.findMany({
      where: { orgId, status: 'active', isSample: false, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        userId: true,
        user: { select: { id: true, role: true, isActive: true, isSample: true } },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
    // DRIVER-role Users with no carrier record — legacy drivers invited via /drivers/invite.
    // Filtered in JS rather than `carrierDriverProfile: null` to stay resilient to the exact
    // Prisma relation-filter shape for an optional 1:1 back-relation.
    tenantPrisma.user.findMany({
      where: { role: 'DRIVER', isSample: false },
      select: { id: true, firstName: true, lastName: true, isActive: true, carrierDriverProfile: { select: { id: true } } },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    }),
  ]);

  const merged: RouteAssignableDriver[] = [];
  const seenUserIds = new Set<string>();

  for (const cd of roster) {
    const user = cd.user;
    const assignable = Boolean(user) && user!.role === 'DRIVER' && user!.isActive && !user!.isSample;
    const blockedReason: RouteAssignableDriver['blockedReason'] = assignable
      ? null
      : !user
        ? 'INVITE_PENDING'
        : 'ACCESS_REVOKED';

    merged.push({
      id: assignable ? user!.id : null,
      carrierDriverId: cd.id,
      firstName: cd.firstName,
      lastName: cd.lastName,
      assignable,
      blockedReason,
    });

    if (user) seenUserIds.add(user.id);
  }

  for (const u of orphanUsers) {
    if (u.carrierDriverProfile) continue; // already represented via the roster loop above
    if (seenUserIds.has(u.id)) continue;
    merged.push({
      id: u.id,
      carrierDriverId: null,
      firstName: u.firstName,
      lastName: u.lastName,
      assignable: u.isActive,
      blockedReason: u.isActive ? null : 'ACCESS_REVOKED',
    });
    seenUserIds.add(u.id);
  }

  // Force-include already-assigned driver(s) so an edit form never drops the current
  // selection, even if that driver is now deactivated (quick-479).
  const includeIds = (opts?.includeUserIds ?? []).filter((id): id is string => Boolean(id));
  const missingIds = includeIds.filter((id) => !seenUserIds.has(id));
  if (missingIds.length > 0) {
    const extraUsers = await tenantPrisma.user.findMany({
      where: { id: { in: missingIds }, role: 'DRIVER' },
      select: { id: true, firstName: true, lastName: true },
    });
    for (const u of extraUsers) {
      merged.push({
        id: u.id,
        carrierDriverId: null,
        firstName: u.firstName,
        lastName: u.lastName,
        assignable: true,
        blockedReason: null,
      });
      seenUserIds.add(u.id);
    }
  }

  // Sort assignable-first, then by last name, then first name.
  merged.sort((a, b) => {
    if (a.assignable !== b.assignable) return a.assignable ? -1 : 1;
    const lastCmp = (a.lastName ?? '').localeCompare(b.lastName ?? '');
    if (lastCmp !== 0) return lastCmp;
    return (a.firstName ?? '').localeCompare(b.firstName ?? '');
  });

  return merged;
}
