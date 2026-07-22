'use client';

import React, { use, useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { ArrowRight, Loader2 } from 'lucide-react';
import { signUpAction, type SignUpActionState } from './actions';
import { signUpSchema } from '@/lib/validations/onboarding.schemas';
import { HEARD_ABOUT_OPTIONS, HEARD_ABOUT_OTHER } from '@/lib/onboarding/heard-about';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

// Step 1 reuses the exact server rules so client + server never disagree.
const step1Schema = signUpSchema.pick({
  firstName: true,
  lastName: true,
  email: true,
  password: true,
});
type Step1Field = 'firstName' | 'lastName' | 'email' | 'password';
type Step1Errors = Partial<Record<Step1Field, string>>;
const STEP1_FIELDS: Step1Field[] = ['firstName', 'lastName', 'email', 'password'];

// Shared class fragments — matched to the Sign in screen (sign-in-card.tsx).
const LABEL = 'text-label text-n-300 mb-2 block uppercase tracking-wider';
const FIELD_ERROR = 'mt-1.5 text-small text-brand-critical';
const HELPER = 'mt-1.5 text-small text-n-500';
const PRIMARY_BTN =
  'w-full h-11 bg-gradient-to-b from-b-500 to-b-600 hover:from-b-400 hover:to-b-500 active:scale-[0.98] transition-all duration-75 text-white';
const SELECT =
  'w-full h-11 rounded-brand-sm border border-[#1C2536] bg-[#070B14] px-4 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-b-500';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className={PRIMARY_BTN}>
      {pending ? (
        <>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Creating account…
        </>
      ) : (
        'Create free account'
      )}
    </Button>
  );
}

const initial: SignUpActionState = {};

interface SignUpFormProps {
  searchParams: Promise<{ promo?: string }>;
}

/**
 * Two-step signup wizard, styled to match the dark Sign in screen. Both step
 * field-groups stay mounted (toggled with the `hidden` class) so uncontrolled
 * values persist across Back/Continue and the submitted FormData is identical to
 * the original form — the server action and its validation are unchanged. Step 1
 * is gated client-side; the server is only hit by the final "Create free
 * account" submit (step 2 is the only step that renders a submit button).
 */
