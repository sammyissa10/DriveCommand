'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, AlertTriangle } from 'lucide-react';

interface CancelLoadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  loadId: string;
  loadRefNumber: string;
  dispatchId: string | null;
  pendingStopCount: number; // Number of pending stops for this load on the trip
}

export function CancelLoadModal({
  open,
  onOpenChange,
  loadId,
  loadRefNumber,
  dispatchId,
  pendingStopCount,
}: CancelLoadModalProps) {
  const router = useRouter();
  const [removeStops, setRemoveStops] = useState(true);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleCancel = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/carrier/loads/${loadId}/cancel`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ removeStops, reason }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to cancel load');
      }
      toast.success(`Load ${loadRefNumber} cancelled`);
      onOpenChange(false);
      router.push('/carrier/loads');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to cancel');
    } finally {
      setLoading(false);
    }
  };

  // Reset form when modal closes
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      setRemoveStops(true);
      setReason('');
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-destructive" />
            Cancel Load {loadRefNumber}
          </DialogTitle>
          <DialogDescription>
            This action cannot be undone. The load status will be set to cancelled.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {dispatchId && pendingStopCount > 0 && (
            <div className="flex items-start space-x-3 p-3 bg-muted rounded-md">
              <Checkbox
                id="removeStops"
                checked={removeStops}
                onCheckedChange={(checked) => setRemoveStops(checked === true)}
              />
              <div className="space-y-1">
                <Label htmlFor="removeStops" className="font-medium cursor-pointer">
                  Remove {pendingStopCount} pending stop{pendingStopCount > 1 ? 's' : ''} from trip
                </Label>
                <p className="text-sm text-muted-foreground">
                  Uncheck to keep the stops on the trip (e.g., if another load will use them).
                </p>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="reason">Cancellation Reason (optional)</Label>
            <Textarea
              id="reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Customer cancelled, load rebooked with another carrier..."
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Keep Load
          </Button>
          <Button variant="destructive" onClick={handleCancel} disabled={loading}>
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Cancel Load
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
