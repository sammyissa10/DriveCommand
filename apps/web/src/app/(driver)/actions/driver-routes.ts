'use server';

/**
 * Driver-scoped route server actions — Carrier Ops edition.
 * All actions enforce DRIVER role check and resolve driver identity via
 * carrierDriver.userId = session.userId (NOT from URL/params).
 *
 * CRITICAL SECURITY: No action accepts driverId as input. Identity is
 * resolved server-side from the session cookie.
 */

import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { handleStartTrip } from '@/lib/carrier/inspection-handlers';
import { arriveStop, completeStop } from '@/lib/carrier/stop-completion';
import { logger, serializeError } from '@/lib/logger';
import { revalidatePath } from 'next/cache';

// ---------------------------------------------------------------------------
// getMyActiveDispatch
// ---------------------------------------------------------------------------

/**
 * Get the active CarrierDispatch assigned to the authenticated driver.
 * Returns the earliest planned or in_progress dispatch, or null if none.
 *
 * SECURITY: Filters by carrierDriver.userId = session.userId AND orgId = session.tenantId.
 */
export async function getMyActiveDispatch() {
  await requireRole([UserRole.DRIVER]);
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  /**
   * quick-588: this transaction now runs on a tenant-scoped Prisma client
   * (app.current_tenant_id set for the session's tenant), not a bypass one.
   * Every model this transaction touches (CarrierDriver, Trip, and their
   * nested CarrierStop/CarrierDocument relations) is in EXEMPT_MODELS, so the
   * tenant-RLS extension injects nothing and the emitted SQL is unchanged —
   * the bypass was never required for this transaction's own tables, and the
   * three tables gaining RLS policies (stops, route_template_stops,
   * carrier_documents) have no bypass_rls_policy to fall back on once those
   * policies ship. The `requireRole([DRIVER]) + getSession()` gate above,
   * plus this query's explicit `orgId: session.tenantId` predicate, are what
   * scope it — unchanged from before this conversion.
   */
  const tenantPrisma = await getTenantPrisma();

  return tenantPrisma.$transaction(async (tx) => {
    const carrierDriver = await tx.carrierDriver.findFirst({
      where: { userId: session.userId, orgId: session.tenantId },
    });

    if (!carrierDriver) return null;

    const dispatchInclude = {
      truck: {
        select: { id: true, unitNumber: true, displayName: true, year: true, make: true, model: true },
      },
      stops: {
        orderBy: { sequenceOrder: 'asc' as const },
        include: {
          facility: {
            select: { id: true, name: true, city: true, state: true, latitude: true, longitude: true, addressLine1: true },
          },
          documents: {
            select: { id: true, documentType: true, filename: true, createdAt: true },
            orderBy: { createdAt: 'desc' as const },
          },
        },
      },
      carrierLoads: {
        include: {
          client: { select: { id: true, name: true } },
        },
      },
    };

    // Prioritize in_progress dispatches over planned
    let dispatch = await tx.trip.findFirst({
      where: {
        primaryDriverId: carrierDriver.id,
        orgId: session.tenantId,
        status: 'in_progress',
      },
      orderBy: { actualDeparture: 'desc' },
      include: dispatchInclude,
    });

    if (!dispatch) {
      dispatch = await tx.trip.findFirst({
        where: {
          primaryDriverId: carrierDriver.id,
          orgId: session.tenantId,
          status: 'planned',
        },
        orderBy: { scheduledDeparture: 'asc' },
        include: dispatchInclude,
      });
    }

    const firstDeliveryStop = dispatch
      ? dispatch.stops.find((s) => s.stopType === 'delivery' && s.status === 'pending') ?? null
      : null;

    return dispatch ? { ...dispatch, firstDeliveryStop } : null;
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// getMyDispatchHistory
// ---------------------------------------------------------------------------

/**
 * Get completed dispatches for the authenticated driver (last 10).
 * SECURITY: Filters by carrierDriver.userId = session.userId AND orgId = session.tenantId.
 */
export async function getMyDispatchHistory() {
  await requireRole([UserRole.DRIVER]);
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  /**
   * quick-588: tenant-scoped client, see getMyActiveDispatch above for the
   * full reasoning. CarrierDriver, Trip, and their nested CarrierStop/
   * CarrierDocument/CarrierLoad relations are all EXEMPT_MODELS, so this
   * swap is receiver-only — the emitted SQL is unchanged.
   */
  const tenantPrisma = await getTenantPrisma();

  return tenantPrisma.$transaction(async (tx) => {
    const carrierDriver = await tx.carrierDriver.findFirst({
      where: { userId: session.userId, orgId: session.tenantId },
    });

    if (!carrierDriver) return [];

    return tx.trip.findMany({
      where: {
        primaryDriverId: carrierDriver.id,
        orgId: session.tenantId,
        status: 'completed',
      },
      orderBy: { actualDeparture: 'desc' },
      take: 20,
      include: {
        truck: {
          select: { id: true, unitNumber: true, displayName: true },
        },
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          include: {
            facility: {
              select: { id: true, name: true, city: true, state: true },
            },
            documents: {
              select: { id: true, documentType: true, filename: true, createdAt: true },
              orderBy: { createdAt: 'desc' as const },
            },
          },
        },
        carrierLoads: {
          include: { client: { select: { id: true, name: true } } },
        },
      },
    });
  }, TX_OPTIONS);
}

// ---------------------------------------------------------------------------
// startTrip
// ---------------------------------------------------------------------------

/**
 * Transition the dispatch from 'planned' to 'in_progress'.
 * Verifies the dispatch belongs to the authenticated driver before delegating.
 *
 * SECURITY: Verifies dispatch.primaryDriverId = carrierDriver.id AND orgId = session.tenantId.
 *
 * COMPLIANCE (quick-540): delegates to `handleStartTrip`, which runs the Phase 9
 * inspection gate BEFORE reaching `transitionTripStatus`. This action previously
 * called `transitionTripStatus` directly, so a web driver could start a trip on
 * an uninspected truck with `requirePreTripInspection = true` and nothing
 * recorded it — quick-539 Q3. Ownership is still verified here first: the gate
 * answers "may this trip start", not "is this your trip", and both questions
 * have to be asked.
 *
 * The refusal is returned as `{ error }` — the SAME shape this action already
 * returned for "not assigned to you" — carrying the gate's own sentence, so the
 * existing caller surfaces the real reason without any UI change. `code` rides
 * alongside for a future caller that wants to route on it.
 */
export async function startTrip(dispatchId: string) {
  await requireRole([UserRole.DRIVER]);
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  // Verify ownership before calling the lib function
  const owned = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    const carrierDriver = await tx.carrierDriver.findFirst({
      where: { userId: session.userId, orgId: session.tenantId },
    });
    if (!carrierDriver) return false;

    const dispatch = await tx.trip.findFirst({
      where: {
        id: dispatchId,
        primaryDriverId: carrierDriver.id,
        orgId: session.tenantId,
      },
    });
    return !!dispatch;
  }, TX_OPTIONS);

  if (!owned) {
    return { error: 'Dispatch not found or not assigned to you' };
  }

  let result: Awaited<ReturnType<typeof handleStartTrip>>;
  try {
    result = await handleStartTrip({
      orgId: session.tenantId,
      dispatchId,
      userId: session.userId,
    });
  } catch (err) {
    // A THROW is not a refusal, and the two must not read alike. The full error
    // — name, message, Prisma code — goes to the log via serializeError; the
    // driver gets a sentence that says the gate could not be checked, which is
    // deliberately NOT "you may go".
    logger.error('[startTrip] inspection gate threw', err, {
      orgId: session.tenantId,
      dispatchId,
      driverUserId: session.userId,
      error: serializeError(err),
    });
    return {
      error:
        'Could not check the pre-trip inspection for this truck. Please try again, or contact your dispatcher.',
      code: 'GATE_UNAVAILABLE' as const,
    };
  }

  if (!result.ok) {
    // Named, never swallowed. `result.error` is the gate's own sentence —
    // "This trip cannot start. 1 critical item failed inspection." — not a
    // generic failure string, and not a silent no-op that leaves the driver
    // tapping a button that appears to do nothing.
    logger.info('[startTrip] refused by inspection gate', {
      orgId: session.tenantId,
      dispatchId,
      driverUserId: session.userId,
      code: result.code,
    });
    return { error: result.error, code: result.code };
  }

  revalidatePath('/my-route');
  revalidatePath('/home');
  return { id: result.data.id, status: result.data.status };
}

