import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContractForm } from '@/components/carrier/contracts/ContractForm';

interface Props {
  searchParams: Promise<{ clientId?: string }>;
}

export default async function NewContractPage({ searchParams }: Props) {
  const { clientId } = await searchParams;

  return (
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
  );
}
