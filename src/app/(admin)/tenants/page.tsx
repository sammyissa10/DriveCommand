import Link from 'next/link';
import { getAllTenants } from '@/app/(admin)/actions/tenants';
import { TenantListClient } from './tenant-list-client';

/**
 * Tenant management page (server component).
 * Fetches all tenants and passes to client component for display.
 */
export default async function TenantsPage() {
  const tenants = await getAllTenants();

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Tenant Management</h1>
          <p className="text-gray-600 mt-1">Manage all platform tenants</p>
        </div>
        <Link
          href="/tenants/new"
          className="bg-gray-900 text-white px-4 py-2 rounded-md hover:bg-gray-800 font-medium"
        >
          Create Tenant
        </Link>
      </div>

      {/* Tenant List */}
      <TenantListClient tenants={tenants} />
    </div>
  );
}
