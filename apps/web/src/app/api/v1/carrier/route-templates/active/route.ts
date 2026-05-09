import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { prisma } from '@/lib/db/prisma';

/**
 * GET /api/v1/carrier/route-templates/active
 *
 * Lightweight endpoint for the template dropdown in the dispatch create/edit form.
 * Returns active templates with stop previews for display.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const templates = await prisma.routeTemplate.findMany({
      where: { orgId, active: true },
      select: {
        id: true,
        templateName: true,
        scheduleType: true,
        recurrenceRule: true,
        recurrenceTimezone: true,
        scheduledDepartureTime: true,
        estimatedMiles: true,
        defaultDriverId: true,
        defaultTruckId: true,
        client: {
          select: { name: true },
        },
        stops: {
          orderBy: { sequenceOrder: 'asc' },
          select: {
            sequenceOrder: true,
            stopType: true,
            facilityId: true,
            facility: {
              select: { name: true, city: true, state: true },
            },
          },
        },
      },
      orderBy: { templateName: 'asc' },
    });

    return NextResponse.json({ data: templates });
  } catch (err) {
    logger.error('GET /api/v1/carrier/route-templates/active failed', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
