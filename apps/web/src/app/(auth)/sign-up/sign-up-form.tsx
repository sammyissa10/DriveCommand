'use client';

import React, { use, useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { signUpAction, type SignUpActionState } from './actions';
import { signUpSchema } from '@/lib/validations/onboarding.schemas';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

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

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {pending ? 'Creating account…' : 'Create free account'}
    </Button>
  );
}

const initial: SignUpActionState = {};

interface SignUpFormProps {
  searchParams: Promise<{ promo?: string }>;
}

/**
 * Two-step signup wizard. Both step field-groups stay mounted (toggled with the
 * `hidden` class) so uncontrolled values persist across Back/Continue and the
 * submitted FormData is identical to the original single-screen form — the
 * server action and its validation are unchanged. Step 1 is gated client-side;
 * the server is only hit by the final "Create free account" submit (step 2 is
 * the only step that renders a submit button).
 */
export function SignUpForm({ searchParams }: SignUpFormProps) {
  const { promo } = use(searchParams);
  const [state, action] = useActionState(signUpAction, initial);
  const [step, setStep] = useState<1 | 2>(1);
  const [clientErrors, setClientErrors] = useState<Step1Errors>({});
  const formRef = useRef<HTMLFormElement>(null);

  // If the server ever returns a step-1 field error after final submit, surface
  // step 1 so the message is visible (step-1 inputs are hidden on step 2).
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

  // On step 1 there is no submit button, so Enter would do nothing — make it
  // advance instead (keyboard + mobile "Go" parity).
  function handleKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (step === 1 && e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'TEXTAREA') {
        e.preventDefault();
        goNext();
      }
    }
  }

  // First error message on step 1, to show a short prompt above the fields.
  const step1ErrorText = STEP1_FIELDS.map((k) => clientErrors[k]).find(Boolean);

  return (
    <form ref={formRef} action={action} onKeyDown={handleKeyDown} className="space-y-6">
      {/* Progress indicator */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <span className={step >= 1 ? 'text-foreground' : 'text-muted-foreground'}>
            About you
          </span>
          <span className={step >= 2 ? 'text-foreground' : 'text-muted-foreground'}>
            Your company
          </span>
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
            className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? 'bg-primary' : 'bg-muted'}`}
          />
          <div
            className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? 'bg-primary' : 'bg-muted'}`}
          />
        </div>
        <p className="text-xs text-muted-foreground">Step {step} of 2</p>
      </div>

      {state.message && (
        <Alert variant={state.success ? 'default' : 'destructive'}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      {step === 1 && step1ErrorText && (
        <Alert variant="destructive">
          <AlertDescription>{step1ErrorText}</AlertDescription>
        </Alert>
      )}

      {/* ── Step 1: About you ─────────────────────────────────────────────── */}
      <div className={step === 1 ? 'space-y-4' : 'hidden'}>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="firstName">First name</Label>
            <Input id="firstName" name="firstName" autoComplete="given-name" required />
            {(clientErrors.firstName || state.fieldErrors?.firstName) && (
              <p className="text-xs text-destructive">
                {clientErrors.firstName ?? state.fieldErrors?.firstName?.[0]}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lastName">Last name</Label>
            <Input id="lastName" name="lastName" autoComplete="family-name" required />
            {(clientErrors.lastName || state.fieldErrors?.lastName) && (
              <p className="text-xs text-destructive">
                {clientErrors.lastName ?? state.fieldErrors?.lastName?.[0]}
              </p>
            )}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="email">Work email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
          {(clientErrors.email || state.fieldErrors?.email) && (
            <p className="text-xs text-destructive">
              {clientErrors.email ?? state.fieldErrors?.email?.[0]}
            </p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="password">Password</Label>
          <PasswordInput id="password" name="password" autoComplete="new-password" required />
          {(clientErrors.password || state.fieldErrors?.password) && (
            <p className="text-xs text-destructive">
              {clientErrors.password ?? state.fieldErrors?.password?.[0]}
            </p>
          )}
          <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
        </div>
      </div>

      {/* ── Step 2: Your company ──────────────────────────────────────────── */}
      <div className={step === 2 ? 'space-y-4' : 'hidden'}>
        <div className="space-y-1.5">
          <Label htmlFor="companyName">Company name</Label>
          <Input id="companyName" name="companyName" autoComplete="organization" required />
          {state.fieldErrors?.companyName && (
            <p className="text-xs text-destructive">{state.fieldErrors.companyName[0]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="fleetSizeBucket">Fleet size</Label>
          <select
            id="fleetSizeBucket"
            name="fleetSizeBucket"
            required
            defaultValue="OWNER_OPERATOR"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="OWNER_OPERATOR">1–3 trucks (Owner-operator)</option>
            <option value="SMALL">4–15 trucks (Small fleet)</option>
            <option value="MEDIUM">16–50 trucks (Medium fleet)</option>
            <option value="LARGE">50+ trucks (Large fleet)</option>
          </select>
          {state.fieldErrors?.fleetSizeBucket && (
            <p className="text-xs text-destructive">{state.fieldErrors.fleetSizeBucket[0]}</p>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="promoCode">
            Promo code{' '}
            <span className="text-muted-foreground font-normal">(optional)</span>
          </Label>
          <Input
            id="promoCode"
            name="promoCode"
            defaultValue={promo ?? ''}
            placeholder="e.g. LAUNCH30"
          />
        </div>
      </div>

      {/* ── Footer: step-specific actions ─────────────────────────────────── */}
      {step === 1 ? (
        <Button type="button" className="w-full" onClick={goNext}>
          Continue
        </Button>
      ) : (
        <div className="space-y-2">
          <SubmitButton />
          <Button type="button" variant="ghost" className="w-full" onClick={goBack}>
            Back
          </Button>
        </div>
      )}

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link href="/sign-in" className="font-medium text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </form>
  );
}
