'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import {
  signUpSchema,
  deriveFleetSizeBucket,
  type SignUpInput,
} from '@/lib/validations/onboarding.schemas';
import { provisionTenant } from '@/lib/onboarding/provision-tenant';
import { prisma } from '@/lib/db/prisma';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email/resend-client';
import { ConfirmEmailTemplate } from '@/emails/confirm-email';
import { AccountExistsEmail } from '@/emails/account-exists';
import { getAppBaseUrl } from '@/lib/app-url';
import bcrypt from 'bcryptjs';

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

  // Derive the segmentation band server-side from the exact truck count. A count
  // that's missing/invalid falls back to a valid band so the schema surfaces the
  // error on `truckCount` (not a phantom `fleetSizeBucket` field the UI lacks);
  // an invalid count then fails validation below and never reaches provisioning.
  const truckCountValue = (formData.get('truckCount') as string | null) ?? '';
  const parsedTruckCount = Number.parseInt(truckCountValue, 10);
  const fleetSizeBucket =
    Number.isInteger(parsedTruckCount) && parsedTruckCount >= 1
      ? deriveFleetSizeBucket(parsedTruckCount)
      : 'OWNER_OPERATOR';

  const raw = {
    firstName: formData.get('firstName') as string,
    lastName: formData.get('lastName') as string,
    email: formData.get('email') as string,
    password: formData.get('password') as string,
    companyName: formData.get('companyName') as string,
    truckCount: truckCountValue,
    fleetSizeBucket,
    promoCode: (formData.get('promoCode') as string) || undefined,
    heardAbout: (formData.get('heardAbout') as string) || undefined,
    heardAboutOther: (formData.get('heardAboutOther') as string) || undefined,
  };

  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      fieldErrors: parsed.error.flatten()
        .fieldErrors as SignUpActionState['fieldErrors'],
    };
  }

  const input = parsed.data;
  const normalizedEmail = input.email.toLowerCase().trim();
  const admin = createAdminClient();

  // ── Step 0: Create Supabase Auth user FIRST so both rows share the same UUID ──
  // app_metadata.tenantId is not yet known — it will be patched after provisioning.
  const { data: authData, error: authCreateError } = await admin.auth.admin.createUser({
    email: normalizedEmail,
    password: input.password,
    email_confirm: true,
    user_metadata: { firstName: input.firstName, lastName: input.lastName },
  });

  if (authCreateError) {
    // Email enumeration defense: always return SUCCESS_MSG regardless of cause.
    // Send "account exists" email only when the error is a known duplicate.
    const isDuplicate =
      authCreateError.message?.toLowerCase().includes('already registered') ||
      authCreateError.status === 422;

    if (isDuplicate) {
      await bcrypt.hash('timing-equalization-dummy', 12);
      const appUrl = getAppBaseUrl();
      sendEmail({
        to: normalizedEmail,
        subject: 'Someone tried to sign up with your DriveCommand email',
        react: AccountExistsEmail({ signInUrl: `${appUrl}/sign-in` }),
      }).catch((e) =>
        console.error('[signUpAction] account-exists email failed:', e),
      );
    } else {
      console.error('[signUpAction] Supabase createUser error:', authCreateError.message);
    }
    return { message: SUCCESS_MSG };
  }

  const authUserId = authData.user.id;

  // ── Step 1: Provision Prisma tenant + user (User.id = authUserId) ──────────
  // Rollback: if provisioning fails for any reason, delete the auth user to
  // prevent an orphaned auth.users row with no corresponding Prisma User.
  let result: Awaited<ReturnType<typeof provisionTenant>>;
  try {
    result = await provisionTenant(input, authUserId);
  } catch (err) {
    await admin.auth.admin.deleteUser(authUserId).catch((e) =>
      console.error('[signUpAction] rollback deleteUser failed:', e),
    );

    const message = err instanceof Error ? err.message : 'unknown';

    if (message === 'EMAIL_TAKEN') {
      // Prisma User already had this email (orphan from prior partial failure).
      // Auth user was just deleted above. Return enumeration-safe response.
      await bcrypt.hash('timing-equalization-dummy', 12);
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
    console.error('[signUpAction] provisionTenant error:', err);
    return { message: 'Something went wrong. Please try again.' };
  }

  // ── Step 2: Patch auth user's app_metadata now that tenantId is known ──────
  const { error: metaError } = await admin.auth.admin.updateUserById(authUserId, {
    app_metadata: {
      role: 'OWNER',
      tenantId: result.tenantId,
      isSystemAdmin: false,
    },
  });
  if (metaError) {
    // Non-fatal: the Prisma User exists; sign-in will still work via the
    // Prisma-side session flow. Log loudly so we notice in dev.
    console.error('[signUpAction] updateUserById app_metadata failed:', metaError.message);
  }

  // ── Step 3: Emit tenant.created event (Phase D automation hook) ───────────
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.appEvent.create({
        data: {
          tenantId: result.tenantId,
          eventType: 'tenant.created',
          properties: {
            ownerEmail: input.email,
            companyName: input.companyName,
            planKey: result.planKey,
            fleetSizeBucket: input.fleetSizeBucket,
            truckCount: input.truckCount,
            ...(input.heardAbout ? { heardAbout: input.heardAbout } : {}),
            ...(input.promoCode ? { promoCode: input.promoCode } : {}),
          },
        },
      });
    });
  } catch (e) {
    console.error('[signUpAction] AppEvent write failed (non-fatal):', e);
  }

  // ── Step 4: Send confirmation email ───────────────────────────────────────
  const appUrl = getAppBaseUrl();
  const confirmUrl = `${appUrl}/api/email-confirm/${encodeURIComponent(result.emailToken)}`;

  void sendEmail({
    to: normalizedEmail,
    subject: 'Welcome to DriveCommand — confirm your email',
    react: ConfirmEmailTemplate({ firstName: input.firstName, confirmUrl }),
    replyTo: process.env.SUPPORT_REPLY_TO ?? process.env.GMAIL_USER,
  }).catch(() => {});

  // ── Step 5: Sign in ────────────────────────────────────────────────────────
  const supabase = await createSupabaseServerClient();
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: input.password,
  });
  if (signInError) {
    console.error('[signUpAction] signInWithPassword failed:', signInError.message);
    return { message: SUCCESS_MSG };
  }

  redirect('/onboarding/welcome');
}
