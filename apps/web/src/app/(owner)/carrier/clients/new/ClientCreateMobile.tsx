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
  Toggle,
  type FieldDef,
} from '@/components/ui/ds';
import { ContactsEditor, fromContactRows, type ContactRow } from '@/components/carrier/clients/ContactsEditor';

interface FormErrors {
  name?: string;
  email?: string;
  state?: string;
  portalEmail?: string;
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * New Client — mobile-web design system view (carrier network).
 *
 * Mirrors the desktop ClientForm create path field-for-field (same POST body,
 * same validation). Address is manual entry, consistent with every other
 * mobile ds form.
 */
export function ClientCreateMobile() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [dbaName, setDbaName] = useState('');
  const [mcNumber, setMcNumber] = useState('');
  const [dotNumber, setDotNumber] = useState('');
  const [taxId, setTaxId] = useState('');

  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('US');

  const [primaryContact, setPrimaryContact] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [website, setWebsite] = useState('');

  const [paymentTerms, setPaymentTerms] = useState('30');
  const [creditLimit, setCreditLimit] = useState('');

  const [portalAccess, setPortalAccess] = useState(false);
  const [portalEmail, setPortalEmail] = useState('');

  const [notes, setNotes] = useState('');

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [contactRows, setContactRows] = useState<ContactRow[]>([]);

