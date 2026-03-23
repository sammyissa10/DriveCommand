import { NextRequest, NextResponse } from 'next/server';
import { validateMobileToken, unauthorizedResponse } from '@/lib/auth/mobile-auth';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { z } from 'zod';

const registerSchema = z.object({
  pushToken: z.string().min(1, 'pushToken is required'),
  platform: z.enum(['ios', 'android']),
});

/**
 * POST /api/push-tokens
 *
 * Register (or update) an Expo push token for the authenticated user.
 * Uses upsert by [userId, platform] so registering a new token on the
 * same platform always overwrites the previous one.
 *
 * Body: { pushToken: string, platform: 'ios' | 'android' }
 * Returns: { success: true }
 *
 * Requires: Authorization: Bearer <token>
 */
export async function POST(req: NextRequest) {
  const auth = await validateMobileToken(req);
  if (!auth) return unauthorizedResponse();

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? 'Invalid request' },
      { status: 400 }
    );
  }

  const { pushToken, platform } = parsed.data;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;
      await tx.pushToken.upsert({
        where: {
          userId_platform: {
            userId: auth.userId,
            platform,
          },
        },
        update: { token: pushToken },
        create: {
          userId: auth.userId,
          token: pushToken,
          platform,
        },
      });
    }, TX_OPTIONS);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[push-tokens] upsert failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
