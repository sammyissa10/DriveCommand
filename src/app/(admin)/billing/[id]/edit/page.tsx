import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSysAdminInvoiceById } from '@/app/(admin)/actions/sysadmin-invoices';
import { EditInvoiceForm } from './edit-invoice-form';

export default async function EditInvoicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const invoice = await getSysAdminInvoiceById(id);

  if (!invoice) {
    redirect('/billing');
  }

  if (invoice.status !== 'DRAFT') {
    redirect('/billing/' + id);
  }

  return (
    <div className="space-y-6">
      <Link
        href={`/billing/${id}`}
        className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
      >
        ← {invoice.invoiceNumber}
      </Link>

      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">
          Edit Invoice
        </h1>
        <p className="mt-1 text-sm text-gray-500 font-mono">{invoice.invoiceNumber}</p>
      </div>

      <EditInvoiceForm invoice={invoice} />
    </div>
  );
}
