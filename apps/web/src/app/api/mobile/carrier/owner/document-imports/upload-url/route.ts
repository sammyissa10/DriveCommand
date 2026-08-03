/**
 * POST /api/mobile/carrier/owner/document-imports/upload-url
 *
 * Presigned PUT for one import source file, from the phone. Same storage layer,
 * same tenant key prefixing, same `'imports'` category as the web path.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withMobileAuth } from '@/lib/api/with-mobile-auth';
import { requestImportUploadUrl } from '@/lib/document-import/upload';

export const POST = withMobileAuth(
  async (req: NextRequest, { auth }) => {
    const body = (await req.json()) as {
      fileName?: string;
      contentType?: string;
      sizeBytes?: number;
    };

    const result = await requestImportUploadUrl(auth.tenantId, {
      fileName: body.fileName ?? '',
      contentType: body.contentType ?? '',
      sizeBytes: body.sizeBytes ?? 0,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.message }, { status: result.status });
    }
    return NextResponse.json({ data: result.grant });
  },
  { allowedRoles: ['OWNER'] },
);
