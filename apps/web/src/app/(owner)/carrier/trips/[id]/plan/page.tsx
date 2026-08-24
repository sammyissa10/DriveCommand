import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getTrip } from '@/lib/carrier/trips';
import { prisma } from '@/lib/db/prisma';
import { maskFacilitiesForViewer, staffViewer } from '@/lib/carrier/facility-visibility';
import { TripPlanEditor } from '@/components/carrier/trips/TripPlanEditor';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function TripPlanPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const { id } = await params;
  const trip = await getTrip(orgId, id);
  if (!trip) notFound();

  // Fetch facility details for all stops
  const facilityIds = [...new Set(trip.stops.map((s) => s.facilityId))];
  const facilities = maskFacilitiesForViewer(
    await prisma.carrierFacility.findMany({
      where: { id: { in: facilityIds }, orgId },
      select: {
        id: true,
        name: true,
        city: true,
        state: true,
        isDriverResidence: true,
        residentDriverId: true,
      },
    }),
    // This trip's own stops — masked, not removed, and no deletedAt filter for
    // the same reason: a soft-deleted facility must still resolve by name here.
    // See the load detail page.
    staffViewer(session),
  );
  const facilityMap = Object.fromEntries(facilities.map((f) => [f.id, f]));

  // Fetch load reference numbers for each stop
  const loadIds = [...new Set(trip.stops.filter((s) => s.loadId).map((s) => s.loadId!))];
  const loads = loadIds.length
    ? await prisma.carrierLoad.findMany({
        where: { id: { in: loadIds } },
        select: { id: true, referenceNumber: true, client: { select: { name: true } } },
      })
    : [];
  const loadMap = Object.fromEntries(loads.map((l) => [l.id, l]));

  // Serialize stops for client
  const stopsForEditor = trip.stops.map((s) => ({
    id: s.id,
    sequenceOrder: s.sequenceOrder,
    stopType: s.stopType,
    status: s.status,
    loadId: s.loadId,
    loadRefNumber: s.loadId ? loadMap[s.loadId]?.referenceNumber ?? null : null,
    clientName: s.loadId ? loadMap[s.loadId]?.client?.name ?? null : null,
    facilityName: facilityMap[s.facilityId]?.name ?? 'Unknown',
    facilityCity: facilityMap[s.facilityId]?.city ?? null,
    facilityState: facilityMap[s.facilityId]?.state ?? null,
    appointmentStart: s.appointmentStart?.toISOString() ?? null,
    appointmentEnd: s.appointmentEnd?.toISOString() ?? null,
  }));

  // Parse trip number from notes
  const tripNumberMatch = trip.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
  const tripNumber = tripNumberMatch ? tripNumberMatch[1] : id.slice(0, 8);

  return (
    <div className="space-y-6">
      <div>
        <Link
          href={`/carrier/dispatches/${id}`}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Trip Detail
        </Link>
      </div>

      <div>
        <h1 className="text-2xl font-bold">Trip Plan: {tripNumber}</h1>
        <p className="text-muted-foreground">
          {trip.status === 'planned'
            ? 'Drag and drop stops to reorder. Changes save automatically.'
            : 'Stop reordering is only available for planned trips.'}
        </p>
      </div>

      <TripPlanEditor
        tripId={id}
        tripStatus={trip.status}
        stops={stopsForEditor}
      />
    </div>
  );
}
