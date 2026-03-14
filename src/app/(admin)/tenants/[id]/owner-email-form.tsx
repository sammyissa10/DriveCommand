'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateOwnerEmail } from '@/app/(admin)/actions/tenants';

interface OwnerEmailFormProps {
  userId: string;
  currentEmail: string;
}

export function OwnerEmailForm({ userId, currentEmail }: OwnerEmailFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState(currentEmail);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showWarning, setShowWarning] = useState(false);

  const isDirty = email.trim().toLowerCase() !== currentEmail.toLowerCase();

  function handleSave() {
    setError(null);
    setSuccess(false);
    setShowWarning(false);
    startTransition(async () => {
      const result = await updateOwnerEmail(userId, email);
      if (result.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to update email');
      }
    });
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-500">Email (login)</label>
      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => { setEmail(e.target.value); setSuccess(false); setShowWarning(false); }}
          disabled={isPending}
          className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
        />
        {isDirty && !showWarning && (
          <button
            type="button"
            onClick={() => setShowWarning(true)}
            className="rounded-md bg-blue-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 transition-colors whitespace-nowrap"
          >
            Change
          </button>
        )}
      </div>

      {showWarning && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 space-y-2">
          <p className="text-xs text-amber-800 font-medium">
            This will change the owner&apos;s login email to <strong>{email}</strong>. They will be notified at their old address. Are you sure?
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={isPending}
              className="rounded-md bg-amber-600 px-3 py-1 text-xs font-medium text-white hover:bg-amber-700 disabled:opacity-60 transition-colors"
            >
              {isPending ? 'Saving...' : 'Yes, update email'}
            </button>
            <button
              type="button"
              onClick={() => { setShowWarning(false); setEmail(currentEmail); }}
              className="rounded-md border border-gray-300 px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {error && (
        <p className="text-xs text-red-600">{error}</p>
      )}
      {success && (
        <p className="text-xs text-green-600">Email updated successfully. Notification sent to old address.</p>
      )}
    </div>
  );
}
