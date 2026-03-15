'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Trash2, ExternalLink } from 'lucide-react';
import { deleteDriverRouteJoin } from '@/app/(owner)/actions/driver-route-joins';

type RouteInfo = {
  id: string;
  name: string | null;
  origin: string;
  destination: string;
  scheduledDate: Date;
  status: string;
};

type DriverRouteJoinWithRoute = {
  id: string;
  driverId: string;
  routeId: string;
  isMainDriver: boolean;
  paymentMethod: 'FIXED_AMOUNT' | 'HOURLY' | 'PER_MILE';
  fixedAmount: any | null;
  hourlyRate: any | null;
  numberOfHours: any | null;
  perMileRate: any | null;
  numberOfMiles: any | null;
  createdAt: Date;
  route: RouteInfo;
};

type PrimaryRouteInfo = {
  id: string;
  name: string | null;
  origin: string;
  destination: string;
  scheduledDate: Date;
  status: string;
};

interface DriverRouteAssignmentsSectionProps {
  driverId: string;
  initialAssignments: DriverRouteJoinWithRoute[];
  primaryRoutes: PrimaryRouteInfo[];
}

function formatCurrency(value: any, decimals = 2): string {
  const num = parseFloat(value?.toString() ?? '0');
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

function computeTotal(assignment: DriverRouteJoinWithRoute): number {
  switch (assignment.paymentMethod) {
    case 'FIXED_AMOUNT':
      return parseFloat(assignment.fixedAmount?.toString() ?? '0');
    case 'HOURLY': {
      const rate = parseFloat(assignment.hourlyRate?.toString() ?? '0');
      const hours = parseFloat(assignment.numberOfHours?.toString() ?? '0');
      return rate * hours;
    }
    case 'PER_MILE': {
      const rate = parseFloat(assignment.perMileRate?.toString() ?? '0');
      const miles = parseFloat(assignment.numberOfMiles?.toString() ?? '0');
      return rate * miles;
    }
    default:
      return 0;
  }
}

function formatPaymentSummary(assignment: DriverRouteJoinWithRoute): string {
  switch (assignment.paymentMethod) {
    case 'FIXED_AMOUNT':
      return `Fixed: ${formatCurrency(assignment.fixedAmount)}`;
    case 'HOURLY':
      return `Hourly: ${formatCurrency(assignment.hourlyRate)}/hr × ${parseFloat(assignment.numberOfHours?.toString() ?? '0')} hrs`;
    case 'PER_MILE':
      return `Per Mile: ${formatCurrency(assignment.perMileRate, 4)}/mi × ${parseFloat(assignment.numberOfMiles?.toString() ?? '0')} mi`;
    default:
      return '';
  }
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function routeDisplayName(route: RouteInfo | PrimaryRouteInfo): string {
  return route.name ?? `${route.origin} \u2192 ${route.destination}`;
}

type RouteStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

function RouteStatusBadge({ status }: { status: string }) {
  const styles: Record<RouteStatus, string> = {
    PLANNED: 'bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
    IN_PROGRESS: 'bg-yellow-50 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400',
    COMPLETED: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  };
  const labels: Record<RouteStatus, string> = {
    PLANNED: 'Planned',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
  };
  const style = styles[status as RouteStatus] ?? 'bg-muted text-muted-foreground';
  const label = labels[status as RouteStatus] ?? status;

  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}
    >
      {label}
    </span>
  );
}

// Unified display item discriminated union
type JoinDisplayItem = {
  source: 'join';
  joinId: string;
  routeId: string;
  routeName: string | null;
  origin: string;
  destination: string;
  scheduledDate: Date;
  status: string;
  isMainDriver: boolean;
  assignment: DriverRouteJoinWithRoute;
};

type PrimaryDisplayItem = {
  source: 'primary';
  routeId: string;
  routeName: string | null;
  origin: string;
  destination: string;
  scheduledDate: Date;
  status: string;
};

type DisplayItem = JoinDisplayItem | PrimaryDisplayItem;

