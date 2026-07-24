'use client';

import type { ActionState } from '@drivecommand/types';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, ChevronUp, Loader2, X } from 'lucide-react';
import Link from 'next/link';
import { createRoute } from '@/app/(owner)/actions/routes';
import { FacilityAddressSelect, type FacilityOption } from '@/components/routes/FacilityAddressSelect';
import { getOSRMDistanceMiles } from '@/lib/geo/osrm';
import { routeDriverBlockedLabel } from '@/lib/routes/assignable-drivers';
import { canRemoveWaypoint, removeWaypointById } from '@/lib/routes/waypoint-list';
import { MobileScreen, NavHeader, NavTextButton, SectionHeader, PrimaryButton } from '@/components/ui/ds';

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

interface Driver {
  id: string | null;
  carrierDriverId?: string | null;
  firstName: string | null;
  lastName: string | null;
  assignable?: boolean;
  blockedReason?: 'INVITE_PENDING' | 'ACCESS_REVOKED' | null;
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

function makeWaypoint(overrides: Partial<Waypoint> & { type: 'PICKUP' | 'DELIVERY' }): Waypoint {
  return {
    clientId: crypto.randomUUID(),
    address: '',
    scheduledAt: '',
    notes: '',
    ...overrides,
  };
}

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

  // Map of waypoint clientId -> resolved coordinates (facility lookup or manual geocode)
  const [waypointCoords, setWaypointCoords] = useState<Map<string, Coords>>(new Map());
  const [distance, setDistance] = useState<number | null>(null);
  const [distanceLoading, setDistanceLoading] = useState(false);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [coDriverIds, setCoDriverIds] = useState<string[]>([]);
  // ONE ordered waypoint list — first row is origin (Pickup), last row is destination
  // (Delivery), middle rows are user-typed stops. Create-only: always starts with 2 empty rows.
  const [waypoints, setWaypoints] = useState<Waypoint[]>(() => [
    makeWaypoint({ type: 'PICKUP' }),
    makeWaypoint({ type: 'DELIVERY' }),
  ]);
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
    setCoDriverIds((prev) =>
      prev.includes(driverId) ? prev.filter((id) => id !== driverId) : [...prev, driverId],
    );
  }

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
    return () => {
      cancelled = true;
    };
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
    setWaypoints((prev) => prev.map((w) => (w.clientId === clientId ? { ...w, [field]: value } : w)));
  }

  const fieldErrors = typeof state?.error === 'object' ? state.error : undefined;
  const generalError = typeof state?.error === 'string' ? state.error : undefined;
  const lastIdx = waypoints.length - 1;

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="New Route"
        left={<NavTextButton label="Cancel" onClick={() => router.push('/routes')} />}
        right={
          <NavTextButton
            label={isPending ? 'Creating…' : 'Create'}
            emphasized
            onClick={() => {
              if (formRef.current?.reportValidity()) formRef.current.requestSubmit();
            }}
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

        {/* Hidden fields for each MIDDLE waypoint — 0-indexed contiguous, recomputed from
            current array order every render so stops_<i>_* stays contiguous after reorder. */}
        {waypoints.slice(1, -1).map((wp, k) => (
          <span key={wp.clientId} style={{ display: 'none' }}>
            <input type="hidden" name={`stops_${k}_type`} value={wp.type} />
            <input type="hidden" name={`stops_${k}_scheduledAt`} value={wp.scheduledAt} />
            <input type="hidden" name={`stops_${k}_notes`} value={wp.notes} />
            <input
              type="hidden"
              name={`stops_${k}_lat`}
              value={waypointCoords.get(wp.clientId)?.lat ?? ''}
            />
            <input
              type="hidden"
              name={`stops_${k}_lng`}
              value={waypointCoords.get(wp.clientId)?.lng ?? ''}
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

        {/* Route stops — ONE ordered waypoint list: first = origin (Pickup), last =
            destination (Delivery), middle = user-typed stops */}
        <div>
          <SectionHeader title="Route Stops" action={{ label: 'Add', onClick: addWaypoint }} />

          {/* Live distance badge */}
          {distanceLoading ? (
            <div className="mb-3 flex items-center gap-2 rounded-[16px] bg-ds-bg px-4 py-3">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-ds-txt3" />
              <span className="text-[13px] text-ds-txt2">Calculating road distance…</span>
            </div>
          ) : null}
          {!distanceLoading && distance !== null ? (
            <div className="mb-3 rounded-[16px] bg-ds-bg px-4 py-3">
              <span className="text-[14px] text-ds-txt2">
                Estimated distance:{' '}
                <strong className="font-semibold text-ds-accent">
                  {Math.round(distance).toLocaleString()} miles
                </strong>
              </span>
            </div>
          ) : null}

          <div className="space-y-3">
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
                <div key={wp.clientId} className="space-y-3 rounded-[20px] bg-ds-card p-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ds-accent text-[12px] font-semibold text-white">
                      {idx + 1}
                    </div>
                    {isFirst ? (
                      <span className="flex-1 min-w-0 text-[13px] font-medium text-ds-txt">Origin (Pickup)</span>
                    ) : isLast ? (
                      <span className="flex-1 min-w-0 text-[13px] font-medium text-ds-txt">Destination (Delivery)</span>
                    ) : (
                      <select
                        value={wp.type}
                        onChange={(e) => updateWaypoint(wp.clientId, 'type', e.target.value)}
                        disabled={isPending}
                        className="h-[38px] flex-1 rounded-[10px] bg-ds-input px-2 text-[13px] font-medium text-ds-txt outline-none disabled:opacity-50"
                      >
                        <option value="PICKUP">Pickup</option>
                        <option value="DELIVERY">Delivery</option>
                      </select>
                    )}
                    <div className="flex items-center gap-0.5">
                      {!isFirst && !isLast ? (
                        <>
                          <button
                            type="button"
                            onClick={() => moveWaypointUp(idx)}
                            disabled={idx === 1 || isPending}
                            aria-label="Move stop up"
                            className="flex h-12 w-12 items-center justify-center rounded-full text-ds-txt3 transition active:opacity-75 disabled:opacity-30"
                          >
                            <ChevronUp className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveWaypointDown(idx)}
                            disabled={idx === lastIdx - 1 || isPending}
                            aria-label="Move stop down"
                            className="flex h-12 w-12 items-center justify-center rounded-full text-ds-txt3 transition active:opacity-75 disabled:opacity-30"
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
                        className="flex h-12 w-12 items-center justify-center rounded-full text-ds-txt3 transition active:opacity-75 disabled:opacity-30"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className={dsLabelClass}>Address</label>
                    <FacilityAddressSelect
                      name={fieldName}
                      facilities={facilities}
                      defaultValue={wp.address}
                      required={isFirst || isLast}
                      disabled={isPending}
                      placeholder={isFirst ? 'Enter origin address...' : isLast ? 'Enter destination address...' : 'Enter stop address...'}
                      className={dsFieldClass}
                      onAddressChange={(addr) => updateWaypoint(wp.clientId, 'address', addr)}
                      onCoordsChange={(c) => setCoordsFor(wp.clientId, c)}
                    />
                    {rowError ? <p className={dsErrorClass}>{rowError}</p> : null}
                  </div>

                  {!isFirst && !isLast ? (
                    <>
                      <div>
                        <label className={dsLabelClass}>
                          Scheduled Time <span className="text-ds-txt3">(optional)</span>
                        </label>
                        <input
                          type="datetime-local"
                          value={wp.scheduledAt}
                          onChange={(e) => updateWaypoint(wp.clientId, 'scheduledAt', e.target.value)}
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
                          value={wp.notes}
                          onChange={(e) => updateWaypoint(wp.clientId, 'notes', e.target.value)}
                          disabled={isPending}
                          placeholder="Stop-specific instructions..."
                          className={dsFieldClass}
                        />
                      </div>
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
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
              {drivers.length === 0 ? (
                <p className="mt-1.5 text-[13px] text-ds-warning">
                  No drivers can be assigned yet. Add a driver with an email to invite
                  them, then assign once they accept.{' '}
                  <Link href="/carrier/fleet/drivers/new" className="font-semibold underline">
                    Add a driver
                  </Link>
                </p>
              ) : null}
              {drivers.length > 0 && drivers.some((d) => d.assignable === false) ? (
                <p className="mt-1.5 text-[13px] text-ds-txt3">
                  Drivers with a pending invitation can&apos;t be assigned until they accept
                  their portal invite.{' '}
                  <Link href="/carrier/fleet/drivers" className="font-semibold underline">
                    Manage drivers
                  </Link>
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

            {/* Co-Drivers — RouteDriver.driverId is also a User FK, so blocked (unassignable)
                drivers must never appear as checkable options here. */}
            {drivers.filter((d) => d.assignable !== false && d.id && d.id !== selectedDriverId).length > 0 ? (
              <div>
                <p className={dsLabelClass}>
                  Co-Drivers <span className="text-ds-txt3">(optional)</span>
                </p>
                <div className="space-y-1 overflow-hidden rounded-[12px] bg-ds-bg">
                  {drivers
                    .filter((d) => d.assignable !== false && d.id && d.id !== selectedDriverId)
                    .map((driver) => {
                      const checked = coDriverIds.includes(driver.id as string);
                      return (
                        <button
                          key={driver.id}
                          type="button"
                          onClick={() => toggleCoDriver(driver.id as string)}
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
