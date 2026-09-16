import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

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

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

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
    const drivers = await tenantPrisma.$transaction(async (tx) => {
      // TKT-0076: this is the PICKER endpoint — `routes/new` binds its driver
      // selector to it — so seeded demo records are excluded here. Its sibling
      // `/api/mobile/owner/drivers` is the LIST screen and deliberately still
      // returns samples, with their pill. Two endpoints, two jobs.
      return tx.user.findMany({
        where: { tenantId, role: 'DRIVER', isActive: true, isSample: false },
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
    logger.error('[mobile/owner/drivers/active] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
