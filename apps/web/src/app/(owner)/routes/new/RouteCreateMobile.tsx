'use client';

import type { ActionState } from '@drivecommand/types';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import { createRoute } from '@/app/(owner)/actions/routes';
import { AddressAutocomplete } from '@/components/shared/address-autocomplete';
import { getOSRMDistanceMiles } from '@/lib/geo/osrm';
import { MobileScreen, NavHeader, NavTextButton, SectionHeader, PrimaryButton } from '@/components/ui/ds';

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

interface Driver {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface Truck {
  id: string;
  unitNumber: string;
  displayName: string | null;
}

const dsFieldClass =
  'h-[46px] w-full rounded-[12px] bg-ds-input px-3 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3 disabled:opacity-50';
const dsLabelClass = 'mb-1.5 block text-[13px] text-ds-txt2';
const dsErrorClass = 'mt-1.5 text-[13px] text-ds-danger';

/**
 * New Route — mobile-web design system view (owner portal).
 *
 * Faithful ds restyle of RouteForm's new-route path: identical React state,
 * effects and handlers (copied verbatim), submitting via the SAME createRoute
 * server action with the IDENTICAL FormData contract — name/origin/destination/
 * scheduledDate/driverId/carrierTruckId/notes/distanceMiles/coDriverIds/
 * stops_submitted/stops_<i>_type/scheduledAt/notes/lat/lng/address.
 */
export function RouteCreateMobile({ drivers, trucks }: { drivers: Driver[]; trucks: Truck[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(
    createRoute as (prevState: ActionState | null, formData: FormData) => Promise<ActionState>,
    { success: false },
  );

  const [originCoords, setOriginCoords] = useState<Coords | null>(null);
  const [destCoords, setDestCoords] = useState<Coords | null>(null);
  const [stopCoords, setStopCoords] = useState<Map<string, Coords>>(new Map());
  const [distance, setDistance] = useState<number | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [coDriverIds, setCoDriverIds] = useState<string[]>([]);
  const [stops, setStops] = useState<StopDraft[]>([]);

  function toggleCoDriver(driverId: string) {
    setCoDriverIds((prev) =>
      prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId],
    );
  }

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
    return () => {
      cancelled = true;
    };
  }, [originCoords, destCoords]);

