import { notFound } from 'next/navigation';
import { getDriverWithRelations, updateDriver } from '@/app/(owner)/actions/drivers';
import { DriverRecord } from '../_components/DriverRecord';

interface DriverEditPageProps {
  params: Promise<{ id: string }>;
}

export default async function DriverEditPage({ params }: DriverEditPageProps) {
  const { id } = await params;
  const driver = await getDriverWithRelations(id);

  if (!driver) {
    notFound();
  }

  // Bind driver ID to update action
  const boundUpdateAction = updateDriver.bind(null, id);

  return (
    <DriverRecord
      driver={driver}
      mode="edit"
      updateAction={boundUpdateAction}
    />
  );
}
