import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { setSession } from '@/lib/auth/session';

/**
 * POST /api/auth/login
 *
 * Accepts { email, password } JSON body.
 * Looks up user by email (bypassing RLS), verifies bcrypt password hash.
 * On success, sets an encrypted session cookie and returns redirect URL.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, password } = body as { email?: string; password?: string };

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Look up user by email, bypassing RLS
    const user = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      return tx.user.findFirst({
        where: {
          email: email.toLowerCase().trim(),
          isActive: true,
        },
      });
    }, TX_OPTIONS);

    if (!user || !user.passwordHash) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Verify password
    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Invalid email or password' },
        { status: 401 }
      );
    }

    // Set encrypted session cookie
    await setSession({
      userId: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      firstName: user.firstName ?? undefined,
      lastName: user.lastName ?? undefined,
    });

    return NextResponse.json({ success: true, redirectUrl: '/dashboard' });
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'An error occurred during login' },
      { status: 500 }
    );
  }
}
