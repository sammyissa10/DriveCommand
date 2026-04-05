'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';

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
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  notes: string | null;
}

interface FacilityFormProps {
  initialData?: FacilityData;
}

const FACILITY_TYPES = [
  { value: 'terminal', label: 'Terminal' },
  { value: 'warehouse', label: 'Warehouse' },
  { value: 'distribution_center', label: 'Distribution Center' },
  { value: 'cross_dock', label: 'Cross Dock' },
  { value: 'customer_location', label: 'Customer Location' },
  { value: 'pickup', label: 'Pickup' },
  { value: 'delivery', label: 'Delivery' },
];

interface FormErrors {
  name?: string;
  contactEmail?: string;
  state?: string;
  latitude?: string;
  longitude?: string;
}

function validate(values: Record<string, string>): FormErrors {
  const errors: FormErrors = {};
  if (!values.name.trim()) {
    errors.name = 'Name is required';
  }
  if (values.contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.contactEmail)) {
    errors.contactEmail = 'Enter a valid email address';
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

export function FacilityForm({ initialData }: FacilityFormProps) {
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
    contactName: initialData?.contactName ?? '',
    contactPhone: initialData?.contactPhone ?? '',
    contactEmail: initialData?.contactEmail ?? '',
    notes: initialData?.notes ?? '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value } = e.target;
    setValues((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormErrors]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
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
        ...(values.contactName ? { contactName: values.contactName } : {}),
        ...(values.contactPhone ? { contactPhone: values.contactPhone } : {}),
        ...(values.contactEmail ? { contactEmail: values.contactEmail } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
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

      toast.success(isEdit ? 'Facility updated' : 'Facility created');
      router.push('/carrier/facilities');
      router.refresh();
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

      {/* Contact section */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Contact
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="contactName">
              Contact Name
            </label>
            <Input
              id="contactName"
              name="contactName"
              value={values.contactName}
              onChange={handleChange}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="contactPhone">
              Contact Phone
            </label>
            <Input
              id="contactPhone"
              name="contactPhone"
              value={values.contactPhone}
              onChange={handleChange}
              placeholder="+1 (555) 000-0000"
            />
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <label className="text-sm font-medium text-foreground" htmlFor="contactEmail">
              Contact Email
            </label>
            <Input
              id="contactEmail"
              name="contactEmail"
              type="email"
              value={values.contactEmail}
              onChange={handleChange}
              placeholder="contact@facility.com"
            />
            {errors.contactEmail && (
              <p className="text-xs text-destructive">{errors.contactEmail}</p>
            )}
          </div>
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
