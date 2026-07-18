import { redirect } from 'next/navigation';
import { Truck } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { hasPermission } from '@/lib/auth/permissions';
import { listCarrierTrucks } from '@/lib/carrier/fleet-trucks';
import { ACTIVE_DISPATCH_STATUSES, computeTruckDisplayStatus, type TruckDisplayStatus } from '@/lib/carrier/truck-status';
import { TrucksGrid } from './_grid/TrucksGrid';
import { TrucksMobile, type TruckMobileRow } from './TrucksMobile';

const DAY_MS = 86_400_000;

type TruckItem = Awaited<ReturnType<typeof listCarrierTrucks>>['items'][number];

/**
 * The single most urgent fact per truck, computed server-side (no client
 * status/derivation): active load → expired/expiring doc → odometer → type.
 */
function urgentFact(t: TruckItem): string {
  const dispatch = t.primaryDispatches?.[0];
  if (dispatch) {
    const d = dispatch.primaryDriver;
    const name = d ? `${d.firstName ?? ''} ${d.lastName ?? ''}`.trim() : '';
    // Pill already reads "On Load" — the meta just adds the driver when known.
    return name ? `Driver · ${name}` : '';
  }

  const now = Date.now();
  const docs = (
    [
      ['License', t.licenseExpiry],
      ['Registration', t.registrationExpiry],
      ['Insurance', t.insuranceExpiry],
    ] as const
  )
    .filter(([, date]) => date != null)
    .map(([label, date]) => ({
      label,
      days: Math.ceil((new Date(date as Date).getTime() - now) / DAY_MS),
    }));

  const expired = docs.filter((x) => x.days < 0).sort((a, b) => a.days - b.days);
  if (expired.length > 0) return `${expired[0].label} expired`;

  const soon = docs.filter((x) => x.days >= 0 && x.days <= 30).sort((a, b) => a.days - b.days);
  if (soon.length > 0) return `${soon[0].label} expires in ${soon[0].days}d`;

  if (t.currentOdometerMiles != null) {
    return `${t.currentOdometerMiles.toLocaleString('en-US')} mi`;
  }
  // No urgent fact — leave the meta line empty rather than repeat the type
  // (the type already shows in the subline as its fallback).
  return '';
}

const TRUCK_TYPE_LABELS: Record<string, string> = {
  semi: 'Semi',
  box_truck: 'Box Truck',
  flatbed: 'Flatbed',
  reefer: 'Reefer',
  tanker: 'Tanker',
  day_cab: 'Day Cab',
  straight_truck: 'Straight Truck',
  cargo_van: 'Cargo Van',
  sprinter_van: 'Sprinter Van',
  pickup: 'Pickup Truck',
  car: 'Car',
};

/**
 * Design-system truck status via the shared helper (same logic as Detail).
 * `primaryDispatches` is pre-filtered to active (in-progress) dispatches, so a
 * non-empty list means the truck is on a load right now.
 */
function displayStatus(t: TruckItem): TruckDisplayStatus {
  const active = (t.primaryDispatches?.length ?? 0) > 0;
  return computeTruckDisplayStatus(t.status, active ? [...ACTIVE_DISPATCH_STATUSES] : []);
}

export default async function CarrierTrucksPage() {
  const session = await getSession();
  if (!session) redirect('/login');
  const orgId = session.tenantId;
  const canCreate = hasPermission(session.permissions ?? null, 'carrierTrucks', session.role);

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

  const mobileTrucks: TruckMobileRow[] = items.map((t) => ({
    id: t.id,
    unitNumber: t.unitNumber,
    displayName: t.displayName,
    make: t.make,
    model: t.model,
    year: t.year,
    vin: t.vin,
    licensePlate: t.licensePlate,
    licenseState: t.licenseState,
    truckType: t.truckType,
    displayStatus: displayStatus(t),
    meta: urgentFact(t),
  }));

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <TrucksMobile trucks={mobileTrucks} canCreate={canCreate} />
      </div>

      {/* Desktop grid (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
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
            <Truck className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <span className="font-medium">{total}</span>
            <span className="text-muted-foreground">total</span>
          </div>
          {Object.entries(typeCounts).map(([type, count]) => (
            <div
              key={type}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="font-medium">{count}</span>
              <span className="text-muted-foreground">
                {TRUCK_TYPE_LABELS[type] ?? type.replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      )}

      <TrucksGrid
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
          photoS3Key: t.photoS3Key ?? null,
          insuranceExpiry: t.insuranceExpiry ?? null,
          licensePlate: t.licensePlate ?? null,
          licenseState: t.licenseState ?? null,
          assignedDriver: t.primaryDispatches[0]?.primaryDriver ?? null,
        }))}
      />
      </div>
    </>
  );
}
