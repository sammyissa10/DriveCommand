'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';
import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { restoreRecords, permanentlyDeleteRecords } from '@/actions/carrier/soft-delete';
import { DeleteConfirmationDialog } from '@/components/shared/DeleteConfirmationDialog';
import {
  getDaysUntilPurge,
  ENTITY_DISPLAY_NAMES,
  type SoftDeletableEntity,
} from '@/lib/carrier/soft-delete';

interface DeletedItem {
  id: string;
  entityType: SoftDeletableEntity;
  name: string;
  deletedAt: Date;
  deletedBy: string | null;
}

interface RecentlyDeletedGridProps {
  items: DeletedItem[];
}

export function RecentlyDeletedGrid({ items: initialItems }: RecentlyDeletedGridProps) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [isPending, startTransition] = useTransition();
  const [deleteTarget, setDeleteTarget] = useState<DeletedItem | null>(null);

  const handleRestore = (item: DeletedItem) => {
    startTransition(async () => {
      const result = await restoreRecords(item.entityType, [item.id]);
      if (result.success) {
        setItems(prev => prev.filter(i => i.id !== item.id));
        toast.success(`${ENTITY_DISPLAY_NAMES[item.entityType]} restored`);
        router.refresh();
      } else {
        toast.error(`Failed to restore: ${result.error}`);
      }
    });
  };

  const handlePermanentDelete = () => {
    if (!deleteTarget) return;

    const target = deleteTarget;
    setDeleteTarget(null);

    startTransition(async () => {
      const result = await permanentlyDeleteRecords(target.entityType, [target.id]);
      if (result.success) {
        setItems(prev => prev.filter(i => i.id !== target.id));
        toast.success(`${ENTITY_DISPLAY_NAMES[target.entityType]} permanently deleted`);
      } else {
        toast.error(`Failed to delete: ${result.error}`);
      }
    });
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No deleted items. Items you delete will appear here for 30 days.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <div className="space-y-2">
        {items.map(item => {
          const daysLeft = getDaysUntilPurge(item.deletedAt);
          return (
            <Card key={`${item.entityType}-${item.id}`}>
              <CardContent className="flex items-center justify-between py-4">
                <div className="flex items-center gap-4">
                  <Badge variant="outline">
                    {ENTITY_DISPLAY_NAMES[item.entityType]}
                  </Badge>
                  <div>
                    <p className="font-medium">{item.name}</p>
                    <p className="text-sm text-muted-foreground">
                      Deleted {item.deletedAt.toLocaleDateString()}
                      {item.deletedBy && ` by ${item.deletedBy}`}
                      {' • '}
                      <span className={daysLeft <= 7 ? 'text-destructive' : ''}>
                        {daysLeft === 0 ? 'Purges today' : `Purges in ${daysLeft} days`}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRestore(item)}
                    disabled={isPending}
                  >
                    <RotateCcw className="mr-1 h-4 w-4" />
                    Restore
                  </Button>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => setDeleteTarget(item)}
                    disabled={isPending}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    Delete Forever
                  </Button>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <DeleteConfirmationDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        onConfirm={handlePermanentDelete}
        itemName={deleteTarget ? ENTITY_DISPLAY_NAMES[deleteTarget.entityType].toLowerCase() : 'item'}
        isPermanent
        isLoading={isPending}
      />
    </>
  );
}
