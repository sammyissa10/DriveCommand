'use client';

import { useOptimistic, useTransition } from 'react';
import { ContractsDataGrid } from './ContractsDataGrid';
import type { ContractWithRelations } from '@/lib/contracts/compute-contract-status';

interface ContractsPageClientProps {
  contracts: ContractWithRelations[];
  deleteAction: (id: string) => Promise<{ success: boolean }>;
}

export function ContractsPageClient({ contracts, deleteAction }: ContractsPageClientProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticContracts, removeOptimisticContract] = useOptimistic(
    contracts,
    (state, removedId: string) => state.filter((contract) => contract.id !== removedId)
  );

  const handleDelete = (id: string) => {
    removeOptimisticContract(id);
    startTransition(async () => {
      await deleteAction(id);
    });
  };

  return <ContractsDataGrid contracts={optimisticContracts} onDelete={handleDelete} />;
}
