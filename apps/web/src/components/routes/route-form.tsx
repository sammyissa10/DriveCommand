'use client';

import type { ActionState } from '@drivecommand/types';

import { useActionState, useState, useEffect } from 'react';
import { AddressAutocomplete } from '@/components/shared/address-autocomplete';
import { getOSRMDistanceMiles } from '@/lib/geo/osrm';
import { Navigation, Plus, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react';

interface Coords {
  lat: number;
  lng: number;
}

interface StopDraft {
  clientId: string; // crypto.randomUUID() for React key
  type: 'PICKUP' | 'DELIVERY';
  address: string;
  scheduledAt: string;
  notes: string;
}

interface RouteFormProps {
  action: (prevState: ActionState | null, formData: FormData) => Promise<ActionState>;
  initialData?: {
    origin: string;
    destination: string;
    scheduledDate: string; // datetime-local format: YYYY-MM-DDTHH:mm
    driverId: string;
    truckId: string;
    notes?: string;
    distanceMiles?: number | null;
    name?: string | null;
  };
  initialStops?: Array<{
    id: string;
    type: string;
    address: string;
    scheduledAt: Date | null;
    notes: string | null;
    position: number;
  }>;
  initialCoDriverIds?: string[];
  onCoDriversChange?: (ids: string[]) => void;
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

function toDatetimeLocalString(date: Date | null | undefined): string {
  if (!date) return '';
  // Format as YYYY-MM-DDTHH:mm in UTC
  const iso = date instanceof Date ? date.toISOString() : new Date(date).toISOString();
  return iso.slice(0, 16);
}

export function RouteForm({
  action,
  initialData,
  initialStops,
  initialCoDriverIds,
  onCoDriversChange,
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
  const [stopCoords, setStopCoords] = useState<Map<string, Coords>>(new Map());
  const [distance, setDistance] = useState<number | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(initialData?.driverId || '');
  const [coDriverIds, setCoDriverIds] = useState<string[]>(initialCoDriverIds ?? []);

  function toggleCoDriver(driverId: string) {
    setCoDriverIds((prev) => {
      const next = prev.includes(driverId)
        ? prev.filter((id) => id !== driverId)
        : [...prev, driverId];
      onCoDriversChange?.(next);
      return next;
    });
  }

  // Initialize stops from initialStops prop (editing existing route) or empty array (new route)
  const [stops, setStops] = useState<StopDraft[]>(() => {
    if (!initialStops || initialStops.length === 0) return [];
    return initialStops
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        clientId: crypto.randomUUID(),
        type: (s.type === 'DELIVERY' ? 'DELIVERY' : 'PICKUP') as 'PICKUP' | 'DELIVERY',
        address: s.address,
        scheduledAt: toDatetimeLocalString(s.scheduledAt),
        notes: s.notes ?? '',
      }));
  });

  // Fetch road distance via OSRM when both coordinates are available
  useEffect(() => {
    if (!originCoords || !destCoords) {
      setDistance(null);
      return;
    }
    let cancelled = false;
    setDistanceLoading(true);
    setDistance(null);
    getOSRMDistanceMiles(originCoords.lat, originCoords.lng, destCoords.lat, destCoords.lng)
      .then((miles) => {
        if (cancelled) return;
        setDistance(miles);
      })
      .finally(() => {
        if (!cancelled) setDistanceLoading(false);
      });
    return () => { cancelled = true; };
  }, [originCoords, destCoords]);

  function addStop() {
    setStops((prev) => [
      ...prev,
      {
        clientId: crypto.randomUUID(),
        type: 'PICKUP',
        address: '',
        scheduledAt: '',
        notes: '',
      },
    ]);
  }

  function removeStop(clientId: string) {
    setStops((prev) => prev.filter((s) => s.clientId !== clientId));
  }

  function moveStopUp(idx: number) {
    if (idx === 0) return;
    setStops((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveStopDown(idx: number) {
    setStops((prev) => {
      if (idx >= prev.length - 1) return prev;
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  function updateStop(clientId: string, field: keyof Omit<StopDraft, 'clientId'>, value: string) {
    setStops((prev) =>
      prev.map((s) => (s.clientId === clientId ? { ...s, [field]: value } : s))
    );
  }

  const fieldErrors = typeof state?.error === 'object' ? state.error : undefined;
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
      {/* Note: distance state is async (OSRM); initialData.distanceMiles is used as fallback when editing */}

      {/* Hidden co-driver IDs — comma-separated list submitted with form */}
      <input
        type="hidden"
        name="coDriverIds"
        value={coDriverIds.join(',')}
      />

      {/* Hidden stops_submitted sentinel — tells server action stops section was rendered */}
      <input type="hidden" name="stops_submitted" value="true" />

      {/* Hidden fields for each stop — index-based for server action parsing */}
      {stops.map((stop, idx) => (
        <span key={stop.clientId} style={{ display: 'none' }}>
          <input type="hidden" name={`stops_${idx}_type`} value={stop.type} />
          <input type="hidden" name={`stops_${idx}_scheduledAt`} value={stop.scheduledAt} />
          <input type="hidden" name={`stops_${idx}_notes`} value={stop.notes} />
          <input type="hidden" name={`stops_${idx}_lat`} value={stopCoords.get(stop.clientId)?.lat ?? ''} />
          <input type="hidden" name={`stops_${idx}_lng`} value={stopCoords.get(stop.clientId)?.lng ?? ''} />
        </span>
      ))}

      {/* Origin & Destination */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Route Details</h3>

        <div>
          <label htmlFor="name" className={labelClass}>
            Route Name <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <input
            type="text"
            id="name"
            name="name"
            defaultValue={initialData?.name || ''}
            maxLength={120}
            disabled={isPending}
            placeholder="e.g. Chicago Steel Run"
            className={inputClass}
          />
        </div>

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
          {fieldErrors?.origin && (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.origin}</p>
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
          {fieldErrors?.destination && (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.destination}</p>
          )}
        </div>

        {/* Distance badge — shown while loading or once both locations are selected */}
        {distanceLoading && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-2.5">
            <Loader2 className="h-4 w-4 text-blue-500 dark:text-blue-400 shrink-0 animate-spin" />
            <span className="text-sm text-blue-600 dark:text-blue-400">Calculating road distance...</span>
          </div>
        )}
        {!distanceLoading && distance !== null && (
          <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-2.5">
            <Navigation className="h-4 w-4 text-blue-600 dark:text-blue-400 shrink-0" />
            <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
              Estimated distance: <strong>{Math.round(distance).toLocaleString()} miles</strong>
            </span>
            <span className="ml-auto text-xs text-blue-500 dark:text-blue-500">road distance</span>
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
          {fieldErrors?.scheduledDate && (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.scheduledDate}</p>
          )}
        </div>
      </div>

      {/* Stops */}
      <div className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Stops</h3>
          <button
            type="button"
            onClick={addStop}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm min-h-[44px] font-medium text-foreground shadow-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        </div>

        {stops.length === 0 && (
          <p className="text-xs text-muted-foreground py-2">
            No intermediate stops. Click "Add Stop" to define pickup or delivery waypoints.
          </p>
        )}

        {stops.map((stop, idx) => (
          <div
            key={stop.clientId}
            className="flex gap-3 items-start rounded-lg border border-border bg-muted/20 p-4"
          >
            {/* Position badge — flex child, no absolute positioning */}
            <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-sm mt-0.5">
              {idx + 1}
            </div>

            <div className="flex-1 min-w-0 space-y-3">
              {/* Header row: type select + reorder + remove */}
              <div className="flex items-center gap-2">
                <select
                  value={stop.type}
                  onChange={(e) => updateStop(stop.clientId, 'type', e.target.value)}
                  disabled={isPending}
                  className="flex-1 min-w-0 rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
                >
                  <option value="PICKUP">Pickup</option>
                  <option value="DELIVERY">Delivery</option>
                </select>

                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => moveStopUp(idx)}
                    disabled={idx === 0 || isPending}
                    title="Move stop up"
                    className="inline-flex items-center justify-center rounded p-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => moveStopDown(idx)}
                    disabled={idx === stops.length - 1 || isPending}
                    title="Move stop down"
                    className="inline-flex items-center justify-center rounded p-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeStop(stop.clientId)}
                    disabled={isPending}
                    title="Remove stop"
                    className="inline-flex items-center justify-center rounded p-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Address — AddressAutocomplete with stops_N_address as name */}
              <div>
                <label className={labelClass}>Address</label>
                <AddressAutocomplete
                  id={`stop_${stop.clientId}_address`}
                  name={`stops_${idx}_address`}
                  defaultValue={stop.address}
                  disabled={isPending}
                  placeholder="Enter stop address..."
                  className={inputClass}
                  onPlaceSelect={(place) => {
                    updateStop(stop.clientId, 'address', place.displayName);
                    setStopCoords((prev) => {
                      const next = new Map(prev);
                      next.set(stop.clientId, { lat: place.lat, lng: place.lng });
                      return next;
                    });
                  }}
                />
              </div>

              {/* Scheduled time */}
              <div>
                <label className={labelClass}>
                  Scheduled Time <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  type="datetime-local"
                  value={stop.scheduledAt}
                  onChange={(e) => updateStop(stop.clientId, 'scheduledAt', e.target.value)}
                  disabled={isPending}
                  className={inputClass}
                />
              </div>

              {/* Notes */}
              <div>
                <label className={labelClass}>
                  Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={stop.notes}
                  onChange={(e) => updateStop(stop.clientId, 'notes', e.target.value)}
                  disabled={isPending}
                  placeholder="Stop-specific instructions..."
                  className={inputClass}
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Assignments */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Assignments</h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="driverId" className={labelClass}>Primary Driver</label>
            <select
              id="driverId"
              name="driverId"
              value={selectedDriverId}
              onChange={(e) => setSelectedDriverId(e.target.value)}
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
            {fieldErrors?.driverId && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.driverId}</p>
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
            {fieldErrors?.truckId && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.truckId}</p>
            )}
          </div>
        </div>

        {/* Co-Drivers */}
        {drivers.filter((d) => d.id !== selectedDriverId).length > 0 && (
          <div>
            <p className={labelClass}>
              Co-Drivers <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </p>
            <div className="mt-2 space-y-2 rounded-lg border border-input bg-background px-3 py-3">
              {drivers
                .filter((d) => d.id !== selectedDriverId)
                .map((driver) => (
                  <label key={driver.id} className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={coDriverIds.includes(driver.id)}
                      onChange={() => toggleCoDriver(driver.id)}
                      disabled={isPending}
                      className="h-4 w-4 rounded border-input text-primary focus:ring-ring/20"
                    />
                    <span className="text-sm text-foreground">
                      {driver.firstName || ''} {driver.lastName || ''}
                    </span>
                  </label>
                ))}
            </div>
          </div>
        )}

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
          {fieldErrors?.notes && (
            <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.notes}</p>
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
