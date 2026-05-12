'use client';

import { useState } from 'react';
import type { SerializedAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AssignmentCard } from './assignment-card';
import { AssignDriverModal } from './assign-driver-modal';

type StopRef = { id: string; facilityName: string; stopType: string };

interface AssignmentSectionClientProps {
  initialAssignments: SerializedAssignment[];
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

export function AssignmentSectionClient({
  initialAssignments,
  load,
  drivers,
  stops,
}: AssignmentSectionClientProps) {
  const [assignments, setAssignments] = useState<SerializedAssignment[]>(initialAssignments);
  const [modalOpen, setModalOpen] = useState(false);

  const hasMainDriver = assignments.some((a) => a.driverRole === 'MAIN_DRIVER');
  const hasCODriver = assignments.some((a) => a.driverRole === 'CO_DRIVER');

  function handleAssigned(newAssignment: SerializedAssignment) {
    setAssignments((prev) => [newAssignment, ...prev]);
  }

  function handleDeleted(id: string) {
    setAssignments((prev) => prev.filter((a) => a.id !== id));
  }

  function handleUpdated(updated: SerializedAssignment) {
    setAssignments((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Driver Assignments</h2>
        {assignments.length > 0 && (!hasMainDriver || !hasCODriver) && (
          <Button size="sm" onClick={() => setModalOpen(true)}>
            {!hasMainDriver ? 'Assign Driver' : 'Assign Co-Driver'}
          </Button>
        )}
      </div>

      {assignments.length === 0 ? (
        <Card>
          <CardContent className="py-8 flex flex-col items-center gap-4 text-center">
            <p className="text-muted-foreground text-sm">
              No driver assigned yet. Pay terms will be set when you assign one.
            </p>
            <Button onClick={() => setModalOpen(true)}>Assign Driver</Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {assignments.map((a) => (
            <AssignmentCard
              key={a.id}
              assignment={a}
              stops={stops}
              onDeleted={() => handleDeleted(a.id)}
              onUpdated={handleUpdated}
            />
          ))}
        </div>
      )}

      <AssignDriverModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        loadId={load.id}
        load={load}
        drivers={drivers}
        onAssigned={handleAssigned}
      />
    </div>
  );
}
