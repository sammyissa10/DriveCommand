'use client';

import Link from 'next/link';
import { CheckCircle } from 'lucide-react';
import type { ComplianceAlert } from '@/app/(owner)/actions/compliance';

interface ComplianceAlertsPanelProps {
  alerts: ComplianceAlert[];
}

function formatDocumentType(type: string): string {
  switch (type) {
    case 'DRIVER_LICENSE':
      return 'Driver License';
    case 'DRIVER_APPLICATION':
      return 'Driver Application';
    case 'GENERAL':
      return 'General Document';
    case 'Registration':
      return 'Registration';
    case 'Insurance':
      return 'Insurance';
    default:
      return type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
}

function alertHref(alert: ComplianceAlert): string {
  if (alert.type === 'driver_document') {
    return `/drivers/${alert.entityId}`;
  }
  return `/trucks/${alert.entityId}`;
}

export function ComplianceAlertsPanel({ alerts }: ComplianceAlertsPanelProps) {
  const displayAlerts = alerts.slice(0, 20);
  const remaining = alerts.length - displayAlerts.length;

  if (alerts.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-semibold mb-4">Compliance Alerts</h2>
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <CheckCircle className="h-10 w-10 text-green-500 mb-3" />
          <p className="font-medium text-green-700 dark:text-green-400">All Clear</p>
          <p className="text-sm text-muted-foreground mt-1">
            No expired or expiring documents found.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-semibold mb-4">
        Compliance Alerts
        <span className="ml-2 inline-flex items-center rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
          {alerts.length}
        </span>
      </h2>

      <ul className="max-h-96 overflow-y-auto divide-y divide-border -mx-5 px-5">
        {displayAlerts.map((alert, idx) => {
          const isExpired = alert.status === 'EXPIRED';
          const absDay = Math.abs(alert.daysUntilExpiry);
          const dayLabel = isExpired
            ? `${absDay} day${absDay !== 1 ? 's' : ''} overdue`
            : `${absDay} day${absDay !== 1 ? 's' : ''} remaining`;

          return (
            <li key={idx} className="py-3 flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
                      isExpired
                        ? 'bg-destructive/10 text-destructive'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                    }`}
                  >
                    {isExpired ? 'Expired' : 'Expiring Soon'}
                  </span>
                  <span className="text-sm font-medium truncate">
                    {alert.entityName}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {formatDocumentType(alert.item)}
                </p>
                <p
                  className={`mt-0.5 text-xs font-medium ${
                    isExpired ? 'text-destructive' : 'text-amber-600 dark:text-amber-400'
                  }`}
                >
                  {dayLabel}
                </p>
              </div>
              <Link
                href={alertHref(alert)}
                className="shrink-0 text-xs text-primary hover:underline whitespace-nowrap"
              >
                View
              </Link>
            </li>
          );
        })}
      </ul>

      {remaining > 0 && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          and {remaining} more...
        </p>
      )}
    </div>
  );
}
