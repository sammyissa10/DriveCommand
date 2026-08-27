import { NextResponse } from 'next/server';
import { getSession, type SessionData } from '@/lib/auth/supabase';
import { hasPermission, type UserPermissions } from '@/lib/auth/permissions';

/**
 * Server-side access gate for the carrier report APIs — quick-554.
 *
 * ─── WHY THIS EXISTS ────────────────────────────────────────────────────────
 *
 * Every `/api/v1/carrier/reports/*` handler used to open with exactly this and
 * nothing more:
 *
 *     const session = await getSession();
 *     if (!session) return 401;
 *
 * No role check, no permission check. And middleware does not cover these paths:
 * BOTH of its guards are prefix matches on `/carrier` — the DRIVER redirect via
 * `OWNER_PATHS`, and the MANAGER gate via `PERMISSION_GATED_PATHS` — while these
 * routes live under `/api/v1/carrier/...`, which starts with `/api`. So every
 * carrier report's data was readable by ANY authenticated user of ANY role,
 * a driver included, by calling the API the page calls.
 *
 * The page redirect was the only gate, and the thing the page fetches had none.
 *
 * ─── ONE CALL, BOTH HALVES ──────────────────────────────────────────────────
 *
 * `hasPermission` returns false for every role that is neither OWNER nor
 * MANAGER, so the role hole and the permission hole close together rather than
 * as two checks that can drift apart. It is also the SAME verdict the middleware
 * uses, which matters more than it looks: `fullAccess: true` alongside a stale
 * granular `false` is a normal stored state (the team-permissions UI greys the
 * granular toggles out without clearing them), and a predicate that ignored
 * `fullAccess` here would answer 403 on a page the middleware had just waved the
 * same manager onto.
 *
 * ─── WHY A HELPER AND NOT FIVE COPIES ───────────────────────────────────────
 *
 * quick-554's root-cause finding was five hand-written copies of "does this
 * manager have permission X", three of which disagreed with the two the design
 * documents as correct. Pasting a sixth, seventh and eighth copy into route
 * handlers to fix that would have been the joke telling itself. The permission
 * key stays at the call site, so `grep resolveReportAccess` lists every gated
 * report route and the key each one demands.
 */

/**
 * The session comes back on the success branch because `todays-trips` needs it
 * for `staffViewer()` — the Phase 7 driver-residence mask is viewer-scoped, and
 * making the handler re-fetch the session would be a second source of truth for
 * who is asking. `getSession` is `cache()`-wrapped, so this is not a second read
 * either way; the point is that the identity the gate judged is the identity the
 * mask applies.
 */
export type ReportAccess =
  | { ok: true; orgId: string; session: SessionData }
  | { ok: false; response: NextResponse };

export async function resolveReportAccess(
  permission: keyof UserPermissions
): Promise<ReportAccess> {
  const session = await getSession();
  if (!session) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }),
    };
  }

  if (!hasPermission(session.permissions ?? null, permission, session.role)) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }),
    };
  }

  // Tenant resolution stays part of the gate rather than being left to each
  // handler: a session with no tenant reaching a tenant-scoped query is the
  // same class of hole, and it was already checked identically in all five.
  const orgId = session.tenantId;
  if (!orgId) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'No organization' }, { status: 403 }),
    };
  }

  return { ok: true, orgId, session };
}
