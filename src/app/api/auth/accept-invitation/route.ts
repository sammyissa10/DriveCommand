import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { setSession } from '@/lib/auth/session';

/**
 * POST /api/auth/accept-invitation
 *
 * Accepts { invitationId, password } JSON body.
 * Validates the invitation, creates a User with DRIVER role,
 * marks the invitation as ACCEPTED, sets session, and returns redirect URL.
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

    // Hash password
    const passwordHash = await bcrypt.hash(password, 12);

    // Create user and update invitation in a single transaction
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      // Check for existing user with same email in the tenant
      const existingUser = await tx.user.findFirst({
        where: {
          email: invitation.email.toLowerCase().trim(),
          tenantId: invitation.tenantId,
        },
      });

      if (existingUser) {
        throw new Error('EMAIL_CONFLICT');
      }

      const newUser = await tx.user.create({
        data: {
          tenantId: invitation.tenantId,
          email: invitation.email.toLowerCase().trim(),
          passwordHash,
          role: 'DRIVER',
          firstName: invitation.firstName,
          lastName: invitation.lastName,
          licenseNumber: invitation.licenseNumber,
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

    // Set session for the new driver
    await setSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
    });

    return NextResponse.json({
      success: true,
      redirectUrl: '/dashboard',
    });
  } catch (error: any) {
    if (error?.message === 'EMAIL_CONFLICT') {
      return NextResponse.json(
        { error: 'An account with this email already exists. Please sign in instead.' },
        { status: 409 }
      );
    }

    console.error('Accept invitation error:', error);
    return NextResponse.json(
      { error: 'An error occurred while creating your account. Please try again.' },
      { status: 500 }
    );
  }
}
