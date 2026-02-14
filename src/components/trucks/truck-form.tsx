'use client';

import { useActionState } from 'react';

interface TruckFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  initialData?: {
    make?: string;
    model?: string;
    year?: number;
    vin?: string;
    licensePlate?: string;
    odometer?: number;
    documentMetadata?: {
      registrationNumber?: string;
      registrationExpiry?: string;
      insuranceNumber?: string;
      insuranceExpiry?: string;
    };
  };
  submitLabel: string;
}

export function TruckForm({ action, initialData, submitLabel }: TruckFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {/* General error message */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Make */}
      <div>
        <label htmlFor="make" className="block font-medium mb-1">
          Make
        </label>
        <input
          type="text"
          id="make"
          name="make"
          defaultValue={initialData?.make || ''}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.make && (
          <p className="mt-1 text-sm text-red-600">{state.error.make}</p>
        )}
      </div>

      {/* Model */}
      <div>
        <label htmlFor="model" className="block font-medium mb-1">
          Model
        </label>
        <input
          type="text"
          id="model"
          name="model"
          defaultValue={initialData?.model || ''}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.model && (
          <p className="mt-1 text-sm text-red-600">{state.error.model}</p>
        )}
      </div>

      {/* Year */}
      <div>
        <label htmlFor="year" className="block font-medium mb-1">
          Year
        </label>
        <input
          type="number"
          id="year"
          name="year"
          min={1900}
          max={new Date().getFullYear() + 1}
          defaultValue={initialData?.year || ''}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.year && (
          <p className="mt-1 text-sm text-red-600">{state.error.year}</p>
        )}
      </div>

      {/* VIN */}
      <div>
        <label htmlFor="vin" className="block font-medium mb-1">
          VIN
        </label>
        <input
          type="text"
          id="vin"
          name="vin"
          maxLength={17}
          pattern="[A-HJ-NPR-Z0-9]{17}"
          defaultValue={initialData?.vin || ''}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50 uppercase"
          required
        />
        <p className="mt-1 text-xs text-gray-500">17 characters, no I, O, or Q</p>
        {state?.error?.vin && (
          <p className="mt-1 text-sm text-red-600">{state.error.vin}</p>
        )}
      </div>

      {/* License Plate */}
      <div>
        <label htmlFor="licensePlate" className="block font-medium mb-1">
          License Plate
        </label>
        <input
          type="text"
          id="licensePlate"
          name="licensePlate"
          maxLength={20}
          defaultValue={initialData?.licensePlate || ''}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.licensePlate && (
          <p className="mt-1 text-sm text-red-600">{state.error.licensePlate}</p>
        )}
      </div>

      {/* Odometer */}
      <div>
        <label htmlFor="odometer" className="block font-medium mb-1">
          Odometer (miles)
        </label>
        <input
          type="number"
          id="odometer"
          name="odometer"
          min={0}
          step={1}
          defaultValue={initialData?.odometer || ''}
          disabled={isPending}
          className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          required
        />
        {state?.error?.odometer && (
          <p className="mt-1 text-sm text-red-600">{state.error.odometer}</p>
        )}
      </div>

      {/* Document Metadata Section */}
      <div className="pt-4 border-t border-gray-200">
        <h3 className="text-lg font-medium mb-4">Documents</h3>

        {/* Registration Number */}
        <div className="mb-4">
          <label htmlFor="registrationNumber" className="block font-medium mb-1">
            Registration Number
          </label>
          <input
            type="text"
            id="registrationNumber"
            name="registrationNumber"
            defaultValue={initialData?.documentMetadata?.registrationNumber || ''}
            disabled={isPending}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
          {state?.error?.registrationNumber && (
            <p className="mt-1 text-sm text-red-600">{state.error.registrationNumber}</p>
          )}
        </div>

        {/* Registration Expiry */}
        <div className="mb-4">
          <label htmlFor="registrationExpiry" className="block font-medium mb-1">
            Registration Expiry
          </label>
          <input
            type="date"
            id="registrationExpiry"
            name="registrationExpiry"
            defaultValue={initialData?.documentMetadata?.registrationExpiry || ''}
            disabled={isPending}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
          {state?.error?.registrationExpiry && (
            <p className="mt-1 text-sm text-red-600">{state.error.registrationExpiry}</p>
          )}
        </div>

        {/* Insurance Number */}
        <div className="mb-4">
          <label htmlFor="insuranceNumber" className="block font-medium mb-1">
            Insurance Number
          </label>
          <input
            type="text"
            id="insuranceNumber"
            name="insuranceNumber"
            defaultValue={initialData?.documentMetadata?.insuranceNumber || ''}
            disabled={isPending}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
          {state?.error?.insuranceNumber && (
            <p className="mt-1 text-sm text-red-600">{state.error.insuranceNumber}</p>
          )}
        </div>

        {/* Insurance Expiry */}
        <div className="mb-4">
          <label htmlFor="insuranceExpiry" className="block font-medium mb-1">
            Insurance Expiry
          </label>
          <input
            type="date"
            id="insuranceExpiry"
            name="insuranceExpiry"
            defaultValue={initialData?.documentMetadata?.insuranceExpiry || ''}
            disabled={isPending}
            className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50"
          />
          {state?.error?.insuranceExpiry && (
            <p className="mt-1 text-sm text-red-600">{state.error.insuranceExpiry}</p>
          )}
        </div>
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
