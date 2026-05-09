'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { toast } from 'sonner';

interface CopyTenantIdButtonProps {
  tenantId: string;
}

export function CopyTenantIdButton({ tenantId }: CopyTenantIdButtonProps) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(tenantId).then(() => {
      toast.success('Tenant ID copied!');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.error('Failed to copy. Please try again.');
    });
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded"
      aria-label="Copy tenant ID"
    >
      {copied ? (
        <Check className="h-4 w-4 text-green-500" />
      ) : (
        <Copy className="h-4 w-4" />
      )}
    </button>
  );
}
