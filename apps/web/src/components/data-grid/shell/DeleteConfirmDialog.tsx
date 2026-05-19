'use client';

/**
 * DeleteConfirmDialog - Delete confirmation dialog.
 *
 * Two modes:
 * - Simple: Standard confirmation for small counts (<4 items)
 * - Typed: Requires typing "DELETE" for 4+ items or when forced
 */

import * as React from 'react';
import { cn } from '@/lib/utils';
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
import { Input } from '@/components/ui/input';
import { buttonVariants } from '@/components/ui/button';

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeleteConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback to change open state */
  onOpenChange: (open: boolean) => void;
  /** Number of items being deleted */
  itemCount: number;
  /** Label for the item type (singular form) */
  itemLabel?: string;
  /** Callback when delete is confirmed */
  onConfirm: () => void | Promise<void>;
  /** Force typed confirmation regardless of item count */
  requireTypedConfirmation?: boolean;
  /** Whether delete is in progress */
  isLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeleteConfirmDialog({
  open,
  onOpenChange,
  itemCount,
  itemLabel = 'item',
  onConfirm,
  requireTypedConfirmation = false,
  isLoading = false,
}: DeleteConfirmDialogProps) {
  const [typedValue, setTypedValue] = React.useState('');

  // Determine if typed confirmation is needed
  const needsTypedConfirmation = requireTypedConfirmation || itemCount >= 4;
  const isTypedConfirmValid = typedValue.toUpperCase() === 'DELETE';
  const canDelete = !needsTypedConfirmation || isTypedConfirmValid;

  // Pluralize item label
  const itemLabelPlural = itemCount === 1 ? itemLabel : `${itemLabel}s`;

  // Reset typed value when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setTypedValue('');
    }
  }, [open]);

  // Handle confirm
  const handleConfirm = async () => {
    if (!canDelete || isLoading) return;
    await onConfirm();
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            Delete {itemCount} {itemLabelPlural}?
          </AlertDialogTitle>
          <AlertDialogDescription>
            {needsTypedConfirmation ? (
              <>
                This action cannot be undone. You are about to permanently delete{' '}
                <strong>{itemCount} {itemLabelPlural}</strong>.
              </>
            ) : (
              <>
                Are you sure you want to delete{' '}
                {itemCount === 1 ? `this ${itemLabel}` : `these ${itemCount} ${itemLabelPlural}`}?
                This action cannot be undone.
              </>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Typed confirmation input */}
        {needsTypedConfirmation && (
          <div className="py-4">
            <p className="text-sm text-muted-foreground mb-2">
              Type <strong>DELETE</strong> to confirm
            </p>
            <Input
              value={typedValue}
              onChange={(e) => setTypedValue(e.target.value)}
              placeholder="DELETE"
              className={cn(
                'font-mono',
                isTypedConfirmValid && 'border-green-500 focus-visible:ring-green-500'
              )}
              autoComplete="off"
              autoFocus
            />
          </div>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className={buttonVariants({ variant: 'destructive' })}
            onClick={(e) => {
              e.preventDefault();
              handleConfirm();
            }}
            disabled={!canDelete || isLoading}
          >
            {isLoading ? 'Deleting...' : 'Delete'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
