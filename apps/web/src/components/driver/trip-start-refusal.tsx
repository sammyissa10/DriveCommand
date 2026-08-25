'use client';

import { useRouter } from 'next/navigation';
import { AlertTriangle, ClipboardCheck, XCircle } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * What the driver sees when the gate refuses a trip start.
 *
 * REPLACES `alert(r.error)`, which stood at `driver-dispatch-card.tsx:137` and
 * `route-detail-readonly.tsx:204`. quick-540 wired the gate onto the web
 * driver's start path and reported the presentation as crude and deferred; this
 * is that deferral paid.
 *
 * A native `alert()` was wrong in three separate ways, and only the first is
 * cosmetic:
 *
 *   1. It is an OS chrome box in the middle of a branded app, unstyled,
 *      untranslatable, and impossible to make 44px-friendly.
 *   2. It BLOCKS the main thread and is suppressed outright by some mobile
 *      browsers when it fires outside a direct user gesture — a server action
 *      resolves asynchronously, so the refusal could simply never appear and
 *      the button would look broken.
 *   3. It has exactly one button, so a refusal that HAS a next step could not
 *      offer it. That is the real cost: the gate does not merely say no, it
 *      says which no, and each one has somewhere to go.
 *
 * The sentence itself is never composed here. `inspectionCopy` builds it
 * server-side as one whole string and it is rendered whole — the quick-517 rule
 * about counts and JSX children applies to exactly this kind of message.
 */

export interface TripStartRefusal {
  message: string;
  /** The gate's verdict kind, or a transport failure. Drives the action below. */
  code?: string;
}

export function TripStartRefusalDialog({
  dispatchId,
  refusal,
  onClose,
}: {
  dispatchId: string;
  refusal: TripStartRefusal | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const open = refusal !== null;

  const isBlocked = refusal?.code === 'BLOCKED';
  const needsInspection = refusal?.code === 'INSPECTION_REQUIRED';

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {/*
        `grid-cols-[minmax(0,1fr)]` is not decoration — quick-519. DialogContent
        is a grid, an `auto` track's minimum is the max of its items' min-content
        widths, and a long unbroken string (a truck unit number, a facility name,
        a failed item's name) therefore widens the dialog past its own max-w and
        produces both a horizontal scrollbar and a subtitle that looks clipped.
        An explicit zero-minimum track is the fix, and it belongs on the consumer
        rather than on the shared ui/dialog.tsx primitive.
      */}
      <DialogContent className="grid-cols-[minmax(0,1fr)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {isBlocked ? (
              <XCircle className="h-5 w-5 shrink-0 text-red-600 dark:text-red-400" />
            ) : (
              <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
            )}
            {isBlocked ? 'This trip cannot start' : 'Before you go'}
          </DialogTitle>
          <DialogDescription className="pt-1 text-base leading-relaxed text-foreground">
            {refusal?.message}
          </DialogDescription>
        </DialogHeader>

        <DialogFooter className="gap-2 sm:flex-col-reverse sm:space-x-0">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[48px] w-full rounded-lg bg-muted px-4 text-base font-semibold text-foreground hover:bg-muted/80"
          >
            Close
          </button>

          {needsInspection && (
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(`/inspection/${dispatchId}`);
              }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <ClipboardCheck className="h-5 w-5 shrink-0" />
              Start inspection
            </button>
          )}

          {isBlocked && (
            <button
              type="button"
              onClick={() => {
                onClose();
                router.push(`/inspection/${dispatchId}/blocked`);
              }}
              className="flex min-h-[48px] w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-base font-semibold text-primary-foreground hover:bg-primary/90"
            >
              See what failed
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
