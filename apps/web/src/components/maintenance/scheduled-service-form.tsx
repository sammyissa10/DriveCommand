'use client';

import type { ActionState } from '@drivecommand/types';

import { useActionState } from 'react';

interface ScheduledServiceFormProps {
  action: (prevState: ActionState | null, formData: FormData) => Promise<ActionState>;
  currentOdometer: number;
  submitLabel: string;
  initialValues?: {
    serviceType?: string;
    intervalDays?: number | null;
    intervalMiles?: number | null;
    baselineDate?: string;
    baselineOdometer?: number;
    notes?: string | null;
  };
}

export function ScheduledServiceForm({ action, currentOdometer, submitLabel, initialValues }: ScheduledServiceFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Get today's date in YYYY-MM-DD format for default value
  const today = new Date().toISOString().split('T')[0];

  const fieldErrors = typeof state?.error === 'object' ? state.error : undefined;
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
          defaultValue={initialValues?.serviceType ?? ''}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
          required
        />
        {fieldErrors?.serviceType && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors?.serviceType}</p>
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
          defaultValue={initialValues?.intervalDays ?? ''}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
        />
        {fieldErrors?.intervalDays && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors?.intervalDays}</p>
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
          defaultValue={initialValues?.intervalMiles ?? ''}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
        />
        {fieldErrors?.intervalMiles && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors?.intervalMiles}</p>
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
          defaultValue={initialValues?.baselineDate ?? today}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
          required
        />
        {fieldErrors?.baselineDate && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors?.baselineDate}</p>
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
          defaultValue={initialValues?.baselineOdometer ?? currentOdometer}
          min={0}
          step={1}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
          required
        />
        {fieldErrors?.baselineOdometer && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors?.baselineOdometer}</p>
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
          defaultValue={initialValues?.notes ?? ''}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
        />
        {fieldErrors?.notes && (
          <p className="mt-1 text-sm text-red-600">{fieldErrors?.notes}</p>
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
