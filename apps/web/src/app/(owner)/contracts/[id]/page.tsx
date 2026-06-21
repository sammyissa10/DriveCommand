import { notFound } from 'next/navigation';
import { getContract } from '@/app/(owner)/actions/contracts';
import { ContractRecord } from './_components/ContractRecord';

interface ContractViewPageProps {
  params: Promise<{ id: string }>;
}

export default async function ContractViewPage({ params }: ContractViewPageProps) {
  const { id } = await params;
  const contract = await getContract(id);

  if (!contract) {
    notFound();
  }

  return <ContractRecord contract={contract} mode="view" />;
}
