'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MapPin } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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
  const [permissionState, setPermissionState] = useState<
    'prompt' | 'granted' | 'denied' | null
  >(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check geolocation support and permission state on mount
  useEffect(() => {
    if (!navigator.geolocation) {
      setError('GPS not supported');
      return;
    }

    if (navigator.permissions) {
      navigator.permissions
        .query({ name: 'geolocation' })
        .then((result) => {
          setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
          result.addEventListener('change', () => {
            setPermissionState(result.state as 'prompt' | 'granted' | 'denied');
          });
        })
        .catch(() => {
          // permissions API not supported in some browsers
        });
    }
  }, []);

  // Cleanup interval on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

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
        // No active route — auto-disable tracking
        stopTracking();
        setError('No active route');
        return;
      }

      if (res.ok) {
        setLastUpdate(new Date());
        setError(null);
      }
      // On other errors, keep tracking (transient network issues)
    } catch {
      // Network error — keep tracking, will retry next interval
    }
  }, []);

  function stopTracking() {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setIsTracking(false);
  }

  function handleToggle(checked: boolean) {
    if (checked) {
      if (!navigator.geolocation) {
        setError('GPS not supported');
        return;
      }

      setError(null);

      // Get immediate position and trigger permission prompt
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setIsTracking(true);
          setPermissionState('granted');
          // Send first position immediately
          sendPosition(position);

          // Start interval for subsequent updates
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
            setPermissionState('denied');
            setError('Location permission denied');
          } else {
            setError('Could not get location');
          }
        },
        GEO_OPTIONS
      );
    } else {
      stopTracking();
    }
  }

  // Don't render if no active route / no truck assigned
  // (placed after all hooks so Rules of Hooks are satisfied)
  if (!truckId) return null;

  const relativeTime = lastUpdate
    ? getRelativeTime(lastUpdate)
    : null;

  return (
    <div className="border-t border-border px-6 py-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <MapPin className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-foreground">
            GPS Tracking
          </span>
          <span
            className={`inline-block h-2 w-2 rounded-full ${
              isTracking ? 'bg-green-500 animate-pulse' : 'bg-muted-foreground/40'
            }`}
          />
        </div>

        <div className="flex items-center gap-3">
          {error && (
            <span className="text-xs text-destructive">{error}</span>
          )}
          {isTracking && lastUpdate && (
            <span className="text-xs text-muted-foreground">
              Updated {relativeTime}
            </span>
          )}
          {!isTracking && !error && permissionState === 'denied' && (
            <span className="text-xs text-muted-foreground">
              Permission denied
            </span>
          )}
          <Switch
            checked={isTracking}
            onCheckedChange={handleToggle}
            aria-label="Toggle GPS tracking"
          />
        </div>
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
