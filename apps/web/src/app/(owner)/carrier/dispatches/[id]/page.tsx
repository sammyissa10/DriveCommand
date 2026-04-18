import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getDispatch } from '@/lib/carrier/dispatches';
import { prisma } from '@/lib/db/prisma';
import { DispatchHeader } from '@/components/carrier/dispatches/DispatchHeader';
import { StopTimeline } from '@/components/carrier/dispatches/StopTimeline';
import { DispatchLoadsPanel } from '@/components/carrier/dispatches/DispatchLoadsPanel';
import { DispatchExpensesPanel } from '@/components/carrier/dispatches/DispatchExpensesPanel';
import { DispatchPayRecordsPanel } from '@/components/carrier/dispatches/DispatchPayRecordsPanel';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function DispatchDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const dispatch = await getDispatch(orgId, id);
  if (!dispatch) notFound();

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

  // Fetch driver names
  const driverIds = [
    dispatch.primaryDriverId,
    ...(dispatch.coDriverId ? [dispatch.coDriverId] : []),
  ];
  const drivers = await prisma.carrierDriver.findMany({
    where: { id: { in: driverIds }, orgId },
    select: { id: true, firstName: true, lastName: true },
  });
  const driverMap: Record<string, string> = {};
  for (const d of drivers) driverMap[d.id] = `${d.firstName} ${d.lastName}`;

  // Fetch truck unit number and display name
  const truck = await prisma.carrierTruck.findFirst({
    where: { id: dispatch.truckId, orgId },
    select: { id: true, unitNumber: true, displayName: true },
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

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link
          href="/carrier/dispatches"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Dispatches
        </Link>
      </div>

      {/* Header */}
      <DispatchHeader
        dispatch={serializedDispatch}
        driverName={driverName}
        coDriverName={coDriverName}
        truckUnit={truckUnit}
        allStopsDone={allStopsDone}
        allDrivers={driversForPanels}
        allTrucks={trucksForAttach}
      />

      {/* Stop Timeline */}
      <div>
        <h2 className="text-lg font-semibold text-foreground mb-4">Stop Timeline</h2>
        <StopTimeline
          stops={serializedDispatch.stops}
          routeTemplateStopMap={routeTemplateStopMap}
          stopDocCounts={stopDocCounts}
          facilityMap={facilityMap}
          dispatchStatus={dispatch.status}
          userRole={session.role}
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
    </div>
  );
}
