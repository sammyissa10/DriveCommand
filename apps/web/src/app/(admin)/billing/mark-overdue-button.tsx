'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { markOverdueInvoices } from '@/app/(admin)/actions/sysadmin-invoices';

export function MarkOverdueButton() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function handleClick() {
    if (!window.confirm('Mark all past-due SENT invoices as OVERDUE?')) return;
    setStatus('running');
    setMessage(null);
    try {
      const result = await markOverdueInvoices();
      setStatus('done');
      setMessage(`${result.count} invoice${result.count !== 1 ? 's' : ''} marked overdue.`);
      router.refresh();
    } catch (err: unknown) {
      setStatus('error');
      setMessage(err instanceof Error ? err.message : 'Failed to mark overdue invoices');
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={handleClick}
        disabled={status === 'running'}
        className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {status === 'running' ? 'Running…' : 'Mark Overdue'}
      </button>
      {message && (
        <span
          className={`text-sm ${status === 'error' ? 'text-red-600' : 'text-green-600'}`}
        >
          {message}
        </span>
      )}
    </div>
  );
}
