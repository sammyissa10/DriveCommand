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

export function DriverForm({ action, initialData, submitLabel, mode }: DriverFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {/* Success message */}
      {state?.success && state?.message && (
        <div className="rounded-md bg-green-50 border border-green-200 p-4">
          <p className="text-sm text-green-800">{state.message}</p>
        </div>
      )}

      {/* General error message */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Email (invite mode only) */}
      {mode === 'invite' && (
        <div>
          <label htmlFor="email" className="block font-medium mb-1">
            Email
          </label>
          <input
            type="email"
            id="email"
            name="email"
            disabled={isPending}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
            required
          />
          {state?.error?.email && (
            <p className="mt-1 text-sm text-red-600">{state.error.email}</p>
          )}
        </div>
      )}

      {/* First Name */}
      <div>
        <label htmlFor="firstName" className="block font-medium mb-1">
          First Name
        </label>
        <input
          type="text"
          id="firstName"
          name="firstName"
          defaultValue={initialData?.firstName || ''}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.firstName && (
          <p className="mt-1 text-sm text-red-600">{state.error.firstName}</p>
        )}
      </div>

      {/* Last Name */}
      <div>
        <label htmlFor="lastName" className="block font-medium mb-1">
          Last Name
        </label>
        <input
          type="text"
          id="lastName"
          name="lastName"
          defaultValue={initialData?.lastName || ''}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.lastName && (
          <p className="mt-1 text-sm text-red-600">{state.error.lastName}</p>
        )}
      </div>

      {/* License Number (optional) */}
      <div>
        <label htmlFor="licenseNumber" className="block font-medium mb-1">
          License Number
          <span className="text-sm text-gray-500 font-normal ml-2">(optional)</span>
        </label>
        <input
          type="text"
          id="licenseNumber"
          name="licenseNumber"
          maxLength={20}
          defaultValue={initialData?.licenseNumber || ''}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 uppercase"
        />
        <p className="mt-1 text-xs text-gray-500">5-20 characters, alphanumeric</p>
        {state?.error?.licenseNumber && (
          <p className="mt-1 text-sm text-red-600">{state.error.licenseNumber}</p>
        )}
      </div>

      {/* Submit Button */}
      <div className="pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isPending ? (mode === 'invite' ? 'Sending...' : 'Saving...') : submitLabel}
        </button>
      </div>
    </form>
  );
}
