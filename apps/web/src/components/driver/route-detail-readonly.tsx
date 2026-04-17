'use client';

/**
 * Dispatch detail component for the driver portal — Carrier Ops edition.
 * Displays the active CarrierDispatch with stop timeline and action buttons.
 *
 * Client component: useTransition for server action calls.
 */

import { useTransition } from 'react';
import { MapPin, Truck, Clock, Navigation, Play, CheckCircle } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types — mirrors the Prisma include shape from getMyActiveDispatch()
// ---------------------------------------------------------------------------

interface Facility {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  latitude: number | null;
  longitude: number | null;
  addressLine1: string | null;
}

interface CarrierStopShape {
  id: string;
  sequenceOrder: number;
  stopType: string;
  status: string;
  appointmentStart: Date | null;
  appointmentEnd?: Date | null;
  arrivedAt: Date | null;
  departedAt: Date | null;
  commodityDescription?: string | null;
  bolNumber?: string | null;
  specialInstructions?: string | null;
  facility: Facility;
}

interface CarrierTruckShape {
  id: string;
  unitNumber: string;
  year: number | null;
  make: string | null;
  model: string | null;
}

export interface CarrierDispatchShape {
  id: string;
  status: string;
  scheduledDeparture: Date;
  actualDeparture?: Date | null;
  scheduledArrival?: Date | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plannedMiles?: any;
  notes?: string | null;
  truck: CarrierTruckShape;
  stops: CarrierStopShape[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildNavUrl(stop: CarrierStopShape): string {
  if (stop.facility.latitude != null && stop.facility.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${stop.facility.latitude},${stop.facility.longitude}`;
  }
  const addr = [stop.facility.addressLine1, stop.facility.city, stop.facility.state]
    .filter(Boolean)
    .join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr || stop.facility.name)}`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    planned: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    in_progress: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    completed: 'bg-muted text-muted-foreground',
    cancelled: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    tonu: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

function stopTypeBadge(type: string) {
  const map: Record<string, string> = {
    pickup: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    delivery: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400',
    fuel_stop: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    relay: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    rest: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  };
  return map[type] ?? 'bg-muted text-muted-foreground';
}

function stopCircleColor(status: string) {
  if (status === 'completed') return 'bg-green-500 text-white';
  if (status === 'arrived') return 'bg-blue-500 text-white';
  if (status === 'skipped') return 'bg-red-400 text-white';
  return 'bg-muted text-muted-foreground';
}

function stopStatusBadge(status: string) {
  const map: Record<string, string> = {
    pending: 'bg-muted text-muted-foreground',
    arrived: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    skipped: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  };
  return map[status] ?? 'bg-muted text-muted-foreground';
}

// ---------------------------------------------------------------------------
// Start Trip button
// ---------------------------------------------------------------------------

interface StartTripButtonProps {
  dispatchId: string;
  startAction: (id: string) => Promise<unknown>;
}

export function StartTripButton({ dispatchId, startAction }: StartTripButtonProps) {
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    startTransition(async () => {
      const result = await startAction(dispatchId);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      if (r?.error) {
        alert(r.error);
      }
    });
  }

  return (
    <button
      onClick={handleClick}
      disabled={isPending}
      className="inline-flex items-center gap-2 rounded-md bg-green-600 px-5 py-2.5 text-sm font-semibold text-white min-h-[44px] hover:bg-green-700 disabled:opacity-50 transition-colors"
    >
      <Play className="h-4 w-4" />
      {isPending ? 'Starting...' : 'Start Trip'}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Arrive / Complete Stop buttons
// ---------------------------------------------------------------------------

interface StopActionButtonsProps {
  stop: CarrierStopShape;
  arriveAction: (id: string) => Promise<unknown>;
  completeAction: (id: string) => Promise<unknown>;
}

export function StopActionButtons({ stop, arriveAction, completeAction }: StopActionButtonsProps) {
  const [isPending, startTransition] = useTransition();

  function handleArrive() {
    startTransition(async () => {
      const result = await arriveAction(stop.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      if (r?.error) alert(r.error);
    });
  }

  function handleComplete() {
    startTransition(async () => {
      const result = await completeAction(stop.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      if (r?.error) alert(r.error);
    });
  }

  if (stop.status === 'pending') {
    return (
      <button
        onClick={handleArrive}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white min-h-[40px] hover:bg-blue-700 disabled:opacity-50 transition-colors"
      >
        <MapPin className="h-3.5 w-3.5" />
        {isPending ? 'Marking...' : 'Arrive'}
      </button>
    );
  }

  if (stop.status === 'arrived') {
    return (
      <button
        onClick={handleComplete}
        disabled={isPending}
        className="inline-flex items-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white min-h-[40px] hover:bg-emerald-700 disabled:opacity-50 transition-colors"
      >
        <CheckCircle className="h-3.5 w-3.5" />
        {isPending ? 'Completing...' : 'Complete Stop'}
      </button>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface DispatchDetailProps {
  dispatch: CarrierDispatchShape;
  startAction: (id: string) => Promise<unknown>;
  arriveAction: (id: string) => Promise<unknown>;
  completeAction: (id: string) => Promise<unknown>;
}

export function DispatchDetail({ dispatch, startAction, arriveAction, completeAction }: DispatchDetailProps) {
  const truck = dispatch.truck;
  const truckLabel = [truck.year, truck.make, truck.model].filter(Boolean).join(' ') || truck.unitNumber;

  // Find the first non-completed, non-skipped stop for navigation highlight
  const activeStop = dispatch.stops.find((s) => s.status === 'pending' || s.status === 'arrived') ?? null;

  return (
    <div className="space-y-4">
      {/* Dispatch header card */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground">Active Dispatch</h2>
            <p className="text-sm text-muted-foreground mt-0.5">
              Departure: {new Date(dispatch.scheduledDeparture).toLocaleString()}
            </p>
          </div>
          <span
            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusBadge(dispatch.status)}`}
          >
            {dispatch.status.replace(/_/g, ' ')}
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Truck
            </dt>
            <dd className="font-medium mt-0.5">{truckLabel}</dd>
            <dd className="text-xs text-muted-foreground">Unit #{truck.unitNumber}</dd>
          </div>
          {dispatch.plannedMiles && (
            <div>
              <dt className="text-muted-foreground">Planned Miles</dt>
              <dd className="font-medium mt-0.5">{Number(dispatch.plannedMiles).toLocaleString()} mi</dd>
            </div>
          )}
          {dispatch.actualDeparture && (
            <div>
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Departed
              </dt>
              <dd className="font-medium mt-0.5">{new Date(dispatch.actualDeparture).toLocaleString()}</dd>
            </div>
          )}
        </dl>

        {/* Start Trip button — only when planned */}
        {dispatch.status === 'planned' && (
          <div className="mt-4 pt-4 border-t border-border">
            <StartTripButton dispatchId={dispatch.id} startAction={startAction} />
          </div>
        )}

        {/* Navigation link to active stop */}
        {activeStop && (
          <div className="mt-4 pt-4 border-t border-border">
            <a
              href={buildNavUrl(activeStop)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground min-h-[44px] hover:opacity-90 transition-opacity"
            >
              <Navigation className="h-4 w-4" />
              Navigate to Next Stop
            </a>
          </div>
        )}
      </div>

      {/* Stops timeline */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Stops ({dispatch.stops.length})
        </h3>

        <ol className="space-y-4">
          {dispatch.stops.map((stop, idx) => (
            <li key={stop.id} className="flex gap-3 items-start">
              {/* Sequence circle */}
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5 ${stopCircleColor(stop.status)}`}
              >
                {stop.status === 'completed' ? '✓' : stop.status === 'skipped' ? '✕' : idx + 1}
              </div>

              {/* Stop content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-semibold text-foreground">{stop.facility.name}</p>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stopTypeBadge(stop.stopType)}`}
                  >
                    {stop.stopType.replace(/_/g, ' ')}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${stopStatusBadge(stop.status)}`}
                  >
                    {stop.status}
                  </span>
                </div>

                {/* Location */}
                {(stop.facility.city || stop.facility.state) && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <MapPin className="h-3 w-3" />
                    {[stop.facility.city, stop.facility.state].filter(Boolean).join(', ')}
                  </p>
                )}

                {/* Appointment window */}
                {stop.appointmentStart && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Appt: {new Date(stop.appointmentStart).toLocaleString()}
                    {stop.appointmentEnd && ` – ${new Date(stop.appointmentEnd).toLocaleTimeString()}`}
                  </p>
                )}

                {/* Timestamps */}
                {stop.arrivedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Arrived: {new Date(stop.arrivedAt).toLocaleString()}
                  </p>
                )}
                {stop.departedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Departed: {new Date(stop.departedAt).toLocaleString()}
                  </p>
                )}

                {/* Special instructions */}
                {stop.specialInstructions && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 italic">
                    {stop.specialInstructions}
                  </p>
                )}

                {/* Action buttons (in_progress dispatches only) */}
                {dispatch.status === 'in_progress' && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <StopActionButtons
                      stop={stop}
                      arriveAction={arriveAction}
                      completeAction={completeAction}
                    />
                    {(stop.status === 'pending' || stop.status === 'arrived') && (
                      <a
                        href={buildNavUrl(stop)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-medium text-foreground min-h-[40px] hover:bg-muted transition-colors"
                      >
                        <Navigation className="h-3.5 w-3.5" />
                        Navigate
                      </a>
                    )}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
