'use client';

import { useActionState } from 'react';

interface RouteFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  initialData?: {
    origin: string;
    destination: string;
    scheduledDate: string; // datetime-local format: YYYY-MM-DDTHH:mm
    driverId: string;
    truckId: string;
    notes?: string;
  };
  drivers: Array<{ id: string; firstName: string; lastName: string }>;
  trucks: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string;
  }>;
  submitLabel: string;
}

export function RouteForm({
  action,
  initialData,
  drivers,
  trucks,
  submitLabel,
}: RouteFormProps) {
  const [state, formAction, isPending] = useActionState(action, {
    success: false,
  });

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {/* Origin */}
      <div>
        <label
          htmlFor="origin"
          className="block text-sm font-medium text-gray-700"
        >
          Origin
        </label>
        <input
          type="text"
          id="origin"
          name="origin"
          defaultValue={initialData?.origin || ''}
          maxLength={200}
          required
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        />
        {state?.error?.origin && (
          <p className="mt-1 text-sm text-red-600">{state.error.origin}</p>
        )}
      </div>

      {/* Destination */}
      <div>
        <label
          htmlFor="destination"
          className="block text-sm font-medium text-gray-700"
        >
          Destination
        </label>
        <input
          type="text"
          id="destination"
          name="destination"
          defaultValue={initialData?.destination || ''}
          maxLength={200}
          required
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        />
        {state?.error?.destination && (
          <p className="mt-1 text-sm text-red-600">{state.error.destination}</p>
        )}
      </div>

      {/* Scheduled Date */}
      <div>
        <label
          htmlFor="scheduledDate"
          className="block text-sm font-medium text-gray-700"
        >
          Scheduled Date
        </label>
        <input
          type="datetime-local"
          id="scheduledDate"
          name="scheduledDate"
          defaultValue={initialData?.scheduledDate || ''}
          required
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        />
        {state?.error?.scheduledDate && (
          <p className="mt-1 text-sm text-red-600">
            {state.error.scheduledDate}
          </p>
        )}
      </div>

      {/* Driver */}
      <div>
        <label
          htmlFor="driverId"
          className="block text-sm font-medium text-gray-700"
        >
          Driver
        </label>
        <select
          id="driverId"
          name="driverId"
          defaultValue={initialData?.driverId || ''}
          required
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">Select a driver...</option>
          {drivers.map((driver) => (
            <option key={driver.id} value={driver.id}>
              {driver.firstName} {driver.lastName}
            </option>
          ))}
        </select>
        {state?.error?.driverId && (
          <p className="mt-1 text-sm text-red-600">{state.error.driverId}</p>
        )}
      </div>

      {/* Truck */}
      <div>
        <label
          htmlFor="truckId"
          className="block text-sm font-medium text-gray-700"
        >
          Truck
        </label>
        <select
          id="truckId"
          name="truckId"
          defaultValue={initialData?.truckId || ''}
          required
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        >
          <option value="">Select a truck...</option>
          {trucks.map((truck) => (
            <option key={truck.id} value={truck.id}>
              {truck.year} {truck.make} {truck.model} ({truck.licensePlate})
            </option>
          ))}
        </select>
        {state?.error?.truckId && (
          <p className="mt-1 text-sm text-red-600">{state.error.truckId}</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label
          htmlFor="notes"
          className="block text-sm font-medium text-gray-700"
        >
          Notes (Optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          defaultValue={initialData?.notes || ''}
          maxLength={1000}
          rows={4}
          disabled={isPending}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-gray-50 disabled:text-gray-500"
        />
        {state?.error?.notes && (
          <p className="mt-1 text-sm text-red-600">{state.error.notes}</p>
        )}
      </div>

      {/* General Error */}
      {state?.error?.message && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-800">{state.error.message}</p>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed"
      >
        {isPending ? 'Saving...' : submitLabel}
      </button>
    </form>
  );
}