  function validate(): boolean {
    const e: FormErrors = {};
    if (!name.trim()) e.name = 'Name is required';
    if (email && !isValidEmail(email)) e.email = 'Enter a valid email address';
    if (state && state.length > 2) e.state = 'State must be 2 characters max';
    if (portalAccess) {
      if (!portalEmail.trim()) {
        e.portalEmail = 'Portal email is required when portal access is enabled';
      } else if (!isValidEmail(portalEmail)) {
        e.portalEmail = 'Enter a valid portal email address';
      }
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  const canSave = name.trim().length > 0 && !saving;

  async function save() {
    if (!validate()) {
      const first = Object.keys(errors)[0];
      if (first) document.getElementById(`field-${first}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        name: name.trim(),
        ...(dbaName ? { dbaName } : {}),
        ...(mcNumber ? { mcNumber } : {}),
        ...(dotNumber ? { dotNumber } : {}),
        ...(taxId ? { taxId } : {}),
        ...(primaryContact ? { primaryContact } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        ...(website ? { website } : {}),
        ...(addressLine1 ? { addressLine1 } : {}),
        ...(addressLine2 ? { addressLine2 } : {}),
        ...(city ? { city } : {}),
        ...(state ? { state } : {}),
        ...(zip ? { zip } : {}),
        ...(country ? { country } : {}),
        portalAccess,
        ...(portalEmail ? { portalEmail } : {}),
        paymentTerms: parseInt(paymentTerms) || 30,
        ...(creditLimit ? { creditLimit } : {}),
        ...(notes ? { notes } : {}),
        ...(contactRows.length > 0 ? { contacts: fromContactRows(contactRows) } : {}),
      };
      const res = await fetch('/api/v1/carrier/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? data.error ?? 'Failed to create client');
      }
      navigator.vibrate?.(10);
      toast.success('Client created');
      router.push('/carrier/clients');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  // ---- field groups ----
  const basicInfoFields: FieldDef[] = [
    {
      key: 'name',
      label: 'Name *',
      input: {
        value: name,
        onChange: (v) => {
          setName(v);
          if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
        },
        placeholder: 'Client name',
        error: errors.name,
      },
    },
    { key: 'dbaName', label: 'DBA Name', input: { value: dbaName, onChange: setDbaName, placeholder: 'Doing Business As' } },
    { key: 'mcNumber', label: 'MC Number', input: { value: mcNumber, onChange: setMcNumber, placeholder: 'MC-123456' } },
    { key: 'dotNumber', label: 'DOT Number', input: { value: dotNumber, onChange: setDotNumber, placeholder: '1234567' } },
    { key: 'taxId', label: 'Tax ID / EIN', input: { value: taxId, onChange: setTaxId, placeholder: '12-3456789' } },
  ];

  const addressFields: FieldDef[] = [
    { key: 'addressLine1', label: 'Address Line 1', input: { value: addressLine1, onChange: setAddressLine1, placeholder: '123 Main St' } },
    { key: 'addressLine2', label: 'Address Line 2', input: { value: addressLine2, onChange: setAddressLine2, placeholder: 'Suite 100' } },
    { key: 'city', label: 'City', input: { value: city, onChange: setCity, placeholder: 'Chicago' } },
    {
      key: 'state',
      label: 'State',
      input: {
        value: state,
        onChange: (v) => {
          setState(v.toUpperCase());
          if (errors.state) setErrors((e) => ({ ...e, state: undefined }));
        },
        placeholder: 'IL',
        maxLength: 2,
        autoCapitalize: 'characters',
        error: errors.state,
      },
    },
    { key: 'zip', label: 'ZIP', input: { value: zip, onChange: setZip, placeholder: '60601', inputMode: 'numeric' } },
    { key: 'country', label: 'Country', input: { value: country, onChange: setCountry, placeholder: 'US' } },
  ];

  const contactFields: FieldDef[] = [
    { key: 'primaryContact', label: 'Primary Contact', input: { value: primaryContact, onChange: setPrimaryContact, placeholder: 'Jane Doe' } },
    { key: 'phone', label: 'Phone', input: { value: phone, onChange: setPhone, placeholder: '+1 (555) 000-0000', inputMode: 'tel' } },
    {
      key: 'email',
      label: 'Email',
      input: {
        value: email,
        onChange: (v) => {
          setEmail(v);
          if (errors.email) setErrors((e) => ({ ...e, email: undefined }));
        },
        type: 'email',
        placeholder: 'billing@client.com',
        inputMode: 'email',
        autoCapitalize: 'none',
        error: errors.email,
      },
    },
    { key: 'website', label: 'Website', input: { value: website, onChange: setWebsite, placeholder: 'https://example.com' } },
  ];

  const billingFields: FieldDef[] = [
    { key: 'paymentTerms', label: 'Payment Terms (days)', input: { value: paymentTerms, onChange: setPaymentTerms, type: 'number', placeholder: '30' } },
    { key: 'creditLimit', label: 'Credit Limit ($)', input: { value: creditLimit, onChange: setCreditLimit, type: 'number', placeholder: '0.00' } },
  ];

  const portalEmailFields: FieldDef[] = [
    {
      key: 'portalEmail',
      label: 'Portal Email *',
      input: {
        value: portalEmail,
        onChange: (v) => {
          setPortalEmail(v);
          if (errors.portalEmail) setErrors((e) => ({ ...e, portalEmail: undefined }));
        },
        type: 'email',
        placeholder: 'portal@client.com',
        error: errors.portalEmail,
      },
    },
  ];

  const notesFields: FieldDef[] = [
    { key: 'notes', label: 'Notes', input: { value: notes, onChange: setNotes, multiline: true, placeholder: 'Additional notes about this client' } },
  ];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="New Client"
        left={<NavTextButton label="Cancel" onClick={() => router.push('/carrier/clients')} />}
        right={<NavTextButton label={saving ? 'Creating…' : 'Create'} emphasized onClick={save} disabled={!canSave} />}
      />

      <div className="space-y-6 pt-2">
        <div>
          <SectionHeader title="Basic Info" />
          <FieldGroup fields={basicInfoFields} isEditing />
        </div>

        <div>
          <SectionHeader title="Address" />
          <FieldGroup fields={addressFields} isEditing />
        </div>

        <div>
          <SectionHeader title="Contact" />
          <FieldGroup fields={contactFields} isEditing />
        </div>

        <div>
          <SectionHeader title="Contacts" />
          <div className="rounded-[20px] bg-ds-card p-4">
            <ContactsEditor rows={contactRows} onChange={setContactRows} />
          </div>
        </div>

        <div>
          <SectionHeader title="Billing" />
          <FieldGroup fields={billingFields} isEditing />
        </div>

        <div>
          <SectionHeader title="Portal Access" />
          <div className="flex gap-2">
            <Toggle label="Client portal access" on={portalAccess} onChange={setPortalAccess} />
          </div>
          {portalAccess ? <div className="mt-3"><FieldGroup fields={portalEmailFields} isEditing /></div> : null}
        </div>

        <div>
          <SectionHeader title="Notes" />
          <FieldGroup fields={notesFields} isEditing />
        </div>

        <PrimaryButton
          label={saving ? 'Creating…' : 'Create client'}
          onClick={save}
          disabled={!canSave}
          loading={saving}
        />
      </div>
    </MobileScreen>
  );
}
