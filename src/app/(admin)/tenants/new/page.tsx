'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createTenant } from '@/app/(admin)/actions/tenants';

/**
 * Create tenant form page (client component).
 * Handles form submission and validation errors.
 */
export default function NewTenantPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    const formData = new FormData(event.currentTarget);

    try {
      const result = await createTenant(formData);

      if (result.success) {
        router.push('/tenants');
      } else if ('error' in result && result.error) {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl">
      {/* Page Header */}
      <div className="mb-6">
        <Link
          href="/tenants"
          className="text-gray-600 hover:text-gray-900 font-medium mb-2 inline-block"
        >
          ← Back to Tenants
        </Link>
        <h1 className="text-3xl font-bold text-gray-900">Create Tenant</h1>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md">
              {error}
            </div>
          )}

          {/* Name Field */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-1">
              Tenant Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="name"
              name="name"
              required
              placeholder="Acme Logistics"
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
            />
          </div>

          {/* Slug Field */}
          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-1">
              Slug <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              id="slug"
              name="slug"
              required
              placeholder="acme-logistics"
              className="w-full border border-gray-300 rounded-md px-4 py-2 focus:ring-2 focus:ring-gray-500 focus:border-gray-500"
            />
            <p className="text-sm text-gray-500 mt-1">
              Lowercase letters, numbers, and hyphens only
            </p>
          </div>

          {/* Form Actions */}
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-gray-900 text-white px-6 py-2 rounded-md hover:bg-gray-800 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'Creating...' : 'Create Tenant'}
            </button>
            <Link
              href="/tenants"
              className="px-6 py-2 border border-gray-300 rounded-md hover:bg-gray-50 font-medium inline-block"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
