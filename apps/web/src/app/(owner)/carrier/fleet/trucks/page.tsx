import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { listCarrierTrucks } from '@/lib/carrier/fleet-trucks';
import { TrucksOverview } from './_components/TrucksOverview';

export default async function CarrierTrucksPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;

  let items: Awaited<ReturnType<typeof listCarrierTrucks>>['items'] = [];

  try {
    const result = await listCarrierTrucks(orgId);
    items = result.items;
  } catch {
    // DB failure — render empty list
  }

  const trucks = items.map((t) => ({
    id: t.id,
    vehicleId: t.vehicleId,
    displayName: t.displayName,
    unitNumber: t.unitNumber,
    vin: t.vin,
    year: t.year,
    make: t.make,
    model: t.model,
    truckType: t.truckType,
    currentOdometerMiles: t.currentOdometerMiles,
    registrationExpiry: t.registrationExpiry,
    licenseExpiry: t.licenseExpiry,
    insuranceExpiry: t.insuranceExpiry ?? null,
    licensePlate: t.licensePlate ?? null,
    licenseState: t.licenseState ?? null,
    status: t.status,
    isSample: t.isSample,
    photoS3Key: t.photoS3Key ?? null,
    assignedDriver: t.primaryDispatches[0]?.primaryDriver ?? null,
  }));

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Fleet Trucks
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Manage your carrier fleet vehicles
        </p>
      </div>

      {/* Overview with KPIs, Tabs, and Grid */}
      <TrucksOverview trucks={trucks} />
    </div>
  );
}
