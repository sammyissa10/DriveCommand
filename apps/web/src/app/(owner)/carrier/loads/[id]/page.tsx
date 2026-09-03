import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { facilityVisibilityWhere, maskFacilitiesForViewer, staffViewer } from '@/lib/carrier/facility-visibility';
import { getLoad } from '@/lib/carrier/loads';
import type { StopInput } from '@/lib/carrier/loads';
import { LoadForm } from '@/components/carrier/loads/LoadForm';
import type { LoadData } from '@/components/carrier/loads/LoadForm';
import type { StopBuilderStop } from '@/components/carrier/stops/StopBuilder';
import { LoadDetailActions } from '@/components/carrier/loads/LoadDetailActions';
import { DispatchFailedBanner } from '@/components/carrier/loads/DispatchFailedBanner';
import { DriverAssignmentSection } from '@/components/driver-pay/assignment-section';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import { listAssignmentsForLoad } from '@/app/(owner)/actions/load-driver-assignments';
import { LoadDetailMobile } from './LoadDetailMobile';
import { SampleHiddenNote } from '@/components/onboarding/sample-hidden-note';
import { ResponsiveSwitch } from '@/components/ui/ResponsiveSwitch';

interface LoadDetailPageProps {
  params: Promise<{ id: string }>;
}


/**
 * Did TKT-0076 actually remove anything for THIS tenant?
 *
 * The note only earns its place when a record really is missing. Asking the
 * question here rather than inside the component keeps it one cheap count per
 * entity on a page that is already fetching those tables.
 */
async function hasHiddenSamples(orgId: string): Promise<boolean> {
  const [c, d, t] = await Promise.all([
    prisma.carrierClient.count({ where: { orgId, isSample: true, deletedAt: null } }),
    prisma.carrierDriver.count({ where: { orgId, isSample: true, deletedAt: null } }),
    prisma.carrierTruck.count({ where: { orgId, isSample: true, deletedAt: null } }),
  ]);
  return c + d + t > 0;
}

