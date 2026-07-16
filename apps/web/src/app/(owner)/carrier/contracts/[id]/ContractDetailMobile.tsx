'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Building2, FileText } from 'lucide-react';
import { toast } from 'sonner';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  StatusPill,
  ParentStrip,
  FieldGroup,
  SectionHeader,
  type StatusTone,
  type FieldDef,
  type ParentChip,
} from '@/components/ui/ds';

import {
  CONTRACT_TYPES,
  RATE_TYPES,
  FUEL_SURCHARGE_METHODS,
  STATUS_OPTIONS,
  PAYMENT_TERMS,
  YES_NO,
} from '../contract-options';

const LABEL: Record<string, string> = {
  ...Object.fromEntries(CONTRACT_TYPES.map((o) => [o.value, o.label])),
  ...Object.fromEntries(RATE_TYPES.map((o) => [o.value, o.label])),
  ...Object.fromEntries(FUEL_SURCHARGE_METHODS.map((o) => [`fsc_${o.value}`, o.label])),
  ...Object.fromEntries(PAYMENT_TERMS.map((o) => [o.value, o.label])),
};

export interface ContractSerialized {
  id: string;
  contractNumber: string;
  contractName: string | null;
  clientId: string;
  clientName: string;
  contractType: string | null;
  rateType: string | null;
  baseRate: string | null;
  fuelSurchargeMethod: string | null;
  fuelSurchargeRate: string | null;
  detentionFreeMinutes: number;
  detentionRatePerHour: string | null;
  tonuRate: string | null;
  layoverRatePerDay: string | null;
  paymentTermsOverride: string | null;
  autoRenew: boolean;
  status: string;
  effectiveDate: string | null;
  expirationDate: string | null;
  notes: string | null;
  routeTemplateCount: number;
}

export interface ContractLoadsSummary {
  totalLoads: number;
  totalRevenue: string | null;
  totalInvoiced: string | null;
  totalPaid: string | null;
  avgRate: string | null;
}

