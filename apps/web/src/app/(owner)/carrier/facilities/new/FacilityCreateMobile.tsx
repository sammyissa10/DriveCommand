'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { X } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  FieldGroup,
  SheetInput,
  PrimaryButton,
  Toggle,
  type FieldDef,
} from '@/components/ui/ds';
import { FACILITY_TYPE_OPTIONS } from '@/lib/carrier/facility-type';

interface Contact {
  name: string;
  phone: string;
  email: string;
  role: string;
}

interface FormErrors {
  name?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
}

/**
 * New Facility — mobile-web design system view (carrier network).
 *
 * Mirrors the desktop FacilityForm create path field-for-field (same POST body,
 * same validation). Address is manual entry, consistent with every other mobile
 * ds form.
 */
export function FacilityCreateMobile() {
  const router = useRouter();

  const [name, setName] = useState('');
  const [facilityType, setFacilityType] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [country, setCountry] = useState('US');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [notes, setNotes] = useState('');
  const [lumperRequired, setLumperRequired] = useState(false);
  const [appointmentRequired, setAppointmentRequired] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);

  function addContact() {
    setContacts((prev) => [...prev, { name: '', phone: '', email: '', role: '' }]);
  }
  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }
  function updateContact(index: number, field: keyof Contact, value: string) {
    setContacts((prev) => prev.map((c, i) => (i === index ? { ...c, [field]: value } : c)));
  }

  function validate(): boolean {
    const e: FormErrors = {};
    if (!name.trim()) e.name = 'Name is required';
    if (state && state.length > 2) e.state = 'State must be 2 characters max';
    if (latitude && isNaN(Number(latitude))) e.latitude = 'Latitude must be a number';
    if (longitude && isNaN(Number(longitude))) e.longitude = 'Longitude must be a number';
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
      const filteredContacts = contacts.filter((c) => c.name.trim() !== '');
      const body: Record<string, unknown> = {
        name: name.trim(),
        ...(facilityType ? { facilityType } : {}),
        ...(addressLine1 ? { addressLine1 } : {}),
        ...(addressLine2 ? { addressLine2 } : {}),
        ...(city ? { city } : {}),
        ...(state ? { state } : {}),
        ...(zip ? { zip } : {}),
        ...(country ? { country } : {}),
        ...(latitude ? { latitude: Number(latitude) } : {}),
        ...(longitude ? { longitude: Number(longitude) } : {}),
        ...(notes ? { notes } : {}),
        lumperRequired,
        appointmentRequired,
        contacts: filteredContacts,
      };
      const res = await fetch('/api/v1/carrier/facilities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to create facility');
      }
      navigator.vibrate?.(10);
      toast.success('Facility created');
      router.push('/carrier/facilities');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  // ---- field groups ----
  const detailFields: FieldDef[] = [
    {
      key: 'name',
      label: 'Name *',
      input: {
        value: name,
        onChange: (v) => {
          setName(v);
          if (errors.name) setErrors((e) => ({ ...e, name: undefined }));
        },
        placeholder: 'Facility name',
        error: errors.name,
      },
    },
    {
      key: 'facilityType',
      label: 'Type',
      input: {
        value: facilityType,
        onChange: setFacilityType,
        options: [{ label: 'Select type…', value: '' }, ...FACILITY_TYPE_OPTIONS.map((t) => ({ label: t.label, value: t.value }))],
      },
    },
  ];

  const addressFields: FieldDef[] = [
    { key: 'addressLine1', label: 'Address line 1', input: { value: addressLine1, onChange: setAddressLine1, placeholder: '123 Main St' } },
    { key: 'addressLine2', label: 'Address line 2', input: { value: addressLine2, onChange: setAddressLine2, placeholder: 'Suite 100' } },
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

  const coordinateFields: FieldDef[] = [
    {
      key: 'latitude',
      label: 'Latitude',
      input: {
        value: latitude,
        onChange: (v) => {
          setLatitude(v.replace(/[^\d.-]/g, ''));
          if (errors.latitude) setErrors((e) => ({ ...e, latitude: undefined }));
        },
        placeholder: '41.8781',
        inputMode: 'decimal',
        error: errors.latitude,
      },
    },
    {
      key: 'longitude',
      label: 'Longitude',
      input: {
        value: longitude,
        onChange: (v) => {
          setLongitude(v.replace(/[^\d.-]/g, ''));
          if (errors.longitude) setErrors((e) => ({ ...e, longitude: undefined }));
        },
        placeholder: '-87.6298',
        inputMode: 'decimal',
        error: errors.longitude,
      },
    },
  ];

  const notesFields: FieldDef[] = [
    { key: 'notes', label: 'Notes', input: { value: notes, onChange: setNotes, multiline: true, placeholder: 'Anything worth remembering' } },
  ];

  return (
    <MobileScreen className="pb-10 pt-2">
      <NavHeader
        title="New Facility"
        left={<NavTextButton label="Cancel" onClick={() => router.push('/carrier/facilities')} />}
        right={<NavTextButton label={saving ? 'Creating…' : 'Create'} emphasized onClick={save} disabled={!canSave} />}
      />

      <div className="space-y-6 pt-2">
        <div>
          <SectionHeader title="Details" />
          <FieldGroup fields={detailFields} isEditing />
        </div>

        <div>
          <SectionHeader title="Address" />
          <FieldGroup fields={addressFields} isEditing />
        </div>

        <div>
          <SectionHeader title="Requirements" />
          <div className="flex gap-2">
            <Toggle label="Appointment" on={appointmentRequired} onChange={setAppointmentRequired} />
            <Toggle label="Lumper" on={lumperRequired} onChange={setLumperRequired} />
          </div>
        </div>

        <div>
          <SectionHeader title="Contacts" action={{ label: 'Add', onClick: addContact }} />
          {contacts.length === 0 ? (
            <div className="rounded-[20px] bg-ds-card px-4 py-5 text-center text-[13px] text-ds-txt3">
              No contacts yet. Tap Add to add one.
            </div>
          ) : (
            <div className="space-y-3">
              {contacts.map((contact, index) => (
                <div key={index} className="space-y-2.5 rounded-[20px] bg-ds-card p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-semibold text-ds-txt2">Contact {index + 1}</span>
                    <button
                      type="button"
                      onClick={() => removeContact(index)}
                      aria-label={`Remove contact ${index + 1}`}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-ds-txt3 transition active:opacity-75"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                  <SheetInput label="Name" value={contact.name} onChange={(e) => updateContact(index, 'name', e.target.value)} placeholder="Jane Doe" />
                  <SheetInput label="Phone" value={contact.phone} onChange={(e) => updateContact(index, 'phone', e.target.value)} placeholder="+1 (555) 000-0000" inputMode="tel" />
                  <SheetInput label="Email" value={contact.email} onChange={(e) => updateContact(index, 'email', e.target.value)} placeholder="contact@example.com" inputMode="email" autoCapitalize="none" />
                  <SheetInput label="Role" value={contact.role} onChange={(e) => updateContact(index, 'role', e.target.value)} placeholder="Dock Manager" />
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <SectionHeader title="Coordinates" />
          <FieldGroup fields={coordinateFields} isEditing />
        </div>

        <div>
          <SectionHeader title="Notes" />
          <FieldGroup fields={notesFields} isEditing />
        </div>

        <PrimaryButton
          label={saving ? 'Creating…' : 'Create facility'}
          onClick={save}
          disabled={!canSave}
          loading={saving}
        />
      </div>
    </MobileScreen>
  );
}
