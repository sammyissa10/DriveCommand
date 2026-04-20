'use client';

import { useState } from 'react';
import { Megaphone } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface BroadcastModalProps {
  open: boolean;
  onClose: () => void;
}

export function BroadcastModal({ open, onClose }: BroadcastModalProps) {
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!body.trim() || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch('/api/v1/messages/broadcast', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? 'Failed to broadcast message');
        return;
      }

      toast.success('Broadcast sent to all drivers');
      setBody('');
      onClose();
    } catch {
      toast.error('Failed to send broadcast');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          setBody('');
          onClose();
        }
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Megaphone className="h-5 w-5" />
            Broadcast Message
          </DialogTitle>
          <DialogDescription>
            This message will be sent to all active drivers in your organization.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="broadcast-body">Message</Label>
            <textarea
              id="broadcast-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your broadcast message..."
              rows={4}
              className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button onClick={handleSend} disabled={!body.trim() || isSending}>
            <Megaphone className="h-4 w-4 mr-2" />
            {isSending ? 'Sending...' : 'Send to all drivers'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
