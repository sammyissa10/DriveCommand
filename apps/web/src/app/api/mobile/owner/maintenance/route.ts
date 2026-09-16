import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
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
// GET /api/mobile/owner/maintenance
//
// Returns ALL non-completed scheduled services across all trucks for this tenant,
// with computed due-soon/overdue status and truck info included.
// ---------------------------------------------------------------------------

export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

  try {
    /*
     * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id
     * (DEC-11), so the header-reading getTenantPrisma() would throw.
     * userId is deliberately NOT passed — it would make the audit-columns
     * extension start writing createdById/updatedById, a behaviour change
     * this routing task declines to make. Every where clause is unchanged:
     * RLS is the second layer, not a replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    const services = await tenantPrisma.$transaction(async (tx) => {
      return tx.scheduledService.findMany({
        where: { tenantId, isCompleted: false },
        include: {
          truck: {
            select: {
              id: true,
              make: true,
              model: true,
              licensePlate: true,
              odometer: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    }, TX_OPTIONS);

    return NextResponse.json({
      services: services.map((s) => {
        const computed = computeServiceStatus(
          s.intervalDays,
          s.intervalMiles,
          s.baselineDate,
          s.baselineOdometer,
          s.truck.odometer
        );
        return {
          id: s.id,
          serviceType: s.serviceType,
          notes: s.notes,
          createdAt: s.createdAt.toISOString(),
          truck: {
            id: s.truck.id,
            make: s.truck.make,
            model: s.truck.model,
            licensePlate: s.truck.licensePlate,
            odometer: s.truck.odometer,
          },
          ...computed,
        };
      }),
    });
  } catch (err) {
    logger.error('[mobile/owner/maintenance GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
