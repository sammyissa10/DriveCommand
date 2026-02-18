import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { createInvoice } from '@/app/(owner)/actions/invoices';
import { InvoiceForm } from '@/components/invoices/invoice-form';

export default async function NewInvoicePage() {
  let customers: Array<{ id: string; companyName: string }> = [];
  let nextInvoiceNumber = 'INV-0001';

  try {
    const prisma = await getTenantPrisma();

    customers = await prisma.customer.findMany({
      select: { id: true, companyName: true },
      orderBy: { companyName: 'asc' },
    });

    // Auto-generate next invoice number
    const latestInvoice = await prisma.invoice.findFirst({
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });

    if (latestInvoice?.invoiceNumber) {
      const match = latestInvoice.invoiceNumber.match(/(\d+)$/);
      if (match) {
        const nextNum = parseInt(match[1]) + 1;
        nextInvoiceNumber = `INV-${String(nextNum).padStart(4, '0')}`;
      }
    }
  } catch {
    // Use defaults on error
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
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">New Invoice</h1>
        <p className="mt-1 text-muted-foreground">Create a new invoice with line items</p>
      </div>
      <InvoiceForm
        action={createInvoice}
        customers={customers}
        nextInvoiceNumber={nextInvoiceNumber}
        submitLabel="Create Invoice"
      />
    </div>
  );
}
