'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Decimal } from 'decimal.js';
import { updateSysAdminInvoice } from '@/app/(admin)/actions/sysadmin-invoices';
import { Card, CardContent } from '@/components/ui/card';

interface LineItem {
  id: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

interface InvoiceItem {
  id: string;
  description: string;
  quantity: string | { toString(): string };
  unitPrice: string | { toString(): string };
  amount: string | { toString(): string };
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  dueDate: Date;
  notes?: string | null;
  tenant: { id: string; name: string };
  items: InvoiceItem[];
}

interface Props {
  invoice: Invoice;
}

function computeItemAmount(quantity: string, unitPrice: string): string {
  try {
    const qty = new Decimal(quantity || '0');
    const price = new Decimal(unitPrice || '0');
    return qty.times(price).toFixed(2);
  } catch {
    return '0.00';
  }
}

function computeSubtotal(items: LineItem[]): string {
  try {
    let total = new Decimal(0);
    for (const item of items) {
      total = total.plus(new Decimal(computeItemAmount(item.quantity, item.unitPrice)));
    }
    return total.toFixed(2);
  } catch {
    return '0.00';
  }
}

function toDateInputValue(date: Date): string {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function EditInvoiceForm({ invoice }: Props) {
  const router = useRouter();
  const [dueDate, setDueDate] = useState(toDateInputValue(invoice.dueDate));
  const [notes, setNotes] = useState(invoice.notes ?? '');
  const [items, setItems] = useState<LineItem[]>(
    invoice.items.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: item.quantity.toString(),
      unitPrice: item.unitPrice.toString(),
    })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function addLineItem() {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: '', quantity: '1', unitPrice: '0.00' },
    ]);
  }

  function removeLineItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function updateItem(id: string, field: keyof Omit<LineItem, 'id'>, value: string) {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await updateSysAdminInvoice(invoice.id, {
        dueDate,
        notes: notes || undefined,
        items: items.map((i) => ({
          description: i.description,
          quantity: parseFloat(i.quantity) || 0,
          unitPrice: parseFloat(i.unitPrice) || 0,
        })),
      });

      if (!result.success) {
        setError(result.error);
        return;
      }

      router.push('/billing/' + invoice.id);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  }

  const subtotal = computeSubtotal(items);

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <Card>
        <CardContent className="space-y-4 pt-6">
          {/* Tenant — read-only */}
          <div>
            <p className="text-sm font-medium text-gray-700">Tenant</p>
            <p className="mt-1 text-sm text-gray-900 font-medium">{invoice.tenant.name}</p>
            <p className="text-xs text-gray-400">Tenant cannot be changed after creation</p>
          </div>

          {/* Due date */}
          <div>
            <label htmlFor="dueDate" className="block text-sm font-medium text-gray-700">
              Due Date <span className="text-red-500">*</span>
            </label>
            <input
              id="dueDate"
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="notes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes for this invoice…"
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            />
          </div>
        </CardContent>
      </Card>

      {/* Line items */}
      <Card>
        <CardContent className="pt-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-900">Line Items</h2>
            <button
              type="button"
              onClick={addLineItem}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              + Add Line Item
            </button>
          </div>

          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                <th className="pb-2">Description</th>
                <th className="pb-2 w-24 text-right">Qty</th>
                <th className="pb-2 w-32 text-right">Unit Price</th>
                <th className="pb-2 w-28 text-right">Amount</th>
                <th className="pb-2 w-10"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2 pr-3">
                    <input
                      type="text"
                      required
                      value={item.description}
                      onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                      placeholder="Description"
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    />
                  </td>
                  <td className="py-2 pr-3">
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1 text-right text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    />
                  </td>
                  <td className="py-2 pr-3 text-right text-gray-700 tabular-nums">
                    ${computeItemAmount(item.quantity, item.unitPrice)}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      onClick={() => removeLineItem(item.id)}
                      disabled={items.length === 1}
                      className="text-gray-400 hover:text-red-600 disabled:opacity-30"
                      aria-label="Remove line item"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
            <div className="text-sm font-semibold text-gray-900">
              Subtotal: ${subtotal}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Saving…' : 'Save Changes'}
        </button>
        <Link
          href={`/billing/${invoice.id}`}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