  function addStop() {
    setStops((prev) => [
      ...prev,
      { clientId: crypto.randomUUID(), type: 'PICKUP', address: '', scheduledAt: '', notes: '' },
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
    setStops((prev) => prev.map((s) => (s.clientId === clientId ? { ...s, [field]: value } : s)));
  }

  const fieldErrors = typeof state?.error === 'object' ? state.error : undefined;
  const generalError = typeof state?.error === 'string' ? state.error : undefined;

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="New Route"
        left={<NavTextButton label="Cancel" onClick={() => router.push('/routes')} />}
        right={
          <NavTextButton
            label={isPending ? 'Creating…' : 'Create'}
            emphasized
            onClick={() => formRef.current?.requestSubmit()}
            disabled={isPending}
          />
        }
      />

      <form ref={formRef} action={formAction} className="space-y-6 pt-2">
        {/* Hidden distanceMiles field — mirrors distance state (async OSRM). No saved-distance
            fallback here (create path has no initialData). */}
        <input
          type="hidden"
          name="distanceMiles"
          value={distance !== null ? String(Math.round(distance)) : ''}
        />

        {/* Hidden co-driver IDs — comma-separated list submitted with form */}
        <input type="hidden" name="coDriverIds" value={coDriverIds.join(',')} />

        {/* Hidden stops_submitted sentinel — tells server action stops section was rendered */}
        <input type="hidden" name="stops_submitted" value="true" />

        {/* Hidden fields for each stop — index-based for server action parsing */}
        {stops.map((stop, idx) => (
          <span key={stop.clientId} style={{ display: 'none' }}>
            <input type="hidden" name={`stops_${idx}_type`} value={stop.type} />
            <input type="hidden" name={`stops_${idx}_scheduledAt`} value={stop.scheduledAt} />
            <input type="hidden" name={`stops_${idx}_notes`} value={stop.notes} />
            <input
              type="hidden"
              name={`stops_${idx}_lat`}
              value={stopCoords.get(stop.clientId)?.lat ?? ''}
            />
            <input
              type="hidden"
              name={`stops_${idx}_lng`}
              value={stopCoords.get(stop.clientId)?.lng ?? ''}
            />
          </span>
        ))}

        {generalError ? (
          <div className="rounded-[16px] bg-ds-danger/[0.14] px-4 py-3">
            <p className="text-[14px] text-ds-danger">{generalError}</p>
          </div>
        ) : null}

        {/* Route Details */}
        <div>
          <SectionHeader title="Route Details" />
          <div className="space-y-3 rounded-[20px] bg-ds-card p-4">
            <div>
              <label htmlFor="name" className={dsLabelClass}>
                Route Name <span className="text-ds-txt3">(optional)</span>
              </label>
              <input
                id="name"
                name="name"
                type="text"
                maxLength={120}
                disabled={isPending}
                placeholder="e.g. Chicago Steel Run"
                className={dsFieldClass}
              />
            </div>

            <div>
              <label htmlFor="origin" className={dsLabelClass}>
                Origin
              </label>
              <AddressAutocomplete
                id="origin"
                name="origin"
                required
                disabled={isPending}
                placeholder="Enter origin address..."
                className={dsFieldClass}
                onPlaceSelect={(place) => setOriginCoords({ lat: place.lat, lng: place.lng })}
              />
              {fieldErrors?.origin ? <p className={dsErrorClass}>{fieldErrors.origin}</p> : null}
            </div>

            <div>
              <label htmlFor="destination" className={dsLabelClass}>
                Destination
              </label>
              <AddressAutocomplete
                id="destination"
                name="destination"
                required
                disabled={isPending}
                placeholder="Enter destination address..."
                className={dsFieldClass}
                onPlaceSelect={(place) => setDestCoords({ lat: place.lat, lng: place.lng })}
              />
              {fieldErrors?.destination ? (
                <p className={dsErrorClass}>{fieldErrors.destination}</p>
              ) : null}
            </div>

            {/* Live distance badge */}
            {distanceLoading ? (
              <div className="flex items-center gap-2 rounded-[16px] bg-ds-bg px-4 py-3">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ds-txt3" />
                <span className="text-[13px] text-ds-txt2">Calculating road distance…</span>
              </div>
            ) : null}
            {!distanceLoading && distance !== null ? (
              <div className="rounded-[16px] bg-ds-bg px-4 py-3">
                <span className="text-[14px] text-ds-txt2">
                  Estimated distance:{' '}
                  <strong className="font-semibold text-ds-accent">
                    {Math.round(distance).toLocaleString()} miles
                  </strong>
                </span>
              </div>
            ) : null}

            <div>
              <label htmlFor="scheduledDate" className={dsLabelClass}>
                Scheduled Date
              </label>
              <input
                type="datetime-local"
                id="scheduledDate"
                name="scheduledDate"
                required
                disabled={isPending}
                className={dsFieldClass}
              />
              {fieldErrors?.scheduledDate ? (
                <p className={dsErrorClass}>{fieldErrors.scheduledDate}</p>
              ) : null}
            </div>
          </div>
        </div>

        {/* Stops */}
        <div>
          <SectionHeader title="Stops" action={{ label: 'Add', onClick: addStop }} />
          {stops.length === 0 ? (
            <div className="rounded-[20px] bg-ds-card px-4 py-5 text-center text-[13px] text-ds-txt3">
              No stops yet. Tap Add to define pickup or delivery waypoints.
            </div>
          ) : (
            <div className="space-y-3">
              {stops.map((stop, idx) => (
                <div key={stop.clientId} className="space-y-3 rounded-[20px] bg-ds-card p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ds-accent text-[12px] font-semibold text-white">
                      {idx + 1}
                    </div>
                    <select
                      value={stop.type}
                      onChange={(e) => updateStop(stop.clientId, 'type', e.target.value)}
                      disabled={isPending}
                      className="h-[38px] flex-1 rounded-[10px] bg-ds-input px-2 text-[13px] font-medium text-ds-txt outline-none disabled:opacity-50"
                    >
                      <option value="PICKUP">Pickup</option>
                      <option value="DELIVERY">Delivery</option>
                    </select>
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveStopUp(idx)}
                        disabled={idx === 0 || isPending}
                        aria-label="Move stop up"
                        className="flex h-12 w-12 items-center justify-center rounded-full text-ds-txt3 transition active:opacity-75 disabled:opacity-30"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveStopDown(idx)}
                        disabled={idx === stops.length - 1 || isPending}
                        aria-label="Move stop down"
                        className="flex h-12 w-12 items-center justify-center rounded-full text-ds-txt3 transition active:opacity-75 disabled:opacity-30"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeStop(stop.clientId)}
                        disabled={isPending}
                        aria-label={`Remove stop ${idx + 1}`}
                        className="flex h-12 w-12 items-center justify-center rounded-full text-ds-txt3 transition active:opacity-75 disabled:opacity-30"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={dsLabelClass}>Address</label>
                    <AddressAutocomplete
                      id={`stop_${stop.clientId}_address`}
                      name={`stops_${idx}_address`}
                      defaultValue={stop.address}
                      disabled={isPending}
                      placeholder="Enter stop address..."
                      className={dsFieldClass}
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

                  <div>
                    <label className={dsLabelClass}>
                      Scheduled Time <span className="text-ds-txt3">(optional)</span>
                    </label>
                    <input
                      type="datetime-local"
                      value={stop.scheduledAt}
                      onChange={(e) => updateStop(stop.clientId, 'scheduledAt', e.target.value)}
                      disabled={isPending}
                      className={dsFieldClass}
                    />
                  </div>

                  <div>
                    <label className={dsLabelClass}>
                      Notes <span className="text-ds-txt3">(optional)</span>
                    </label>
                    <input
                      type="text"
                      value={stop.notes}
                      onChange={(e) => updateStop(stop.clientId, 'notes', e.target.value)}
                      disabled={isPending}
                      placeholder="Stop-specific instructions..."
                      className={dsFieldClass}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Assignments */}
        <div>
          <SectionHeader title="Assignments" />
          <div className="space-y-3 rounded-[20px] bg-ds-card p-4">
            <div>
              <label htmlFor="driverId" className={dsLabelClass}>
                Primary Driver
              </label>
              <select
                id="driverId"
                name="driverId"
                value={selectedDriverId}
                onChange={(e) => setSelectedDriverId(e.target.value)}
                required
                disabled={isPending || drivers.length === 0}
                className={dsFieldClass}
              >
                <option value="">
                  {drivers.length === 0 ? 'No drivers available' : 'Select…'}
                </option>
                {drivers.map((driver) => (
                  <option key={driver.id} value={driver.id}>
                    {driver.firstName || ''} {driver.lastName || ''}
                  </option>
                ))}
              </select>
              {drivers.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-ds-warning">
                  Invite drivers first before creating routes.
                </p>
              ) : null}
              {fieldErrors?.driverId ? <p className={dsErrorClass}>{fieldErrors.driverId}</p> : null}
            </div>

            <div>
              <label htmlFor="carrierTruckId" className={dsLabelClass}>
                Truck
              </label>
              <select
                id="carrierTruckId"
                name="carrierTruckId"
                defaultValue=""
                required
                disabled={isPending || trucks.length === 0}
                className={dsFieldClass}
              >
                <option value="">{trucks.length === 0 ? 'No trucks available' : 'Select…'}</option>
                {trucks.map((truck) => (
                  <option key={truck.id} value={truck.id}>
                    {truck.displayName || truck.unitNumber}
                  </option>
                ))}
              </select>
              {trucks.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-ds-warning">
                  Add trucks to your fleet first before creating routes.
                </p>
              ) : null}
              {fieldErrors?.carrierTruckId ? (
                <p className={dsErrorClass}>{fieldErrors.carrierTruckId}</p>
              ) : null}
            </div>

            {/* Co-Drivers */}
            {drivers.filter((d) => d.id !== selectedDriverId).length > 0 ? (
              <div>
                <p className={dsLabelClass}>
                  Co-Drivers <span className="text-ds-txt3">(optional)</span>
                </p>
                <div className="space-y-1 overflow-hidden rounded-[12px] bg-ds-bg">
                  {drivers
                    .filter((d) => d.id !== selectedDriverId)
                    .map((driver) => {
                      const checked = coDriverIds.includes(driver.id);
                      return (
                        <button
                          key={driver.id}
                          type="button"
                          onClick={() => toggleCoDriver(driver.id)}
                          disabled={isPending}
                          className="flex min-h-[48px] w-full items-center justify-between px-3 py-2 text-left transition active:opacity-75 disabled:opacity-50"
                        >
                          <span className="text-[15px] text-ds-txt">
                            {driver.firstName || ''} {driver.lastName || ''}
                          </span>
                          <span
                            className={
                              checked
                                ? 'flex h-5 w-5 items-center justify-center rounded-full bg-ds-accent text-white'
                                : 'flex h-5 w-5 items-center justify-center rounded-full border border-ds-hairline'
                            }
                          >
                            {checked ? <Check className="h-3.5 w-3.5" /> : null}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </div>
            ) : null}

            <div>
              <label htmlFor="notes" className={dsLabelClass}>
                Notes <span className="text-ds-txt3">(optional)</span>
              </label>
              <textarea
                id="notes"
                name="notes"
                maxLength={1000}
                rows={3}
                disabled={isPending}
                className="w-full resize-none rounded-[12px] bg-ds-input px-3 py-2.5 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3 disabled:opacity-50"
              />
              {fieldErrors?.notes ? <p className={dsErrorClass}>{fieldErrors.notes}</p> : null}
            </div>
          </div>
        </div>

        <PrimaryButton
          type="submit"
          label={isPending ? 'Creating…' : 'Create Route'}
          disabled={isPending}
          loading={isPending}
        />
      </form>
    </MobileScreen>
  );
}
