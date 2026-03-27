import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

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

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const customers = await tx.customer.findMany({
        where: { tenantId },
        orderBy: { companyName: 'asc' },
        select: {
          id: true,
          companyName: true,
          status: true,
          priority: true,
          phone: true,
          email: true,
        },
      });

      const stats = {
        total: customers.length,
        active: customers.filter((c) => c.status === 'ACTIVE').length,
        vip: customers.filter((c) => c.priority === 'VIP').length,
      };

      const customerList = customers.map((c) => ({
        id: c.id,
        companyName: c.companyName,
        status: c.status,
        priority: c.priority,
        phone: c.phone,
        email: c.email,
      }));

      return { stats, customers: customerList };
    }, TX_OPTIONS);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[mobile/owner/crm] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
