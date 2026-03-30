import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

/**
 * Compute compliance status from a driver's documents.
 * - CRITICAL (red): any document expired (expiryDate < now)
 * - WARNING (amber): any document expiring within 30 days
 * - OK (green): all documents valid or no expiry date
 */
function computeComplianceStatus(documents: Array<{ expiryDate: Date | null }>): 'ok' | 'warning' | 'critical' {
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  let hasWarning = false;

  for (const doc of documents) {
    if (!doc.expiryDate) continue;
    if (doc.expiryDate < now) return 'critical';
    if (doc.expiryDate < thirtyDaysFromNow) hasWarning = true;
  }

  return hasWarning ? 'warning' : 'ok';
}

/**
 * GET /api/mobile/owner/drivers
 *
 * Returns all drivers for the owner's tenant with compliance status.
 * Sorted by name ascending.
 *
 * Returns: Array<{
 *   id, name, email, phone, status,
 *   currentLoadNumber: string | null,
 *   hosStatus: string | null,
 *   complianceStatus: 'ok' | 'warning' | 'critical',
 *   expiringDocCount: number,
 *   expiredDocCount: number,
 * }>
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
    const drivers = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.user.findMany({
        where: { tenantId, role: 'DRIVER', isActive: true },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          // Current active load
          driverLoads: {
            where: {
              status: { in: ['PENDING', 'DISPATCHED', 'PICKED_UP', 'IN_TRANSIT'] },
            },
            orderBy: { updatedAt: 'desc' },
            take: 1,
            select: { loadNumber: true },
          },
          // Latest HOS entry (no endTime = currently active)
          hosEntries: {
            where: { endTime: null },
            orderBy: { startTime: 'desc' },
            take: 1,
            select: { status: true },
          },
          // Compliance documents
          driverDocuments: {
            where: { tenantId },
            select: { expiryDate: true },
          },
        },
        orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      });
    }, TX_OPTIONS);

    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    const result = drivers.map((driver) => {
      const name = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || 'Unknown Driver';
      const currentLoadNumber = driver.driverLoads[0]?.loadNumber ?? null;
      const hosStatus = driver.hosEntries[0]?.status ?? null;

      // Compute compliance counts
      let expiredDocCount = 0;
      let expiringDocCount = 0;
      for (const doc of driver.driverDocuments) {
        if (!doc.expiryDate) continue;
        if (doc.expiryDate < now) expiredDocCount++;
        else if (doc.expiryDate < thirtyDaysFromNow) expiringDocCount++;
      }

      const complianceStatus = computeComplianceStatus(driver.driverDocuments);

      // Status: on duty if HOS is active OR if driver has an active load
      const status =
        hosStatus === 'DRIVING' || hosStatus === 'ON_DUTY' || currentLoadNumber !== null
          ? 'on_duty'
          : 'off_duty';

      return {
        id: driver.id,
        name,
        email: driver.email,
        phone: null, // User model has no phone field
        status,
        currentLoadNumber,
        hosStatus,
        complianceStatus,
        expiringDocCount,
        expiredDocCount,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/drivers GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
