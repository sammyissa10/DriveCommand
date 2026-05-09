export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getSysAdminInvoices } from '@/app/(admin)/actions/sysadmin-invoices';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Decimal } from 'decimal.js';
import { MarkOverdueButton } from './mark-overdue-button';
import { logger } from '@/lib/logger';

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

export default async function BillingPage() {
  let invoices: Awaited<ReturnType<typeof getSysAdminInvoices>> = [];
  let fetchError: string | null = null;

  try {
    invoices = await getSysAdminInvoices();
  } catch (err: unknown) {
    logger.error('[BillingPage] getSysAdminInvoices error:', err);
    fetchError = err instanceof Error ? err.message : 'Failed to load invoices';
  }

  // Derive summary stats
  const unpaidCount = invoices.filter(
    (inv) => inv.status === 'DRAFT' || inv.status === 'SENT',
  ).length;

  const overdueCount = invoices.filter((inv) => inv.status === 'OVERDUE').length;

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  let paidThisMonthDecimal = new Decimal(0);
  for (const inv of invoices) {
    if (inv.status === 'PAID' && inv.paidAt && new Date(inv.paidAt) >= startOfMonth) {
      paidThisMonthDecimal = paidThisMonthDecimal.plus(new Decimal(inv.total.toString()));
    }
  }
  const paidThisMonth = Number(paidThisMonthDecimal.toFixed(2)).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Billing</h1>
        <p className="mt-1 text-sm text-gray-500">
          Invoice tenants for subscription and setup fees
        </p>
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <MarkOverdueButton />
        <Link
          href="/billing/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700"
        >
          New Invoice
        </Link>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Unpaid Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-900">{unpaidCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Overdue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{overdueCount}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-500">Paid This Month</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{paidThisMonth}</div>
          </CardContent>
        </Card>
      </div>

      {/* Error state */}
      {fetchError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {fetchError}
        </div>
      )}

      {/* Invoice table */}
      <Card>
        <CardContent className="p-0">
          {invoices.length === 0 && !fetchError ? (
            <div className="px-6 py-12 text-center text-sm text-gray-500">
              No invoices yet.{' '}
              <Link href="/billing/new" className="text-blue-600 hover:underline">
                Create the first one.
              </Link>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-6 py-3">Invoice #</th>
                  <th className="px-6 py-3">Tenant</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Amount</th>
                  <th className="px-6 py-3">Due Date</th>
                  <th className="px-6 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-mono">
                      <Link
                        href={`/billing/${inv.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="px-6 py-4 text-gray-900">{inv.tenant.name}</td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClasses(inv.status)}`}
                      >
                        {inv.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-gray-900">
                      {Number(inv.total).toLocaleString('en-US', {
                        style: 'currency',
                        currency: 'USD',
                      })}
                    </td>
                    <td className="px-6 py-4 text-gray-500">
                      {new Date(inv.dueDate).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4">
                      <Link
                        href={`/billing/${inv.id}`}
                        className="text-blue-600 hover:underline text-sm"
                      >
                        View
                      </Link>
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
