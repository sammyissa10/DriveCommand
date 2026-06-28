/**
 * Client edit page — uses unified ClientRecord component in edit mode.
 *
 * This page and /clients/[id] share the exact same component,
 * ensuring view and edit layouts never drift apart.
 *
 * Features:
 * - Same layout as view page
 * - Unlocked form fields
 * - Save/Cancel buttons
 * - Unsaved changes indicator
 * - Navigation guard for unsaved changes
 */

import { notFound } from 'next/navigation';
import { getClient, updateClient } from '@/app/(owner)/actions/clients';
import { ClientRecord } from '../_components/ClientRecord';
import type { ClientWithRelations } from '@/lib/clients/compute-client-status';

interface EditClientPageProps {
  params: Promise<{ id: string }>;
}

export default async function EditClientPage({ params }: EditClientPageProps) {
  const { id } = await params;

  const client = await getClient(id);

  if (!client) {
    notFound();
  }

  // Bind the updateClient action to include the client ID
  const boundUpdateClient = updateClient.bind(null, id);

  return (
    <ClientRecord
      client={client as ClientWithRelations}
      mode="edit"
      updateAction={boundUpdateClient}
    />
  );
}
