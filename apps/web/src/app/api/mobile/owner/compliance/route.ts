import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { documentMetadataSchema } from '@drivecommand/validation';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * GET /api/mobile/owner/compliance
 *
 * Returns compliance summary and alerts for the authenticated owner's tenant.
 * Mirrors the web compliance dashboard logic:
 *  - Driver documents with expiry dates (EXPIRED = past, EXPIRING_SOON = within 30 days)
 *  - Truck registration/insurance expiry from documentMetadata JSONB
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

      const now = new Date();
      const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

      // 1. Driver documents with expiry dates
      const driverDocs = await tx.document.findMany({
        where: { tenantId, driverId: { not: null }, expiryDate: { not: null } },
        select: {
          id: true,
          driverId: true,
          documentType: true,
          expiryDate: true,
          driver: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { expiryDate: 'asc' },
      });

      // 2. Trucks with documentMetadata
      const trucks = await tx.truck.findMany({
        where: { tenantId, archivedAt: null },
        select: {
          id: true,
          make: true,
          model: true,
          year: true,
          licensePlate: true,
          documentMetadata: true,
        },
      });

      // Build alerts
      const alerts: Array<{
        entityName: string;
        documentType: string;
        status: 'EXPIRED' | 'EXPIRING_SOON';
        daysUntilExpiry: number | null;
      }> = [];

      // Track unique driver/truck IDs for summary
      const trackedDriverIds = new Set<string>();
      const trackedTruckIds = new Set<string>();

      // Process driver documents
      for (const doc of driverDocs) {
        if (!doc.driverId || !doc.expiryDate || !doc.driver) continue;

        trackedDriverIds.add(doc.driverId);

        const expiryDate = new Date(doc.expiryDate);
        const isExpired = expiryDate < now;
        const isExpiringSoon = !isExpired && expiryDate <= thirtyDaysOut;

        if (isExpired || isExpiringSoon) {
          const msUntil = expiryDate.getTime() - now.getTime();
          const daysUntilExpiry = Math.ceil(msUntil / (1000 * 60 * 60 * 24));
          const driverName =
            [doc.driver.firstName, doc.driver.lastName].filter(Boolean).join(' ') || 'Unknown Driver';

          alerts.push({
            entityName: driverName,
            documentType: doc.documentType ?? 'Document',
            status: isExpired ? 'EXPIRED' : 'EXPIRING_SOON',
            daysUntilExpiry,
          });
        }
      }

      // Process truck documentMetadata
      for (const truck of trucks) {
        const parsed = documentMetadataSchema.safeParse(truck.documentMetadata);
        const meta = parsed.success ? parsed.data : null;
        const truckLabel = `${truck.year} ${truck.make} ${truck.model}`;

        trackedTruckIds.add(truck.id);

        const fields: Array<{ label: string; expiry: string | undefined | null }> = [
          { label: 'Registration', expiry: meta?.registrationExpiry },
          { label: 'Insurance', expiry: meta?.insuranceExpiry },
        ];

        for (const field of fields) {
          if (!field.expiry) continue;
          const expiryDate = new Date(field.expiry);
          if (isNaN(expiryDate.getTime())) continue;

          const isExpired = expiryDate < now;
          const isExpiringSoon = !isExpired && expiryDate <= thirtyDaysOut;

          if (isExpired || isExpiringSoon) {
            const msUntil = expiryDate.getTime() - now.getTime();
            const daysUntilExpiry = Math.ceil(msUntil / (1000 * 60 * 60 * 24));

            alerts.push({
              entityName: truckLabel,
              documentType: field.label,
              status: isExpired ? 'EXPIRED' : 'EXPIRING_SOON',
              daysUntilExpiry,
            });
          }
        }
      }

      // Sort alerts: EXPIRED first, then by daysUntilExpiry ascending
      alerts.sort((a, b) => {
        if (a.status === 'EXPIRED' && b.status !== 'EXPIRED') return -1;
        if (a.status !== 'EXPIRED' && b.status === 'EXPIRED') return 1;
        return (a.daysUntilExpiry ?? 0) - (b.daysUntilExpiry ?? 0);
      });

      const summary = {
        expiredCount: alerts.filter((a) => a.status === 'EXPIRED').length,
        expiringSoonCount: alerts.filter((a) => a.status === 'EXPIRING_SOON').length,
        totalDriversTracked: trackedDriverIds.size,
        totalTrucksTracked: trackedTruckIds.size,
      };

      return { summary, alerts };
    }, TX_OPTIONS);

    return NextResponse.json(result);
  } catch (err) {
    console.error('[mobile/owner/compliance] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
