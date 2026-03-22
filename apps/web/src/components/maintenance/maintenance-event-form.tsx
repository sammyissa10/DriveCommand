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
          placeholder="e.g., Oil Change, Tire Rotation"
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
          required
        />
        {state?.error?.serviceType && (
          <p className="mt-1 text-sm text-red-600">{state.error.serviceType}</p>
        )}
      </div>

      {/* Service Date */}
      <div>
        <label htmlFor="serviceDate" className="block text-sm font-medium text-foreground mb-1.5">
          Service Date
        </label>
        <input
          type="date"
          id="serviceDate"
          name="serviceDate"
          defaultValue={today}
          max={today}
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
          required
        />
        {state?.error?.serviceDate && (
          <p className="mt-1 text-sm text-red-600">{state.error.serviceDate}</p>
        )}
      </div>

      {/* Odometer at Service */}
      <div>
        <label htmlFor="odometerAtService" className="block text-sm font-medium text-foreground mb-1.5">
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
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">Current odometer: {currentOdometer.toLocaleString()} miles</p>
        {state?.error?.odometerAtService && (
          <p className="mt-1 text-sm text-red-600">{state.error.odometerAtService}</p>
        )}
      </div>

      {/* Cost */}
      <div>
        <label htmlFor="cost" className="block text-sm font-medium text-foreground mb-1.5">
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
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
        />
        {state?.error?.cost && (
          <p className="mt-1 text-sm text-red-600">{state.error.cost}</p>
        )}
      </div>

      {/* Provider */}
      <div>
        <label htmlFor="provider" className="block text-sm font-medium text-foreground mb-1.5">
          Provider (optional)
        </label>
        <input
          type="text"
          id="provider"
          name="provider"
          placeholder="e.g., Joe's Auto Shop"
          disabled={isPending}
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
        />
        {state?.error?.provider && (
          <p className="mt-1 text-sm text-red-600">{state.error.provider}</p>
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
