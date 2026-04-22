'use client';

import { useEffect, useRef, useState } from 'react';
import { Send } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MessageItem {
  id: string;
  senderName: string;
  body: string;
  createdAt: string;
  isBroadcast: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs / 24);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

function truncate(text: string, max = 60): string {
  return text.length > max ? text.slice(0, max) + '…' : text;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickMessageBoard() {
  const [messages, setMessages] = useState<MessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  function fetchMessages() {
    return fetch('/api/v1/carrier/dashboard/messages')
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((json) => setMessages(Array.isArray(json) ? json : []))
      .catch(() => {});
  }

  useEffect(() => {
    fetchMessages().finally(() => setLoading(false));

    // Poll every 30 seconds
    intervalRef.current = setInterval(fetchMessages, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  async function handleSend() {
    const trimmed = body.trim();
    if (!trimmed || sending) return;

    setSending(true);
    try {
      const res = await fetch('/api/v1/carrier/dashboard/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: trimmed }),
      });
      if (res.ok) {
        setBody('');
        await fetchMessages();
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground">Messages</h2>
        <span
          className="text-xs text-muted-foreground cursor-not-allowed select-none"
          title="Full messaging coming soon"
        >
          View All
        </span>
      </div>

      {/* Message list */}
      {loading ? (
        <div className="divide-y divide-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-3 animate-pulse space-y-1.5">
              <div className="h-3.5 w-1/3 bg-muted rounded" />
              <div className="h-3 w-4/5 bg-muted rounded" />
            </div>
          ))}
        </div>
      ) : messages.length === 0 ? (
        <div className="flex items-center justify-center py-6 text-xs text-muted-foreground">
          No messages yet
        </div>
      ) : (
        <div className="divide-y divide-border">
          {messages.map((msg) => (
            <div key={msg.id} className="px-4 py-3">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-semibold text-foreground truncate">
                  {msg.senderName}
                  {msg.isBroadcast && (
                    <span className="ml-1.5 text-[9px] font-normal text-muted-foreground uppercase tracking-wide">
                      broadcast
                    </span>
                  )}
                </span>
                <span className="text-[10px] text-muted-foreground flex-shrink-0">
                  {relativeTime(msg.createdAt)}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">{truncate(msg.body)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Compose */}
      <div className="px-4 py-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground mb-1.5">To: All Drivers</p>
        <div className="flex gap-2">
          <input
            type="text"
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Send a message to all drivers…"
            className="flex-1 min-w-0 border border-border rounded-lg px-3 py-2 text-sm bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
            aria-label="Message body"
          />
          <button
            onClick={handleSend}
            disabled={sending || !body.trim()}
            className="flex-shrink-0 rounded-lg bg-primary px-3 py-2 text-primary-foreground text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
