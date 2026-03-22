'use client';

import { TruckForm } from '@/components/trucks/truck-form';
import { updateTruck } from '@/app/(owner)/actions/trucks';

interface EditTruckClientProps {
  truckId: string;
  initialData: {
    make: string;
    model: string;
    year: number;
    vin: string;
    licensePlate: string;
    odometer: number;
    documentMetadata?: {
      registrationNumber?: string;
      registrationExpiry?: string;
      insuranceNumber?: string;
      insuranceExpiry?: string;
    };
  };
}

export function EditTruckClient({ truckId, initialData }: EditTruckClientProps) {
  const boundUpdateTruck = updateTruck.bind(null, truckId);

  return <TruckForm action={boundUpdateTruck} initialData={initialData} submitLabel="Update Truck" />;
}
