import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getClient } from '@/lib/carrier/clients';
import { ClientDetail } from './ClientDetail';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const { edit } = await searchParams;

  const client = await getClient(session.tenantId, id);
  if (!client) notFound();

  const serialized = {
    id: client.id,
    name: client.name,
    dbaName: client.dbaName,
    mcNumber: client.mcNumber,
    dotNumber: client.dotNumber,
    taxId: client.taxId,
    status: client.status,
    primaryContact: client.primaryContact,
    email: client.email,
    phone: client.phone,
    website: client.website,
    addressLine1: client.addressLine1,
    addressLine2: client.addressLine2,
    city: client.city,
    state: client.state,
    zip: client.zip,
    country: client.country,
    portalAccess: client.portalAccess,
    portalEmail: client.portalEmail,
    paymentTerms: client.paymentTerms,
    creditLimit: client.creditLimit != null ? String(client.creditLimit) : null,
    notes: client.notes,
    openLoadsCount: client.openLoadsCount,
    outstandingAR: client.outstandingAR,
  };

  return <ClientDetail client={serialized} initialEdit={edit === 'true'} role={session.role ?? undefined} />;
}
