import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { getSession } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { ContractForm } from '@/components/carrier/contracts/ContractForm';
import { NewContractMobile } from './NewContractMobile';
import { ResponsiveSwitch } from '@/components/ui/ResponsiveSwitch';

interface Props {
  searchParams: Promise<{ clientId?: string }>;
}

export default async function NewContractPage({ searchParams }: Props) {
  const session = await getSession();
  if (!session) redirect('/login');
  const { clientId } = await searchParams;

  // Server-fetched so the mobile create's client <select> paints correctly.
  const clients = await prisma.carrierClient
    .findMany({ where: { orgId: session.tenantId }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
    .catch(() => [] as { id: string; name: string }[]);

  return (
    <ResponsiveSwitch
      mobile={
        <div className="-m-4">
          <NewContractMobile clients={clients} defaultClientId={clientId} />
        </div>
      }
      desktop={
        <div className="space-y-6">
          <div>
            <Link
              href="/carrier/contracts"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Contracts
            </Link>
            <h1 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
              New Contract
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Create a new rate agreement for a client.
            </p>
          </div>

          <div className="rounded-lg border border-border bg-card p-6">
            <ContractForm defaultClientId={clientId} />
          </div>
        </div>
      }
    />
  );
}