export function SignUpForm({ searchParams }: SignUpFormProps) {
  const { promo } = use(searchParams);
  const [state, action] = useActionState(signUpAction, initial);
  const [step, setStep] = useState<1 | 2>(1);
  const [clientErrors, setClientErrors] = useState<Step1Errors>({});
  const [heardAbout, setHeardAbout] = useState('');
  const formRef = useRef<HTMLFormElement>(null);

  // If the server returns a step-1 field error after final submit, surface step 1.
  useEffect(() => {
    const fe = state.fieldErrors;
    if (fe && (fe.firstName || fe.lastName || fe.email || fe.password)) {
      setStep(1);
    }
  }, [state]);

  function validateStep1(): boolean {
    const form = formRef.current;
    if (!form) return false;
    const fd = new FormData(form);
    const res = step1Schema.safeParse({
      firstName: (fd.get('firstName') as string) ?? '',
      lastName: (fd.get('lastName') as string) ?? '',
      email: (fd.get('email') as string) ?? '',
      password: (fd.get('password') as string) ?? '',
    });
    if (res.success) {
      setClientErrors({});
      return true;
    }
    const fe = res.error.flatten().fieldErrors;
    setClientErrors({
      firstName: fe.firstName?.[0],
      lastName: fe.lastName?.[0],
      email: fe.email?.[0],
      password: fe.password?.[0],
    });
    const firstBad = STEP1_FIELDS.find((k) => fe[k]?.length);
    if (firstBad) form.querySelector<HTMLElement>(`[name="${firstBad}"]`)?.focus();
    return false;
  }

  function goNext() {
    if (validateStep1()) {
      setStep(2);
      formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
  }

  function goBack() {
    setStep(1);
    formRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  // On step 1 there is no submit button, so Enter would do nothing — advance instead.
  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (step === 1 && e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        goNext();
      }
    }
  }

  const step1ErrorText = STEP1_FIELDS.map((k) => clientErrors[k]).find(Boolean);

  return (
    <form ref={formRef} action={action} onKeyDown={handleKeyDown} className="space-y-6">
      {/* Progress indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-label uppercase tracking-wider">
          <span className={step >= 1 ? 'text-white' : 'text-n-500'}>About you</span>
          <span className={step >= 2 ? 'text-white' : 'text-n-500'}>Your company</span>
        </div>
        <div
          className="flex gap-1.5"
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={2}
          aria-valuenow={step}
          aria-label={`Step ${step} of 2`}
        >
          <div
            className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? 'bg-b-500' : 'bg-[#1C2536]'}`}
          />
          <div
            className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? 'bg-b-500' : 'bg-[#1C2536]'}`}
          />
        </div>
        <p className="text-small text-n-500">Step {step} of 2</p>
      </div>

      {state.message && (
        <div
          className={cn(
            'rounded-brand-sm border px-4 py-3',
            state.success
              ? 'bg-b-500/10 border-b-500/20'
              : 'bg-brand-critical/10 border-brand-critical/20',
          )}
        >
          <p className={cn('text-small', state.success ? 'text-b-300' : 'text-brand-critical')}>
            {state.message}
          </p>
        </div>
      )}

      {step === 1 && step1ErrorText && (
        <div className="rounded-brand-sm bg-brand-critical/10 border border-brand-critical/20 px-4 py-3">
          <p className="text-small text-brand-critical">{step1ErrorText}</p>
        </div>
      )}

      {/* ── Step 1: About you ─────────────────────────────────────────────── */}
      <div className={step === 1 ? 'space-y-5' : 'hidden'}>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="firstName" className={LABEL}>
              First name
            </label>
            <Input id="firstName" name="firstName" tone="dark" autoComplete="given-name" required />
            {(clientErrors.firstName || state.fieldErrors?.firstName) && (
              <p className={FIELD_ERROR}>
                {clientErrors.firstName ?? state.fieldErrors?.firstName?.[0]}
              </p>
            )}
          </div>
          <div>
            <label htmlFor="lastName" className={LABEL}>
              Last name
            </label>
            <Input id="lastName" name="lastName" tone="dark" autoComplete="family-name" required />
            {(clientErrors.lastName || state.fieldErrors?.lastName) && (
              <p className={FIELD_ERROR}>
                {clientErrors.lastName ?? state.fieldErrors?.lastName?.[0]}
              </p>
            )}
          </div>
        </div>

        <div>
          <label htmlFor="email" className={LABEL}>
            Work email
          </label>
          <Input
            id="email"
            name="email"
            type="email"
            tone="dark"
            autoComplete="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
          {(clientErrors.email || state.fieldErrors?.email) && (
            <p className={FIELD_ERROR}>{clientErrors.email ?? state.fieldErrors?.email?.[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="password" className={LABEL}>
            Password
          </label>
          <PasswordInput
            id="password"
            name="password"
            tone="dark"
            autoComplete="new-password"
            required
          />
          {(clientErrors.password || state.fieldErrors?.password) && (
            <p className={FIELD_ERROR}>
              {clientErrors.password ?? state.fieldErrors?.password?.[0]}
            </p>
          )}
          <p className={HELPER}>Minimum 8 characters</p>
        </div>
      </div>

      {/* ── Step 2: Your company ──────────────────────────────────────────── */}
      <div className={step === 2 ? 'space-y-5' : 'hidden'}>
        <div>
          <label htmlFor="companyName" className={LABEL}>
            Company name
          </label>
          <Input
            id="companyName"
            name="companyName"
            tone="dark"
            autoComplete="organization"
            required
          />
          {state.fieldErrors?.companyName && (
            <p className={FIELD_ERROR}>{state.fieldErrors.companyName[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="truckCount" className={LABEL}>
            Number of trucks
          </label>
          <Input
            id="truckCount"
            name="truckCount"
            type="number"
            tone="dark"
            inputMode="numeric"
            min={1}
            step={1}
            required
            placeholder="e.g. 5"
          />
          {state.fieldErrors?.truckCount && (
            <p className={FIELD_ERROR}>{state.fieldErrors.truckCount[0]}</p>
          )}
        </div>

        <div>
          <label htmlFor="promoCode" className={LABEL}>
            Promo code <span className="text-n-500 font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <Input
            id="promoCode"
            name="promoCode"
            tone="dark"
            defaultValue={promo ?? ''}
            placeholder="e.g. LAUNCH30"
          />
        </div>

        <div>
          <label htmlFor="heardAbout" className={LABEL}>
            How did you hear about us?{' '}
            <span className="text-n-500 font-normal normal-case tracking-normal">(optional)</span>
          </label>
          <select
            id="heardAbout"
            name="heardAbout"
            value={heardAbout}
            onChange={(e) => setHeardAbout(e.target.value)}
            className={SELECT}
          >
            <option value="">Select an option…</option>
            {HEARD_ABOUT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          {heardAbout === HEARD_ABOUT_OTHER && (
            <div className="mt-3">
              <Input
                id="heardAboutOther"
                name="heardAboutOther"
                tone="dark"
                maxLength={200}
                placeholder="How did you find us?"
                aria-label="How did you hear about us — please specify"
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Footer: step-specific actions ─────────────────────────────────── */}
      {step === 1 ? (
        <Button type="button" className={PRIMARY_BTN} onClick={goNext}>
          Continue
          <ArrowRight className="ml-2 h-4 w-4" strokeWidth={1.6} strokeLinecap="square" />
        </Button>
      ) : (
        <div className="space-y-2">
          <SubmitButton />
          <Button
            type="button"
            variant="ghost"
            className="w-full h-11 text-n-300 hover:text-white hover:bg-white/5"
            onClick={goBack}
          >
            Back
          </Button>
        </div>
      )}

      <p className="text-small text-n-400 text-center">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className="text-b-300 hover:text-b-400 font-medium transition-colors duration-instant"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
