import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';

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
  { params }: { params: { id: string } }
) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const { tenantId } = auth;
  const { id: driverId } = params;

  try {
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
          // Current HOS entry
          hosEntries: {
            where: { endTime: null },
            orderBy: { startTime: 'desc' },
            take: 1,
            select: { status: true, startTime: true },
          },
        },
      });
    }, TX_OPTIONS);

    if (!driver) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const name = [driver.firstName, driver.lastName].filter(Boolean).join(' ') || 'Unknown Driver';
    const hosStatus = driver.hosEntries[0]?.status ?? null;
    const hosStartTime = driver.hosEntries[0]?.startTime?.toISOString() ?? null;

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
    console.error('[mobile/owner/drivers/[id] GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
