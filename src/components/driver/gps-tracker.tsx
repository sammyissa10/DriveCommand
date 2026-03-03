'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin } from 'lucide-react';

interface GpsTrackerProps {
  truckId: string | null;
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 15000,
  maximumAge: 10000,
};

const INTERVAL_MS = 30000; // 30 seconds

export function GpsTracker({ truckId }: GpsTrackerProps) {
  const [isTracking, setIsTracking] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const sendPosition = useCallback(async (position: GeolocationPosition) => {
    try {
      const res = await fetch('/api/gps/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
          altitude: position.coords.altitude,
          accuracy: position.coords.accuracy,
        }),
      });

      if (res.status === 404) {
        // No active route — stop tracking
        if (intervalRef.current) {
          clearInterval(intervalRef.current);
          intervalRef.current = null;
        }
        setIsTracking(false);
        setError('No active route');
        return;
      }

      if (res.ok) {
        setLastUpdate(new Date());
        setError(null);
      }
    } catch {
      // Network error — keep tracking, will retry next interval
    }
  }, []);

  // Auto-start tracking on mount whenever there is an active truck
  useEffect(() => {
    if (!truckId) return;
    if (!navigator.geolocation) {
      setError('GPS not supported on this device');
      return;
    }

    setError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setIsTracking(true);
        sendPosition(position);

        intervalRef.current = setInterval(() => {
          navigator.geolocation.getCurrentPosition(
            (pos) => sendPosition(pos),
            (err) => {
              console.warn('GPS position error:', err.message);
            },
            GEO_OPTIONS
          );
        }, INTERVAL_MS);
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setError('Location permission denied — please enable it in your browser settings');
        } else {
          setError('Could not get location');
        }
      },
      GEO_OPTIONS
    );

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [truckId, sendPosition]);

  // Don't render if no active route / no truck assigned
  if (!truckId) return null;

  const relativeTime = lastUpdate ? getRelativeTime(lastUpdate) : null;

  return (
    <div className="border-t border-border px-6 py-2">
      <div className="flex items-center gap-3">
        <MapPin className="h-4 w-4 text-muted-foreground" />
        <span className="text-sm font-medium text-foreground">GPS Tracking</span>
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            isTracking ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'
          }`}
        />
        {isTracking && relativeTime && (
          <span className="text-xs text-muted-foreground">Updated {relativeTime}</span>
        )}
        {error && (
          <span className="text-xs text-destructive">{error}</span>
        )}
      </div>
    </div>
  );
}

function getRelativeTime(date: Date): string {
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  return `${Math.floor(minutes / 60)}h ago`;
}