export function DriverRouteAssignmentsSection({
  driverId,
  initialAssignments,
  primaryRoutes,
}: DriverRouteAssignmentsSectionProps) {
  const router = useRouter();
  const [deletingJoinId, setDeletingJoinId] = useState<string | null>(null);

  const handleDelete = async (joinId: string) => {
    if (!window.confirm('Remove this route assignment?')) return;
    setDeletingJoinId(joinId);
    const result = await deleteDriverRouteJoin(joinId);
    setDeletingJoinId(null);
    if (result.error) {
      alert(result.error);
    } else {
      router.refresh();
    }
  };

  // Build set of routeIds that already have a DriverRouteJoin entry
  const joinRouteIds = new Set(initialAssignments.map((a) => a.routeId));

  // Build unified display list
  const joinItems: JoinDisplayItem[] = initialAssignments.map((a) => ({
    source: 'join',
    joinId: a.id,
    routeId: a.routeId,
    routeName: a.route.name,
    origin: a.route.origin,
    destination: a.route.destination,
    scheduledDate: a.route.scheduledDate,
    status: a.route.status,
    isMainDriver: a.isMainDriver,
    assignment: a,
  }));

  // Only include primary routes not already covered by a DriverRouteJoin entry
  const primaryItems: PrimaryDisplayItem[] = primaryRoutes
    .filter((r) => !joinRouteIds.has(r.id))
    .map((r) => ({
      source: 'primary',
      routeId: r.id,
      routeName: r.name,
      origin: r.origin,
      destination: r.destination,
      scheduledDate: r.scheduledDate,
      status: r.status,
    }));

  const allItems: DisplayItem[] = [...joinItems, ...primaryItems].sort(
    (a, b) => new Date(b.scheduledDate).getTime() - new Date(a.scheduledDate).getTime()
  );

  return (
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <h2 className="text-lg font-semibold text-card-foreground mb-4">Route Assignments</h2>

      {/* Empty state */}
      {allItems.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-sm text-muted-foreground">
            This driver has no route assignments.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {allItems.map((item) => {
            if (item.source === 'join') {
              const { assignment, joinId } = item;
              const isDeleting = deletingJoinId === joinId;
              const total = computeTotal(assignment);

              return (
                <div
                  key={joinId}
                  className="rounded-lg border border-border bg-card p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      {/* Route name + status + role badge */}
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <Link
                          href={`/routes/${item.routeId}`}
                          className="text-sm font-semibold text-card-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                        >
                          {routeDisplayName(assignment.route)}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </Link>
                        <RouteStatusBadge status={item.status} />
                        {item.isMainDriver ? (
                          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                            Primary Driver
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            Co-Driver
                          </span>
                        )}
                      </div>

                      {/* Scheduled date */}
                      <p className="text-xs text-muted-foreground mb-1">
                        Scheduled: {formatDate(item.scheduledDate)}
                      </p>

                      {/* Payment summary + total */}
                      <p className="text-sm text-muted-foreground">
                        {formatPaymentSummary(assignment)}
                      </p>
                      <p className="text-sm font-medium text-foreground mt-0.5">
                        Total: {formatCurrency(total)}
                      </p>
                    </div>

                    {/* Delete button */}
                    <button
                      onClick={() => handleDelete(joinId)}
                      disabled={isDeleting}
                      className="rounded-lg p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50 shrink-0"
                      title="Remove assignment"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            }

            // source === 'primary'
            return (
              <div
                key={item.routeId}
                className="rounded-lg border border-border bg-card p-4"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0">
                    {/* Route name + status + Primary Driver badge */}
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Link
                        href={`/routes/${item.routeId}`}
                        className="text-sm font-semibold text-card-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                      >
                        {item.routeName ?? `${item.origin} \u2192 ${item.destination}`}
                        <ExternalLink className="h-3 w-3 opacity-60" />
                      </Link>
                      <RouteStatusBadge status={item.status} />
                      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                        Primary Driver
                      </span>
                    </div>

                    {/* Scheduled date */}
                    <p className="text-xs text-muted-foreground">
                      Scheduled: {formatDate(item.scheduledDate)}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
