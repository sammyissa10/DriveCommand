'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { updateTenant } from '@/app/(admin)/actions/tenants';

interface TenantEditFormProps {
  tenantId: string;
  initialName: string;
  initialSlug: string;
}

export function TenantEditForm({ tenantId, initialName, initialSlug }: TenantEditFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(initialSlug);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty = name !== initialName || slug !== initialSlug;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(false);
    startTransition(async () => {
      const result = await updateTenant(tenantId, { name, slug });
      if (result.success) {
        setSuccess(true);
        router.refresh();
      } else {
        setError(result.error ?? 'Failed to update tenant');
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}
      {success && (
        <div className="rounded-md border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-700">
          Tenant updated successfully.
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="tenant-name" className="block text-xs font-medium text-gray-500 mb-1">
            Name
          </label>
          <input
            id="tenant-name"
            type="text"
            value={name}
            onChange={(e) => { setName(e.target.value); setSuccess(false); }}
            disabled={isPending}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            required
          />
        </div>
        <div>
          <label htmlFor="tenant-slug" className="block text-xs font-medium text-gray-500 mb-1">
            Slug
          </label>
          <input
            id="tenant-slug"
            type="text"
            value={slug}
            onChange={(e) => { setSlug(e.target.value); setSuccess(false); }}
            disabled={isPending}
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-900 font-mono shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60"
            required
          />
          <p className="mt-1 text-xs text-gray-400">Lowercase letters, numbers, hyphens only</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={isPending || !isDirty}
          className="rounded-md bg-blue-600 px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Saving...' : 'Save Changes'}
        </button>
      </div>
    </form>
  );
}
