'use client';

import { useEffect, useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { getVehicleDiagnostics } from '@/app/(owner)/live-map/actions';
import {
  Fuel,
  Gauge,
  MapPin,
  Clock,
  Activity,
  Truck as TruckIcon,
} from 'lucide-react';

interface VehicleDetailsSheetProps {
  truckId: string;
  open: boolean;
  onClose: () => void;
}

interface DiagnosticsData {
  truck: {
    make: string;
    model: string;
    year: number;
    licensePlate: string;
    odometer: number;
  };
  latestGPS: {
    latitude: number;
    longitude: number;
    speed: number | null;
    heading: number | null;
    timestamp: Date;
  } | null;
  latestFuel: {
    quantity: number;
    timestamp: Date;
    odometer: number;
  } | null;
  engineState: 'running' | 'idle' | 'off';
  estimatedFuelLevel: number;
}

export default function VehicleDetailsSheet({
  truckId,
  open,
  onClose,
}: VehicleDetailsSheetProps) {
  const [diagnostics, setDiagnostics] = useState<DiagnosticsData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let mounted = true;
    let interval: NodeJS.Timeout | null = null;

    async function fetchDiagnostics() {
      if (!open || !truckId) return;

      setLoading(true);
      try {
        const data = await getVehicleDiagnostics(truckId);
        if (mounted) {
          setDiagnostics(data as DiagnosticsData);
        }
      } catch (error) {
        console.error('Failed to fetch diagnostics:', error);
        if (mounted) {
          setDiagnostics(null);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    if (open) {
      // Initial fetch
      fetchDiagnostics();

      // Set up 30-second polling
      interval = setInterval(fetchDiagnostics, 30000);
    } else {
      // Clear data when closed
      setDiagnostics(null);
    }

    return () => {
      mounted = false;
      if (interval) {
        clearInterval(interval);
      }
    };
  }, [open, truckId]);

  // Get engine status color
  const getEngineColor = (state: string) => {
    switch (state) {
      case 'running':
        return 'bg-green-500';
      case 'idle':
        return 'bg-yellow-500';
      case 'off':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  // Get fuel level color
  const getFuelColor = (level: number) => {
    if (level > 50) return 'bg-green-500';
    if (level > 25) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  return (
    <Sheet open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        {loading && !diagnostics ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Loading vehicle data...</p>
          </div>
        ) : diagnostics ? (
          <>
            <SheetHeader>
              <SheetTitle>
                {diagnostics.truck.make} {diagnostics.truck.model}
              </SheetTitle>
              <SheetDescription>
                {diagnostics.truck.year} • {diagnostics.truck.licensePlate}
              </SheetDescription>
            </SheetHeader>

            <div className="space-y-6 mt-6">
              {/* Location Section */}
              {diagnostics.latestGPS && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <MapPin className="h-4 w-4" />
                    Location
                  </div>
                  <div className="text-sm text-muted-foreground space-y-1">
                    <p>
                      Lat: {diagnostics.latestGPS.latitude.toFixed(6)}, Lon:{' '}
                      {diagnostics.latestGPS.longitude.toFixed(6)}
                    </p>
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      <span>
                        Last update:{' '}
                        {new Date(
                          diagnostics.latestGPS.timestamp
                        ).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Movement Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Gauge className="h-4 w-4" />
                  Movement
                </div>
                <div className="space-y-1">
                  <p className="text-2xl font-bold">
                    {diagnostics.latestGPS?.speed !== null &&
                    diagnostics.latestGPS?.speed !== undefined &&
                    diagnostics.latestGPS.speed > 0
                      ? `${diagnostics.latestGPS.speed} mph`
                      : 'Stopped'}
                  </p>
                  {diagnostics.latestGPS?.heading !== null &&
                    diagnostics.latestGPS?.heading !== undefined && (
                      <p className="text-sm text-muted-foreground">
                        Heading: {diagnostics.latestGPS.heading}°
                      </p>
                    )}
                  {(!diagnostics.latestGPS?.heading ||
                    diagnostics.latestGPS.heading === null) && (
                    <p className="text-sm text-muted-foreground">Heading: —</p>
                  )}
                </div>
              </div>

              {/* Engine Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Activity className="h-4 w-4" />
                  Engine
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-3 h-3 rounded-full ${getEngineColor(
                      diagnostics.engineState
                    )}`}
                  />
                  <span className="capitalize">{diagnostics.engineState}</span>
                </div>
              </div>

              {/* Fuel Level Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Fuel className="h-4 w-4" />
                  Fuel Level
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden">
                      <div
                        className={`h-full ${getFuelColor(
                          diagnostics.estimatedFuelLevel
                        )} transition-all`}
                        style={{ width: `${diagnostics.estimatedFuelLevel}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">
                      {diagnostics.estimatedFuelLevel}%
                    </span>
                  </div>
                  {diagnostics.latestFuel && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>
                        Last fill: {diagnostics.latestFuel.quantity} gal on{' '}
                        {new Date(
                          diagnostics.latestFuel.timestamp
                        ).toLocaleDateString()}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Odometer Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <TruckIcon className="h-4 w-4" />
                  Odometer
                </div>
                <p className="text-2xl font-bold">
                  {diagnostics.truck.odometer.toLocaleString()} mi
                </p>
              </div>

              {/* DEF Level Section */}
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Activity className="h-4 w-4" />
                  DEF Level
                </div>
                <p className="text-sm text-muted-foreground">
                  N/A - Sensor not connected
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">No data available</p>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
