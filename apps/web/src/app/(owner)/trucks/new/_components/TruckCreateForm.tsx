'use client';

import * as React from 'react';
import { useState, useRef, useActionState } from 'react';
import { Loader2 } from 'lucide-react';
import type { ActionState } from '@drivecommand/types';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  FormField,
  FormSection,
  FormRow,
  CompletenessIndicator,
  getFieldErrors,
} from '@/components/design-system';
import { cn } from '@/lib/utils';

/**
 * TruckCreateForm — Sectioned form for creating a new truck.
 *
 * Sections:
 * 1. Identity — VIN (with lookup), Year, Make, Model
 * 2. Weight & Capacity — Odometer (currently only weight-related field)
 * 3. Registration & Compliance — License Plate, Registration/Insurance details
 */

interface TruckCreateFormProps {
  action: (
    prevState: ActionState | null,
    formData: FormData
  ) => Promise<ActionState>;
}

// Generate year options from current+1 down to 1990
const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from(
  { length: currentYear + 1 - 1990 + 1 },
  (_, i) => currentYear + 1 - i
);

// Format number with commas
function formatWithCommas(value: string | number): string {
  const num =
    typeof value === 'number' ? value : parseInt(value.replace(/,/g, ''), 10);
  if (isNaN(num)) return '';
  return num.toLocaleString('en-US');
}

function stripCommas(value: string): string {
  return value.replace(/,/g, '');
}

// VIN decoder API response type
interface VINDecodeResult {
  year?: number;
  make?: string;
  model?: string;
  gvwr?: number;
  error?: string;
}

