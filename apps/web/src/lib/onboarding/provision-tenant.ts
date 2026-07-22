import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { generateEmailToken } from '@/lib/auth/email-token';
import { SignUpInput } from '@/lib/validations/onboarding.schemas';
import {
  TenantStatus,
  ProvisioningPhase,
  SubscriptionStatus,
  UserRole,
  FleetSizeBucket,
} from '../../generated/prisma';
import bcrypt from 'bcryptjs';

export interface ProvisionResult {
  tenantId: string;
  userId: string;
  emailToken: string;
  trialEndsAt: Date;
  planKey: string;
}

export async function provisionTenant(
  input: SignUpInput,
  authUserId: string,
): Promise<ProvisionResult> {
  const { firstName, lastName, email, password, companyName, promoCode } = input;
  const normalizedEmail = email.toLowerCase().trim();

  // Acquisition channel (optional). Keep the free-text detail only when "Other"
  // is selected; ignore stray text for the fixed options.
  const heardAbout = input.heardAbout?.trim() || null;
  const heardAboutOther =
    heardAbout === 'other' ? input.heardAboutOther?.trim() || null : null;

  return prisma.$transaction(async (tx) => {
    // bypass_rls for the entire transaction (scoped to this transaction session only)
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    // Step 1 — Reject if email already registered (defensive: auth user was created
    // first, so this normally only fires for orphaned Prisma users from prior failures)
    const existingUser = await tx.user.findFirst({ where: { email: normalizedEmail } });
    if (existingUser) throw new Error('EMAIL_TAKEN');

    // Step 2 — Hash password (written to User.passwordHash for mobile Bearer token auth)
    const passwordHash = await bcrypt.hash(password, 12);

    // Step 3 — Generate unique slug
    let baseSlug = companyName
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    let slug = baseSlug;
    let suffix = 2;
    while (await tx.tenant.findFirst({ where: { slug } })) {
      slug = `${baseSlug}-${suffix++}`;
    }

    // Step 4 — Insert Tenant
    const tenant = await tx.tenant.create({
      data: {
        name: companyName,
        slug,
        status: TenantStatus.TRIAL,
        provisioningPhase: ProvisioningPhase.MINIMAL,
        sampleDataSeeded: false,
        fleetSizeBucket: input.fleetSizeBucket as FleetSizeBucket,
        truckCount: input.truckCount,
        heardAbout,
        heardAboutOther,
        contactEmail: normalizedEmail,
      },
    });

    // Step 5 — Insert User (OWNER) using authUserId so Prisma User.id == auth.users.id.
    // This is required for signInWithPassword to succeed: the session lookup matches
    // on id and the Prisma User must exist with the same UUID the auth system assigned.
    const user = await tx.user.create({
      data: {
        id: authUserId,
        tenantId: tenant.id,
        email: normalizedEmail,
        passwordHash,
        role: UserRole.OWNER,
        firstName,
        lastName,
        isActive: true,
      },
    });

    // Step 6 — Look up default Plan
    const plan = await tx.plan.findFirst({ where: { key: 'starter', isActive: true } });
    if (!plan) throw new Error('DEFAULT_PLAN_NOT_FOUND');

    // Step 6 (cont.) — Optionally look up and claim Promo
    let promo: { id: string; bonusTrialDays: number } | null = null;
    if (promoCode) {
      const found = await tx.promo.findFirst({
        where: { code: promoCode.toUpperCase(), isActive: true },
      });
      if (found) {
        // Atomically increment — throws if promo is exhausted or expired
        const updated = await tx.$executeRaw`
          UPDATE "Promo"
          SET "redemptionCount" = "redemptionCount" + 1
          WHERE id = ${found.id}::uuid
            AND "isActive" = true
            AND "activeFrom" <= now()
            AND "activeTo" >= now()
            AND ("maxRedemptions" IS NULL OR "redemptionCount" < "maxRedemptions")
        `;
        if (Number(updated) === 0) throw new Error('PROMO_EXHAUSTED');
        promo = { id: found.id, bonusTrialDays: found.bonusTrialDays };
      }
      // Silently ignore unknown/inactive promo codes (don't hard-fail signup)
    }

    // Step 7 — Compute trialEndsAt
    const bonusDays = promo?.bonusTrialDays ?? 0;
    const trialEndsAt = new Date(Date.now() + (plan.defaultTrialDays + bonusDays) * 86_400_000);

    // Step 8 — Insert Subscription
    await tx.subscription.create({
      data: {
        tenantId: tenant.id,
        planId: plan.id,
        promoId: promo?.id ?? null,
        status: SubscriptionStatus.TRIALING,
        trialEndsAt,
        stripeCustomerId: null,
        stripeSubscriptionId: null,
      },
    });

    // Step 9 — Insert ActivationProgress
    await tx.activationProgress.create({
      data: {
        tenantId: tenant.id,
        accountCreatedAt: new Date(),
        completionPct: 20,
        isActivated: false,
      },
    });

    // Step 10 — Generate email confirmation token (AES-GCM, 24h expiry)
    const emailToken = generateEmailToken(tenant.id);

    // Step 11 — Transaction commits here (implicit on return)
    return { tenantId: tenant.id, userId: user.id, emailToken, trialEndsAt, planKey: plan.key };
  }, TX_OPTIONS);
}
