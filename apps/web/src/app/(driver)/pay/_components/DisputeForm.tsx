'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';

const ISSUE_CATEGORIES = [
  { value: 'WRONG_AMOUNT', label: 'Wrong amount' },
  { value: 'MISSING_PAY', label: 'Missing pay' },
  { value: 'WRONG_MILES', label: 'Wrong mileage' },
  { value: 'MISSING_RECEIPT', label: 'Missing receipt reimbursement' },
  { value: 'OTHER', label: 'Other' },
] as const;

const MIN_MESSAGE_LEN = 50;

interface Props {
  settlementId: string;
  isOpen: boolean;
  onClose: () => void;
}

export function DisputeForm({ settlementId, isOpen, onClose }: Props) {
  const router = useRouter();
  const [issueCategory, setIssueCategory] = useState('');
  const [driverMessage, setDriverMessage] = useState('');
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canSubmit =
    issueCategory.length > 0 && driverMessage.length >= MIN_MESSAGE_LEN;

  const handleSubmitClick = () => {
    if (!canSubmit) return;
    setShowConfirm(true);
  };

  const handleConfirm = async () => {
    setIsSubmitting(true);
    setShowConfirm(false);
    try {
      const res = await fetch(
        `/api/driver-pay/me/settlements/${settlementId}/dispute`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ issueCategory, driverMessage }),
        },
      );

      if (!res.ok) {
        const data = await res.json();
        toast.error(data.error ?? 'Failed to submit dispute.');
        return;
      }

      toast.success(
        'Sent to your dispatcher. Most disputes get a reply within 24 hours.',
      );
      onClose();
      router.refresh();
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (isSubmitting) return;
    setIssueCategory('');
    setDriverMessage('');
    onClose();
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={(open) => { if (!open) handleClose(); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dispute this settlement</DialogTitle>
            <DialogDescription>
              Explain the issue and your dispatcher will review it. Disputes
              temporarily pause payment processing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="issue-category">Issue category</Label>
              <Select value={issueCategory} onValueChange={setIssueCategory}>
                <SelectTrigger id="issue-category">
                  <SelectValue placeholder="Select a category…" />
                </SelectTrigger>
                <SelectContent>
                  {ISSUE_CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="driver-message">
                Describe the issue{' '}
                <span className="text-muted-foreground font-normal">
                  ({driverMessage.length}/{MIN_MESSAGE_LEN} minimum)
                </span>
              </Label>
              <Textarea
                id="driver-message"
                placeholder="Explain what you believe is incorrect and provide any relevant details…"
                rows={5}
                value={driverMessage}
                onChange={(e) => setDriverMessage(e.target.value)}
                maxLength={2000}
              />
              {driverMessage.length > 0 && driverMessage.length < MIN_MESSAGE_LEN && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Please provide at least {MIN_MESSAGE_LEN} characters (
                  {MIN_MESSAGE_LEN - driverMessage.length} more needed).
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmitClick}
              disabled={!canSubmit || isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting…
                </>
              ) : (
                'Submit dispute'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirm} onOpenChange={setShowConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Submit dispute?</AlertDialogTitle>
            <AlertDialogDescription>
              This will pause payment processing and notify your dispatcher.
              They&apos;ll review and respond, typically within 24 hours.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Go back</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirm}>
              Yes, submit dispute
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
