'use client';

import React, { use, useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import Link from 'next/link';
import { signUpAction, type SignUpActionState } from './actions';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

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

export function SignUpForm({ searchParams }: SignUpFormProps) {
  const { promo } = use(searchParams);
  const [state, action] = useActionState(signUpAction, initial);

  return (
    <form action={action} className="space-y-4">
      {state.message && (
        <Alert variant={state.success ? 'default' : 'destructive'}>
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            required
          />
          {state.fieldErrors?.firstName && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.firstName[0]}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            required
          />
          {state.fieldErrors?.lastName && (
            <p className="text-xs text-destructive">
              {state.fieldErrors.lastName[0]}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
        {state.fieldErrors?.email && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.email[0]}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
        />
        {state.fieldErrors?.password && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.password[0]}
          </p>
        )}
        <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          name="companyName"
          autoComplete="organization"
          required
        />
        {state.fieldErrors?.companyName && (
          <p className="text-xs text-destructive">
            {state.fieldErrors.companyName[0]}
          </p>
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
          <p className="text-xs text-destructive">
            {state.fieldErrors.fleetSizeBucket[0]}
          </p>
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

      <SubmitButton />

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className="font-medium text-primary hover:underline"
        >
          Sign in
        </Link>
      </p>
    </form>
  );
}
