'use client';

import Link from 'next/link';
import type { DriverComplianceItem } from '@/app/(owner)/actions/compliance';

interface DriverComplianceTableProps {
  drivers: DriverComplianceItem[];
}

type DocStatus = 'OK' | 'EXPIRING_SOON' | 'EXPIRED';

function StatusBadge({ status }: { status: DocStatus }) {
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
  return (
    <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700 dark:bg-green-900/30 dark:text-green-400">
      OK
    </span>
  );
}

function formatDocumentType(type: string): string {
  switch (type) {
    case 'DRIVER_LICENSE':
      return 'License';
    case 'DRIVER_APPLICATION':
      return 'Application';
    case 'GENERAL':
      return 'General';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function formatDate(isoStr: string): string {
  return new Date(isoStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function SafetyEventCell({ count }: { count: number }) {
  if (count === 0) {
    return <span className="text-sm text-green-600 font-medium">None</span>;
  }
  if (count <= 2) {
    return (
      <span className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
        {count}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
      {count}
    </span>
  );
}

export function DriverComplianceTable({ drivers }: DriverComplianceTableProps) {
  if (drivers.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold mb-4">Driver Compliance</h2>
        <div className="py-10 text-center">
          <p className="text-muted-foreground text-sm">No driver compliance documents found.</p>
          <p className="text-muted-foreground text-xs mt-1">
            Upload driver licenses and certifications on each driver&apos;s profile.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card shadow-sm overflow-hidden">
      <div className="p-5 border-b border-border">
        <h2 className="text-base font-semibold">Driver Compliance</h2>
        <p className="text-xs text-muted-foreground mt-0.5">{drivers.length} driver{drivers.length !== 1 ? 's' : ''} with tracked documents</p>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Driver</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Documents</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Safety Events (90d)</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {drivers.map((driver) => {
              const shownDocs = driver.documents.slice(0, 3);
              const moreDocs = driver.documents.length - shownDocs.length;

              return (
                <tr key={driver.driverId} className="hover:bg-muted/30 transition-colors">
                  {/* Driver name */}
                  <td className="px-4 py-3">
                    <div className="font-medium">{driver.driverName}</div>
                    {!driver.isActive && (
                      <span className="text-xs text-muted-foreground">Inactive</span>
                    )}
                  </td>

                  {/* Overall status */}
                  <td className="px-4 py-3">
                    <StatusBadge status={driver.overallStatus} />
                  </td>

                  {/* Documents list */}
                  <td className="px-4 py-3">
                    <div className="space-y-1">
                      {shownDocs.map((doc) => (
                        <div key={doc.id} className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">
                            {formatDocumentType(doc.documentType)}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(doc.expiryDate)}
                          </span>
                          <StatusBadge status={doc.status} />
                        </div>
                      ))}
                      {moreDocs > 0 && (
                        <span className="text-xs text-muted-foreground">+{moreDocs} more</span>
                      )}
                    </div>
                  </td>

                  {/* Safety events */}
                  <td className="px-4 py-3">
                    <SafetyEventCell count={driver.highCriticalEvents} />
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <Link
                      href={`/drivers/${driver.driverId}`}
                      className="text-xs text-primary hover:underline"
                    >
                      View Driver
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
