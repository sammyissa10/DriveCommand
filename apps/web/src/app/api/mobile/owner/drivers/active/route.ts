import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * GET /api/mobile/owner/drivers/active
 *
 * Returns all active drivers for the owner's tenant.
 * Used by create-load and load-detail forms for the driver picker dropdown.
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

  const { tenantId } = auth;

  try {
    const drivers = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.user.findMany({
        where: { tenantId, role: 'DRIVER', isActive: true },
        select: { id: true, firstName: true, lastName: true },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
    }, TX_OPTIONS);

    return NextResponse.json(
      drivers.map((d) => ({
        id: d.id,
        name: [d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unknown Driver',
      }))
    );
  } catch (err) {
    console.error('[mobile/owner/drivers/active] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
