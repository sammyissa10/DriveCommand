import { listAssignmentsForLoad } from '@/app/(owner)/actions/load-driver-assignments';
import type { SerializedAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import { AssignmentSectionClient } from './assignment-section-client';

interface DriverAssignmentSectionProps {
  loadId: string;
  load: {
    id: string;
    hazmat: boolean;
    referenceNumber: string | null;
    rateAmount: number | null;
    createdAt: string;
  };
  drivers: { id: string; firstName: string; lastName: string; status: string }[];
}

export async function DriverAssignmentSection({
  loadId,
  load,
  drivers,
}: DriverAssignmentSectionProps) {
  const result = await listAssignmentsForLoad(loadId);
  const initialAssignments: SerializedAssignment[] = result.data?.assignments ?? [];

  return (
    <AssignmentSectionClient
      initialAssignments={initialAssignments}
      load={load}
      drivers={drivers}
    />
  );
}
