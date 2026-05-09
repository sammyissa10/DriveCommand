import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { getLoad } from '@/lib/carrier/loads';
import type { StopInput } from '@/lib/carrier/loads';
import { LoadForm } from '@/components/carrier/loads/LoadForm';
import type { LoadData } from '@/components/carrier/loads/LoadForm';
import type { StopBuilderStop } from '@/components/carrier/stops/StopBuilder';
import { LoadDetailActions } from '@/components/carrier/loads/LoadDetailActions';

interface LoadDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LoadDetailPage({ params }: LoadDetailPageProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const { id } = await params;

  const [load, clients, rawDrivers, rawTrucks] = await Promise.all([
    getLoad(orgId, id),
    prisma.carrierClient.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.carrierDriver.findMany({
      where: { orgId, status: 'active' },
      select: { id: true, firstName: true, lastName: true, status: true },
      orderBy: { lastName: 'asc' },
    }),
    prisma.carrierTruck.findMany({
      where: { orgId, status: 'active' },
      select: { id: true, unitNumber: true, make: true, model: true },
      orderBy: { unitNumber: 'asc' },
    }),
  ]);

  if (!load) notFound();

  // If no stops found via loadId but load is on a dispatch, check for stops
  // that belong to the dispatch but weren't linked to this load via loadId yet.
  // This handles stops originally created from dispatch templates.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stopsForMapping = load.stops as any[];
  if (stopsForMapping.length === 0 && load.dispatchId) {
    const dispatchStops = await prisma.carrierStop.findMany({
      where: {
        dispatchId: load.dispatchId,
        OR: [
          { loadId: load.id },
          { loadId: null },
        ],
      },
      include: { facility: { select: { name: true, city: true, state: true } } },
      orderBy: { sequenceOrder: 'asc' },
    });
    stopsForMapping = dispatchStops;
  }

  // Branch C: no dispatch, but pendingStopsJson was saved at creation time
  // Parse the JSON and resolve facility names for the stop builder.
  let mappedStops: StopBuilderStop[];
  if (stopsForMapping.length === 0 && !load.dispatchId && load.pendingStopsJson) {
    const parsedStops = JSON.parse(load.pendingStopsJson as string) as StopInput[];
    const facilityIds = [...new Set(parsedStops.map((s) => s.facility_id).filter(Boolean))];
    const facilities = await prisma.carrierFacility.findMany({
      where: { id: { in: facilityIds }, orgId },
      select: { id: true, name: true, city: true, state: true },
    });
    const facilityMap = new Map(facilities.map((f) => [f.id, f]));
    mappedStops = parsedStops.map((s, i) => {
      const fac = facilityMap.get(s.facility_id);
      return {
        id: s.id ?? `pending-${i}`,
        facility_id: s.facility_id,
        facility_name: fac?.name ?? 'Unknown Facility',
        facility_city: fac?.city ?? null,
        facility_state: fac?.state ?? null,
        sequence_order: s.sequence_order,
        stop_type: s.stop_type,
        contact_name: s.contact_name ?? null,
        contact_phone: s.contact_phone ?? null,
        expected_dwell_minutes: null,
        commodity_description: s.commodity_description ?? null,
        bol_required: s.bol_required ?? false,
        pod_required: s.pod_required ?? false,
        special_instructions: s.special_instructions ?? null,
        appt_window_start_offset_min: null,
        appt_window_end_offset_min: null,
        appointment_start: s.appointment_start ?? null,
        appointment_end: s.appointment_end ?? null,
      };
    });
  } else {
    // Branch A/B: map CarrierStop records to StopBuilderStop format
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    mappedStops = stopsForMapping.map((s: any) => ({
      id: s.id,
      facility_id: s.facilityId,
      facility_name: s.facility?.name ?? 'Unknown Facility',
      facility_city: s.facility?.city ?? null,
      facility_state: s.facility?.state ?? null,
      sequence_order: s.sequenceOrder,
      stop_type: s.stopType as StopBuilderStop['stop_type'],
      contact_name: s.contactName ?? null,
      contact_phone: s.contactPhone ?? null,
      expected_dwell_minutes: null,
      commodity_description: s.commodityDescription ?? null,
      bol_required: s.bolRequired,
      pod_required: s.podRequired,
      special_instructions: s.specialInstructions ?? null,
      appt_window_start_offset_min: null,
      appt_window_end_offset_min: null,
      appointment_start: s.appointmentStart ? (s.appointmentStart as Date).toISOString() : null,
      appointment_end: s.appointmentEnd ? (s.appointmentEnd as Date).toISOString() : null,
    }));
  }

  // Map driver and truck data for the dispatch modal
  const driverOptions = rawDrivers.map((d) => ({
    id: d.id,
    name: `${d.firstName} ${d.lastName}`,
    status: d.status,
  }));
  const truckOptions = rawTrucks.map((t) => ({
    id: t.id,
    unitNumber: t.unitNumber,
    make: t.make,
    model: t.model,
  }));

  // Parse dispatch number from dispatch notes tag if load has a dispatch
  let parsedDispatchNumber: string | null = null;
  if (load.dispatch?.notes) {
    const match = load.dispatch.notes.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
    if (match) parsedDispatchNumber = match[1];
  }

  // Transform load data — convert Decimal fields to numbers for LoadForm
  const initialData: LoadData = {
    id: load.id,
    clientId: load.clientId,
    contractId: load.contractId ?? undefined,
    dispatchId: load.dispatchId ?? undefined,
    loadType: load.loadType,
    referenceNumber: load.referenceNumber ?? undefined,
    bolNumber: load.bolNumber ?? undefined,
    poNumber: load.poNumber ?? undefined,
    commodityDescription: load.commodityDescription ?? undefined,
    commodityWeightLbs:
      load.commodityWeightLbs != null ? Number(load.commodityWeightLbs) : null,
    commodityPieces: load.commodityPieces != null ? Number(load.commodityPieces) : null,
    hazmat: load.hazmat,
    hazmatClass: load.hazmatClass ?? undefined,
    rateType: load.rateType,
    rateAmount:
      load.rateAmount != null ? Number(load.rateAmount) : null,
    otherCharges:
      load.financials.otherCharges != null ? Number(load.financials.otherCharges) : null,
    brokerFlag: load.brokerFlag,
    carrierCost:
      load.financials.carrierCost != null ? Number(load.financials.carrierCost) : null,
    specialInstructions: load.specialInstructions ?? undefined,
    notes: load.notes ?? undefined,
    stops: mappedStops,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Load {load.referenceNumber}
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Edit load details, rate, and freight information.
          </p>
        </div>
        <LoadDetailActions
          loadId={id}
          loadStatus={load.status}
          dispatchId={load.dispatchId}
          dispatchNumber={parsedDispatchNumber}
          drivers={driverOptions}
          trucks={truckOptions}
        />
      </div>

      <LoadForm
        mode="edit"
        initialData={initialData}
        clients={clients}
        loadId={id}
      />
    </div>
  );
}
