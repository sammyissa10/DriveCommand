'use client';

import { useOptimistic, useTransition } from 'react';
import { TruckList } from '@/components/trucks/truck-list';
import type { Truck } from '@/generated/prisma/client';

interface TruckListWrapperProps {
  initialTrucks: Truck[];
  deleteAction: (id: string) => Promise<{ success: boolean }>;
}

export function TruckListWrapper({ initialTrucks, deleteAction }: TruckListWrapperProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticTrucks, removeOptimisticTruck] = useOptimistic(
    initialTrucks,
    (state, removedId: string) => state.filter((truck) => truck.id !== removedId)
  );

  const handleDelete = (id: string) => {
    removeOptimisticTruck(id);
    startTransition(async () => {
      await deleteAction(id);
    });
  };

  return <TruckList trucks={optimisticTrucks} onDelete={handleDelete} />;
}
