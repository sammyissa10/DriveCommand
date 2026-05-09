'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface Props {
  driverId: string;
  driverName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DeleteDriverDialog({ driverId, driverName, open, onOpenChange }: Props) {
  const router = useRouter();
  const [typedName, setTypedName] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!isDeleting) {
      setTypedName('');
      setErrorMessage(null);
      onOpenChange(nextOpen);
    }
  }

  async function handleDelete() {
    setIsDeleting(true);
    setErrorMessage(null);

    try {
      const res = await fetch(`/api/v1/carrier/fleet/drivers/${driverId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        toast.success('Driver deleted');
        onOpenChange(false);
        router.push('/carrier/fleet/drivers');
        router.refresh();
      } else if (res.status === 400) {
        const data = await res.json();
        setErrorMessage(data.error ?? 'Unable to delete driver.');
      } else {
        toast.error('Something went wrong');
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsDeleting(false);
    }
  }

  const canConfirm = typedName.trim() === driverName && !isDeleting;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete Driver</DialogTitle>
          <DialogDescription>
            This will permanently delete <strong>{driverName}</strong> and all associated records.
            This cannot be undone.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="confirm-name">Type the driver&apos;s full name to confirm:</Label>
            <Input
              id="confirm-name"
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={driverName}
              disabled={isDeleting}
              autoComplete="off"
            />
          </div>
          {errorMessage && (
            <p className="text-sm text-red-600 dark:text-red-400">{errorMessage}</p>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={!canConfirm}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Deleting…
              </>
            ) : (
              'Delete Driver'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
