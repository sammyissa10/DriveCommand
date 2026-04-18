'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { VehicleLocation } from '@/lib/maps/map-utils';
import { logger } from '@/lib/logger';
import { cn } from '@/lib/utils';
import LiveMapTabs from './live-map-tabs';
import VehicleSidebar from './vehicle-sidebar';
import VehicleFilterBar from './vehicle-filter-bar';
import HistoryTab, { HistoryPoint, RouteSegment } from './history-tab';
import TripsTab from './trips-tab';

// Dynamic import of LiveMap with ssr: false (required for Leaflet)
const LiveMapDynamic = dynamic(
  () => import('./live-map'),
  {
    ssr: false,
    loading: () => (
      <div className="flex items-center justify-center h-full bg-muted/30">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4" />
          <p className="text-muted-foreground">Loading map…</p>
        </div>
      </div>
    ),
  }
);

type TabId = 'live' | 'history' | 'trips';

interface LiveMapWrapperProps {
  initialVehicles: VehicleLocation[];
}

const POLL_INTERVAL_MS = 15_000;

export default function LiveMapWrapper({ initialVehicles }: LiveMapWrapperProps) {
  const [vehicles, setVehicles] = useState<VehicleLocation[]>(initialVehicles);
  const [filteredVehicles, setFilteredVehicles] = useState<VehicleLocation[]>(initialVehicles);
  const [activeTab, setActiveTab] = useState<TabId>('live');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [historyPoints, setHistoryPoints] = useState<HistoryPoint[]>([]);
  const [historySegments, setHistorySegments] = useState<RouteSegment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Pre-fill state for History tab when navigated from Trips tab
  const [historyPrefillTruckId, setHistoryPrefillTruckId] = useState<string | undefined>(undefined);
  const [historyPrefillDate, setHistoryPrefillDate] = useState<string | undefined>(undefined);

  const activeTabRef = useRef(activeTab);
  useEffect(() => {
    activeTabRef.current = activeTab;
  }, [activeTab]);

  // Build truck summary for HistoryTab dropdown
  const orgTrucks = vehicles.map((v) => ({
    truckId: v.truckId,
    licensePlate: v.truck.licensePlate,
    make: v.truck.make,
    model: v.truck.model,
  }));

  // Vehicles to show as map markers: exclude no-location
  const vehiclesForMap = filteredVehicles.filter(
    (v) => v.status !== 'no-location' && v.latitude !== null && v.longitude !== null
  );

  const fetchVehicles = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/carrier/live-map/vehicles');
      if (!res.ok) return;
      const json = await res.json();
      const data: VehicleLocation[] = json.data ?? [];
      setVehicles(data);
      setLastUpdated(new Date());
      setSecondsAgo(0);
    } catch (err) {
      logger.error('Live map vehicles poll error:', err);
    }
  }, []);

  // Polling — only active on Live tab
  useEffect(() => {
    if (activeTab !== 'live') return;

    // Immediate fetch when switching to Live
    fetchVehicles();

    const interval = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      if (activeTabRef.current !== 'live') return;
      fetchVehicles();
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [activeTab, fetchVehicles]);

  // Visibility change — catch-up fetch on tab focus (Live tab only)
  useEffect(() => {
    const handler = () => {
      if (document.visibilityState === 'visible' && activeTabRef.current === 'live') {
        fetchVehicles();
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [fetchVehicles]);

  // Seconds-ago counter
  useEffect(() => {
    setSecondsAgo(0);
    const timer = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdated.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [lastUpdated]);

  // Clear history overlay when switching away from history tab
  useEffect(() => {
    if (activeTab !== 'history') {
      setHistoryPoints([]);
      setHistorySegments([]);
    }
  }, [activeTab]);

  const handleVehicleClick = useCallback((vehicle: VehicleLocation) => {
    setSelectedVehicleId(vehicle.truckId);
    if (vehicle.latitude !== null && vehicle.longitude !== null) {
      setFlyToTarget({ lat: vehicle.latitude, lng: vehicle.longitude });
    }
  }, []);

  const handleViewTrip = useCallback((truckId: string, date: string) => {
    setHistoryPrefillTruckId(truckId);
    setHistoryPrefillDate(date);
    setActiveTab('history');
  }, []);

  return (
    <div className="h-full flex relative">
      {/* Mobile sidebar toggle */}
      <button
        className="md:hidden fixed bottom-4 left-4 z-50 bg-background border rounded-full p-2 shadow-lg"
        onClick={() => setSidebarOpen((p) => !p)}
        aria-label={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
      >
        {sidebarOpen ? (
          <PanelLeftClose className="h-5 w-5" />
        ) : (
          <PanelLeftOpen className="h-5 w-5" />
        )}
      </button>

      {/* Left sidebar — 320px fixed */}
      <div
        className={cn(
          'w-80 border-r flex flex-col shrink-0 bg-background',
          !sidebarOpen && 'hidden md:flex'
        )}
      >
        {/* Tab bar */}
        <LiveMapTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === 'live' && (
          <>
            <VehicleFilterBar
              vehicles={vehicles}
              onFilteredChange={setFilteredVehicles}
            />
            <VehicleSidebar
              vehicles={filteredVehicles}
              onVehicleClick={handleVehicleClick}
              selectedVehicleId={selectedVehicleId}
            />
          </>
        )}

        {activeTab === 'history' && (
          <HistoryTab
            orgTrucks={orgTrucks}
            onHistoryPoints={setHistoryPoints}
            onHistorySegments={setHistorySegments}
            initialTruckId={historyPrefillTruckId}
            initialDate={historyPrefillDate}
          />
        )}

        {activeTab === 'trips' && (
          <TripsTab onViewTrip={handleViewTrip} />
        )}
      </div>

      {/* Right panel — map fills remaining width */}
      <div className="flex-1 min-w-0 relative">
        <LiveMapDynamic
          initialVehicles={vehiclesForMap}
          flyToTarget={flyToTarget}
          historySegments={activeTab === 'history' ? historySegments : null}
          historyPoints={activeTab === 'history' ? historyPoints : null}
          onVehicleClick={(truckId) => setSelectedVehicleId(truckId)}
        />
        {activeTab === 'live' && (
          <div className="absolute bottom-1 right-2 flex items-center gap-1.5 bg-background/80 px-1.5 rounded z-10">
            <p className="text-xs text-muted-foreground">Last updated {secondsAgo}s ago</p>
            <button
              onClick={fetchVehicles}
              className="text-xs text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
              aria-label="Refresh vehicles"
            >
              Refresh
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
