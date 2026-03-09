'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { suspendTenant, reactivateTenant } from '@/app/(admin)/actions/tenants';

interface TenantStatusControlsProps {
  tenantId: string;
  isActive: boolean;
}

export function TenantStatusControls({ tenantId, isActive }: TenantStatusControlsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const handleSuspend = () => {
    setError(null);
    startTransition(async () => {
      try {
        await suspendTenant(tenantId);
        router.refresh();
      } catch (err: any) {
        setError(err.message || 'Failed to suspend tenant');
      }
    });
  };

  const handleReactivate = () => {
    setError(null);
    startTransition(async () => {
      try {
        await reactivateTenant(tenantId);
        router.refresh();
      } catch (err: any) {
        setError(err.message || 'Failed to reactivate tenant');
      }
    });
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {isActive ? (
        <button
          onClick={handleSuspend}
          disabled={isPending}
          className="inline-flex items-center rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Suspending...' : 'Suspend Tenant'}
        </button>
      ) : (
        <button
          onClick={handleReactivate}
          disabled={isPending}
          className="inline-flex items-center rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-green-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Reactivating...' : 'Reactivate Tenant'}
        </button>
      )}
      <p className="text-xs text-gray-500">
        {isActive
          ? 'Suspending will prevent all users from accessing this tenant.'
          : 'Reactivating will restore access for all users in this tenant.'}
      </p>
    </div>
  );
}
