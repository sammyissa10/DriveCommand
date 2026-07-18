import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { computeHOSClocks } from '@/lib/hos/compute-hos-clocks';

/**
 * Compute document expiry status.
 * - EXPIRED: past today
 * - EXPIRING: within 30 days
 * - VALID: more than 30 days away or no expiry
 */
function computeDocStatus(expiryDate: Date | null): 'VALID' | 'EXPIRING' | 'EXPIRED' {
  if (!expiryDate) return 'VALID';
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (expiryDate < now) return 'EXPIRED';
  if (expiryDate < thirtyDaysFromNow) return 'EXPIRING';
  return 'VALID';
}

/**
 * Compute overall compliance status from documents.
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
 * GET /api/mobile/owner/drivers/[id]
 *
 * Returns full driver detail including:
 * - Driver info (name, email, phone)
 * - Current active load (if any)
 * - Compliance documents (with computed status)
 * - Recent incidents (last 3)
 * - Current HOS status
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;
  const { id: driverId } = await params;

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setUTCHours(0, 0, 0, 0);
  const endOfDay = new Date(now);
  endOfDay.setUTCHours(23, 59, 59, 999);

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     *        Driver endpoints additionally filter by driverId (= auth.userId for DRIVER role).
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const driver = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      return tx.user.findFirst({
        where: { id: driverId, tenantId, role: 'DRIVER' },
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
            select: {
              id: true,
              loadNumber: true,
              status: true,
              origin: true,
              destination: true,
              pickupDate: true,
              deliveryDate: true,
              rate: true,
            },
          },
          // Compliance documents
          driverDocuments: {
            where: { tenantId },
            select: {
              id: true,
              fileName: true,
              description: true, // mobile document type key
              expiryDate: true,
              notes: true,
              createdAt: true,
            },
            orderBy: { expiryDate: 'asc' },
          },
          // Recent incidents (last 3)
          incidents: {
            where: { tenantId },
            orderBy: { reportedAt: 'desc' },
            take: 3,
            select: {
              id: true,
              category: true,
              severity: true,
              description: true,
              reportedAt: true,
            },
          },
          // Today's HOS entries (plus any open overnight entry) for the clocks
          hosEntries: {
            where: {
              OR: [{ startTime: { gte: startOfDay, lte: endOfDay } }, { endTime: null }],
            },
            orderBy: { startTime: 'asc' },
            select: { status: true, startTime: true, endTime: true },
          },
        },
      });
    }, TX_OPTIONS);

    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const name = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || 'Unknown Driver';
    const openEntry = driver.hosEntries.find((e) => e.endTime == null);
    const hosStatus = openEntry?.status ?? null;
    const hosStartTime = openEntry?.startTime?.toISOString() ?? null;

    // HOS clocks for the Hours tab — same shared math as the drivers list.
    const clocks = computeHOSClocks(driver.hosEntries, now);
    const hos = {
      onDutyMinutes: clocks.onDutyMinutesToday,
      drivingMinutes: clocks.drivingMinutesToday,
      driveRemainingMinutes: clocks.driveRemainingMinutes,
      dutyWindowRemainingMinutes: clocks.dutyWindowRemainingMinutes,
      remainingMinutes: clocks.remainingMinutes,
      hasDutyToday: clocks.hasDutyToday,
      isLow: clocks.isLow,
    };

    // Map documents with computed status, sorted EXPIRED → EXPIRING → VALID
    const statusOrder: Record<string, number> = { EXPIRED: 0, EXPIRING: 1, VALID: 2 };
    const documents = driver.driverDocuments
      .map((doc) => ({
        id: doc.id,
        fileName: doc.fileName,
        documentType: doc.description ?? null,
        expiryDate: doc.expiryDate ? doc.expiryDate.toISOString() : null,
        notes: doc.notes ?? null,
        createdAt: doc.createdAt.toISOString(),
        status: computeDocStatus(doc.expiryDate),
      }))
      .sort((a, b) => (statusOrder[a.status] ?? 2) - (statusOrder[b.status] ?? 2));

    const complianceStatus = computeComplianceStatus(driver.driverDocuments);

    const currentLoad = driver.driverLoads[0]
      ? {
          id: driver.driverLoads[0].id,
          loadNumber: driver.driverLoads[0].loadNumber,
          status: driver.driverLoads[0].status,
          origin: driver.driverLoads[0].origin,
          destination: driver.driverLoads[0].destination,
          pickupDate: driver.driverLoads[0].pickupDate?.toISOString() ?? null,
          deliveryDate: driver.driverLoads[0].deliveryDate?.toISOString() ?? null,
          rate: driver.driverLoads[0].rate ? Number(driver.driverLoads[0].rate) : null,
        }
      : null;

    return NextResponse.json({
      id: driver.id,
      name,
      email: driver.email,
      phone: null, // User model has no phone field
      hosStatus,
      hosStartTime,
      hos,
      complianceStatus,
      currentLoad,
      documents,
      recentIncidents: driver.incidents.map((incident) => ({
        id: incident.id,
        category: incident.category,
        severity: incident.severity,
        description: incident.description,
        reportedAt: incident.reportedAt.toISOString(),
      })),
    });
  } catch (err) {
    logger.error('[mobile/owner/drivers/[id] GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * PATCH /api/mobile/owner/drivers/[id]
 *
 * Updates editable fields on a driver (User with role DRIVER).
 * Accepts: { firstName?, lastName?, licenseNumber? }
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;
  const { id: driverId } = await params;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { firstName, lastName, licenseNumber } = body as Record<string, unknown>;

  // At least one field must be provided
  const hasFirstName = firstName !== undefined;
  const hasLastName = lastName !== undefined;
  const hasLicenseNumber = licenseNumber !== undefined;

  if (!hasFirstName && !hasLastName && !hasLicenseNumber) {
    return NextResponse.json({ error: 'At least one field must be provided' }, { status: 400 });
  }

  // Validate field values
  if (hasFirstName && (typeof firstName !== 'string' || firstName.trim().length === 0)) {
    return NextResponse.json({ error: 'firstName must be a non-empty string' }, { status: 400 });
  }
  if (hasLastName && (typeof lastName !== 'string' || lastName.trim().length === 0)) {
    return NextResponse.json({ error: 'lastName must be a non-empty string' }, { status: 400 });
  }
  if (hasLicenseNumber && licenseNumber !== null && typeof licenseNumber !== 'string') {
    return NextResponse.json({ error: 'licenseNumber must be a string or null' }, { status: 400 });
  }

  const updateData: { firstName?: string; lastName?: string; licenseNumber?: string | null } = {};
  if (hasFirstName) updateData.firstName = (firstName as string).trim();
  if (hasLastName) updateData.lastName = (lastName as string).trim();
  if (hasLicenseNumber) updateData.licenseNumber = licenseNumber === null ? null : (licenseNumber as string).trim() || null;

  try {
    /**
     * @bypass_rls reason: mobile-api
     * WHY: Mobile Bearer token auth — see bypass_rls pattern documentation in
     *      apps/web/src/lib/auth/mobile-auth.ts for the full explanation.
     * SCOPE: Accesses only data belonging to the authenticated user's tenant.
     * SAFETY: Gated by validateMobileToken() above. tenantId and userId come from the verified JWT.
     */
    const updatedDriver = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Verify the driver exists and belongs to this tenant
      const existing = await tx.user.findFirst({
        where: { id: driverId, tenantId, role: 'DRIVER' },
        select: { id: true },
      });
      if (!existing) return null;

      return tx.user.update({
        where: { id: driverId },
        data: updateData,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          licenseNumber: true,
        },
      });
    }, TX_OPTIONS);

    if (!updatedDriver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      driver: {
        id: updatedDriver.id,
        firstName: updatedDriver.firstName,
        lastName: updatedDriver.lastName,
        licenseNumber: updatedDriver.licenseNumber,
      },
    });
  } catch (err) {
    logger.error('[mobile/owner/drivers/[id] PATCH] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
