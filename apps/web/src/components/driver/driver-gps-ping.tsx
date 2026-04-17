'use client';

/**
 * DriverGpsPing — browser geolocation watchPosition component.
 *
 * Fires GPS pings to /api/driver/gps-ping using navigator.geolocation.watchPosition.
 * Shows a small inline status indicator (green/yellow/grey dot) next to the greeting.
 *
 * NOTE: watchPosition only works while the tab is open and active.
 * Background sync is handled by the native mobile app.
 */

import { useEffect, useRef, useState } from 'react';

type GpsStatus = 'pending' | 'active' | 'denied' | 'unavailable';

const THROTTLE_MS = 30_000; // 30 seconds between POSTs

export function DriverGpsPing() {
  const [status, setStatus] = useState<GpsStatus>('pending');
  const watchIdRef = useRef<number | null>(null);
  const lastPingRef = useRef<number>(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setStatus('unavailable');
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      async (position) => {
        const now = Date.now();
        setStatus('active');

        // Throttle: skip POST if last successful ping was < 30s ago
        if (now - lastPingRef.current < THROTTLE_MS) return;

        lastPingRef.current = now;
        try {
          await fetch('/api/driver/gps-ping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: position.coords.latitude,
              lng: position.coords.longitude,
              accuracy: position.coords.accuracy,
            }),
          });
        } catch {
          // Network errors are non-fatal — status stays active (GPS is still working)
        }
      },
      (error) => {
        if (error.code === error.PERMISSION_DENIED) {
          setStatus('denied');
        } else {
          setStatus('unavailable');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30_000,
        timeout: 10_000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  const dotClass =
    status === 'active'
      ? 'bg-green-500 animate-pulse'
      : status === 'pending'
        ? 'bg-yellow-400'
        : 'bg-muted-foreground/40';

  const label =
    status === 'active'
      ? 'Location on'
      : status === 'pending'
        ? 'Locating...'
        : 'Location off';

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${dotClass}`}
          aria-hidden="true"
        />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {status === 'denied' && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-right max-w-[200px]">
          Location sharing is off. Enable in browser settings.
        </p>
      )}
    </div>
  );
}
