'use client';

/**
 * Dispatch history list component for the driver portal.
 * Shows completed dispatches with drill-down stop timeline + document upload.
 */

import { useState, useEffect } from 'react';
import { ArrowLeft, Truck, Clock, MapPin, FileText } from 'lucide-react';
import type { getMyDispatchHistory } from '@/app/(driver)/actions/driver-routes';
import { StopDocumentUpload } from './stop-document-upload';

type HistoryDispatch = Awaited<ReturnType<typeof getMyDispatchHistory>>[number];

// ---------------------------------------------------------------------------
// Hydration-safe local time helpers (mirror from route-detail-readonly)
// ---------------------------------------------------------------------------

function useMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}

function formatLocalTime(timestamp: string | Date) {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

function formatLocalDate(timestamp: string | Date) {
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function LocalTime({ date, format = 'datetime' }: { date: string | Date; format?: 'datetime' | 'date' }) {
  const mounted = useMounted();
  if (!mounted) return <span>{new Date(date).toISOString().slice(0, 16).replace('T', ' ')}</span>;
  if (format === 'date') return <span>{formatLocalDate(date)}</span>;
  return <span>{formatLocalTime(date)}</span>;
}

// ---------------------------------------------------------------------------
// Stop type / status badges (mirrors route-detail-readonly)
// ---------------------------------------------------------------------------

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
  if (status === 'skipped') return 'bg-red-400 text-white';
  return 'bg-muted text-muted-foreground';
}

// ---------------------------------------------------------------------------
// Detail view
// ---------------------------------------------------------------------------

interface DispatchDetailViewProps {
  dispatch: HistoryDispatch;
  onBack: () => void;
}

function DispatchDetailView({ dispatch, onBack }: DispatchDetailViewProps) {
  const truck = dispatch.truck;
  const truckLabel = truck.displayName || `Unit #${truck.unitNumber}`;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to History
      </button>

      {/* Dispatch header */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-bold text-foreground">
              Dispatch #{dispatch.id.slice(0, 8).toUpperCase()}
            </h2>
            {dispatch.scheduledDeparture && (
              <p className="text-sm text-muted-foreground mt-0.5">
                Departure: <LocalTime date={dispatch.scheduledDeparture} />
              </p>
            )}
          </div>
          <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide bg-muted text-muted-foreground">
            completed
          </span>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted-foreground flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5" /> Truck
            </dt>
            <dd className="font-medium mt-0.5">{truckLabel}</dd>
          </div>
          {dispatch.plannedMiles != null && (
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
              <dd className="font-medium mt-0.5"><LocalTime date={dispatch.actualDeparture} /></dd>
            </div>
          )}
          {dispatch.actualArrival && (
            <div>
              <dt className="text-muted-foreground flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" /> Arrived
              </dt>
              <dd className="font-medium mt-0.5"><LocalTime date={dispatch.actualArrival} /></dd>
            </div>
          )}
        </dl>
      </div>

      {/* Stops timeline */}
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-4 lg:p-5 shadow-sm">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Stops ({dispatch.stops.length})
        </h3>

        <ol className="space-y-5">
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
                </div>

                {/* Location */}
                <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />
                  {[stop.facility.city, stop.facility.state].filter(Boolean).join(', ') || stop.facility.name}
                </p>

                {/* Appointment */}
                {stop.appointmentStart && (
                  <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    Appt: <LocalTime date={stop.appointmentStart} />
                  </p>
                )}

                {/* Timestamps */}
                {stop.arrivedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Arrived: <LocalTime date={stop.arrivedAt} />
                  </p>
                )}
                {stop.departedAt && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Departed: <LocalTime date={stop.departedAt} />
                  </p>
                )}

                {/* Special instructions */}
                {stop.specialInstructions && (
                  <p className="text-xs text-amber-700 dark:text-amber-400 mt-1 italic">
                    {stop.specialInstructions}
                  </p>
                )}

                {/* Documents section */}
                <div className="mt-3">
                  <StopDocumentUpload
                    stopId={stop.id}
                    existingDocs={stop.documents.map((d) => ({
                      ...d,
                      createdAt: typeof d.createdAt === 'string' ? d.createdAt : d.createdAt.toISOString(),
                    }))}
                  />
                </div>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view
// ---------------------------------------------------------------------------

interface DispatchHistoryListProps {
  dispatches: HistoryDispatch[];
}

export function DispatchHistoryList({ dispatches }: DispatchHistoryListProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = dispatches.find((d) => d.id === selectedId) ?? null;

  if (selectedId && selected) {
    return (
      <DispatchDetailView
        dispatch={selected}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  if (dispatches.length === 0) {
    return (
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No completed dispatches yet</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {dispatches.map((dispatch) => {
        // Unique client names from loads
        const clientNames = [
          ...new Set(dispatch.carrierLoads.map((l) => l.client.name)),
        ].join(', ');

        const completionDate = dispatch.actualArrival ?? dispatch.actualDeparture;

        return (
          <button
            key={dispatch.id}
            type="button"
            onClick={() => setSelectedId(dispatch.id)}
            className="w-full text-left rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card px-4 py-3 lg:p-4 shadow-sm hover:bg-muted/40 transition-colors"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="font-bold text-foreground text-sm">
                #{dispatch.id.slice(0, 8).toUpperCase()}
              </span>
              {completionDate && (
                <span className="text-xs text-muted-foreground shrink-0">
                  <LocalTime date={completionDate} format="date" />
                </span>
              )}
            </div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <Truck className="h-3 w-3" />
                {dispatch.truck.displayName || `Unit #${dispatch.truck.unitNumber}`}
              </span>
              <span>{dispatch.stops.length} stop{dispatch.stops.length !== 1 ? 's' : ''}</span>
              {clientNames && <span>{clientNames}</span>}
            </div>
          </button>
        );
      })}
    </div>
  );
}
