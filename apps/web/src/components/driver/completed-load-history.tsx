'use client';

/**
 * Load list component for the driver portal — Carrier Ops edition.
 * Accepts CarrierLoad[] and displays them as collapsible cards.
 * (Previously showed completed loads; now shows active dispatch loads.)
 */

import { useState } from 'react';
import { Package, ChevronDown, MapPin } from 'lucide-react';
import type { getMyLoads } from '@/app/(driver)/actions/driver-load';

type CarrierLoadItem = Awaited<ReturnType<typeof getMyLoads>>[number];

interface CompletedLoadHistoryProps {
  loads: CarrierLoadItem[];
}

export function CompletedLoadHistory({ loads }: CompletedLoadHistoryProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function handleToggle(id: string) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  if (loads.length === 0) {
    return (
      <div className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card p-6 shadow-sm">
        <div className="flex flex-col items-center justify-center py-8 text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">No loads on this dispatch</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {loads.map((load) => {
        const isExpanded = expandedId === load.id;
        const loadLabel = load.referenceNumber
          ? `Ref #${load.referenceNumber}`
          : load.bolNumber
          ? `BOL #${load.bolNumber}`
          : `Load ${load.id.slice(0, 8).toUpperCase()}`;

        return (
          <div
            key={load.id}
            className="rounded-none border-x-0 lg:rounded-lg lg:border-x border border-border bg-card shadow-sm overflow-hidden"
          >
            {/* Collapsed header */}
            <button
              type="button"
              onClick={() => handleToggle(load.id)}
              className="w-full cursor-pointer px-4 py-3 lg:p-4 text-left"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-foreground text-sm">{loadLabel}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                      load.status === 'delivered'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : load.status === 'in_transit'
                        ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {load.status.replace(/_/g, ' ')}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                      isExpanded ? 'rotate-180' : ''
                    }`}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{load.client.name}</p>
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border px-4 pb-4 pt-3 lg:px-4">
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  {/* Client */}
                  <div>
                    <dt className="text-xs text-muted-foreground mb-1">Client</dt>
                    <dd className="font-medium">{load.client.name}</dd>
                  </div>

                  {/* Load type */}
                  <div>
                    <dt className="text-xs text-muted-foreground mb-1">Type</dt>
                    <dd className="font-medium uppercase">{load.loadType}</dd>
                  </div>

                  {/* Commodity */}
                  {load.commodityDescription && (
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Commodity</dt>
                      <dd className="font-medium">{load.commodityDescription}</dd>
                    </div>
                  )}

                  {/* Weight */}
                  {load.commodityWeightLbs && (
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Weight</dt>
                      <dd className="font-medium">
                        {Number(load.commodityWeightLbs).toLocaleString()} lbs
                      </dd>
                    </div>
                  )}

                  {/* Pieces */}
                  {load.commodityPieces && (
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">Pieces</dt>
                      <dd className="font-medium">{load.commodityPieces.toLocaleString()}</dd>
                    </div>
                  )}

                  {/* BOL / PRO / PO */}
                  {load.bolNumber && (
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">BOL #</dt>
                      <dd className="font-medium">{load.bolNumber}</dd>
                    </div>
                  )}
                  {load.proNumber && (
                    <div>
                      <dt className="text-xs text-muted-foreground mb-1">PRO #</dt>
                      <dd className="font-medium">{load.proNumber}</dd>
                    </div>
                  )}

                  {/* Special instructions — full width */}
                  {load.specialInstructions && (
                    <div className="col-span-2">
                      <dt className="text-xs text-muted-foreground mb-1">Special Instructions</dt>
                      <dd className="font-medium whitespace-pre-wrap text-amber-700 dark:text-amber-400">
                        {load.specialInstructions}
                      </dd>
                    </div>
                  )}
                </dl>

                {/* Stops */}
                {load.stops.length > 0 && (
                  <div className="mt-4 border-t border-border pt-3">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Stops
                    </p>
                    <div className="space-y-1.5">
                      {load.stops.map((stop) => (
                        <div
                          key={stop.id}
                          className="flex items-center gap-2 text-sm flex-wrap"
                        >
                          <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                          <span className="text-foreground">
                            {stop.facility.name}
                            {stop.facility.city && `, ${stop.facility.city}`}
                            {stop.facility.state && `, ${stop.facility.state}`}
                          </span>
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-muted-foreground ml-auto">
                            {stop.stopType.replace(/_/g, ' ')}
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
  );
}
