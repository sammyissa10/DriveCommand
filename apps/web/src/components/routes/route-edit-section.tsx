'use client';

import { useEffect, useState, useRef } from 'react';
import { RouteForm } from '@/components/routes/route-form';
import { updateRoute } from '@/app/(owner)/actions/routes';
import { formatForDatetimeInput } from '@/lib/utils/date';
import { useUnsavedChangesWarning } from './use-unsaved-changes-warning';

interface RouteEditSectionProps {
  route: {
    id: string;
    name: string | null;
    origin: string;
    destination: string;
    scheduledDate: Date;
    completedAt: Date | null;
    status: string;
    notes: string | null;
    version: number;
    distanceMiles: number | null;
    driver: { id: string; firstName: string | null; lastName: string | null; email: string; licenseNumber: string | null };
    truck?: { id: string; make: string; model: string; year: number; licensePlate: string; vin: string } | null;
    carrierTruckId?: string | null;
    stops?: Array<{
      id: string;
      position: number;
      type: string;
      address: string;
      status: string;
      scheduledAt: Date | null;
      arrivedAt: Date | null;
      departedAt: Date | null;
      notes: string | null;
    }>;
    coDrivers?: Array<{
      id: string;
      driver: { id: string; firstName: string | null; lastName: string | null; email: string };
    }>;
  };
  drivers: Array<{ id: string; firstName: string | null; lastName: string | null }>;
  trucks: Array<{ id: string; unitNumber: string; displayName: string | null }>;
  onDirtyChange?: (dirty: boolean) => void;
  onCancel: () => void;
}

export function RouteEditSection({
  route,
  drivers,
  trucks,
  onDirtyChange,
  onCancel,
}: RouteEditSectionProps) {
  const [isDirty, setIsDirty] = useState(false);
  const formContainerRef = useRef<HTMLDivElement>(null);

  // Use the unsaved changes warning hook
  useUnsavedChangesWarning(isDirty);

  // Notify parent of dirty state changes
  useEffect(() => {
    if (onDirtyChange) {
      onDirtyChange(isDirty);
    }
  }, [isDirty, onDirtyChange]);

  // Track form interactions via event delegation
  useEffect(() => {
    const container = formContainerRef.current;
    if (!container) return;

    const handleFormInteraction = () => {
      if (!isDirty) {
        setIsDirty(true);
      }
    };

    // Listen for input and change events within the form container
    container.addEventListener('input', handleFormInteraction);
    container.addEventListener('change', handleFormInteraction);

    return () => {
      container.removeEventListener('input', handleFormInteraction);
      container.removeEventListener('change', handleFormInteraction);
    };
  }, [isDirty]);

  // Prepare initial data for the form
  const initialData = {
    origin: route.origin,
    destination: route.destination,
    scheduledDate: formatForDatetimeInput(route.scheduledDate, 'UTC'),
    driverId: route.driver.id,
    carrierTruckId: route.carrierTruckId ?? undefined,
    notes: route.notes || '',
    distanceMiles: route.distanceMiles,
    name: route.name,
  };

  const initialCoDriverIds = route.coDrivers?.map((cd) => cd.driver.id) ?? [];

  // Bind the update action with the route ID
  const boundUpdateRoute = updateRoute.bind(null, route.id);

  return (
    <div ref={formContainerRef}>
      <RouteForm
        action={boundUpdateRoute}
        initialData={initialData}
        initialStops={route.stops}
        initialCoDriverIds={initialCoDriverIds}
        drivers={drivers}
        trucks={trucks}
        submitLabel="Update Route"
        extraHiddenFields={{ version: route.version }}
      />
    </div>
  );
}
