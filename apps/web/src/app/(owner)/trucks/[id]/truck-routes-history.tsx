'use client';

import Link from 'next/link';
import { ExternalLink } from 'lucide-react';

type TruckRoute = {
  id: string;
  name: string | null;
  origin: string;
  destination: string;
  status: string;
  scheduledDate: Date;
  archivedAt: Date | null;
};

interface TruckRoutesHistoryProps {
  routes: TruckRoute[];
}

type RouteStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

function RouteStatusBadge({ status }: { status: string }) {
  const styles: Record<RouteStatus, string> = {
    PLANNED: 'bg-muted text-muted-foreground',
    IN_PROGRESS: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    COMPLETED: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
  };
  const labels: Record<RouteStatus, string> = {
    PLANNED: 'Planned',
    IN_PROGRESS: 'In Progress',
    COMPLETED: 'Completed',
  };
  const style = styles[status as RouteStatus] ?? 'bg-muted text-muted-foreground';
  const label = labels[status as RouteStatus] ?? status.replace(/_/g, ' ');

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${style}`}>
      {label}
    </span>
  );
}

function formatDate(date: Date): string {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function routeDisplayName(route: TruckRoute): string {
  return route.name ?? `${route.origin} \u2192 ${route.destination}`;
}

export function TruckRoutesHistory({ routes }: TruckRoutesHistoryProps) {
  if (routes.length === 0) {
    return (
      <div className="text-center py-8">
        <p className="text-sm text-muted-foreground">No routes have been assigned to this truck yet.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {routes.map((route) => (
        <div key={route.id} className="rounded-lg border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Route name + link */}
              <div className="flex items-center gap-2 flex-wrap mb-1">
                <Link
                  href={`/routes/${route.id}`}
                  className="text-sm font-semibold text-card-foreground hover:text-primary transition-colors inline-flex items-center gap-1"
                >
                  {routeDisplayName(route)}
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </Link>
                <RouteStatusBadge status={route.status} />
                {route.archivedAt && (
                  <span className="text-xs text-muted-foreground">(Archived)</span>
                )}
              </div>

              {/* Scheduled date */}
              <p className="text-xs text-muted-foreground">
                Scheduled: {formatDate(route.scheduledDate)}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
