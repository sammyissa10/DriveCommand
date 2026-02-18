'use client';

import { useActionState } from 'react';

interface CustomerFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  initialData?: {
    companyName?: string;
    contactName?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    priority?: string;
    status?: string;
    notes?: string;
    emailNotifications?: boolean;
  };
  submitLabel: string;
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'block text-sm font-medium text-foreground mb-1.5';

export function CustomerForm({ action, initialData, submitLabel }: CustomerFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Company Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Company Information
        </h3>

        <div>
          <label htmlFor="companyName" className={labelClass}>
            Company Name
          </label>
          <input
            type="text"
            id="companyName"
            name="companyName"
            defaultValue={initialData?.companyName || ''}
            disabled={isPending}
            className={inputClass}
            required
          />
          {state?.error?.companyName && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.companyName}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="priority" className={labelClass}>
              Priority
            </label>
            <select
              id="priority"
              name="priority"
              defaultValue={initialData?.priority || 'MEDIUM'}
              disabled={isPending}
              className={inputClass}
            >
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="VIP">VIP</option>
            </select>
          </div>
          <div>
            <label htmlFor="status" className={labelClass}>
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={initialData?.status || 'ACTIVE'}
              disabled={isPending}
              className={inputClass}
            >
              <option value="ACTIVE">Active</option>
              <option value="INACTIVE">Inactive</option>
              <option value="PROSPECT">Prospect</option>
            </select>
          </div>
        </div>
      </div>

      {/* Contact Info */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Contact Details
        </h3>

        <div>
          <label htmlFor="contactName" className={labelClass}>
            Contact Name <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            type="text"
            id="contactName"
            name="contactName"
            defaultValue={initialData?.contactName || ''}
            disabled={isPending}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="email" className={labelClass}>
              Email <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="email"
              id="email"
              name="email"
              defaultValue={initialData?.email || ''}
              disabled={isPending}
              className={inputClass}
            />
            {state?.error?.email && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.email}</p>
            )}
          </div>
          <div>
            <label htmlFor="phone" className={labelClass}>
              Phone <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="tel"
              id="phone"
              name="phone"
              defaultValue={initialData?.phone || ''}
              disabled={isPending}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Address <span className="text-xs text-muted-foreground font-normal">(optional)</span>
        </h3>

        <div>
          <label htmlFor="address" className={labelClass}>Street Address</label>
          <input
            type="text"
            id="address"
            name="address"
            defaultValue={initialData?.address || ''}
            disabled={isPending}
            className={inputClass}
          />
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div>
            <label htmlFor="city" className={labelClass}>City</label>
            <input
              type="text"
              id="city"
              name="city"
              defaultValue={initialData?.city || ''}
              disabled={isPending}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="state" className={labelClass}>State</label>
            <input
              type="text"
              id="state"
              name="state"
              defaultValue={initialData?.state || ''}
              disabled={isPending}
              className={inputClass}
            />
          </div>
          <div>
            <label htmlFor="zipCode" className={labelClass}>Zip Code</label>
            <input
              type="text"
              id="zipCode"
              name="zipCode"
              defaultValue={initialData?.zipCode || ''}
              disabled={isPending}
              className={inputClass}
            />
          </div>
        </div>
      </div>

      {/* Communication Preferences */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Communication Preferences
        </h3>
        <div className="flex items-center gap-3">
          <input
            type="checkbox"
            id="emailNotifications"
            name="emailNotifications"
            value="true"
            defaultChecked={initialData?.emailNotifications !== false}
            disabled={isPending}
            className="h-4 w-4 rounded border-input text-primary focus:ring-2 focus:ring-ring"
          />
          <label htmlFor="emailNotifications" className="text-sm text-foreground">
            Send automated load status emails to this customer
          </label>
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
