import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { updateInvoice } from '@/app/(owner)/actions/invoices';
import { InvoiceForm } from '@/components/invoices/invoice-form';

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const prisma = await getTenantPrisma();

  let invoice;
  try {
    invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true },
    });
  } catch {
    notFound();
  }

  if (!invoice) {
    notFound();
  }

  let customers: Array<{ id: string; companyName: string }> = [];
  try {
    customers = await prisma.customer.findMany({
      select: { id: true, companyName: true },
      orderBy: { companyName: 'asc' },
    });
  } catch {
    // Use empty array on failure
  }

  const boundAction = updateInvoice.bind(null, id);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/invoices/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Invoice
        </Link>
      </div>
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">Edit Invoice</h1>
        <p className="mt-1 text-muted-foreground">Update {invoice.invoiceNumber}</p>
      </div>
      <InvoiceForm
        action={boundAction}
        initialData={{
          customerId: invoice.customerId,
          routeId: invoice.routeId,
          invoiceNumber: invoice.invoiceNumber,
          tax: invoice.tax,
          status: invoice.status,
          issueDate: invoice.issueDate,
          dueDate: invoice.dueDate,
          notes: invoice.notes,
          items: invoice.items.map((item) => ({
            description: item.description,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            amount: item.amount,
          })),
        }}
        customers={customers}
        submitLabel="Update Invoice"
      />
    </div>
  );
}
