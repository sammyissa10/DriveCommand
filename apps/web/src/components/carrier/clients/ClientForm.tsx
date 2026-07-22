'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { AddressAutocomplete } from '@/components/shared/address-autocomplete';
import { ContactsEditor, toContactRows, fromContactRows, type ContactRow } from '@/components/carrier/clients/ContactsEditor';
import type { ContactInput } from '@/lib/carrier/client-contacts';

const US_STATES: Record<string, string> = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC',
  'puerto rico': 'PR', 'guam': 'GU', 'virgin islands': 'VI',
  'american samoa': 'AS', 'northern mariana islands': 'MP',
};

function parseFormattedAddress(displayName: string) {
  const parts = displayName.split(',').map((s) => s.trim());
  const street = parts[0] || '';
  const city = parts.length >= 3 ? parts[1] : '';
  const lastPart = parts[parts.length - 1] || '';
  const stateZipMatch = lastPart.match(/^([A-Za-z\s]+?)(?:\s+(\d{5}(?:-\d{4})?))?$/);
  const rawState = stateZipMatch?.[1]?.trim() || '';
  const zip = stateZipMatch?.[2] || '';
  const state = US_STATES[rawState.toLowerCase()] ?? rawState;
  return { street, city, state, zip };
}

export interface ClientData {
  id: string;
  name: string;
  dbaName: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
  taxId: string | null;
  primaryContact: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  portalAccess: boolean;
  portalEmail: string | null;
  paymentTerms?: number | null;
  creditLimit?: string | null;
  notes: string | null;
  contacts?: ContactInput[];
}

interface ClientFormProps {
  initialData?: ClientData;
}

interface FormErrors {
  name?: string;
  email?: string;
  state?: string;
  portalEmail?: string;
}

function validate(values: Record<string, string | boolean>): FormErrors {
  const errors: FormErrors = {};
  if (!String(values.name).trim()) {
    errors.name = 'Name is required';
  }
  if (values.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email))) {
    errors.email = 'Enter a valid email address';
  }
  if (values.state && String(values.state).length > 2) {
    errors.state = 'State must be 2 characters max';
  }
  if (values.portalAccess) {
    if (!String(values.portalEmail).trim()) {
      errors.portalEmail = 'Portal email is required when portal access is enabled';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.portalEmail))) {
      errors.portalEmail = 'Enter a valid portal email address';
    }
  }
  return errors;
}

