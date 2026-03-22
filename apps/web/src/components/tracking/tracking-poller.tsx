'use client';

import { useEffect, useState } from 'react';
import TrackingMapWrapper from './tracking-map-wrapper';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TrackingData {
  status: string;
  latestGPS: {
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
    timestamp: string;
  } | null;
  loadNumber: string;
  origin: string;
  destination: string;
  pickupDate: string | null;
  deliveryDate: string | null;
  truck: {
    make: string;
    model: string;
    licensePlate: string;
  } | null;
  driverFirstName: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 30_000;

// Customer-facing status steps (not all internal statuses)
const TRACKING_STEPS = [
  { key: 'DISPATCHED', label: 'Order Confirmed' },
  { key: 'PICKED_UP', label: 'Picked Up' },
  { key: 'IN_TRANSIT', label: 'In Transit' },
  { key: 'DELIVERED', label: 'Delivered' },
] as const;

// Map any internal status to the relevant tracking step
function getActiveStepIndex(status: string): number {
  const order: string[] = ['DISPATCHED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];
  const idx = order.indexOf(status);
  return idx >= 0 ? idx : -1;
}

const STATUS_BADGE_STYLES: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  DISPATCHED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300',
  PICKED_UP: 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300',
  IN_TRANSIT: 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300',
  DELIVERED: 'bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300',
  INVOICED: 'bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300',
};

const STATUS_DISPLAY_LABELS: Record<string, string> = {
  PENDING: 'Pending',
  DISPATCHED: 'Order Confirmed',
  PICKED_UP: 'Picked Up',
  IN_TRANSIT: 'In Transit',
  DELIVERED: 'Delivered',
  INVOICED: 'Delivered',
  CANCELLED: 'Cancelled',
};

// ─── Component ────────────────────────────────────────────────────────────────

interface TrackingPollerProps {
  token: string;
  initialData: TrackingData;
}

export default function TrackingPoller({ token, initialData }: TrackingPollerProps) {
  const [data, setData] = useState<TrackingData>(initialData);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  const fetchNow = async () => {
    try {
      const res = await fetch(`/api/track/${token}`);
      if (!res.ok) return;
      const json: TrackingData = await res.json();
      setData(json);
      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch (err) {
      console.error('Tracking poll error:', err);
    }
  };

  // Polling interval — skip when tab is hidden
  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      fetchNow();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Visibility change listener — immediate catch-up fetch on tab focus
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible') {
        fetchNow();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  // Seconds-ago counter — increments every second, resets when lastUpdated changes
  useEffect(() => {
    setSecondsAgo(0);
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  const activeIndex = getActiveStepIndex(data.status);
  const statusBadgeClass =
    STATUS_BADGE_STYLES[data.status] ?? STATUS_BADGE_STYLES['PENDING'];
  const statusDisplayLabel =
    STATUS_DISPLAY_LABELS[data.status] ?? data.status;

  return (
    <div className="space-y-6">
      {/* Load number + status badge */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <h1 className="text-2xl font-bold text-foreground">
          Load #{data.loadNumber}
        </h1>
        <span
          className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${statusBadgeClass}`}
        >
          {statusDisplayLabel}
        </span>
      </div>

      {/* Route summary */}
      <p className="text-muted-foreground text-sm">
        {data.origin}&nbsp;&rarr;&nbsp;{data.destination}
      </p>

      {/* Status timeline / stepper */}
      <div className="rounded-lg border border-border bg-card p-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-5">
          Shipment Progress
        </h2>
        {data.status === 'CANCELLED' ? (
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-500">
              <span className="text-xs font-bold">X</span>
            </div>
            <span className="text-sm font-medium text-red-600">Shipment Cancelled</span>
          </div>
        ) : (
          <div className="flex items-start overflow-x-auto pb-2">
            {TRACKING_STEPS.map((step, index) => {
              const isCompleted = activeIndex > index;
              const isCurrent = activeIndex === index;

              return (
                <div key={step.key} className="flex items-center">
                  <div className="flex flex-col items-center min-w-[90px]">
                    <div
                      className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                        isCompleted
                          ? 'bg-green-500 text-white'
                          : isCurrent
                          ? 'bg-primary text-primary-foreground ring-4 ring-primary/20'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {isCompleted ? '✓' : index + 1}
                    </div>
                    <span
                      className={`mt-2 text-xs text-center font-medium ${
                        isCurrent
                          ? 'text-primary'
                          : isCompleted
                          ? 'text-green-600'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {step.label}
                    </span>
                  </div>
                  {index < TRACKING_STEPS.length - 1 && (
                    <div
                      className={`h-0.5 w-8 flex-shrink-0 mt-[-1rem] transition-colors ${
                        activeIndex > index ? 'bg-green-400' : 'bg-muted'
                      }`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two-column: details + map */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Shipment details card */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Shipment Details
          </h2>
          <dl className="space-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground">From</dt>
              <dd className="font-medium mt-0.5">{data.origin}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">To</dt>
              <dd className="font-medium mt-0.5">{data.destination}</dd>
            </div>
            {data.deliveryDate && (
              <div>
                <dt className="text-muted-foreground">Estimated Delivery</dt>
                <dd className="font-medium mt-0.5">
                  {new Date(data.deliveryDate).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </dd>
              </div>
            )}
            {data.truck && (
              <div>
                <dt className="text-muted-foreground">Truck</dt>
                <dd className="font-medium mt-0.5">
                  {data.truck.make} {data.truck.model}
                </dd>
                <dd className="text-muted-foreground text-xs mt-0.5">
                  {data.truck.licensePlate}
                </dd>
              </div>
            )}
            {data.driverFirstName && (
              <div>
                <dt className="text-muted-foreground">Driver</dt>
                <dd className="font-medium mt-0.5">{data.driverFirstName}</dd>
              </div>
            )}
          </dl>
        </div>

        {/* Live map */}
        <div className="rounded-lg border border-border bg-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
            Live Location
          </h2>
          {data.latestGPS ? (
            <div className="space-y-2">
              <TrackingMapWrapper
                latitude={data.latestGPS.latitude}
                longitude={data.latestGPS.longitude}
                truckLabel={data.truck?.licensePlate ?? 'Truck'}
              />
              {data.latestGPS.speed !== null && (
                <p className="text-xs text-muted-foreground">
                  Speed: {data.latestGPS.speed} mph &middot; Last GPS:{' '}
                  {new Date(data.latestGPS.timestamp).toLocaleTimeString()}
                </p>
              )}
              <p className="text-xs text-muted-foreground text-right">
                Updated {secondsAgo}s ago
              </p>
            </div>
          ) : (
            <div className="h-[300px] flex items-center justify-center rounded-lg bg-muted/50 border border-border/50">
              <p className="text-sm text-muted-foreground text-center px-4">
                Live tracking will be available once the truck is in transit
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
