import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isSystemAdmin } from '@/lib/auth/supabase';
import { prisma } from '@/lib/db/prisma';
import { createAdminClient } from '@/lib/supabase/admin';
import { logger } from '@/lib/logger';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await requireAuth();
    const admin = await isSystemAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { id: userId } = await params;

    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
    }

    const body = await req.json() as { role: string };
    const { role: newRole } = body;

    if (!newRole || !['MANAGER', 'DRIVER'].includes(newRole)) {
      return NextResponse.json(
        { error: 'Role must be MANAGER or DRIVER' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, tenantId: true, firstName: true, lastName: true, email: true, isActive: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.role === 'OWNER') {
      return NextResponse.json({ error: 'Cannot change owner role' }, { status: 400 });
    }

    if (!user.tenantId) {
      return NextResponse.json({ error: 'Cannot change role for this user' }, { status: 400 });
    }

    // Update Prisma DB
    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { role: newRole as 'MANAGER' | 'DRIVER' },
      select: { id: true, firstName: true, lastName: true, email: true, role: true, isActive: true },
    });

    // Update Supabase Auth app_metadata (fire and forget with error logging)
    try {
      const supabaseAdmin = createAdminClient();
      const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        app_metadata: { role: newRole },
      });
      if (authError) {
        logger.error('[PATCH /api/admin/users/[id]/role] Supabase app_metadata update failed:', {
          userId,
          error: authError.message,
        });
        // Return success anyway since DB was updated; log for investigation
      }
    } catch (authErr: unknown) {
      const message = authErr instanceof Error ? authErr.message : 'unknown';
      logger.error('[PATCH /api/admin/users/[id]/role] Supabase admin call threw:', { userId, error: message });
    }

    logger.info('[PATCH /api/admin/users/[id]/role] Role updated', { userId, newRole });
    return NextResponse.json(updatedUser);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    logger.error('[PATCH /api/admin/users/[id]/role] Unexpected error:', { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
