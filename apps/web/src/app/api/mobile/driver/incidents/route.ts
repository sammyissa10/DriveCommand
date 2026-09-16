import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { TX_OPTIONS } from '@/lib/db/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import type { IncidentCategory, IncidentSeverity } from '@/generated/prisma';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

const VALID_CATEGORIES: IncidentCategory[] = ['ACCIDENT', 'VIOLATION', 'MECHANICAL', 'HAZARD', 'OTHER'];
const VALID_SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH'];

/**
 * GET /api/mobile/driver/incidents
 *
 * Returns paginated list of the driver's incidents, newest first.
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

  try {
    /*
     * quick-617: tenant-scoped client. /api/mobile/* sends no x-tenant-id
     * (DEC-11), so the header-reading getTenantPrisma() would throw —
     * getTenantPrismaForOrg takes validateMobileToken()'s verified
     * auth.tenantId. userId is deliberately NOT passed: it would drive the
     * audit-columns extension to start writing createdById/updatedById on
     * DriverIncident, a behaviour change this routing task declines to make
     * (this diverges from quick-588, which passes it — see 01-inventory.md §5).
     * Every where clause below is unchanged: RLS is the second layer, not a
     * replacement for the first.
     */
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    const incidents = await tenantPrisma.$transaction(async (tx) => {
      return tx.driverIncident.findMany({
        where: { driverId, tenantId },
        orderBy: { reportedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          category: true,
          severity: true,
          description: true,
          latitude: true,
          longitude: true,
          reportedAt: true,
        },
      });
    }, TX_OPTIONS);

    return NextResponse.json({ incidents });
  } catch (err) {
    logger.error('[mobile/driver/incidents GET] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/mobile/driver/incidents
 *
 * Creates a DriverIncident record for the authenticated driver.
 *
 * Body: { category, severity, description, latitude?, longitude?, photoS3Key? }
 *
 * Returns 201 with { incident: createdIncident }
 *
 * Requires: Authorization: Bearer <token> (DRIVER role)
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (!auth.driverId) {
    return NextResponse.json({ error: 'Forbidden — driver role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { driverId, tenantId } = auth;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { category, severity, description, latitude, longitude, photoS3Key } =
    body as Record<string, unknown>;

  // Validate category
  if (!category || !VALID_CATEGORIES.includes(category as IncidentCategory)) {
    return NextResponse.json(
      { error: `category must be one of: ${VALID_CATEGORIES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate severity
  if (!severity || !VALID_SEVERITIES.includes(severity as IncidentSeverity)) {
    return NextResponse.json(
      { error: `severity must be one of: ${VALID_SEVERITIES.join(', ')}` },
      { status: 400 }
    );
  }

  // Validate description
  if (
    typeof description !== 'string' ||
    description.length < 10 ||
    description.length > 500
  ) {
    return NextResponse.json(
      { error: 'description must be a string between 10 and 500 characters' },
      { status: 400 }
    );
  }

  // Validate optional lat/lng
  if (latitude !== undefined && latitude !== null && typeof latitude !== 'number') {
    return NextResponse.json({ error: 'latitude must be a number' }, { status: 400 });
  }
  if (longitude !== undefined && longitude !== null && typeof longitude !== 'number') {
    return NextResponse.json({ error: 'longitude must be a number' }, { status: 400 });
  }

  try {
    // quick-617: see the GET handler above for why getTenantPrismaForOrg and
    // why userId is omitted. The create's `data` is unchanged.
    const tenantPrisma = await getTenantPrismaForOrg(tenantId);
    const incident = await tenantPrisma.$transaction(async (tx) => {
      return tx.driverIncident.create({
        data: {
          tenantId,
          driverId,
          category: category as IncidentCategory,
          severity: severity as IncidentSeverity,
          description,
          latitude: latitude != null ? (latitude as number) : null,
          longitude: longitude != null ? (longitude as number) : null,
          photoS3Key: typeof photoS3Key === 'string' ? photoS3Key : null,
          reportedAt: new Date(),
        },
      });
    }, TX_OPTIONS);

    return NextResponse.json({ incident }, { status: 201 });
  } catch (err) {
    logger.error('[mobile/driver/incidents] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
