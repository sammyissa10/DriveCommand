'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, List } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { VehicleLocation } from '@/lib/maps/map-utils';
import { logger } from '@/lib/logger';
import LiveMapTabs from './live-map-tabs';
import VehicleSidebar from './vehicle-sidebar';
import HistoryTab, { HistoryPoint, RouteSegment } from './history-tab';
import TripsTab from './trips-tab';
import KpiStrip from '@/components/tracking/KpiStrip';
import FilterChips from '@/components/tracking/FilterChips';
import ViewToggle from '@/components/tracking/ViewToggle';
import { LiveBoard } from '@/components/tracking/LiveBoard';
import { deriveKpis } from '@/lib/tracking/deriveKpis';
import { deriveStatusCounts, type VehicleStatusKey } from '@/lib/tracking/deriveStatusCounts';
import { MapErrorBoundary } from './map-error-boundary';

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
  const [activeTab, setActiveTab] = useState<TabId>('live');
  const [selectedVehicleId, setSelectedVehicleId] = useState<string | null>(null);
  const [flyToTarget, setFlyToTarget] = useState<{ lat: number; lng: number } | null>(null);
  const [historyPoints, setHistoryPoints] = useState<HistoryPoint[]>([]);
  const [historySegments, setHistorySegments] = useState<RouteSegment[]>([]);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date>(() => new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Pre-fill state for History tab when navigated from Trips tab
  const [historyPrefillTruckId, setHistoryPrefillTruckId] = useState<string | undefined>(undefined);
  const [historyPrefillDate, setHistoryPrefillDate] = useState<string | undefined>(undefined);

  // New state for visual foundation
  const [viewMode, setViewMode] = useState<'map' | 'list'>('map');
  const [activeStatusFilter, setActiveStatusFilter] = useState<VehicleStatusKey>('all');

  // Derive KPIs and status counts from vehicles
  const kpis = useMemo(() => deriveKpis(vehicles, []), [vehicles]);
  const statusCounts = useMemo(() => deriveStatusCounts(vehicles), [vehicles]);

  // Filter vehicles by status
  const statusFilteredVehicles = useMemo(() => {
    if (activeStatusFilter === 'all') return vehicles;
    return vehicles.filter((v) => v.status === activeStatusFilter);
  }, [vehicles, activeStatusFilter]);

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
  const vehiclesForMap = statusFilteredVehicles.filter(
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
    <div className="h-full flex flex-col relative">
      {/* KPI Strip + Filter Bar — Live tab only */}
      {activeTab === 'live' && (
        <div className="shrink-0 p-4 space-y-4 border-b bg-background">
          <KpiStrip kpis={kpis} />
          <div className="flex items-center justify-between gap-4">
            <FilterChips
              statusCounts={statusCounts}
              activeStatus={activeStatusFilter}
              onStatusChange={setActiveStatusFilter}
            />
            <ViewToggle view={viewMode} onViewChange={setViewMode} />
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 flex relative min-h-0">
        {/* Mobile vehicle list toggle — positioned above bottom nav */}
        <button
        className="lg:hidden fixed bottom-24 left-4 z-40 bg-background border border-border rounded-full p-3 shadow-lg hover:bg-muted transition-colors"
        onClick={() => setSidebarOpen((p) => !p)}
        aria-label={sidebarOpen ? 'Close vehicle list' : 'Open vehicle list'}
      >
        {sidebarOpen ? <X className="h-5 w-5" /> : <List className="h-5 w-5" />}
      </button>

      {/* Mobile bottom sheet for vehicle list */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-x-0 bottom-20 z-30 flex flex-col" style={{ height: '60vh' }}>
          {/* Backdrop — tapping closes */}
          <div
            className="absolute inset-0 -top-[40vh] bg-black/40"
            onClick={() => setSidebarOpen(false)}
          />
          {/* Sheet content */}
          <div className="relative bg-background border-t border-border rounded-t-2xl flex flex-col h-full shadow-2xl">
            {/* Drag handle */}
            <div className="flex justify-center py-2">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <span className="text-sm font-semibold">Vehicles</span>
              <button
                onClick={() => setSidebarOpen(false)}
                className="p-1 rounded-md hover:bg-muted"
                aria-label="Close vehicle list"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Tab bar */}
            <LiveMapTabs activeTab={activeTab} onTabChange={setActiveTab} />
            {/* Tab content — scrollable */}
            <div className="flex-1 overflow-y-auto">
              {activeTab === 'live' && (
                <VehicleSidebar vehicles={statusFilteredVehicles} onVehicleClick={handleVehicleClick} selectedVehicleId={selectedVehicleId} />
              )}
              {activeTab === 'history' && (
                <HistoryTab orgTrucks={orgTrucks} onHistoryPoints={setHistoryPoints} onHistorySegments={setHistorySegments} initialTruckId={historyPrefillTruckId} initialDate={historyPrefillDate} />
              )}
              {activeTab === 'trips' && (
                <TripsTab onViewTrip={handleViewTrip} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Left sidebar — desktop only (always visible on lg+) */}
      <div className="w-80 border-r flex-col shrink-0 bg-background hidden lg:flex">
        {/* Tab bar */}
        <LiveMapTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Tab content */}
        {activeTab === 'live' && (
          <VehicleSidebar
            vehicles={statusFilteredVehicles}
            onVehicleClick={handleVehicleClick}
            selectedVehicleId={selectedVehicleId}
          />
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

      {/* Right panel — map or list view with cross-fade */}
        <div className="flex-1 min-w-0 relative">
          <AnimatePresence mode="wait">
            {activeTab === 'live' && viewMode === 'list' ? (
              <motion.div
                key="list-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0 overflow-y-auto bg-background"
              >
                {/*
                  Phase 11's live board. This replaces the previous list view,
                  which rendered `TruckRow` + `TruckRowExpanded` over the LEGACY
                  vehicle feed and was substantially placeholder: the expansion
                  panel's contact, load and activity blocks were hardcoded
                  ("(555) 123-4567", "Load #1234", "Arrived at Stop 2 · 10:23
                  AM") for every truck, `RouteTimeline` always received `[]`
                  because no query populates `dispatch.stops`, and the row's ETA
                  cell printed a literal "On Time" regardless of status. Those
                  are fabricated operational facts on an owner's dashboard —
                  the same class as the "dispatch has been notified" sentence
                  quick-549 had to retract.

                  The board reads the carrier tables instead, so it can show the
                  trips this module actually commits.
                */}
                <LiveBoard />
              </motion.div>
            ) : (
              <motion.div
                key="map-view"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.18 }}
                className="absolute inset-0"
              >
                <MapErrorBoundary>
                  <LiveMapDynamic
                    initialVehicles={vehiclesForMap}
                    flyToTarget={flyToTarget}
                    historySegments={activeTab === 'history' ? historySegments : null}
                    historyPoints={activeTab === 'history' ? historyPoints : null}
                    onVehicleClick={(truckId) => setSelectedVehicleId(truckId)}
                  />
                </MapErrorBoundary>
              </motion.div>
            )}
          </AnimatePresence>
          {activeTab === 'live' && viewMode === 'map' && (
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
    </div>
  );
}
