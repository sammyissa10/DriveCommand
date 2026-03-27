import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/mobile/owner/customers
 *
 * Returns all active customers for the owner's tenant.
 * Used by create-load form for the customer picker dropdown.
 *
 * Returns: Array<{ id: string; name: string }>
 * Sorted by name asc.
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
    const customers = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.customer.findMany({
        where: { tenantId },
        select: { id: true, companyName: true },
        orderBy: { companyName: 'asc' },
      });
    }, TX_OPTIONS);

    return NextResponse.json(
      customers.map((c) => ({ id: c.id, name: c.companyName }))
    );
  } catch (err) {
    console.error('[mobile/owner/customers] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
