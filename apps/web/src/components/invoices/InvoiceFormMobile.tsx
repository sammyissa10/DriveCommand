'use client';

import type { ActionState } from '@drivecommand/types';
import { useActionState, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  PrimaryButton,
} from '@/components/ui/ds';
import { InvoiceItemsEditorMobile } from './InvoiceItemsEditorMobile';

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

interface InvoiceFormMobileProps {
  action: (prevState: ActionState | null, formData: FormData) => Promise<ActionState>;
  title: string;
  backHref: string;
  submitLabel: string;
  initialData?: {
    customerId?: string | null;
    invoiceNumber?: string;
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
    items?: Array<{ description: string; quantity: unknown; unitPrice: unknown; amount?: unknown; itemType?: string; unitType?: string }>;
  };
  customers?: Customer[];
  loads?: Load[];
  nextInvoiceNumber?: string;
  loadId?: string;
  loadNumber?: string;
}

const dsInput =
  'h-11 w-full rounded-[10px] bg-ds-input px-3 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3';
const dsLabel = 'mb-1.5 block text-[13px] text-ds-txt2';

function toDateInputValue(date?: Date): string {
  if (!date) return '';
  return new Date(date).toISOString().split('T')[0];
}
function money(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className={dsLabel}>
        {label}
      </label>
      {children}
    </div>
  );
}

/**
 * Invoice create/edit form — mobile-web design system view. Native <form action>
 * + FormData submission and all financial state are ported verbatim from
 * InvoiceForm; only the layout is ds (stacked cards, line-item editor rebuilt).
 */
