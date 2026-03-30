'use client';

import { useActionState, useState, useEffect, useRef } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { sendDriverMessage, getDriverMessages } from '@/app/(driver)/actions/driver-messages';
import { logger } from '@/lib/logger';

type FleetMessage = {
  id: string;
  tenantId: string;
  routeId?: string | null;
  loadId?: string | null;
  senderId: string;
  senderRole: string;
  body: string;
  createdAt: Date;
};

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-3 lg:py-2.5 text-base lg:text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

export function MessagingPanel() {
  const [state, formAction, isPending] = useActionState(sendDriverMessage, null);
  const [messages, setMessages] = useState<FleetMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const fetchMessages = async () => {
    try {
      const data = await getDriverMessages();
      setMessages(data as FleetMessage[]);
    } catch (err) {
      logger.error('[MessagingPanel] Failed to fetch messages:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Load messages on mount
  useEffect(() => {
    fetchMessages();
  }, []);

  // Refetch after successful send and clear the form
  useEffect(() => {
    if (state?.success) {
      fetchMessages();
      formRef.current?.reset();
    }
  }, [state]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Messages area */}
      <div className="h-[300px] lg:h-[400px] overflow-y-auto border-b border-border p-4 flex flex-col gap-3">
        {isLoading ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="text-sm text-muted-foreground">Loading messages...</p>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center">
            <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">No messages yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Messages with dispatch will appear here
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isDriver = msg.senderRole === 'DRIVER';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[80%] ${isDriver ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                >
                  <div
                    className={`rounded-lg px-3 py-2 text-sm ${
                      isDriver
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {msg.body}
                  </div>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {isDriver ? 'You' : 'Dispatch'} &middot; {formatRelativeTime(msg.createdAt)}
                  </span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Compose area */}
      <form ref={formRef} action={formAction} className="flex items-center gap-2 p-4">
        <input
          type="text"
          name="message"
          placeholder="Type a message to dispatch..."
          disabled={isPending}
          className={inputClass}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex h-12 w-12 lg:h-10 lg:w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {state?.error && typeof state.error === 'string' && (
        <div className="border-t border-border px-4 py-2 bg-destructive/10">
          <p className="text-xs text-destructive">{state.error}</p>
        </div>
      )}
    </div>
  );
}
