export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getTenantById } from '@/app/(admin)/actions/tenants';
import { getSysAdminInvoices } from '@/app/(admin)/actions/sysadmin-invoices';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TenantStatusControls } from './tenant-status-controls';
import { TenantEditForm } from './tenant-edit-form';
import { OwnerEmailForm } from './owner-email-form';
import { ResendInvitationButton } from './resend-invitation-button';

function getStatusBadgeClasses(status: string): string {
  switch (status) {
    case 'DRAFT':
      return 'bg-gray-100 text-gray-700';
    case 'SENT':
      return 'bg-blue-100 text-blue-700';
    case 'PAID':
      return 'bg-green-100 text-green-700';
    case 'OVERDUE':
      return 'bg-red-100 text-red-700';
    case 'VOID':
      return 'bg-gray-100 text-gray-400';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

export default async function TenantDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let tenant: Awaited<ReturnType<typeof getTenantById>> | null = null;
  let fetchError: string | null = null;
  let billingHistory: Awaited<ReturnType<typeof getSysAdminInvoices>> = [];

  try {
    tenant = await getTenantById(id);
  } catch (err: any) {
    console.error('[TenantDetailPage] getTenantById error:', err);
    fetchError = err.message || 'Failed to load tenant';
  }

  if (!fetchError && tenant) {
    billingHistory = await getSysAdminInvoices({ tenantId: id }).catch(() => []);
  }

  if (fetchError || !tenant) {
    return (
      <div className="space-y-6">
        <Link href="/tenants" className="text-sm text-gray-500 hover:text-gray-700">
          ← All Tenants
        </Link>
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {fetchError || 'Tenant not found'}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Three-state status badge logic (same as tenant-list-client.tsx)
  let statusLabel: string;
  let statusClasses: string;

  if (!tenant.isActive) {
    statusLabel = 'Suspended';
    statusClasses = 'bg-red-100 text-red-800';
  } else if (!tenant.ownerSetupComplete) {
    statusLabel = 'Pending';
    statusClasses = 'bg-yellow-100 text-yellow-800';
  } else {
    statusLabel = 'Active';
    statusClasses = 'bg-green-100 text-green-800';
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/tenants" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        ← All Tenants
      </Link>

      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">{tenant.name}</h1>
        {tenant.slug && (
          <p className="mt-1 text-sm text-gray-500">/{tenant.slug}</p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Section 1 — Tenant Info */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Tenant Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Editable name + slug */}
            <TenantEditForm
              tenantId={tenant.id}
              initialName={tenant.name}
              initialSlug={tenant.slug ?? ''}
            />

            {/* Read-only metadata */}
            <div className="grid grid-cols-2 gap-4 text-sm border-t pt-4">
              <div>
                <p className="text-gray-500">Status</p>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${statusClasses}`}
                >
                  {statusLabel}
                </span>
              </div>
              <div>
                <p className="text-gray-500">Created</p>
                <p className="font-medium text-gray-900">
                  {new Date(tenant.createdAt).toLocaleDateString()}
                </p>
              </div>
            </div>

            {/* Owner info */}
            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-medium text-gray-700">Owner</p>
              {tenant.ownerUser ? (
                <div className="text-sm space-y-3">
                  <div className="space-y-0.5">
                    <p className="font-medium text-gray-900">
                      {tenant.ownerUser.firstName} {tenant.ownerUser.lastName}
                    </p>
                    <p className="text-gray-400 text-xs">
                      Account active since{' '}
                      {new Date(tenant.ownerUser.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <OwnerEmailForm
                    userId={tenant.ownerUser.id}
                    currentEmail={tenant.ownerUser.email}
                  />
                </div>
              ) : tenant.pendingOwnerInvitation ? (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-900">
                    {tenant.pendingOwnerInvitation.firstName} {tenant.pendingOwnerInvitation.lastName}
                  </p>
                  <p className="text-gray-500">{tenant.pendingOwnerInvitation.email}</p>
                  <p className="text-yellow-600 text-xs">
                    Invitation pending (expires{' '}
                    {new Date(tenant.pendingOwnerInvitation.expiresAt).toLocaleDateString()})
                  </p>
                  <ResendInvitationButton tenantId={tenant.id} />
                </div>
              ) : tenant.expiredOwnerInvitation ? (
                <div className="text-sm space-y-1">
                  <p className="font-medium text-gray-900">
                    {tenant.expiredOwnerInvitation.firstName} {tenant.expiredOwnerInvitation.lastName}
                  </p>
                  <p className="text-gray-500">{tenant.expiredOwnerInvitation.email}</p>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Expired
                    </span>
                    <span className="text-xs text-gray-400">
                      Expired on {new Date(tenant.expiredOwnerInvitation.expiresAt).toLocaleDateString()}
                    </span>
                  </div>
                  <ResendInvitationButton tenantId={tenant.id} />
                </div>
              ) : (
                <p className="text-sm text-gray-400">No owner configured</p>
              )}
            </div>

            {/* Resource counts */}
            <div className="border-t pt-4">
              <p className="mb-3 text-sm font-medium text-gray-700">Resources</p>
              <div className="grid grid-cols-3 gap-3">
                <div className="rounded-md bg-gray-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-gray-900">{tenant._count.users}</p>
                  <p className="text-xs text-gray-500">Users</p>
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-gray-900">{tenant._count.trucks}</p>
                  <p className="text-xs text-gray-500">Trucks</p>
                </div>
                <div className="rounded-md bg-gray-50 px-3 py-2 text-center">
                  <p className="text-lg font-bold text-gray-900">{tenant._count.routes}</p>
                  <p className="text-xs text-gray-500">Routes</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Section 2 — Suspension Controls */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Tenant Status</CardTitle>
          </CardHeader>
          <CardContent>
            <TenantStatusControls tenantId={tenant.id} isActive={tenant.isActive} />
          </CardContent>
        </Card>
      </div>

      {/* Billing History */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base font-semibold">Billing History</CardTitle>
          <Link
            href={`/billing/new?tenantId=${tenant.id}`}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            + New Invoice
          </Link>
        </CardHeader>
        <CardContent className="p-0">
          {billingHistory.length === 0 ? (
            <p className="px-6 py-8 text-center text-sm text-gray-400">
              No invoices for this tenant yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3">Invoice #</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Due Date</th>
                  <th className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {billingHistory.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-3 font-mono">
                      <Link
                        href={`/billing/${inv.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-3 text-gray-900">
                      {Number(inv.total).toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      })}
                    </td>
                    <td className="px-6 py-3 text-gray-500">
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClasses(inv.status)}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
