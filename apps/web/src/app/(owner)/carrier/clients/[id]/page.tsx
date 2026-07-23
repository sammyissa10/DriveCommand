import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getClient } from '@/lib/carrier/clients';
import { ClientDetail } from './ClientDetail';
import { ClientDetailMobile } from './ClientDetailMobile';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import { prisma } from '@/lib/db/prisma';
import { hasPermission } from '@/lib/auth/permissions';
import { ResponsiveSwitch } from '@/components/ui/ResponsiveSwitch';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function ClientDetailPage({ params, searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const canCreateContract = hasPermission(session.permissions ?? null, 'contracts', session.role);

  const { id } = await params;
  const { edit } = await searchParams;

  const [client, clientAudit] = await Promise.all([
    getClient(session.tenantId, id),
    prisma.carrierClient.findUnique({
      where: { id },
      select: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => null),
  ]);
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
    contacts: client.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      phone: c.phone,
      email: c.email,
      isMain: c.isMain,
    })),
  };

  return (
    <ResponsiveSwitch
      mobile={
        <div className="-m-4">
          <ClientDetailMobile client={serialized} initialEdit={edit === 'true'} />
        </div>
      }
      desktop={
        <div>
          <ClientDetail client={serialized} initialEdit={edit === 'true'} role={session.role ?? undefined} canCreateContract={canCreateContract} />
          {clientAudit && (
            <AuditTrailFooter
              createdAt={clientAudit.createdAt}
              createdByName={clientAudit.createdBy ? `${clientAudit.createdBy.firstName ?? ''} ${clientAudit.createdBy.lastName ?? ''}`.trim() || null : null}
              createdByEmail={clientAudit.createdBy?.email ?? null}
              updatedAt={clientAudit.updatedAt}
              updatedByName={clientAudit.updatedBy ? `${clientAudit.updatedBy.firstName ?? ''} ${clientAudit.updatedBy.lastName ?? ''}`.trim() || null : null}
              updatedByEmail={clientAudit.updatedBy?.email ?? null}
            />
          )}
        </div>
      }
    />
  );
}
