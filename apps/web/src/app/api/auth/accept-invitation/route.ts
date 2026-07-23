import { NextRequest, NextResponse } from 'next/server';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { applyRateLimit, authLimiter } from '@/lib/rate-limit';
import { recordActivationEvent } from '@/lib/onboarding/activation-tracker';
import { fireEvent } from '@/server/services/workflows/fireEvent';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';

if (!process.env.NEXT_PUBLIC_APP_URL) {
  logger.warn(
    '[accept-invitation] NEXT_PUBLIC_APP_URL is not set. Invitation links will use http://localhost:3000. Set this env var in production.'
  );
}

/**
 * GET /api/auth/accept-invitation?id=...
 *
 * Returns { email, firstName } for a valid pending invitation.
 * Used by the accept-invitation page to pre-populate the email field.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json(
      { error: 'Invitation ID is required' },
      { status: 400 }
    );
  }

  /**
   * @bypass_rls reason: pre-auth
   * WHY: An unauthenticated user arriving via an invitation link needs to look up the
   *      invitation record to pre-populate the sign-up form. No session exists yet,
   *      so RLS would block this read entirely.
   * SCOPE: Reads a single DriverInvitation row by primary key (invitation ID from URL).
   * SAFETY: Returns only non-sensitive fields (email, firstName) to the client.
   *         The invitation ID is a UUID — not guessable by brute force.
   */
  const invitation = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
    return tx.driverInvitation.findUnique({
      where: { id },
    });
  }, TX_OPTIONS);

  if (!invitation) {
    return NextResponse.json(
      { error: 'Invitation not found' },
      { status: 404 }
    );
  }

  if (invitation.status !== 'PENDING') {
    return NextResponse.json(
      { error: 'This invitation has already been used or cancelled' },
      { status: 410 }
    );
  }

  if (invitation.expiresAt < new Date()) {
    return NextResponse.json(
      { error: 'This invitation has expired. Please ask your fleet manager to send a new one.' },
      { status: 410 }
    );
  }

  return NextResponse.json({
    email: invitation.email,
    firstName: invitation.firstName,
  });
}

/**
 * POST /api/auth/accept-invitation
 *
 * Accepts { invitationId, password } JSON body.
 * Validates the invitation, creates a Supabase Auth user + Prisma User record,
 * marks the invitation as ACCEPTED, signs the user in, and returns redirect URL.
 */