// ---------------------------------------------------------------------------
// arriveAtStop
// ---------------------------------------------------------------------------

/**
 * Mark a CarrierStop as 'arrived'.
 * Verifies the stop's dispatch belongs to the authenticated driver.
 *
 * SECURITY: Verifies stop.dispatch.primaryDriverId = carrierDriver.id AND orgId matches.
 */
export async function arriveAtStop(stopId: string) {
  await requireRole([UserRole.DRIVER]);
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const tenantPrisma = await getTenantPrisma();
  const owned = await tenantPrisma.$transaction(async (tx) => {

    const carrierDriver = await tx.carrierDriver.findFirst({
      where: { userId: session.userId, orgId: session.tenantId },
    });
    if (!carrierDriver) return false;

    const stop = await tx.carrierStop.findFirst({
      where: {
        id: stopId,
        dispatch: {
          primaryDriverId: carrierDriver.id,
          orgId: session.tenantId,
        },
      },
    });
    return !!stop;
  }, TX_OPTIONS);

  if (!owned) {
    return { error: 'Stop not found or not assigned to you' };
  }

  const result = await arriveStop(session.tenantId, stopId);
  revalidatePath('/my-route');
  return result;
}

// ---------------------------------------------------------------------------
// completeCurrentStop
// ---------------------------------------------------------------------------

/**
 * Mark a CarrierStop as 'completed'.
 * Verifies the stop's dispatch belongs to the authenticated driver.
 *
 * SECURITY: Verifies stop.dispatch.primaryDriverId = carrierDriver.id AND orgId matches.
 */
export async function completeCurrentStop(stopId: string) {
  await requireRole([UserRole.DRIVER]);
  const session = await getSession();
  if (!session) throw new Error('Unauthorized');

  const tenantPrisma = await getTenantPrisma();
  const owned = await tenantPrisma.$transaction(async (tx) => {

    const carrierDriver = await tx.carrierDriver.findFirst({
      where: { userId: session.userId, orgId: session.tenantId },
    });
    if (!carrierDriver) return false;

    const stop = await tx.carrierStop.findFirst({
      where: {
        id: stopId,
        dispatch: {
          primaryDriverId: carrierDriver.id,
          orgId: session.tenantId,
        },
      },
    });
    return !!stop;
  }, TX_OPTIONS);

  if (!owned) {
    return { error: 'Stop not found or not assigned to you' };
  }

  const result = await completeStop(session.tenantId, stopId, { bypassDocumentCheck: true });
  revalidatePath('/my-route');
  return result;
}
