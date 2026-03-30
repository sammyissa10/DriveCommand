import { NextRequest, NextResponse } from 'next/server';
import { requireAuth, isSystemAdmin } from '@/lib/auth/server';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * GET /api/admin/support/screenshot?key=<s3Key>
 *
 * Proxy route: downloads the screenshot from Supabase Storage server-side
 * using the admin client (service role) and streams it back to the browser.
 *
 * Uses the Supabase JS SDK admin client which handles key format normalization
 * internally — works with both JWT and sb_secret_* key formats.
 *
 * Only accessible to system admins.
 */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();
    const admin = await isSystemAdmin();
    if (!admin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const s3Key = req.nextUrl.searchParams.get('key');
    if (!s3Key || s3Key.trim() === '') {
      return NextResponse.json({ error: 'Missing key parameter' }, { status: 400 });
    }

    const bucket = process.env.S3_BUCKET || 'driver-documents';
    const supabase = createAdminClient();

    const { data, error } = await supabase.storage.from(bucket).download(s3Key);

    if (error || !data) {
      console.error(`[admin/support/screenshot] Download failed for key: ${s3Key}`, error);
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    const buffer = await data.arrayBuffer();
    const contentType = data.type || 'image/jpeg';

    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (err) {
    console.error('[admin/support/screenshot] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
