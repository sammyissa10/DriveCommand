/**
 * GET /api/email-confirm/[token]
 *
 * Required environment variable:
 *   EMAIL_TOKEN_SECRET — 64 hex chars (32 bytes). Generate with:
 *     node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
 *
 * Optional:
 *   RESEND_FROM_NAME — Display name for outbound email, composed with
 *                      RESEND_FROM_EMAIL by sender-config.ts. The
 *                      NotificationEmailConfig row overrides both.
 *   SUPPORT_REPLY_TO — Reply-To address for welcome emails
 */
import { NextRequest, NextResponse } from 'next/server';
import { prisma, TX_OPTIONS } from '@/lib/db/prisma';
import { verifyEmailToken } from '@/lib/auth/email-token';
import { logger } from '@/lib/logger';

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

function redirectTo(path: string) {
  return NextResponse.redirect(new URL(path, APP_URL));
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token: rawToken } = await params;

  // URL-decode in case the token was percent-encoded in transit
  let token: string;
  try {
    token = decodeURIComponent(rawToken);
  } catch {
    return redirectTo('/sign-in?error=link-invalid');
  }

  const result = verifyEmailToken(token);

  if (!result.ok) {
    logger.info('[email-confirm] token verification failed', { reason: result.reason });
    if (result.reason === 'expired') {
      return redirectTo('/sign-in?error=link-expired');
    }
    return redirectTo('/sign-in?error=link-invalid');
  }

  const { tenantId } = result.payload;

  // Check current state + update atomically (bypass_rls — pre-auth path)
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', TRUE)`;

      const tenant = await tx.tenant.findUnique({ where: { id: tenantId } });

      if (!tenant) {
        throw new Error('TENANT_NOT_FOUND');
      }

      // Idempotency: already confirmed — skip update but signal to redirect gracefully
      if (tenant.emailConfirmedAt !== null) {
        throw new Error('ALREADY_CONFIRMED');
      }

      await tx.tenant.update({
        where: { id: tenantId },
        data: { emailConfirmedAt: new Date() },
      });
    }, TX_OPTIONS);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    if (msg === 'ALREADY_CONFIRMED') {
      return redirectTo('/dashboard?notice=already-confirmed');
    }
    if (msg === 'TENANT_NOT_FOUND') {
      logger.warn('[email-confirm] tenant not found', { tenantId });
      return redirectTo('/sign-in?error=link-invalid');
    }
    logger.error('[email-confirm] unexpected error', { error: err });
    return redirectTo('/sign-in?error=link-invalid');
  }

  logger.info('[email-confirm] email confirmed', { tenantId });
  return redirectTo('/dashboard');
}
