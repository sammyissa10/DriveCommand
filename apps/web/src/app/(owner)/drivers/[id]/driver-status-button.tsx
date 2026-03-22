'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { UserX, UserCheck } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';

interface DriverStatusButtonProps {
  driverId: string;
  driverName: string;
  isActive: boolean;
  deactivateAction: (id: string) => Promise<{ success: boolean }>;
  reactivateAction: (id: string) => Promise<{ success: boolean }>;
}

export function DriverStatusButton({
  driverId,
  driverName,
  isActive,
  deactivateAction,
  reactivateAction,
}: DriverStatusButtonProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleConfirm() {
    startTransition(async () => {
      if (isActive) {
        await deactivateAction(driverId);
        router.push('/drivers');
      } else {
        await reactivateAction(driverId);
        router.refresh();
      }
      setOpen(false);
    });
  }

  if (isActive) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-2.5 text-sm font-medium text-destructive hover:bg-destructive/20 transition-colors"
        >
          <UserX className="h-4 w-4" />
          Remove Driver
        </button>

        <AlertDialog open={open} onOpenChange={setOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove Driver</AlertDialogTitle>
              <AlertDialogDescription>
                Are you sure you want to remove {driverName}? They will lose access immediately. You
                can reactivate them at any time.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                disabled={isPending}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={handleConfirm}
              >
                {isPending ? 'Removing...' : 'Remove Driver'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    );
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-2.5 text-sm font-medium text-emerald-700 hover:bg-emerald-100 transition-colors"
      >
        <UserCheck className="h-4 w-4" />
        Reactivate Driver
      </button>

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reactivate Driver</AlertDialogTitle>
            <AlertDialogDescription>
              Reactivate {driverName}? They will regain access to the driver app.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={isPending} onClick={handleConfirm}>
              {isPending ? 'Reactivating...' : 'Reactivate'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
