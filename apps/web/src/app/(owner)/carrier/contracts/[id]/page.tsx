import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { getContract, getContractLoadsSummary } from '@/lib/carrier/contracts';
import { ContractDetail } from './ContractDetail';

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ContractDetailPage({ params }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');

  const { id } = await params;

  const [contract, loadsSummary] = await Promise.all([
    getContract(session.tenantId, id),
    getContractLoadsSummary(session.tenantId, id),
  ]);

  if (!contract) notFound();

  const serialized = {
    id: contract.id,
    contractNumber: contract.contractNumber,
    clientId: contract.clientId,
    clientName: contract.client.name,
    contractType: contract.contractType,
    rateType: contract.rateType,
    baseRate: contract.baseRate,
    fuelSurchargeMethod: contract.fuelSurchargeMethod,
    fuelSurchargeRate: contract.fuelSurchargeRate,
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

  return <ContractDetail contract={serialized} loadsSummary={summary} />;
}
