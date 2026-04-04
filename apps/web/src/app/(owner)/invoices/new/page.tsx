import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { createInvoice } from '@/app/(owner)/actions/invoices';
import { InvoiceForm } from '@/components/invoices/invoice-form';

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ loadId?: string; customerId?: string; amount?: string; loadNumber?: string }>;
}) {
  const params = await searchParams;
  const { loadId, customerId, amount, loadNumber } = params;

  let customers: Array<{ id: string; companyName: string }> = [];
  let loads: Array<{ id: string; loadNumber: string; customerId: string; status: string }> = [];
  let nextInvoiceNumber = 'INV-0001';

  try {
    const prisma = await getTenantPrisma();

    [customers, loads] = await Promise.all([
      prisma.customer.findMany({
        select: { id: true, companyName: true },
        orderBy: { companyName: 'asc' },
      }),
      prisma.load.findMany({
        where: { archivedAt: null },
        select: { id: true, loadNumber: true, customerId: true, status: true },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

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

  // Fetch freight details from load if loadId is provided
  let loadFreightData: {
    commodity?: string;
    weightLbs?: number;
  } | null = null;

  if (loadId) {
    try {
      const prisma = await getTenantPrisma();
      const load = await prisma.load.findUnique({
        where: { id: loadId },
        select: { commodity: true, weight: true },
      });
      if (load) {
        loadFreightData = {
          commodity: load.commodity || undefined,
          weightLbs: load.weight || undefined,
        };
      }
    } catch {
      // Skip auto-populate on error
    }
  }

  // Build pre-fill initialData from query params (load context) + load freight fields
  const initialData = loadId
    ? {
        customerId: customerId || undefined,
        commodity: loadFreightData?.commodity,
        weightLbs: loadFreightData?.weightLbs,
        items: amount
          ? [
              {
                description: loadNumber ? `Freight - Load #${loadNumber}` : 'Linehaul',
                quantity: 1,
                unitPrice: parseFloat(amount) || 0,
                itemType: 'LINEHAUL' as const,
                unitType: 'FLAT' as const,
              },
            ]
          : undefined,
      }
    : undefined;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={loadId ? `/loads/${loadId}` : '/invoices'}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          {loadId ? 'Back to Load' : 'Back to Invoices'}
        </Link>
      </div>
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">New Invoice</h1>
        <p className="mt-1 text-muted-foreground">Create a new invoice with line items</p>
      </div>
      <InvoiceForm
        action={createInvoice}
        customers={customers}
        loads={loads}
        nextInvoiceNumber={nextInvoiceNumber}
        submitLabel="Create Invoice"
        initialData={initialData}
        loadId={loadId}
        loadNumber={loadNumber}
      />
    </div>
  );
}
