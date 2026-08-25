'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ClipboardCheck, MapPin } from 'lucide-react';
import {
  TripStartRefusalDialog,
  type TripStartRefusal,
} from '@/components/driver/trip-start-refusal';

// The dispatch type returned by getMyActiveDispatch — stops + truck included
interface DispatchStop {
  id: string;
  status: string;
  sequenceOrder: number;
  scheduledArrival?: string | Date | null;
  facility?: {
    id: string;
    name: string;
    city: string | null;
    state: string | null;
  } | null;
}

interface DispatchData {
  id: string;
  status: string;
  scheduledDeparture?: string | Date | null;
  truck?: {
    id: string;
    unitNumber: string;
    displayName?: string | null;
    year?: number | null;
    make?: string | null;
    model?: string | null;
  } | null;
  stops?: DispatchStop[];
  firstDeliveryStop?: {
    id: string;
    sequenceOrder: number;
    stopType: string;
    facility: {
      name: string;
      addressLine1: string | null;
      city: string | null;
      state: string | null;
      latitude?: number | null;
      longitude?: number | null;
    };
  } | null;
}

interface DriverDispatchCardProps {
  dispatch: DispatchData | null;
  startAction?: (dispatchId: string) => Promise<unknown>;
}

function formatDate(date: string | Date | null | undefined): string {
  if (!date) return '—';
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(d);
}

