'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Send, MessageCircle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { VoiceMessageRecorder } from './VoiceMessageRecorder';
import { AudioMessageBubble } from './AudioMessageBubble';

type Message = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  isBroadcast: boolean;
  dispatchId: string | null;
  audioUrl?: string | null;
  readAt: string | null;
  createdAt: string;
  isOwn: boolean;
};

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

interface MessageThreadProps {
  driverId: string | null;
  driverName?: string;
  dispatchId?: string | null;
}

export function MessageThread({ driverId, driverName, dispatchId }: MessageThreadProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const fetchMessages = useCallback(async () => {
    if (!driverId) return;
    try {
      const params = new URLSearchParams({ driverId });
      if (dispatchId) params.set('dispatchId', dispatchId);
      const res = await fetch(`/api/v1/messages/thread?${params}`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      setMessages(data.messages ?? []);
    } catch {
      // Silent failure
    } finally {
      setIsLoading(false);
    }
  }, [driverId, dispatchId]);

  useEffect(() => {
    setIsLoading(true);
    setMessages([]);
    fetchMessages();
  }, [fetchMessages]);

  useEffect(() => {
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = async () => {
    if (!body.trim() || !driverId || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch('/api/v1/messages/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recipientId: driverId, body: body.trim(), dispatchId }),
      });

      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error ?? 'Failed to send message');
        return;
      }

      setBody('');
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
      await fetchMessages();
    } catch {
      toast.error('Failed to send message');
    } finally {
      setIsSending(false);
    }
  };

  const handleVoiceSend = async (audioBlob: Blob) => {
    if (!driverId) return;

    // Upload audio to R2
    const formData = new FormData();
    formData.append('audio', audioBlob, 'recording.webm');
    const uploadRes = await fetch('/api/v1/messages/upload-audio', {
      method: 'POST',
      body: formData,
    });
    if (!uploadRes.ok) {
      throw new Error('Upload failed');
    }
    const { audioUrl } = await uploadRes.json() as { audioUrl: string };

    // Send message with audioUrl
    const sendRes = await fetch('/api/v1/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipientId: driverId, body: 'Voice message', dispatchId, audioUrl }),
    });
    if (!sendRes.ok) {
      throw new Error('Send failed');
    }

    await fetchMessages();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setBody(e.target.value);
    // Auto-resize textarea
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 80)}px`;
  };

  if (!driverId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground">
        <MessageCircle className="h-12 w-12 opacity-30" />
        <p className="text-sm">Select a conversation to start messaging</p>
      </div>
    );
  }

  // Group messages by date for date separators
  const groupedMessages: { date: string; msgs: Message[] }[] = [];
  for (const msg of messages) {
    const date = formatDate(msg.createdAt);
    const last = groupedMessages[groupedMessages.length - 1];
    if (!last || last.date !== date) {
      groupedMessages.push({ date, msgs: [msg] });
    } else {
      last.msgs.push(msg);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <div>
          <h3 className="text-sm font-semibold text-foreground">{driverName ?? 'Driver'}</h3>
          {dispatchId && (
            <Link
              href={`/carrier/dispatches/${dispatchId}`}
              className="text-xs text-primary hover:underline flex items-center gap-1"
            >
              View Dispatch
              <ExternalLink className="h-3 w-3" />
            </Link>
          )}
        </div>
      </div>

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-24">
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex items-center justify-center h-24">
            <p className="text-sm text-muted-foreground">No messages yet. Say hi!</p>
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {groupedMessages.map(({ date, msgs }) => (
              <div key={date} className="flex flex-col gap-1">
                {/* Date separator */}
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-xs text-muted-foreground px-2">{date}</span>
                  <div className="flex-1 h-px bg-border" />
                </div>

                {msgs.map((msg) => (
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
                          'px-4 py-2 text-sm',
                          msg.isOwn
                            ? 'bg-primary text-primary-foreground rounded-2xl rounded-br-sm'
                            : 'bg-muted text-foreground rounded-2xl rounded-bl-sm'
                        )}
                      >
                        {msg.body}
                      </div>
                    )}
                    <span className="mt-1 text-xs text-muted-foreground">
                      {msg.isOwn ? 'You' : msg.senderName} &middot; {formatTime(msg.createdAt)}
                    </span>
                  </div>
                ))}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input bar */}
      <div className="flex items-end gap-2 px-4 py-3 border-t border-border">
        <textarea
          ref={textareaRef}
          value={body}
          onChange={handleTextareaChange}
          onKeyDown={handleKeyDown}
          placeholder="Type a message... (Enter to send)"
          disabled={isSending}
          rows={1}
          className="flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 min-h-[38px] max-h-[80px] overflow-y-auto"
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
    </div>
  );
}
