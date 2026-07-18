'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  FieldGroup,
  PrimaryButton,
  type FieldDef,
} from '@/components/ui/ds';

interface FacilityOption {
  id: string;
  name: string;
}

interface FormErrors {
  firstName?: string;
  lastName?: string;
}

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
];

const CDL_STATE_OPTIONS = [{ label: 'Select state…', value: '' }, ...US_STATES.map((s) => ({ label: s, value: s }))];

const CDL_CLASS_OPTIONS = [
  { label: 'Select class…', value: '' },
  { label: 'Class A (CDL)', value: 'A' },
  { label: 'Class B (CDL)', value: 'B' },
  { label: 'Class C (CDL)', value: 'C' },
  { label: 'Class D (Non-CDL)', value: 'D' },
  { label: 'Class E (Non-CDL)', value: 'E' },
  { label: 'Non-CDL / Other', value: 'OTHER' },
];

const PAY_MODEL_OPTIONS = [
  { label: 'Per Mile', value: 'per_mile' },
  { label: 'Percentage of Gross', value: 'percentage_gross' },
  { label: 'Hourly', value: 'hourly' },
  { label: 'Flat Rate', value: 'flat_rate' },
  { label: 'Team Split', value: 'team_split' },
];

const PAY_PERIOD_OPTIONS = [
  { label: 'Weekly', value: 'weekly' },
  { label: 'Bi-weekly', value: 'biweekly' },
  { label: 'Monthly', value: 'monthly' },
];

const PAY_RATE_LABELS: Record<string, string> = {
  per_mile: 'Rate per Mile ($)',
  percentage_gross: 'Percentage of Gross (%)',
  hourly: 'Hourly Rate ($)',
  flat_rate: 'Flat Rate ($)',
  team_split: 'Rate per Mile ($)',
};

/**
 * New Driver — mobile-web design system view (carrier network).
 *
 * Mirrors the desktop CarrierDriverForm create path field-for-field (same
 * POST body, same validation). Status field omitted on create per desktop
 * (isEdit-only). Select option values that default empty ('' ) always carry
 * an explicit "Select…" placeholder option so the native <select> doesn't
 * silently render the wrong first option.
 */
export function DriverCreateMobile({ facilities }: { facilities: FacilityOption[] }) {
  const router = useRouter();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');

  const [cdlNumber, setCdlNumber] = useState('');
  const [cdlState, setCdlState] = useState('');
  const [cdlClass, setCdlClass] = useState('');
  const [cdlExpiry, setCdlExpiry] = useState('');

  const [homeTerminalId, setHomeTerminalId] = useState('');
  const [payModel, setPayModel] = useState('per_mile');
  const [payRate, setPayRate] = useState('');
  const [payPeriod, setPayPeriod] = useState('weekly');

  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  const homeTerminalOptions = [{ label: 'Select terminal…', value: '' }, ...facilities.map((f) => ({ label: f.name, value: f.id }))];

  function validate(): boolean {
    const e: FormErrors = {};
    if (!firstName.trim()) e.firstName = 'First name is required';
    if (!lastName.trim()) e.lastName = 'Last name is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const canSave = firstName.trim().length > 0 && lastName.trim().length > 0 && !saving;

  async function save() {
    if (!validate()) {
      const first = Object.keys(errors)[0];
      if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(cdlNumber ? { cdlNumber } : {}),
        ...(cdlState ? { cdlState } : {}),
        ...(cdlClass ? { cdlClass } : {}),
        ...(cdlExpiry ? { cdlExpiry } : {}),
        ...(homeTerminalId ? { homeTerminalId } : {}),
        payModel,
        ...(payRate ? { payRate: Number(payRate) } : {}),
        payPeriod,
        ...(notes ? { notes } : {}),
      };
      const res = await fetch('/api/v1/carrier/fleet/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to create driver');
      }
      navigator.vibrate?.(10);
      toast.success('Driver created');
      router.push('/carrier/fleet/drivers');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  // ---- field groups ----
  const basicInfoFields: FieldDef[] = [
    {
      key: 'firstName',
      label: 'First Name *',
      input: {
        value: firstName,
        onChange: (v) => {
          setFirstName(v);
          if (errors.firstName) setErrors((e) => ({ ...e, firstName: undefined }));
        },
        placeholder: 'John',
        error: errors.firstName,
      },
    },
    {
      key: 'lastName',
      label: 'Last Name *',
      input: {
        value: lastName,
        onChange: (v) => {
          setLastName(v);
          if (errors.lastName) setErrors((e) => ({ ...e, lastName: undefined }));
        },
        placeholder: 'Smith',
        error: errors.lastName,
      },
    },
    { key: 'email', label: 'Email', input: { value: email, onChange: setEmail, type: 'email', placeholder: 'driver@example.com', inputMode: 'email', autoCapitalize: 'none' } },
    { key: 'phone', label: 'Phone', input: { value: phone, onChange: setPhone, placeholder: '+1 (555) 000-0000', inputMode: 'tel' } },
  ];

  const licenseFields: FieldDef[] = [
    { key: 'cdlNumber', label: 'License Number', input: { value: cdlNumber, onChange: setCdlNumber, placeholder: 'D1234567' } },
    { key: 'cdlState', label: 'License State', input: { value: cdlState, onChange: setCdlState, options: CDL_STATE_OPTIONS } },
    { key: 'cdlClass', label: 'License Class', input: { value: cdlClass, onChange: setCdlClass, options: CDL_CLASS_OPTIONS } },
    { key: 'cdlExpiry', label: 'License Expiry', input: { value: cdlExpiry, onChange: setCdlExpiry, type: 'date' } },
  ];

  const payFields: FieldDef[] = [
    { key: 'homeTerminalId', label: 'Home Terminal', input: { value: homeTerminalId, onChange: setHomeTerminalId, options: homeTerminalOptions } },
    { key: 'payModel', label: 'Pay Model', input: { value: payModel, onChange: setPayModel, options: PAY_MODEL_OPTIONS } },
    { key: 'payRate', label: PAY_RATE_LABELS[payModel] ?? 'Pay Rate', input: { value: payRate, onChange: setPayRate, type: 'number', placeholder: '0.00' } },
    { key: 'payPeriod', label: 'Pay Period', input: { value: payPeriod, onChange: setPayPeriod, options: PAY_PERIOD_OPTIONS } },
  ];

  const notesFields: FieldDef[] = [
    { key: 'notes', label: 'Notes', input: { value: notes, onChange: setNotes, multiline: true, placeholder: 'Additional notes about this driver' } },
  ];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="New Driver"
        left={<NavTextButton label="Cancel" onClick={() => router.push('/carrier/fleet/drivers')} />}
        right={<NavTextButton label={saving ? 'Creating…' : 'Create'} emphasized onClick={save} disabled={!canSave} />}
      />

      <div className="space-y-6 pt-2">
        <div>
          <SectionHeader title="Basic Info" />
          <FieldGroup fields={basicInfoFields} isEditing />
        </div>

        <div>
          <SectionHeader title="License Information" />
          <FieldGroup fields={licenseFields} isEditing />
        </div>

        <div>
          <SectionHeader title="Pay Configuration" />
          <FieldGroup fields={payFields} isEditing />
        </div>

        <div>
          <SectionHeader title="Notes" />
          <FieldGroup fields={notesFields} isEditing />
        </div>

        <PrimaryButton
          label={saving ? 'Creating…' : 'Create driver'}
          onClick={save}
          disabled={!canSave}
          loading={saving}
        />
      </div>
    </MobileScreen>
  );
}
