import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

/**
 * GET /api/mobile/owner/trucks
 *
 * Returns all non-archived trucks for the authenticated owner's tenant.
 * Used to populate the truck picker in the load detail screen.
 * Ordered by make asc, model asc.
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
    const trucks = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.truck.findMany({
        where: {
          tenantId,
          archivedAt: null,
        },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          inMaintenance: true,
        },
        orderBy: [{ make: 'asc' }, { model: 'asc' }],
      });
    }, TX_OPTIONS);

    return NextResponse.json(trucks);
  } catch (err) {
    console.error('[mobile/owner/trucks] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
