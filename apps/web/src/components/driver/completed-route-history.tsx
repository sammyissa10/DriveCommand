'use client';

/**
 * Completed dispatch history component for the driver portal — Carrier Ops edition.
 * Accepts completed CarrierDispatch[] and displays them as collapsible cards.
 */

import { useState } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import type { getMyDispatchHistory } from '@/app/(driver)/actions/driver-routes';

type CompletedDispatch = Awaited<ReturnType<typeof getMyDispatchHistory>>[number];

interface CompletedRouteHistoryProps {
  completedDispatches: CompletedDispatch[];
}

export function CompletedRouteHistory({ completedDispatches }: CompletedRouteHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold text-foreground px-4 lg:px-0">Completed Dispatches</h2>

      {completedDispatches.length === 0 ? (
        <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MapPin className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No completed dispatches yet</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {completedDispatches.map((dispatch) => {
            const isExpanded = expandedId === dispatch.id;

            // Extract dispatch number from notes if present
            const dispatchNumberMatch = dispatch.notes?.match(/\[DISPATCH_NUMBER=(DC-\d{4}-\d{5})\]/);
            const dispatchLabel = dispatchNumberMatch
              ? dispatchNumberMatch[1]
              : `Dispatch ${dispatch.id.slice(0, 8).toUpperCase()}`;

            const firstStop = dispatch.stops[0];
            const lastStop = dispatch.stops[dispatch.stops.length - 1];

            return (
              <div
                key={dispatch.id}
                className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card shadow-sm overflow-hidden"
              >
                {/* Collapsed header — always visible */}
                <button
                  type="button"
                  onClick={() => handleToggle(dispatch.id)}
                  className="w-full cursor-pointer px-4 py-3 lg:p-4 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground text-sm">{dispatchLabel}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {dispatch.actualArrival && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(dispatch.actualArrival).toLocaleDateString()}
                        </span>
                      )}
                      <ChevronDown
                        className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                          isExpanded ? 'rotate-180' : ''
                        }`}
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {firstStop?.facility.name ?? '—'}
                    {lastStop && lastStop.id !== firstStop?.id && ` \u2192 ${lastStop.facility.name}`}
                    {' \u00b7 '}
                    {dispatch.truck.displayName || dispatch.truck.unitNumber}
                  </p>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 lg:px-4">
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Scheduled Departure</dt>
                        <dd className="font-medium">
                          {new Date(dispatch.scheduledDeparture).toLocaleDateString()}
                        </dd>
                      </div>

                      {dispatch.actualArrival && (
                        <div>
                          <dt className="text-xs text-muted-foreground mb-1">Completed</dt>
                          <dd className="font-medium">
                            {new Date(dispatch.actualArrival).toLocaleDateString()}
                          </dd>
                        </div>
                      )}

                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Truck</dt>
                        <dd className="font-medium">{dispatch.truck.displayName || dispatch.truck.unitNumber}</dd>
                      </div>

                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Stops</dt>
                        <dd className="font-medium">{dispatch.stops.length}</dd>
                      </div>
                    </dl>

                    {/* Stops list */}
                    {dispatch.stops.length > 0 && (
                      <div className="mt-4 border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Stops ({dispatch.stops.length})
                        </p>
                        <div className="space-y-1.5">
                          {dispatch.stops.map((stop) => (
                            <div
                              key={stop.id}
                              className="flex items-center justify-between gap-2 text-sm flex-wrap"
                            >
                              <span className="text-foreground">
                                {stop.sequenceOrder}. {stop.facility.name}
                                {stop.facility.city && `, ${stop.facility.city}`}
                                {stop.facility.state && `, ${stop.facility.state}`}
                              </span>
                              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                                {stop.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
