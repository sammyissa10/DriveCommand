import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { getLoad } from '@/lib/carrier/loads';
import { LoadForm } from '@/components/carrier/loads/LoadForm';
import type { LoadData } from '@/components/carrier/loads/LoadForm';

interface LoadDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function LoadDetailPage({ params }: LoadDetailPageProps) {
  const session = await getSession();
  if (!session) redirect('/login');

  const orgId = session.tenantId;
  if (!orgId) redirect('/login');

  const { id } = await params;

  const [load, clients] = await Promise.all([
    getLoad(orgId, id),
    prisma.carrierClient.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  if (!load) notFound();

  // Transform load data — convert Decimal fields to numbers for LoadForm
  const initialData: LoadData = {
    id: load.id,
    clientId: load.clientId,
    contractId: load.contractId ?? undefined,
    dispatchId: load.dispatchId ?? undefined,
    loadType: load.loadType,
    referenceNumber: load.referenceNumber ?? undefined,
    bolNumber: load.bolNumber ?? undefined,
    proNumber: load.proNumber ?? undefined,
    poNumber: load.poNumber ?? undefined,
    commodityDescription: load.commodityDescription ?? undefined,
    commodityWeightLbs:
      load.commodityWeightLbs != null ? Number(load.commodityWeightLbs) : null,
    commodityPieces: load.commodityPieces != null ? Number(load.commodityPieces) : null,
    commodityPallets: load.commodityPallets != null ? Number(load.commodityPallets) : null,
    hazmat: load.hazmat,
    hazmatClass: load.hazmatClass ?? undefined,
    rateType: load.rateType,
    rateAmount:
      load.rateAmount != null ? Number(load.rateAmount) : null,
    otherCharges:
      load.financials.otherCharges != null ? Number(load.financials.otherCharges) : null,
    brokerFlag: load.brokerFlag,
    carrierCost:
      load.financials.carrierCost != null ? Number(load.financials.carrierCost) : null,
    fuelSurchargeMethod: load.contract?.fuelSurchargeMethod ?? undefined,
    fuelSurchargeRate:
      load.contract?.fuelSurchargeRate != null
        ? Number(load.contract.fuelSurchargeRate)
        : null,
    specialInstructions: load.specialInstructions ?? undefined,
    notes: load.notes ?? undefined,
  };

  return (
    <div className="space-y-6">
      <div className="min-w-0">
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Load {load.referenceNumber}
        </h1>
        <p className="mt-1 text-muted-foreground text-sm">
          Edit load details, rate, and freight information.
        </p>
      </div>

      <LoadForm
        mode="edit"
        initialData={initialData}
        clients={clients}
        loadId={id}
      />
    </div>
  );
}