export default async function LoadDetailPage({ params }: LoadDetailPageProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const tenantPrisma = await getTenantPrisma();

  const { id } = await params;

  // TKT-0076: seeded demo records must never appear in an operational picker —
  // the same predicate `carrier/trips/new` uses. `deletedAt` guards against
  // soft-deleted rows lingering in a dropdown. Sample records stay visible in
  // the list grids with their pill; this hides them from ASSIGNMENT only.
  const samplesHidden = await hasHiddenSamples(orgId);

  const [load, clients, rawDrivers, rawTrucks, loadAudit] = await Promise.all([
    getLoad(orgId, id),
    prisma.carrierClient.findMany({
      where: { orgId, isSample: false, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.carrierDriver.findMany({
      where: { orgId, status: 'active', isSample: false, deletedAt: null },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        status: true,
        user: { select: { isDispatchReady: true } },
      },
      orderBy: { lastName: 'asc' },
    }),
    prisma.carrierTruck.findMany({
      where: { orgId, status: 'active', isSample: false, deletedAt: null },
      select: { id: true, unitNumber: true, make: true, model: true },
      orderBy: { unitNumber: 'asc' },
    }),
    prisma.carrierLoad.findUnique({
      where: { id },
      select: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => null),
  ]);

  if (!load) notFound();

  // Server-derived selects for the mobile-web ds branch — a native <select> with no
  // matching <option> on first paint silently falls back to its first option, so
  // every select value (contracts, facilities) is resolved here, not client-side.
  const [mobileContracts, mobileFacilities, mobileAssignmentsResult] = await Promise.all([
    prisma.carrierContract.findMany({
      where: { orgId, clientId: load.clientId, status: 'active' },
      select: {
        id: true,
        contractNumber: true,
        contractName: true,
        rateType: true,
        baseRate: true,
        fuelSurchargeMethod: true,
        fuelSurchargeRate: true,
      },
      orderBy: { contractName: 'asc' },
    }),
    prisma.carrierFacility.findMany({
      // A picker. Driver residences are excluded server-side (spec Section 9).
      where: { orgId, deletedAt: null, ...facilityVisibilityWhere(staffViewer(session)) },
      select: { id: true, name: true, city: true, state: true },
      orderBy: { name: 'asc' },
    }),
    listAssignmentsForLoad(id),
  ]);
  const mobileInitialAssignments = mobileAssignmentsResult.data?.assignments ?? [];
  const mobileContractsSerialized = mobileContracts.map((c) => ({
    id: c.id,
    contractNumber: c.contractNumber,
    contractName: c.contractName,
    rateType: c.rateType,
    baseRate: c.baseRate != null ? String(c.baseRate) : null,
    fuelSurchargeMethod: c.fuelSurchargeMethod,
    fuelSurchargeRate: c.fuelSurchargeRate != null ? String(c.fuelSurchargeRate) : null,
  }));

  // If no stops found via loadId but load is on a dispatch, check for stops
  // that belong to the dispatch but weren't linked to this load via loadId yet.
  // This handles stops originally created from dispatch templates.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let stopsForMapping = load.stops as any[];
  if (stopsForMapping.length === 0 && load.dispatchId) {
    const dispatchStops = await tenantPrisma.carrierStop.findMany({
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
    const facilities = maskFacilitiesForViewer(
      // No deletedAt filter, deliberately: this hydrates this load's own
      // already-saved stops, not a picker — a soft-deleted facility must still
      // resolve by name here.
      await prisma.carrierFacility.findMany({
        where: { id: { in: facilityIds }, orgId },
        select: {
          id: true,
          name: true,
          city: true,
          state: true,
          // Read only so the mask can decide. Never rendered.
          isDriverResidence: true,
          residentDriverId: true,
        },
      }),
      // This load's own stops — masked, not removed. Dropping the row would
      // delete the end stop from the itinerary, which is the untracked return
      // Part A exists to fix.
      staffViewer(session),
    );
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

  // Stop id -> status, for the mobile Stops tab timeline pill. Only real CarrierStop
  // rows (branch A/B) carry a status; pendingStopsJson stops (branch C) get none.
  const stopStatusMap: Record<string, string> = {};
  for (const s of stopsForMapping) {
    if (s && typeof s === 'object' && 'id' in s && 'status' in s) {
      stopStatusMap[s.id as string] = s.status as string;
    }
  }

  // Map driver and truck data for the dispatch modal
  const driverOptions = rawDrivers.map((d) => ({
    id: d.id,
    name: `${d.firstName} ${d.lastName}`,
    status: d.status,
    isDispatchReady: d.user?.isDispatchReady ?? false,
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

  // Count pending stops for this load (used by CancelLoadModal)
  const pendingStopCount = load.dispatchId
    ? await tenantPrisma.carrierStop.count({
        where: { loadId: id, status: 'pending' },
      })
    : 0;

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
    <>
      <DispatchFailedBanner />
      <ResponsiveSwitch
        mobile={
        <div className="-m-4">
          <LoadDetailMobile
            load={{
              id: load.id,
              referenceNumber: load.referenceNumber ?? id.slice(0, 8),
              status: load.status,
              clientId: load.clientId,
              contractId: load.contractId ?? null,
              dispatchId: load.dispatchId ?? null,
              loadType: load.loadType,
              bolNumber: load.bolNumber ?? null,
              poNumber: load.poNumber ?? null,
              commodityDescription: load.commodityDescription ?? null,
              commodityWeightLbs: load.commodityWeightLbs != null ? Number(load.commodityWeightLbs) : null,
              commodityPieces: load.commodityPieces != null ? Number(load.commodityPieces) : null,
              hazmat: load.hazmat,
              rateType: load.rateType,
              rateAmount: load.rateAmount != null ? Number(load.rateAmount) : null,
              otherCharges: load.financials.otherCharges != null ? Number(load.financials.otherCharges) : null,
              brokerFlag: load.brokerFlag,
              carrierCost: load.financials.carrierCost != null ? Number(load.financials.carrierCost) : null,
              specialInstructions: load.specialInstructions ?? null,
            }}
            clients={clients}
            contracts={mobileContractsSerialized}
            facilities={mobileFacilities}
            driverOptions={driverOptions}
            truckOptions={truckOptions}
            stops={mappedStops}
            stopStatusMap={stopStatusMap}
            dispatchNumber={parsedDispatchNumber}
            pendingStopCount={pendingStopCount}
            initialAssignments={mobileInitialAssignments}
            loadAudit={
              loadAudit
                ? {
                    createdAt: loadAudit.createdAt.toISOString(),
                    createdByName: loadAudit.createdBy
                      ? `${loadAudit.createdBy.firstName ?? ''} ${loadAudit.createdBy.lastName ?? ''}`.trim() || null
                      : null,
                    createdByEmail: loadAudit.createdBy?.email ?? null,
                    updatedAt: loadAudit.updatedAt.toISOString(),
                    updatedByName: loadAudit.updatedBy
                      ? `${loadAudit.updatedBy.firstName ?? ''} ${loadAudit.updatedBy.lastName ?? ''}`.trim() || null
                      : null,
                    updatedByEmail: loadAudit.updatedBy?.email ?? null,
                  }
                : null
            }
          />
        </div>
      }
      desktop={
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
              loadRefNumber={load.referenceNumber ?? id.slice(0, 8)}
              loadStatus={load.status}
              dispatchId={load.dispatchId}
              dispatchNumber={parsedDispatchNumber}
              pendingStopCount={pendingStopCount}
              drivers={driverOptions}
              trucks={truckOptions}
            />
          </div>

          {samplesHidden && <SampleHiddenNote className="-mb-2" />}
          <LoadForm
            mode="edit"
            initialData={initialData}
            clients={clients}
            loadId={id}
          />

          <DriverAssignmentSection
            loadId={id}
            load={{
              id: load.id,
              hazmat: load.hazmat,
              referenceNumber: load.referenceNumber ?? null,
              rateAmount: load.rateAmount != null ? Number(load.rateAmount) : null,
              createdAt: (load.createdAt as Date).toISOString(),
            }}
            drivers={rawDrivers}
            stops={mappedStops.map((s) => ({
              id: s.id,
              facilityName: s.facility_name,
              stopType: s.stop_type,
            }))}
          />

          {loadAudit && (
            <AuditTrailFooter
              createdAt={loadAudit.createdAt}
              createdByName={loadAudit.createdBy ? `${loadAudit.createdBy.firstName ?? ''} ${loadAudit.createdBy.lastName ?? ''}`.trim() || null : null}
              createdByEmail={loadAudit.createdBy?.email ?? null}
              updatedAt={loadAudit.updatedAt}
              updatedByName={loadAudit.updatedBy ? `${loadAudit.updatedBy.firstName ?? ''} ${loadAudit.updatedBy.lastName ?? ''}`.trim() || null : null}
              updatedByEmail={loadAudit.updatedBy?.email ?? null}
            />
          )}
        </div>
      }
      />
    </>
  );
}
