'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Plus, Trash2, X } from 'lucide-react';
import {
  MobileScreen,
  NavHeader,
  NavTextButton,
  SectionHeader,
  FieldGroup,
  SheetInput,
  StatusPill,
  Toggle,
  SheetContainer,
  type FieldDef,
} from '@/components/ui/ds';
import {
  FACILITY_TYPE_OPTIONS,
  facilityTypeLabel,
  facilityTypeTone,
} from '@/lib/carrier/facility-type';

export interface FacilityContact {
  name: string;
  phone: string;
  email: string;
  role: string;
}

export interface FacilityEditInitial {
  id: string;
  name: string;
  facilityType: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  latitude: number | null;
  longitude: number | null;
  lumperRequired: boolean;
  appointmentRequired: boolean;
  contacts: FacilityContact[];
  notes: string | null;
}

interface FormErrors {
  name?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
}

/**
 * Facility Edit — mobile-web design system view (carrier network).
 *
 * Mirrors the desktop FacilityForm field-for-field (same PATCH body, same
 * conditional-spread semantics, same validation) so there's no behavioural
 * drift between surfaces. Address is manual entry — the desktop's autocomplete
 * has no ds equivalent and every mobile ds form so far uses plain fields.
 */
export function FacilityEditMobile({ initial }: { initial: FacilityEditInitial }) {
  const router = useRouter();

  const [name, setName] = useState(initial.name ?? '');
  const [facilityType, setFacilityType] = useState(initial.facilityType ?? '');
  const [addressLine1, setAddressLine1] = useState(initial.addressLine1 ?? '');
  const [addressLine2, setAddressLine2] = useState(initial.addressLine2 ?? '');
  const [city, setCity] = useState(initial.city ?? '');
  const [state, setState] = useState(initial.state ?? '');
  const [zip, setZip] = useState(initial.zip ?? '');
  const [country, setCountry] = useState(initial.country ?? 'US');
  const [latitude, setLatitude] = useState(initial.latitude != null ? String(initial.latitude) : '');
  const [longitude, setLongitude] = useState(initial.longitude != null ? String(initial.longitude) : '');
  const [notes, setNotes] = useState(initial.notes ?? '');
  const [lumperRequired, setLumperRequired] = useState(initial.lumperRequired);
  const [appointmentRequired, setAppointmentRequired] = useState(initial.appointmentRequired);
  const [contacts, setContacts] = useState<FacilityContact[]>(initial.contacts ?? []);

  const [errors, setErrors] = useState<FormErrors>({});
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Snapshot for the discard guard on back.
  const snapshot = useRef(JSON.stringify(serialize()));
  function serialize() {
    return {
      name, facilityType, addressLine1, addressLine2, city, state, zip, country,
      latitude, longitude, notes, lumperRequired, appointmentRequired, contacts,
    };
  }
  const dirty = JSON.stringify(serialize()) !== snapshot.current;

  const location = useMemo(() => {
    if (city && state) return `${city}, ${state}`;
    return city || state || addressLine1 || null;
  }, [city, state, addressLine1]);

  function goBack() {
    if (dirty && !window.confirm('Discard your changes?')) return;
    router.push('/carrier/facilities');
  }

  function addContact() {
    setContacts((prev) => [...prev, { name: '', phone: '', email: '', role: '' }]);
  }
  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }
  function updateContact(index: number, field: keyof FacilityContact, value: string) {
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
      const res = await fetch(`/api/v1/carrier/facilities/${initial.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save facility');
      }
      navigator.vibrate?.(10);
      toast.success('Facility updated');
      router.push('/carrier/facilities');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setSaving(false);
    }
  }

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/carrier/facilities/${initial.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to delete facility');
      }
      toast.success('Facility deleted');
      router.push('/carrier/facilities');
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setDeleting(false);
      setConfirmDelete(false);
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
        title="Facility"
        onBack={goBack}
        right={<NavTextButton label={saving ? 'Saving…' : 'Save'} emphasized onClick={save} disabled={saving} />}
      />

      {/* Identity */}
      <div className="flex flex-col items-center pb-4 pt-2">
        <h1 className="text-center text-[22px] font-bold text-ds-txt">{name || 'Facility'}</h1>
        {location ? <p className="mt-1 text-center text-[13px] text-ds-txt3">{location}</p> : null}
        {facilityType ? (
          <div className="mt-3">
            <StatusPill label={facilityTypeLabel(facilityType)} tone={facilityTypeTone(facilityType)} />
          </div>
        ) : null}
      </div>

      <div className="space-y-6">
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

        {/* Delete */}
        <button
          type="button"
          onClick={() => setConfirmDelete(true)}
          className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-ds-danger/[0.14] text-[17px] font-semibold text-ds-danger transition active:opacity-75"
        >
          <Trash2 className="h-5 w-5" />
          Delete facility
        </button>
      </div>

      <SheetContainer
        open={confirmDelete}
        onCancel={() => (deleting ? undefined : setConfirmDelete(false))}
        title="Delete facility"
        subtitle={`${initial.name} will be removed. This can't be undone.`}
      >
        <div className="pt-2">
          <button
            type="button"
            onClick={handleDelete}
            disabled={deleting}
            className="flex h-[50px] w-full items-center justify-center gap-2 rounded-[15px] bg-ds-danger text-[17px] font-semibold text-white transition active:opacity-75 disabled:opacity-35"
          >
            <Trash2 className="h-5 w-5" />
            {deleting ? 'Deleting…' : 'Delete facility'}
          </button>
        </div>
      </SheetContainer>
    </MobileScreen>
  );
}