export function InvoiceFormMobile({
  action,
  title,
  backHref,
  submitLabel,
  initialData,
  customers,
  loads,
  nextInvoiceNumber,
  loadId,
  loadNumber,
}: InvoiceFormMobileProps) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(action, null);

  const [subtotal, setSubtotal] = useState(0);
  const [taxPercent, setTaxPercent] = useState(7);
  const [selectedCustomerId, setSelectedCustomerId] = useState(initialData?.customerId || '');
  const [selectedLoadId, setSelectedLoadId] = useState(loadId || '');

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
  const taxAmount = (subtotal * taxPercent) / 100;
  const total = subtotal + taxAmount;

  const fieldErrors = typeof state?.error === 'object' ? state.error : undefined;
  const navLabel = isPending ? 'Saving…' : submitLabel.toLowerCase().includes('update') ? 'Save' : 'Create';

  return (
    <MobileScreen className="pb-10 pt-2">
      <form action={formAction} ref={formRef}>
        <NavHeader
          title={title}
          left={<NavTextButton label="Cancel" onClick={() => router.push(backHref)} />}
          right={<NavTextButton label={navLabel} emphasized onClick={() => formRef.current?.requestSubmit()} disabled={isPending} />}
        />

        <input type="hidden" name="loadId" value={selectedLoadId} />

        {state?.error && typeof state.error === 'string' ? (
          <div className="mb-4 rounded-[16px] bg-ds-danger/[0.14] p-4 text-[13px] text-ds-danger">{state.error}</div>
        ) : null}

        {loadId ? (
          <div className="mb-4 rounded-[16px] bg-ds-accent/[0.12] p-4 text-[13px] text-ds-txt2">
            Creating invoice for {loadNumber ? `Load #${loadNumber}` : 'this load'}
          </div>
        ) : null}

        <div className="space-y-6">
          {/* Invoice details */}
          <div>
            <SectionHeader title="Invoice details" />
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Invoice number" htmlFor="invoiceNumber">
                  <input
                    id="invoiceNumber"
                    name="invoiceNumber"
                    type="text"
                    defaultValue={initialData?.invoiceNumber || nextInvoiceNumber || ''}
                    placeholder="INV-0001"
                    disabled={isPending}
                    className={dsInput}
                    required
                  />
                </Field>
                <Field label="Status" htmlFor="status">
                  <select id="status" name="status" defaultValue={initialData?.status || 'DRAFT'} disabled={isPending} className={dsInput}>
                    <option value="DRAFT">Draft</option>
                    <option value="SENT">Sent</option>
                    <option value="PAID">Paid</option>
                    <option value="OVERDUE">Overdue</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </Field>
              </div>
              {fieldErrors?.invoiceNumber ? <p className="text-[13px] text-ds-danger">{fieldErrors.invoiceNumber}</p> : null}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Issue date" htmlFor="issueDate">
                  <input
                    id="issueDate"
                    name="issueDate"
                    type="date"
                    defaultValue={toDateInputValue(initialData?.issueDate) || toDateInputValue(new Date())}
                    disabled={isPending}
                    className={dsInput}
                    required
                  />
                </Field>
                <Field label="Due date" htmlFor="dueDate">
                  <input
                    id="dueDate"
                    name="dueDate"
                    type="date"
                    defaultValue={toDateInputValue(initialData?.dueDate)}
                    disabled={isPending}
                    className={dsInput}
                    required
                  />
                </Field>
              </div>
              {fieldErrors?.dueDate ? <p className="text-[13px] text-ds-danger">{fieldErrors.dueDate}</p> : null}
            </div>
          </div>

          {/* Customer (optional) */}
          {customers && customers.length > 0 ? (
            <div>
              <SectionHeader title="Customer" />
              <div className="space-y-3">
                <Field label="Customer" htmlFor="customerId">
                  <select
                    id="customerId"
                    name="customerId"
                    value={selectedCustomerId}
                    onChange={(e) => {
                      setSelectedCustomerId(e.target.value);
                      setSelectedLoadId('');
                    }}
                    disabled={isPending}
                    className={dsInput}
                  >
                    <option value="">No customer linked</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.companyName}
                      </option>
                    ))}
                  </select>
                </Field>
                {loads ? (
                  <Field label="Link to load" htmlFor="loadPicker">
                    <select
                      id="loadPicker"
                      value={selectedLoadId}
                      onChange={(e) => setSelectedLoadId(e.target.value)}
                      disabled={isPending || !selectedCustomerId}
                      className={dsInput}
                    >
                      <option value="">{selectedCustomerId ? 'No load linked' : 'Select a customer first'}</option>
                      {customerLoads.map((l) => (
                        <option key={l.id} value={l.id}>
                          Load #{l.loadNumber} — {l.status.replace(/_/g, ' ')}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>
            </div>
          ) : null}

          {/* Freight (collapsible) */}
          <div>
            <SectionHeader title="Freight details" action={{ label: freightOpen ? 'Hide' : 'Add', onClick: () => setFreightOpen((p) => !p) }} />
            {freightOpen ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="BOL #" htmlFor="bolNumber">
                  <input id="bolNumber" name="bolNumber" type="text" defaultValue={initialData?.bolNumber || ''} disabled={isPending} className={dsInput} />
                </Field>
                <Field label="PRO #" htmlFor="proNumber">
                  <input id="proNumber" name="proNumber" type="text" defaultValue={initialData?.proNumber || ''} disabled={isPending} className={dsInput} />
                </Field>
                <Field label="PO #" htmlFor="poNumber">
                  <input id="poNumber" name="poNumber" type="text" defaultValue={initialData?.poNumber || ''} disabled={isPending} className={dsInput} />
                </Field>
                <Field label="Commodity" htmlFor="commodity">
                  <input id="commodity" name="commodity" type="text" defaultValue={initialData?.commodity || ''} disabled={isPending} className={dsInput} />
                </Field>
                <Field label="Weight (lbs)" htmlFor="weightLbs">
                  <input id="weightLbs" name="weightLbs" type="number" min="0" step="1" defaultValue={initialData?.weightLbs ?? ''} disabled={isPending} className={dsInput} />
                </Field>
                <Field label="Pieces" htmlFor="pieces">
                  <input id="pieces" name="pieces" type="number" min="0" step="1" defaultValue={initialData?.pieces ?? ''} disabled={isPending} className={dsInput} />
                </Field>
                <Field label="Loaded miles" htmlFor="loadedMiles">
                  <input
                    id="loadedMiles"
                    name="loadedMiles"
                    type="number"
                    min="0"
                    step="0.01"
                    value={loadedMiles || ''}
                    onChange={(e) => setLoadedMiles(Number(e.target.value) || 0)}
                    disabled={isPending}
                    className={dsInput}
                  />
                </Field>
              </div>
            ) : null}
          </div>

          {/* Line items */}
          <div>
            <SectionHeader title="Line items" />
            {fieldErrors?.items ? <p className="mb-2 text-[13px] text-ds-danger">{fieldErrors.items}</p> : null}
            <InvoiceItemsEditorMobile initialItems={initialData?.items} onSubtotalChange={setSubtotal} loadedMiles={loadedMiles} />
          </div>

          {/* Tax & total */}
          <div>
            <SectionHeader title="Tax & total" />
            <div className="space-y-3 rounded-[20px] bg-ds-card p-4">
              <input type="hidden" name="tax" value={taxAmount.toFixed(2)} />
              <Field label="Tax (%)" htmlFor="taxPercent">
                <input
                  id="taxPercent"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  placeholder="0"
                  value={taxPercent || ''}
                  onChange={(e) => setTaxPercent(parseFloat(e.target.value) || 0)}
                  disabled={isPending}
                  className={dsInput}
                />
              </Field>
              <div className="space-y-1.5 border-t border-ds-hairline pt-3">
                <div className="flex justify-between text-[13px]">
                  <span className="text-ds-txt2">Subtotal</span>
                  <span className="text-ds-txt tabular-nums">${money(subtotal)}</span>
                </div>
                <div className="flex justify-between text-[13px]">
                  <span className="text-ds-txt2">Tax{taxPercent > 0 ? ` (${taxPercent}%)` : ''}</span>
                  <span className="text-ds-txt tabular-nums">${money(taxAmount)}</span>
                </div>
                <div className="flex justify-between border-t border-ds-hairline pt-1.5 text-[16px] font-semibold">
                  <span className="text-ds-txt">Total</span>
                  <span className="text-ds-txt tabular-nums">${money(total)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div>
            <SectionHeader title="Notes" />
            <textarea
              name="notes"
              rows={3}
              maxLength={2000}
              defaultValue={initialData?.notes || ''}
              disabled={isPending}
              className="w-full resize-none rounded-[10px] bg-ds-input px-3 py-2.5 text-[16px] text-ds-txt outline-none placeholder:text-ds-txt3"
              placeholder="Anything worth noting"
            />
          </div>

          <PrimaryButton type="submit" label={isPending ? 'Saving…' : submitLabel} loading={isPending} />
        </div>
      </form>
    </MobileScreen>
  );
}
