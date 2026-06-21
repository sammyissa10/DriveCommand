import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getCarrierTruck } from '@/lib/carrier/fleet-trucks';
import { TruckDetail } from '@/components/carrier/fleet/TruckDetail';
import { prisma } from '@/lib/db/prisma';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ mode?: string }>;
}

export default async function CarrierTruckDetailPage({ params, searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const [{ id }, { mode }] = await Promise.all([params, searchParams]);
  const orgId = session.tenantId;

  const [truck, truckAudit] = await Promise.all([
    getCarrierTruck(orgId, id),
    prisma.carrierTruck
      .findUnique({
        where: { id },
        select: {
          createdBy: { select: { firstName: true, lastName: true, email: true } },
          updatedBy: { select: { firstName: true, lastName: true, email: true } },
          createdAt: true,
          updatedAt: true,
        },
      })
      .catch(() => null),
  ]);
  if (!truck) notFound();

  // Sort dispatches by date descending and convert Decimal to number
  const dispatches = (truck.primaryDispatches ?? [])
    .sort((a, b) => {
      const aDate = a.scheduledDeparture ? new Date(a.scheduledDeparture).getTime() : 0;
      const bDate = b.scheduledDeparture ? new Date(b.scheduledDeparture).getTime() : 0;
      return bDate - aDate;
    })
    .map((d) => ({
      id: d.id,
      scheduledDeparture: d.scheduledDeparture,
      status: d.status,
      actualMiles: d.actualMiles ? Number(d.actualMiles) : null,
      plannedMiles: d.plannedMiles ? Number(d.plannedMiles) : null,
      primaryDriver: d.primaryDriver,
    }));

  // Format audit data
  const audit = truckAudit
    ? {
        createdAt: truckAudit.createdAt,
        createdByName: truckAudit.createdBy
          ? `${truckAudit.createdBy.firstName ?? ''} ${truckAudit.createdBy.lastName ?? ''}`.trim() ||
            null
          : null,
        createdByEmail: truckAudit.createdBy?.email ?? null,
        updatedAt: truckAudit.updatedAt,
        updatedByName: truckAudit.updatedBy
          ? `${truckAudit.updatedBy.firstName ?? ''} ${truckAudit.updatedBy.lastName ?? ''}`.trim() ||
            null
          : null,
        updatedByEmail: truckAudit.updatedBy?.email ?? null,
      }
    : null;

  return (
    <Suspense
      fallback={
        <div className="space-y-6">
          <div className="h-8 w-32 bg-muted animate-pulse rounded" />
          <div className="h-12 w-64 bg-muted animate-pulse rounded" />
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div className="space-y-6">
              <div className="h-48 bg-muted animate-pulse rounded-lg" />
              <div className="h-32 bg-muted animate-pulse rounded-lg" />
              <div className="h-32 bg-muted animate-pulse rounded-lg" />
            </div>
            <div className="h-64 bg-muted animate-pulse rounded-lg" />
          </div>
        </div>
      }
    >
      <TruckDetail
        truck={{
          id: truck.id,
          vehicleId: truck.vehicleId,
          displayName: truck.displayName,
          unitNumber: truck.unitNumber,
          vin: truck.vin,
          year: truck.year,
          make: truck.make,
          model: truck.model,
          truckType: truck.truckType,
          grossWeightLbs: truck.grossWeightLbs,
          payloadCapacityLbs: truck.payloadCapacityLbs,
          currentOdometerMiles: truck.currentOdometerMiles,
          licensePlate: truck.licensePlate,
          licenseState: truck.licenseState,
          registrationExpiry: truck.registrationExpiry,
          licenseExpiry: truck.licenseExpiry,
          insuranceExpiry: truck.insuranceExpiry,
          status: truck.status,
          notes: truck.notes,
          photoS3Key: truck.photoS3Key,
        }}
        dispatches={dispatches}
        audit={audit}
        initialMode={mode === 'edit' ? 'edit' : 'view'}
      />
    </Suspense>
  );
}
