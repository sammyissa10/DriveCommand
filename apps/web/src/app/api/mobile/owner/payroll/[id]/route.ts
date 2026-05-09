import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/payroll/[id]
 *
 * Returns full detail for a single payroll record belonging to the owner's tenant.
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
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
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const record = await tx.payrollRecord.findFirst({
        where: { id, tenantId, archivedAt: null },
        include: {
          driver: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      if (!record) return null;

      return {
        id: record.id,
        status: record.status,
        periodStart: record.periodStart.toISOString(),
        periodEnd: record.periodEnd.toISOString(),
        basePay: Number(record.basePay),
        bonuses: Number(record.bonuses),
        deductions: Number(record.deductions),
        totalPay: Number(record.totalPay),
        milesLogged: record.milesLogged,
        loadsCompleted: record.loadsCompleted,
        notes: record.notes ?? null,
        paidAt: record.paidAt?.toISOString() ?? null,
        driverName:
          [record.driver?.firstName, record.driver?.lastName].filter(Boolean).join(' ') || 'Unknown Driver',
        createdAt: record.createdAt.toISOString(),
      };
    }, TX_OPTIONS);

    if (!result) {
      return NextResponse.json({ error: 'Payroll record not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/payroll/[id] GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
