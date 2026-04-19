import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { getLoad } from '@/lib/carrier/loads';
import { LoadForm } from '@/components/carrier/loads/LoadForm';
import type { LoadData } from '@/components/carrier/loads/LoadForm';
import type { StopBuilderStop } from '@/components/carrier/stops/StopBuilder';

interface LoadDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LoadDetailPage({ params }: LoadDetailPageProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const { id } = await params;

  const [load, clients] = await Promise.all([
    getLoad(orgId, id),
    prisma.carrierClient.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
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

  // Map CarrierStop records to StopBuilderStop format for the stop builder
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mappedStops: StopBuilderStop[] = stopsForMapping.map((s: any) => ({
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
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Load {load.referenceNumber}
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Edit load details, rate, and freight information.
        </p>
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
