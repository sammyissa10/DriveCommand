'use client';

/**
 * Dashboard widget showing upcoming maintenance with color-coded urgency.
 */

import Link from 'next/link';
import { Wrench, ArrowRight } from 'lucide-react';
import type { UpcomingMaintenanceItem } from '@/app/(owner)/actions/notifications';

interface UpcomingMaintenanceWidgetProps {
  items: UpcomingMaintenanceItem[];
}

export function UpcomingMaintenanceWidget({ items }: UpcomingMaintenanceWidgetProps) {
  const displayItems = items.slice(0, 5);
  const remainingCount = items.length - displayItems.length;
  const overdueCount = items.filter((item) => item.isDue).length;

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-status-warning-bg">
            <Wrench className="h-4 w-4 text-status-warning-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-card-foreground">Upcoming Maintenance</h2>
        </div>
        {items.length > 0 && (
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${
              overdueCount > 0
                ? 'bg-status-danger-bg text-status-danger-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {items.length}
          </span>
        )}
      </div>

      {/* Items list */}
      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-8">
          <Wrench className="h-10 w-10 text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">No upcoming maintenance</p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayItems.map((item, index) => {
            let urgencyClass = 'border-border bg-card';
            if (item.isDue) {
              urgencyClass = 'border-status-danger/30 bg-status-danger-bg';
            } else if (
              (item.daysUntilDue !== null && item.daysUntilDue <= 14) ||
              (item.milesUntilDue !== null && item.milesUntilDue <= 500)
            ) {
              urgencyClass = 'border-status-warning/30 bg-status-warning-bg';
            }

            return (
              <div
                key={`${item.truckId}-${item.serviceType}-${index}`}
                className={`rounded-lg border p-3.5 transition-colors ${urgencyClass}`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <p className="font-semibold text-card-foreground">{item.truckName}</p>
                    <p className="text-sm text-muted-foreground">{item.serviceType}</p>
                  </div>
                  <div className="text-right">
                    {item.isDue ? (
                      <span className="inline-flex items-center rounded-full bg-status-danger-bg px-2 py-0.5 text-xs font-bold text-status-danger-foreground">
                        OVERDUE
                      </span>
                    ) : (
                      <div className="text-sm text-muted-foreground">
                        {item.daysUntilDue !== null && (
                          <div>
                            {item.daysUntilDue} day{item.daysUntilDue !== 1 ? 's' : ''}
                          </div>
                        )}
                        {item.milesUntilDue !== null && (
                          <div>
                            {item.milesUntilDue.toLocaleString()} mi
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {remainingCount > 0 && (
            <p className="pt-1 text-center text-sm text-muted-foreground">
              and {remainingCount} more...
            </p>
          )}
        </div>
      )}

      {/* Footer link */}
      <div className="mt-5 border-t border-border pt-4">
        <Link
          href="/trucks"
          className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
        >
          View all trucks
          <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
        </Link>
      </div>
    </div>
  );
}
