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

const inputClass = "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors";
const labelClass = "block text-sm font-medium text-foreground mb-1.5";

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
    <form action={formAction} className="max-w-2xl space-y-5">
      {/* General error message */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Vehicle Information */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Vehicle Information</h3>

        {/* Year - searchable dropdown */}
        <div>
          <label htmlFor="yearSearch" className={labelClass}>Year</label>
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
            <input type="hidden" name="year" value={selectedYear?.toString() ?? ''} />
            {yearOpen && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
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
                      className={`cursor-pointer px-3 py-2 text-sm hover:bg-primary/5 ${
                        selectedYear === year ? 'bg-primary/10 font-medium text-primary' : ''
                      }`}
                    >
                      {year}
                    </li>
                  ))
                ) : (
                  <li className="px-3 py-2 text-sm text-muted-foreground">No matching years</li>
                )}
              </ul>
            )}
          </div>
          {state?.error?.year && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.year}</p>
          )}
        </div>

        {/* Make & Model in grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="make" className={labelClass}>Make</label>
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
              <p className="mt-1.5 text-sm text-red-600">{state.error.make}</p>
            )}
          </div>
          <div>
            <label htmlFor="model" className={labelClass}>Model</label>
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
              <p className="mt-1.5 text-sm text-red-600">{state.error.model}</p>
            )}
          </div>
        </div>

        {/* VIN */}
        <div>
          <label htmlFor="vin" className={labelClass}>VIN</label>
          <input
            type="text"
            id="vin"
            name="vin"
            maxLength={17}
            pattern="[A-HJ-NPR-Z0-9]{17}"
            defaultValue={initialData?.vin || ''}
            disabled={isPending}
            className={`${inputClass} uppercase font-mono`}
            required
          />
          <p className="mt-1.5 text-xs text-muted-foreground">17 characters, no I, O, or Q</p>
          {state?.error?.vin && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.vin}</p>
          )}
        </div>

        {/* License Plate & Odometer in grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="licensePlate" className={labelClass}>License Plate</label>
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
              <p className="mt-1.5 text-sm text-red-600">{state.error.licensePlate}</p>
            )}
          </div>
          <div>
            <label htmlFor="odometerDisplay" className={labelClass}>Odometer (miles)</label>
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
            <input
              type="hidden"
              name="odometer"
              ref={odometerHiddenRef}
              defaultValue={initialData?.odometer?.toString() ?? ''}
            />
            {state?.error?.odometer && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.odometer}</p>
            )}
          </div>
        </div>
      </div>

      {/* Document Metadata Section */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Documents</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="registrationNumber" className={labelClass}>Registration Number</label>
            <input
              type="text"
              id="registrationNumber"
              name="registrationNumber"
              defaultValue={initialData?.documentMetadata?.registrationNumber || ''}
              disabled={isPending}
              className={inputClass}
            />
            {state?.error?.registrationNumber && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.registrationNumber}</p>
            )}
          </div>
          <div>
            <label htmlFor="registrationExpiry" className={labelClass}>Registration Expiry</label>
            <input
              type="date"
              id="registrationExpiry"
              name="registrationExpiry"
              defaultValue={initialData?.documentMetadata?.registrationExpiry || ''}
              disabled={isPending}
              className={inputClass}
            />
            {state?.error?.registrationExpiry && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.registrationExpiry}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="insuranceNumber" className={labelClass}>Insurance Number</label>
            <input
              type="text"
              id="insuranceNumber"
              name="insuranceNumber"
              defaultValue={initialData?.documentMetadata?.insuranceNumber || ''}
              disabled={isPending}
              className={inputClass}
            />
            {state?.error?.insuranceNumber && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.insuranceNumber}</p>
            )}
          </div>
          <div>
            <label htmlFor="insuranceExpiry" className={labelClass}>Insurance Expiry</label>
            <input
              type="date"
              id="insuranceExpiry"
              name="insuranceExpiry"
              defaultValue={initialData?.documentMetadata?.insuranceExpiry || ''}
              disabled={isPending}
              className={inputClass}
            />
            {state?.error?.insuranceExpiry && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.insuranceExpiry}</p>
            )}
          </div>
        </div>
      </div>

      {/* Submit Button */}
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
