import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeServiceStatus(
  intervalDays: number | null,
  intervalMiles: number | null,
  baselineDate: Date,
  baselineOdometer: number,
  truckOdometer: number
): { dueDate: string | null; dueMileage: number | null; status: 'overdue' | 'due_soon' | 'ok' } {
  const now = Date.now();
  let dueDate: string | null = null;
  let dueMileage: number | null = null;
  let isOverdue = false;
  let isDueSoon = false;

  if (intervalDays != null) {
    const dueDateMs = baselineDate.getTime() + intervalDays * 86_400_000;
    dueDate = new Date(dueDateMs).toISOString();
    if (dueDateMs < now) {
      isOverdue = true;
    } else if (dueDateMs - now <= 7 * 86_400_000) {
      isDueSoon = true;
    }
  }

  if (intervalMiles != null) {
    dueMileage = baselineOdometer + intervalMiles;
    if (dueMileage < truckOdometer) {
      isOverdue = true;
    } else if (dueMileage - truckOdometer <= 500) {
      isDueSoon = true;
    }
  }

  const status: 'overdue' | 'due_soon' | 'ok' = isOverdue
    ? 'overdue'
    : isDueSoon
    ? 'due_soon'
    : 'ok';

  return { dueDate, dueMileage, status };
}

// ---------------------------------------------------------------------------
// GET /api/mobile/owner/trucks/[id]/scheduled-service
//
// Returns all non-completed scheduled services for this truck with computed status.
// ---------------------------------------------------------------------------

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;
  const { id } = await params;

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by validateMobileToken() above. tenantId comes from the verified JWT.
     */
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const truck = await tx.truck.findUnique({
        where: { id, tenantId, archivedAt: null },
        select: { odometer: true },
      });
      if (!truck) return null;

      const services = await tx.scheduledService.findMany({
        where: { tenantId, truckId: id, isCompleted: false },
        orderBy: { createdAt: 'desc' },
      });

      return { truck, services };
    }, TX_OPTIONS);

    if (!result) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 });
    }

    const { truck, services } = result;

    return NextResponse.json({
      services: services.map((s) => {
        const computed = computeServiceStatus(
          s.intervalDays,
          s.intervalMiles,
          s.baselineDate,
          s.baselineOdometer,
          truck.odometer
        );
        return {
          id: s.id,
          serviceType: s.serviceType,
          notes: s.notes,
          createdAt: s.createdAt.toISOString(),
          ...computed,
        };
      }),
    });
  } catch (err) {
    logger.error('[mobile/owner/trucks/[id]/scheduled-service GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// POST /api/mobile/owner/trucks/[id]/scheduled-service
//
// Creates a new scheduled service for this truck.
// Body: { serviceType, dueDate?, dueMileage?, notes? }
// At least one of dueDate or dueMileage is required.
// ---------------------------------------------------------------------------

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { serviceType, dueDate, dueMileage, notes } = body as Record<string, unknown>;

  if (!serviceType || typeof serviceType !== 'string' || serviceType.trim().length === 0) {
    return NextResponse.json(
      { error: 'serviceType is required and must be a non-empty string' },
      { status: 400 }
    );
  }

  if (dueDate == null && dueMileage == null) {
    return NextResponse.json(
      { error: 'At least one of dueDate or dueMileage is required' },
      { status: 400 }
    );
  }

  let parsedDueDate: Date | null = null;
  if (dueDate != null) {
    if (typeof dueDate !== 'string') {
      return NextResponse.json({ error: 'dueDate must be an ISO date string' }, { status: 400 });
    }
    parsedDueDate = new Date(dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      return NextResponse.json({ error: 'dueDate must be a valid date string' }, { status: 400 });
    }
  }

  let dueMileageNum: number | null = null;
  if (dueMileage != null) {
    dueMileageNum = Number(dueMileage);
    if (!Number.isInteger(dueMileageNum) || dueMileageNum < 0) {
      return NextResponse.json({ error: 'dueMileage must be a non-negative integer' }, { status: 400 });
    }
  }

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by validateMobileToken() above. tenantId comes from the verified JWT.
     */
    const service = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const truck = await tx.truck.findUnique({
        where: { id, tenantId, archivedAt: null },
        select: { odometer: true },
      });
      if (!truck) return null;

      const now = new Date();

      // Convert user-friendly dueDate to intervalDays
      let intervalDays: number | null = null;
      if (parsedDueDate != null) {
        intervalDays = Math.max(1, Math.ceil((parsedDueDate.getTime() - now.getTime()) / 86_400_000));
      }

      // Convert user-friendly dueMileage to intervalMiles
      let intervalMiles: number | null = null;
      if (dueMileageNum != null) {
        intervalMiles = Math.max(1, dueMileageNum - truck.odometer);
      }

      return tx.scheduledService.create({
        data: {
          tenantId,
          truckId: id,
          serviceType: serviceType.trim(),
          intervalDays,
          intervalMiles,
          baselineDate: now,
          baselineOdometer: truck.odometer,
          notes: notes != null && typeof notes === 'string' ? notes.trim() || null : null,
        },
        select: { id: true, serviceType: true },
      });
    }, TX_OPTIONS);

    if (!service) {
      return NextResponse.json({ error: 'Truck not found' }, { status: 404 });
    }

    return NextResponse.json({ service }, { status: 201 });
  } catch (err) {
    logger.error('[mobile/owner/trucks/[id]/scheduled-service POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// PATCH /api/mobile/owner/trucks/[id]/scheduled-service
//
// Marks a scheduled service as complete and logs a MaintenanceEvent audit trail.
// Body: { serviceId, actualDate?, actualOdometer? }
// ---------------------------------------------------------------------------

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;
  const { id } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { serviceId, actualDate, actualOdometer } = body as Record<string, unknown>;

  if (!serviceId || typeof serviceId !== 'string') {
    return NextResponse.json({ error: 'serviceId is required' }, { status: 400 });
  }

  let parsedActualDate: Date | null = null;
  if (actualDate != null) {
    if (typeof actualDate !== 'string') {
      return NextResponse.json({ error: 'actualDate must be an ISO date string' }, { status: 400 });
    }
    parsedActualDate = new Date(actualDate);
    if (isNaN(parsedActualDate.getTime())) {
      return NextResponse.json({ error: 'actualDate must be a valid date string' }, { status: 400 });
    }
  }

  let actualOdometerNum: number | null = null;
  if (actualOdometer != null) {
    actualOdometerNum = Number(actualOdometer);
    if (!Number.isInteger(actualOdometerNum) || actualOdometerNum < 0) {
      return NextResponse.json({ error: 'actualOdometer must be a non-negative integer' }, { status: 400 });
    }
  }

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by validateMobileToken() above. tenantId comes from the verified JWT.
     */
    const outcome = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Find the scheduled service — must be non-completed and belong to this truck/tenant
      const svc = await tx.scheduledService.findFirst({
        where: { id: serviceId, tenantId, truckId: id, isCompleted: false },
      });
      if (!svc) return 'not_found';

      // SAFE: tenant ownership verified by findFirst({ tenantId, truckId }) above within this same transaction
      await tx.scheduledService.update({
        where: { id: serviceId },
        data: { isCompleted: true, completedAt: new Date() },
      });

      // Create audit trail as a MaintenanceEvent
      await tx.maintenanceEvent.create({
        data: {
          tenantId,
          truckId: id,
          serviceType: svc.serviceType,
          serviceDate: parsedActualDate ?? new Date(),
          odometerAtService: actualOdometerNum ?? svc.baselineOdometer,
        },
      });

      return 'ok';
    }, TX_OPTIONS);

    if (outcome === 'not_found') {
      return NextResponse.json({ error: 'Scheduled service not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error('[mobile/owner/trucks/[id]/scheduled-service PATCH] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
