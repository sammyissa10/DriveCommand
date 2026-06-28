'use client';

import { useOptimistic, useTransition } from 'react';
import { ClientsDataGrid } from './ClientsDataGrid';
import type { ClientWithRelations } from '@/lib/clients/compute-client-status';

interface ClientsPageClientProps {
  clients: ClientWithRelations[];
  deleteAction: (id: string) => Promise<{ success: boolean }>;
}

export function ClientsPageClient({ clients, deleteAction }: ClientsPageClientProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticClients, removeOptimisticClient] = useOptimistic(
    clients,
    (state, removedId: string) => state.filter((client) => client.id !== removedId)
  );

  const handleDelete = (id: string) => {
    removeOptimisticClient(id);
    startTransition(async () => {
      await deleteAction(id);
    });
  };

  return <ClientsDataGrid clients={optimisticClients} onDelete={handleDelete} />;
}
