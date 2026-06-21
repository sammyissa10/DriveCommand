'use client';

import { useOptimistic, useTransition } from 'react';
import { DriversDataGrid } from './DriversDataGrid';
import type { DriverWithRelations } from '@/lib/drivers/compute-driver-status';

interface DriversPageClientProps {
  drivers: DriverWithRelations[];
  deleteAction: (id: string) => Promise<{ success: boolean }>;
}

export function DriversPageClient({ drivers, deleteAction }: DriversPageClientProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDrivers, removeOptimisticDriver] = useOptimistic(
    drivers,
    (state, removedId: string) => state.filter((driver) => driver.id !== removedId)
  );

  const handleDelete = (id: string) => {
    removeOptimisticDriver(id);
    startTransition(async () => {
      await deleteAction(id);
    });
  };

  return <DriversDataGrid drivers={optimisticDrivers} onDelete={handleDelete} />;
}
