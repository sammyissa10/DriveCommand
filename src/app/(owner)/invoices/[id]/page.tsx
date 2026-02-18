import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Pencil } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { deleteInvoice } from '@/app/(owner)/actions/invoices';
import { DeleteInvoiceButton } from '@/components/invoices/delete-invoice-button';

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prisma = await getTenantPrisma();

  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      items: true,
      tenant: false,
    },
  });

  if (!invoice) {
    notFound();
  }

  // Try to get customer name if linked
  let customerName: string | null = null;
  if (invoice.customerId) {
    try {
      const customer = await prisma.customer.findUnique({
        where: { id: invoice.customerId },
        select: { companyName: true },
      });
      customerName = customer?.companyName || null;
    } catch {
      // Ignore
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoices
        </Link>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            {invoice.invoiceNumber}
          </h1>
          <div className="mt-2">
            <span
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[invoice.status]}`}
            >
              {invoice.status}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/invoices/${id}/edit`}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-4 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-accent transition-colors"
          >
            <Pencil className="h-4 w-4" />
            Edit
          </Link>
          <DeleteInvoiceButton
            invoiceId={id}
            status={invoice.status}
            deleteAction={deleteInvoice}
          />
        </div>
      </div>

      {/* Invoice info */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1 space-y-6">
          <div className="rounded-lg border border-border bg-card p-5">
            <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-4">
              Invoice Details
            </h3>
            <dl className="space-y-3 text-sm">
              {customerName && (
                <div>
                  <dt className="text-muted-foreground">Customer</dt>
                  <dd className="font-medium">{customerName}</dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Issue Date</dt>
                <dd className="font-medium">
                  {new Date(invoice.issueDate).toLocaleDateString()}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Due Date</dt>
                <dd className="font-medium">
                  {new Date(invoice.dueDate).toLocaleDateString()}
                </dd>
              </div>
              {invoice.paidDate && (
                <div>
                  <dt className="text-muted-foreground">Paid Date</dt>
                  <dd className="font-medium text-green-600">
                    {new Date(invoice.paidDate).toLocaleDateString()}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-muted-foreground">Status</dt>
                <dd>
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[invoice.status]}`}
                  >
                    {invoice.status}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          {invoice.notes && (
            <div className="rounded-lg border border-border bg-card p-5">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Notes
              </h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}
        </div>

        {/* Line items and totals */}
        <div className="lg:col-span-2">
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
                Line Items
              </h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-muted/50">
                    <th className="px-4 py-3 text-left font-medium text-muted-foreground">
                      Description
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">Qty</th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Unit Price
                    </th>
                    <th className="px-4 py-3 text-right font-medium text-muted-foreground">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {invoice.items.map((item) => (
                    <tr
                      key={item.id}
                      className="border-b border-border last:border-b-0"
                    >
                      <td className="px-4 py-3">{item.description}</td>
                      <td className="px-4 py-3 text-right">{Number(item.quantity)}</td>
                      <td className="px-4 py-3 text-right">
                        ${Number(item.unitPrice).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-4 py-3 text-right font-medium">
                        ${Number(item.amount).toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Totals */}
            <div className="px-5 py-4 border-t border-border space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-medium">
                  ${Number(invoice.amount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Tax</span>
                <span className="font-medium">
                  ${Number(invoice.tax).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold border-t border-border pt-2">
                <span>Total</span>
                <span>
                  ${Number(invoice.totalAmount).toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
