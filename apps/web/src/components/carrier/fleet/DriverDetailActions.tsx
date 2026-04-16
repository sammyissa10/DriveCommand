'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteDriverDialog } from './DeleteDriverDialog';
import { ResendInvitationButton } from './ResendInvitationButton';

interface Props {
  driverId: string;
  driverName: string;
  driverEmail: string | null;
  invitationStatus: string | null;
}

export function DriverDetailActions({ driverId, driverName, driverEmail, invitationStatus }: Props) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-shrink-0">
      {driverEmail && (
        <ResendInvitationButton
          driverId={driverId}
          driverEmail={driverEmail}
          invitationStatus={invitationStatus}
        />
      )}
      <Button
        variant="outline"
        size="sm"
        className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
        onClick={() => setDeleteDialogOpen(true)}
      >
        <Trash2 className="mr-2 h-4 w-4" />
        Delete Driver
      </Button>
      <DeleteDriverDialog
        driverId={driverId}
        driverName={driverName}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
      />
    </div>
  );
}
