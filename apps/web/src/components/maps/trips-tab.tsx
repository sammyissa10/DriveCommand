'use client';

import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Trip {
  id: string;
  name: string | null;
  origin: string;
  destination: string;
  scheduledDate: string;
  completedAt: string | null;
  distanceMiles: number | null;
  driver: { name: string } | null;
  truck: { id: string; make: string; model: string; licensePlate: string } | null;
}

interface TripsTabProps {
  onViewTrip: (truckId: string, date: string) => void;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

function completedDate(completedAt: string | null): string {
  if (!completedAt) return '';
  return new Date(completedAt).toISOString().split('T')[0];
}

export default function TripsTab({ onViewTrip }: TripsTabProps) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    setLoading(true);

    fetch(`/api/v1/carrier/live-map/trips?page=${page}&pageSize=${pageSize}`)
      .then((res) => res.json())
      .then((json) => {
        if (!mounted) return;
        setTrips(json.data?.trips ?? []);
        setTotal(json.data?.total ?? 0);
      })
      .catch((err) => {
        logger.error('Trips fetch error:', err);
        if (!mounted) return;
        setTrips([]);
        setTotal(0);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [page]);

  const totalPages = Math.ceil(total / pageSize);

  if (loading) {
    return (
      <div className="flex-1 flex flex-col gap-2 p-3 overflow-y-auto">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Completed Trips
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-14 bg-muted/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (trips.length === 0) {
    return (
      <div className="flex-1 flex flex-col gap-2 p-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Completed Trips
        </div>
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          No completed trips
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-3 py-2 border-b shrink-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Completed Trips ({total})
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {trips.map((trip) => (
          <button
            key={trip.id}
            onClick={() => {
              if (trip.truck && trip.completedAt) {
                onViewTrip(trip.truck.id, completedDate(trip.completedAt));
              }
            }}
            disabled={!trip.truck || !trip.completedAt}
            className="w-full text-left px-3 py-2.5 border-b hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-default"
          >
            {/* Route name or origin → destination */}
            <div className="font-medium text-xs truncate">
              {trip.name || `${trip.origin} → ${trip.destination}`}
            </div>
            {/* Driver + truck */}
            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {trip.driver?.name ?? 'Unknown driver'}
              {trip.truck ? ` · ${trip.truck.licensePlate}` : ''}
            </div>
            {/* Dates + miles */}
            <div className="flex items-center justify-between mt-1">
              <span className="text-xs text-muted-foreground">
                Completed: {formatDate(trip.completedAt)}
              </span>
              {trip.distanceMiles != null && (
                <span className="text-xs text-muted-foreground">
                  {trip.distanceMiles.toFixed(0)} mi
                </span>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-3 py-2 border-t shrink-0">
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-xs text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
