'use client';

import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DeleteDriverDialog } from './DeleteDriverDialog';
import { PortalAccessControls } from './PortalAccessControls';

interface Props {
  driverId: string;
  driverName: string;
  driverEmail: string | null;
  invitationStatus: string | null;
  invitationSentAt: string | null;
  userId: string | null;
  userIsActive: boolean | null;
  canManageAccess: boolean;
}

export function DriverDetailActions({
  driverId,
  driverName,
  driverEmail,
  invitationStatus,
  invitationSentAt,
  userId,
  userIsActive,
  canManageAccess,
}: Props) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
      <PortalAccessControls
        driverId={driverId}
        driverEmail={driverEmail}
        userId={userId}
        userIsActive={userIsActive}
        invitationStatus={invitationStatus}
        invitationSentAt={invitationSentAt}
        canManageAccess={canManageAccess}
      />
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
