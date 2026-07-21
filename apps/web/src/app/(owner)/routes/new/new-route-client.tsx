'use client';

import { createRoute } from '@/app/(owner)/actions/routes';
import { RouteForm } from '@/components/routes/route-form';

interface Driver {
  id: string;
  userId: string | null;
  firstName: string | null;
  lastName: string | null;
}

interface Truck {
  id: string;
  unitNumber: string;
  displayName: string | null;
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
