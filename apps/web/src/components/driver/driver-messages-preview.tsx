'use client';

import Link from 'next/link';

interface MessagePreview {
  id: string;
  senderRole: string;
  body: string;
  createdAt: string;
}

interface DriverMessagesPreviewProps {
  messages: MessagePreview[];
}

function relativeTime(date: string): string {
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const months = Math.floor(diffDays / 30);

  if (diffMins < 2) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return `${months}mo ago`;
}

function senderLabel(role: string): string {
  return role === 'DRIVER' ? 'You' : 'Dispatch';
}

export function DriverMessagesPreview({ messages }: DriverMessagesPreviewProps) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
        Recent Messages
      </p>

      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">No new messages.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className="bg-card rounded-lg border border-border p-3 flex items-start gap-3"
            >
              <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground shrink-0">
                {senderLabel(msg.senderRole)}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-foreground line-clamp-1">
                  {msg.body.length > 60 ? msg.body.slice(0, 60) + '…' : msg.body}
                </p>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">
                {relativeTime(msg.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/messages"
        className="mt-3 block text-sm text-primary font-medium hover:underline"
      >
        View all messages →
      </Link>
    </div>
  );
}
