'use client';

import { DriverForm } from '@/components/drivers/driver-invite-form';
import { updateDriver } from '@/app/(owner)/actions/drivers';

interface EditDriverClientProps {
  driverId: string;
  initialData: {
    firstName: string;
    lastName: string;
    licenseNumber: string;
  };
}

export function EditDriverClient({ driverId, initialData }: EditDriverClientProps) {
  // Bind updateDriver with driverId
  const boundAction = updateDriver.bind(null, driverId);

  return (
    <DriverForm
      action={boundAction}
      mode="edit"
      initialData={initialData}
      submitLabel="Update Driver"
    />
  );
}
