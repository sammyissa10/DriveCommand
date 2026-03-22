'use client';

import { useState } from 'react';
import { Package, ChevronDown } from 'lucide-react';
import type { getMyCompletedLoads } from '@/app/(driver)/actions/driver-load';

type CompletedLoad = Awaited<ReturnType<typeof getMyCompletedLoads>>[number];

interface CompletedLoadHistoryProps {
  completedLoads: CompletedLoad[];
}

export function CompletedLoadHistory({ completedLoads }: CompletedLoadHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold text-foreground px-4 lg:px-0">Past Loads</h2>

      {completedLoads.length === 0 ? (
        <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-6 shadow-sm">
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Package className="h-6 w-6 text-muted-foreground" />
            </div>
            <p className="text-sm text-muted-foreground">No completed loads yet</p>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          {completedLoads.map((load) => {
            const isExpanded = expandedId === load.id;

            return (
              <div
                key={load.id}
                className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card shadow-sm overflow-hidden"
              >
                {/* Collapsed header — always visible */}
                <button
                  type="button"
                  onClick={() => handleToggle(load.id)}
                  className="w-full cursor-pointer px-4 py-3 lg:p-4 text-left"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-foreground text-sm">
                      Load #{load.loadNumber}
                    </span>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {load.deliveryDate && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(load.deliveryDate).toLocaleDateString()}
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
                    {load.origin} &rarr; {load.destination}
                  </p>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 lg:px-4">
                    <dl className="grid grid-cols-2 gap-3 text-sm">
                      {/* Status */}
                      <div className="col-span-2 sm:col-span-1">
                        <dt className="text-xs text-muted-foreground mb-1">Status</dt>
                        <dd>
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              load.status === 'DELIVERED'
                                ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                : 'bg-muted text-muted-foreground'
                            }`}
                          >
                            {load.status === 'DELIVERED' ? 'Delivered' : 'Invoiced'}
                          </span>
                        </dd>
                      </div>

                      {/* Customer */}
                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Customer</dt>
                        <dd className="font-medium">{load.customer.companyName}</dd>
                      </div>

                      {/* Pickup date */}
                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Pickup Date</dt>
                        <dd className="font-medium">
                          {new Date(load.pickupDate).toLocaleDateString()}
                        </dd>
                      </div>

                      {/* Delivery date */}
                      {load.deliveryDate && (
                        <div>
                          <dt className="text-xs text-muted-foreground mb-1">Delivery Date</dt>
                          <dd className="font-medium">
                            {new Date(load.deliveryDate).toLocaleDateString()}
                          </dd>
                        </div>
                      )}

                      {/* Weight */}
                      {load.weight && (
                        <div>
                          <dt className="text-xs text-muted-foreground mb-1">Weight</dt>
                          <dd className="font-medium">
                            {load.weight.toLocaleString()} lbs
                          </dd>
                        </div>
                      )}

                      {/* Commodity */}
                      {load.commodity && (
                        <div>
                          <dt className="text-xs text-muted-foreground mb-1">Commodity</dt>
                          <dd className="font-medium">{load.commodity}</dd>
                        </div>
                      )}

                      {/* Rate */}
                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Rate</dt>
                        <dd className="font-bold text-green-600">
                          ${Number(load.rate).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </dd>
                      </div>

                      {/* Linked route */}
                      <div>
                        <dt className="text-xs text-muted-foreground mb-1">Route</dt>
                        <dd className="font-medium">
                          {load.route?.name ?? '—'}
                        </dd>
                      </div>

                      {/* Notes — full width */}
                      {load.notes && (
                        <div className="col-span-2">
                          <dt className="text-xs text-muted-foreground mb-1">Notes</dt>
                          <dd className="font-medium whitespace-pre-wrap">{load.notes}</dd>
                        </div>
                      )}
                    </dl>
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
