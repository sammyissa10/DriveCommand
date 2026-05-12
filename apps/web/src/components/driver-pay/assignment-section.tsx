import { listAssignmentsForLoad } from '@/app/(owner)/actions/load-driver-assignments';
import type { SerializedAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import { AssignmentSectionClient } from './assignment-section-client';

type StopRef = { id: string; facilityName: string; stopType: string };

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
  stops?: StopRef[];
}

export async function DriverAssignmentSection({
  loadId,
  load,
  drivers,
  stops,
}: DriverAssignmentSectionProps) {
  const result = await listAssignmentsForLoad(loadId);
  const initialAssignments: SerializedAssignment[] = result.data?.assignments ?? [];

  return (
    <AssignmentSectionClient
      initialAssignments={initialAssignments}
      load={load}
      drivers={drivers}
      stops={stops}
    />
  );
}
