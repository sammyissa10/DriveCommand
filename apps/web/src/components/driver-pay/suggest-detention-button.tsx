'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Props = {
  assignmentId: string;
  stopId: string;
  payStatus: string;
  hasDetentionComponent: boolean;
  onAdded: (component: unknown) => void;
};

type Suggestion = {
  detentionHours: string;
  detentionRate: string;
  grossAmount: string;
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SuggestDetentionButton({
  assignmentId,
  stopId,
  payStatus,
  hasDetentionComponent,
  onAdded,
}: Props) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [suggestion, setSuggestion] = useState<Suggestion | null>(null);
  const [editableRate, setEditableRate] = useState('');
  const [editableHours, setEditableHours] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // PAID: render nothing
  if (payStatus === 'PAID') return null;

  async function handleButtonClick() {
    setIsLoading(true);
    try {
      const res = await fetch(
        `/api/driver-pay/assignments/${assignmentId}/components/suggest-detention?stopId=${stopId}`,
      );
      const result = await res.json() as { suggestion: Suggestion | null; error?: string };

      if (!res.ok) {
        toast.error(result.error ?? 'Failed to fetch detention suggestion.');
        return;
      }

      if (result.suggestion === null) {
        toast.info('No detention earned for this stop — within free time window.');
        return;
      }

      setSuggestion(result.suggestion);
      setEditableRate(result.suggestion.detentionRate);
      setEditableHours(result.suggestion.detentionHours);
      setSheetOpen(true);
    } catch {
      toast.error('Failed to fetch detention suggestion.');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddToPay() {
    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/driver-pay/assignments/${assignmentId}/components`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          componentType: 'DETENTION',
          category: 'ACCESSORIAL',
          description: 'Detention',
          quantity: editableHours,
          unit: 'HOURS',
          rate: editableRate,
          multiplier: '1.0',
          isTaxable: true,
          isReimbursement: false,
          visibleToDriver: true,
          stopId,
        }),
      });
      const result = await res.json() as { component?: unknown; error?: string };

      if (!res.ok) {
        toast.error(result.error ?? 'Failed to add detention.');
        return;
      }

      toast.success('Detention pay added.');
      onAdded(result.component);
      setSheetOpen(false);
      setSuggestion(null);
    } catch {
      toast.error('Failed to add detention.');
    } finally {
      setIsSubmitting(false);
    }
  }

  const previewTotal = (Number(editableHours) * Number(editableRate)).toFixed(2);

  return (
    <>
      <Button
        variant={hasDetentionComponent ? 'secondary' : 'default'}
        size="sm"
        disabled={isLoading}
        onClick={handleButtonClick}
      >
        {isLoading
          ? 'Loading...'
          : hasDetentionComponent
          ? 'Add another detention'
          : 'Suggest detention'}
      </Button>

      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle>Detention Suggestion</SheetTitle>
          </SheetHeader>

          <div className="py-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Based on the stop&apos;s arrival and departure timestamps, this driver is owed
              detention pay.
            </p>

            <div className="space-y-2">
              <Label htmlFor="detention-hours">Detention Hours</Label>
              <Input
                id="detention-hours"
                value={editableHours}
                onChange={(e) => setEditableHours(e.target.value)}
                type="number"
                min="0"
                step="0.25"
                className="text-right"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="detention-rate">Rate ($/hr)</Label>
              <Input
                id="detention-rate"
                value={editableRate}
                onChange={(e) => setEditableRate(e.target.value)}
                type="number"
                min="0"
                step="0.01"
                className="text-right"
              />
            </div>

            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-sm font-medium">
              Total: ${previewTotal}
            </div>
          </div>

          <SheetFooter className="gap-2 pt-2">
            <Button variant="outline" onClick={() => setSheetOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleAddToPay} disabled={isSubmitting}>
              {isSubmitting ? 'Adding...' : 'Add to Pay'}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
