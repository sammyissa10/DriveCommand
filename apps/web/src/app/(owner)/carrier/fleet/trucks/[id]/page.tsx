import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { getCarrierTruck } from '@/lib/carrier/fleet-trucks';
import { CarrierTruckDetailClient } from '@/components/carrier/fleet/CarrierTruckDetailClient';
import { Badge } from '@/components/ui/badge';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import { prisma } from '@/lib/db/prisma';

interface Props {
  params: Promise<{ id: string }>;
}

const DISPATCH_STATUS_CLASSES: Record<string, string> = {
  planned: 'border-blue-500 text-blue-600 dark:text-blue-400',
  in_transit: 'border-amber-500 text-amber-600 dark:text-amber-400',
  completed: 'border-green-500 text-green-600 dark:text-green-400',
  cancelled: 'border-red-500 text-red-600 dark:text-red-400',
};

const STATUS_CLASSES: Record<string, string> = {
  active: 'border-green-500 text-green-600 dark:text-green-400',
  inactive: 'border-slate-400 text-slate-500 dark:text-slate-400',
  maintenance: 'border-amber-500 text-amber-600 dark:text-amber-400',
  out_of_service: 'border-red-500 text-red-600 dark:text-red-400',
};

export default async function CarrierTruckDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const orgId = session.tenantId;

  const [truck, truckAudit] = await Promise.all([
    getCarrierTruck(orgId, id),
    prisma.carrierTruck.findUnique({
      where: { id },
      select: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => null),
  ]);
  if (!truck) notFound();

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

      {/* View/Edit card */}
      <CarrierTruckDetailClient
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

      {truckAudit && (
        <AuditTrailFooter
          createdAt={truckAudit.createdAt}
          createdByName={truckAudit.createdBy ? `${truckAudit.createdBy.firstName ?? ''} ${truckAudit.createdBy.lastName ?? ''}`.trim() || null : null}
          createdByEmail={truckAudit.createdBy?.email ?? null}
          updatedAt={truckAudit.updatedAt}
          updatedByName={truckAudit.updatedBy ? `${truckAudit.updatedBy.firstName ?? ''} ${truckAudit.updatedBy.lastName ?? ''}`.trim() || null : null}
          updatedByEmail={truckAudit.updatedBy?.email ?? null}
        />
      )}
    </div>
  );
}
