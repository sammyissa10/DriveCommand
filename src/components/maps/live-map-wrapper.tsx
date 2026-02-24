'use client';

import dynamic from 'next/dynamic';
import { useEffect, useRef, useState } from 'react';
import { VehicleLocation } from '@/lib/maps/map-utils';

// Dynamic import of LiveMap with ssr: false (required for Leaflet)
const LiveMapDynamic = dynamic(
  () => import('./live-map'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-muted/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading map...</p>
        </div>
      </div>
    ),
  }
);

interface LiveMapWrapperProps {
  initialVehicles: VehicleLocation[];
  tagId?: string;
}

const POLL_INTERVAL_MS = 30_000;

export default function LiveMapWrapper({ initialVehicles, tagId }: LiveMapWrapperProps) {
  const [vehicles, setVehicles] = useState<VehicleLocation[]>(initialVehicles);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Keep tagId in a ref so fetchNow closure always has the latest value
  const tagIdRef = useRef(tagId);
  useEffect(() => {
    tagIdRef.current = tagId;
  }, [tagId]);

  const fetchNow = async () => {
    try {
      const url = tagIdRef.current
        ? `/api/gps/locations?tagId=${encodeURIComponent(tagIdRef.current)}`
        : '/api/gps/locations';
      const res = await fetch(url);
      if (!res.ok) return;
      const data: VehicleLocation[] = await res.json();
      setVehicles(data);
      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch (err) {
      console.error('GPS poll error:', err);
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
  }, []);

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
  }, []);

  // Seconds-ago counter — increments every second, resets when lastUpdated changes
  useEffect(() => {
    setSecondsAgo(0);
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex-1 relative">
        <LiveMapDynamic initialVehicles={vehicles} />
      </div>
      <p className="text-xs text-muted-foreground text-right px-2 py-1">
        Last updated {secondsAgo}s ago
      </p>
    </div>
  );
}
