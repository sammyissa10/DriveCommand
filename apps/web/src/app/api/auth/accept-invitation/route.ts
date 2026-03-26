import { NextRequest, NextResponse } from 'next/server';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { createAdminClient } from '@/lib/supabase/admin';
import { createSupabaseServerClient } from '@/lib/supabase/server';

if (!process.env.NEXT_PUBLIC_APP_URL) {
  console.warn(
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
      user_metadata: {
        role: userRole,
        tenantId: invitation.tenantId,
        firstName: invitation.firstName,
        lastName: invitation.lastName,
        isSystemAdmin: false,
        permissions: userRole === 'MANAGER' ? (invitation.permissions ?? null) : null,
      },
    });

    if (authError || !authData.user) {
      console.error('Supabase Auth user creation failed:', authError);
      return NextResponse.json(
        { error: 'An error occurred while creating your account. Please try again.' },
        { status: 500 }
      );
    }

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

      return newUser;
    }, TX_OPTIONS);

    // Sign the user in — Supabase sets session cookies via @supabase/ssr
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signInWithPassword({ email: userEmail, password });

    const redirectUrl = user.role === 'OWNER' || user.role === 'MANAGER' ? '/dashboard' : '/my-route';

    return NextResponse.json({
      success: true,
      redirectUrl,
    });
  } catch (error: any) {
    console.error('Accept invitation error:', error);
    return NextResponse.json(
      { error: 'An error occurred while creating your account. Please try again.' },
      { status: 500 }
    );
  }
}
