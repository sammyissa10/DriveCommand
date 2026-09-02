/**
 * Pure route classification for the middleware's role guards — quick-575.
 *
 * Extracted from `middleware.ts` so the classification can be unit-tested with
 * no server, no mocking, and no Next.js runtime. This file must stay pure: no
 * imports from `next/server`, no I/O.
 */

// Paths that belong to the owner portal — drivers navigating here get redirected to /home
export const OWNER_PATHS = [
  '/dashboard',
  '/trucks',
  '/drivers',
  '/routes',
  '/loads',
  '/invoices',
  '/payroll',
  '/crm',
  '/settings',
  '/compliance',
  '/ai-documents',
  '/profit-predictor',
  '/lane-analytics',
  '/ifta',
  '/live-map',
  '/fuel',
  '/safety',
  '/tags',
  '/subscription',
  '/carrier',
];

// Owner-only pages — MANAGER is always blocked, redirect to /carrier/dashboard
export const OWNER_ONLY_PATHS = ['/settings/team-permissions', '/subscription'];

/**
 * Paths any AUTHENTICATED user reaches regardless of role.
 *
 * Distinct from PUBLIC_PATHS, which is the UNAUTHENTICATED bypass and lives in
 * middleware.ts. A path listed here still requires a session; it is exempt only
 * from the DRIVER role guard.
 *
 * quick-575: `/settings/my-notifications` is a per-user screen reached from the
 * "Notification preferences" link in every email footer and from the
 * List-Unsubscribe header (quick-574). It is NOT an OWNER_PATHS entry to delete —
 * the entry is the bare prefix '/settings', so an exception list is the only way
 * to carve one leaf out of it.
 *
 * ONE ENTRY. Adding a second is widening a route's access and needs its own task.
 */
export const ANY_AUTHENTICATED_PATHS = ['/settings/my-notifications'];

export function isAnyAuthenticatedPath(pathname: string): boolean {
  return ANY_AUTHENTICATED_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * True when a DRIVER must be redirected away from `pathname`.
 *
 * The exception is checked FIRST so it cannot be shadowed by the bare
 * `/settings` prefix in OWNER_PATHS.
 */
export function isDriverBlockedPath(pathname: string): boolean {
  if (isAnyAuthenticatedPath(pathname)) return false;
  return OWNER_PATHS.some((p) => pathname.startsWith(p));
}

/**
 * True when a MANAGER must be redirected away from `pathname`.
 *
 * Deliberately WITHOUT the any-authenticated exception. Applying it here would
 * be a second widening mechanism for a case that does not exist today —
 * `/settings/my-notifications` is not in OWNER_ONLY_PATHS — and the constraint
 * for this task is that exactly one route changes. If a future path is ever in
 * both lists, OWNER_ONLY must win.
 */
export function isManagerBlockedPath(pathname: string): boolean {
  return OWNER_ONLY_PATHS.some((p) => pathname.startsWith(p));
}
