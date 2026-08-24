import { redirect } from 'next/navigation';
import Link from 'next/link';
import { MapPin, Package, Clock, CheckCircle, Truck, ArrowRight, Play } from 'lucide-react';
import { requireRole, getSession } from '@/lib/auth/supabase';
import { UserRole } from '@/lib/auth/roles';
import { prisma } from '@/lib/db/prisma';
import { maskFacilitiesForViewer } from '@/lib/carrier/facility-visibility';

export const dynamic = 'force-dynamic';

export default async function DriverTripsPage() {
  await requireRole([UserRole.DRIVER]);
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;
  const userId = session.userId;
  if (!orgId || !userId) redirect('/login');

  // Find driver record for this user
  const driver = await prisma.carrierDriver.findFirst({
    where: { orgId, userId },
    select: { id: true },
  });

  if (!driver) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">My Trips</h1>
        <p className="mt-2 text-muted-foreground">
          No driver profile linked to your account.
        </p>
      </div>
    );
  }

  // Fetch trips assigned to this driver
  const trips = await prisma.trip.findMany({
    where: {
      orgId,
      primaryDriverId: driver.id,
      status: { in: ['planned', 'in_progress'] },
    },
    orderBy: { scheduledDeparture: 'asc' },
    include: {
      truck: { select: { unitNumber: true } },
      stops: {
        orderBy: { sequenceOrder: 'asc' },
        select: {
          id: true,
          sequenceOrder: true,
          stopType: true,
          status: true,
          facilityId: true,
        },
      },
      carrierLoads: {
        select: { id: true, referenceNumber: true, status: true },
      },
    },
    take: 20,
  });

  // Batch fetch facility details
  const facilityIds = [...new Set(trips.flatMap((t) => t.stops.map((s) => s.facilityId)))];
  const facilities = facilityIds.length
    ? maskFacilitiesForViewer(
        // No deletedAt filter, deliberately: these are this driver's own trips'
        // stops, not a picker — a soft-deleted facility must still resolve by
        // name here.
        await prisma.carrierFacility.findMany({
          where: { id: { in: facilityIds } },
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
        // THIS driver, so their own home shows in full and nobody else's would
        // (spec Section 9: "visible only to that driver…"). The id is the
        // carrier_drivers row this page already holds — NOT User.id, which is
        // not what resident_driver_id points at.
        { role: session.role, permissions: session.permissions, carrierDriverId: driver.id },
      )
    : [];
  const facilityMap = Object.fromEntries(facilities.map((f) => [f.id, f]));

  // Helper to parse trip number from notes
  const getTripNumber = (notes: string | null) => {
    const match = notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
    return match ? match[1] : 'Trip';
  };

  if (trips.length === 0) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold">My Trips</h1>
        <div className="mt-8 text-center">
          <Truck className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <p className="mt-4 text-muted-foreground">
            No active or planned trips assigned to you.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">My Trips</h1>

      <div className="space-y-4">
        {trips.map((trip) => {
          const tripNumber = getTripNumber(trip.notes);
          const completedStops = trip.stops.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
          const totalStops = trip.stops.length;
          const nextStop = trip.stops.find((s) => s.status === 'pending' || s.status === 'arrived');
          const nextFacility = nextStop ? facilityMap[nextStop.facilityId] : null;
          const isActive = trip.status === 'in_progress';

          return (
            <Link
              key={trip.id}
              href={`/carrier/dispatches/${trip.id}`}
              className="block rounded-lg border bg-card p-4 shadow-sm hover:border-primary/50 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold">{tripNumber}</span>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                        isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                          : 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                      }`}
                    >
                      {isActive ? 'In Progress' : 'Planned'}
                    </span>
                  </div>

                  {/* Truck */}
                  <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1">
                    <Truck className="h-3.5 w-3.5" />
                    {trip.truck.unitNumber}
                  </p>

                  {/* Scheduled departure */}
                  <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3.5 w-3.5" />
                    {new Date(trip.scheduledDeparture).toLocaleString(undefined, {
                      weekday: 'short',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>

                  {/* Loads */}
                  {trip.carrierLoads.length > 0 && (
                    <p className="mt-1 text-sm text-muted-foreground flex items-center gap-1">
                      <Package className="h-3.5 w-3.5" />
                      {trip.carrierLoads.length} load{trip.carrierLoads.length > 1 ? 's' : ''}
                      {trip.carrierLoads[0]?.referenceNumber && ` (${trip.carrierLoads[0].referenceNumber})`}
                    </p>
                  )}

                  {/* Next stop */}
                  {nextFacility && (
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      <span className="text-muted-foreground">Next:</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                        {nextFacility.name}
                        {nextFacility.city && `, ${nextFacility.city}`}
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress + action */}
                <div className="flex flex-col items-end gap-2 shrink-0">
                  {/* Progress indicator */}
                  <div className="flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4 text-green-500" />
                    <span className="text-sm font-medium">
                      {completedStops}/{totalStops}
                    </span>
                  </div>

                  {/* Action hint */}
                  {isActive ? (
                    <span className="inline-flex items-center gap-1 text-xs text-primary">
                      Continue <ArrowRight className="h-3 w-3" />
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                      <Play className="h-3 w-3" /> Start
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
