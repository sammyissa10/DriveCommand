'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { addOwnerReply } from '@/actions/support-tickets';
import { Button } from '@/components/ui/button';

interface DriverReplyFormProps {
  ticketId: string;
}

export function DriverReplyForm({ ticketId }: DriverReplyFormProps) {
  const [body, setBody] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmed = body.trim();
    if (!trimmed) {
      toast.error('Reply cannot be empty');
      return;
    }
    if (trimmed.length > 4000) {
      toast.error('Reply too long (max 4000 characters)');
      return;
    }

    setLoading(true);
    try {
      const result = await addOwnerReply(ticketId, trimmed);
      if (result.success) {
        toast.success('Reply submitted successfully');
        setBody('');
        router.refresh();
      } else {
        toast.error(result.error ?? 'Failed to submit reply');
      }
    } catch {
      toast.error('Failed to submit reply. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="reply-body" className="text-sm font-medium text-foreground">
          Your Reply
        </label>
        <textarea
          id="reply-body"
          rows={6}
          maxLength={4000}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Type your message here..."
          className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground text-right">
          {body.length}/4000
        </p>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={loading || body.trim().length === 0}>
          {loading ? 'Sending...' : 'Send Reply'}
        </Button>
      </div>
    </form>
  );
}
