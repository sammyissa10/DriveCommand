'use client';

import { useActionState, useState } from 'react';
import { Send, MessageSquare } from 'lucide-react';
import { sendDriverMessage } from '@/app/(driver)/actions/driver-messages';

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function MessagingPanel() {
  const [state, formAction, isPending] = useActionState(sendDriverMessage, null);

  return (
    <div className="rounded-lg border border-border bg-card">
      {/* Messages area */}
      <div className="flex h-[400px] flex-col items-center justify-center border-b border-border p-8">
        <MessageSquare className="h-12 w-12 text-muted-foreground/30" />
        <p className="mt-3 text-sm font-medium text-muted-foreground">No messages yet</p>
        <p className="mt-1 text-xs text-muted-foreground">
          Messages with dispatch will appear here
        </p>
      </div>

      {/* Compose area */}
      <form action={formAction} className="flex items-center gap-2 p-4">
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
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 transition-colors"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {state?.success && (
        <div className="border-t border-border px-4 py-2 bg-green-50">
          <p className="text-xs text-green-700">{state.message}</p>
        </div>
      )}
      {state?.error && typeof state.error === 'string' && (
        <div className="border-t border-border px-4 py-2 bg-red-50">
          <p className="text-xs text-red-700">{state.error}</p>
        </div>
      )}
    </div>
  );
}
