import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/mobile/driver/loads?status=active|history
 *
 * Returns the authenticated driver's loads filtered by status group:
 * - active (default): PENDING, DISPATCHED, PICKED_UP, IN_TRANSIT
 * - history: DELIVERED, INVOICED, CANCELLED
 *
 * Each load includes customer name for display in the card.
 * Sorted by updatedAt descending (most recently changed first).
 *
 * Requires: Authorization: Bearer <token>
 */
export async function GET(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { driverId, tenantId } = auth;

  // Parse status filter from query param
  const { searchParams } = new URL(req.url);
  const statusParam = searchParams.get('status') ?? 'active';

  const activeStatuses = ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] as const;
  const historyStatuses = ['DELIVERED', 'INVOICED', 'CANCELLED'] as const;

  const statusFilter =
    statusParam === 'history' ? [...historyStatuses] : [...activeStatuses];

  try {
    const loads = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.load.findMany({
        where: {
          driverId,
          tenantId,
          status: { in: statusFilter },
          archivedAt: null,
        },
        include: {
          customer: { select: { id: true, companyName: true } },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }, TX_OPTIONS);

    return NextResponse.json(loads);
  } catch (err) {
    console.error('[mobile/driver/loads] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