export function TruckCreateForm({ action }: TruckCreateFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);

  // Form values
  const [vin, setVin] = useState('');
  const [year, setYear] = useState<number | null>(null);
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [licensePlate, setLicensePlate] = useState('');
  const [odometerDisplay, setOdometerDisplay] = useState('');
  const [odometerRaw, setOdometerRaw] = useState('');
  const [registrationNumber, setRegistrationNumber] = useState('');
  const [registrationExpiry, setRegistrationExpiry] = useState('');
  const [insuranceNumber, setInsuranceNumber] = useState('');
  const [insuranceExpiry, setInsuranceExpiry] = useState('');

  // Year dropdown state
  const [yearFilter, setYearFilter] = useState('');
  const [yearOpen, setYearOpen] = useState(false);
  const yearContainerRef = useRef<HTMLDivElement>(null);

  // VIN lookup state
  const [vinLookupLoading, setVinLookupLoading] = useState(false);
  const [vinLookupError, setVinLookupError] = useState<string | null>(null);
  const [vinLookupSuccess, setVinLookupSuccess] = useState<string | null>(null);

  // Completeness indicator state
  const [showCompleteness, setShowCompleteness] = useState(true);

  // Parse errors from action state
  const fieldErrors = getFieldErrors(
    typeof state?.error === 'object' ? state.error : undefined
  );

  // Calculate completeness
  const allFields = [
    vin,
    year,
    make,
    model,
    licensePlate,
    odometerRaw,
    registrationNumber,
    registrationExpiry,
    insuranceNumber,
    insuranceExpiry,
  ];
  const filledFields = allFields.filter(
    (f) => f !== null && f !== undefined && f !== ''
  ).length;

  // Filter years for dropdown
  const filteredYears = yearFilter
    ? YEAR_OPTIONS.filter((y) => y.toString().includes(yearFilter))
    : YEAR_OPTIONS;

  // Handle odometer input with commas
  const handleOdometerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = stripCommas(e.target.value).replace(/[^0-9]/g, '');
    if (raw === '') {
      setOdometerDisplay('');
      setOdometerRaw('');
      return;
    }
    const num = parseInt(raw, 10);
    setOdometerDisplay(formatWithCommas(num));
    setOdometerRaw(num.toString());
  };

  // VIN lookup via NHTSA API
  const handleVinLookup = async () => {
    if (vin.length !== 17) {
      setVinLookupError('VIN must be exactly 17 characters');
      return;
    }

    setVinLookupLoading(true);
    setVinLookupError(null);
    setVinLookupSuccess(null);

    try {
      const response = await fetch(
        `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json`
      );
      const data = await response.json();

      if (data.Results && data.Results.length > 0) {
        const result = data.Results[0];

        // Check for errors in the response
        if (result.ErrorCode && result.ErrorCode !== '0') {
          setVinLookupError(
            'Could not decode VIN. You can enter details manually.'
          );
          return;
        }

        // Auto-fill fields
        let fieldsUpdated = 0;

        if (result.ModelYear) {
          const yearNum = parseInt(result.ModelYear, 10);
          if (!isNaN(yearNum)) {
            setYear(yearNum);
            fieldsUpdated++;
          }
        }

        if (result.Make) {
          setMake(result.Make);
          fieldsUpdated++;
        }

        if (result.Model) {
          setModel(result.Model);
          fieldsUpdated++;
        }

        if (fieldsUpdated > 0) {
          setVinLookupSuccess(
            `Auto-filled ${fieldsUpdated} field${fieldsUpdated > 1 ? 's' : ''} from VIN`
          );
        } else {
          setVinLookupError(
            'No vehicle data found for this VIN. You can enter details manually.'
          );
        }
      } else {
        setVinLookupError(
          'Could not decode VIN. You can enter details manually.'
        );
      }
    } catch {
      setVinLookupError(
        'VIN lookup failed. You can enter details manually.'
      );
    } finally {
      setVinLookupLoading(false);
    }
  };

  return (
    <form action={formAction} className="max-w-2xl space-y-8">
      {/* General error message */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-status-danger-bg border border-status-danger-foreground/20 p-4">
          <p className="text-sm text-status-danger-foreground">{state.error}</p>
        </div>
      )}

      {/* Completeness Indicator */}
      {showCompleteness && (
        <CompletenessIndicator
          completed={filledFields}
          total={allFields.length}
          onDismiss={() => setShowCompleteness(false)}
        />
      )}

      {/* Section 1: Identity */}
      <FormSection
        title="Identity"
        description="Basic vehicle identification. VIN lookup can auto-fill year, make, and model."
      >
        {/* VIN with lookup */}
        <FormField
          label="VIN"
          name="vin"
          required
          error={fieldErrors?.vin}
          helperText={
            vinLookupSuccess
              ? vinLookupSuccess
              : vinLookupError
                ? vinLookupError
                : '17 characters, no I, O, or Q'
          }
        >
          <div className="relative flex items-center">
            <Input
              name="vin"
              value={vin}
              onChange={(e) => {
                setVin(e.target.value.toUpperCase());
                setVinLookupError(null);
                setVinLookupSuccess(null);
              }}
              maxLength={17}
              disabled={isPending}
              className="uppercase font-mono pr-24"
              placeholder="1HGBH41JXMN109186"
            />
            <div className="absolute right-1.5 top-1/2 -translate-y-1/2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleVinLookup}
                disabled={vinLookupLoading || vin.length !== 17 || isPending}
                className="h-8 px-3"
              >
                {vinLookupLoading ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" />
                    <span>Looking up</span>
                  </>
                ) : (
                  'Lookup'
                )}
              </Button>
            </div>
          </div>
        </FormField>

        <FormRow>
          {/* Year - searchable dropdown */}
          <FormField
            label="Year"
            name="year-field"
            required
            error={fieldErrors?.year}
          >
            <div className="relative" ref={yearContainerRef}>
              <Input
                type="text"
                id="yearSearch"
                placeholder="Select year..."
                value={yearOpen ? yearFilter : year?.toString() ?? ''}
                onChange={(e) => {
                  setYearFilter(e.target.value);
                  if (!yearOpen) setYearOpen(true);
                }}
                onFocus={() => {
                  setYearOpen(true);
                  setYearFilter('');
                }}
                onBlur={() => {
                  setTimeout(() => {
                    if (
                      !yearContainerRef.current?.contains(document.activeElement)
                    ) {
                      setYearOpen(false);
                      setYearFilter('');
                    }
                  }, 150);
                }}
                disabled={isPending}
                autoComplete="off"
              />
              <input type="hidden" name="year" value={year?.toString() ?? ''} />
              {yearOpen && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-border bg-card shadow-lg">
                  {filteredYears.length > 0 ? (
                    filteredYears.map((y) => (
                      <li
                        key={y}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          setYear(y);
                          setYearOpen(false);
                          setYearFilter('');
                        }}
                        className={cn(
                          'cursor-pointer px-3 py-2 text-sm hover:bg-primary/5',
                          year === y && 'bg-primary/10 font-medium text-primary'
                        )}
                      >
                        {y}
                      </li>
                    ))
                  ) : (
                    <li className="px-3 py-2 text-sm text-muted-foreground">
                      No matching years
                    </li>
                  )}
                </ul>
              )}
            </div>
          </FormField>

          {/* Make */}
          <FormField
            label="Make"
            name="make"
            required
            error={fieldErrors?.make}
          >
            <Input
              name="make"
              value={make}
              onChange={(e) => setMake(e.target.value)}
              disabled={isPending}
              placeholder="e.g. Peterbilt"
            />
          </FormField>
        </FormRow>

        {/* Model */}
        <FormField
          label="Model"
          name="model"
          required
          error={fieldErrors?.model}
        >
          <Input
            name="model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={isPending}
            placeholder="e.g. 579"
          />
        </FormField>
      </FormSection>

      {/* Section 2: Weight & Capacity */}
      <FormSection
        title="Weight & Capacity"
        description="Current mileage and vehicle specifications."
        divider
      >
        <FormField
          label="Odometer"
          name="odometer-field"
          required
          error={fieldErrors?.odometer}
          helperText="Current reading in miles"
        >
          <Input
            type="text"
            inputMode="numeric"
            value={odometerDisplay}
            onChange={handleOdometerChange}
            disabled={isPending}
            placeholder="e.g. 125,000"
          />
          <input
            type="hidden"
            name="odometer"
            value={odometerRaw}
            onChange={() => {}}
          />
        </FormField>
      </FormSection>

      {/* Section 3: Registration & Compliance */}
      <FormSection
        title="Registration & Compliance"
        description="License plate and document expiry dates for compliance tracking."
        divider
      >
        <FormField
          label="License Plate"
          name="licensePlate"
          required
          error={fieldErrors?.licensePlate}
        >
          <Input
            name="licensePlate"
            value={licensePlate}
            onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
            maxLength={20}
            disabled={isPending}
            className="uppercase"
            placeholder="e.g. ABC-1234"
          />
        </FormField>

        <FormRow>
          <FormField
            label="Registration Number"
            name="registrationNumber"
            helperText="Optional"
          >
            <Input
              name="registrationNumber"
              value={registrationNumber}
              onChange={(e) => setRegistrationNumber(e.target.value)}
              disabled={isPending}
            />
          </FormField>
          <FormField
            label="Registration Expiry"
            name="registrationExpiry"
            helperText="Optional"
          >
            <Input
              type="date"
              name="registrationExpiry"
              value={registrationExpiry}
              onChange={(e) => setRegistrationExpiry(e.target.value)}
              disabled={isPending}
            />
          </FormField>
        </FormRow>

        <FormRow>
          <FormField
            label="Insurance Number"
            name="insuranceNumber"
            helperText="Optional"
          >
            <Input
              name="insuranceNumber"
              value={insuranceNumber}
              onChange={(e) => setInsuranceNumber(e.target.value)}
              disabled={isPending}
            />
          </FormField>
          <FormField
            label="Insurance Expiry"
            name="insuranceExpiry"
            helperText="Optional"
          >
            <Input
              type="date"
              name="insuranceExpiry"
              value={insuranceExpiry}
              onChange={(e) => setInsuranceExpiry(e.target.value)}
              disabled={isPending}
            />
          </FormField>
        </FormRow>
      </FormSection>

      {/* Submit Button */}
      <div className="pt-2">
        <Button
          type="submit"
          disabled={isPending}
          className="w-full sm:w-auto"
          size="lg"
        >
          {isPending ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin mr-2" />
              Creating Truck...
            </>
          ) : (
            'Create Truck'
          )}
        </Button>
      </div>
    </form>
  );
}
