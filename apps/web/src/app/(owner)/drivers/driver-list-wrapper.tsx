'use client';

import { useOptimistic, useTransition } from 'react';
import { DriverList } from '@/components/drivers/driver-list';
import type { User } from '@/generated/prisma/client';

interface DriverListWrapperProps {
  initialDrivers: User[];
  deactivateAction: (id: string) => Promise<{ success: boolean }>;
  reactivateAction: (id: string) => Promise<{ success: boolean }>;
}

export function DriverListWrapper({
  initialDrivers,
  deactivateAction,
  reactivateAction
}: DriverListWrapperProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticDrivers, updateOptimisticDriver] = useOptimistic(
    initialDrivers,
    (state, update: { id: string; isActive: boolean }) =>
      state.map((driver) =>
        driver.id === update.id
          ? { ...driver, isActive: update.isActive }
          : driver
      )
  );

  const handleDeactivate = (id: string) => {
    updateOptimisticDriver({ id, isActive: false });
    startTransition(async () => {
      await deactivateAction(id);
    });
  };

  const handleReactivate = (id: string) => {
    updateOptimisticDriver({ id, isActive: true });
    startTransition(async () => {
      await reactivateAction(id);
    });
  };

  return (
    <DriverList
      drivers={optimisticDrivers}
      onDeactivate={handleDeactivate}
      onReactivate={handleReactivate}
    />
  );
}
