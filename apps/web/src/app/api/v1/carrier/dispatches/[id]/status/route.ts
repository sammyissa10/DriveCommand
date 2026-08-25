import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSession } from '@/lib/auth/supabase';
import { logger, serializeError } from '@/lib/logger';
import { transitionTripStatus } from '@/lib/carrier/trips';
import { handleStartTrip } from '@/lib/carrier/inspection-handlers';

const StatusTransitionSchema = z.object({
  status: z.enum(['in_progress', 'completed', 'cancelled', 'tonu']),
  notes: z.string().optional(),
});

/**
 * PATCH /api/v1/carrier/dispatches/[id]/status
 *
 * COMPLIANCE (quick-540). Four transitions arrive here and exactly one of them
 * starts a trip. `in_progress` now goes through `handleStartTrip`, which runs
 * the Phase 9 inspection gate first; `completed`, `cancelled` and `tonu` still
 * go straight to `transitionTripStatus` and are untouched.
 *
 * The branch lives HERE, in the route, rather than inside `transitionTripStatus`
 * — which is the same reasoning Phase 9 recorded and it has not changed. That
 * function serves all four transitions, so a gate living inside it would need a
 * condition on which transition it was looking at, and that condition is the
 * thing someone eventually gets backwards. One branch, at the door, on a value
 * the caller already stated explicitly.
 *
 * OWNER OVERRIDE STILL WORKS, and it works through the gate rather than around
 * it. `evaluateTripStartGate` checks the override rung SECOND, above every
 * inspection outcome, so a trip carrying `inspectionOverriddenById` +
 * `inspectionOverriddenReason` returns ALLOWED / OWNER_OVERRIDE and starts
 * normally. Phase 9 item 5 — "before or after a failure" — is preserved by
 * construction, not by an exemption carved out here.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = StatusTransitionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0].message },
        { status: 400 }
      );
    }

    // ── Starting a trip: through the gate ────────────────────────────────
    if (parsed.data.status === 'in_progress') {
      const started = await handleStartTrip({
        orgId,
        dispatchId: id,
        userId: session.userId,
        notes: parsed.data.notes,
      });

      if (!started.ok) {
        // `error` is the gate's own sentence. Both existing callers
        // (DispatchHeader.patchStatus, TripDetailMobile.patchStatus) read
        // `err.error` and rethrow it into their toast, so the owner sees the
        // real reason and not "Failed to update status".
        logger.info('[dispatch status] start refused by inspection gate', {
          orgId,
          dispatchId: id,
          byUserId: session.userId,
          code: started.code,
        });
        return NextResponse.json(
          { error: started.error, code: started.code },
          { status: started.status }
        );
      }

      // Response shape unchanged for this transition: callers only check
      // `res.ok` and, on failure, `error`. `gate` is additive.
      return NextResponse.json({
        data: {
          id: started.data.id,
          status: started.data.status,
          gate: started.data.gate,
        },
      });
    }

    // ── Every other transition: unchanged ────────────────────────────────
    const result = await transitionTripStatus(
      orgId,
      id,
      parsed.data.status,
      parsed.data.notes
    );

    if (result === null) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if ('error' in result) {
      return NextResponse.json(
        { error: result.error, details: (result as { error: string; details?: { from: string; to: string } }).details },
        { status: 422 }
      );
    }

    return NextResponse.json({ data: result });
  } catch (err) {
    logger.error('PATCH /api/v1/carrier/dispatches/[id]/status failed', err, {
      orgId,
      error: serializeError(err),
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
