import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import { Prisma } from '@/generated/prisma';

interface DriverStatusItem {
  id: string;
  firstName: string;
  lastName: string;
  hosStatus: 'DRIVING' | 'ON_DUTY' | 'OFF_DUTY' | 'SLEEPER_BERTH' | null;
  dispatchId: string | null;
  dispatchNumber: string | null;
}

function extractDispatchNumber(notes: string | null | undefined, id: string): string {
  if (!notes) return id.slice(0, 8).toUpperCase();
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : id.slice(0, 8).toUpperCase();
}

/**
 * GET /api/v1/carrier/dashboard/drivers-status
 *
 * Returns active carrier drivers with their current HOS status and active dispatch info.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    // Fetch active drivers with their user info and current in-progress dispatch
    const tenantPrisma = await getTenantPrisma();
    const drivers = await tenantPrisma.carrierDriver.findMany({
      where: { orgId, status: 'active' },
      include: {
        user: { select: { id: true, firstName: true, lastName: true } },
        primaryDispatches: {
          where: { status: 'in_progress' },
          take: 1,
          orderBy: { scheduledDeparture: 'desc' },
          select: { id: true, notes: true },
        },
      },
    });

    if (drivers.length === 0) {
      return NextResponse.json([]);
    }

    // Collect user IDs for HOS lookup
    const userIds = drivers
      .map((d) => d.userId)
      .filter((id): id is string => id !== null);

    // Fetch latest HOS entry per user using DISTINCT ON
    let hosMap: Map<string, string> = new Map();
    if (userIds.length > 0) {
      type HosRow = { driverId: string; status: string };
      const hosRows = await prisma.$queryRaw<HosRow[]>(
        Prisma.sql`
          SELECT DISTINCT ON ("driverId") "driverId", status
          FROM "DriverHOSEntry"
          WHERE "driverId" = ANY(${userIds}::uuid[])
            AND "tenantId" = ${orgId}::uuid
          ORDER BY "driverId", "startTime" DESC
        `
      );
      hosMap = new Map(hosRows.map((r) => [r.driverId, r.status]));
    }

    const result: DriverStatusItem[] = drivers.map((d) => {
      const activeDispatch = d.primaryDispatches[0] ?? null;
      const rawHos = d.userId ? hosMap.get(d.userId) ?? null : null;
      const hosStatus = rawHos as DriverStatusItem['hosStatus'];

      return {
        id: d.id,
        firstName: d.firstName,
        lastName: d.lastName,
        hosStatus,
        dispatchId: activeDispatch?.id ?? null,
        dispatchNumber: activeDispatch
          ? extractDispatchNumber(activeDispatch.notes, activeDispatch.id)
          : null,
      };
    });

    return NextResponse.json(result);
  } catch (err) {
    logger.error('[/api/v1/carrier/dashboard/drivers-status] Failed to fetch drivers status:', err);
    return NextResponse.json({ error: 'Failed to fetch drivers status' }, { status: 500 });
  }
}
