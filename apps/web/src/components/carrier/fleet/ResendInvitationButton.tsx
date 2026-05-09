'use client';

import { useState } from 'react';
import { Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';

interface Props {
  driverId: string;
  driverEmail: string;
  invitationStatus: string | null;
}

export function ResendInvitationButton({ driverId, driverEmail, invitationStatus }: Props) {
  const [isSending, setIsSending] = useState(false);
  const [hideButton, setHideButton] = useState(false);

  if (invitationStatus === 'ACCEPTED' || hideButton) return null;

  async function handleResend() {
    setIsSending(true);
    try {
      const res = await fetch(`/api/v1/carrier/fleet/drivers/${driverId}/resend-invitation`, {
        method: 'POST',
      });

      const data = await res.json();

      if (res.ok) {
        if (data.warning) {
          toast.warning(data.warning);
        } else {
          toast.success(`Invitation resent to ${driverEmail}`);
        }
      } else {
        const message: string = data.error ?? 'Failed to resend invitation.';
        toast.error(message);
        if (message.toLowerCase().includes('already accepted')) {
          setHideButton(true);
        }
      }
    } catch {
      toast.error('Something went wrong');
    } finally {
      setIsSending(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={handleResend} disabled={isSending}>
      <Mail className="mr-2 h-4 w-4" />
      {isSending ? 'Sending…' : 'Resend Invitation'}
    </Button>
  );
}
