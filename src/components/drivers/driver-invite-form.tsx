'use client';

import { useActionState } from 'react';

interface DriverFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  initialData?: {
    firstName?: string;
    lastName?: string;
    licenseNumber?: string;
  };
  submitLabel: string;
  mode: 'invite' | 'edit';
}

const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors";
const labelClass = "block text-sm font-medium text-foreground mb-1.5";

export function DriverForm({ action, initialData, submitLabel, mode }: DriverFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Force form remount on success to reset uncontrolled inputs
  const formKey = state?.success ? Date.now() : 'form';

  return (
    <form key={formKey} action={formAction} className="max-w-2xl space-y-5">
      {/* Success message */}
      {state?.success && state?.message && (
        <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-4">
          <p className="text-sm text-emerald-800">{state.message}</p>
        </div>
      )}

      {/* Warning message — invitation created but email not sent */}
      {state?.warning && (
        <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
          <p className="text-sm text-amber-800">{state.warning}</p>
        </div>
      )}

      {/* General error message */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Email (invite mode only) */}
      {mode === 'invite' && (
        <div>
          <label htmlFor="email" className={labelClass}>Email</label>
          <input
            type="email"
            id="email"
            name="email"
            disabled={isPending}
            className={inputClass}
            required
          />
          {state?.error?.email && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.email}</p>
          )}
        </div>
      )}

      {/* First Name & Last Name in grid */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="firstName" className={labelClass}>First Name</label>
          <input
            type="text"
            id="firstName"
            name="firstName"
            defaultValue={initialData?.firstName || ''}
            disabled={isPending}
            className={inputClass}
            required
          />
          {state?.error?.firstName && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.firstName}</p>
          )}
        </div>
        <div>
          <label htmlFor="lastName" className={labelClass}>Last Name</label>
          <input
            type="text"
            id="lastName"
            name="lastName"
            defaultValue={initialData?.lastName || ''}
            disabled={isPending}
            className={inputClass}
            required
          />
          {state?.error?.lastName && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.lastName}</p>
          )}
        </div>
      </div>

      {/* License Number (optional) */}
      <div>
        <label htmlFor="licenseNumber" className={labelClass}>
          License Number
          <span className="text-xs text-muted-foreground font-normal ml-2">(optional)</span>
        </label>
        <input
          type="text"
          id="licenseNumber"
          name="licenseNumber"
          maxLength={20}
          defaultValue={initialData?.licenseNumber || ''}
          disabled={isPending}
          className={`${inputClass} uppercase font-mono`}
        />
        <p className="mt-1.5 text-xs text-muted-foreground">5-20 characters, alphanumeric</p>
        {state?.error?.licenseNumber && (
          <p className="mt-1.5 text-sm text-red-600">{state.error.licenseNumber}</p>
        )}
      </div>

      {/* Submit Button */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? (mode === 'invite' ? 'Sending...' : 'Saving...') : submitLabel}
        </button>
      </div>
    </form>
  );
}
