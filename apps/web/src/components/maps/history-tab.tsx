'use client';

import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';

export interface HistoryPoint {
  latitude: number;
  longitude: number;
  speed: number | null;
  heading: number | null;
  timestamp: Date;
}

export interface RouteSegment {
  color: string;
  positions: [number, number][];
}

interface TruckOption {
  truckId: string;
  licensePlate: string;
  make: string;
  model: string;
}

interface HistoryTabProps {
  orgTrucks: TruckOption[];
  onHistoryPoints: (points: HistoryPoint[]) => void;
  onHistorySegments: (segments: RouteSegment[]) => void;
  /** Pre-fill from Trips tab */
  initialTruckId?: string;
  initialDate?: string;
}

function getSpeedColor(speed: number | null): string {
  if (speed === null || speed < 10) return '#3b82f6';
  if (speed < 40) return '#eab308';
  if (speed < 60) return '#f97316';
  return '#ef4444';
}

function groupIntoSegments(points: HistoryPoint[]): RouteSegment[] {
  if (points.length === 0) return [];

  const segments: RouteSegment[] = [];
  let current: RouteSegment = {
    color: getSpeedColor(points[0].speed),
    positions: [[points[0].latitude, points[0].longitude]],
  };

  for (let i = 1; i < points.length; i++) {
    const pt = points[i];
    const color = getSpeedColor(pt.speed);
    if (color === current.color) {
      current.positions.push([pt.latitude, pt.longitude]);
    } else {
      current.positions.push([pt.latitude, pt.longitude]);
      segments.push(current);
      current = { color, positions: [[pt.latitude, pt.longitude]] };
    }
  }
  if (current.positions.length > 0) segments.push(current);
  return segments;
}

function todayUTC(): string {
  return new Date().toISOString().split('T')[0];
}

function formatTime(ts: Date): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export default function HistoryTab({
  orgTrucks,
  onHistoryPoints,
  onHistorySegments,
  initialTruckId,
  initialDate,
}: HistoryTabProps) {
  const [selectedTruckId, setSelectedTruckId] = useState(initialTruckId ?? '');
  const [selectedDate, setSelectedDate] = useState(initialDate ?? todayUTC());
  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  // Pre-fill from Trips tab navigation
  useEffect(() => {
    if (initialTruckId) setSelectedTruckId(initialTruckId);
    if (initialDate) setSelectedDate(initialDate);
  }, [initialTruckId, initialDate]);

  // Fetch when both truck and date are selected
  useEffect(() => {
    if (!selectedTruckId || !selectedDate) return;

    let mounted = true;
    setLoading(true);
    setHasSearched(true);

    fetch(
      `/api/v1/carrier/live-map/history?truckId=${encodeURIComponent(selectedTruckId)}&date=${encodeURIComponent(selectedDate)}`
    )
      .then((res) => res.json())
      .then((json) => {
        if (!mounted) return;
        const rawPoints: HistoryPoint[] = (json.data?.points ?? []).map(
          (p: { latitude: number; longitude: number; speed: number | null; heading: number | null; timestamp: string }) => ({
            ...p,
            timestamp: new Date(p.timestamp),
          })
        );
        setPoints(rawPoints);
        onHistoryPoints(rawPoints);
        onHistorySegments(groupIntoSegments(rawPoints));
      })
      .catch((err) => {
        logger.error('History fetch error:', err);
        if (!mounted) return;
        setPoints([]);
        onHistoryPoints([]);
        onHistorySegments([]);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTruckId, selectedDate]);

  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];

  return (
    <div className="flex flex-col gap-3 p-3 flex-1 min-h-0 overflow-y-auto">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        GPS History
      </div>

      {/* Truck selector */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Truck</label>
        <select
          value={selectedTruckId}
          onChange={(e) => setSelectedTruckId(e.target.value)}
          className="w-full text-sm border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">Select a truck…</option>
          {orgTrucks.map((t) => (
            <option key={t.truckId} value={t.truckId}>
              {t.licensePlate} — {t.make} {t.model}
            </option>
          ))}
        </select>
      </div>

      {/* Date picker */}
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground">Date</label>
        <input
          type="date"
          value={selectedDate}
          max={todayUTC()}
          onChange={(e) => setSelectedDate(e.target.value)}
          className="w-full text-sm border rounded px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      {/* Results */}
      {loading && (
        <div className="text-xs text-muted-foreground animate-pulse">Loading GPS trail…</div>
      )}

      {!loading && hasSearched && selectedTruckId && selectedDate && (
        points.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-4">
            No GPS data for this date
          </div>
        ) : (
          <div className="space-y-2">
            {/* Timeline strip */}
            <div className="text-xs font-medium text-muted-foreground">
              {points.length} GPS pings recorded
            </div>
            {firstPoint && lastPoint && (
              <div className="flex items-center justify-between text-xs text-muted-foreground bg-muted/50 rounded px-2 py-1.5">
                <span>Start: {formatTime(firstPoint.timestamp)}</span>
                <div className="flex-1 mx-2 h-px bg-border" />
                <span>End: {formatTime(lastPoint.timestamp)}</span>
              </div>
            )}

            {/* Speed legend */}
            <div className="text-xs text-muted-foreground">Speed colors:</div>
            <div className="flex flex-wrap gap-2">
              {[
                { color: '#3b82f6', label: 'Slow / Stopped' },
                { color: '#eab308', label: 'Moderate' },
                { color: '#f97316', label: 'Fast' },
                { color: '#ef4444', label: 'Very fast' },
              ].map(({ color, label }) => (
                <div key={color} className="flex items-center gap-1 text-xs">
                  <div className="w-3 h-1.5 rounded-full" style={{ backgroundColor: color }} />
                  <span>{label}</span>
                </div>
              ))}
            </div>
          </div>
        )
      )}

      {!loading && !hasSearched && (
        <div className="text-xs text-muted-foreground text-center py-4">
          Select a truck and date to view GPS trail
        </div>
      )}
    </div>
  );
}
