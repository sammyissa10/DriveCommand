'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { MessageCircle, ChevronDown, ChevronUp, Send } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Message = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  body: string;
  stopId: string | null;
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

interface StopMessagesProps {
  stopId: string;
  dispatchId: string;
}

export function StopMessages({ stopId, dispatchId: _dispatchId }: StopMessagesProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [body, setBody] = useState('');
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch(`/api/driver/stops/${stopId}/messages`, { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json();
      const msgs: Message[] = data.messages ?? [];
      setMessages(msgs);
      setUnreadCount(msgs.filter((m) => !m.readAt && !m.isOwn).length);
    } catch {
      // Silent failure
    } finally {
      setIsLoading(false);
    }
  }, [stopId]);

  // Fetch once on mount to get unread count for header badge
  useEffect(() => {
    setIsLoading(true);
    fetchMessages();
  }, [fetchMessages]);

  // Poll only when expanded
  useEffect(() => {
    if (isExpanded) {
      intervalRef.current = setInterval(fetchMessages, 10000);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isExpanded, fetchMessages]);

  // Scroll to bottom when messages change (only when expanded)
  useEffect(() => {
    if (isExpanded) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isExpanded]);

  const handleSend = async () => {
    if (!body.trim() || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch(`/api/driver/stops/${stopId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: body.trim() }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const totalMessages = messages.length;

  return (
    <div className="mt-2 rounded-lg border border-border bg-muted/30 overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setIsExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-muted/50 transition-colors"
        aria-expanded={isExpanded}
      >
        <div className="flex items-center gap-2">
          <MessageCircle className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Messages</span>
          {!isLoading && totalMessages > 0 && (
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-muted text-muted-foreground border border-border">
              {totalMessages}
            </span>
          )}
          {unreadCount > 0 && (
            <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
              {unreadCount} new
            </span>
          )}
        </div>
        {isExpanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <>
          {/* Messages list */}
          <div className="max-h-[200px] overflow-y-auto p-3 flex flex-col gap-1.5 border-t border-border">
            {messages.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">
                No messages for this stop yet
              </p>
            ) : (
              <>
                {messages.map((msg) => (
                  <div
                    key={msg.id}
                    className={cn(
                      'flex flex-col max-w-[80%]',
                      msg.isOwn ? 'ml-auto items-end' : 'mr-auto items-start'
                    )}
                  >
                    <div
                      className={cn(
                        'px-2.5 py-1.5 text-xs rounded-xl',
                        msg.isOwn
                          ? 'bg-primary text-primary-foreground rounded-br-sm'
                          : 'bg-card text-foreground border border-border rounded-bl-sm'
                      )}
                    >
                      {msg.body}
                    </div>
                    <span className="mt-0.5 text-[10px] text-muted-foreground">
                      {msg.isOwn ? 'You' : msg.senderName} &middot; {formatRelativeTime(msg.createdAt)}
                    </span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Reply input */}
          <div className="flex items-center gap-1.5 px-3 py-2 border-t border-border">
            <input
              type="text"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Reply to dispatcher..."
              disabled={isSending}
              className="flex-1 rounded border border-input bg-background px-2 py-1 text-xs ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50"
            />
            <button
              onClick={handleSend}
              disabled={!body.trim() || isSending}
              className="h-7 w-7 flex items-center justify-center rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              aria-label="Send message"
            >
              <Send className="h-3 w-3" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
