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
}

export async function provisionTenant(input: SignUpInput): Promise<ProvisionResult> {
  const { firstName, lastName, email, password, companyName, promoCode } = input;
  const normalizedEmail = email.toLowerCase().trim();

  return prisma.$transaction(async (tx) => {
    // bypass_rls for the entire transaction (scoped to this transaction session only)
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

    // Step 1 — Reject if email already registered
    const existingUser = await tx.user.findFirst({ where: { email: normalizedEmail } });
    if (existingUser) throw new Error('EMAIL_TAKEN');

    // Step 2 — Hash password
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
        contactEmail: normalizedEmail,
      },
    });

    // Step 5 — Insert User (OWNER)
    const user = await tx.user.create({
      data: {
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
    return { tenantId: tenant.id, userId: user.id, emailToken, trialEndsAt };
  }, TX_OPTIONS);
}
