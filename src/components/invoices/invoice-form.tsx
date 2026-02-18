'use client';

import { useActionState, useState } from 'react';
import { InvoiceItemsEditor } from './invoice-items-editor';

interface Customer {
  id: string;
  companyName: string;
}

interface InvoiceFormProps {
  action: (prevState: any, formData: FormData) => Promise<any>;
  initialData?: {
    customerId?: string | null;
    routeId?: string | null;
    invoiceNumber?: string;
    tax?: any;
    status?: string;
    issueDate?: Date;
    dueDate?: Date;
    notes?: string | null;
    items?: Array<{
      description: string;
      quantity: any;
      unitPrice: any;
      amount?: any;
    }>;
  };
  customers?: Customer[];
  nextInvoiceNumber?: string;
  submitLabel: string;
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'block text-sm font-medium text-foreground mb-1.5';

function toDateInputValue(date?: Date): string {
  if (!date) return '';
  return new Date(date).toISOString().split('T')[0];
}

export function InvoiceForm({
  action,
  initialData,
  customers,
  nextInvoiceNumber,
  submitLabel,
}: InvoiceFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [subtotal, setSubtotal] = useState(0);
  const [taxValue, setTaxValue] = useState(Number(initialData?.tax) || 0);

  const total = subtotal + taxValue;

  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Invoice Details */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Invoice Details
        </h3>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="invoiceNumber" className={labelClass}>
              Invoice Number
            </label>
            <input
              type="text"
              id="invoiceNumber"
              name="invoiceNumber"
              defaultValue={initialData?.invoiceNumber || nextInvoiceNumber || ''}
              placeholder="INV-0001"
              disabled={isPending}
              className={inputClass}
              required
            />
            {state?.error?.invoiceNumber && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.invoiceNumber}</p>
            )}
          </div>
          <div>
            <label htmlFor="status" className={labelClass}>
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={initialData?.status || 'DRAFT'}
              disabled={isPending}
              className={inputClass}
            >
              <option value="DRAFT">Draft</option>
              <option value="SENT">Sent</option>
              <option value="PAID">Paid</option>
              <option value="OVERDUE">Overdue</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="issueDate" className={labelClass}>
              Issue Date
            </label>
            <input
              type="date"
              id="issueDate"
              name="issueDate"
              defaultValue={toDateInputValue(initialData?.issueDate) || toDateInputValue(new Date())}
              disabled={isPending}
              className={inputClass}
              required
            />
            {state?.error?.issueDate && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.issueDate}</p>
            )}
          </div>
          <div>
            <label htmlFor="dueDate" className={labelClass}>
              Due Date
            </label>
            <input
              type="date"
              id="dueDate"
              name="dueDate"
              defaultValue={toDateInputValue(initialData?.dueDate)}
              disabled={isPending}
              className={inputClass}
              required
            />
            {state?.error?.dueDate && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.dueDate}</p>
            )}
          </div>
        </div>
      </div>

      {/* Customer (optional) */}
      {customers && customers.length > 0 && (
        <div className="space-y-4 border-t border-border pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Customer <span className="text-xs font-normal normal-case">(optional)</span>
          </h3>
          <div>
            <label htmlFor="customerId" className={labelClass}>
              Customer
            </label>
            <select
              id="customerId"
              name="customerId"
              defaultValue={initialData?.customerId || ''}
              disabled={isPending}
              className={inputClass}
            >
              <option value="">No customer linked</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.companyName}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Line Items */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Line Items
        </h3>
        {state?.error?.items && (
          <p className="text-sm text-red-600">{state.error.items}</p>
        )}
        <InvoiceItemsEditor
          initialItems={initialData?.items}
          onSubtotalChange={setSubtotal}
        />
      </div>

      {/* Tax and totals */}
      <div className="space-y-4 border-t border-border pt-6">
        <div className="flex items-center justify-between gap-8">
          <div className="w-48">
            <label htmlFor="tax" className={labelClass}>
              Tax ($) <span className="text-xs text-muted-foreground font-normal">(optional)</span>
            </label>
            <input
              type="number"
              id="tax"
              name="tax"
              step="0.01"
              min="0"
              defaultValue={Number(initialData?.tax) || 0}
              onChange={(e) => setTaxValue(parseFloat(e.target.value) || 0)}
              disabled={isPending}
              className={inputClass}
            />
            {state?.error?.tax && (
              <p className="mt-1.5 text-sm text-red-600">{state.error.tax}</p>
            )}
          </div>
          <div className="space-y-1 text-right">
            <div className="flex items-center justify-between gap-8 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">
                ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-8 text-sm">
              <span className="text-muted-foreground">Tax</span>
              <span className="font-medium">
                ${taxValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-8 text-base font-bold border-t border-border pt-1">
              <span>Total</span>
              <span>
                ${total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-4 border-t border-border pt-6">
        <div>
          <label htmlFor="notes" className={labelClass}>
            Notes <span className="text-xs text-muted-foreground font-normal">(optional)</span>
          </label>
          <textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            defaultValue={initialData?.notes || ''}
            disabled={isPending}
            className={inputClass}
          />
        </div>
      </div>

      {/* Submit */}
      <div className="pt-2">
        <button
          type="submit"
          disabled={isPending}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending ? 'Saving...' : submitLabel}
        </button>
      </div>
    </form>
  );
}
