'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { VoiceMessageRecorder } from '@/components/carrier/messages/VoiceMessageRecorder';
import { AudioMessageBubble } from '@/components/carrier/messages/AudioMessageBubble';

type Message = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  isBroadcast: boolean;
  dispatchId: string | null;
  stopId: string | null;
  audioUrl?: string | null;
  readAt: string | null;
  createdAt: string;
  isOwn: boolean;
};

function formatRelativeTime(isoString: string): string {
  const now = new Date();
  const date = new Date(isoString);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

interface StopDetailMessagesProps {
  stopId: string;
  driverUserId: string | null;
}

export function StopDetailMessages({ stopId, driverUserId }: StopDetailMessagesProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/carrier/stops/${stopId}/messages`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      // Silent failure
    } finally {
      setIsLoading(false);
    }
  }, [stopId]);

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 10000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!body.trim() || !driverUserId || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/v1/carrier/stops/${stopId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error((err as { error?: string }).error ?? 'Failed to send message');
        return;
      }

      setBody('');
      await fetchMessages();
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleVoiceSend = async (audioBlob: Blob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    const uploadRes = await fetch('/api/v1/messages/upload-audio', {
      method: 'POST',
      body: formData,
    });
    if (!uploadRes.ok) throw new Error('Upload failed');
    const { audioUrl } = await uploadRes.json() as { audioUrl: string };

    const sendRes = await fetch(`/api/v1/carrier/stops/${stopId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'Voice message', audioUrl }),
    });
    if (!sendRes.ok) throw new Error('Send failed');

    await fetchMessages();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <MessageCircle className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Stop Messages</h3>
        {messages.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Messages area */}
      <div className="h-[300px] overflow-y-auto p-4 flex flex-col gap-2">
        {isLoading ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2">
            <MessageCircle className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No messages for this stop yet</p>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex flex-col max-w-[75%]',
                  msg.isOwn ? 'ml-auto items-end' : 'mr-auto items-start'
                )}
              >
                {msg.audioUrl ? (
                  <AudioMessageBubble messageId={msg.id} isOwn={msg.isOwn} />
                ) : (
                  <div
                    className={cn(
                      'px-3 py-2 text-sm',
                      msg.isOwn
                        ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
                        : 'bg-muted text-foreground rounded-2xl rounded-bl-sm'
                    )}
                  >
                    {msg.body}
                  </div>
                )}
                <span className="mt-1 text-xs text-muted-foreground">
                  {msg.isOwn ? 'You' : msg.senderName} &middot; {formatRelativeTime(msg.createdAt)}
                </span>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      {driverUserId ? (
        <div className="flex items-center gap-2 px-4 py-3 border-t border-border">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a message to the driver..."
            disabled={isSending}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          />
          <VoiceMessageRecorder onSend={handleVoiceSend} disabled={isSending} />
          <Button
            onClick={handleSend}
            disabled={!body.trim() || isSending}
            size="icon"
            className="h-9 w-9 shrink-0"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-border">
          <p className="text-xs text-muted-foreground">
            Driver does not have an app account — messaging unavailable
          </p>
        </div>
      )}
    </div>
  );
}
