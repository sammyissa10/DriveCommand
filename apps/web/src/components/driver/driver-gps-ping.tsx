'use client';

/**
 * DriverGpsPing — browser geolocation watchPosition component.
 *
 * Fires GPS pings to /api/driver/gps-ping using navigator.geolocation.watchPosition
 * plus a backup setInterval every 15 seconds.
 *
 * Uses haversine formula to calculate speed between pings and determine
 * movement state: moving (>2mph), idle (<=2mph), or off (no GPS / timed out).
 *
 * variant="header" — compact inline indicator (used in driver layout header)
 * variant="pill"   — pill badge below greeting on driver dashboard
 *
 * Rendered at the driver layout level so GPS pings fire on ALL driver pages.
 */

import { useEffect, useRef, useState } from 'react';

type MovementState = 'moving' | 'idle' | 'off';
type GpsDenied = boolean;

const THROTTLE_MS = 15_000; // 15 seconds between POSTs
const OFFLINE_TIMEOUT_MS = 600_000; // 10 minutes — mark as off if no ping

/**
 * Haversine formula — returns speed in mph between two lat/lng points.
 * @param lat1 Previous latitude in degrees
 * @param lng1 Previous longitude in degrees
 * @param lat2 Current latitude in degrees
 * @param lng2 Current longitude in degrees
 * @param timeDeltaMs Elapsed milliseconds between positions
 */
function calculateHaversineSpeed(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
  timeDeltaMs: number
): number {
  if (timeDeltaMs <= 0) return 0;

  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 3959; // Earth radius in miles

  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distanceMiles = R * c;

  // speed = distance / time, convert ms to hours
  const hours = timeDeltaMs / 3_600_000;
  return distanceMiles / hours;
}

interface DriverGpsPingProps {
  /** 'header' — compact inline indicator (legacy)
   *  'pill'   — pill badge below greeting on dashboard
   *  'silent' — no visual output, only fires GPS pings (used at layout level)
   */
  variant?: 'header' | 'pill' | 'silent';
}

export function DriverGpsPing({ variant = 'silent' }: DriverGpsPingProps) {
  const [movementState, setMovementState] = useState<MovementState>('off');
  const [denied, setDenied] = useState<GpsDenied>(false);

  const watchIdRef = useRef<number | null>(null);
  const backupIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastPingRef = useRef<number>(0);
  const lastPingTimeRef = useRef<number>(0);
  const prevPingRef = useRef<{ lat: number; lng: number; time: number } | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      return;
    }

    async function handlePosition(position: GeolocationPosition) {
      const now = Date.now();
      const { latitude: lat, longitude: lng, accuracy } = position.coords;

      // Calculate speed via haversine from previous ping
      let speed = 0;
      if (prevPingRef.current) {
        const timeDelta = now - prevPingRef.current.time;
        speed = calculateHaversineSpeed(
          prevPingRef.current.lat,
          prevPingRef.current.lng,
          lat,
          lng,
          timeDelta
        );
      }

      // Update previous ping reference
      prevPingRef.current = { lat, lng, time: now };

      // Determine movement state: > 2 mph = moving, <= 2 mph = idle
      setMovementState(speed > 2 ? 'moving' : 'idle');
      setDenied(false);

      // Throttle: skip POST if last successful ping was < THROTTLE_MS ago
      if (now - lastPingRef.current < THROTTLE_MS) return;

      lastPingRef.current = now;
      lastPingTimeRef.current = now;

      try {
        await fetch('/api/driver/gps-ping', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat,
            lng,
            accuracy: accuracy ?? null,
            calculatedSpeed: Math.round(speed),
          }),
        });
      } catch {
        // Network errors are non-fatal — movement state stays correct
      }
    }

    function handleError(error: GeolocationPositionError) {
      if (error.code === error.PERMISSION_DENIED) {
        setDenied(true);
      }
      setMovementState('off');
    }

    const watchOptions: PositionOptions = {
      enableHighAccuracy: true,
      maximumAge: 10_000,
      timeout: 15_000,
    };

    // Primary: watchPosition for continuous updates
    watchIdRef.current = navigator.geolocation.watchPosition(
      handlePosition,
      handleError,
      watchOptions
    );

    // Backup: getCurrentPosition every 15 seconds in case watchPosition stalls
    backupIntervalRef.current = setInterval(() => {
      navigator.geolocation.getCurrentPosition(handlePosition, handleError, watchOptions);
    }, THROTTLE_MS);

    // Offline timeout: mark as 'off' if no ping for 10 minutes
    const offlineCheckInterval = setInterval(() => {
      if (lastPingTimeRef.current > 0 && Date.now() - lastPingTimeRef.current > OFFLINE_TIMEOUT_MS) {
        setMovementState('off');
      }
    }, 60_000);

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      if (backupIntervalRef.current !== null) {
        clearInterval(backupIntervalRef.current);
        backupIntervalRef.current = null;
      }
      clearInterval(offlineCheckInterval);
    };
  }, []);

  const isActive = movementState === 'moving' || movementState === 'idle';

  // -------------------------------------------------------------------------
  // Silent variant — GPS pinging only, no visual output (used in layout)
  // -------------------------------------------------------------------------
  if (variant === 'silent') {
    return null;
  }

  // -------------------------------------------------------------------------
  // Pill variant — shown below greeting on driver dashboard
  // -------------------------------------------------------------------------
  if (variant === 'pill') {
    const dotClass = isActive
      ? 'bg-green-500 animate-pulse'
      : 'bg-gray-400';
    const label = isActive ? 'Location sharing on' : 'Location sharing off';

    return (
      <div className="flex flex-col gap-1 mt-1 mb-2">
        <div className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${dotClass}`}
            aria-hidden="true"
          />
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        {denied && (
          <p className="text-xs text-amber-600 dark:text-amber-400">
            Location sharing is off. Enable in browser settings.
          </p>
        )}
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // Header variant — compact inline indicator (default)
  // -------------------------------------------------------------------------
  const dotClass =
    movementState === 'moving'
      ? 'bg-green-500 animate-pulse'
      : movementState === 'idle'
        ? 'bg-yellow-400'
        : 'bg-muted-foreground/40';

  const label =
    movementState === 'moving' || movementState === 'idle' ? 'Location on' : 'Location off';

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1.5">
        <span
          className={`inline-block h-2 w-2 rounded-full flex-shrink-0 ${dotClass}`}
          aria-hidden="true"
        />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      {denied && (
        <p className="text-xs text-amber-600 dark:text-amber-400 text-right max-w-[200px]">
          Location sharing is off. Enable in browser settings.
        </p>
      )}
    </div>
  );
}
