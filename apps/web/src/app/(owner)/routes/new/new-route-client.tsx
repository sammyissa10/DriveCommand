'use client';

import { createRoute } from '@/app/(owner)/actions/routes';
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

interface NewRouteClientProps {
  drivers: Driver[];
  trucks: Truck[];
}

export function NewRouteClient({ drivers, trucks }: NewRouteClientProps) {
  return (
    <RouteForm
      action={createRoute}
      drivers={drivers}
      trucks={trucks}
      submitLabel="Create Route"
    />
  );
}
