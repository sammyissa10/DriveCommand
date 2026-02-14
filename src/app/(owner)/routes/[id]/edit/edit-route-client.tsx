'use client';

import { updateRoute } from '@/app/(owner)/actions/routes';
import { RouteForm } from '@/components/routes/route-form';

interface Driver {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface Truck {
  id: string;
  make: string;
  model: string;
  year: number;
  licensePlate: string;
}

interface EditRouteClientProps {
  routeId: string;
  initialData: {
    origin: string;
    destination: string;
    scheduledDate: string;
    driverId: string;
    truckId: string;
    notes?: string;
  };
  drivers: Driver[];
  trucks: Truck[];
}

export function EditRouteClient({
  routeId,
  initialData,
  drivers,
  trucks,
}: EditRouteClientProps) {
  const boundUpdateRoute = updateRoute.bind(null, routeId);

  return (
    <RouteForm
      action={boundUpdateRoute}
      initialData={initialData}
      drivers={drivers}
      trucks={trucks}
      submitLabel="Update Route"
    />
  );
}
