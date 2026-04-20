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
      email: string;
      action: 'send_reset' | 'set_password';
      password?: string;
    };

    const { email, action, password } = body;

    if (!email || !action) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const supabase = createAdminClient();

    if (action === 'send_reset') {
      const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || 'https://drivecommand.vercel.app'}/reset-password`;
      // resetPasswordForEmail sends the email automatically via Supabase SMTP
      // generateLink only returns a link — it does NOT send an email
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

      if (error) {
        logger.error('[admin-reset-password] resetPasswordForEmail error:', { email, error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      logger.info('[admin-reset-password] Reset email sent', { email });
      return NextResponse.json({ success: true, message: 'Reset email sent' });
    }

    if (action === 'set_password') {
      if (!password || password.length < 8) {
        return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
      }

      // Look up the Supabase Auth user by email — the userId from the DB is the Prisma User.id,
      // not the auth.users UUID that updateUserById requires
      const { data: listData, error: listError } = await supabase.auth.admin.listUsers({ perPage: 1000 });
      if (listError) {
        logger.error('[admin-reset-password] listUsers error:', { error: listError.message });
        return NextResponse.json({ error: listError.message }, { status: 500 });
      }

      const authUser = listData.users.find(u => u.email === email);
      if (!authUser) {
        return NextResponse.json({ error: `No auth user found for email: ${email}` }, { status: 404 });
      }

      const { error } = await supabase.auth.admin.updateUserById(authUser.id, { password });

      if (error) {
        logger.error('[admin-reset-password] updateUserById error:', { authUserId: authUser.id, error: error.message });
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      logger.info('[admin-reset-password] Password set by sysadmin', { authUserId: authUser.id, email });
      return NextResponse.json({ success: true, message: 'Password updated' });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[admin-reset-password] Unexpected error:', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
