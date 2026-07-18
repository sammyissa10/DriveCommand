import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getTrip } from '@/lib/carrier/trips';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { hasPermission } from '@/lib/auth/permissions';
import { DispatchHeader } from '@/components/carrier/dispatches/DispatchHeader';
import { StopTimeline } from '@/components/carrier/dispatches/StopTimeline';
import { DispatchLoadsPanel } from '@/components/carrier/dispatches/DispatchLoadsPanel';
import { DispatchExpensesPanel } from '@/components/carrier/dispatches/DispatchExpensesPanel';
import { DispatchPayRecordsPanel } from '@/components/carrier/dispatches/DispatchPayRecordsPanel';
import { DispatchMessages } from '@/components/carrier/dispatches/DispatchMessages';
import { TripSuccessBanner } from '@/components/carrier/dispatches/TripSuccessBanner';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import { TripDetailMobile } from './TripDetailMobile';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DispatchDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const canManage = hasPermission(session.permissions ?? null, 'dispatches', session.role);

  const { id } = await params;
  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const [dispatch, dispatchAudit] = await Promise.all([
    getTrip(orgId, id),
    prisma.trip.findUnique({
      where: { id },
      select: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => null),
  ]);
  if (!dispatch) notFound();

  // Fetch route template details for recurring badge
  const routeTemplate = dispatch.routeTemplateId
    ? await prisma.routeTemplate.findFirst({
        where: { id: dispatch.routeTemplateId },
        select: {
          templateName: true,
          recurrenceRule: true,
          recurrenceTimezone: true,
          scheduledDepartureTime: true,
        },
      })
    : null;

  // Fetch facility names for all stops
  const facilityIds = [...new Set(dispatch.stops.map((s) => s.facilityId))];
  const facilities = facilityIds.length
    ? await prisma.carrierFacility.findMany({
        where: { id: { in: facilityIds }, orgId },
        select: { id: true, name: true, addressLine1: true, city: true, state: true },
      })
    : [];
  const facilityMap: Record<string, { name: string; addressLine1: string | null; city: string | null; state: string | null }> = {};
  for (const f of facilities) facilityMap[f.id] = f;

  // Fetch route template stops for BOL/POD requirements (if dispatch has a routeTemplateId)
  const routeTemplateStops = dispatch.routeTemplateId
    ? await prisma.routeTemplateStop.findMany({
        where: { routeTemplateId: dispatch.routeTemplateId },
        select: { sequenceOrder: true, bolRequired: true, podRequired: true },
      })
    : [];
  const routeTemplateStopMap: Record<number, { bolRequired: boolean; podRequired: boolean }> = {};
  for (const rts of routeTemplateStops) {
    routeTemplateStopMap[rts.sequenceOrder] = {
      bolRequired: rts.bolRequired,
      podRequired: rts.podRequired,
    };
  }

  // Fetch document counts per stop (BOL and POD)
  const stopIds = dispatch.stops.map((s) => s.id);
  const stopDocCounts: Record<string, { bolCount: number; podCount: number }> = {};
  if (stopIds.length) {
    const bolDocs = await prisma.carrierDocument.groupBy({
      by: ['stopId'],
      where: { stopId: { in: stopIds }, documentType: 'bol' },
      _count: { id: true },
    });
    const podDocs = await prisma.carrierDocument.groupBy({
      by: ['stopId'],
      where: { stopId: { in: stopIds }, documentType: 'pod' },
      _count: { id: true },
    });

    for (const stopId of stopIds) {
      const bolEntry = bolDocs.find((d) => d.stopId === stopId);
      const podEntry = podDocs.find((d) => d.stopId === stopId);
      stopDocCounts[stopId] = {
        bolCount: bolEntry?._count.id ?? 0,
        podCount: podEntry?._count.id ?? 0,
      };
    }
  }

  // Fetch message counts per stop
  const messageCountMap: Record<string, number> = {};
  if (stopIds.length) {
    const msgCounts = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.fleetMessage.groupBy({
        by: ['stopId'],
        where: { stopId: { in: stopIds }, tenantId: orgId },
        _count: { id: true },
      });
    }, TX_OPTIONS);
    for (const m of msgCounts) {
      if (m.stopId) messageCountMap[m.stopId] = m._count.id;
    }
  }

  // Fetch driver names and userId for messaging
  const driverIds = [
    dispatch.primaryDriverId,
    ...(dispatch.coDriverId ? [dispatch.coDriverId] : []),
  ];
  const drivers = await prisma.carrierDriver.findMany({
    where: { id: { in: driverIds }, orgId },
    select: { id: true, firstName: true, lastName: true, userId: true },
  });
  const driverMap: Record<string, string> = {};
  const driverUserIdMap: Record<string, string | null> = {};
  for (const d of drivers) {
    driverMap[d.id] = `${d.firstName} ${d.lastName}`;
    driverUserIdMap[d.id] = d.userId ?? null;
  }

  // Resolve primary driver's User ID for messaging
  const primaryDriverUserId = driverUserIdMap[dispatch.primaryDriverId] ?? null;

  // Fetch truck unit number and display name
  const truck = await prisma.carrierTruck.findFirst({
    where: { id: dispatch.truckId, orgId },
    select: { id: true, unitNumber: true, displayName: true },
  });

  // Every facility in the org — the mobile Stops tab picks from these when adding
  // a stop inline (desktop uses a search modal instead).
  const allFacilities = await prisma.carrierFacility.findMany({
    where: { orgId },
    select: { id: true, name: true, city: true, state: true },
    orderBy: { name: 'asc' },
  });

  // Fetch all active drivers and trucks for the expenses panel
  const [allDrivers, allTrucks] = await Promise.all([
    prisma.carrierDriver.findMany({
      where: { orgId, status: 'active' },
      select: { id: true, firstName: true, lastName: true },
      orderBy: { lastName: 'asc' },
    }),
    prisma.carrierTruck.findMany({
      where: { orgId, status: 'active' },
      select: { id: true, unitNumber: true, displayName: true },
      orderBy: { unitNumber: 'asc' },
    }),
  ]);
  const driversForPanels = allDrivers.map((d) => ({
    id: d.id,
    name: `${d.firstName} ${d.lastName}`,
  }));
  const trucksForAttach = allTrucks.map((t) => ({
    id: t.id,
    unitNumber: t.displayName || t.unitNumber,
  }));

  const driverName = driverMap[dispatch.primaryDriverId] ?? 'Unknown Driver';
  const coDriverName = dispatch.coDriverId ? (driverMap[dispatch.coDriverId] ?? '') : '';
  const truckUnit = truck?.displayName || truck?.unitNumber || '—';

  const allStopsDone =
    dispatch.stops.length > 0 &&
    dispatch.stops.every((s) => s.status === 'completed' || s.status === 'skipped');

  // Serialize Decimal fields for client components
  const serializedDispatch = {
    ...dispatch,
    plannedMiles: dispatch.plannedMiles != null ? Number(dispatch.plannedMiles) : null,
    actualMiles: dispatch.actualMiles != null ? Number(dispatch.actualMiles) : null,
    stops: dispatch.stops.map((s) => ({
      ...s,
      weightLbs: s.weightLbs != null ? Number(s.weightLbs) : null,
      appointmentStart: s.appointmentStart?.toISOString() ?? null,
      appointmentEnd: s.appointmentEnd?.toISOString() ?? null,
      arrivedAt: s.arrivedAt?.toISOString() ?? null,
      departedAt: s.departedAt?.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
    })),
    carrierLoads: dispatch.carrierLoads.map((l) => ({
      ...l,
      rateAmount: l.rateAmount != null ? Number(l.rateAmount) : null,
      carrierCost: l.carrierCost != null ? Number(l.carrierCost) : null,
      fuelSurcharge: l.fuelSurcharge != null ? Number(l.fuelSurcharge) : null,
      detentionAmount: l.detentionAmount != null ? Number(l.detentionAmount) : null,
      otherCharges: l.otherCharges != null ? Number(l.otherCharges) : null,
      totalRevenue: l.totalRevenue != null ? Number(l.totalRevenue) : null,
      commodityWeightLbs: l.commodityWeightLbs != null ? Number(l.commodityWeightLbs) : null,
      totalMiles: l.totalMiles != null ? Number(l.totalMiles) : null,
      loadedMiles: l.loadedMiles != null ? Number(l.loadedMiles) : null,
      createdAt: l.createdAt.toISOString(),
      updatedAt: l.updatedAt.toISOString(),
    })),
    expenses: dispatch.expenses.map((e) => ({
      ...e,
      amount: Number(e.amount),
      approvedAt: e.approvedAt?.toISOString() ?? null,
      submittedAt: e.submittedAt?.toISOString() ?? null,
      createdAt: e.createdAt.toISOString(),
    })),
    driverPayRecords: dispatch.driverPayRecords.map((r) => ({
      ...r,
      loadedRate: r.loadedRate != null ? Number(r.loadedRate) : null,
      emptyRate: r.emptyRate != null ? Number(r.emptyRate) : null,
      hoursWorked: r.hoursWorked != null ? Number(r.hoursWorked) : null,
      hourlyRate: r.hourlyRate != null ? Number(r.hourlyRate) : null,
      grossRevenue: r.grossRevenue != null ? Number(r.grossRevenue) : null,
      percentageApplied: r.percentageApplied != null ? Number(r.percentageApplied) : null,
      flatAmount: r.flatAmount != null ? Number(r.flatAmount) : null,
      basePay: Number(r.basePay),
      bonuses: Number(r.bonuses),
      tips: Number(r.tips),
      deductions: Number(r.deductions),
      reimbursements: Number(r.reimbursements),
      netPay: Number(r.netPay),
      payPeriodStart: r.payPeriodStart?.toISOString() ?? null,
      payPeriodEnd: r.payPeriodEnd?.toISOString() ?? null,
      approvedAt: r.approvedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    scheduledDeparture: dispatch.scheduledDeparture.toISOString(),
    scheduledArrival: dispatch.scheduledArrival?.toISOString() ?? null,
    actualDeparture: dispatch.actualDeparture?.toISOString() ?? null,
    actualArrival: dispatch.actualArrival?.toISOString() ?? null,
    createdAt: dispatch.createdAt.toISOString(),
    updatedAt: dispatch.updatedAt.toISOString(),
  };

  // Load options for the per-stop "For Load" picker + badge — only loads on THIS trip
  const stopLoads = serializedDispatch.carrierLoads.map((l) => ({
    id: l.id,
    referenceNumber: l.referenceNumber,
    clientName: l.client?.name ?? 'Unknown',
  }));

  // Extract dispatch number from notes
  const dispatchNumberMatch = dispatch.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
  const dispatchNumber = dispatchNumberMatch ? dispatchNumberMatch[1] : `DC-${id.slice(0, 8)}`;

  return (
    <>
      {/* Mobile-web design system — rendered below lg; desktop keeps its own layout */}
      <div className="lg:hidden -m-4">
        <TripDetailMobile
          trip={{
            id: dispatch.id,
            status: dispatch.status,
            notes: dispatch.notes,
            primaryDriverId: dispatch.primaryDriverId,
            coDriverId: dispatch.coDriverId ?? null,
            truckId: dispatch.truckId,
            plannedMiles: serializedDispatch.plannedMiles,
            actualMiles: serializedDispatch.actualMiles,
            scheduledDeparture: serializedDispatch.scheduledDeparture,
            routeTemplateId: dispatch.routeTemplateId ?? null,
            routeTemplateName: routeTemplate?.templateName ?? null,
            routeTemplateRecurrenceRule: routeTemplate?.recurrenceRule ?? null,
            routeTemplateRecurrenceTimezone: routeTemplate?.recurrenceTimezone ?? null,
            routeTemplateScheduledDepartureTime: routeTemplate?.scheduledDepartureTime ?? null,
          }}
          driverName={driverName}
          coDriverName={coDriverName}
          truckUnit={truckUnit}
          allStopsDone={allStopsDone}
          allDrivers={driversForPanels}
          allTrucks={trucksForAttach}
          stops={serializedDispatch.stops}
          facilityMap={facilityMap}
          facilities={allFacilities}
          routeTemplateStopMap={routeTemplateStopMap}
          stopDocCounts={stopDocCounts}
          canManage={canManage}
          loads={stopLoads}
        />
      </div>

      {/* Desktop */}
      <div className="hidden lg:block space-y-6">
      {/* Success Banner - shown after adding a load to trip */}
      <TripSuccessBanner
        dispatchId={dispatch.id}
        dispatchNumber={dispatchNumber}
        dispatchStatus={dispatch.status}
        hasStops={dispatch.stops.length > 0}
        driverName={driverName}
        driverUserId={primaryDriverUserId}
      />

      {/* Back link */}
      <div>
        <Link
          href="/carrier/trips"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Trips
        </Link>
      </div>

      {/* Header */}
      <DispatchHeader
        dispatch={{
          ...serializedDispatch,
          routeTemplateId: dispatch.routeTemplateId ?? null,
          routeTemplateName: routeTemplate?.templateName ?? null,
          routeTemplateRecurrenceRule: routeTemplate?.recurrenceRule ?? null,
          routeTemplateRecurrenceTimezone: routeTemplate?.recurrenceTimezone ?? null,
          routeTemplateScheduledDepartureTime: routeTemplate?.scheduledDepartureTime ?? null,
        }}
        driverName={driverName}
        coDriverName={coDriverName}
        truckUnit={truckUnit}
        allStopsDone={allStopsDone}
        allDrivers={driversForPanels}
        allTrucks={trucksForAttach}
      />

      {/* Stop Timeline */}
      <div id="stop-timeline">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-foreground">Stop Timeline</h2>
          <Link
            href={`/carrier/trips/${id}/stops`}
            className="text-sm text-primary hover:underline flex items-center gap-1"
          >
            View All Stops <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        <StopTimeline
          stops={serializedDispatch.stops}
          routeTemplateStopMap={routeTemplateStopMap}
          stopDocCounts={stopDocCounts}
          facilityMap={facilityMap}
          dispatchId={dispatch.id}
          dispatchStatus={dispatch.status}
          userRole={session.role}
          canManage={canManage}
          messageCountMap={messageCountMap}
          loads={stopLoads}
        />
      </div>

      {/* Bottom panels grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <DispatchLoadsPanel
          loads={serializedDispatch.carrierLoads}
          dispatchId={dispatch.id}
          dispatchStatus={dispatch.status}
        />
        <DispatchExpensesPanel
          expenses={serializedDispatch.expenses}
          dispatchId={dispatch.id}
          drivers={driversForPanels}
        />
      </div>

      {/* Pay records — only for completed dispatches */}
      {dispatch.status === 'completed' && (
        <DispatchPayRecordsPanel
          payRecords={serializedDispatch.driverPayRecords}
          drivers={driversForPanels}
          dispatchStatus={dispatch.status}
        />
      )}

      {/* Messages */}
      <DispatchMessages
        dispatchId={dispatch.id}
        driverUserId={primaryDriverUserId}
      />

      {dispatchAudit && (
        <AuditTrailFooter
          createdAt={dispatchAudit.createdAt}
          createdByName={dispatchAudit.createdBy ? `${dispatchAudit.createdBy.firstName ?? ''} ${dispatchAudit.createdBy.lastName ?? ''}`.trim() || null : null}
          createdByEmail={dispatchAudit.createdBy?.email ?? null}
          updatedAt={dispatchAudit.updatedAt}
          updatedByName={dispatchAudit.updatedBy ? `${dispatchAudit.updatedBy.firstName ?? ''} ${dispatchAudit.updatedBy.lastName ?? ''}`.trim() || null : null}
          updatedByEmail={dispatchAudit.updatedBy?.email ?? null}
        />
      )}
      </div>
    </>
  );
}
