import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

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

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

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

      // Stats — use groupBy aggregates instead of a full-table scan
      const statusGroups = await tx.payrollRecord.groupBy({
        by: ['status'],
        where: { tenantId, archivedAt: null },
        _count: true,
        _sum: { totalPay: true },
      });

      let totalCount = 0;
      let draft = 0;
      let approved = 0;
      let totalPaid = 0;
      for (const g of statusGroups) {
        totalCount += g._count;
        if (g.status === 'DRAFT') draft = g._count;
        if (g.status === 'APPROVED') approved = g._count;
        if (g.status === 'PAID') totalPaid = Number(g._sum.totalPay ?? 0);
      }

      const stats = {
        total: totalCount,
        draft,
        approved,
        totalPaid,
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
    logger.error('[mobile/owner/payroll] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/owner/payroll
 *
 * Creates a new draft payroll record for a driver in the owner's tenant.
 *
 * Body: { driverId, periodStart, periodEnd, basePay, deductions?, bonuses?, notes? }
 * Returns: { record: { id, driverName } } with status 201
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId, userId } = auth;

  let body: {
    driverId?: string;
    periodStart?: string;
    periodEnd?: string;
    basePay?: number;
    deductions?: number;
    bonuses?: number;
    notes?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  // Validate driverId
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!body.driverId || !uuidRegex.test(body.driverId)) {
    return NextResponse.json({ error: 'driverId is required and must be a valid UUID' }, { status: 400 });
  }

  // Validate period dates
  if (!body.periodStart || isNaN(Date.parse(body.periodStart))) {
    return NextResponse.json({ error: 'periodStart is required and must be a valid date' }, { status: 400 });
  }
  if (!body.periodEnd || isNaN(Date.parse(body.periodEnd))) {
    return NextResponse.json({ error: 'periodEnd is required and must be a valid date' }, { status: 400 });
  }
  const periodStartDate = new Date(body.periodStart);
  const periodEndDate = new Date(body.periodEnd);
  if (periodEndDate <= periodStartDate) {
    return NextResponse.json({ error: 'periodEnd must be after periodStart' }, { status: 400 });
  }

  // Validate basePay
  const basePay = Number(body.basePay);
  if (isNaN(basePay) || basePay < 0) {
    return NextResponse.json({ error: 'basePay is required and must be a number >= 0' }, { status: 400 });
  }

  const bonuses = body.bonuses !== undefined ? Number(body.bonuses) : 0;
  const deductions = body.deductions !== undefined ? Number(body.deductions) : 0;
  const totalPay = basePay + bonuses - deductions;

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

      const record = await tx.payrollRecord.create({
        data: {
          tenantId,
          driverId: body.driverId!,
          periodStart: periodStartDate,
          periodEnd: periodEndDate,
          basePay,
          bonuses,
          deductions,
          totalPay,
          notes: body.notes?.trim() || null,
          status: 'DRAFT',
          createdById: userId,
          updatedById: userId,
        },
        include: {
          driver: { select: { firstName: true, lastName: true } },
        },
      });

      const driverName =
        [record.driver?.firstName, record.driver?.lastName].filter(Boolean).join(' ') || 'Unknown Driver';

      return { id: record.id, driverName };
    }, TX_OPTIONS);

    return NextResponse.json({ record: result }, { status: 201 });
  } catch (err) {
    logger.error('[mobile/owner/payroll POST] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
