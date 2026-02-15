'use client';

import { useActionState } from 'react';

interface MaintenanceEventFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  currentOdometer: number;
  submitLabel: string;
}

export function MaintenanceEventForm({ action, currentOdometer, submitLabel }: MaintenanceEventFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Get today's date in YYYY-MM-DD format for max attribute
  const today = new Date().toISOString().split('T')[0];

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {/* General error message */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Service Type */}
      <div>
        <label htmlFor="serviceType" className="block font-medium mb-1">
          Service Type
        </label>
        <input
          type="text"
          id="serviceType"
          name="serviceType"
          placeholder="e.g., Oil Change, Tire Rotation"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.serviceType && (
          <p className="mt-1 text-sm text-red-600">{state.error.serviceType}</p>
        )}
      </div>

      {/* Service Date */}
      <div>
        <label htmlFor="serviceDate" className="block font-medium mb-1">
          Service Date
        </label>
        <input
          type="date"
          id="serviceDate"
          name="serviceDate"
          defaultValue={today}
          max={today}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.serviceDate && (
          <p className="mt-1 text-sm text-red-600">{state.error.serviceDate}</p>
        )}
      </div>

      {/* Odometer at Service */}
      <div>
        <label htmlFor="odometerAtService" className="block font-medium mb-1">
          Odometer at Service (miles)
        </label>
        <input
          type="number"
          id="odometerAtService"
          name="odometerAtService"
          defaultValue={currentOdometer}
          min={0}
          step={1}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        <p className="mt-1 text-xs text-gray-500">Current odometer: {currentOdometer.toLocaleString()} miles</p>
        {state?.error?.odometerAtService && (
          <p className="mt-1 text-sm text-red-600">{state.error.odometerAtService}</p>
        )}
      </div>

      {/* Cost */}
      <div>
        <label htmlFor="cost" className="block font-medium mb-1">
          Cost (optional)
        </label>
        <input
          type="number"
          id="cost"
          name="cost"
          min={0}
          step={0.01}
          placeholder="0.00"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        />
        {state?.error?.cost && (
          <p className="mt-1 text-sm text-red-600">{state.error.cost}</p>
        )}
      </div>

      {/* Provider */}
      <div>
        <label htmlFor="provider" className="block font-medium mb-1">
          Provider (optional)
        </label>
        <input
          type="text"
          id="provider"
          name="provider"
          placeholder="e.g., Joe's Auto Shop"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        />
        {state?.error?.provider && (
          <p className="mt-1 text-sm text-red-600">{state.error.provider}</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block font-medium mb-1">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        />
        {state?.error?.notes && (
          <p className="mt-1 text-sm text-red-600">{state.error.notes}</p>
        )}
      </div>

      {/* Submit Button */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
