import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { sendDriverInvitation } from '@/lib/email/send-driver-invitation';
import { mobileLimiter, applyRateLimit } from '@/lib/rate-limit';

/**
 * POST /api/mobile/owner/drivers/invite
 *
 * Sends a driver invitation from the mobile owner app.
 * Creates a DriverInvitation record and sends the invitation email.
 *
 * Body: { firstName, lastName, email, licenseNumber? }
 *
 * Requires: Authorization: Bearer <token> (role must be OWNER)
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  if (auth.role !== 'OWNER') {
    return NextResponse.json({ error: 'Forbidden — owner role required' }, { status: 403 });
  }

  const limited = await applyRateLimit(mobileLimiter, auth.userId);
  if (limited) return limited;

  const { tenantId } = auth;

  let body: { firstName?: string; lastName?: string; email?: string; licenseNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { firstName, lastName, email, licenseNumber } = body;

  if (!firstName?.trim() || !lastName?.trim() || !email?.trim()) {
    return NextResponse.json(
      { error: 'firstName, lastName, and email are required' },
      { status: 400 }
    );
  }

  const normalizedEmail = email.toLowerCase().trim();

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
  }

  try {
    // Check for existing user with same email in tenant
    const existingUser = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.user.findFirst({ where: { email: normalizedEmail, tenantId } });
    }, TX_OPTIONS);

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists in your organization' },
        { status: 409 }
      );
    }

    // Cancel any existing pending invitations for this email
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.driverInvitation.updateMany({
        where: { email: normalizedEmail, tenantId, status: 'PENDING' },
        data: { status: 'CANCELLED' },
      });
    }, TX_OPTIONS);

    // Create invitation record
    const invitation = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.driverInvitation.create({
        data: {
          tenantId,
          email: normalizedEmail,
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          fullName: `${firstName.trim()} ${lastName.trim()}`,
          licenseNumber: licenseNumber?.trim() || null,
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          status: 'PENDING',
        },
      });
    }, TX_OPTIONS);

    // Fetch tenant name for the email
    let organizationName = 'your fleet';
    try {
      const tenant = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
        return tx.tenant.findUnique({ where: { id: tenantId }, select: { name: true } });
      }, TX_OPTIONS);
      organizationName = tenant?.name || 'your fleet';
    } catch {
      // non-critical
    }

    // Send invitation email
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const acceptUrl = `${baseUrl}/accept-invitation?id=${invitation.id}`;

    let emailSent = false;
    try {
      await sendDriverInvitation(normalizedEmail, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        organizationName,
        acceptUrl,
        expiresAt: invitation.expiresAt.toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
      });
      emailSent = true;
    } catch (emailError) {
      console.error('[mobile/invite] Email send failed:', emailError);
    }

    return NextResponse.json({
      success: true,
      invitationId: invitation.id,
      emailSent,
      message: emailSent
        ? `Invitation sent to ${normalizedEmail}`
        : `Invitation created for ${normalizedEmail} but the email could not be sent`,
    });
  } catch (err) {
    console.error('[mobile/owner/drivers/invite] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
