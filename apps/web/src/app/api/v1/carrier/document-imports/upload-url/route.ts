/**
 * POST /api/v1/carrier/document-imports/upload-url
 *
 * Presigned PUT for one import source file. Called once per staged photo / PDF
 * / CSV, before the import row exists — the browser uploads straight to
 * storage and hands the keys back in order.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/supabase';
import { logger } from '@/lib/logger';
import { uploadLimiter, applyRateLimit } from '@/lib/rate-limit';
import { requestImportUploadUrl } from '@/lib/document-import/upload';

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const orgId = session.tenantId;
  if (!orgId) return NextResponse.json({ error: 'No organization' }, { status: 403 });

  const limited = await applyRateLimit(uploadLimiter, orgId);
  if (limited) return limited;

  try {
    const body = (await req.json()) as {
      fileName?: string;
      contentType?: string;
      sizeBytes?: number;
    };

    const result = await requestImportUploadUrl(orgId, {
      fileName: body.fileName ?? '',
      contentType: body.contentType ?? '',
      sizeBytes: body.sizeBytes ?? 0,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    return NextResponse.json({ data: result.grant });
  } catch (err) {
    logger.error('POST /api/v1/carrier/document-imports/upload-url failed', err, {
      userId: session.userId,
    });
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
