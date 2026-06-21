import { notFound } from 'next/navigation';
import { getDriverWithRelations } from '@/app/(owner)/actions/drivers';
import { DriverRecord } from './_components/DriverRecord';

interface DriverPageProps {
  params: Promise<{ id: string }>;
}

export default async function DriverPage({ params }: DriverPageProps) {
  const { id } = await params;
  const driver = await getDriverWithRelations(id);

  if (!driver) {
    notFound();
  }

  return <DriverRecord driver={driver} mode="view" />;
}
