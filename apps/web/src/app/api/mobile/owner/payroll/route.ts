import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * GET /api/mobile/owner/payroll
 *
 * Returns payroll stats and recent payroll records for the authenticated owner's tenant.
 * Includes driver name resolved from firstName/lastName.
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const { tenantId } = auth;

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const records = await tx.payrollRecord.findMany({
        where: { tenantId, archivedAt: null },
        orderBy: { periodStart: 'desc' },
        take: 20,
        include: {
          driver: {
            select: { firstName: true, lastName: true },
          },
        },
      });

      // Stats — pull all records for accurate counts
      const allRecords = await tx.payrollRecord.findMany({
        where: { tenantId, archivedAt: null },
        select: { status: true, totalPay: true },
      });

      const stats = {
        total: allRecords.length,
        draft: allRecords.filter((r) => r.status === 'DRAFT').length,
        approved: allRecords.filter((r) => r.status === 'APPROVED').length,
        totalPaid: allRecords
          .filter((r) => r.status === 'PAID')
          .reduce((sum, r) => sum + Number(r.totalPay), 0),
      };

      const recordList = records.map((r) => ({
        id: r.id,
        status: r.status,
        periodStart: r.periodStart.toISOString(),
        periodEnd: r.periodEnd.toISOString(),
        totalPay: Number(r.totalPay),
        driverName:
          [r.driver?.firstName, r.driver?.lastName].filter(Boolean).join(' ') || 'Unknown Driver',
      }));

      return { stats, records: recordList };
    }, TX_OPTIONS);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[mobile/owner/payroll] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
