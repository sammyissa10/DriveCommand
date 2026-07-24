import { notFound } from 'next/navigation';
import { getRoute } from '@/app/(owner)/actions/routes';
import { listDocuments } from '@/app/(owner)/actions/documents';
import { listExpenses, listExpenseCategories } from '@/app/(owner)/actions/expenses';
import { listPayments } from '@/app/(owner)/actions/payments';
import { listTemplates } from '@/app/(owner)/actions/expense-templates';
import { getRouteFinancialAnalytics } from '@/app/(owner)/actions/route-analytics';
import { formatDateInTenantTimezone } from '@/lib/utils/date';
import { listRouteAssignableDrivers } from '@/lib/routes/assignable-drivers';
import { listCarrierTrucks } from '@/lib/carrier/fleet-trucks';
import { listDriverRouteJoinsByRoute } from '@/app/(owner)/actions/driver-route-joins';
import { getRouteMessages } from '@/app/(owner)/actions/fleet-messages';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { RoutePageClient } from './route-page-client';
import { logger } from '@/lib/logger';
import { AuditTrailFooter } from '@/components/audit-trail-footer';

interface RouteDetailPageProps {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function RouteDetailPage({
  params,
  searchParams,
}: RouteDetailPageProps) {
  const { id } = await params;
  const { mode } = await searchParams;
  const isEditMode = mode === 'edit';

  // Run all fetches in parallel — every query only needs `id` from params,
  // so there is no reason to await getRoute() first and then fan out.
  // If the route is missing (null), notFound() is called after the parallel fetch.
  const prisma = await getTenantPrisma();
  const orgId = await requireTenantId();

  const [
    route,
    documents,
    expenses,
    payments,
    categories,
    templates,
    analytics,
    drivers,
    trucks,
    driverAssignments,
    messages,
    linkedLoads,
  ] = await Promise.all([
    getRoute(id).catch((err: unknown) => {
      logger.error('[routes/[id]] getRoute failed:', err);
      return null;
    }),
    listDocuments('route', id).catch((err) => {
      logger.error('Failed to load route documents:', err);
      return [] as any[];
    }),
    listExpenses(id).catch((err) => {
      logger.error('Failed to load route expenses:', err);
      return [] as any[];
    }),
    listPayments(id).catch((err) => {
      logger.error('Failed to load route payments:', err);
      return [] as any[];
    }),
    listExpenseCategories().catch(() => [] as any[]),
    listTemplates().catch(() => [] as any[]),
    getRouteFinancialAnalytics(id).catch((err) => {
      logger.error('Failed to load route analytics:', err);
      return null;
    }),
    // Always fetch drivers and trucks — edit mode switches client-side (replaceState),
    // so a conditional server fetch would leave the dropdowns empty when the user
    // clicks "Edit Route" without a ?mode=edit in the initial URL.
    //
    // TKT-0084: sourced from the same full-roster helper as /routes/new so this list is
    // never narrower. `route` isn't resolved yet inside this Promise.all, so the
    // currently-assigned driver is preserved via the existing post-fetch merge below
    // (assignedIds/missingIds) rather than via listRouteAssignableDrivers' includeUserIds.
    // Only assignable rows are kept here — the edit form doesn't render blocked/pending
    // options, it only needs to guarantee the already-assigned driver is never dropped.
    listRouteAssignableDrivers(orgId)
      .then((rows) =>
        rows
          .filter((d) => d.assignable && d.id)
          // assignable implies a linked User, and User.email is non-nullable in schema —
          // safe to narrow here rather than propagate `string | null` downstream.
          .map((d) => ({ id: d.id as string, firstName: d.firstName, lastName: d.lastName, email: d.email as string }))
      )
      .catch((err) => {
        logger.error('Failed to load drivers for route edit:', err);
        return [] as any[];
      }),
    listCarrierTrucks(orgId)
      .then((r) => r.items)
      .catch((err) => {
        logger.error('Failed to load trucks for route edit:', err);
        return [] as any[];
      }),
    listDriverRouteJoinsByRoute(id).catch(() => [] as any[]),
    getRouteMessages(id).catch(() => [] as any[]),
    prisma.load.findMany({
      where: { routeId: id },
      select: {
        id: true,
        loadNumber: true,
        origin: true,
        destination: true,
        status: true,
        rate: true,
        pickupDate: true,
        sequence: true,
        customer: { select: { companyName: true } },
      },
      orderBy: [{ sequence: 'asc' }, { pickupDate: 'asc' }],
    }).then((loads) =>
      loads.map((l) => ({ ...l, rate: l.rate.toNumber() }))
    ).catch(() => [] as any[]),
  ]);

  if (!route) {
    notFound();
  }

  const safeAnalytics = analytics ?? {
    financials: {
      totalExpenses: '0.00',
      totalRevenue: '0.00',
      totalPaidRevenue: '0.00',
      totalPendingRevenue: '0.00',
      profit: '0.00',
      marginPercent: 0,
      isLowMargin: false,
      loadRevenue: '0.00',
      loadCount: 0,
    },
    costPerMile: { costPerMile: null, miles: null },
    fleetAverage: { costPerMile: null, routeCount: 0 },
    comparison: { comparison: 'unknown' as const, difference: null, differencePercent: null },
    profitMarginThreshold: 10,
  };

  // Format dates in tenant timezone (hardcode UTC for v1)
  const formattedScheduledDate = formatDateInTenantTimezone(
    route.scheduledDate,
    'UTC'
  );
  const formattedCompletedAt = route.completedAt
    ? formatDateInTenantTimezone(route.completedAt, 'UTC')
    : undefined;

  // Prisma Decimals can't cross the Server→Client boundary into RoutePageClient.
  // Convert the leaking fields: stop lat/lng, expense/payment amounts, and the
  // driver-assignment rate fields.
  const rawStops = (route as any).stops;
  const serializedRoute = {
    ...route,
    ...(Array.isArray(rawStops)
      ? {
          stops: rawStops.map((s: any) => ({
            ...s,
            lat: s.lat == null ? null : Number(s.lat),
            lng: s.lng == null ? null : Number(s.lng),
          })),
        }
      : {}),
  };
  const serializedExpenses = expenses.map((e: any) => ({ ...e, amount: Number(e.amount) }));
  const serializedPayments = payments.map((p: any) => ({ ...p, amount: Number(p.amount) }));
  const serializedDriverAssignments = driverAssignments.map((d: any) => ({
    ...d,
    fixedAmount: d.fixedAmount == null ? null : Number(d.fixedAmount),
    hourlyRate: d.hourlyRate == null ? null : Number(d.hourlyRate),
    numberOfHours: d.numberOfHours == null ? null : Number(d.numberOfHours),
    perMileRate: d.perMileRate == null ? null : Number(d.perMileRate),
    numberOfMiles: d.numberOfMiles == null ? null : Number(d.numberOfMiles),
  }));

  // Preserve already-assigned primary/co-drivers even if now deactivated —
  // the active-only picker source would otherwise drop an existing selection.
  const assignedIds = new Set<string>();
  if (route.driverId) assignedIds.add(route.driverId);
  for (const a of driverAssignments as Array<{ driverId?: string | null; driver?: { id?: string | null } }>) {
    const cid = a.driverId ?? a.driver?.id;
    if (cid) assignedIds.add(cid);
  }
  const presentIds = new Set(drivers.map((d: { id: string }) => d.id));
  const missingIds = [...assignedIds].filter((id) => !presentIds.has(id));
  let mergedDrivers = drivers;
  if (missingIds.length > 0) {
    const extra = await prisma.user
      .findMany({ where: { id: { in: missingIds }, role: 'DRIVER' } })
      .catch((err) => {
        logger.error('Failed to load already-assigned inactive drivers for route edit:', err);
        return [] as typeof drivers;
      });
    mergedDrivers = [...drivers, ...extra];
  }

  // listRouteAssignableDrivers() (assignable rows only) already returns DRIVER-role
  // User records whose `id` is the correct Route.driverId FK value — pass straight
  // through, no userId indirection needed.
  const driversForEdit = mergedDrivers.map(
    (d: { id: string; firstName: string | null; lastName: string | null; email: string }) => ({
      id: d.id,
      firstName: d.firstName,
      lastName: d.lastName,
      email: d.email,
    })
  );

  return (
    <div className="space-y-6">
      <RoutePageClient
        route={serializedRoute}
        initialEditMode={isEditMode}
        drivers={driversForEdit}
        trucks={trucks}
        formattedScheduledDate={formattedScheduledDate}
        formattedCompletedAt={formattedCompletedAt}
        analytics={safeAnalytics}
        expenses={serializedExpenses}
        payments={serializedPayments}
        categories={categories}
        templates={templates}
        documents={documents}
        driverAssignments={serializedDriverAssignments}
        messages={messages}
        linkedLoads={linkedLoads}
      />

      <AuditTrailFooter
        createdAt={route.createdAt}
        createdByName={route.createdBy ? `${route.createdBy.firstName ?? ''} ${route.createdBy.lastName ?? ''}`.trim() || null : null}
        createdByEmail={route.createdBy?.email ?? null}
        updatedAt={route.updatedAt}
        updatedByName={route.updatedBy ? `${route.updatedBy.firstName ?? ''} ${route.updatedBy.lastName ?? ''}`.trim() || null : null}
        updatedByEmail={route.updatedBy?.email ?? null}
      />
    </div>
  );
}
