'use client';

import { useActionState, useState } from 'react';
import { AddressAutocomplete, haversineDistanceMiles } from '@/components/shared/address-autocomplete';
import { Navigation } from 'lucide-react';

interface Coords {
  lat: number;
  lng: number;
}

interface RouteFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  initialData?: {
    origin: string;
    destination: string;
    scheduledDate: string; // datetime-local format: YYYY-MM-DDTHH:mm
    driverId: string;
    truckId: string;
    notes?: string;
    distanceMiles?: number | null;
  };
  drivers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  trucks: Array<{
    id: string;
    make: string;
    model: string;
    year: number;
    licensePlate: string;
  }>;
  submitLabel: string;
  extraHiddenFields?: Record<string, string | number>;
}

const inputClass = "mt-1 block w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors";
const labelClass = "block text-sm font-medium text-foreground";

export function RouteForm({
  action,
  initialData,
  drivers,
  trucks,
  submitLabel,
  extraHiddenFields,
}: RouteFormProps) {
  const [state, formAction, isPending] = useActionState(action, {
    success: false,
  });

  const [originCoords, setOriginCoords] = useState<Coords | null>(null);
  const [destCoords, setDestCoords] = useState<Coords | null>(null);

  const distance =
    originCoords && destCoords
      ? haversineDistanceMiles(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng)
      : null;

  return (
    <form action={formAction} className="max-w-2xl space-y-5">
      {/* Extra hidden fields (e.g., version for optimistic locking) */}
      {extraHiddenFields && Object.entries(extraHiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={String(value)} />
      ))}

      {/* Hidden distanceMiles field — submitted with form */}
      <input
        type="hidden"
        name="distanceMiles"
        value={distance !== null ? String(Math.round(distance)) : (initialData?.distanceMiles ?? '')}
      />

      {/* Origin & Destination */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Route Details</h3>

        <div>
          <label htmlFor="origin" className={labelClass}>Origin</label>
          <AddressAutocomplete
            id="origin"
            name="origin"
            defaultValue={initialData?.origin || ''}
            required
            disabled={isPending}
            placeholder="Enter origin address..."
            className={inputClass}
            onPlaceSelect={(place) => setOriginCoords({ lat: place.lat, lng: place.lng })}
          />
          {state?.error?.origin && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.origin}</p>
          )}
        </div>

        <div>
          <label htmlFor="destination" className={labelClass}>Destination</label>
          <AddressAutocomplete
            id="destination"
            name="destination"
            defaultValue={initialData?.destination || ''}
            required
            disabled={isPending}
            placeholder="Enter destination address..."
            className={inputClass}
            onPlaceSelect={(place) => setDestCoords({ lat: place.lat, lng: place.lng })}
          />
          {state?.error?.destination && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.destination}</p>
          )}
        </div>

        {/* Distance badge — shown once both locations are selected */}
        {distance !== null && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-2.5">
            <Navigation className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Estimated distance: <strong>{Math.round(distance).toLocaleString()} miles</strong>
            </span>
            <span className="ml-auto text-xs text-blue-500 dark:text-blue-500">straight-line est.</span>
          </div>
        )}
        {/* Show saved distance when editing (no new selection yet) */}
        {distance === null && initialData?.distanceMiles && (
          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/40 px-4 py-2.5">
            <Navigation className="h-4 w-4 text-muted-foreground shrink-0" />
            <span className="text-sm text-muted-foreground">
              Saved distance: <strong className="text-foreground">{initialData.distanceMiles.toLocaleString()} miles</strong>
            </span>
          </div>
        )}

        <div>
          <label htmlFor="scheduledDate" className={labelClass}>Scheduled Date</label>
          <input
            type="datetime-local"
            id="scheduledDate"
            name="scheduledDate"
            defaultValue={initialData?.scheduledDate || ''}
            required
            disabled={isPending}
            className={inputClass}
          />
          {state?.error?.scheduledDate && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.scheduledDate}</p>
          )}
        </div>
      </div>

      {/* Assignments */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Assignments</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="driverId" className={labelClass}>Driver</label>
            <select
              id="driverId"
              name="driverId"
              defaultValue={initialData?.driverId || ''}
              required
              disabled={isPending || drivers.length === 0}
              className={inputClass}
            >
              <option value="">
                {drivers.length === 0 ? 'No drivers available' : 'Select a driver...'}
              </option>
              {drivers.map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.firstName || ''} {driver.lastName || ''}
                </option>
              ))}
            </select>
            {drivers.length === 0 && (
              <p className="mt-1.5 text-sm text-amber-600">
                Invite drivers first before creating routes.
              </p>
            )}
            {state?.error?.driverId && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.driverId}</p>
            )}
          </div>

          <div>
            <label htmlFor="truckId" className={labelClass}>Truck</label>
            <select
              id="truckId"
              name="truckId"
              defaultValue={initialData?.truckId || ''}
              required
              disabled={isPending}
              className={inputClass}
            >
              <option value="">Select a truck...</option>
              {trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.year} {truck.make} {truck.model} ({truck.licensePlate})
                </option>
              ))}
            </select>
            {state?.error?.truckId && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.truckId}</p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            defaultValue={initialData?.notes || ''}
            maxLength={1000}
            rows={3}
            disabled={isPending}
            className={inputClass}
          />
          {state?.error?.notes && (
            <p className="mt-1.5 text-sm text-red-600">{state.error.notes}</p>
          )}
        </div>
      </div>

      {/* General Error - flat string from server action catch */}
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

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
