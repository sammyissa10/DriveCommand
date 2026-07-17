'use client';

import type { ActionState } from '@drivecommand/types';

import { useActionState, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { InvoiceItemsEditor } from './invoice-items-editor';
import type { InvoiceItemType, InvoiceItemUnit } from '@drivecommand/validation';
import { US_STATE_SALES_TAX, getStateSalesTaxRate } from '@/lib/finance/us-state-sales-tax';

interface Customer {
  id: string;
  companyName: string;
}

interface Load {
  id: string;
  loadNumber: string;
  customerId: string;
  status: string;
}

interface InvoiceFormProps {
  action: (prevState: ActionState | null, formData: FormData) => Promise<ActionState>;
  initialData?: {
    customerId?: string | null;
    routeId?: string | null;
    invoiceNumber?: string;
    tax?: any;
    status?: string;
    issueDate?: Date;
    dueDate?: Date;
    notes?: string | null;
    bolNumber?: string | null;
    proNumber?: string | null;
    poNumber?: string | null;
    commodity?: string | null;
    weightLbs?: number | null;
    pieces?: number | null;
    loadedMiles?: number | string | null;
    items?: Array<{
      description: string;
      quantity: any;
      unitPrice: any;
      amount?: any;
      itemType?: string;
      unitType?: string;
    }>;
  };
  customers?: Customer[];
  loads?: Load[];
  nextInvoiceNumber?: string;
  submitLabel: string;
  loadId?: string;
  loadNumber?: string;
}

const inputClass =
  'w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50';
const labelClass = 'block text-sm font-medium text-foreground mb-1.5';

function toDateInputValue(date?: Date): string {
  if (!date) return '';
  return new Date(date).toISOString().split('T')[0];
}

// Tax is stored as an absolute amount but edited here as a percent. Reconstruct
// the percent from the saved amount + line items so editing an existing invoice
// preserves its tax instead of snapping back to the new-invoice default.
function initialTaxPercent(initialData?: {
  tax?: unknown;
  items?: Array<{ quantity?: unknown; unitPrice?: unknown; unitType?: string }>;
}): number {
  const rawTax = initialData?.tax;
  // New invoice (no saved tax): default to 0% — freight is generally not taxed.
  if (rawTax === undefined || rawTax === null || rawTax === '') return 0;
  const taxAmount = Number(rawTax);
  if (!Number.isFinite(taxAmount)) return 0;
  const subtotal = (initialData?.items ?? []).reduce((sum, it) => {
    const qty = Number(it.quantity) || 0;
    const price = Number(it.unitPrice) || 0;
    return sum + (it.unitType === 'PERCENT' ? (qty / 100) * price : qty * price);
  }, 0);
  if (subtotal <= 0) return 0;
  return Math.round((taxAmount / subtotal) * 10000) / 100;
}

export function InvoiceForm({
  action,
  initialData,
  customers,
  loads,
  nextInvoiceNumber,
  submitLabel,
  loadId,
  loadNumber,
}: InvoiceFormProps) {
  const [state, formAction, isPending] = useActionState(action, null);
  const [subtotal, setSubtotal] = useState(0);
  const [taxPercent, setTaxPercent] = useState(() => initialTaxPercent(initialData));
  // Optional convenience: pick a state to auto-fill the tax %. Default '' =
  // exempt (no tax). Not persisted — it only drives the % / amount that is.
  const [taxState, setTaxState] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialData?.customerId || '');
  const [selectedLoadId, setSelectedLoadId] = useState(loadId || '');

  // Freight details state
  const hasInitialFreightData = !!(
    initialData?.bolNumber ||
    initialData?.proNumber ||
    initialData?.poNumber ||
    initialData?.commodity ||
    initialData?.weightLbs ||
    initialData?.pieces ||
    initialData?.loadedMiles
  );
  const [freightOpen, setFreightOpen] = useState(hasInitialFreightData);
  const [loadedMiles, setLoadedMiles] = useState(Number(initialData?.loadedMiles) || 0);

  const customerLoads = loads?.filter((l) => l.customerId === selectedCustomerId) ?? [];

  const taxAmount = subtotal * taxPercent / 100;
  const total = subtotal + taxAmount;

  const fieldErrors = typeof state?.error === 'object' ? state.error : undefined;
  return (
    <form action={formAction} className="max-w-3xl space-y-6">
      {/* loadId — hidden, controlled by load picker or pre-filled from load page */}
      <input type="hidden" name="loadId" value={selectedLoadId} />

      {state?.error && typeof state.error === 'string' && (
        <div className="rounded-lg bg-red-50 border border-red-200 p-4">
          <p className="text-sm text-red-800">{state.error}</p>
        </div>
      )}

      {/* Load context banner */}
      {loadId && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 flex items-center gap-2 text-sm text-blue-800">
          <span>
            Creating invoice for{' '}
            {loadNumber ? (
              <a href={`/loads/${loadId}`} className="font-semibold underline hover:text-blue-900">
                Load #{loadNumber}
              </a>
            ) : (
              'this load'
            )}
          </span>
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
            {fieldErrors?.invoiceNumber && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.invoiceNumber}</p>
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
            {fieldErrors?.issueDate && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.issueDate}</p>
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
            {fieldErrors?.dueDate && (
              <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.dueDate}</p>
            )}
          </div>
        </div>
      </div>

      {/* Customer + Load (optional) */}
      {customers && customers.length > 0 && (
        <div className="space-y-4 border-t border-border pt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Customer <span className="text-xs font-normal normal-case">(optional)</span>
          </h3>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="customerId" className={labelClass}>
                Customer
              </label>
              <select
                id="customerId"
                name="customerId"
                value={selectedCustomerId}
                onChange={(e) => {
                  setSelectedCustomerId(e.target.value);
                  setSelectedLoadId(''); // reset load when customer changes
                }}
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
            {loads && (
              <div>
                <label htmlFor="loadPicker" className={labelClass}>
                  Link to Load <span className="text-xs text-muted-foreground font-normal">(optional)</span>
                </label>
                <select
                  id="loadPicker"
                  value={selectedLoadId}
                  onChange={(e) => setSelectedLoadId(e.target.value)}
                  disabled={isPending || !selectedCustomerId}
                  className={inputClass}
                >
                  <option value="">
                    {selectedCustomerId ? 'No load linked' : 'Select a customer first'}
                  </option>
                  {customerLoads.map((l) => (
                    <option key={l.id} value={l.id}>
                      Load #{l.loadNumber} — {l.status.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Freight Details (collapsible) */}
      <div className="space-y-4 border-t border-border pt-6">
        <button
          type="button"
          onClick={() => setFreightOpen((prev) => !prev)}
          className="flex w-full items-center justify-between text-sm font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
        >
          Freight Details
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 ${freightOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {freightOpen && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label htmlFor="bolNumber" className={labelClass}>
                BOL #
              </label>
              <input
                type="text"
                id="bolNumber"
                name="bolNumber"
                defaultValue={initialData?.bolNumber || ''}
                placeholder="Bill of Lading #"
                disabled={isPending}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="proNumber" className={labelClass}>
                PRO #
              </label>
              <input
                type="text"
                id="proNumber"
                name="proNumber"
                defaultValue={initialData?.proNumber || ''}
                placeholder="PRO / tracking #"
                disabled={isPending}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="poNumber" className={labelClass}>
                PO #
              </label>
              <input
                type="text"
                id="poNumber"
                name="poNumber"
                defaultValue={initialData?.poNumber || ''}
                placeholder="Purchase order #"
                disabled={isPending}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="commodity" className={labelClass}>
                Commodity
              </label>
              <input
                type="text"
                id="commodity"
                name="commodity"
                defaultValue={initialData?.commodity || ''}
                placeholder="e.g. Dry goods, Produce"
                disabled={isPending}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="weightLbs" className={labelClass}>
                Weight (lbs)
              </label>
              <input
                type="number"
                id="weightLbs"
                name="weightLbs"
                defaultValue={initialData?.weightLbs ?? ''}
                min="0"
                step="1"
                disabled={isPending}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="pieces" className={labelClass}>
                Pieces
              </label>
              <input
                type="number"
                id="pieces"
                name="pieces"
                defaultValue={initialData?.pieces ?? ''}
                min="0"
                step="1"
                disabled={isPending}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="loadedMiles" className={labelClass}>
                Loaded Miles
              </label>
              <input
                type="number"
                id="loadedMiles"
                name="loadedMiles"
                value={loadedMiles || ''}
                min="0"
                step="0.01"
                disabled={isPending}
                onChange={(e) => setLoadedMiles(Number(e.target.value) || 0)}
                className={inputClass}
              />
            </div>
          </div>
        )}
      </div>

      {/* Line Items */}
      <div className="space-y-4 border-t border-border pt-6">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Line Items
        </h3>
        {fieldErrors?.items && (
          <p className="text-sm text-red-600">{fieldErrors?.items}</p>
        )}
        <InvoiceItemsEditor
          initialItems={initialData?.items}
          onSubtotalChange={setSubtotal}
          loadedMiles={loadedMiles}
        />
      </div>

      {/* Tax and totals */}
      <div className="space-y-4 border-t border-border pt-6">
        {/* Hidden field submits the computed dollar amount to the server */}
        <input type="hidden" name="tax" value={taxAmount.toFixed(2)} />
        <div className="flex items-center justify-between gap-8">
          <div className="flex w-96 gap-3">
            <div className="flex-1">
              <label htmlFor="taxState" className={labelClass}>
                Tax state
              </label>
              <select
                id="taxState"
                value={taxState}
                onChange={(e) => {
                  const code = e.target.value;
                  setTaxState(code);
                  setTaxPercent(code ? getStateSalesTaxRate(code) ?? 0 : 0);
                }}
                disabled={isPending}
                className={inputClass}
              >
                <option value="">Exempt / none</option>
                {US_STATE_SALES_TAX.map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} — {s.rate}%
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label htmlFor="taxPercent" className={labelClass}>
                Tax (%)
              </label>
              <input
                type="number"
                id="taxPercent"
                step="0.01"
                min="0"
                max="100"
                placeholder="0"
                value={taxPercent || ''}
                onChange={(e) => {
                  setTaxPercent(parseFloat(e.target.value) || 0);
                  setTaxState('');
                }}
                disabled={isPending}
                className={inputClass}
              />
              {fieldErrors?.tax && (
                <p className="mt-1.5 text-sm text-red-600">{fieldErrors?.tax}</p>
              )}
            </div>
          </div>
          <div className="space-y-1 text-right">
            <div className="flex items-center justify-between gap-8 text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="font-medium">
                ${subtotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex items-center justify-between gap-8 text-sm">
              <span className="text-muted-foreground">Tax {taxPercent > 0 ? `(${taxPercent}%)` : ''}</span>
              <span className="font-medium">
                ${taxAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
        <p className="text-xs text-muted-foreground">
          Freight is usually tax-exempt — leave as Exempt unless this invoice has taxable charges.
          State rates are base rates only (no local tax); adjust the % if needed.
        </p>
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
