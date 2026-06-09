'use client';

import { useRouter } from 'next/navigation';
import { NewDispatchForm } from '@/components/carrier/dispatches/NewDispatchForm';

interface NewTripFormClientProps {
  driverMap: Record<string, string>;
  truckMap: Record<string, string>;
  userRole?: string;
}

export function NewTripFormClient({ driverMap, truckMap, userRole }: NewTripFormClientProps) {
  const router = useRouter();

  return (
    <NewDispatchForm
      driverMap={driverMap}
      truckMap={truckMap}
      userRole={userRole}
      onSuccess={(newId) => router.push(`/carrier/trips/${newId}`)}
      onCancel={() => router.push('/carrier/trips')}
    />
  );
}