function buildGoogleMapsUrl(facility: {
  name: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  latitude?: number | null;
  longitude?: number | null;
}): string {
  if (facility.latitude != null && facility.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${facility.latitude},${facility.longitude}&travelmode=driving`;
  }
  const addr = [facility.addressLine1, facility.city, facility.state].filter(Boolean).join(', ');
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(addr || facility.name)}&travelmode=driving`;
}

const STATUS_BADGE: Record<string, string> = {
  planned: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  in_progress: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  completed: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  cancelled: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

const STATUS_LABEL: Record<string, string> = {
  planned: 'Scheduled',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export function DriverDispatchCard({ dispatch, startAction }: DriverDispatchCardProps) {
  const [mounted, setMounted] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [refusal, setRefusal] = useState<TripStartRefusal | null>(null);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  if (!dispatch) {
    return (
      <div className="bg-card rounded-xl shadow-sm border border-border p-6 flex flex-col items-center text-center gap-3">
        <MapPin className="h-10 w-10 text-muted-foreground/30" />
        <div>
          <p className="font-semibold text-foreground">No active dispatch</p>
          <p className="text-sm text-muted-foreground mt-1">
            Contact your dispatcher for your next assignment.
          </p>
        </div>
      </div>
    );
  }

  const stops = dispatch.stops ?? [];
  const completedStops = stops.filter((s) => s.status === 'completed' || s.status === 'skipped').length;
  const totalStops = stops.length;
  const nextStop = stops.find((s) => s.status !== 'completed' && s.status !== 'skipped' && s.status !== 'cancelled');
  const allStopsDone = totalStops > 0 && completedStops === totalStops;
  const currentStop = stops.find((s) => s.status === 'arrived');
  const nextPendingStop = stops.find((s) => s.status === 'pending');

  // Index for "Stop X of Y" display
  const activeStopIndex = currentStop
    ? stops.indexOf(currentStop) + 1
    : nextPendingStop
    ? stops.indexOf(nextPendingStop) + 1
    : null;

  function handleStartTrip() {
    if (!startAction) return;
    startTransition(async () => {
      const result = await startAction(dispatch!.id);
      const r = result as { error?: string; code?: string } | null;
      if (r?.error) {
        // The gate's own sentence, carried into an in-app dialog that can also
        // carry the next step — the checklist, or the blocked screen. This was
        // `alert(r.error)`; see `trip-start-refusal.tsx` for the three reasons
        // that was the wrong surface, only one of which was cosmetic.
        setRefusal({ message: r.error, code: r.code });
        return;
      }
      if (dispatch!.firstDeliveryStop) {
        window.open(buildGoogleMapsUrl(dispatch!.firstDeliveryStop.facility), '_blank');
      }
      router.push('/my-route');
    });
  }

  function handleBeginNav() {
    startTransition(async () => {
      if (dispatch!.firstDeliveryStop) {
        window.open(buildGoogleMapsUrl(dispatch!.firstDeliveryStop.facility), '_blank');
      }
      router.push('/my-route');
    });
  }

  function handleCompleteCurrentStop() {
    router.push('/my-route');
  }

  // Determine CTA state
  type CtaState = 'start' | 'complete_stop' | 'continue' | 'trip_done' | 'completed';
  let ctaState: CtaState = 'continue';
  if (dispatch.status === 'planned') {
    ctaState = 'start';
  } else if (dispatch.status === 'completed') {
    ctaState = 'completed';
  } else if (dispatch.status === 'in_progress') {
    if (allStopsDone) {
      ctaState = 'trip_done';
    } else if (currentStop) {
      ctaState = 'complete_stop';
    } else {
      ctaState = 'continue';
    }
  }

  const isPlanned = dispatch.status === 'planned';

  return (
    <>
      {/* The gate's refusal, with its next step. Replaces alert(). */}
      <TripStartRefusalDialog
        dispatchId={dispatch.id}
        refusal={refusal}
        onClose={() => setRefusal(null)}
      />
    <div className="bg-card rounded-xl shadow-sm border border-border p-4">
      {/* Header row */}
      <div className="flex items-start justify-between mb-3">
        <div className="flex-1 min-w-0">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              STATUS_BADGE[dispatch.status] ?? STATUS_BADGE.planned
            }`}
          >
            {STATUS_LABEL[dispatch.status] ?? dispatch.status}
          </span>
          {dispatch.truck && (
            <p className="text-xs text-muted-foreground mt-1">
              Truck {dispatch.truck.displayName || dispatch.truck.unitNumber}
            </p>
          )}
        </div>
        {dispatch.scheduledDeparture && (
          <p className="text-xs text-muted-foreground ml-3 shrink-0">
            {mounted ? formatDate(dispatch.scheduledDeparture) : '\u00A0'}
          </p>
        )}
      </div>

      {/* Stop progress */}
      {totalStops > 0 && (
        <p className="text-sm text-muted-foreground mb-2">
          {completedStops} of {totalStops} stop{totalStops !== 1 ? 's' : ''} completed
        </p>
      )}

      {/* Next stop */}
      {nextStop && nextStop.facility && (
        <div className="flex items-start gap-2 mb-4 p-3 bg-muted/50 rounded-lg">
          <MapPin className="h-4 w-4 text-primary mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {nextStop.facility.name}
            </p>
            <p className="text-xs text-muted-foreground">
              {[nextStop.facility.city, nextStop.facility.state].filter(Boolean).join(', ')}
              {nextStop.scheduledArrival && (
                <> · {mounted ? formatDate(nextStop.scheduledArrival) : '\u00A0'}</>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Current stop status indicator — only when in_progress */}
      {dispatch.status === 'in_progress' && (currentStop || nextPendingStop) && activeStopIndex !== null && (
        <div className="flex items-center justify-between mb-3 px-3 py-2 bg-muted/30 rounded-lg border border-border">
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">
              Stop {activeStopIndex} of {totalStops}
            </p>
            {(currentStop ?? nextPendingStop)?.facility && (
              <p className="text-sm font-medium text-foreground truncate">
                {(currentStop ?? nextPendingStop)!.facility!.name}
              </p>
            )}
          </div>
          {currentStop ? (
            <span className="ml-2 shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              Arrived
            </span>
          ) : (
            <span className="ml-2 shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
              Pending
            </span>
          )}
        </div>
      )}

      {/* CTA */}
      {ctaState === 'completed' ? (
        <div className="flex items-center justify-center w-full h-12 rounded-lg bg-green-100 dark:bg-green-900">
          <span className="text-sm font-semibold text-green-700 dark:text-green-300">Completed</span>
        </div>
      ) : ctaState === 'trip_done' ? (
        <button
          disabled
          className="flex items-center justify-center w-full h-12 rounded-lg bg-muted text-muted-foreground font-semibold text-sm cursor-not-allowed"
        >
          Trip Complete
        </button>
      ) : ctaState === 'complete_stop' ? (
        <button
          onClick={handleCompleteCurrentStop}
          disabled={isPending}
          className="flex items-center justify-center w-full h-12 rounded-lg bg-green-600 hover:bg-green-700 text-white font-semibold text-sm transition-colors active:scale-[0.98] disabled:opacity-50"
        >
          {isPending ? 'Loading...' : 'Complete Current Stop'}
        </button>
      ) : ctaState === 'start' ? (
        <div className="space-y-2">
          <button
            onClick={handleStartTrip}
            disabled={isPending}
            className="flex items-center justify-center w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold text-sm transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
          >
            {isPending ? 'Starting...' : 'Start Trip & Navigate'}
          </button>

          {/*
            NAVIGATION WIRE-UP for `/inspection/[dispatchId]`.

            The refusal dialog also routes here, but only once the gate has said
            no — which makes the checklist reachable only by being turned away,
            and only on a tenant that requires one. Drivers walk the truck
            BEFORE they tap start, so there is a standing entry too.

            It is shown on any planned trip rather than conditionally on the
            gate, because this card does not read the gate and adding a fetch to
            it to decide whether to render a link would be a query per dashboard
            load for a link. When no inspection is needed the page says so in a
            sentence and offers the way back — a correct answer, not a dead end.
          */}
          <Link
            href={`/inspection/${dispatch.id}`}
            className="flex items-center justify-center gap-2 w-full min-h-[44px] rounded-lg bg-muted text-foreground font-semibold text-sm transition-colors hover:bg-muted/80"
          >
            <ClipboardCheck className="h-4 w-4 shrink-0" />
            Pre-trip inspection
          </Link>
        </div>
      ) : (
        <button
          onClick={handleBeginNav}
          disabled={isPending}
          className="flex items-center justify-center w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold text-sm transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
        >
          {isPending ? 'Loading...' : 'Continue to Stops'}
        </button>
      )}
    </div>
    </>
  );
}
