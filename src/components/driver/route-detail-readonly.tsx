'use client';

/**
 * Read-only route + truck detail component for driver portal.
 * Uses semantic HTML (dl/dt/dd) for data display.
 * No edit controls, no status transition buttons, no navigation links.
 *
 * Shows active stop (first non-DEPARTED) as a highlighted blue card.
 * Driver can mark ARRIVED stops as DEPARTED via button.
 */

import { useState } from 'react';

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

interface RouteDetailReadOnlyProps {
  route: {
    id: string;
    origin: string;
    destination: string;
    scheduledDate: Date;
    completedAt: Date | null;
    status: string;
    notes: string | null;
    stops?: RouteStop[];
    driver: {
      id: string;
      firstName: string | null;
      lastName: string | null;
      email: string;
      licenseNumber: string | null;
    };
    truck: {
      id: string;
      make: string;
      model: string;
      year: number;
      vin: string;
      licensePlate: string;
      odometer: number;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      documentMetadata: any;
    };
  };
  formattedScheduledDate: string;
  formattedCompletedAt?: string;
}

function MarkDepartedButton({ stopId }: { stopId: string }) {
  const [pending, setPending] = useState(false);

  async function handleClick() {
    setPending(true);
    try {
      const { markStopDeparted } = await import('@/app/(driver)/actions/driver-routes');
      const result = await markStopDeparted(stopId);
      if (result?.error) {
        alert(result.error);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={pending}
      className="rounded-md bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
    >
      {pending ? 'Marking...' : 'Mark Departed'}
    </button>
  );
}

export function RouteDetailReadOnly({
  route,
  formattedScheduledDate,
  formattedCompletedAt,
}: RouteDetailReadOnlyProps) {
  // Status badge colors
  let statusBgColor = 'bg-gray-100';
  let statusTextColor = 'text-gray-800';

  if (route.status === 'IN_PROGRESS') {
    statusBgColor = 'bg-blue-100';
    statusTextColor = 'text-blue-800';
  } else if (route.status === 'COMPLETED') {
    statusBgColor = 'bg-green-100';
    statusTextColor = 'text-green-800';
  }

  const displayStatus = route.status.replace(/_/g, ' ');

  // Format odometer with commas
  const formattedOdometer = route.truck.odometer.toLocaleString('en-US');

  // Derive the active stop — first non-DEPARTED by position
  const activeStop = route.stops
    ?.filter((s) => s.status !== 'DEPARTED')
    .sort((a, b) => a.position - b.position)[0] ?? null;

  return (
    <div className="space-y-6">
      {/* Active Stop Panel — shown above Route Details when a stop is pending/arrived */}
      {activeStop && (
        <div className="rounded-lg border-2 border-blue-300 bg-blue-50 dark:border-blue-700 dark:bg-blue-950/40 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">
            Next Stop — {activeStop.type}
          </p>
          <p className="mt-1 text-base font-medium text-blue-900 dark:text-blue-100">
            {activeStop.address}
          </p>
          {activeStop.scheduledAt && (
            <p className="mt-0.5 text-xs text-blue-700 dark:text-blue-300">
              Scheduled: {new Date(activeStop.scheduledAt).toLocaleString()}
            </p>
          )}
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                activeStop.status === 'ARRIVED'
                  ? 'bg-blue-200 text-blue-800'
                  : 'bg-gray-200 text-gray-700'
              }`}
            >
              {activeStop.status}
            </span>
            {activeStop.status === 'ARRIVED' && (
              <MarkDepartedButton stopId={activeStop.id} />
            )}
          </div>
        </div>
      )}

      {/* Section 1: Route Details */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Route Details</h2>

        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Origin</dt>
            <dd className="mt-1 text-sm text-gray-900">{route.origin}</dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Destination</dt>
            <dd className="mt-1 text-sm text-gray-900">{route.destination}</dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Scheduled Date</dt>
            <dd className="mt-1 text-sm text-gray-900">{formattedScheduledDate}</dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Status</dt>
            <dd className="mt-1">
              <span
                className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBgColor} ${statusTextColor}`}
              >
                {displayStatus}
              </span>
            </dd>
          </div>

          {formattedCompletedAt && (
            <div>
              <dt className="text-sm font-medium text-gray-500">Completed At</dt>
              <dd className="mt-1 text-sm text-gray-900">{formattedCompletedAt}</dd>
            </div>
          )}
        </dl>

        {route.notes && (
          <div className="mt-4">
            <dt className="text-sm font-medium text-gray-500">Notes</dt>
            <dd className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
              {route.notes}
            </dd>
          </div>
        )}
      </div>

      {/* All Stops list — shown when route has stops */}
      {route.stops && route.stops.length > 0 && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-gray-900">All Stops</h2>
          <ol className="space-y-3">
            {route.stops
              .slice()
              .sort((a, b) => a.position - b.position)
              .map((stop) => (
                <li key={stop.id} className="flex gap-3 items-start">
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      stop.status === 'DEPARTED'
                        ? 'bg-green-100 text-green-800'
                        : stop.status === 'ARRIVED'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {stop.position}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900">{stop.address}</p>
                    <p className="text-xs text-gray-500">
                      {stop.type} — {stop.status}
                    </p>
                  </div>
                </li>
              ))}
          </ol>
        </div>
      )}

      {/* Section 2: Assigned Truck */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-semibold text-gray-900">Assigned Truck</h2>

        <dl className="grid gap-4 sm:grid-cols-2">
          <div>
            <dt className="text-sm font-medium text-gray-500">Vehicle</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {route.truck.year} {route.truck.make} {route.truck.model}
            </dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">License Plate</dt>
            <dd className="mt-1 text-sm text-gray-900">{route.truck.licensePlate}</dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">VIN</dt>
            <dd className="mt-1 text-sm text-gray-900">{route.truck.vin}</dd>
          </div>

          <div>
            <dt className="text-sm font-medium text-gray-500">Odometer</dt>
            <dd className="mt-1 text-sm text-gray-900">{formattedOdometer} miles</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