interface ClientOption {
  id: string;
  name: string;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function money(val: string | null | undefined): string {
  if (!val) return '$0.00';
  const n = parseFloat(val);
  if (Number.isNaN(n)) return '$0.00';
  return n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function rateDisplay(rateType: string | null, baseRate: string | null): string {
  if (!baseRate) return '—';
  const n = parseFloat(baseRate);
  if (Number.isNaN(n)) return '—';
  const f = n.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
  switch (rateType) {
    case 'per_mile': return `${f}/mi`;
    case 'flat': return `${f} flat`;
    case 'hourly':
    case 'per_hour': return `${f}/hr`;
    case 'per_load': return `${f}/load`;
    case 'per_stop': return `${f}/stop`;
    case 'per_cwt': return `${f}/cwt`;
    case 'per_pallet': return `${f}/pallet`;
    default: return f;
  }
}

function dateDisplay(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Contract lifecycle spans two vocabularies (grid: pending/terminated; form: draft/cancelled). */
function statusMeta(status: string): { tone: StatusTone; label: string } {
  switch (status) {
    case 'active': return { tone: 'success', label: 'Active' };
    case 'pending':
    case 'draft': return { tone: 'warning', label: status === 'draft' ? 'Draft' : 'Pending' };
    case 'expired': return { tone: 'danger', label: 'Expired' };
    case 'terminated':
    case 'cancelled': return { tone: 'neutral', label: status === 'cancelled' ? 'Cancelled' : 'Terminated' };
    default: return { tone: 'neutral', label: status.charAt(0).toUpperCase() + status.slice(1) };
  }
}

// A date ISO string sliced to yyyy-mm-dd for <input type="date">.
function dateInput(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

/**
 * Contract Detail / Edit — mobile-web design system view.
 * Renders below lg; the desktop ContractDetail stays on lg+. View mode shows
 * the terms/rate/accessorials + loads summary; Edit drives one `isEditing`
 * flag over FieldGroups and PATCHes the same endpoint the desktop form uses.
 */
export function ContractDetailMobile({
  contract,
  loadsSummary,
  clients,
  initialEdit = false,
}: {
  contract: ContractSerialized;
  loadsSummary: ContractLoadsSummary | null;
  clients: ClientOption[];
  initialEdit?: boolean;
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(initialEdit);
  const [saving, setSaving] = useState(false);

  const base = useMemo(
    () => ({
      clientId: contract.clientId,
      contractName: contract.contractName ?? '',
      contractType: contract.contractType ?? '',
      rateType: contract.rateType ?? '',
      baseRate: contract.baseRate ?? '',
      fuelSurchargeMethod: contract.fuelSurchargeMethod ?? 'none',
      fuelSurchargeRate: contract.fuelSurchargeRate ?? '',
      effectiveDate: dateInput(contract.effectiveDate),
      expirationDate: dateInput(contract.expirationDate),
      detentionFreeMinutes:
        contract.detentionFreeMinutes != null ? String(contract.detentionFreeMinutes) : '120',
      detentionRatePerHour: contract.detentionRatePerHour ?? '',
      tonuRate: contract.tonuRate ?? '',
      layoverRatePerDay: contract.layoverRatePerDay ?? '',
      paymentTermsOverride: contract.paymentTermsOverride ?? '',
      autoRenew: contract.autoRenew ? 'true' : 'false',
      status: contract.status,
      notes: contract.notes ?? '',
    }),
    [contract],
  );

  const [form, setForm] = useState(base);
  const [errors, setErrors] = useState<{ clientId?: string; baseRate?: string }>({});

  const setField = (key: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  const dirty = useMemo(
    () => (Object.keys(base) as (keyof typeof base)[]).some((k) => form[k] !== base[k]),
    [form, base],
  );

  const s = statusMeta(contract.status);

  const parentChips: ParentChip[] = [
    {
      key: 'client',
      icon: Building2,
      label: contract.clientName,
      onClick: () => router.push(`/carrier/clients/${contract.clientId}`),
    },
  ];

  // ---- edit lifecycle ----------------------------------------------------
  function startEdit() {
    setForm(base);
    setErrors({});
    setIsEditing(true);
  }
  function cancelEdit() {
    setForm(base);
    setErrors({});
    setIsEditing(false);
  }

  function validate(): boolean {
    const e: { clientId?: string; baseRate?: string } = {};
    if (!form.clientId) e.clientId = 'Client is required';
    if (form.baseRate && (Number.isNaN(Number(form.baseRate)) || Number(form.baseRate) < 0)) {
      e.baseRate = 'Base rate must be a positive number';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function save() {
    if (!validate() || saving) return;
    setSaving(true);
    // Body shape ported verbatim from ContractForm.handleSubmit — omit empties,
    // FSC rate only when a method is set, minutes parsed to int.
    const body: Record<string, unknown> = {
      clientId: form.clientId,
      ...(form.contractName ? { contractName: form.contractName } : {}),
      ...(form.contractType ? { contractType: form.contractType } : {}),
      ...(form.rateType ? { rateType: form.rateType } : {}),
      ...(form.baseRate ? { baseRate: form.baseRate } : {}),
      fuelSurchargeMethod: form.fuelSurchargeMethod,
      ...(form.fuelSurchargeMethod !== 'none' && form.fuelSurchargeRate
        ? { fuelSurchargeRate: form.fuelSurchargeRate }
        : {}),
      ...(form.effectiveDate ? { effectiveDate: form.effectiveDate } : {}),
      ...(form.expirationDate ? { expirationDate: form.expirationDate } : {}),
      ...(form.detentionFreeMinutes
        ? { detentionFreeMinutes: parseInt(form.detentionFreeMinutes, 10) }
        : {}),
      ...(form.detentionRatePerHour ? { detentionRatePerHour: form.detentionRatePerHour } : {}),
      ...(form.tonuRate ? { tonuRate: form.tonuRate } : {}),
      ...(form.layoverRatePerDay ? { layoverRatePerDay: form.layoverRatePerDay } : {}),
      ...(form.paymentTermsOverride ? { paymentTermsOverride: form.paymentTermsOverride } : {}),
      autoRenew: form.autoRenew === 'true',
      status: form.status,
      ...(form.notes ? { notes: form.notes } : {}),
    };

    fetch(`/api/v1/carrier/contracts/${contract.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Failed to save contract');
        }
        toast.success('Contract updated');
        setIsEditing(false);
        router.refresh();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Something went wrong'))
      .finally(() => setSaving(false));
  }

  // ---- view field groups -------------------------------------------------
  const showFsc = contract.fuelSurchargeMethod && contract.fuelSurchargeMethod !== 'none';
  const termsView: FieldDef[] = [
    { key: 'contractType', label: 'Type', value: contract.contractType ? LABEL[contract.contractType] ?? contract.contractType : null },
    { key: 'status', label: 'Status', value: s.label, tone: s.tone },
    { key: 'effectiveDate', label: 'Effective', value: dateDisplay(contract.effectiveDate) },
    { key: 'expirationDate', label: 'Expires', value: dateDisplay(contract.expirationDate) },
    { key: 'paymentTermsOverride', label: 'Payment terms', value: contract.paymentTermsOverride ? LABEL[contract.paymentTermsOverride] ?? contract.paymentTermsOverride : 'Client default' },
    { key: 'autoRenew', label: 'Auto-renew', value: contract.autoRenew ? 'Yes' : 'No' },
  ];
  const rateView: FieldDef[] = [
    { key: 'rateType', label: 'Rate type', value: contract.rateType ? LABEL[contract.rateType] ?? contract.rateType : null },
    { key: 'baseRate', label: 'Base rate', value: rateDisplay(contract.rateType, contract.baseRate) },
    { key: 'fuelSurchargeMethod', label: 'Fuel surcharge', value: contract.fuelSurchargeMethod ? LABEL[`fsc_${contract.fuelSurchargeMethod}`] ?? contract.fuelSurchargeMethod : 'None' },
    ...(showFsc ? [{ key: 'fuelSurchargeRate', label: 'FSC rate', value: contract.fuelSurchargeRate ? money(contract.fuelSurchargeRate) : '—' } as FieldDef] : []),
    { key: 'detentionFreeMinutes', label: 'Free minutes', value: String(contract.detentionFreeMinutes ?? 120) },
    { key: 'detentionRatePerHour', label: 'Detention/hr', value: contract.detentionRatePerHour ? money(contract.detentionRatePerHour) : '—' },
    { key: 'tonuRate', label: 'TONU', value: contract.tonuRate ? money(contract.tonuRate) : '—' },
    { key: 'layoverRatePerDay', label: 'Layover/day', value: contract.layoverRatePerDay ? money(contract.layoverRatePerDay) : '—' },
  ];
  const notesView: FieldDef[] = [
    { key: 'notes', label: 'Notes', value: contract.notes || '—' },
  ];

  // ---- edit field groups -------------------------------------------------
  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));
  const termsEdit: FieldDef[] = [
    { key: 'clientId', label: 'Client *', value: contract.clientName, input: { value: form.clientId, onChange: (v) => { setField('clientId', v); if (errors.clientId) setErrors((e) => ({ ...e, clientId: undefined })); }, options: clientOptions, error: errors.clientId } },
    { key: 'contractName', label: 'Contract name', value: contract.contractName, input: { value: form.contractName, onChange: (v) => setField('contractName', v), placeholder: 'e.g. Annual Freight Agreement 2026' } },
    { key: 'contractType', label: 'Type', value: null, input: { value: form.contractType, onChange: (v) => setField('contractType', v), options: CONTRACT_TYPES, placeholder: 'Select type' } },
    { key: 'status', label: 'Status', value: null, input: { value: form.status, onChange: (v) => setField('status', v), options: STATUS_OPTIONS } },
    { key: 'effectiveDate', label: 'Effective', value: null, input: { value: form.effectiveDate, onChange: (v) => setField('effectiveDate', v), type: 'date' } },
    { key: 'expirationDate', label: 'Expires', value: null, input: { value: form.expirationDate, onChange: (v) => setField('expirationDate', v), type: 'date' } },
    { key: 'paymentTermsOverride', label: 'Payment terms', value: null, input: { value: form.paymentTermsOverride, onChange: (v) => setField('paymentTermsOverride', v), options: PAYMENT_TERMS, placeholder: 'Client default' } },
    { key: 'autoRenew', label: 'Auto-renew', value: null, input: { value: form.autoRenew, onChange: (v) => setField('autoRenew', v), options: YES_NO } },
  ];
  const rateEdit: FieldDef[] = [
    { key: 'rateType', label: 'Rate type', value: null, input: { value: form.rateType, onChange: (v) => setField('rateType', v), options: RATE_TYPES, placeholder: 'Select rate type' } },
    { key: 'baseRate', label: 'Base rate', value: null, input: { value: form.baseRate, onChange: (v) => { setField('baseRate', v); if (errors.baseRate) setErrors((e) => ({ ...e, baseRate: undefined })); }, type: 'text', inputMode: 'decimal', placeholder: '2.50', error: errors.baseRate } },
    { key: 'fuelSurchargeMethod', label: 'Fuel surcharge', value: null, input: { value: form.fuelSurchargeMethod, onChange: (v) => setField('fuelSurchargeMethod', v), options: FUEL_SURCHARGE_METHODS } },
    ...(form.fuelSurchargeMethod !== 'none'
      ? [{ key: 'fuelSurchargeRate', label: 'FSC rate', value: null, input: { value: form.fuelSurchargeRate, onChange: (v: string) => setField('fuelSurchargeRate', v), type: 'text', inputMode: 'decimal' as const, placeholder: '0.50' } } as FieldDef]
      : []),
    { key: 'detentionFreeMinutes', label: 'Free minutes', value: null, input: { value: form.detentionFreeMinutes, onChange: (v) => setField('detentionFreeMinutes', v), type: 'text', inputMode: 'numeric', placeholder: '120' } },
    { key: 'detentionRatePerHour', label: 'Detention/hr', value: null, input: { value: form.detentionRatePerHour, onChange: (v) => setField('detentionRatePerHour', v), type: 'text', inputMode: 'decimal', placeholder: '75.00' } },
    { key: 'tonuRate', label: 'TONU', value: null, input: { value: form.tonuRate, onChange: (v) => setField('tonuRate', v), type: 'text', inputMode: 'decimal', placeholder: '250.00' } },
    { key: 'layoverRatePerDay', label: 'Layover/day', value: null, input: { value: form.layoverRatePerDay, onChange: (v) => setField('layoverRatePerDay', v), type: 'text', inputMode: 'decimal', placeholder: '350.00' } },
  ];
  const notesEdit: FieldDef[] = [
    { key: 'notes', label: 'Notes', value: null, input: { value: form.notes, onChange: (v) => setField('notes', v), multiline: true, placeholder: 'Additional notes about this contract…' } },
  ];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title={isEditing ? 'Edit Contract' : 'Contract'}
        onBack={isEditing ? undefined : () => router.push('/carrier/contracts')}
        left={isEditing ? <NavTextButton label="Cancel" onClick={cancelEdit} /> : undefined}
        right={
          isEditing ? (
            <NavTextButton label={saving ? 'Saving…' : 'Save'} emphasized onClick={save} disabled={!dirty || saving} />
          ) : (
            <NavTextButton label="Edit" onClick={startEdit} />
          )
        }
      />

      {/* Identity */}
      <div className="flex flex-col items-center pb-4 pt-2">
        <h1 className="text-center text-[22px] font-bold text-ds-txt">
          {contract.contractName ?? contract.contractNumber}
        </h1>
        <p className="mt-1 font-mono text-[13px] text-ds-txt3">{contract.contractNumber}</p>
        <div className="mt-2">
          <StatusPill label={s.label} tone={s.tone} />
        </div>
      </div>

      {/* Client */}
      {!isEditing ? (
        <div className="pb-3">
          <ParentStrip items={parentChips} />
        </div>
      ) : null}

      {isEditing ? (
        <div className="space-y-6">
          <div>
            <SectionHeader title="Terms" />
            <FieldGroup fields={termsEdit} isEditing />
          </div>
          <div>
            <SectionHeader title="Rate & accessorials" />
            <FieldGroup fields={rateEdit} isEditing />
          </div>
          <div>
            <SectionHeader title="Notes" />
            <FieldGroup fields={notesEdit} isEditing />
          </div>
        </div>
      ) : (
        <div className="space-y-6">
          <div>
            <SectionHeader title="Terms" />
            <FieldGroup fields={termsView} isEditing={false} />
          </div>
          <div>
            <SectionHeader title="Rate & accessorials" />
            <FieldGroup fields={rateView} isEditing={false} />
          </div>

          {loadsSummary ? (
            <div>
              <SectionHeader title="Loads summary" />
              <div className="grid grid-cols-2 gap-3">
                <SummaryTile label="Loads" value={String(loadsSummary.totalLoads)} />
                <SummaryTile label="Revenue" value={money(loadsSummary.totalRevenue)} tone="success" />
                <SummaryTile label="Invoiced" value={money(loadsSummary.totalInvoiced)} />
                <SummaryTile label="Paid" value={money(loadsSummary.totalPaid)} />
                <SummaryTile label="Avg rate" value={money(loadsSummary.avgRate)} />
                <SummaryTile label="Route templates" value={String(contract.routeTemplateCount)} />
              </div>
            </div>
          ) : null}

          <div>
            <SectionHeader title="Notes" />
            <FieldGroup fields={notesView} isEditing={false} />
          </div>

          {/* Documents live on the desktop detail for now — flagged as the follow-up. */}
          <div className="flex items-center gap-2 rounded-[16px] bg-ds-card px-4 py-3">
            <FileText className="h-4 w-4 shrink-0 text-ds-txt3" />
            <span className="text-[13px] text-ds-txt2">Manage documents on desktop</span>
          </div>
        </div>
      )}
    </MobileScreen>
  );
}

function SummaryTile({ label, value, tone }: { label: string; value: string; tone?: StatusTone }) {
  const tint = tone === 'success' ? 'text-ds-success' : 'text-ds-txt';
  return (
    <div className="flex flex-col justify-center rounded-[18px] bg-ds-card px-4 py-3">
      <span className={`text-[20px] font-bold ${tint}`}>{value}</span>
      <span className="mt-0.5 text-[12px] text-ds-txt2">{label}</span>
    </div>
  );
}
