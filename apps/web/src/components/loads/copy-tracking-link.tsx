'use client';

import { Link2 } from 'lucide-react';
import { toast } from 'sonner';

interface CopyTrackingLinkButtonProps {
  token: string;
}

export function CopyTrackingLinkButton({ token }: CopyTrackingLinkButtonProps) {
  function handleCopy() {
    const url = `${window.location.origin}/track/${token}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('Tracking link copied!');
    }).catch(() => {
      toast.error('Failed to copy link. Please try again.');
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
    >
      <Link2 className="h-4 w-4" />
      Copy Tracking Link
    </button>
  );
}
