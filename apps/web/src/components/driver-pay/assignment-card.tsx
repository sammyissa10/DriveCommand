'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { computeIsOverride } from '@/lib/driver-pay/snapshot';
import { deleteAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import type { SerializedAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import { OverrideForm } from './override-form';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface AssignmentCardProps {
  assignment: SerializedAssignment;
  onDeleted: () => void;
  onUpdated: (updated: SerializedAssignment) => void;
}

function formatRate(a: SerializedAssignment): string {
  const rate = Number(a.baseRate);
  switch (a.payType) {
    case 'CPM':
      return `$${rate.toFixed(4)}/mile`;
    case 'HOURLY':
      return `$${rate.toFixed(2)}/hr`;
    case 'FLAT_PER_LOAD':
      return `$${rate.toFixed(2)} flat`;
    case 'PERCENTAGE':
      return `${(rate * 100).toFixed(1)}% of load gross`;
    case 'DAILY':
      return `$${rate.toFixed(2)}/day`;
    case 'SALARY':
      return `$${rate.toFixed(2)}/yr`;
    default:
      return `$${rate.toFixed(4)}`;
  }
}

export function AssignmentCard({ assignment, onDeleted, onUpdated }: AssignmentCardProps) {
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const isOverride =
    assignment.template != null
      ? computeIsOverride(assignment, assignment.template)
      : false;

  async function handleDelete() {
    setIsDeleting(true);
    const result = await deleteAssignment(assignment.id);
    setIsDeleting(false);

    if (result.error) {
      toast.error(result.error);
      return;
    }

    toast.success('Driver assignment removed.');
    setShowDeleteConfirm(false);
    onDeleted();
  }

  return (
    <>
      <Card>
        <CardContent className="pt-4 space-y-3">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <Badge variant={assignment.driverRole === 'MAIN_DRIVER' ? 'default' : 'secondary'}>
                {assignment.driverRole === 'MAIN_DRIVER' ? 'Main Driver' : 'Co-Driver'}
              </Badge>
              <span className="font-medium text-sm">
                {assignment.driver.firstName} {assignment.driver.lastName}
              </span>
              <Badge variant="outline" className="text-xs">
                {assignment.payStatus}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowOverrideForm((v) => !v)}
              >
                {showOverrideForm ? 'Cancel edit' : 'Edit pay'}
              </Button>
              {assignment.payStatus === 'DRAFT' && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Remove
                </Button>
              )}
            </div>
          </div>

          {/* Pay rate */}
          <p className="text-sm text-muted-foreground">{formatRate(assignment)}</p>

          {/* Banner */}
          {assignment.template != null && (
            <div
              className={`rounded-md px-3 py-2 text-xs ${
                isOverride
                  ? 'text-amber-700 bg-amber-50 dark:text-amber-400 dark:bg-amber-950/50'
                  : 'text-green-700 bg-green-50 dark:text-green-400 dark:bg-green-950/50'
              }`}
            >
              {isOverride ? (
                <>
                  <span className="font-medium">Overridden</span>
                  {assignment.overrideReason && (
                    <span> — {assignment.overrideReason}</span>
                  )}
                </>
              ) : (
                <>
                  Inheriting {assignment.driver.firstName}&apos;s standard pay:{' '}
                  {formatRate(assignment)}. Override pay terms for this load specifically.
                </>
              )}
            </div>
          )}

          {/* Override form */}
          {showOverrideForm && (
            <OverrideForm
              assignment={assignment}
              onSaved={(updated) => {
                onUpdated(updated);
                setShowOverrideForm(false);
              }}
              onCancel={() => setShowOverrideForm(false)}
            />
          )}
        </CardContent>
      </Card>

      {/* Delete confirm dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this driver assignment?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will remove {assignment.driver.firstName} from this load. If you proceed, their
            pay record will be deleted. This cannot be undone for submitted assignments.
          </p>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setShowDeleteConfirm(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? 'Removing...' : 'Remove assignment'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
