/**
 * POST /api/documents/multipart/part-url
 *
 * Generate presigned URL for uploading a specific part.
 * Enforces defense-in-depth s3Key validation (tenant prefix + drivers category).
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { getPartUploadUrl } from '@/lib/storage/multipart';

export async function POST(req: NextRequest) {
  try {
    // CRITICAL: Auth check FIRST before any data access
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    // Get tenant ID
    const tenantId = await requireTenantId();

    // Parse request body
    const body = await req.json();
    const { s3Key, uploadId, partNumber } = body;

    // Validate required fields
    if (!s3Key || !uploadId || !partNumber) {
      return NextResponse.json(
        { error: 'Missing required fields: s3Key, uploadId, partNumber' },
        { status: 400 }
      );
    }

    // CRITICAL: Defense-in-depth - verify s3Key starts with tenant prefix AND drivers category
    if (!s3Key.startsWith(`tenant-${tenantId}/drivers/`)) {
      return NextResponse.json(
        { error: 'Invalid S3 key: does not match tenant or category' },
        { status: 403 }
      );
    }

    // Generate presigned URL for part upload
    const uploadUrl = await getPartUploadUrl(s3Key, uploadId, partNumber);

    return NextResponse.json({ uploadUrl });
  } catch (error) {
    console.error('Multipart part-url error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate part upload URL' },
      { status: 500 }
    );
  }
}
