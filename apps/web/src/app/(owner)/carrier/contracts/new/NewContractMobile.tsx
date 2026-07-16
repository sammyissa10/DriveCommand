'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  FieldGroup,
  SectionHeader,
  type FieldDef,
} from '@/components/ui/ds';
import {
  CONTRACT_TYPES,
  RATE_TYPES,
  FUEL_SURCHARGE_METHODS,
  STATUS_OPTIONS,
  PAYMENT_TERMS,
  YES_NO,
} from '../contract-options';

interface ClientOption {
  id: string;
  name: string;
}

/**
 * New Contract — mobile-web design system create page. Full ds form (kept as a
 * page, not a sheet — 16 fields exceed a quick-create). Same field set and
 * POST body as the desktop `ContractForm`; clients are server-fetched so the
 * required client <select> paints correctly on first render.
 */
export function NewContractMobile({
  clients,
  defaultClientId,
}: {
  clients: ClientOption[];
  defaultClientId?: string;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ clientId?: string; baseRate?: string }>({});
  const [form, setForm] = useState({
    clientId: defaultClientId ?? '',
    contractName: '',
    contractType: '',
    rateType: '',
    baseRate: '',
    fuelSurchargeMethod: 'none',
    fuelSurchargeRate: '',
    effectiveDate: '',
    expirationDate: '',
    detentionFreeMinutes: '120',
    detentionRatePerHour: '',
    tonuRate: '',
    layoverRatePerDay: '',
    paymentTermsOverride: '',
    autoRenew: 'false',
    status: 'active',
    notes: '',
  });

  const setField = (key: keyof typeof form, v: string) =>
    setForm((prev) => ({ ...prev, [key]: v }));

  function validate(): boolean {
    const e: { clientId?: string; baseRate?: string } = {};
    if (!form.clientId) e.clientId = 'Client is required';
    if (form.baseRate && (Number.isNaN(Number(form.baseRate)) || Number(form.baseRate) < 0)) {
      e.baseRate = 'Base rate must be a positive number';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  function submit() {
    if (!validate() || saving) return;
    setSaving(true);
    // Body shape ported verbatim from ContractForm.handleSubmit (create path).
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

    fetch('/api/v1/carrier/contracts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? 'Failed to create contract');
        }
        toast.success('Contract created');
        router.push('/carrier/contracts');
        router.refresh();
      })
      .catch((err) => toast.error(err instanceof Error ? err.message : 'Something went wrong'))
      .finally(() => setSaving(false));
  }

  const clientOptions = clients.map((c) => ({ value: c.id, label: c.name }));

  const termsFields: FieldDef[] = [
    { key: 'clientId', label: 'Client *', value: null, input: { value: form.clientId, onChange: (v) => { setField('clientId', v); if (errors.clientId) setErrors((e) => ({ ...e, clientId: undefined })); }, options: clientOptions, placeholder: 'Select a client', error: errors.clientId } },
    { key: 'contractName', label: 'Contract name', value: null, input: { value: form.contractName, onChange: (v) => setField('contractName', v), placeholder: 'e.g. Annual Freight Agreement 2026' } },
    { key: 'contractType', label: 'Type', value: null, input: { value: form.contractType, onChange: (v) => setField('contractType', v), options: CONTRACT_TYPES, placeholder: 'Select type' } },
    { key: 'status', label: 'Status', value: null, input: { value: form.status, onChange: (v) => setField('status', v), options: STATUS_OPTIONS } },
    { key: 'effectiveDate', label: 'Effective', value: null, input: { value: form.effectiveDate, onChange: (v) => setField('effectiveDate', v), type: 'date' } },
    { key: 'expirationDate', label: 'Expires', value: null, input: { value: form.expirationDate, onChange: (v) => setField('expirationDate', v), type: 'date' } },
    { key: 'paymentTermsOverride', label: 'Payment terms', value: null, input: { value: form.paymentTermsOverride, onChange: (v) => setField('paymentTermsOverride', v), options: PAYMENT_TERMS, placeholder: 'Client default' } },
    { key: 'autoRenew', label: 'Auto-renew', value: null, input: { value: form.autoRenew, onChange: (v) => setField('autoRenew', v), options: YES_NO } },
  ];
  const rateFields: FieldDef[] = [
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
  const notesFields: FieldDef[] = [
    { key: 'notes', label: 'Notes', value: null, input: { value: form.notes, onChange: (v) => setField('notes', v), multiline: true, placeholder: 'Additional notes about this contract…' } },
  ];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="New Contract"
        onBack={() => router.push('/carrier/contracts')}
        right={
          <NavTextButton
            label={saving ? 'Saving…' : 'Create'}
            emphasized
            onClick={submit}
            disabled={saving || !form.clientId}
          />
        }
      />

      <div className="flex flex-col items-center pb-4 pt-2">
        <h1 className="text-[22px] font-bold text-ds-txt">New Contract</h1>
        <p className="mt-1 text-[13px] text-ds-txt3">Create a rate agreement for a client</p>
      </div>

      <div className="space-y-6">
        <div>
          <SectionHeader title="Terms" />
          <FieldGroup fields={termsFields} isEditing />
        </div>
        <div>
          <SectionHeader title="Rate & accessorials" />
          <FieldGroup fields={rateFields} isEditing />
        </div>
        <div>
          <SectionHeader title="Notes" />
          <FieldGroup fields={notesFields} isEditing />
        </div>
      </div>
    </MobileScreen>
  );
}
