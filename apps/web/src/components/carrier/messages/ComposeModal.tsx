'use client';

import { useState, useEffect } from 'react';
import { Send } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

type Driver = {
  id: string;
  firstName: string;
  lastName: string;
  userId: string | null;
};

interface ComposeModalProps {
  open: boolean;
  onClose: () => void;
  onSent: () => void;
}

export function ComposeModal({ open, onClose, onSent }: ComposeModalProps) {
  const [drivers, setDrivers] = useState<Driver[]>([]);
  const [selectedDriverId, setSelectedDriverId] = useState<string>('');
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isLoadingDrivers, setIsLoadingDrivers] = useState(false);

  useEffect(() => {
    if (!open) return;
    setIsLoadingDrivers(true);
    setSelectedDriverId('');
    setBody('');

    fetch('/api/v1/carrier/fleet/drivers?status=active&pageSize=100', { cache: 'no-store' })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const items: Driver[] = (data?.data?.items ?? []).filter(
          (d: Driver) => !!d.userId
        );
        setDrivers(items);
      })
      .catch(() => {})
      .finally(() => setIsLoadingDrivers(false));
  }, [open]);

  const handleSend = async () => {
    const driver = drivers.find((d) => d.id === selectedDriverId);
    if (!driver?.userId || !body.trim() || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch('/api/v1/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: driver.userId, body: body.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? 'Failed to send message');
        return;
      }

      toast.success('Message sent');
      onSent();
      onClose();
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Message</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="compose-driver">To (Driver)</Label>
            <Select value={selectedDriverId} onValueChange={setSelectedDriverId}>
              <SelectTrigger id="compose-driver" disabled={isLoadingDrivers}>
                <SelectValue
                  placeholder={isLoadingDrivers ? 'Loading drivers...' : 'Select a driver'}
                />
              </SelectTrigger>
              <SelectContent>
                {drivers.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.firstName} {d.lastName}
                  </SelectItem>
                ))}
                {drivers.length === 0 && !isLoadingDrivers && (
                  <div className="py-2 px-3 text-sm text-muted-foreground">
                    No drivers with accounts found
                  </div>
                )}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="compose-body">Message</Label>
            <textarea
              id="compose-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Type your message..."
              rows={4}
              className="resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onClose} disabled={isSending}>
            Cancel
          </Button>
          <Button
            onClick={handleSend}
            disabled={!selectedDriverId || !body.trim() || isSending}
          >
            <Send className="h-4 w-4 mr-2" />
            {isSending ? 'Sending...' : 'Send'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
