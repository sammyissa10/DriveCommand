'use client';

import { useActionState } from 'react';

interface ScheduledServiceFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  currentOdometer: number;
  submitLabel: string;
}

export function ScheduledServiceForm({ action, currentOdometer, submitLabel }: ScheduledServiceFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Get today's date in YYYY-MM-DD format for default value
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
          placeholder="e.g., Oil Change, Brake Inspection"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.serviceType && (
          <p className="mt-1 text-sm text-red-600">{state.error.serviceType}</p>
        )}
      </div>

      {/* Interval Days */}
      <div>
        <label htmlFor="intervalDays" className="block font-medium mb-1">
          Time Interval (days)
        </label>
        <input
          type="number"
          id="intervalDays"
          name="intervalDays"
          min={1}
          step={1}
          placeholder="e.g., 90"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        />
        {state?.error?.intervalDays && (
          <p className="mt-1 text-sm text-red-600">{state.error.intervalDays}</p>
        )}
      </div>

      {/* Interval Miles */}
      <div>
        <label htmlFor="intervalMiles" className="block font-medium mb-1">
          Mileage Interval (miles)
        </label>
        <input
          type="number"
          id="intervalMiles"
          name="intervalMiles"
          min={1}
          step={1}
          placeholder="e.g., 5000"
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
        />
        {state?.error?.intervalMiles && (
          <p className="mt-1 text-sm text-red-600">{state.error.intervalMiles}</p>
        )}
        <p className="mt-1 text-xs text-gray-500">
          At least one interval is required. Service is due when EITHER trigger is met.
        </p>
      </div>

      {/* Baseline Date */}
      <div>
        <label htmlFor="baselineDate" className="block font-medium mb-1">
          Baseline Date (last service or today)
        </label>
        <input
          type="date"
          id="baselineDate"
          name="baselineDate"
          defaultValue={today}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.baselineDate && (
          <p className="mt-1 text-sm text-red-600">{state.error.baselineDate}</p>
        )}
      </div>

      {/* Baseline Odometer */}
      <div>
        <label htmlFor="baselineOdometer" className="block font-medium mb-1">
          Baseline Odometer
        </label>
        <input
          type="number"
          id="baselineOdometer"
          name="baselineOdometer"
          defaultValue={currentOdometer}
          min={0}
          step={1}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.baselineOdometer && (
          <p className="mt-1 text-sm text-red-600">{state.error.baselineOdometer}</p>
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
