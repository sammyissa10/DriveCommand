'use client';

import Link from 'next/link';
import { Receipt } from 'lucide-react';

interface InvoiceItem {
  id: string;
  amount: any;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string | null;
  amount: any;
  tax: any;
  totalAmount: any;
  status: string;
  issueDate: Date;
  dueDate: Date;
  paidDate: Date | null;
  items: InvoiceItem[];
}

const statusColors: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-700',
  SENT: 'bg-blue-100 text-blue-700',
  PAID: 'bg-green-100 text-green-700',
  OVERDUE: 'bg-red-100 text-red-700',
  CANCELLED: 'bg-gray-100 text-gray-400 line-through',
};

export function InvoiceList({ invoices }: { invoices: Invoice[] }) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-card p-12 text-center">
        <Receipt className="mx-auto h-12 w-12 text-muted-foreground/50" />
        <h3 className="mt-4 text-lg font-semibold">No invoices yet</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Create your first invoice to start tracking billing.
        </p>
        <Link
          href="/invoices/new"
          className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          New Invoice
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/50">
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Invoice #</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Amount</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Tax</th>
              <th className="px-4 py-3 text-right font-medium text-muted-foreground">Total</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Issue Date</th>
              <th className="px-4 py-3 text-left font-medium text-muted-foreground">Due Date</th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((invoice) => (
              <tr
                key={invoice.id}
                className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
              >
                <td className="px-4 py-3">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="font-medium text-foreground hover:text-primary transition-colors"
                  >
                    {invoice.invoiceNumber}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusColors[invoice.status]}`}
                  >
                    {invoice.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  ${Number(invoice.amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right text-muted-foreground">
                  ${Number(invoice.tax).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-right font-medium">
                  ${Number(invoice.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(invoice.issueDate).toLocaleDateString()}
                </td>
                <td className="px-4 py-3 text-muted-foreground">
                  {new Date(invoice.dueDate).toLocaleDateString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