export function ClientForm({ initialData }: ClientFormProps) {
  const router = useRouter();
  const isEdit = Boolean(initialData?.id);

  const [values, setValues] = useState({
    name: initialData?.name ?? '',
    dbaName: initialData?.dbaName ?? '',
    mcNumber: initialData?.mcNumber ?? '',
    dotNumber: initialData?.dotNumber ?? '',
    taxId: initialData?.taxId ?? '',
    primaryContact: initialData?.primaryContact ?? '',
    email: initialData?.email ?? '',
    phone: initialData?.phone ?? '',
    website: initialData?.website ?? '',
    addressLine1: initialData?.addressLine1 ?? '',
    addressLine2: initialData?.addressLine2 ?? '',
    city: initialData?.city ?? '',
    state: initialData?.state ?? '',
    zip: initialData?.zip ?? '',
    country: initialData?.country ?? 'US',
    portalAccess: initialData?.portalAccess ?? false,
    portalEmail: initialData?.portalEmail ?? '',
    paymentTerms: initialData?.paymentTerms?.toString() ?? '30',
    creditLimit: initialData?.creditLimit ?? '',
    notes: initialData?.notes ?? '',
  });

  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [contactRows, setContactRows] = useState<ContactRow[]>(() =>
    toContactRows(initialData?.contacts),
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    const checked = type === 'checkbox' ? (e.target as HTMLInputElement).checked : undefined;
    setValues((prev) => ({ ...prev, [name]: checked !== undefined ? checked : value }));
    if (errors[name as keyof FormErrors] !== undefined) {
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
        ...(values.dbaName ? { dbaName: values.dbaName } : {}),
        ...(values.mcNumber ? { mcNumber: values.mcNumber } : {}),
        ...(values.dotNumber ? { dotNumber: values.dotNumber } : {}),
        ...(values.taxId ? { taxId: values.taxId } : {}),
        ...(values.primaryContact ? { primaryContact: values.primaryContact } : {}),
        ...(values.email ? { email: values.email } : {}),
        ...(values.phone ? { phone: values.phone } : {}),
        ...(values.website ? { website: values.website } : {}),
        ...(values.addressLine1 ? { addressLine1: values.addressLine1 } : {}),
        ...(values.addressLine2 ? { addressLine2: values.addressLine2 } : {}),
        ...(values.city ? { city: values.city } : {}),
        ...(values.state ? { state: values.state } : {}),
        ...(values.zip ? { zip: values.zip } : {}),
        ...(values.country ? { country: values.country } : {}),
        portalAccess: values.portalAccess,
        ...(values.portalEmail ? { portalEmail: values.portalEmail } : {}),
        paymentTerms: parseInt(values.paymentTerms) || 30,
        ...(values.creditLimit ? { creditLimit: values.creditLimit } : {}),
        ...(values.notes ? { notes: values.notes } : {}),
        contacts: fromContactRows(contactRows),
      };

      const url = isEdit
        ? `/api/v1/carrier/clients/${initialData!.id}`
        : '/api/v1/carrier/clients';
      const method = isEdit ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.detail ?? data.error ?? 'Failed to save client');
      }

      toast.success(isEdit ? 'Client updated' : 'Client created');
      router.refresh();
      router.push('/carrier/clients');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Basic Info */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Basic Info
        </h3>
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
              placeholder="Client name"
            />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="dbaName">
              DBA Name
            </label>
            <Input
              id="dbaName"
              name="dbaName"
              value={values.dbaName}
              onChange={handleChange}
              placeholder="Doing Business As"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="mcNumber">
              MC Number
            </label>
            <Input
              id="mcNumber"
              name="mcNumber"
              value={values.mcNumber}
              onChange={handleChange}
              placeholder="MC-123456"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="dotNumber">
              DOT Number
            </label>
            <Input
              id="dotNumber"
              name="dotNumber"
              value={values.dotNumber}
              onChange={handleChange}
              placeholder="1234567"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="taxId">
              Tax ID / EIN
            </label>
            <Input
              id="taxId"
              name="taxId"
              value={values.taxId}
              onChange={handleChange}
              placeholder="12-3456789"
            />
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Address
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="addressLine1">
              Address Line 1
            </label>
            <AddressAutocomplete
              id="addressLine1"
              name="addressLine1"
              defaultValue={values.addressLine1}
              placeholder="123 Main St"
              className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
              onPlaceSelect={(place) => {
                const parsed = parseFormattedAddress(place.displayName);
                setValues((prev) => ({
                  ...prev,
                  addressLine1: parsed.street || place.displayName,
                  city: parsed.city || prev.city,
                  state: parsed.state || prev.state,
                  zip: parsed.zip || prev.zip,
                }));
              }}
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

      {/* Contact */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Contact
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="primaryContact">
              Primary Contact
            </label>
            <Input
              id="primaryContact"
              name="primaryContact"
              value={values.primaryContact}
              onChange={handleChange}
              placeholder="Jane Doe"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="phone">
              Phone
            </label>
            <Input
              id="phone"
              name="phone"
              value={values.phone}
              onChange={handleChange}
              placeholder="+1 (555) 000-0000"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="email">
              Email
            </label>
            <Input
              id="email"
              name="email"
              type="email"
              value={values.email}
              onChange={handleChange}
              placeholder="billing@client.com"
            />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="website">
              Website
            </label>
            <Input
              id="website"
              name="website"
              value={values.website}
              onChange={handleChange}
              placeholder="https://example.com"
            />
          </div>
        </div>
      </div>

      {/* Contacts */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Contacts
        </h3>
        <ContactsEditor rows={contactRows} onChange={setContactRows} />
      </div>

      {/* Billing */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Billing
        </h3>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="paymentTerms">
              Payment Terms (days)
            </label>
            <Input
              id="paymentTerms"
              name="paymentTerms"
              type="number"
              min={0}
              value={values.paymentTerms}
              onChange={handleChange}
              placeholder="30"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="creditLimit">
              Credit Limit ($)
            </label>
            <Input
              id="creditLimit"
              name="creditLimit"
              type="number"
              min={0}
              step="0.01"
              value={values.creditLimit}
              onChange={handleChange}
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Portal Access */}
      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Portal Access
        </h3>
        <div className="flex items-center gap-3">
          <input
            id="portalAccess"
            name="portalAccess"
            type="checkbox"
            checked={values.portalAccess}
            onChange={handleChange}
            className="h-4 w-4 rounded border-input accent-primary"
          />
          <label className="text-sm font-medium text-foreground" htmlFor="portalAccess">
            Enable client portal access
          </label>
        </div>
        {values.portalAccess && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-foreground" htmlFor="portalEmail">
              Portal Email <span className="text-destructive">*</span>
            </label>
            <Input
              id="portalEmail"
              name="portalEmail"
              type="email"
              value={values.portalEmail}
              onChange={handleChange}
              placeholder="portal@client.com"
            />
            {errors.portalEmail && <p className="text-xs text-destructive">{errors.portalEmail}</p>}
          </div>
        )}
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
          placeholder="Additional notes about this client..."
          rows={3}
        />
      </div>

      {/* Submit */}
      <div className="flex justify-end gap-3 pt-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/carrier/clients')}
          disabled={isSubmitting}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isEdit ? 'Save Changes' : 'Create Client'}
        </Button>
      </div>
    </form>
  );
}
