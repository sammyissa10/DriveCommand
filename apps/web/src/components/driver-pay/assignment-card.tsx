'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { computeIsOverride } from '@/lib/driver-pay/snapshot';
import { deleteAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import type { SerializedAssignment } from '@/app/(owner)/actions/load-driver-assignments';
import { OverrideForm } from './override-form';
import { PayComponentsList } from './pay-components-list';
import { SuggestDetentionButton } from './suggest-detention-button';
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

// Matches the serialized shape returned by GET /api/driver-pay/assignments/{id}/components
type SerializedComponent = {
  id: string;
  assignmentId: string;
  componentType: string;
  category: string;
  description: string;
  quantity: string;
  unit: string;
  rate: string;
  multiplier: string;
  grossAmount: string;
  isTaxable: boolean;
  isReimbursement: boolean;
  visibleToDriver: boolean;
  notes: string | null;
  enteredBy: string;
  createdAt: string;
  stopId: string | null;
};

type StopRef = { id: string; facilityName: string; stopType: string };

interface AssignmentCardProps {
  assignment: SerializedAssignment;
  stops?: StopRef[];
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

export function AssignmentCard({ assignment, stops, onDeleted, onUpdated }: AssignmentCardProps) {
  const [showOverrideForm, setShowOverrideForm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Pay components state — fetched once on mount, updated when detention is added
  const [components, setComponents] = useState<SerializedComponent[] | null>(null);
  // Incrementing key forces PayComponentsList to remount with fresh initialComponents
  const [listKey, setListKey] = useState(0);

  useEffect(() => {
    fetch(`/api/driver-pay/assignments/${assignment.id}/components`)
      .then((r) => r.json())
      .then((data: { components?: SerializedComponent[] }) => {
        setComponents(data.components ?? []);
      })
      .catch(() => setComponents([]));
  }, [assignment.id]);

  function handleDetentionAdded(component: unknown) {
    setComponents((prev) => {
      const c = component as SerializedComponent;
      return prev ? [...prev, c] : [c];
    });
    setListKey((k) => k + 1);
  }

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

  const persistedStops = (stops ?? []).filter((s) => !s.id.startsWith('pending-'));

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

          {/* Pay Components */}
          <div className="border-t border-border pt-3 space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Pay Components
            </p>
            {components === null ? (
              <div className="h-8 animate-pulse rounded bg-muted" />
            ) : (
              <PayComponentsList
                key={listKey}
                assignmentId={assignment.id}
                payStatus={assignment.payStatus}
                initialComponents={components}
              />
            )}
          </div>

          {/* Per-stop detention suggestions */}
          {persistedStops.length > 0 && (
            <div className="border-t border-border pt-3 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Detention by Stop
              </p>
              <div className="space-y-2">
                {persistedStops.map((stop) => {
                  const hasDetention = (components ?? []).some(
                    (c) => c.componentType === 'DETENTION' && c.stopId === stop.id,
                  );
                  return (
                    <div
                      key={stop.id}
                      className="flex items-center justify-between gap-2 rounded-md border border-border px-3 py-2"
                    >
                      <div className="min-w-0">
                        <span className="text-sm font-medium truncate">{stop.facilityName}</span>
                        <span className="ml-2 text-xs text-muted-foreground capitalize">
                          {stop.stopType.replace(/_/g, ' ')}
                        </span>
                      </div>
                      <SuggestDetentionButton
                        assignmentId={assignment.id}
                        stopId={stop.id}
                        payStatus={assignment.payStatus}
                        hasDetentionComponent={hasDetention}
                        onAdded={handleDetentionAdded}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
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
