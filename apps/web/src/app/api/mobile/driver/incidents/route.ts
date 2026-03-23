import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import type { IncidentCategory, IncidentSeverity } from '@/generated/prisma';

const VALID_CATEGORIES: IncidentCategory[] = ['ACCIDENT', 'VIOLATION', 'MECHANICAL', 'HAZARD', 'OTHER'];
const VALID_SEVERITIES: IncidentSeverity[] = ['LOW', 'MEDIUM', 'HIGH'];

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
    const incident = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

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
    console.error('[mobile/driver/incidents] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
