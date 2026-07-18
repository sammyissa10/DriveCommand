'use client';

import { useState, useEffect, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface StopData {
  id: string;
  contactName: string | null;
  contactPhone: string | null;
  appointmentStart: string | null;
  appointmentEnd: string | null;
  specialInstructions: string | null;
  loadId: string | null;
}

interface StopEditModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  stop: StopData;
  dispatchStatus: string;
  loads?: { id: string; referenceNumber: string | null; clientName: string }[];
}

function loadOptionLabel(load: { referenceNumber: string | null; clientName: string }): string {
  return `${load.referenceNumber ? load.referenceNumber : 'No ref'} — ${load.clientName}`;
}

function formatDateTimeLocal(isoString: string | null): string {
  if (!isoString) return '';
  const date = new Date(isoString);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function StopEditModal({
  open,
  onOpenChange,
  stop,
  dispatchStatus,
  loads = [],
}: StopEditModalProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [form, setForm] = useState({
    contactName: stop.contactName ?? '',
    contactPhone: stop.contactPhone ?? '',
    appointmentStart: formatDateTimeLocal(stop.appointmentStart),
    appointmentEnd: formatDateTimeLocal(stop.appointmentEnd),
    specialInstructions: stop.specialInstructions ?? '',
    loadId: stop.loadId ?? 'none',
  });

  const isInProgress = dispatchStatus === 'in_progress';

  // Reset form when stop changes
  useEffect(() => {
    setForm({
      contactName: stop.contactName ?? '',
      contactPhone: stop.contactPhone ?? '',
      appointmentStart: formatDateTimeLocal(stop.appointmentStart),
      appointmentEnd: formatDateTimeLocal(stop.appointmentEnd),
      specialInstructions: stop.specialInstructions ?? '',
      loadId: stop.loadId ?? 'none',
    });
  }, [stop]);

  function handleSubmit() {
    startTransition(async () => {
      try {
        const body: Record<string, unknown> = {};

        // Only include changed fields
        if (form.contactName !== (stop.contactName ?? '')) {
          body.contactName = form.contactName.trim() || undefined;
        }
        if (form.contactPhone !== (stop.contactPhone ?? '')) {
          body.contactPhone = form.contactPhone.trim() || undefined;
        }
        if (form.appointmentStart !== formatDateTimeLocal(stop.appointmentStart)) {
          body.appointmentStart = form.appointmentStart ? new Date(form.appointmentStart).toISOString() : undefined;
        }
        if (form.appointmentEnd !== formatDateTimeLocal(stop.appointmentEnd)) {
          body.appointmentEnd = form.appointmentEnd ? new Date(form.appointmentEnd).toISOString() : undefined;
        }
        if (form.specialInstructions !== (stop.specialInstructions ?? '')) {
          body.specialInstructions = form.specialInstructions.trim() || undefined;
        }
        if (form.loadId !== (stop.loadId ?? 'none')) {
          body.loadId = form.loadId === 'none' ? null : form.loadId;
        }

        // If no changes, just close
        if (Object.keys(body).length === 0) {
          onOpenChange(false);
          return;
        }

        const res = await fetch(`/api/v1/carrier/stops/${stop.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error((err as { error?: string }).error ?? 'Failed to update stop');
        }

        toast.success('Stop updated', {
          description: isInProgress ? 'Driver has been notified of the change.' : undefined,
          icon: isInProgress ? <Bell className="h-4 w-4 text-blue-500" /> : undefined,
        });
        onOpenChange(false);
        router.refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Failed to update stop');
      }
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Stop</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* For Load */}
          {loads.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">For Load</label>
              <Select
                value={form.loadId}
                onValueChange={(v) => setForm((prev) => ({ ...prev, loadId: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific load</SelectItem>
                  {loads.map((load) => (
                    <SelectItem key={load.id} value={load.id}>
                      {loadOptionLabel(load)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Appointment Times */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Appointment Start</label>
              <Input
                type="datetime-local"
                value={form.appointmentStart}
                onChange={(e) => setForm((prev) => ({ ...prev, appointmentStart: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Appointment End</label>
              <Input
                type="datetime-local"
                value={form.appointmentEnd}
                onChange={(e) => setForm((prev) => ({ ...prev, appointmentEnd: e.target.value }))}
              />
            </div>
          </div>

          {/* Contact Info */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Contact Name</label>
              <Input
                value={form.contactName}
                onChange={(e) => setForm((prev) => ({ ...prev, contactName: e.target.value }))}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Contact Phone</label>
              <Input
                value={form.contactPhone}
                onChange={(e) => setForm((prev) => ({ ...prev, contactPhone: e.target.value }))}
                placeholder="(555) 123-4567"
              />
            </div>
          </div>

          {/* Special Instructions */}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Special Instructions</label>
            <Textarea
              value={form.specialInstructions}
              onChange={(e) => setForm((prev) => ({ ...prev, specialInstructions: e.target.value }))}
              placeholder="Any special handling notes..."
              rows={3}
              className="resize-none"
            />
          </div>
        </div>

        <div className="flex gap-2 pt-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            className="flex-1"
            onClick={handleSubmit}
            disabled={isPending}
          >
            {isPending ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
