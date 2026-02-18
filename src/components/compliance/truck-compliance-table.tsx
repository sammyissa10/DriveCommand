'use client';

import Link from 'next/link';
import type { TruckComplianceItem } from '@/app/(owner)/actions/compliance';

interface TruckComplianceTableProps {
  trucks: TruckComplianceItem[];
}

type TruckFieldStatus = 'OK' | 'EXPIRING_SOON' | 'EXPIRED' | 'NOT_SET';

function TruckFieldBadge({ status }: { status: TruckFieldStatus }) {
  if (status === 'EXPIRED') {
    return (
      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
        Expired
      </span>
    );
  }
  if (status === 'EXPIRING_SOON') {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        Expiring Soon
      </span>
    );
  }
  if (status === 'NOT_SET') {
    return (
      <span className="text-xs text-muted-foreground">Not Set</span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
      OK
    </span>
  );
}

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function TruckComplianceTable({ trucks }: TruckComplianceTableProps) {
  if (trucks.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold mb-4">Truck Compliance</h2>
        <div className="py-10 text-center">
          <p className="text-muted-foreground text-sm">No trucks found.</p>
        </div>
      </div>
    );
  }

  const trucksWithNoMetadata = trucks.every(
    (t) => t.registration.status === 'NOT_SET' && t.insurance.status === 'NOT_SET'
  );

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="text-base font-semibold">Truck Compliance</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{trucks.length} truck{trucks.length !== 1 ? 's' : ''} tracked</p>
      </div>

      {trucksWithNoMetadata && (
        <div className="px-5 py-3 bg-muted/40 border-b border-border">
          <p className="text-xs text-muted-foreground">
            Add registration and insurance expiry dates by editing each truck.
          </p>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Truck</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">License Plate</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Registration</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Insurance</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {trucks.map((truck) => (
              <tr key={truck.truckId} className="hover:bg-muted/30 transition-colors">
                {/* Truck label */}
                <td className="px-4 py-3 font-medium">{truck.truckLabel}</td>

                {/* License plate */}
                <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                  {truck.licensePlate}
                </td>

                {/* Registration */}
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    {truck.registration.expiry && truck.registration.status !== 'NOT_SET' && (
                      <p className="text-xs text-muted-foreground">
                        {formatDate(truck.registration.expiry)}
                      </p>
                    )}
                    <TruckFieldBadge status={truck.registration.status} />
                  </div>
                </td>

                {/* Insurance */}
                <td className="px-4 py-3">
                  <div className="space-y-1">
                    {truck.insurance.expiry && truck.insurance.status !== 'NOT_SET' && (
                      <p className="text-xs text-muted-foreground">
                        {formatDate(truck.insurance.expiry)}
                      </p>
                    )}
                    <TruckFieldBadge status={truck.insurance.status} />
                  </div>
                </td>

                {/* Actions */}
                <td className="px-4 py-3">
                  <Link
                    href={`/trucks/${truck.truckId}`}
                    className="text-xs text-primary hover:underline"
                  >
                    View Truck
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
