import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export async function POST(req: NextRequest) {
  try {
    await requireAuth();
    const sysAdmin = await isSystemAdmin();
    if (!sysAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const body = await req.json() as {
      userId: string;
      email: string;
      action: 'send_reset' | 'set_password';
      password?: string;
    };

    const { userId, email, action, password } = body;

    if (!userId || !email || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (action === 'send_reset') {
      const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || 'https://drivecommand.vercel.app'}/reset-password`;
      const { error } = await supabase.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });

      if (error) {
        logger.error('[admin-reset-password] generateLink error:', { email, error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      logger.info('[admin-reset-password] Reset email sent', { email, userId });
      return NextResponse.json({ success: true, message: 'Reset email sent' });
    }

    if (action === 'set_password') {
      if (!password || password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }

      const { error } = await supabase.auth.admin.updateUserById(userId, { password });

      if (error) {
        logger.error('[admin-reset-password] updateUserById error:', { userId, error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      logger.info('[admin-reset-password] Password set by sysadmin', { userId });
      return NextResponse.json({ success: true, message: 'Password updated' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[admin-reset-password] Unexpected error:', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
