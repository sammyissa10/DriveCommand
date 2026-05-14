'use client';

import { useEffect, useRef, useState } from 'react';
import { Skeleton } from '@/components/ui/skeleton';
import { renderNotificationTemplatePreview } from '@/app/(admin)/actions/notifications';
import type { VariableDef } from '@/lib/notifications/types';

interface SandboxedPreviewProps {
  blockJson: unknown;
  subject: string;
  availableVariables: VariableDef[];
}

/**
 * Live sandboxed preview of a notification template.
 *
 * Debounces 250ms then calls the renderNotificationTemplatePreview server action
 * and writes the resulting HTML string into an iframe via srcDoc.
 * Sandboxed to prevent scripts from running in the preview.
 */
export function SandboxedPreview({ blockJson, subject, availableVariables }: SandboxedPreviewProps) {
  const [html, setHtml] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const result = await renderNotificationTemplatePreview(
          blockJson,
          subject,
          availableVariables.map((v) => ({ name: v.name, sampleValue: v.sampleValue })),
        );
        setHtml(result.html);
      } catch (err) {
        console.error('[SandboxedPreview] render failed', err);
        setHtml('<p style="color:red;padding:1rem;">Preview render failed.</p>');
      } finally {
        setLoading(false);
      }
    }, 250);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [blockJson, subject]);

  return (
    <div className="flex flex-col h-full">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Preview
      </p>
      {loading ? (
        <div className="flex flex-col gap-2 flex-1">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ) : (
        <iframe
          sandbox="allow-same-origin"
          srcDoc={html || '<p style="padding:1rem;color:#999;">Preview will appear here</p>'}
          style={{ width: '100%', height: '100%', border: 'none', flex: 1 }}
          title="Template preview"
        />
      )}
    </div>
  );
}
