import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
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
    /*
     * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id
     * (DEC-11), so the header-reading getTenantPrisma() would throw.
     * userId is deliberately NOT passed — it would make the audit-columns
     * extension start writing createdById/updatedById, a behaviour change
     * this routing task declines to make. Every where clause is unchanged:
     * RLS is the second layer, not a replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    const result = await tenantPrisma.$transaction(async (tx) => {
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
