import { randomUUID } from 'crypto';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { setTransactionTenantId } from '@/lib/db/tenant-guc';
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

/**
 * ─── WHY THE TENANT ID IS MINTED HERE AND NOT BY THE DATABASE (quick-601) ───
 *
 * `Tenant.id` still carries `@default(dbgenerated("gen_random_uuid()"))` and that
 * default is untouched — every other insert path still uses it. This one call
 * site supplies an explicit id, and the reason is an ordering constraint that no
 * amount of statement shuffling could otherwise satisfy:
 *
 *   - `tenant_bootstrap_insert` admits the `"Tenant"` INSERT only when
 *     `id = current_tenant_id()`.
 *   - `tenant_self_read` gates the INSERT's RETURNING clause on the same
 *     equality — and Prisma's `create()` ALWAYS emits RETURNING.
 *   - `trg_seed_tenant_notification_settings` fires AFTER INSERT and writes
 *     `"TenantNotificationSettings"` with `tenantId = NEW.id`, which
 *     `tenant_isolation_policy` gates on the same equality again.
 *
 * All three want the GUC to hold the new tenant's id BEFORE the insert runs. If
 * the database generates the id, the application cannot know it in time. Minting
 * it in process is what makes the three checks agree, and it removes the need for
 * a bypass, an admin connection, or a `SECURITY DEFINER` trigger.
 *
 * Measured on staging before this change, as `app_user` with no bypass: the plain
 * INSERT failed `42501` on `"TenantNotificationSettings"` and the same INSERT with
 * `RETURNING id` failed `42501` on `"Tenant"` — two different tables, one clause
 * apart. See `docs/audits/provisioning-path.md` §1.
 *
 * ─── THE TWO GLOBAL PROBES ARE SQL FUNCTIONS, NOT PRISMA READS ──────────────
 *
 * `provisioning_email_taken` and `provisioning_next_slug` are `SECURITY DEFINER`
 * and each returns one scalar. The reads they replace are genuinely global —
 * `User_email_tenantId_key` is `(email, "tenantId")` and `Tenant_slug_key` is
 * global — so under a tenant-scoped role the Prisma versions returned zero rows
 * SILENTLY: the email guard stopped guarding, and the slug loop exited on its
 * first iteration and handed the first colliding slug to `Tenant_slug_key` as a
 * `23505` on sign-up. They are functions rather than `getAdminDb` calls because a
 * function returning one boolean leaks strictly less than a `BYPASSRLS` client on
 * the product's highest-traffic unauthenticated surface.
 */
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
    // Step 1 — Reject if email already registered (defensive: auth user was created
    // first, so this normally only fires for orphaned Prisma users from prior failures)
    const [{ taken }] = await tx.$queryRaw<Array<{ taken: boolean }>>`
      SELECT provisioning_email_taken(${normalizedEmail}) AS taken
    `;
    if (taken) throw new Error('EMAIL_TAKEN');

    // Step 2 — Hash password (written to User.passwordHash for mobile Bearer token auth)
    const passwordHash = await bcrypt.hash(password, 12);

    // Step 3 — Generate unique slug. The suffix loop lives inside
    // provisioning_next_slug, which is the only place that can see every tenant.
    //
    // The `|| 'tenant'` fallback is new and deliberate: a company name with no
    // alphanumerics normalises to the empty string, and the function raises on an
    // empty base rather than minting a blank slug. Previously such a name produced
    // slug='' and the SECOND one collided on Tenant_slug_key.
    const baseSlug =
      companyName
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') || 'tenant';
    const [{ slug }] = await tx.$queryRaw<Array<{ slug: string }>>`
      SELECT provisioning_next_slug(${baseSlug}) AS slug
    `;

    // Step 3a — Mint the tenant id and declare it BEFORE the insert. See the
    // header: this ordering is the whole mechanism.
    const tenantId = randomUUID();
    await setTransactionTenantId(tx, tenantId);

    // Step 4 — Insert Tenant
    const tenant = await tx.tenant.create({
      data: {
        id: tenantId,
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
