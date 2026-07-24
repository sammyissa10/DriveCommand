'use client';

import type { ActionState } from '@drivecommand/types';

import { useActionState, useState, useEffect } from 'react';
import Link from 'next/link';
import { FacilityAddressSelect, type FacilityOption } from '@/components/routes/FacilityAddressSelect';
import { getOSRMDistanceMiles } from '@/lib/geo/osrm';
import { routeDriverBlockedLabel } from '@/lib/routes/driver-blocked-label';
import { canRemoveWaypoint, removeWaypointById } from '@/lib/routes/waypoint-list';
import { Navigation, Plus, ChevronUp, ChevronDown, X, Loader2 } from 'lucide-react';

interface Coords {
  lat: number;
  lng: number;
}

interface Waypoint {
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
    carrierTruckId?: string;
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
  drivers: Array<{
    id: string | null;
    carrierDriverId?: string | null;
    firstName: string | null;
    lastName: string | null;
    assignable?: boolean;
    blockedReason?: 'INVITE_PENDING' | 'ACCESS_REVOKED' | null;
  }>;
  trucks: Array<{
    id: string;
    unitNumber: string;
    displayName: string | null;
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

function makeWaypoint(overrides: Partial<Waypoint> & { type: 'PICKUP' | 'DELIVERY' }): Waypoint {
  return {
    clientId: crypto.randomUUID(),
    address: '',
    scheduledAt: '',
    notes: '',
    ...overrides,
  };
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

  // Map of waypoint clientId -> resolved coordinates (facility lookup or manual geocode)
  const [waypointCoords, setWaypointCoords] = useState<Map<string, Coords>>(new Map());
  const [distance, setDistance] = useState<number | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState<string>(initialData?.driverId || '');
  const [coDriverIds, setCoDriverIds] = useState<string[]>(initialCoDriverIds ?? []);
  const [facilities, setFacilities] = useState<FacilityOption[]>([]);

  // Fetch tenant facilities once — powers the Origin/Destination/Stop facility dropdowns
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/v1/carrier/facilities?pageSize=200');
        if (!res.ok) return;
        const json = await res.json();
        setFacilities(json?.data?.items ?? []);
      } catch {
        // Leave empty — FacilityAddressSelect still works in manual mode
      }
    })();
  }, []);

  function toggleCoDriver(driverId: string) {
    setCoDriverIds((prev) => {
      const next = prev.includes(driverId)
        ? prev.filter((id) => id !== driverId)
        : [...prev, driverId];
      onCoDriversChange?.(next);
      return next;
    });
  }

  // ONE ordered waypoint list — first row is origin (Pickup), last row is destination
  // (Delivery), middle rows are user-typed stops. Minimum 2 rows always maintained.
  // Init (create): two empty rows. Init (edit): reconstruct from initialData + initialStops.
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() => {
    if (initialData) {
      const middle = (initialStops ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((s) =>
          makeWaypoint({
            type: s.type === 'DELIVERY' ? 'DELIVERY' : 'PICKUP',
            address: s.address,
            scheduledAt: toDatetimeLocalString(s.scheduledAt),
            notes: s.notes ?? '',
          })
        );
      return [
        makeWaypoint({ type: 'PICKUP', address: initialData.origin }),
        ...middle,
        makeWaypoint({ type: 'DELIVERY', address: initialData.destination }),
      ];
    }
    return [makeWaypoint({ type: 'PICKUP' }), makeWaypoint({ type: 'DELIVERY' })];
  });

  // Origin/destination coords derived from the first/last waypoint rows on every render —
  // recomputes automatically as rows are reordered, added, or removed.
  const originCoords = waypoints.length > 0 ? waypointCoords.get(waypoints[0].clientId) ?? null : null;
  const destCoords =
    waypoints.length > 0 ? waypointCoords.get(waypoints[waypoints.length - 1].clientId) ?? null : null;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [originCoords?.lat, originCoords?.lng, destCoords?.lat, destCoords?.lng]);

  function setCoordsFor(clientId: string, c: Coords | null) {
    setWaypointCoords((prev) => {
      const next = new Map(prev);
      if (c) next.set(clientId, c);
      else next.delete(clientId);
      return next;
    });
  }

  function addWaypoint() {
    // Insert a new middle row just before the last row (so destination stays last)
    setWaypoints((prev) => [...prev.slice(0, -1), makeWaypoint({ type: 'PICKUP' }), prev[prev.length - 1]]);
  }

  function removeWaypoint(clientId: string) {
    setWaypoints((prev) => removeWaypointById(prev, clientId));
  }

  // Reordering is clamped so the first row (origin) and last row (destination) never move —
  // only middle rows may swap with adjacent middle rows.
  function moveWaypointUp(idx: number) {
    if (idx <= 1) return; // idx===1 would swap into the fixed origin slot
    setWaypoints((prev) => {
      const next = [...prev];
      [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
      return next;
    });
  }

  function moveWaypointDown(idx: number) {
    setWaypoints((prev) => {
      if (idx >= prev.length - 2) return prev; // would swap into the fixed destination slot
      const next = [...prev];
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return next;
    });
  }

  function updateWaypoint(clientId: string, field: keyof Omit<Waypoint, 'clientId'>, value: string) {
    setWaypoints((prev) =>
      prev.map((w) => (w.clientId === clientId ? { ...w, [field]: value } : w))
    );
  }

  const fieldErrors = typeof state?.error === 'object' ? state.error : undefined;
  const lastIdx = waypoints.length - 1;

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

      {/* Hidden fields for each MIDDLE waypoint — 0-indexed contiguous, recomputed from
          current array order every render so stops_<i>_* stays contiguous after reorder. */}
      {waypoints.slice(1, -1).map((wp, k) => (
        <span key={wp.clientId} style={{ display: 'none' }}>
          <input type="hidden" name={`stops_${k}_type`} value={wp.type} />
          <input type="hidden" name={`stops_${k}_scheduledAt`} value={wp.scheduledAt} />
          <input type="hidden" name={`stops_${k}_notes`} value={wp.notes} />
          <input type="hidden" name={`stops_${k}_lat`} value={waypointCoords.get(wp.clientId)?.lat ?? ''} />
          <input type="hidden" name={`stops_${k}_lng`} value={waypointCoords.get(wp.clientId)?.lng ?? ''} />
        </span>
      ))}

      {/* Route Details */}
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

      {/* Route stops — ONE ordered waypoint list: first = origin (Pickup), last =
          destination (Delivery), middle = user-typed stops */}
      <div className="space-y-3 border-t border-border pt-6">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">Route Stops</h3>
          <button
            type="button"
            onClick={addWaypoint}
            disabled={isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-2.5 text-sm min-h-[44px] font-medium text-foreground shadow-sm hover:bg-muted transition-colors disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Stop
          </button>
        </div>

        {/* Distance badge — shown while loading or once both endpoints are selected */}
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

        {waypoints.map((wp, idx) => {
          const isFirst = idx === 0;
          const isLast = idx === lastIdx;
          const fieldName = isFirst ? 'origin' : isLast ? 'destination' : `stops_${idx - 1}_address`;
          const rowError = isFirst ? fieldErrors?.origin : isLast ? fieldErrors?.destination : undefined;
          const removeTitle = !canRemoveWaypoint(waypoints)
            ? 'A route needs at least an origin and a destination'
            : isFirst
              ? 'Remove origin — the next stop becomes the origin'
              : isLast
                ? 'Remove destination — the previous stop becomes the destination'
                : `Remove stop ${idx + 1}`;

          return (
            <div
              key={wp.clientId}
              className="flex gap-3 items-start rounded-lg border border-border bg-muted/20 p-4"
            >
              {/* Position badge — flex child, no absolute positioning */}
              <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-sm mt-0.5">
                {idx + 1}
              </div>

              <div className="flex-1 min-w-0 space-y-3">
                {/* Header row: fixed label (endpoints) or type select (middle) + reorder + remove */}
                <div className="flex items-center gap-2">
                  {isFirst ? (
                    <span className="flex-1 min-w-0 text-xs font-semibold text-foreground">Origin (Pickup)</span>
                  ) : isLast ? (
                    <span className="flex-1 min-w-0 text-xs font-semibold text-foreground">Destination (Delivery)</span>
                  ) : (
                    <select
                      value={wp.type}
                      onChange={(e) => updateWaypoint(wp.clientId, 'type', e.target.value)}
                      disabled={isPending}
                      className="flex-1 min-w-0 rounded-lg border border-input bg-background px-2 py-1.5 text-xs font-medium shadow-sm focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-primary disabled:opacity-50 transition-colors"
                    >
                      <option value="PICKUP">Pickup</option>
                      <option value="DELIVERY">Delivery</option>
                    </select>
                  )}

                  <div className="flex items-center gap-0.5 shrink-0">
                    {!isFirst && !isLast ? (
                      <>
                        <button
                          type="button"
                          onClick={() => moveWaypointUp(idx)}
                          disabled={idx === 1 || isPending}
                          title="Move stop up"
                          className="inline-flex items-center justify-center rounded p-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronUp className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveWaypointDown(idx)}
                          disabled={idx === lastIdx - 1 || isPending}
                          title="Move stop down"
                          className="inline-flex items-center justify-center rounded p-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronDown className="h-4 w-4" />
                        </button>
                      </>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => removeWaypoint(wp.clientId)}
                      disabled={isPending || !canRemoveWaypoint(waypoints)}
                      title={removeTitle}
                      aria-label={removeTitle}
                      className="inline-flex items-center justify-center rounded p-2 min-h-[44px] min-w-[44px] text-muted-foreground hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                {/* Address — FacilityAddressSelect; name maps to origin/destination/stops_<k>_address */}
                <div>
                  <label className={labelClass}>Address</label>
                  <FacilityAddressSelect
                    name={fieldName}
                    facilities={facilities}
                    defaultValue={wp.address}
                    required={isFirst || isLast}
                    disabled={isPending}
                    placeholder={isFirst ? 'Enter origin address...' : isLast ? 'Enter destination address...' : 'Enter stop address...'}
                    className={inputClass}
                    onAddressChange={(addr) => updateWaypoint(wp.clientId, 'address', addr)}
                    onCoordsChange={(c) => setCoordsFor(wp.clientId, c)}
                  />
                  {rowError && (
                    <p className="mt-1.5 text-sm text-red-600">{rowError}</p>
                  )}
                </div>

                {/* Per-stop Scheduled Time + Notes intentionally removed from the UI: route
                    timing lives in Route.scheduledDate at the top, and per-stop appointment
                    windows belong to the carrier trip flow (stops table), not legacy routes.
                    Hidden stops_<k>_scheduledAt / _notes fields above still submit (empty) so
                    the server contract is unchanged. */}
              </div>
            </div>
          );
        })}
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
              {drivers.map((driver) => {
                const blocked = driver.assignable === false;
                const label = `${driver.firstName || ''} ${driver.lastName || ''}`.trim();
                return (
                  <option
                    key={driver.carrierDriverId ?? driver.id}
                    value={driver.id ?? ''}
                    disabled={blocked}
                  >
                    {blocked
                      ? `${label} — ${routeDriverBlockedLabel(driver.blockedReason ?? null)}`
                      : label}
                  </option>
                );
              })}
            </select>
            {drivers.length === 0 && (
              <p className="mt-1.5 text-sm text-amber-600">
                No drivers can be assigned yet. Add a driver with an email to invite
                them, then assign once they accept.{' '}
                <Link href="/carrier/fleet/drivers/new" className="font-semibold underline">
                  Add a driver
                </Link>
              </p>
            )}
            {drivers.length > 0 && drivers.some((d) => d.assignable === false) && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Drivers with a pending invitation can&apos;t be assigned until they accept their
                portal invite.{' '}
                <Link href="/carrier/fleet/drivers" className="font-semibold underline">
                  Manage drivers
                </Link>
              </p>
            )}
            {fieldErrors?.driverId && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.driverId}</p>
            )}
          </div>

          <div>
            <label htmlFor="carrierTruckId" className={labelClass}>Truck</label>
            <select
              id="carrierTruckId"
              name="carrierTruckId"
              defaultValue={initialData?.carrierTruckId || ''}
              required
              disabled={isPending || trucks.length === 0}
              className={inputClass}
            >
              <option value="">
                {trucks.length === 0 ? 'No trucks available' : 'Select a truck...'}
              </option>
              {trucks.map((truck) => (
                <option key={truck.id} value={truck.id}>
                  {truck.displayName || truck.unitNumber}
                </option>
              ))}
            </select>
            {trucks.length === 0 && (
              <p className="mt-1.5 text-sm text-amber-600">
                Add trucks to your fleet first before creating routes.
              </p>
            )}
            {fieldErrors?.carrierTruckId && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.carrierTruckId}</p>
            )}
          </div>
        </div>

        {/* Co-Drivers — RouteDriver.driverId is also a User FK, so blocked (unassignable)
            drivers must never appear as checkable options here. */}
        {drivers.filter((d) => d.assignable !== false && d.id && d.id !== selectedDriverId).length > 0 && (
          <div>
            <p className={labelClass}>
              Co-Drivers <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </p>
            <div className="mt-2 space-y-2 rounded-lg border border-input bg-background px-3 py-3">
              {drivers
                .filter((d) => d.assignable !== false && d.id && d.id !== selectedDriverId)
                .map((driver) => (
                  <label key={driver.id} className="flex items-center gap-3 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={coDriverIds.includes(driver.id as string)}
                      onChange={() => toggleCoDriver(driver.id as string)}
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
