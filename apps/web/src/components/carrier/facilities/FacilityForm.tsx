'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

interface FacilityContact {
  name: string;
  phone: string;
  email: string;
  role: string;
}

export interface FacilityData {
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
  // Legacy single-contact fields (read-only, kept for backward compat)
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  // New fields
  lumperRequired?: boolean;
  appointmentRequired?: boolean;
  contacts?: FacilityContact[];
  notes: string | null;
}

interface FacilityFormProps {
  initialData?: FacilityData;
  /** Called after a successful save instead of navigating to /carrier/facilities */
  onSuccess?: (created: { id: string; name: string; city: string | null; state: string | null; facilityType: string | null }) => void;
}

const FACILITY_TYPES = [
  { value: 'terminal',       label: 'Terminal' },
  { value: 'yard',           label: 'Yard' },
  { value: 'warehouse',      label: 'Warehouse' },
  { value: 'drop_yard',      label: 'Drop Yard' },
  { value: 'customer_site',  label: 'Customer Site' },
];

interface FormErrors {
  name?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
}

function validate(values: Record<string, string>): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) {
    errors.name = 'Name is required';
  }
  if (values.state && values.state.length > 2) {
    errors.state = 'State must be 2 characters max';
  }
  if (values.latitude && isNaN(Number(values.latitude))) {
    errors.latitude = 'Latitude must be a number';
  }
  if (values.longitude && isNaN(Number(values.longitude))) {
    errors.longitude = 'Longitude must be a number';
  }
  return errors;
}

function normalizeContacts(raw: unknown): FacilityContact[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((c: unknown) => {
    const item = c as Record<string, unknown>;
    return {
      name:  typeof item.name  === 'string' ? item.name  : '',
      phone: typeof item.phone === 'string' ? item.phone : '',
      email: typeof item.email === 'string' ? item.email : '',
      role:  typeof item.role  === 'string' ? item.role  : '',
    };
  });
}

