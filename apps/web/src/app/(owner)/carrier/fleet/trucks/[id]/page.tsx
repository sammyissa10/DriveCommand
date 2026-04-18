import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getCarrierTruck } from '@/lib/carrier/fleet-trucks';
import { CarrierTruckForm } from '@/components/carrier/fleet/CarrierTruckForm';
import { Badge } from '@/components/ui/badge';

interface Props {
  params: Promise<{ id: string }>;
}

function daysUntil(date: Date | string | null): number | null {
  if (!date) return null;
  const d = date instanceof Date ? date : new Date(date);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diff = d.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function expiryColorClass(date: Date | string | null): string {
  const days = daysUntil(date);
  if (days === null) return 'text-muted-foreground';
  if (days < 30) return 'text-red-600 dark:text-red-400';
  if (days < 90) return 'text-amber-600 dark:text-amber-400';
  return 'text-green-600 dark:text-green-400';
}

function formatDate(date: Date | string | null): string {
  if (!date) return '—';
  const d = date instanceof Date ? date : new Date(date);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

function daysLabel(days: number | null, date: Date | string | null): string {
  if (!date || days === null) return '';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Expires today';
  return `${days} days remaining`;
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

const STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  inactive: 'border-slate-400 text-slate-500 dark:text-slate-400',
  maintenance: 'border-amber-500 text-amber-600 dark:text-amber-400',
  out_of_service: 'border-red-500 text-red-600 dark:text-red-400',
};

const DISPATCH_STATUS_CLASSES: Record<string, string> = {
  planned: 'border-blue-500 text-blue-600 dark:text-blue-400',
  in_transit: 'border-amber-500 text-amber-600 dark:text-amber-400',
  completed: 'border-green-500 text-green-600 dark:text-green-400',
  cancelled: 'border-red-500 text-red-600 dark:text-red-400',
};

export default async function CarrierTruckDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const orgId = session.tenantId;

  const truck = await getCarrierTruck(orgId, id);
  if (!truck) notFound();

  const regDays = daysUntil(truck.registrationExpiry);
  const licDays = daysUntil(truck.licenseExpiry);
  const insDays = daysUntil(truck.insuranceExpiry);

  const dispatches = (truck.primaryDispatches ?? []).sort((a, b) => {
    const aDate = a.scheduledDeparture ? new Date(a.scheduledDeparture).getTime() : 0;
    const bDate = b.scheduledDeparture ? new Date(b.scheduledDeparture).getTime() : 0;
    return bDate - aDate;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Link
          href="/carrier/fleet/trucks"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Carrier Trucks
        </Link>
        <div className="mt-3 flex items-center gap-3 flex-wrap">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
            {truck.unitNumber}
          </h1>
          <Badge
            variant="outline"
            className={STATUS_CLASSES[truck.status] ?? 'border-border text-muted-foreground'}
          >
            {truck.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
          </Badge>
        </div>
        {(truck.year || truck.make || truck.model) && (
          <p className="mt-1 text-sm text-muted-foreground">
            {[truck.year, truck.make, truck.model].filter(Boolean).join(' ')}
          </p>
        )}
      </div>

      {/* Details card */}
      <div className="rounded-lg border border-border bg-card p-6 space-y-4">
        <h2 className="text-base font-semibold text-foreground">Truck Details</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">VIN</p>
            <p className="text-sm font-mono font-medium">{truck.vin ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Type</p>
            <Badge variant="outline" className="border-blue-500 text-blue-600 dark:text-blue-400">
              {TRUCK_TYPE_LABELS[truck.truckType] ?? truck.truckType}
            </Badge>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">GVWR</p>
            <p className="text-sm font-medium">
              {truck.grossWeightLbs != null
                ? `${truck.grossWeightLbs.toLocaleString()} lbs`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Max Payload</p>
            <p className="text-sm font-medium">
              {truck.payloadCapacityLbs != null
                ? `${truck.payloadCapacityLbs.toLocaleString()} lbs`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Odometer</p>
            <p className="text-sm font-medium">
              {truck.currentOdometerMiles != null
                ? `${truck.currentOdometerMiles.toLocaleString()} mi`
                : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">License Plate</p>
            <p className="text-sm font-medium">
              {truck.licensePlate
                ? `${truck.licensePlate}${truck.licenseState ? ` (${truck.licenseState})` : ''}`
                : '—'}
            </p>
          </div>
        </div>

        {/* Compliance dates */}
        <div className="mt-4 pt-4 border-t border-border">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Compliance Dates
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Registration Expiry</p>
              {truck.registrationExpiry ? (
                <div>
                  <p className={`text-sm font-semibold ${expiryColorClass(truck.registrationExpiry)}`}>
                    {formatDate(truck.registrationExpiry)}
                  </p>
                  <p className={`text-xs ${expiryColorClass(truck.registrationExpiry)}`}>
                    {daysLabel(regDays, truck.registrationExpiry)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">License Expiry</p>
              {truck.licenseExpiry ? (
                <div>
                  <p className={`text-sm font-semibold ${expiryColorClass(truck.licenseExpiry)}`}>
                    {formatDate(truck.licenseExpiry)}
                  </p>
                  <p className={`text-xs ${expiryColorClass(truck.licenseExpiry)}`}>
                    {daysLabel(licDays, truck.licenseExpiry)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1">Insurance Expiry</p>
              {truck.insuranceExpiry ? (
                <div>
                  <p className={`text-sm font-semibold ${expiryColorClass(truck.insuranceExpiry)}`}>
                    {formatDate(truck.insuranceExpiry)}
                  </p>
                  <p className={`text-xs ${expiryColorClass(truck.insuranceExpiry)}`}>
                    {daysLabel(insDays, truck.insuranceExpiry)}
                  </p>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">—</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Edit form */}
      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="text-base font-semibold text-foreground mb-4">Edit Truck</h2>
        <CarrierTruckForm
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
          }}
        />
      </div>

      {/* Dispatch history */}
      {dispatches.length > 0 && (
        <div className="rounded-lg border border-border bg-card p-6">
          <h2 className="text-base font-semibold text-foreground mb-4">Dispatch History</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Dispatch #</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Date</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Status</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Miles</th>
                  <th className="text-left py-2 px-3 font-medium text-muted-foreground">Driver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {dispatches.map((d) => {
                  const miles = d.actualMiles ?? d.plannedMiles;
                  return (
                    <tr key={d.id} className="hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3">
                        <Link
                          href={`/carrier/dispatches/${d.id}`}
                          className="font-mono text-xs text-foreground hover:text-primary transition-colors"
                        >
                          {d.id.slice(0, 8).toUpperCase()}
                        </Link>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {d.scheduledDeparture
                          ? new Date(d.scheduledDeparture).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            })
                          : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant="outline"
                          className={DISPATCH_STATUS_CLASSES[d.status] ?? 'border-border text-muted-foreground'}
                        >
                          {d.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {miles != null ? `${Number(miles).toLocaleString()} mi` : '—'}
                      </td>
                      <td className="py-2 px-3 text-muted-foreground">
                        {d.primaryDriver
                          ? `${d.primaryDriver.firstName} ${d.primaryDriver.lastName}`
                          : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
