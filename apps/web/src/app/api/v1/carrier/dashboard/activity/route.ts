import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';

interface ActivityItem {
  type: string;
  description: string;
  timestamp: string;
  href: string;
}

function extractDispatchNumber(notes: string | null | undefined, id: string): string {
  if (!notes) return id.slice(0, 8).toUpperCase();
  const match = notes.match(/\[DISPATCH_NUMBER=([^\]]+)\]/);
  return match ? match[1] : id.slice(0, 8).toUpperCase();
}

/**
 * GET /api/v1/carrier/dashboard/activity
 *
 * Returns last 15 activity items merged from 6 data sources over the last 7 days.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const tenantPrisma = await getTenantPrismaForOrg(orgId, session.userId);
    const [
      updatedDispatches,
      completedStops,
      newLoads,
      payRecords,
      uploadedDocs,
      newDispatches,
    ] = await Promise.all([
      // 1. Dispatch status changes (recently updated, not planned)
      tenantPrisma.trip.findMany({
        where: {
          orgId,
          updatedAt: { gte: sevenDaysAgo },
          status: { not: 'planned' },
        },
        orderBy: { updatedAt: 'desc' },
        take: 15,
        select: { id: true, status: true, notes: true, updatedAt: true },
      }),
      // 2. Completed stops
      tenantPrisma.carrierStop.findMany({
        where: {
          dispatch: { orgId },
          status: 'completed',
          departedAt: { gte: sevenDaysAgo },
        },
        orderBy: { departedAt: 'desc' },
        take: 15,
        include: {
          dispatch: {
            select: {
              id: true,
              primaryDriver: { select: { firstName: true } },
            },
          },
          facility: { select: { name: true } },
        },
      }),
      // 3. New loads
      tenantPrisma.carrierLoad.findMany({
        where: { orgId, createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { client: { select: { name: true } } },
      }),
      // 4. Pay records created
      tenantPrisma.driverPayRecord.findMany({
        where: { orgId, createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: { driver: { select: { firstName: true, lastName: true } } },
      }),
      // 5. Documents uploaded (carrier documents linked to a dispatch in org)
      tenantPrisma.carrierDocument.findMany({
        where: {
          dispatch: { orgId },
          createdAt: { gte: sevenDaysAgo },
        },
        orderBy: { createdAt: 'desc' },
        take: 15,
        include: {
          uploader: { select: { firstName: true } },
        },
      }),
      // 6. New dispatches created
      tenantPrisma.trip.findMany({
        where: { orgId, createdAt: { gte: sevenDaysAgo } },
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { id: true, notes: true, scheduledDeparture: true, createdAt: true },
      }),
    ]);

    const items: ActivityItem[] = [];

    // 1. Dispatch status changes
    for (const d of updatedDispatches) {
      const num = extractDispatchNumber(d.notes, d.id);
      const statusLabel = d.status.replace(/_/g, ' ');
      items.push({
        type: 'dispatch_update',
        description: `${num} moved to ${statusLabel}`,
        timestamp: d.updatedAt.toISOString(),
        href: `/carrier/dispatches/${d.id}`,
      });
    }

    // 2. Completed stops
    for (const s of completedStops) {
      const driverName = s.dispatch.primaryDriver?.firstName ?? 'Driver';
      const facilityName = s.facility?.name ?? 'facility';
      items.push({
        type: 'stop_completed',
        description: `${driverName} completed ${s.stopType} at ${facilityName}`,
        timestamp: (s.departedAt ?? s.createdAt).toISOString(),
        href: `/carrier/dispatches/${s.dispatchId}`,
      });
    }

    // 3. New loads
    for (const l of newLoads) {
      const ref = l.referenceNumber ?? l.id.slice(0, 8).toUpperCase();
      const clientName = l.client?.name ?? 'client';
      items.push({
        type: 'new_load',
        description: `Load ${ref} created for ${clientName}`,
        timestamp: l.createdAt.toISOString(),
        href: `/carrier/loads/${l.id}`,
      });
    }

    // 4. Pay records
    for (const p of payRecords) {
      const driverName = p.driver
        ? `${p.driver.firstName} ${p.driver.lastName}`.trim()
        : 'driver';
      items.push({
        type: 'pay_record',
        description: `Pay record generated for ${driverName}`,
        timestamp: p.createdAt.toISOString(),
        href: `/carrier/reports/driver-pay`,
      });
    }

    // 5. Documents uploaded
    for (const doc of uploadedDocs) {
      const uploaderName = doc.uploader?.firstName ?? 'Someone';
      items.push({
        type: 'document_uploaded',
        description: `${uploaderName} uploaded ${doc.documentType}`,
        timestamp: doc.createdAt.toISOString(),
        href: doc.dispatchId ? `/carrier/dispatches/${doc.dispatchId}` : '#',
      });
    }

    // 6. New dispatches
    for (const d of newDispatches) {
      const num = extractDispatchNumber(d.notes, d.id);
      const depDate = d.scheduledDeparture.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
      });
      items.push({
        type: 'new_dispatch',
        description: `${num} scheduled for ${depDate}`,
        timestamp: d.createdAt.toISOString(),
        href: `/carrier/dispatches/${d.id}`,
      });
    }

    // Sort by timestamp DESC, take first 15
    items.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
    const top15 = items.slice(0, 15);

    return NextResponse.json(top15);
  } catch (err) {
    logger.error('[/api/v1/carrier/dashboard/activity] Failed to fetch activity:', err);
    return NextResponse.json({ error: 'Failed to fetch activity' }, { status: 500 });
  }
}
