'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { SheetContainer, SheetInput, PrimaryButton } from '@/components/ui/ds';

interface Values {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
}

const EMPTY: Values = { firstName: '', lastName: '', email: '', phone: '' };

// Same shape the invite API accepts — a deliverable address is all the relay needs.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Digits only, last 10 (drops a country-code 1) — for validation + dup compare. */
function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  const trimmed = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
  return trimmed.slice(-10);
}

/** A usable US mobile number is 10 digits (an optional leading 1 is allowed). */
function isUsablePhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 10 || (digits.length === 11 && digits.startsWith('1'));
}

/**
 * Invite Driver quick-create bottom sheet (carrier fleet).
 *
 * The owner's job is a 15-second relay: name + contact, and the system invites
 * the driver to finish onboarding themselves. License, documents, and pay are
 * collected *there*, not here — that hand-off IS the progress story, so the
 * subtitle and caption say it out loud.
 *
 * Email is the required channel because it's what actually sends the invite:
 * this consumes the existing flow as-is (`POST /api/v1/carrier/fleet/drivers` →
 * createCarrierDriver, which creates the CarrierDriver + a PENDING
 * DriverInvitation and emails it). Phone is captured too (the API already
 * accepts it) for the record and future SMS. This sheet does not touch that API,
 * and reuses the shared SheetContainer/SheetInput/PrimaryButton kit — no fork.
 */
export function InviteDriverSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(EMPTY);
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
  }>({});
  const [submitting, setSubmitting] = useState(false);

  const lastRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);

  const email = values.email.trim();
  const phone = values.phone.trim();
  const emailValid = EMAIL_RE.test(email);
  const phoneOk = phone.length === 0 || isUsablePhone(phone);
  const dirty =
    values.firstName.trim().length > 0 ||
    values.lastName.trim().length > 0 ||
    email.length > 0 ||
    phone.length > 0;

  // Contact channel (email) must be a usable address, and phone — if given —
  // must be a usable mobile format, before the relay can start.
  const canSubmit =
    values.firstName.trim().length > 0 &&
    values.lastName.trim().length > 0 &&
    emailValid &&
    phoneOk &&
    !submitting;

  function reset() {
    setValues(EMPTY);
    setErrors({});
    setSubmitting(false);
  }

  function handleCancel() {
    if (submitting) return;
    if (dirty && !window.confirm('Discard this invite?')) return;
    reset();
    onClose();
  }

  function patch(next: Partial<Values>, clear?: keyof typeof errors) {
    setValues((prev) => ({ ...prev, ...next }));
    if (clear) setErrors((prev) => ({ ...prev, [clear]: undefined }));
  }

  /**
   * Find an existing driver who already holds this email or phone, via the
   * read-only list endpoint (no new/modified API). Returns the display name and
   * which field collided, or null. Best-effort: a lookup failure never blocks.
   */
  async function findDuplicate(
    addr: string,
    tel: string,
  ): Promise<{ name: string; field: 'email' | 'phone' } | null> {
    try {
      const res = await fetch('/api/v1/carrier/fleet/drivers?pageSize=500');
      if (!res.ok) return null;
      const json = (await res.json()) as {
        data?: {
          items?: Array<{
            firstName?: string;
            lastName?: string;
            email?: string | null;
            phone?: string | null;
          }>;
        };
      };
      const items = json.data?.items ?? [];
      const wantPhone = tel ? normalizePhone(tel) : '';
      const match = items.find((d) => {
        const emailHit = !!d.email && d.email.toLowerCase() === addr.toLowerCase();
        const phoneHit = !!wantPhone && !!d.phone && normalizePhone(d.phone) === wantPhone;
        return emailHit || phoneHit;
      });
      if (!match) return null;
      const name = `${match.firstName ?? ''} ${match.lastName ?? ''}`.trim() || match.email || addr;
      const field: 'email' | 'phone' =
        !!match.email && match.email.toLowerCase() === addr.toLowerCase() ? 'email' : 'phone';
      return { name, field };
    } catch {
      return null;
    }
  }

  async function submit() {
    if (!canSubmit) return;

    // Inline duplicate guard — name the driver who already holds this contact.
    const dup = await findDuplicate(email, phone);
    if (dup) {
      const msg = `${dup.name} already uses this ${dup.field}.`;
      setErrors((prev) => ({ ...prev, [dup.field]: msg }));
      (dup.field === 'phone' ? phoneRef : emailRef).current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/v1/carrier/fleet/drivers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email,
          ...(phone ? { phone } : {}),
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        data?: { id?: string };
        warning?: string;
        error?: string;
      };

      if (!res.ok) {
        setSubmitting(false); // sheet stays open, entries preserved
        if (res.status === 400 && /already/i.test(data.error ?? '')) {
          setErrors((prev) => ({ ...prev, email: data.error! }));
          return;
        }
        toast.error(data.error || 'Couldn’t send the invite. Please try again.');
        return;
      }

      // Success — the hand-off moment.
      navigator.vibrate?.(10);
      const id = data?.data?.id;
      reset();
      onClose();
      router.refresh(); // new driver shows with an "Invited" pill

      if (data.warning) {
        toast.warning('Driver added — invite email didn’t send', {
          description: 'Resend it from their profile.',
        });
      } else {
        toast.success(`Invite sent to ${email}`, {
          description: 'They’ll finish onboarding from the email.',
          ...(id
            ? { action: { label: 'View', onClick: () => router.push(`/carrier/fleet/drivers/${id}`) } }
            : {}),
        });
      }
    } catch {
      toast.error('Network error — your entries are safe. Try again.');
      setSubmitting(false);
    }
  }

  return (
    <SheetContainer
      open={open}
      onCancel={handleCancel}
      title="Invite Driver"
      subtitle="We email the invite — about 15 seconds."
    >
      <div className="space-y-3">
        <SheetInput
          label="First name"
          required
          autoFocus
          value={values.firstName}
          onChange={(e) => patch({ firstName: e.target.value }, 'firstName')}
          error={errors.firstName}
          placeholder="Jordan"
          autoCapitalize="words"
          enterKeyHint="next"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              lastRef.current?.focus();
            }
          }}
        />

        <SheetInput
          ref={lastRef}
          label="Last name"
          required
          value={values.lastName}
          onChange={(e) => patch({ lastName: e.target.value }, 'lastName')}
          error={errors.lastName}
          placeholder="Rivera"
          autoCapitalize="words"
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
          required
          type="email"
          inputMode="email"
          value={values.email}
          onChange={(e) => patch({ email: e.target.value }, 'email')}
          error={errors.email}
          placeholder="driver@email.com"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
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
          onChange={(e) => patch({ phone: e.target.value }, 'phone')}
          error={errors.phone}
          placeholder="(555) 000-0000"
          autoCorrect="off"
          enterKeyHint="send"
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              if (canSubmit) submit();
            }
          }}
        />

        <div className="pt-1">
          <PrimaryButton
            label={submitting ? 'Sending…' : 'Send Invite'}
            onClick={submit}
            disabled={!canSubmit}
            loading={submitting}
          />
        </div>

        <p className="pb-1 text-center text-[13px] text-ds-txt3">
          License, documents, and pay come next — the driver adds them during onboarding.
        </p>
      </div>
    </SheetContainer>
  );
}
