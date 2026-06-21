import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContractCreateForm } from './_components/ContractCreateForm';
import { createContract } from '@/app/(owner)/actions/contracts';

export default function NewContractPage() {
  return (
    <div className="space-y-6 max-w-4xl">
      {/* Back link */}
      <Link
        href="/contracts"
        className="group inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        Back to Contracts
      </Link>

      {/* Page header */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
          Add Contract
        </h1>
        <p className="mt-1 text-muted-foreground">
          Create a new rate agreement with a client
        </p>
      </div>

      {/* Form */}
      <ContractCreateForm createAction={createContract} />
    </div>
  );
}
