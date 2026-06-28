/**
 * Client view page — uses unified ClientRecord component in view mode.
 *
 * This page and /clients/[id]/edit share the exact same component,
 * ensuring view and edit layouts never drift apart.
 */

import { notFound } from 'next/navigation';
import { getClient } from '@/app/(owner)/actions/clients';
import { ClientRecord } from './_components/ClientRecord';
import type { ClientWithRelations } from '@/lib/clients/compute-client-status';

interface ClientDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ClientDetailPage({ params }: ClientDetailPageProps) {
  const { id } = await params;

  const client = await getClient(id);

  if (!client) {
    notFound();
  }

  return <ClientRecord client={client as ClientWithRelations} mode="view" />;
}
