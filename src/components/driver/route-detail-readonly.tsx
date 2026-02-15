/**
 * Read-only route + truck detail component for driver portal.
 * Uses semantic HTML (dl/dt/dd) for data display.
 * No edit controls, no status transition buttons, no navigation links.
 */

interface RouteDetailReadOnlyProps {
  route: {
    id: string;
    origin: string;
    destination: string;
    scheduledDate: Date;
    completedAt: Date | null;
    status: string;
    notes: string | null;
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
      documentMetadata: any;
    };
  };
  formattedScheduledDate: string;
  formattedCompletedAt?: string;
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

  return (
    <div className="space-y-6">
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
