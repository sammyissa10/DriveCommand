'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { resendOwnerInvitation } from '@/app/(admin)/actions/tenants';

interface ResendInvitationButtonProps {
  tenantId: string;
}

export function ResendInvitationButton({ tenantId }: ResendInvitationButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [emailWarning, setEmailWarning] = useState<string | null>(null);

  const handleResend = () => {
    setError(null);
    setEmailWarning(null);
    startTransition(async () => {
      const result = await resendOwnerInvitation(tenantId);
      if (result.success) {
        setStatus('success');
        if ('emailWarning' in result && result.emailWarning) {
          setEmailWarning(result.emailWarning);
        }
        router.refresh();
        setTimeout(() => setStatus('idle'), 3000);
      } else {
        setStatus('error');
        setError(result.error || 'Failed to resend invitation');
      }
    });
  };

  return (
    <div className="space-y-2">
      {status === 'error' && error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {emailWarning && (
        <div className="rounded-md border border-yellow-200 bg-yellow-50 px-4 py-2 text-sm text-yellow-700">
          {emailWarning}
        </div>
      )}
      <button
        onClick={handleResend}
        disabled={isPending}
        className={`inline-flex items-center rounded-md px-3 py-1.5 text-xs font-medium text-white shadow-sm disabled:opacity-60 disabled:cursor-not-allowed transition-colors ${
          status === 'success'
            ? 'bg-green-600'
            : 'bg-blue-600 hover:bg-blue-700'
        }`}
      >
        {isPending ? 'Sending...' : status === 'success' ? 'Invitation Sent!' : 'Resend Invitation'}
      </button>
    </div>
  );
}
