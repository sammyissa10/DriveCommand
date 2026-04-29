'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { signUpSchema, type SignUpInput } from '@/lib/validations/onboarding.schemas';
import { provisionTenant } from '@/lib/onboarding/provision-tenant';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/gmail-client';
import { ConfirmEmailTemplate } from '@/emails/confirm-email';
import { WelcomeOwnerEmail } from '@/emails/welcome-owner';
import { getAppBaseUrl } from '@/lib/app-url';
import bcrypt from 'bcryptjs';
import {
  Html,
  Body,
  Container,
  Text,
  Button,
} from '@react-email/components';

// Minimal inline template for duplicate-email path
function AccountExistsEmail({ signInUrl }: { signInUrl: string }) {
  return (
    <Html>
      <Body>
        <Container>
          <Text>
            Hi there — someone just tried to sign up for DriveCommand using your email address.
          </Text>
          <Text>If that was you, you already have an account. Sign in below:</Text>
          <Button href={signInUrl}>Sign in to DriveCommand</Button>
          <Text>If it wasn&apos;t you, no action is needed. Your account is safe.</Text>
        </Container>
      </Body>
    </Html>
  );
}

// ── In-memory rate limiter (10 req / IP / hour) ─────────────────────────────
interface RateBucket {
  count: number;
  resetAt: number;
}
const rateBuckets = new Map<string, RateBucket>();
const RATE_LIMIT = 10;
const WINDOW_MS = 60 * 60 * 1000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const bucket = rateBuckets.get(ip);
  if (!bucket || now > bucket.resetAt) {
    rateBuckets.set(ip, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (bucket.count >= RATE_LIMIT) return false;
  bucket.count += 1;
  return true;
}

const SUCCESS_MSG =
  "If this email isn't already registered, your account is being set up. Check your inbox.";

export interface SignUpActionState {
  success?: boolean;
  message?: string;
  fieldErrors?: Partial<Record<keyof SignUpInput, string[]>>;
}

export async function signUpAction(
  _prev: SignUpActionState,
  formData: FormData,
): Promise<SignUpActionState> {
  const headersList = await headers();
  const ip =
    headersList.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  if (!checkRateLimit(ip)) {
    return { message: 'Too many signup attempts. Please try again in an hour.' };
  }

  const raw = {
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    companyName: formData.get('companyName') as string,
    fleetSizeBucket: formData.get('fleetSizeBucket') as string,
    promoCode: (formData.get('promoCode') as string) || undefined,
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten()
        .fieldErrors as SignUpActionState['fieldErrors'],
    };
  }

  const input = parsed.data;

  try {
    const result = await provisionTenant(input);

    const appUrl = getAppBaseUrl();
    const confirmUrl = `${appUrl}/api/email-confirm/${encodeURIComponent(result.emailToken)}`;

    void sendEmail({
      to: input.email,
      subject: 'Welcome to DriveCommand — confirm your email',
      react: ConfirmEmailTemplate({ firstName: input.firstName, confirmUrl }),
      replyTo: process.env.SUPPORT_REPLY_TO ?? process.env.GMAIL_USER,
    }).catch(() => {});

    void sendEmail({
      to: input.email,
      subject: "Welcome aboard — here's how to get started",
      react: WelcomeOwnerEmail({
        firstName: input.firstName,
        companyName: input.companyName,
        trialEndsAt: result.trialEndsAt.toLocaleDateString('en-US', {
          month: 'long',
          day: 'numeric',
          year: 'numeric',
        }),
        dashboardUrl: `${appUrl}/dashboard`,
      }),
      replyTo: process.env.SUPPORT_REPLY_TO ?? process.env.GMAIL_USER,
    }).catch(() => {});

    const admin = createAdminClient();
    const { error: createError } = await admin.auth.admin.createUser({
      email: input.email.toLowerCase().trim(),
      password: input.password,
      email_confirm: true,
      user_metadata: { firstName: input.firstName, lastName: input.lastName },
      app_metadata: {
        role: 'OWNER',
        tenantId: result.tenantId,
        isSystemAdmin: false,
      },
    });

    if (createError) {
      console.error('[signUpAction] Supabase createUser failed:', createError.message);
      return { message: SUCCESS_MSG };
    }

    const supabase = await createSupabaseServerClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: input.email.toLowerCase().trim(),
      password: input.password,
    });
    if (signInError) {
      console.error('[signUpAction] signInWithPassword failed:', signInError.message);
      return { message: SUCCESS_MSG };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown';

    if (message === 'EMAIL_TAKEN') {
      await bcrypt.hash('timing-equalization-dummy', 12);
      const existingEmail = (
        (formData.get('email') as string) ?? ''
      )
        .toLowerCase()
        .trim();
      const appUrl = getAppBaseUrl();
      sendEmail({
        to: existingEmail,
        subject: 'Someone tried to sign up with your DriveCommand email',
        react: AccountExistsEmail({ signInUrl: `${appUrl}/sign-in` }),
      }).catch((e) =>
        console.error('[signUpAction] account-exists email failed:', e),
      );
      return { message: SUCCESS_MSG };
    }
    if (message === 'DEFAULT_PLAN_NOT_FOUND') {
      return {
        message: 'Signup is temporarily unavailable. Please try again shortly.',
      };
    }
    if (message === 'PROMO_EXHAUSTED') {
      return {
        message:
          'This promo code has reached its maximum redemptions or has expired.',
      };
    }

    console.error('[signUpAction] unexpected error:', err);
    return { message: 'Something went wrong. Please try again.' };
  }

  redirect('/onboarding/welcome');
}
