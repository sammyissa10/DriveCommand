// Pure, client-safe half of the route driver picker contract.
//
// MUST NOT import anything that reaches Prisma/pg — this module is imported by client
// components (route-form.tsx, RouteCreateMobile.tsx). Keeping it separate from
// assignable-drivers.ts (which imports getTenantPrisma) is what stops `pg` — and its
// `tls`/`net`/`dns` requires — being pulled into the browser bundle. `tsc --noEmit` does
// NOT catch that class of error; only `next build` does.
//
// Mirrors apps/web/src/lib/dispatch/driver-readiness-label.ts.

export interface RouteAssignableDriver {
  /** DRIVER-role User.id — the ONLY value that may be submitted as Route.driverId. */
  id: string | null;
  carrierDriverId: string | null;
  firstName: string | null;
  lastName: string | null;
  /** Linked User's email, when a User is linked — null for INVITE_PENDING rows. */
  email: string | null;
  assignable: boolean;
  blockedReason: 'INVITE_PENDING' | 'ACCESS_REVOKED' | null;
}

/** Pure mapper — framework-free, testable in isolation. */
export function routeDriverBlockedLabel(
  reason: RouteAssignableDriver['blockedReason']
): string | null {
  if (reason === 'INVITE_PENDING') return 'Invitation pending';
  if (reason === 'ACCESS_REVOKED') return 'Portal access revoked';
  return null;
}
