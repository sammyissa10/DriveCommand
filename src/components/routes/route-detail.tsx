'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';

interface Driver {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  licenseNumber: string | null;
}

interface Truck {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
  vin: string;
}

interface RouteStop {
  id: string;
  position: number;
  type: string;
  address: string;
  status: string;
  scheduledAt: Date | null;
  arrivedAt: Date | null;
  departedAt: Date | null;
  notes: string | null;
}

interface Route {
  id: string;
  origin: string;
  destination: string;
  scheduledDate: Date;
  completedAt: Date | null;
  status: string;
  notes: string | null;
  driver: Driver;
  truck: Truck;
  stops?: RouteStop[];
}

function StopStatusBadge({ status }: { status: string }) {
  let cls = 'bg-muted text-muted-foreground';
  if (status === 'ARRIVED') cls = 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300';
  if (status === 'DEPARTED') cls = 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${cls}`}>
      {status}
    </span>
  );
}

interface RouteDetailProps {
  route: Route;
  formattedScheduledDate: string;
  formattedCompletedAt?: string;
  statusActions: React.ReactNode;
}

export function RouteDetail({
  route,
  formattedScheduledDate,
  formattedCompletedAt,
  statusActions,
}: RouteDetailProps) {
  // Status badge colors
  let statusClass = 'bg-muted text-muted-foreground';

  if (route.status === 'IN_PROGRESS') {
    statusClass = 'bg-blue-100 text-blue-800';
  } else if (route.status === 'COMPLETED') {
    statusClass = 'bg-emerald-100 text-emerald-800';
  }

  const displayStatus = route.status.replace(/_/g, ' ');

  return (
    <div className="space-y-6">
      {/* Section 1: Route Information */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-card-foreground">Route Details</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Origin</p>
            <p className="mt-1 text-sm text-card-foreground">{route.origin}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">Destination</p>
            <p className="mt-1 text-sm text-card-foreground">{route.destination}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">Scheduled Date</p>
            <p className="mt-1 text-sm text-card-foreground">{formattedScheduledDate}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">Status</p>
            <span
              className={`mt-1 inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}
            >
              {displayStatus}
            </span>
          </div>

          {formattedCompletedAt && (
            <div>
              <p className="text-sm font-medium text-muted-foreground">Completed At</p>
              <p className="mt-1 text-sm text-card-foreground">{formattedCompletedAt}</p>
            </div>
          )}
        </div>

        {route.notes && (
          <div className="mt-4">
            <p className="text-sm font-medium text-muted-foreground">Notes</p>
            <p className="mt-1 text-sm text-card-foreground whitespace-pre-wrap">
              {route.notes}
            </p>
          </div>
        )}

        {/* Status Actions */}
        <div className="mt-6">{statusActions}</div>
      </div>

      {/* Section 2: Stops Timeline */}
      {route.stops && route.stops.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-card-foreground">Stops</h2>
          <ol className="space-y-3">
            {route.stops.map((stop) => (
              <li key={stop.id} className="flex gap-3 items-start">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold">
                  {stop.position}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-card-foreground">{stop.address}</p>
                  <div className="flex flex-wrap items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">{stop.type}</span>
                    <StopStatusBadge status={stop.status} />
                    {stop.scheduledAt && (
                      <span className="text-xs text-muted-foreground">
                        Sched: {new Date(stop.scheduledAt).toLocaleString()}
                      </span>
                    )}
                    {stop.arrivedAt && (
                      <span className="text-xs text-emerald-600">
                        Arrived: {new Date(stop.arrivedAt).toLocaleString()}
                      </span>
                    )}
                    {stop.departedAt && (
                      <span className="text-xs text-blue-600">
                        Departed: {new Date(stop.departedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                  {stop.notes && (
                    <p className="text-xs text-muted-foreground mt-0.5">{stop.notes}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Section 3: Assigned Driver */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-card-foreground">Assigned Driver</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Name</p>
            <p className="mt-1 text-sm text-card-foreground">
              {route.driver.firstName || ''} {route.driver.lastName || ''}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">Email</p>
            <p className="mt-1 text-sm text-card-foreground">{route.driver.email}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">License Number</p>
            <p className="mt-1 text-sm text-card-foreground">
              {route.driver.licenseNumber || '—'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Link
            href={`/drivers/${route.driver.id}`}
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            View Driver Details
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>

      {/* Section 3: Assigned Truck */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
        <h2 className="mb-4 text-lg font-semibold text-card-foreground">Assigned Truck</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-muted-foreground">Vehicle</p>
            <p className="mt-1 text-sm text-card-foreground">
              {route.truck.year} {route.truck.make} {route.truck.model}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">License Plate</p>
            <p className="mt-1">
              <span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium">
                {route.truck.licensePlate}
              </span>
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-muted-foreground">VIN</p>
            <p className="mt-1 text-sm font-mono text-card-foreground">{route.truck.vin}</p>
          </div>
        </div>

        <div className="mt-4">
          <Link
            href={`/trucks/${route.truck.id}`}
            className="group inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary/80 transition-colors"
          >
            View Truck Details
            <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </div>
    </div>
  );
}
