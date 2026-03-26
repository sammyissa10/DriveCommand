import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/auth/me
 *
 * Returns the current user data.
 * Accepts either:
 *   - Cookie-based session (web app, via @supabase/ssr)
 *   - Authorization: Bearer <token> header (mobile app, validated via admin client)
 *
 * Returns 401 if no valid session exists.
 */
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('Authorization');
  const bearerToken = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (bearerToken) {
    // Mobile: validate Supabase access token
    const admin = createAdminClient();
    const { data: { user }, error } = await admin.auth.getUser(bearerToken);
    if (error || !user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const meta = user.user_metadata || {};
    const name = [meta.firstName, meta.lastName].filter(Boolean).join(' ') || user.email;
    return NextResponse.json({
      id: user.id,
      email: user.email,
      name,
      role: meta.role,
      tenantId: meta.tenantId,
      companyName: meta.companyName || '',
    });
  }

  // Web: cookie-based session
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const meta = user.user_metadata || {};
  return NextResponse.json({
    userId: user.id,
    email: user.email,
    role: meta.role,
    tenantId: meta.tenantId,
    firstName: meta.firstName,
    lastName: meta.lastName,
    permissions: meta.permissions,
  });
}
