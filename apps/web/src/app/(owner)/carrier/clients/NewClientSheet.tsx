'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SheetContainer, SheetInput, PrimaryButton } from '@/components/ui/ds';
import { ContactsEditor, fromContactRows, type ContactRow } from '@/components/carrier/clients/ContactsEditor';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Values {
  name: string;
  primaryContact: string;
  phone: string;
  email: string;
}

const EMPTY: Values = { name: '', primaryContact: '', phone: '', email: '' };

/**
 * New Client quick-create bottom sheet (carrier clients). Only the fields that
 * make the record real — name (required) + contact channels. Everything else
 * lives on the Detail page. Uses the shared SheetContainer (no local fork).
 */
export function NewClientSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<{ name?: string; email?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [contactRows, setContactRows] = useState<ContactRow[]>([]);

  const contactRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const dirty = Object.values(values).some((v) => v.trim().length > 0);
  const canSubmit = values.name.trim().length > 0 && !submitting;

  function set<K extends keyof Values>(key: K, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    if (key === 'name' || key === 'email') {
      setErrors((prev) => ({ ...prev, [key]: undefined }));
    }
  }

  function reset() {
    setValues(EMPTY);
    setErrors({});
    setContactRows([]);
    setSubmitting(false);
  }

  function handleCancel() {
    if (submitting) return;
    if (dirty && !window.confirm('Discard this client?')) return;
    reset();
    onClose();
  }

  async function submit() {
    const nextErrors: { name?: string; email?: string } = {};
    if (!values.name.trim()) nextErrors.name = 'Client name is required';
    if (values.email.trim() && !EMAIL_RE.test(values.email.trim())) {
      nextErrors.email = 'Enter a valid email address';
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      const body: Record<string, unknown> = { name: values.name.trim() };
      if (values.primaryContact.trim()) body.primaryContact = values.primaryContact.trim();
      if (values.phone.trim()) body.phone = values.phone.trim();
      if (values.email.trim()) body.email = values.email.trim();
      if (contactRows.length > 0) body.contacts = fromContactRows(contactRows);

      const res = await fetch('/api/v1/carrier/clients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: { id?: string };
        error?: string;
      };

      if (!res.ok) {
        setSubmitting(false); // sheet stays open, values preserved
        if (res.status === 409 || data.error === 'DUPLICATE_NAME') {
          // Duplicate name → inline on the field, never a raw server error.
          setErrors((prev) => ({
            ...prev,
            name: 'A client with this name already exists.',
          }));
          return;
        }
        toast.error('Couldn’t add client. Please try again.');
        return;
      }

      // Success — the progress moment.
      navigator.vibrate?.(10);
      const id = data?.data?.id;
      reset();
      onClose();
      router.refresh();
      toast.success(
        'Client added',
        id
          ? { action: { label: 'View', onClick: () => router.push(`/carrier/clients/${id}`) } }
          : undefined,
      );
    } catch {
      toast.error('Network error — your entries are safe. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <SheetContainer
      open={open}
      onCancel={handleCancel}
      title="New Client"
      subtitle="Just the essentials — add full details anytime."
    >
      <div className="space-y-3">
        <SheetInput
          label="Company name"
          required
          autoFocus
          value={values.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
          placeholder="e.g. Great Lakes Steel"
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              contactRef.current?.focus();
            }
          }}
        />
        <SheetInput
          ref={contactRef}
          label="Primary contact"
          value={values.primaryContact}
          onChange={(e) => set('primaryContact', e.target.value)}
          placeholder="Who you deal with"
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              phoneRef.current?.focus();
            }
          }}
        />
        <SheetInput
          ref={phoneRef}
          label="Phone"
          type="tel"
          inputMode="tel"
          value={values.phone}
          onChange={(e) => set('phone', e.target.value)}
          placeholder="(555) 555-1234"
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              emailRef.current?.focus();
            }
          }}
        />
        <SheetInput
          ref={emailRef}
          label="Email"
          type="email"
          inputMode="email"
          autoCapitalize="none"
          value={values.email}
          onChange={(e) => set('email', e.target.value)}
          error={errors.email}
          placeholder="name@company.com"
          enterKeyHint="done"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (canSubmit) submit();
            }
          }}
        />

        <div className="space-y-2 pt-1">
          <p className="text-[13px] font-medium text-ds-txt2">Additional contacts (optional)</p>
          <div className="rounded-[20px] bg-ds-card p-4">
            <ContactsEditor rows={contactRows} onChange={setContactRows} />
          </div>
        </div>

        <div className="pt-1">
          <PrimaryButton
            label={submitting ? 'Adding…' : 'Add Client'}
            onClick={submit}
            disabled={!canSubmit}
            loading={submitting}
          />
        </div>

        <p className="pb-1 text-center text-[13px] text-ds-txt3">
          MC/DOT numbers, address, terms, and more live on the client’s profile.
        </p>
      </div>
    </SheetContainer>
  );
}
