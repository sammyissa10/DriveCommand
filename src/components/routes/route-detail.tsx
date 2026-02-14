'use client';

import Link from 'next/link';

interface Driver {
  id: string;
  firstName: string;
  lastName: string;
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

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Section 1: Route Information */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h1 className="mb-4 text-2xl font-bold text-gray-900">Route Details</h1>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-gray-500">Origin</p>
            <p className="mt-1 text-sm text-gray-900">{route.origin}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500">Destination</p>
            <p className="mt-1 text-sm text-gray-900">{route.destination}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500">Scheduled Date</p>
            <p className="mt-1 text-sm text-gray-900">{formattedScheduledDate}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500">Status</p>
            <span
              className={`mt-1 inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBgColor} ${statusTextColor}`}
            >
              {displayStatus}
            </span>
          </div>

          {formattedCompletedAt && (
            <div>
              <p className="text-sm font-medium text-gray-500">Completed At</p>
              <p className="mt-1 text-sm text-gray-900">{formattedCompletedAt}</p>
            </div>
          )}
        </div>

        {route.notes && (
          <div className="mt-4">
            <p className="text-sm font-medium text-gray-500">Notes</p>
            <p className="mt-1 text-sm text-gray-900 whitespace-pre-wrap">
              {route.notes}
            </p>
          </div>
        )}

        {/* Status Actions */}
        <div className="mt-6">{statusActions}</div>
      </div>

      {/* Section 2: Assigned Driver */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Assigned Driver</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-gray-500">Name</p>
            <p className="mt-1 text-sm text-gray-900">
              {route.driver.firstName} {route.driver.lastName}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500">Email</p>
            <p className="mt-1 text-sm text-gray-900">{route.driver.email}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500">License Number</p>
            <p className="mt-1 text-sm text-gray-900">
              {route.driver.licenseNumber || '—'}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <Link
            href={`/drivers/${route.driver.id}`}
            className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
          >
            View Driver Details →
          </Link>
        </div>
      </div>

      {/* Section 3: Assigned Truck */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
        <h2 className="mb-4 text-xl font-bold text-gray-900">Assigned Truck</h2>

        <div className="grid gap-4 lg:grid-cols-2">
          <div>
            <p className="text-sm font-medium text-gray-500">Vehicle</p>
            <p className="mt-1 text-sm text-gray-900">
              {route.truck.year} {route.truck.make} {route.truck.model}
            </p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500">License Plate</p>
            <p className="mt-1 text-sm text-gray-900">{route.truck.licensePlate}</p>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-500">VIN</p>
            <p className="mt-1 text-sm text-gray-900">{route.truck.vin}</p>
          </div>
        </div>

        <div className="mt-4">
          <Link
            href={`/trucks/${route.truck.id}`}
            className="inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
          >
            View Truck Details →
          </Link>
        </div>
      </div>
    </div>
  );
}
