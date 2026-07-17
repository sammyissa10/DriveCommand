'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  FieldGroup,
  StatusPill,
  SheetContainer,
  type FieldDef,
  type StatusTone,
} from '@/components/ui/ds';
import { markInvoicePaid, deleteInvoice } from '@/app/(owner)/actions/invoices';

export interface InvoiceLineItem {
  id: string;
  description: string;
  typeLabel: string | null;
  qtyLabel: string;
  unitPrice: number;
  amount: number;
}

export interface InvoiceDetailData {
  id: string;
  invoiceNumber: string;
  status: string;
  customerName: string | null;
  issueDate: string;
  dueDate: string;
  paidDate: string | null;
  amount: number;
  tax: number;
  totalAmount: number;
  freight: {
    bolNumber: string | null;
    proNumber: string | null;
    poNumber: string | null;
    commodity: string | null;
    weightLbs: number | null;
    pieces: number | null;
    loadedMiles: number | null;
  };
  notes: string | null;
  items: InvoiceLineItem[];
}

const STATUS_META: Record<string, { label: string; tone: StatusTone }> = {
  DRAFT: { label: 'Draft', tone: 'neutral' },
  SENT: { label: 'Sent', tone: 'accent' },
  PAID: { label: 'Paid', tone: 'success' },
  OVERDUE: { label: 'Overdue', tone: 'danger' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral' },
};
function statusMeta(s: string) {
  return STATUS_META[s] ?? { label: s, tone: 'neutral' as StatusTone };
}
function fmtDollar(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/**
 * Invoice Detail — mobile-web design system view.
 * Read view of an invoice: identity + status, Details / Freight FieldGroups,
 * notes, a line-item list with totals, and the same status-gated actions as
 * desktop (Edit unless paid/cancelled, Mark-paid when sent, Delete when draft).
 */
export function InvoiceDetailMobile({ invoice }: { invoice: InvoiceDetailData }) {
  const router = useRouter();
  const [markingPaid, startMarkPaid] = useTransition();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const s = statusMeta(invoice.status);
  const editable = invoice.status !== 'PAID' && invoice.status !== 'CANCELLED';
  const f = invoice.freight;
  const hasFreight =
    f.bolNumber || f.proNumber || f.poNumber || f.commodity || f.weightLbs || f.pieces || f.loadedMiles;

  function markPaid() {
    startMarkPaid(async () => {
      try {
        await markInvoicePaid(invoice.id);
        toast.success('Invoice marked as paid');
        router.refresh();
      } catch {
        toast.error('Failed to mark as paid');
      }
    });
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteInvoice(invoice.id);
      toast.success('Invoice deleted');
      router.push('/invoices');
      router.refresh();
    } catch {
      toast.error('Failed to delete invoice');
      setDeleting(false);
      setConfirmDelete(false);
    }
  }

  const detailFields: FieldDef[] = [
    ...(invoice.customerName ? [{ key: 'customer', label: 'Customer', value: invoice.customerName } as FieldDef] : []),
    { key: 'issued', label: 'Issued', value: fmtDate(invoice.issueDate) },
    { key: 'due', label: 'Due', value: fmtDate(invoice.dueDate) },
    ...(invoice.paidDate ? [{ key: 'paid', label: 'Paid', value: fmtDate(invoice.paidDate), tone: 'success' } as FieldDef] : []),
  ];

  const freightFields: FieldDef[] = [
    ...(f.bolNumber ? [{ key: 'bol', label: 'BOL #', value: f.bolNumber } as FieldDef] : []),
    ...(f.proNumber ? [{ key: 'pro', label: 'PRO #', value: f.proNumber } as FieldDef] : []),
    ...(f.poNumber ? [{ key: 'po', label: 'PO #', value: f.poNumber } as FieldDef] : []),
    ...(f.commodity ? [{ key: 'commodity', label: 'Commodity', value: f.commodity } as FieldDef] : []),
    ...(f.weightLbs ? [{ key: 'weight', label: 'Weight', value: `${f.weightLbs.toLocaleString()} lbs` } as FieldDef] : []),
    ...(f.pieces ? [{ key: 'pieces', label: 'Pieces', value: f.pieces.toLocaleString() } as FieldDef] : []),
    ...(f.loadedMiles ? [{ key: 'miles', label: 'Loaded miles', value: `${f.loadedMiles.toLocaleString()} mi` } as FieldDef] : []),
  ];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="Invoice"
        onBack={() => router.push('/invoices')}
        right={editable ? <NavTextButton label="Edit" onClick={() => router.push(`/invoices/${invoice.id}/edit`)} /> : undefined}
      />

      {/* Identity */}
      <div className="flex flex-col items-center pb-4 pt-2">
        <h1 className="text-center text-[22px] font-bold text-ds-txt">{invoice.invoiceNumber}</h1>
        <div className="mt-2">
          <StatusPill label={s.label} tone={s.tone} />
        </div>
      </div>

      {/* Mark as paid (SENT only) */}
      {invoice.status === 'SENT' ? (
        <button
          type="button"
          onClick={markPaid}
          disabled={markingPaid}
          className="mb-5 flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-ds-success text-[16px] font-semibold text-white transition active:opacity-75 disabled:opacity-35"
        >
          {markingPaid ? 'Processing…' : 'Mark as paid'}
        </button>
      ) : null}

      <div className="space-y-6">
        <div>
          <SectionHeader title="Details" />
          <FieldGroup fields={detailFields} isEditing={false} />
        </div>

        {hasFreight ? (
          <div>
            <SectionHeader title="Freight" />
            <FieldGroup fields={freightFields} isEditing={false} />
          </div>
        ) : null}

        {invoice.notes ? (
          <div>
            <SectionHeader title="Notes" />
            <div className="rounded-[20px] bg-ds-card p-4">
              <p className="whitespace-pre-wrap text-[15px] text-ds-txt2">{invoice.notes}</p>
            </div>
          </div>
        ) : null}

        {/* Line items + totals */}
        <div>
          <SectionHeader title="Line items" />
          <div className="overflow-hidden rounded-[20px] bg-ds-card">
            {invoice.items.map((it, i) => (
              <div key={it.id}>
                <div className="flex items-start justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="text-[15px] text-ds-txt">{it.description}</p>
                    <p className="mt-0.5 text-[12px] text-ds-txt3">
                      {[it.typeLabel, it.qtyLabel, `${fmtDollar(it.unitPrice)} ea`].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <span className="shrink-0 text-[15px] font-medium text-ds-txt tabular-nums">{fmtDollar(it.amount)}</span>
                </div>
                <div className="ml-4 h-px bg-ds-hairline" />
              </div>
            ))}
            <div className="space-y-1.5 px-4 py-3">
              <div className="flex justify-between text-[13px]">
                <span className="text-ds-txt2">Subtotal</span>
                <span className="text-ds-txt tabular-nums">{fmtDollar(invoice.amount)}</span>
              </div>
              <div className="flex justify-between text-[13px]">
                <span className="text-ds-txt2">Tax</span>
                <span className="text-ds-txt tabular-nums">{fmtDollar(invoice.tax)}</span>
              </div>
              <div className="flex justify-between border-t border-ds-hairline pt-1.5 text-[16px] font-semibold">
                <span className="text-ds-txt">Total</span>
                <span className="text-ds-txt tabular-nums">{fmtDollar(invoice.totalAmount)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Delete (DRAFT only) */}
        {invoice.status === 'DRAFT' ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-ds-danger/[0.14] text-[17px] font-semibold text-ds-danger transition active:opacity-75"
          >
            <Trash2 className="h-5 w-5" />
            Delete invoice
          </button>
        ) : null}
      </div>

      <SheetContainer
        open={confirmDelete}
        onCancel={() => (deleting ? undefined : setConfirmDelete(false))}
        title="Delete invoice"
        subtitle={`${invoice.invoiceNumber} will be removed. This can't be undone.`}
      >
        <div className="pt-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-ds-danger text-[17px] font-semibold text-white transition active:opacity-75 disabled:opacity-35"
          >
            <Trash2 className="h-5 w-5" />
            {deleting ? 'Deleting…' : 'Delete invoice'}
          </button>
        </div>
      </SheetContainer>
    </MobileScreen>
  );
}
