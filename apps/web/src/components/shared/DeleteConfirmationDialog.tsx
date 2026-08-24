'use client';

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { buttonVariants } from '@/components/ui/button';
import { SOFT_DELETE_RETENTION_DAYS } from '@/lib/carrier/soft-delete';

interface DeleteConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  itemCount?: number;
  itemName?: string;
  /** Correct plural. Falls back to `itemName + 's'`, which is what every
   *  caller relied on before facilities arrived and broke the guess. */
  itemNamePlural?: string;
  isPermanent?: boolean;
  isLoading?: boolean;
}

export function DeleteConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  itemCount = 1,
  itemName = 'item',
  itemNamePlural,
  isPermanent = false,
  isLoading = false,
}: DeleteConfirmationDialogProps) {
  const plural = itemCount > 1;
  const itemText = plural
    ? `${itemCount} ${itemNamePlural ?? `${itemName}s`}`
    : `this ${itemName}`;

  const defaultTitle = isPermanent
    ? `Permanently delete ${itemText}?`
    : `Delete ${itemText}?`;

  const defaultDescription = isPermanent
    ? `This action cannot be undone. ${plural ? 'These items' : 'This item'} will be permanently removed from the database.`
    : `${plural ? 'These items' : 'This item'} will be moved to Recently Deleted and automatically purged after ${SOFT_DELETE_RETENTION_DAYS} days. You can restore ${plural ? 'them' : 'it'} anytime before then.`;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title ?? defaultTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {description ?? defaultDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={isLoading}
            className={buttonVariants({ variant: 'destructive' })}
          >
            {isLoading ? 'Deleting...' : isPermanent ? 'Delete Forever' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
