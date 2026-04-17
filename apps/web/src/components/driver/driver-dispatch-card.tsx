'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MapPin } from 'lucide-react';

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
  const completedStops = stops.filter((s) => s.status === 'completed').length;
  const totalStops = stops.length;
  const nextStop = stops.find((s) => s.status !== 'completed' && s.status !== 'cancelled');

  function handleStartTrip() {
    if (!startAction) return;
    startTransition(async () => {
      const result = await startAction(dispatch!.id);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const r = result as any;
      if (r?.error) {
        alert(r.error);
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

  const isPlanned = dispatch.status === 'planned';
  const ctaLabel = isPlanned ? 'Start Trip & Navigate' : 'Begin Navigation';
  const ctaPending = isPlanned ? 'Starting...' : 'Loading...';

  return (
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
              Truck {dispatch.truck.unitNumber}
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

      {/* CTA */}
      <button
        onClick={isPlanned ? handleStartTrip : handleBeginNav}
        disabled={isPending}
        className="flex items-center justify-center w-full h-12 rounded-lg bg-primary text-primary-foreground font-semibold text-sm transition-colors hover:bg-primary/90 active:scale-[0.98] disabled:opacity-50"
      >
        {isPending ? ctaPending : ctaLabel}
      </button>
    </div>
  );
}
