'use client';

import { useState, useCallback, useTransition } from 'react';
import { toast } from 'sonner';
import { softDeleteRecords, restoreRecords } from '@/actions/carrier/soft-delete';
import {
  UNDO_TOAST_DURATION_MS,
  ENTITY_DISPLAY_NAMES,
  ENTITY_PLURAL_NAMES,
  type SoftDeletableEntity,
} from '@/lib/carrier/soft-delete';

interface UseSoftDeleteOptions {
  entityType: SoftDeletableEntity;
  onSuccess?: () => void;
  onError?: (error: string) => void;
}

export function useSoftDelete({ entityType, onSuccess, onError }: UseSoftDeleteOptions) {
  const [isPending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[]>([]);

  const displayName = ENTITY_DISPLAY_NAMES[entityType];
  const pluralName = ENTITY_PLURAL_NAMES[entityType];

  // Open confirmation dialog
  const requestDelete = useCallback((ids: string | string[]) => {
    const idArray = Array.isArray(ids) ? ids : [ids];
    setPendingIds(idArray);
    setDialogOpen(true);
  }, []);

  // Execute soft delete after confirmation
  const confirmDelete = useCallback(() => {
    if (pendingIds.length === 0) return;

    const idsToDelete = [...pendingIds];
    setDialogOpen(false);
    setPendingIds([]);

    startTransition(async () => {
      const result = await softDeleteRecords(entityType, idsToDelete);

      if (result.success) {
        const count = result.deletedCount ?? idsToDelete.length;
        const itemText = count > 1 ? `${count} ${pluralName.toLowerCase()}` : displayName;

        toast.success(`${itemText} deleted`, {
          duration: UNDO_TOAST_DURATION_MS,
          action: {
            label: 'Undo',
            onClick: async () => {
              const undoResult = await restoreRecords(entityType, idsToDelete);
              if (undoResult.success) {
                toast.success(`${itemText} restored`);
                onSuccess?.();
              } else {
                toast.error(`Failed to restore: ${undoResult.error}`);
              }
            },
          },
        });
        onSuccess?.();
      } else {
        toast.error(`Failed to delete: ${result.error}`);
        onError?.(result.error ?? 'Unknown error');
      }
    });
  }, [pendingIds, entityType, displayName, pluralName, onSuccess, onError]);

  // Cancel deletion
  const cancelDelete = useCallback(() => {
    setDialogOpen(false);
    setPendingIds([]);
  }, []);

  return {
    isPending,
    dialogOpen,
    pendingIds,
    itemCount: pendingIds.length,
    requestDelete,
    confirmDelete,
    cancelDelete,
    setDialogOpen,
    itemName: displayName.toLowerCase(),
  };
}
