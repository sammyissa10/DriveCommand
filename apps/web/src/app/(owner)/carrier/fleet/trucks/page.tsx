import { redirect } from 'next/navigation';
import { Truck } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { listCarrierTrucks } from '@/lib/carrier/fleet-trucks';
import { CarrierTruckList } from '@/components/carrier/fleet/CarrierTruckList';

export default async function CarrierTrucksPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;

  let items: Awaited<ReturnType<typeof listCarrierTrucks>>['items'] = [];
  let total = 0;

  try {
    const result = await listCarrierTrucks(orgId);
    items = result.items;
    total = result.total;
  } catch {
    // DB failure — render empty list
  }

  // Count by truckType
  const typeCounts: Record<string, number> = {};
  for (const t of items) {
    const type = t.truckType ?? 'unknown';
    typeCounts[type] = (typeCounts[type] ?? 0) + 1;
  }

  const TRUCK_TYPE_LABELS: Record<string, string> = {
    semi: 'Semi',
    box_truck: 'Box Truck',
    flatbed: 'Flatbed',
    reefer: 'Reefer',
    tanker: 'Tanker',
    day_cab: 'Day Cab',
    straight_truck: 'Straight Truck',
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            Carrier Trucks
          </h1>
          <p className="mt-1 text-muted-foreground text-sm">
            Showing {items.length} of {total} truck{total !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Stat row */}
      {total > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2 text-sm">
            <Truck className="h-4 w-4 text-muted-foreground" />
            <span className="font-semibold">{total}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          {Object.entries(typeCounts).map(([type, count]) => (
            <div
              key={type}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="font-semibold">{count}</span>
              <span className="text-muted-foreground">
                {TRUCK_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      )}

      <CarrierTruckList
        trucks={items.map((t) => ({
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
          status: t.status,
          isSample: t.isSample,
        }))}
      />
    </div>
  );
}
