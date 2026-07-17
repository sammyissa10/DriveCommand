import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { updateInvoice } from '@/app/(owner)/actions/invoices';
import { InvoiceForm } from '@/components/invoices/invoice-form';
import { InvoiceFormMobile } from '@/components/invoices/InvoiceFormMobile';

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

  // Shared initialData for both the mobile-ds and desktop forms. Prisma Decimal
  // fields (tax + line-item amounts) are converted to plain numbers — Decimals
  // can't cross the Server→Client boundary into the form components.
  const initialData = {
    customerId: invoice.customerId,
    routeId: invoice.routeId,
    invoiceNumber: invoice.invoiceNumber,
    tax: Number(invoice.tax),
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    notes: invoice.notes,
    bolNumber: invoice.bolNumber,
    proNumber: invoice.proNumber,
    poNumber: invoice.poNumber,
    commodity: invoice.commodity,
    weightLbs: invoice.weightLbs,
    pieces: invoice.pieces,
    loadedMiles: invoice.loadedMiles ? Number(invoice.loadedMiles) : null,
    items: invoice.items.map((item) => ({
      description: item.description,
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      amount: Number(item.amount),
      itemType: item.itemType,
      unitType: item.unitType,
    })),
  };

  return (
    <>
      {/* Mobile-web design system view (phone widths only) */}
      <div className="lg:hidden -m-4">
        <InvoiceFormMobile
          action={boundAction}
          title="Edit Invoice"
          backHref={`/invoices/${id}`}
          submitLabel="Update Invoice"
          customers={customers}
          initialData={initialData}
        />
      </div>

      {/* Desktop view (lg and up) — unchanged */}
      <div className="hidden lg:block space-y-6">
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
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">Edit Invoice</h1>
          <p className="mt-1 text-muted-foreground">Update {invoice.invoiceNumber}</p>
        </div>
        <InvoiceForm
          action={boundAction}
          initialData={initialData}
          customers={customers}
          submitLabel="Update Invoice"
        />
      </div>
    </>
  );
}
