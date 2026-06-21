import { notFound } from 'next/navigation';
import { getContract, updateContract } from '@/app/(owner)/actions/contracts';
import { ContractRecord } from '../_components/ContractRecord';

interface ContractEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function ContractEditPage({ params }: ContractEditPageProps) {
  const { id } = await params;
  const contract = await getContract(id);

  if (!contract) {
    notFound();
  }

  // Bind the update action with the contract ID
  const boundUpdateAction = updateContract.bind(null, id);

  return <ContractRecord contract={contract} mode="edit" updateAction={boundUpdateAction} />;
}
