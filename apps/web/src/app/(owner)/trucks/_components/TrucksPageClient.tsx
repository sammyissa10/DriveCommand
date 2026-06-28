'use client';

import { useOptimistic, useTransition } from 'react';
import { TrucksDataGrid } from './TrucksDataGrid';
import type { TruckWithRelations } from '@/lib/trucks/compute-truck-status';

interface TrucksPageClientProps {
  trucks: TruckWithRelations[];
  deleteAction: (id: string) => Promise<{ success: boolean }>;
}

export function TrucksPageClient({ trucks, deleteAction }: TrucksPageClientProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticTrucks, removeOptimisticTruck] = useOptimistic(
    trucks,
    (state, removedId: string) => state.filter((truck) => truck.id !== removedId)
  );

  const handleDelete = (id: string) => {
    removeOptimisticTruck(id);
    startTransition(async () => {
      await deleteAction(id);
    });
  };

  return <TrucksDataGrid trucks={optimisticTrucks} onDelete={handleDelete} />;
}