export function FacilityForm({ initialData, onSuccess }: FacilityFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialData?.id);

  const [values, setValues] = useState({
    name: initialData?.name ?? '',
    facilityType: initialData?.facilityType ?? '',
    addressLine1: initialData?.addressLine1 ?? '',
    addressLine2: initialData?.addressLine2 ?? '',
    city: initialData?.city ?? '',
    state: initialData?.state ?? '',
    zip: initialData?.zip ?? '',
    country: initialData?.country ?? 'US',
    latitude: initialData?.latitude != null ? String(initialData.latitude) : '',
    longitude: initialData?.longitude != null ? String(initialData.longitude) : '',
    notes: initialData?.notes ?? '',
  });

  const [lumperRequired, setLumperRequired] = useState(initialData?.lumperRequired ?? false);
  const [appointmentRequired, setAppointmentRequired] = useState(initialData?.appointmentRequired ?? false);
  const [contacts, setContacts] = useState<FacilityContact[]>(
    normalizeContacts(initialData?.contacts)
  );

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  }

  function addContact() {
    setContacts((prev) => [...prev, { name: '', phone: '', email: '', role: '' }]);
  }

  function removeContact(index: number) {
    setContacts((prev) => prev.filter((_, i) => i !== index));
  }

  function updateContact(index: number, field: keyof FacilityContact, value: string) {
    setContacts((prev) =>
      prev.map((c, i) => (i === index ? { ...c, [field]: value } : c))
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const validationErrors = validate(values);
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      const filteredContacts = contacts.filter((c) => c.name.trim() !== '');

      const body: Record<string, unknown> = {
        name: values.name.trim(),
        ...(values.facilityType ? { facilityType: values.facilityType } : {}),
        ...(values.addressLine1 ? { addressLine1: values.addressLine1 } : {}),
        ...(values.addressLine2 ? { addressLine2: values.addressLine2 } : {}),
        ...(values.city ? { city: values.city } : {}),
        ...(values.state ? { state: values.state } : {}),
        ...(values.zip ? { zip: values.zip } : {}),
        ...(values.country ? { country: values.country } : {}),
        ...(values.latitude ? { latitude: Number(values.latitude) } : {}),
        ...(values.longitude ? { longitude: Number(values.longitude) } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
        lumperRequired,
        appointmentRequired,
        contacts: filteredContacts,
      };

      const url = isEdit
        ? `/api/v1/carrier/facilities/${initialData!.id}`
        : '/api/v1/carrier/facilities';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? 'Failed to save facility');
      }

      const created = await res.json();
      toast.success(isEdit ? 'Facility updated' : 'Facility created');
      if (onSuccess) {
        onSuccess({
          id: created.id,
          name: created.name,
          city: created.city ?? null,
          state: created.state ?? null,
          facilityType: created.facilityType ?? null,
        });
      } else {
        router.push('/carrier/facilities');
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Name + Type */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="name">
            Name <span className="text-destructive">*</span>
          </label>
          <Input
            id="name"
            name="name"
            value={values.name}
            onChange={handleChange}
            placeholder="Facility name"
          />
          {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="facilityType">
            Type
          </label>
          <Select
            value={values.facilityType || undefined}
            onValueChange={(val) => setValues((prev) => ({ ...prev, facilityType: val }))}
          >
            <SelectTrigger id="facilityType">
              <SelectValue placeholder="Select type" />
            </SelectTrigger>
            <SelectContent>
              {FACILITY_TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>
                  {t.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Address section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Address
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="addressLine1">
              Address Line 1
            </label>
            <Input
              id="addressLine1"
              name="addressLine1"
              value={values.addressLine1}
              onChange={handleChange}
              placeholder="123 Main St"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="addressLine2">
              Address Line 2
            </label>
            <Input
              id="addressLine2"
              name="addressLine2"
              value={values.addressLine2}
              onChange={handleChange}
              placeholder="Suite 100"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="city">
              City
            </label>
            <Input
              id="city"
              name="city"
              value={values.city}
              onChange={handleChange}
              placeholder="Chicago"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="state">
                State
              </label>
              <Input
                id="state"
                name="state"
                value={values.state}
                onChange={handleChange}
                placeholder="IL"
                maxLength={2}
              />
              {errors.state && <p className="text-xs text-destructive">{errors.state}</p>}
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground" htmlFor="zip">
                ZIP
              </label>
              <Input
                id="zip"
                name="zip"
                value={values.zip}
                onChange={handleChange}
                placeholder="60601"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="country">
              Country
            </label>
            <Input
              id="country"
              name="country"
              value={values.country}
              onChange={handleChange}
              placeholder="US"
            />
          </div>
        </div>
      </div>

      {/* Options section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Options
        </h3>
        <div className="flex flex-wrap gap-6">
          <div className="flex items-center gap-2.5">
            <Switch
              id="lumperRequired"
              checked={lumperRequired}
              onCheckedChange={setLumperRequired}
            />
            <label
              htmlFor="lumperRequired"
              className="text-sm font-medium text-foreground cursor-pointer"
            >
              Lumper Required
            </label>
          </div>
          <div className="flex items-center gap-2.5">
            <Switch
              id="appointmentRequired"
              checked={appointmentRequired}
              onCheckedChange={setAppointmentRequired}
            />
            <label
              htmlFor="appointmentRequired"
              className="text-sm font-medium text-foreground cursor-pointer"
            >
              Appointment Required
            </label>
          </div>
        </div>
      </div>

      {/* Contacts section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Contacts
          </h3>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addContact}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add Contact
          </Button>
        </div>

        {contacts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No contacts added. Click &quot;Add Contact&quot; to add facility contacts.
          </p>
        )}

        <div className="space-y-3">
          {contacts.map((contact, index) => (
            <div
              key={index}
              className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_1fr_1fr_1fr_auto] items-end"
            >
              <div className="space-y-1.5">
                {index === 0 && (
                  <label className="text-xs font-medium text-muted-foreground">Name</label>
                )}
                <Input
                  value={contact.name}
                  onChange={(e) => updateContact(index, 'name', e.target.value)}
                  placeholder="Jane Doe"
                />
              </div>
              <div className="space-y-1.5">
                {index === 0 && (
                  <label className="text-xs font-medium text-muted-foreground">Phone</label>
                )}
                <Input
                  value={contact.phone}
                  onChange={(e) => updateContact(index, 'phone', e.target.value)}
                  placeholder="+1 (555) 000-0000"
                />
              </div>
              <div className="space-y-1.5">
                {index === 0 && (
                  <label className="text-xs font-medium text-muted-foreground">Email</label>
                )}
                <Input
                  value={contact.email}
                  onChange={(e) => updateContact(index, 'email', e.target.value)}
                  placeholder="contact@example.com"
                />
              </div>
              <div className="space-y-1.5">
                {index === 0 && (
                  <label className="text-xs font-medium text-muted-foreground">Role</label>
                )}
                <Input
                  value={contact.role}
                  onChange={(e) => updateContact(index, 'role', e.target.value)}
                  placeholder="Dock Manager"
                />
              </div>
              <button
                type="button"
                onClick={() => removeContact(index)}
                className="flex h-9 w-9 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-destructive hover:border-destructive transition-colors"
                aria-label="Remove contact"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Coordinates */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="latitude">
            Latitude
          </label>
          <Input
            id="latitude"
            name="latitude"
            value={values.latitude}
            onChange={handleChange}
            placeholder="41.8781"
          />
          {errors.latitude && <p className="text-xs text-destructive">{errors.latitude}</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="longitude">
            Longitude
          </label>
          <Input
            id="longitude"
            name="longitude"
            value={values.longitude}
            onChange={handleChange}
            placeholder="-87.6298"
          />
          {errors.longitude && <p className="text-xs text-destructive">{errors.longitude}</p>}
        </div>
      </div>

      {/* Notes */}
      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground" htmlFor="notes">
          Notes
        </label>
        <Textarea
          id="notes"
          name="notes"
          value={values.notes}
          onChange={handleChange}
          placeholder="Additional notes about this facility..."
          rows={3}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/carrier/facilities')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Facility'}
        </Button>
      </div>
    </form>
  );
}
