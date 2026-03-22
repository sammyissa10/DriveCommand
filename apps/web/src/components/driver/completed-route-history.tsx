'use client';

import { useState } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import type { getMyCompletedRoutes } from '@/app/(driver)/actions/driver-routes';

type CompletedRoute = Awaited<ReturnType<typeof getMyCompletedRoutes>>[number];

interface CompletedRouteHistoryProps {
  completedRoutes: CompletedRoute[];
}

export function CompletedRouteHistory({ completedRoutes }: CompletedRouteHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold text-foreground px-4 lg:px-0">Completed Routes</h2>

      {completedRoutes.length === 0 ? (
        <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <MapPin className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No completed routes yet</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {completedRoutes.map((route) => {
            const isExpanded = expandedId === route.id;
            const routeName = route.name ?? 'Unnamed Route';

            return (
              <div
                key={route.id}
                className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card shadow-sm overflow-hidden"
              >
                {/* Collapsed header — always visible */}
                <button
                  type="button"
                  onClick={() => handleToggle(route.id)}
                  className="w-full cursor-pointer px-4 py-3 lg:p-4 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground text-sm">{routeName}</span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {route.completedAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(route.completedAt).toLocaleDateString()}
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
                    {route.origin} &rarr; {route.destination}
                  </p>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 lg:px-4">
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      {/* Scheduled date */}
                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Scheduled Date</dt>
                        <dd className="font-medium">
                          {new Date(route.scheduledDate).toLocaleDateString()}
                        </dd>
                      </div>

                      {/* Completed date */}
                      {route.completedAt && (
                        <div>
                          <dt className="text-xs text-muted-foreground mb-1">Completed Date</dt>
                          <dd className="font-medium">
                            {new Date(route.completedAt).toLocaleDateString()}
                          </dd>
                        </div>
                      )}

                      {/* Distance */}
                      {route.distanceMiles && (
                        <div>
                          <dt className="text-xs text-muted-foreground mb-1">Distance</dt>
                          <dd className="font-medium">
                            {Number(route.distanceMiles).toLocaleString()} miles
                          </dd>
                        </div>
                      )}

                      {/* Truck */}
                      {route.truck && (
                        <div>
                          <dt className="text-xs text-muted-foreground mb-1">Truck</dt>
                          <dd className="font-medium">
                            {[route.truck.year, route.truck.make, route.truck.model]
                              .filter(Boolean)
                              .join(' ')}
                            {route.truck.licensePlate && ` · ${route.truck.licensePlate}`}
                          </dd>
                        </div>
                      )}

                      {/* Notes — full width */}
                      {route.notes && (
                        <div className="col-span-2">
                          <dt className="text-xs text-muted-foreground mb-1">Notes</dt>
                          <dd className="font-medium whitespace-pre-wrap">{route.notes}</dd>
                        </div>
                      )}
                    </dl>

                    {/* Loads on this route */}
                    {route.loads.length > 0 && (
                      <div className="mt-4 border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Loads on this route
                        </p>
                        <div className="space-y-1.5">
                          {route.loads.map((load) => (
                            <div
                              key={load.id}
                              className="flex items-center justify-between gap-2 text-sm flex-wrap"
                            >
                              <span className="text-foreground">
                                Load #{load.loadNumber}: {load.origin} &rarr; {load.destination}
                              </span>
                              <span
                                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                                  load.status === 'DELIVERED'
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-muted text-muted-foreground'
                                }`}
                              >
                                {load.status === 'DELIVERED' ? 'Delivered' : 'Invoiced'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Stops */}
                    {route.stops.length > 0 && (
                      <div className="mt-4 border-t border-border pt-3">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                          Stops ({route.stops.length})
                        </p>
                        <div className="space-y-1.5">
                          {route.stops.map((stop) => (
                            <div
                              key={stop.id}
                              className="flex items-center justify-between gap-2 text-sm flex-wrap"
                            >
                              <span className="text-foreground">
                                {stop.position}. {stop.address ?? 'Stop'}
                              </span>
                              {stop.status && (
                                <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground">
                                  {stop.status.replace(/_/g, ' ')}
                                </span>
                              )}
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
