'use client';

import { useActionState, useState, useRef } from 'react';

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

// Generate year options from current+1 down to 1990
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: currentYear + 1 - 1990 + 1 }, (_, i) => currentYear + 1 - i);

function formatWithCommas(value: string | number): string {
  const num = typeof value === 'number' ? value : parseInt(value.replace(/,/g, ''), 10);
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US');
}

function stripCommas(value: string): string {
  return value.replace(/,/g, '');
}

const inputClass = "w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50";

export function TruckForm({ action, initialData, submitLabel }: TruckFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [odometerDisplay, setOdometerDisplay] = useState(
    initialData?.odometer != null ? formatWithCommas(initialData.odometer) : ''
  );
  const odometerHiddenRef = useRef<HTMLInputElement>(null);
  const [yearFilter, setYearFilter] = useState('');
  const [yearOpen, setYearOpen] = useState(false);
  const [selectedYear, setSelectedYear] = useState<number | null>(initialData?.year ?? null);
  const yearContainerRef = useRef<HTMLDivElement>(null);

  const filteredYears = yearFilter
    ? YEAR_OPTIONS.filter(y => y.toString().includes(yearFilter))
    : YEAR_OPTIONS;

  const handleOdometerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = stripCommas(e.target.value).replace(/[^0-9]/g, '');
    if (raw === '') {
      setOdometerDisplay('');
      if (odometerHiddenRef.current) odometerHiddenRef.current.value = '';
      return;
    }
    const num = parseInt(raw, 10);
    setOdometerDisplay(formatWithCommas(num));
    if (odometerHiddenRef.current) odometerHiddenRef.current.value = num.toString();
  };

  return (
    <form action={formAction} className="max-w-2xl space-y-4">
      {/* General error message */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-md bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Year - searchable dropdown, first field */}
      <div>
        <label htmlFor="yearSearch" className="block font-medium mb-1">
          Year
        </label>
        <div className="relative" ref={yearContainerRef}>
          <input
            type="text"
            id="yearSearch"
            placeholder="Search year..."
            value={yearOpen ? yearFilter : (selectedYear?.toString() ?? '')}
            onChange={(e) => {
              setYearFilter(e.target.value);
              if (!yearOpen) setYearOpen(true);
            }}
            onFocus={() => {
              setYearOpen(true);
              setYearFilter('');
            }}
            onBlur={(e) => {
              // Delay close so click on option registers
              setTimeout(() => {
                if (!yearContainerRef.current?.contains(document.activeElement)) {
                  setYearOpen(false);
                  setYearFilter('');
                }
              }, 150);
            }}
            disabled={isPending}
            className={inputClass}
            autoComplete="off"
            required
          />
          {/* Hidden input for form submission */}
          <input type="hidden" name="year" value={selectedYear?.toString() ?? ''} />
          {yearOpen && (
            <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-md border border-gray-300 bg-white shadow-lg">
              {filteredYears.length > 0 ? (
                filteredYears.map((year) => (
                  <li
                    key={year}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      setSelectedYear(year);
                      setYearOpen(false);
                      setYearFilter('');
                    }}
                    className={`cursor-pointer px-3 py-2 hover:bg-blue-50 ${
                      selectedYear === year ? 'bg-blue-100 font-medium' : ''
                    }`}
                  >
                    {year}
                  </li>
                ))
              ) : (
                <li className="px-3 py-2 text-gray-500">No matching years</li>
              )}
            </ul>
          )}
        </div>
        {state?.error?.year && (
          <p className="mt-1 text-sm text-red-600">{state.error.year}</p>
        )}
      </div>

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
          className={inputClass}
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
          className={inputClass}
          required
        />
        {state?.error?.model && (
          <p className="mt-1 text-sm text-red-600">{state.error.model}</p>
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
          className={`${inputClass} uppercase`}
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
          className={inputClass}
          required
        />
        {state?.error?.licensePlate && (
          <p className="mt-1 text-sm text-red-600">{state.error.licensePlate}</p>
        )}
      </div>

      {/* Odometer with comma formatting */}
      <div>
        <label htmlFor="odometerDisplay" className="block font-medium mb-1">
          Odometer (miles)
        </label>
        <input
          type="text"
          id="odometerDisplay"
          inputMode="numeric"
          value={odometerDisplay}
          onChange={handleOdometerChange}
          disabled={isPending}
          className={inputClass}
          placeholder="e.g. 125,000"
          required
        />
        {/* Hidden input submits the raw number */}
        <input
          type="hidden"
          name="odometer"
          ref={odometerHiddenRef}
          defaultValue={initialData?.odometer?.toString() ?? ''}
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
            className={inputClass}
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
            className={inputClass}
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
            className={inputClass}
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
            className={inputClass}
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
