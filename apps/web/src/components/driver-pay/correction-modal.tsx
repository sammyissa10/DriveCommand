'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SerializedComponent = {
  id: string;
  componentType: string;
  description: string;
  grossAmount: string;
};

type SerializedNewComponent = {
  id: string;
  componentType: string;
  grossAmount: string;
  [key: string]: unknown;
};

interface CorrectionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignmentId: string;
  payStatus: 'PAID' | 'CORRECTED';
  components: SerializedComponent[];
  onCreated: (newComponent: SerializedNewComponent) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CorrectionModal({
  open,
  onOpenChange,
  assignmentId,
  components,
  onCreated,
}: CorrectionModalProps) {
  const [originalComponentId, setOriginalComponentId] = useState<string>('general');
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'POSITIVE' | 'NEGATIVE'>('NEGATIVE');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedOriginal =
    originalComponentId !== 'general'
      ? components.find((c) => c.id === originalComponentId)
      : null;

  function handleOpenChange(nextOpen: boolean) {
    if (!submitting) {
      if (!nextOpen) {
        setOriginalComponentId('general');
        setReason('');
        setAmount('');
        setType('NEGATIVE');
        setError(null);
      }
      onOpenChange(nextOpen);
    }
  }

  async function handleSubmit() {
    if (reason.length < 10 || !amount) return;

    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/driver-pay/assignments/${assignmentId}/corrections`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            originalComponentId:
              originalComponentId !== 'general' ? originalComponentId : null,
            reason,
            amount,
            type,
          }),
        },
      );

      if (res.status === 201) {
        const json = await res.json();
        toast.success('Correction saved.');
        onCreated(json.component as SerializedNewComponent);
        handleOpenChange(false);
        return;
      }

      const j = await res.json();
      setError(j.error ?? 'An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const isValid = reason.length >= 10 && !!amount;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add a correction</DialogTitle>
          <p className="text-sm text-muted-foreground">
            This will create an adjustment line and mark the assignment as Corrected.
            It&apos;ll be picked up by the next settlement.
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {/* Original line selector */}
          <div className="space-y-1.5">
            <Label>Original line (optional)</Label>
            <Select value={originalComponentId} onValueChange={setOriginalComponentId}>
              <SelectTrigger>
                <SelectValue placeholder="Select a component..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="general">General adjustment</SelectItem>
                {components.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.description} (${Number(c.grossAmount).toFixed(2)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Direction buttons */}
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant={type === 'NEGATIVE' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setType('NEGATIVE')}
              >
                Recover from driver (deduct)
              </Button>
              <Button
                type="button"
                variant={type === 'POSITIVE' ? 'default' : 'outline'}
                size="sm"
                className="flex-1"
                onClick={() => setType('POSITIVE')}
              >
                Owe driver more (add)
              </Button>
            </div>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="correction-amount">Amount</Label>
            <Input
              id="correction-amount"
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>

          {/* Reason */}
          <div className="space-y-1.5">
            <Label htmlFor="correction-reason">
              Reason <span className="text-muted-foreground">(min 10 chars)</span>
            </Label>
            <Textarea
              id="correction-reason"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={2000}
              placeholder="Describe what needs to be corrected and why..."
            />
            <p className="text-xs text-muted-foreground text-right">{reason.length}/2000</p>
          </div>

          {/* Preview */}
          {selectedOriginal && amount && !isNaN(Number(amount)) && Number(amount) !== 0 && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="mb-1 text-xs text-muted-foreground">Preview:</p>
              <div className="flex justify-between text-muted-foreground line-through">
                <span>{selectedOriginal.description}</span>
                <span className="tabular-nums">
                  ${Math.abs(Number(selectedOriginal.grossAmount)).toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between font-medium">
                <span>
                  Adjustment ({type === 'NEGATIVE' ? 'recover' : 'add'})
                </span>
                <span
                  className={`tabular-nums ${type === 'NEGATIVE' ? 'text-destructive' : 'text-emerald-600'}`}
                >
                  {type === 'NEGATIVE' ? '−' : '+'}$
                  {Math.abs(Number(amount)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || !isValid}>
            {submitting ? 'Saving…' : 'Save correction'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
