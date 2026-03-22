'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Decimal } from 'decimal.js';
import { createSysAdminInvoice } from '@/app/(admin)/actions/sysadmin-invoices';
import { Card, CardContent } from '@/components/ui/card';

const CHARGE_TYPES = [
  { value: 'MONTHLY_SUBSCRIPTION', label: 'Monthly Subscription' },
  { value: 'ANNUAL_SUBSCRIPTION', label: 'Annual Subscription' },
  { value: 'SETUP_FEE', label: 'Setup / Onboarding Fee' },
  { value: 'CUSTOM', label: 'Custom' },
];

function getDefaultDescription(chargeType: string): string {
  switch (chargeType) {
    case 'MONTHLY_SUBSCRIPTION': return 'DriveCommand Monthly Subscription';
    case 'ANNUAL_SUBSCRIPTION': return 'DriveCommand Annual Subscription';
    case 'SETUP_FEE': return 'Setup & Onboarding Fee';
    default: return '';
  }
}

interface LineItem {
  id: string;
  chargeType: string;
  description: string;
  quantity: string;
  unitPrice: string;
}

interface Props {
  tenants: Array<{ id: string; name: string }>;
  preselectedTenantId?: string;
}

function computeItemAmount(quantity: string, unitPrice: string): string {
  try {
    return new Decimal(quantity || '0').times(new Decimal(unitPrice || '0')).toFixed(2);
  } catch {
    return '0.00';
  }
}

function computeSubtotal(items: LineItem[]): string {
  try {
    return items
      .reduce((sum, item) => sum.plus(new Decimal(computeItemAmount(item.quantity, item.unitPrice))), new Decimal(0))
      .toFixed(2);
  } catch {
    return '0.00';
  }
}

export function NewInvoiceForm({ tenants, preselectedTenantId }: Props) {
  const router = useRouter();
  const [selectedTenantId, setSelectedTenantId] = useState(preselectedTenantId ?? '');
  const [dueDate, setDueDate] = useState('');
  const [billingPeriodStart, setBillingPeriodStart] = useState('');
  const [billingPeriodEnd, setBillingPeriodEnd] = useState('');
  const [isRecurring, setIsRecurring] = useState(false);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([
    { id: crypto.randomUUID(), chargeType: 'MONTHLY_SUBSCRIPTION', description: 'DriveCommand Monthly Subscription', quantity: '1', unitPrice: '0.00' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  function addLineItem() {
    setItems((prev) => [
      ...prev,
      { id: crypto.randomUUID(), chargeType: 'CUSTOM', description: '', quantity: '1', unitPrice: '0.00' },
    ]);
  }

  function removeLineItem(id: string) {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }

  function updateItem(id: string, field: keyof Omit<LineItem, 'id'>, value: string) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        if (field === 'chargeType') {
          const defaultDesc = getDefaultDescription(value);
          return { ...item, chargeType: value, description: defaultDesc || item.description };
        }
        return { ...item, [field]: value };
      }),
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await createSysAdminInvoice({
        tenantId: selectedTenantId,
        dueDate,
        billingPeriodStart: billingPeriodStart || undefined,
        billingPeriodEnd: billingPeriodEnd || undefined,
        isRecurring,
        notes: notes || undefined,
        items: items.map((i) => ({
          chargeType: i.chargeType || undefined,
          description: i.description,
          quantity: parseFloat(i.quantity) || 0,
          unitPrice: parseFloat(i.unitPrice) || 0,
        })),
      });
      if (!result.success) {
        setError(result.error);
        return;
      }
      router.push('/billing/' + result.invoice.id);
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
          {/* Tenant */}
          <div>
            <label htmlFor="tenant" className="block text-sm font-medium text-gray-700">
              Tenant <span className="text-red-500">*</span>
            </label>
            <select
              id="tenant"
              required
              value={selectedTenantId}
              onChange={(e) => setSelectedTenantId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
            >
              <option value="">Select a tenant…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
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

          {/* Billing period */}
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Billing Period <span className="text-gray-400">(optional)</span>
            </label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="date"
                value={billingPeriodStart}
                onChange={(e) => setBillingPeriodStart(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
              <span className="text-sm text-gray-400">to</span>
              <input
                type="date"
                value={billingPeriodEnd}
                onChange={(e) => setBillingPeriodEnd(e.target.value)}
                className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
              />
            </div>
          </div>

          {/* Recurring toggle */}
          <div className="flex items-center gap-3">
            <input
              id="isRecurring"
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-500"
            />
            <label htmlFor="isRecurring" className="text-sm font-medium text-gray-700">
              Recurring invoice <span className="text-gray-400 font-normal">(monthly subscription)</span>
            </label>
          </div>

          {/* Notes */}
          <div>
            <label htmlFor="notes" className="block text-sm font-medium text-gray-700">
              Notes <span className="text-gray-400">(optional)</span>
            </label>
            <textarea
              id="notes"
              rows={2}
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

          <div className="space-y-3">
            {items.map((item, idx) => (
              <div key={item.id} className="rounded-md border border-gray-200 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Charge Type</label>
                    <select
                      value={item.chargeType}
                      onChange={(e) => updateItem(item.id, 'chargeType', e.target.value)}
                      className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    >
                      {CHARGE_TYPES.map((ct) => (
                        <option key={ct.value} value={ct.value}>{ct.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeLineItem(item.id)}
                    disabled={items.length === 1}
                    className="mt-5 text-gray-400 hover:text-red-600 disabled:opacity-30"
                    aria-label="Remove line item"
                  >
                    ✕
                  </button>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    value={item.description}
                    onChange={(e) => updateItem(item.id, 'description', e.target.value)}
                    placeholder="e.g. DriveCommand Monthly Subscription — March 2026"
                    className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                  />
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-24">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Qty</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0.01"
                      value={item.quantity}
                      onChange={(e) => updateItem(item.id, 'quantity', e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    />
                  </div>
                  <div className="w-36">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Unit Price ($)</label>
                    <input
                      type="number"
                      required
                      step="0.01"
                      min="0"
                      value={item.unitPrice}
                      onChange={(e) => updateItem(item.id, 'unitPrice', e.target.value)}
                      className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-right text-sm focus:border-gray-500 focus:outline-none focus:ring-1 focus:ring-gray-500"
                    />
                  </div>
                  <div className="flex-1 text-right">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Amount</label>
                    <span className="text-sm font-medium text-gray-900 tabular-nums">
                      ${computeItemAmount(item.quantity, item.unitPrice)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 flex justify-end border-t border-gray-200 pt-4">
            <div className="text-sm font-semibold text-gray-900">Subtotal: ${subtotal}</div>
          </div>
        </CardContent>
      </Card>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSubmitting}
          className="rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-700 disabled:opacity-50"
        >
          {isSubmitting ? 'Creating…' : 'Create Invoice'}
        </button>
        <Link href="/billing" className="text-sm text-gray-500 hover:text-gray-700">
          Cancel
        </Link>
      </div>
    </form>
  );
}
