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
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Service Type */}
      <div>
        <label htmlFor="serviceType" className="block text-sm font-medium text-foreground mb-1.5">
          Service Type
        </label>
        <input
          type="text"
          id="serviceType"
          name="serviceType"
          placeholder="e.g., Oil Change, Brake Inspection"
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
          required
        />
        {state?.error?.serviceType && (
          <p className="mt-1 text-sm text-red-600">{state.error.serviceType}</p>
        )}
      </div>

      {/* Interval Days */}
      <div>
        <label htmlFor="intervalDays" className="block text-sm font-medium text-foreground mb-1.5">
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
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
        />
        {state?.error?.intervalDays && (
          <p className="mt-1 text-sm text-red-600">{state.error.intervalDays}</p>
        )}
      </div>

      {/* Interval Miles */}
      <div>
        <label htmlFor="intervalMiles" className="block text-sm font-medium text-foreground mb-1.5">
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
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
        />
        {state?.error?.intervalMiles && (
          <p className="mt-1 text-sm text-red-600">{state.error.intervalMiles}</p>
        )}
        <p className="mt-1 text-xs text-muted-foreground">
          At least one interval is required. Service is due when EITHER trigger is met.
        </p>
      </div>

      {/* Baseline Date */}
      <div>
        <label htmlFor="baselineDate" className="block text-sm font-medium text-foreground mb-1.5">
          Baseline Date (last service or today)
        </label>
        <input
          type="date"
          id="baselineDate"
          name="baselineDate"
          defaultValue={today}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
          required
        />
        {state?.error?.baselineDate && (
          <p className="mt-1 text-sm text-red-600">{state.error.baselineDate}</p>
        )}
      </div>

      {/* Baseline Odometer */}
      <div>
        <label htmlFor="baselineOdometer" className="block text-sm font-medium text-foreground mb-1.5">
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
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
          required
        />
        {state?.error?.baselineOdometer && (
          <p className="mt-1 text-sm text-red-600">{state.error.baselineOdometer}</p>
        )}
      </div>

      {/* Notes */}
      <div>
        <label htmlFor="notes" className="block text-sm font-medium text-foreground mb-1.5">
          Notes (optional)
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
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
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
