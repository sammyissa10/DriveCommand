'use client';

import { useTransition, useOptimistic } from 'react';
import { RouteList } from '@/components/routes/route-list';

interface Driver {
  id: string;
  firstName: string | null;
  lastName: string | null;
}

interface Truck {
  id: string;
  make: string;
  model: string;
  licensePlate: string;
}

interface Route {
  id: string;
  origin: string;
  destination: string;
  scheduledDate: Date;
  status: string;
  driver: Driver;
  truck: Truck;
}

interface RouteListWrapperProps {
  initialRoutes: Route[];
  deleteAction: (id: string) => Promise<any>;
}

export function RouteListWrapper({
  initialRoutes,
  deleteAction,
}: RouteListWrapperProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticRoutes, removeOptimisticRoute] = useOptimistic(
    initialRoutes,
    (state, routeId: string) => state.filter((route) => route.id !== routeId)
  );

  const handleDelete = (routeId: string) => {
    removeOptimisticRoute(routeId);
    startTransition(async () => {
      await deleteAction(routeId);
    });
  };

  return <RouteList routes={optimisticRoutes} onDelete={handleDelete} />;
}
