'use client';

import { useActionState } from 'react';

interface LoadFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  initialData?: {
    customerId?: string;
    driverId?: string | null;
    origin?: string;
    destination?: string;
    pickupDate?: string;
    deliveryDate?: string;
    weight?: number | null;
    commodity?: string | null;
    rate?: string | number;
    notes?: string | null;
  };
  submitLabel: string;
  customers: Array<{ id: string; companyName: string }>;
  drivers?: Array<{ id: string; firstName: string | null; lastName: string | null }>;
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'block text-sm font-medium text-foreground mb-1.5';

export function LoadForm({ action, initialData, submitLabel, customers, drivers = [] }: LoadFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Load Details */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Load Details
        </h3>

        <div>
          <label htmlFor="customerId" className={labelClass}>
            Customer
          </label>
          <select
            id="customerId"
            name="customerId"
            defaultValue={initialData?.customerId || ''}
            disabled={isPending}
            className={inputClass}
            required
          >
            <option value="">Select a customer</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </select>
          {state?.error?.customerId && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.customerId}</p>
          )}
        </div>

        <div>
          <label htmlFor="driverId" className={labelClass}>
            Driver <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <select
            id="driverId"
            name="driverId"
            defaultValue={initialData?.driverId || ''}
            disabled={isPending}
            className={inputClass}
          >
            <option value="">No driver assigned</option>
            {drivers.map((d) => (
              <option key={d.id} value={d.id}>
                {[d.firstName, d.lastName].filter(Boolean).join(' ') || 'Unnamed Driver'}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="origin" className={labelClass}>
              Origin
            </label>
            <input
              type="text"
              id="origin"
              name="origin"
              defaultValue={initialData?.origin || ''}
              disabled={isPending}
              className={inputClass}
              required
              placeholder="City, State"
            />
            {state?.error?.origin && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.origin}</p>
            )}
          </div>
          <div>
            <label htmlFor="destination" className={labelClass}>
              Destination
            </label>
            <input
              type="text"
              id="destination"
              name="destination"
              defaultValue={initialData?.destination || ''}
              disabled={isPending}
              className={inputClass}
              required
              placeholder="City, State"
            />
            {state?.error?.destination && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.destination}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="commodity" className={labelClass}>
              Commodity <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="text"
              id="commodity"
              name="commodity"
              defaultValue={initialData?.commodity || ''}
              disabled={isPending}
              className={inputClass}
              placeholder="e.g., Dry goods, Refrigerated"
            />
          </div>
          <div>
            <label htmlFor="weight" className={labelClass}>
              Weight <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="number"
              id="weight"
              name="weight"
              defaultValue={initialData?.weight ?? ''}
              disabled={isPending}
              className={inputClass}
              placeholder="lbs"
              min="0"
            />
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Schedule
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="pickupDate" className={labelClass}>
              Pickup Date
            </label>
            <input
              type="date"
              id="pickupDate"
              name="pickupDate"
              defaultValue={initialData?.pickupDate || ''}
              disabled={isPending}
              className={inputClass}
              required
            />
            {state?.error?.pickupDate && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.pickupDate}</p>
            )}
          </div>
          <div>
            <label htmlFor="deliveryDate" className={labelClass}>
              Delivery Date <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="date"
              id="deliveryDate"
              name="deliveryDate"
              defaultValue={initialData?.deliveryDate || ''}
              disabled={isPending}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Pricing */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Pricing
        </h3>

        <div>
          <label htmlFor="rate" className={labelClass}>
            Rate
          </label>
          <input
            type="number"
            id="rate"
            name="rate"
            defaultValue={initialData?.rate !== undefined ? String(initialData.rate) : ''}
            disabled={isPending}
            className={inputClass}
            step="0.01"
            min="0"
            placeholder="$0.00"
            required
          />
          {state?.error?.rate && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.rate}</p>
          )}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-4 border-t border-border pt-6">
        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={initialData?.notes || ''}
            disabled={isPending}
            className={inputClass}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="pt-2">
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
