import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getContract, getContractLoadsSummary } from '@/lib/carrier/contracts';
import { ContractDetail } from './ContractDetail';
import { ContractDetailMobile } from './ContractDetailMobile';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import { prisma } from '@/lib/db/prisma';
import { ResponsiveSwitch } from '@/components/ui/ResponsiveSwitch';

interface Props {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string }>;
}

export default async function ContractDetailPage({ params, searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;
  const { edit } = await searchParams;

  const [contract, loadsSummary, contractAudit, clients] = await Promise.all([
    getContract(session.tenantId, id),
    getContractLoadsSummary(session.tenantId, id),
    prisma.carrierContract.findUnique({
      where: { id },
      select: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => null),
    // Server-fetched so the mobile edit's client <select> paints with the row
    // already chosen (client-fetching would flash "Select a client").
    prisma.carrierClient
      .findMany({ where: { orgId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
      .catch(() => [] as { id: string; name: string }[]),
  ]);

  if (!contract) notFound();

  const serialized = {
    id: contract.id,
    contractNumber: contract.contractNumber,
    contractName: contract.contractName ?? null,
    clientId: contract.clientId,
    clientName: contract.client.name,
    contractType: contract.contractType,
    rateType: contract.rateType,
    baseRate: contract.baseRate,
    fuelSurchargeMethod: contract.fuelSurchargeMethod,
    fuelSurchargeRate: contract.fuelSurchargeRate,
    detentionFreeMinutes: contract.detentionFreeMinutes,
    detentionRatePerHour: contract.detentionRatePerHour,
    tonuRate: contract.tonuRate,
    layoverRatePerDay: contract.layoverRatePerDay,
    paymentTermsOverride: contract.paymentTermsOverride ?? null,
    autoRenew: contract.autoRenew,
    status: contract.status,
    effectiveDate: contract.effectiveDate ? contract.effectiveDate.toISOString() : null,
    expirationDate: contract.expirationDate ? contract.expirationDate.toISOString() : null,
    notes: contract.notes,
    routeTemplateCount: contract.routeTemplateCount,
    totalLoads: contract.totalLoads,
    totalRevenue: contract.totalRevenue,
  };

  const summary = loadsSummary
    ? {
        totalLoads: loadsSummary.totalLoads,
        totalRevenue: loadsSummary.totalRevenue,
        totalInvoiced: loadsSummary.totalInvoiced,
        totalPaid: loadsSummary.totalPaid,
        avgRate: loadsSummary.avgRate,
      }
    : null;

  return (
    <ResponsiveSwitch
      mobile={
        <div className="-m-4">
          <ContractDetailMobile
            contract={serialized}
            loadsSummary={summary}
            clients={clients}
            initialEdit={edit === 'true'}
          />
        </div>
      }
      desktop={
        <div>
          <ContractDetail contract={serialized} loadsSummary={summary} initialEdit={edit === 'true'} />
          {contractAudit && (
            <AuditTrailFooter
              createdAt={contractAudit.createdAt}
              createdByName={contractAudit.createdBy ? `${contractAudit.createdBy.firstName ?? ''} ${contractAudit.createdBy.lastName ?? ''}`.trim() || null : null}
              createdByEmail={contractAudit.createdBy?.email ?? null}
              updatedAt={contractAudit.updatedAt}
              updatedByName={contractAudit.updatedBy ? `${contractAudit.updatedBy.firstName ?? ''} ${contractAudit.updatedBy.lastName ?? ''}`.trim() || null : null}
              updatedByEmail={contractAudit.updatedBy?.email ?? null}
            />
          )}
        </div>
      }
    />
  );
}
