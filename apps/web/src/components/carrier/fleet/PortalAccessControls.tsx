'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

interface Props {
  driverId: string;
  userId: string | null;
  userIsActive: boolean | null;
  invitationStatus: string | null;
  canManageAccess: boolean;
}

type AccessState = 'active' | 'suspended' | 'pending' | 'none';

function computeAccessState(
  userId: string | null,
  userIsActive: boolean | null,
  invitationStatus: string | null
): AccessState {
  if (userId && userIsActive === false) {
    return 'suspended';
  }
  if (userId && userIsActive !== false) {
    return 'active';
  }
  if (!userId && invitationStatus === 'PENDING') {
    return 'pending';
  }
  return 'none';
}

export function PortalAccessControls({
  driverId,
  userId,
  userIsActive,
  invitationStatus,
  canManageAccess,
}: Props) {
  const router = useRouter();
  const [isBusy, setIsBusy] = useState(false);

  const state = computeAccessState(userId, userIsActive, invitationStatus);

  async function handleRevoke() {
    setIsBusy(true);
    try {
      const res = await fetch(`/api/v1/carrier/fleet/drivers/${driverId}/revoke-access`, {
        method: 'POST',
      });
      if (res.ok) {
        toast.success('Portal access revoked');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? 'Something went wrong');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsBusy(false);
    }
  }

  async function handleRestore() {
    setIsBusy(true);
    try {
      const res = await fetch(`/api/v1/carrier/fleet/drivers/${driverId}/restore-access`, {
        method: 'POST',
      });
      if (res.ok) {
        toast.success('Portal access restored');
        router.refresh();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error((data as { error?: string }).error ?? 'Something went wrong');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {state === 'active' && (
        <Badge variant="outline" className="border-green-500 text-green-600 dark:text-green-400">
          Portal access active
        </Badge>
      )}
      {state === 'suspended' && (
        <Badge variant="outline" className="border-red-500 text-red-600 dark:text-red-400">
          Access suspended
        </Badge>
      )}
      {state === 'pending' && (
        <Badge variant="outline" className="border-amber-500 text-amber-600 dark:text-amber-400">
          Invitation pending
        </Badge>
      )}
      {state === 'none' && (
        <Badge variant="outline" className="border-border text-muted-foreground">
          No portal access
        </Badge>
      )}

      {canManageAccess && state === 'active' && (
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              disabled={isBusy}
              className="text-red-600 border-red-300 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:border-red-800 dark:hover:bg-red-950"
            >
              Revoke access
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Revoke portal access?</AlertDialogTitle>
              <AlertDialogDescription>
                This will sign the driver out immediately and they will lose portal access until you
                restore it.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRevoke}
                className="bg-red-600 hover:bg-red-700 text-white"
              >
                Revoke access
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {canManageAccess && state === 'suspended' && (
        <Button
          variant="outline"
          size="sm"
          disabled={isBusy}
          onClick={handleRestore}
        >
          Restore access
        </Button>
      )}
    </div>
  );
}
