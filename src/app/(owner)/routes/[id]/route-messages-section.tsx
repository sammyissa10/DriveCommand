'use client';

import { useActionState, useState, useEffect, useRef } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { sendOwnerReply, getRouteMessages } from '@/app/(owner)/actions/fleet-messages';
import type { FleetMessageWithSender } from '@/app/(owner)/actions/fleet-messages';

interface RouteMessagesSectionProps {
  routeId: string;
  initialMessages: FleetMessageWithSender[];
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

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

export function RouteMessagesSection({ routeId, initialMessages }: RouteMessagesSectionProps) {
  const [state, formAction, isPending] = useActionState(sendOwnerReply, null);
  const [messages, setMessages] = useState<FleetMessageWithSender[]>(initialMessages);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const fetchMessages = async () => {
    try {
      const data = await getRouteMessages(routeId);
      setMessages(data);
    } catch (err) {
      console.error('[RouteMessagesSection] Failed to fetch messages:', err);
    }
  };

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
    <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-5 w-5 text-muted-foreground" />
        <h2 className="text-lg font-semibold text-card-foreground">Route Messages</h2>
        {messages.length > 0 && (
          <span className="ml-auto text-xs text-muted-foreground">{messages.length} message{messages.length !== 1 ? 's' : ''}</span>
        )}
      </div>

      {/* Messages list */}
      <div className="max-h-[350px] overflow-y-auto mb-4 flex flex-col gap-3 pr-1">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10">
            <MessageSquare className="h-10 w-10 text-muted-foreground/30" />
            <p className="mt-3 text-sm font-medium text-muted-foreground">No messages yet</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Drivers can send messages from their route view.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              const isOwner = msg.senderRole === 'OWNER';
              return (
                <div
                  key={msg.id}
                  className={`flex flex-col max-w-[75%] ${isOwner ? 'ml-auto items-end' : 'mr-auto items-start'}`}
                >
                  <div
                    className={`rounded-lg px-3 py-2 text-sm ${
                      isOwner
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    {msg.body}
                  </div>
                  <span className="mt-1 text-xs text-muted-foreground">
                    {isOwner ? 'You' : msg.senderName} &middot; {formatRelativeTime(msg.createdAt)}
                  </span>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Reply form */}
      <form ref={formRef} action={formAction} className="flex items-center gap-2 border-t border-border pt-4">
        <input type="hidden" name="routeId" value={routeId} />
        <input
          type="text"
          name="message"
          placeholder="Reply to driver..."
          disabled={isPending}
          className={inputClass}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={isPending}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {state?.error && typeof state.error === 'string' && (
        <p className="mt-2 text-xs text-destructive">{state.error}</p>
      )}
    </div>
  );
}
