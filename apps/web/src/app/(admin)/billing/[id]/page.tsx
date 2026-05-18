export const dynamic = 'force-dynamic';

import Link from 'next/link';
import { getSysAdminInvoiceById } from '@/app/(admin)/actions/sysadmin-invoices';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { InvoiceActions } from './invoice-actions';
import { AuditTrailFooter } from '@/components/audit-trail-footer';
import { prisma } from '@/lib/db/prisma';

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

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const [invoice, invoiceAudit] = await Promise.all([
    getSysAdminInvoiceById(id),
    prisma.sysAdminInvoice.findUnique({
      where: { id },
      select: {
        createdBy: { select: { firstName: true, lastName: true, email: true } },
        updatedBy: { select: { firstName: true, lastName: true, email: true } },
        createdAt: true,
        updatedAt: true,
      },
    }).catch(() => null),
  ]);

  if (!invoice) {
    return (
      <div className="space-y-6">
        <Link href="/billing" className="text-sm text-gray-500 hover:text-gray-700">
          ← All Invoices
        </Link>
        <Card>
          <CardContent className="pt-6">
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              Invoice not found
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const ownerContact = invoice.ownerUser
    ? `${invoice.ownerUser.firstName} ${invoice.ownerUser.lastName} — ${invoice.ownerUser.email}`
    : 'No owner found';

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link href="/billing" className="text-sm text-gray-500 hover:text-gray-700 transition-colors">
        ← All Invoices
      </Link>

      {/* Page header */}
      <div className="flex items-center gap-4 flex-wrap">
        <h1 className="text-2xl font-bold tracking-tight font-mono text-gray-900">
          {invoice.invoiceNumber}
        </h1>
        <span
          className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${getStatusBadgeClasses(invoice.status)}`}
        >
          {invoice.status}
        </span>
        {invoice.isRecurring && (
          <span className="inline-flex items-center rounded-full bg-purple-100 px-2.5 py-0.5 text-xs font-medium text-purple-700">
            Recurring
          </span>
        )}
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Tenant</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-gray-500">Name</p>
              <p className="font-medium text-gray-900">{invoice.tenant.name}</p>
            </div>
            <div>
              <p className="text-gray-500">Owner Contact</p>
              <p className="font-medium text-gray-900">{ownerContact}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold">Invoice Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div>
              <p className="text-gray-500">Issue Date</p>
              <p className="font-medium text-gray-900">
                {new Date(invoice.issueDate).toLocaleDateString()}
              </p>
            </div>
            <div>
              <p className="text-gray-500">Due Date</p>
              <p className="font-medium text-gray-900">
                {new Date(invoice.dueDate).toLocaleDateString()}
              </p>
            </div>
            {invoice.billingPeriodStart && invoice.billingPeriodEnd && (
              <div>
                <p className="text-gray-500">Billing Period</p>
                <p className="font-medium text-gray-900">
                  {new Date(invoice.billingPeriodStart).toLocaleDateString()} — {new Date(invoice.billingPeriodEnd).toLocaleDateString()}
                </p>
              </div>
            )}
            {invoice.notes && (
              <div>
                <p className="text-gray-500">Notes</p>
                <p className="font-medium text-gray-900">{invoice.notes}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Line items table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold">Line Items</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="px-6 py-3">Description</th>
                <th className="px-6 py-3 text-right">Qty</th>
                <th className="px-6 py-3 text-right">Unit Price</th>
                <th className="px-6 py-3 text-right">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoice.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-6 py-4 text-gray-900">{item.description}</td>
                  <td className="px-6 py-4 text-right text-gray-700">{item.quantity.toString()}</td>
                  <td className="px-6 py-4 text-right text-gray-700">
                    {Number(item.unitPrice).toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    })}
                  </td>
                  <td className="px-6 py-4 text-right text-gray-900">
                    {Number(item.amount).toLocaleString('en-US', {
                      style: 'currency',
                      currency: 'USD',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td colSpan={3} className="px-6 py-4 text-right font-semibold text-gray-900">
                  Total
                </td>
                <td className="px-6 py-4 text-right font-bold text-gray-900">
                  {Number(invoice.total).toLocaleString('en-US', {
                    style: 'currency',
                    currency: 'USD',
                  })}
                </td>
              </tr>
            </tfoot>
          </table>
        </CardContent>
      </Card>

      {/* Actions */}
      <InvoiceActions invoice={{ id: invoice.id, status: invoice.status }} />

      {invoiceAudit && (
        <AuditTrailFooter
          createdAt={invoiceAudit.createdAt}
          createdByName={invoiceAudit.createdBy ? `${invoiceAudit.createdBy.firstName ?? ''} ${invoiceAudit.createdBy.lastName ?? ''}`.trim() || null : null}
          createdByEmail={invoiceAudit.createdBy?.email ?? null}
          updatedAt={invoiceAudit.updatedAt}
          updatedByName={invoiceAudit.updatedBy ? `${invoiceAudit.updatedBy.firstName ?? ''} ${invoiceAudit.updatedBy.lastName ?? ''}`.trim() || null : null}
          updatedByEmail={invoiceAudit.updatedBy?.email ?? null}
        />
      )}
    </div>
  );
}
