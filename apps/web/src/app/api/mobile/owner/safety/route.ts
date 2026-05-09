import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { documentMetadataSchema } from '@drivecommand/validation';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

interface SafetyAlert {
  severity: 'high' | 'medium' | 'low';
  category: 'DOCUMENT' | 'MAINTENANCE' | 'INCIDENT';
  description: string;
  affectedEntity: string;
  date: string;
}

const SEVERITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/**
 * GET /api/mobile/owner/safety
 *
 * Returns aggregated safety alerts for the authenticated owner's tenant.
 * Aggregates from 3 sources:
 *   1. Expired / expiring documents (driver docs + truck metadata)
 *   2. Overdue scheduled maintenance services
 *   3. Driver incidents in the last 30 days
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
     * SAFETY: Gated by validateMobileToken() above. tenantId comes from the verified JWT.
     */
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const now = new Date();
      const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      // Run all 3 queries in parallel
      const [driverDocs, trucks, scheduledServices, incidents] = await Promise.all([
        // 1. Driver documents with expiry
        tx.document.findMany({
          where: {
            tenantId,
            driverId: { not: null },
            expiryDate: { not: null, lte: thirtyDaysOut },
          },
          select: {
            documentType: true,
            expiryDate: true,
            driver: { select: { firstName: true, lastName: true } },
          },
          orderBy: { expiryDate: 'asc' },
          take: 200,
        }),

        // Trucks for document metadata check
        tx.truck.findMany({
          where: { tenantId, archivedAt: null },
          select: {
            id: true,
            make: true,
            model: true,
            year: true,
            documentMetadata: true,
            odometer: true,
            scheduledServices: {
              where: { isCompleted: false },
              select: {
                id: true,
                serviceType: true,
                intervalDays: true,
                intervalMiles: true,
                baselineDate: true,
                baselineOdometer: true,
              },
            },
          },
        }),

        // Overdue scheduled services (fetched via trucks above, included for clarity — we process inline)
        Promise.resolve(null),

        // 3. Recent driver incidents (last 30 days)
        tx.driverIncident.findMany({
          where: {
            tenantId,
            reportedAt: { gte: thirtyDaysAgo },
          },
          select: {
            severity: true,
            description: true,
            reportedAt: true,
            driver: { select: { firstName: true, lastName: true } },
          },
          orderBy: { reportedAt: 'desc' },
          take: 100,
        }),
      ]);

      void scheduledServices; // included only for explicitness above

      const alerts: SafetyAlert[] = [];

      // --- Source 1: Driver documents ---
      for (const doc of driverDocs) {
        if (!doc.expiryDate || !doc.driver) continue;
        const expiryDate = new Date(doc.expiryDate);
        const isExpired = expiryDate < now;

        const driverName =
          [doc.driver.firstName, doc.driver.lastName].filter(Boolean).join(' ') || 'Unknown Driver';
        const docType = doc.documentType ?? 'Document';

        let description: string;
        if (isExpired) {
          description = `${docType} for ${driverName} expired`;
        } else {
          const msUntil = expiryDate.getTime() - now.getTime();
          const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24));
          description = `${docType} for ${driverName} expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
        }

        alerts.push({
          severity: isExpired ? 'high' : 'medium',
          category: 'DOCUMENT',
          description,
          affectedEntity: driverName,
          date: expiryDate.toISOString(),
        });
      }

      // --- Source 1b: Truck document metadata (registration/insurance) ---
      for (const truck of trucks) {
        const parsed = documentMetadataSchema.safeParse(truck.documentMetadata);
        const meta = parsed.success ? parsed.data : null;
        const truckLabel = `${truck.year} ${truck.make} ${truck.model}`;

        const fields: Array<{ label: string; expiry: string | undefined | null }> = [
          { label: 'Registration', expiry: meta?.registrationExpiry },
          { label: 'Insurance', expiry: meta?.insuranceExpiry },
        ];

        for (const field of fields) {
          if (!field.expiry) continue;
          const expiryDate = new Date(field.expiry);
          if (isNaN(expiryDate.getTime())) continue;
          if (expiryDate > thirtyDaysOut) continue; // Not expiring soon enough

          const isExpired = expiryDate < now;

          let description: string;
          if (isExpired) {
            description = `${field.label} for ${truckLabel} expired`;
          } else {
            const msUntil = expiryDate.getTime() - now.getTime();
            const daysUntil = Math.ceil(msUntil / (1000 * 60 * 60 * 24));
            description = `${field.label} for ${truckLabel} expires in ${daysUntil} day${daysUntil !== 1 ? 's' : ''}`;
          }

          alerts.push({
            severity: isExpired ? 'high' : 'medium',
            category: 'DOCUMENT',
            description,
            affectedEntity: truckLabel,
            date: expiryDate.toISOString(),
          });
        }

        // --- Source 2: Overdue scheduled services per truck ---
        for (const svc of truck.scheduledServices) {
          const truckOdometer = truck.odometer;
          let isOverdue = false;
          let dueDate: Date = now;

          if (svc.intervalDays != null) {
            const baseDateMs = new Date(svc.baselineDate).getTime();
            const dueDateMs = baseDateMs + svc.intervalDays * 24 * 60 * 60 * 1000;
            dueDate = new Date(dueDateMs);
            if (dueDate < now) isOverdue = true;
          }

          if (!isOverdue && svc.intervalMiles != null) {
            const dueMiles = svc.baselineOdometer + svc.intervalMiles;
            if (truckOdometer >= dueMiles) {
              isOverdue = true;
              // Estimate a due date based on when mileage was reached (use baseline date as proxy)
              dueDate = new Date(svc.baselineDate);
            }
          }

          if (!isOverdue) continue;

          alerts.push({
            severity: 'medium',
            category: 'MAINTENANCE',
            description: `${svc.serviceType} overdue for ${truckLabel}`,
            affectedEntity: truckLabel,
            date: dueDate.toISOString(),
          });
        }
      }

      // --- Source 3: Driver incidents ---
      for (const incident of incidents) {
        const driverName = incident.driver
          ? [incident.driver.firstName, incident.driver.lastName].filter(Boolean).join(' ') || 'Unknown Driver'
          : 'Unknown Driver';

        const severityStr = String(incident.severity).toUpperCase();
        const severity: 'high' | 'medium' | 'low' =
          severityStr === 'HIGH' ? 'high' : severityStr === 'LOW' ? 'low' : 'medium';

        alerts.push({
          severity,
          category: 'INCIDENT',
          description: incident.description,
          affectedEntity: driverName,
          date: incident.reportedAt.toISOString(),
        });
      }

      // Sort: high → medium → low, within same severity: most recent first
      alerts.sort((a, b) => {
        const severityDiff = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (severityDiff !== 0) return severityDiff;
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });

      const summary = {
        highCount: alerts.filter((a) => a.severity === 'high').length,
        mediumCount: alerts.filter((a) => a.severity === 'medium').length,
        lowCount: alerts.filter((a) => a.severity === 'low').length,
        totalCount: alerts.length,
      };

      return { alerts, summary };
    }, TX_OPTIONS);

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[mobile/owner/safety GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