export async function POST(req: NextRequest) {
  // Rate limiting: prevent brute-force invitation acceptance attempts
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';
  const rateLimited = await applyRateLimit(authLimiter, `accept-inv:${ip}`);
  if (rateLimited) return rateLimited;

  try {
    const body = await req.json();
    const { invitationId, password } = body as {
      invitationId?: string;
      password?: string;
    };

    // Validate required fields
    if (!invitationId || !password) {
      return NextResponse.json(
        { error: 'Invitation ID and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    /**
     * @bypass_rls reason: pre-auth
     * WHY: No session exists at this point — the user is in the process of accepting
     *      an invitation (creating their account). RLS requires a session context.
     * SCOPE: Reads a single DriverInvitation by invitationId (UUID from request body).
     * SAFETY: invitationId is validated as a UUID. The invitation must be PENDING.
     */
    // Look up invitation bypassing RLS (no session yet)
    const invitation = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.driverInvitation.findUnique({
        where: { id: invitationId },
      });
    }, TX_OPTIONS);

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found' },
        { status: 404 }
      );
    }

    if (invitation.status !== 'PENDING') {
      return NextResponse.json(
        { error: 'This invitation has already been used or cancelled' },
        { status: 410 }
      );
    }

    if (invitation.expiresAt < new Date()) {
      return NextResponse.json(
        { error: 'This invitation has expired. Please ask your fleet manager to send a new one.' },
        { status: 410 }
      );
    }

    /**
     * @bypass_rls reason: pre-auth
     * WHY: Checking for email uniqueness before creating the user — still no session.
     * SCOPE: Read-only check on User.email within a specific tenantId.
     * SAFETY: Only uses email + tenantId from the verified invitation record.
     */
    // Check for existing user with same email in the tenant
    const existingUser = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.user.findFirst({
        where: {
          email: invitation.email.toLowerCase().trim(),
          tenantId: invitation.tenantId,
        },
      });
    }, TX_OPTIONS);

    if (existingUser) {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 409 }
      );
    }

    const userRole = invitation.role || 'DRIVER';
    const userEmail = invitation.email.toLowerCase().trim();

    // Create Supabase Auth user (admin client — sets email_confirm: true for immediate sign-in)
    const admin = createAdminClient();
    const { data: authData, error: authError } = await admin.auth.admin.createUser({
      email: userEmail,
      password,
      email_confirm: true,
      // Display fields: user-editable, safe in user_metadata
      user_metadata: {
        firstName: invitation.firstName,
        lastName: invitation.lastName,
      },
      // Security claims: admin-only, tamper-proof via app_metadata (not writable by end users)
      app_metadata: {
        role: userRole,
        tenantId: invitation.tenantId,
        isSystemAdmin: false,
        permissions: userRole === 'MANAGER' ? (invitation.permissions ?? null) : null,
      },
    });

    if (authError || !authData.user) {
      // A login identity is a GLOBALLY unique Supabase Auth user (auth.users.email
      // is unique across all tenants), whereas the existingUser check above is
      // tenant-scoped. So an email that already belongs to any DriveCommand account
      // (e.g. an owner/driver in another tenant, or an orphaned auth user from a
      // prior failed acceptance) reaches here with an "email already registered"
      // error. Surface that as a specific, actionable message instead of a generic
      // 500 that repeats identically on every retry.
      const authErrCode = (authError as { code?: string; status?: number } | null)?.code;
      const authErrStatus = (authError as { code?: string; status?: number } | null)?.status;
      const emailAlreadyRegistered =
        authErrCode === 'email_exists' ||
        authErrStatus === 422 ||
        /already.*(registered|been registered|exists)|email_exists/i.test(authError?.message ?? '');

      if (emailAlreadyRegistered) {
        logger.warn('[accept-invitation] email already has a Supabase auth identity', {
          email: userEmail,
        });
        return NextResponse.json(
          {
            error:
              'This email address is already associated with a DriveCommand account. Please sign in instead.',
          },
          { status: 409 }
        );
      }

      logger.error('Supabase Auth user creation failed:', authError);
      return NextResponse.json(
        { error: 'An error occurred while creating your account. Please try again.' },
        { status: 500 }
      );
    }

    /**
     * @bypass_rls reason: pre-auth
     * WHY: Creating the User record and updating the invitation — still no active
     *      session (the user hasn't signed in yet, we're creating their account).
     *      These writes must happen before the first sign-in.
     * SCOPE: Creates one User record + updates one DriverInvitation record.
     * SAFETY: All field values come from the verified invitation record, not raw user input.
     */
    // Create Prisma User record using the Supabase Auth user ID
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const newUser = await tx.user.create({
        data: {
          id: authData.user.id, // Use Supabase Auth UUID
          tenantId: invitation.tenantId,
          email: userEmail,
          passwordHash: '', // Password managed by Supabase Auth
          role: userRole,
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          licenseNumber: userRole === 'DRIVER' ? invitation.licenseNumber : null,
          permissions: userRole === 'MANAGER' ? (invitation.permissions ?? undefined) : undefined,
          isActive: true,
        },
      });

      await tx.driverInvitation.update({
        where: { id: invitationId },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
          userId: newUser.id,
        },
      });

      // Link carrier_drivers record to the newly created user
      await tx.carrierDriver.updateMany({
        where: {
          orgId: invitation.tenantId,
          email: userEmail,
          userId: null, // Only link records that have no user yet
        },
        data: {
          userId: newUser.id,
        },
      });

      return newUser;
    }, TX_OPTIONS);

    // Activation tracker: fire for real drivers (invitation flow always creates real users)
    if (userRole === 'DRIVER') {
      try {
        await recordActivationEvent(invitation.tenantId, 'first_real_driver');
      } catch (err) {
        console.error('[accept-invitation] activation tracker failed', err);
      }
    }

    // Spawn ON_DRIVER_CREATE playbooks (e.g. CDL Driver Onboarding) now that the DRIVER
    // User exists — this is the first point in the driver lifecycle where entityId=User.id
    // is valid. Best-effort: never let a fireEvent failure fail invite acceptance.
    // No session/x-tenant-id exists yet (pre-auth-cookie), so header-based getTenantPrisma()
    // would throw — pass an explicit tenant client via getTenantPrismaForOrg instead.
    if (userRole === 'DRIVER') {
      try {
        await fireEvent({
          event: 'ON_DRIVER_CREATE',
          entityData: { id: user.id, email: userEmail },
          tenantId: invitation.tenantId,
          tenantPrisma: await getTenantPrismaForOrg(invitation.tenantId, user.id),
        });
      } catch (err) {
        logger.error('[accept-invitation] fireEvent(ON_DRIVER_CREATE) failed', err);
      }
    }

    // Sign the user in — Supabase sets session cookies via @supabase/ssr
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signInWithPassword({ email: userEmail, password });

    const redirectUrl = user.role === 'OWNER' || user.role === 'MANAGER' ? '/carrier/dashboard' : '/home';

    return NextResponse.json({
      success: true,
      redirectUrl,
    });
  } catch (error: unknown) {
    logger.error('Accept invitation error:', error);
    return NextResponse.json(
      { error: 'An error occurred while creating your account. Please try again.' },
      { status: 500 }
    );
  }
}
