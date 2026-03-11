'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  markInvoicePaid,
  voidInvoice,
  archiveInvoice,
} from '@/app/(admin)/actions/sysadmin-invoices';

interface Props {
  invoice: {
    id: string;
    status: string;
  };
}

export function InvoiceActions({ invoice }: Props) {
  const router = useRouter();

  async function handleMarkPaid() {
    if (!window.confirm('Mark this invoice as paid?')) return;
    const result = await markInvoicePaid(invoice.id);
    if (!result.success) {
      alert('Error: ' + result.error);
      return;
    }
    router.refresh();
  }

  async function handleVoid() {
    if (!window.confirm('Void this invoice? This cannot be undone.')) return;
    const result = await voidInvoice(invoice.id);
    if (!result.success) {
      alert('Error: ' + result.error);
      return;
    }
    router.refresh();
  }

  async function handleArchive() {
    if (!window.confirm('Archive this invoice? It will no longer appear in the billing list.')) return;
    const result = await archiveInvoice(invoice.id);
    if (!result.success) {
      alert('Error: ' + result.error);
      return;
    }
    router.push('/billing');
  }

  if (invoice.status === 'DRAFT') {
    return (
      <div className="flex items-center gap-3">
        <button
          disabled
          className="rounded-md border border-gray-200 bg-gray-50 px-4 py-2 text-sm font-medium text-gray-400 cursor-not-allowed"
          title="Email sending will be available in Plan 03"
        >
          Send Invoice — configure email in Plan 03
        </button>
        <Link
          href={`/billing/${invoice.id}/edit`}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Edit
        </Link>
        <button
          onClick={handleArchive}
          className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Archive
        </button>
      </div>
    );
  }

  if (invoice.status === 'SENT' || invoice.status === 'OVERDUE') {
    return (
      <div className="flex items-center gap-3">
        <button
          onClick={handleMarkPaid}
          className="rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700"
        >
          Mark as Paid
        </button>
        <button
          onClick={handleVoid}
          className="rounded-md border border-red-200 bg-white px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
        >
          Void Invoice
        </button>
      </div>
    );
  }

  if (invoice.status === 'PAID') {
    return (
      <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700">
        This invoice has been paid.
      </div>
    );
  }

  if (invoice.status === 'VOID') {
    return (
      <div className="rounded-md border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-500">
        This invoice has been voided.
      </div>
    );
  }

  return null;
}
