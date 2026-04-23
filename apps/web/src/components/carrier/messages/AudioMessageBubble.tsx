'use client';

import { useState, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AudioMessageBubbleProps {
  messageId: string;
  isOwn: boolean;
}

type BubbleState = 'loading' | 'error' | 'ready';

export function AudioMessageBubble({ messageId, isOwn }: AudioMessageBubbleProps) {
  const [state, setState] = useState<BubbleState>('loading');
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchAudioUrl() {
      try {
        const res = await fetch(`/api/v1/messages/${messageId}/audio-url`);
        if (!res.ok) {
          if (!cancelled) setState('error');
          return;
        }
        const data = await res.json() as { url: string };
        if (!cancelled) {
          setSignedUrl(data.url);
          setState('ready');
        }
      } catch {
        if (!cancelled) setState('error');
      }
    }

    fetchAudioUrl();
    return () => { cancelled = true; };
  }, [messageId]);

  if (state === 'loading') {
    return (
      <div
        className={cn(
          'px-4 py-2 rounded-2xl',
          isOwn ? 'rounded-br-sm bg-primary' : 'rounded-bl-sm bg-muted'
        )}
      >
        <div className="h-8 w-32 animate-pulse rounded bg-current opacity-20" />
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div
        className={cn(
          'px-4 py-2 rounded-2xl text-sm',
          isOwn
            ? 'rounded-br-sm bg-primary text-primary-foreground'
            : 'rounded-bl-sm bg-muted text-muted-foreground'
        )}
      >
        Audio unavailable
      </div>
    );
  }

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-2 rounded-2xl',
        isOwn
          ? 'rounded-br-sm bg-primary text-primary-foreground'
          : 'rounded-bl-sm bg-muted text-foreground'
      )}
    >
      <Mic className="h-4 w-4 shrink-0 opacity-70" />
      {signedUrl && (
        <audio
          src={signedUrl}
          controls
          preload="none"
          className="h-8 max-w-[200px]"
        />
      )}
    </div>
  );
}
