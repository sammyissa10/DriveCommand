import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * GET /api/mobile/owner/crm
 *
 * Returns CRM stats and customer list for the authenticated owner's tenant.
 * Ordered alphabetically by company name.
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

  const { searchParams } = new URL(req.url);
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10) || 50));

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

      const where = { tenantId };

      const [customers, total] = await Promise.all([
        tx.customer.findMany({
          where,
          orderBy: { companyName: 'asc' },
          select: {
            id: true,
            companyName: true,
            status: true,
            priority: true,
            phone: true,
            email: true,
          },
          take: limit,
          skip: (page - 1) * limit,
        }),
        tx.customer.count({ where }),
      ]);

      // Stats are computed from full-table aggregates, not the paginated subset
      const [activeCount, vipCount] = await Promise.all([
        tx.customer.count({ where: { tenantId, status: 'ACTIVE' } }),
        tx.customer.count({ where: { tenantId, priority: 'VIP' } }),
      ]);

      const stats = {
        total,
        active: activeCount,
        vip: vipCount,
      };

      const customerList = customers.map((c) => ({
        id: c.id,
        companyName: c.companyName,
        status: c.status,
        priority: c.priority,
        phone: c.phone,
        email: c.email,
      }));

      return {
        stats,
        customers: customerList,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    }, TX_OPTIONS);

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/crm] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
