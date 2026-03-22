/**
 * POST /api/documents/upload
 *
 * Server-proxied file upload to R2/S3.
 * Accepts multipart/form-data, uploads to R2 directly from the server,
 * then saves document metadata to the database.
 *
 * This avoids the browser CORS restrictions that prevent direct-to-R2 PUT requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { documentCreateSchema } from '@drivecommand/validation';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';
import { MAX_FILE_SIZE } from '@/lib/storage/validate';
import { nanoid } from 'nanoid';

const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

export async function POST(req: NextRequest) {
  let step = 'init';
  try {
    step = 'require-role';
    await requireRole([UserRole.OWNER, UserRole.MANAGER]);

    step = 'require-tenant';
    const tenantId = await requireTenantId();

    step = 'get-user';
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 401 });
    }

    step = 'parse-form';
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    const entityType = formData.get('entityType') as string | null;
    const entityId = formData.get('entityId') as string | null;
    const documentName = formData.get('documentName') as string | null;
    const description = formData.get('description') as string | null;
    const externalUrl = formData.get('externalUrl') as string | null;
    const expiryDate = formData.get('expiryDate') as string | null;

    if (!entityType || !entityId || !documentName) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    step = 's3-upload';
    let s3Key = '';
    let contentType = '';
    let sizeBytes = 0;

    if (file && file.size > 0) {
      // Validate file
      if (!ALLOWED_TYPES.includes(file.type)) {
        return NextResponse.json(
          { error: 'File type not allowed. Please upload a PDF, JPEG, or PNG file.' },
          { status: 400 }
        );
      }
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
          { status: 400 }
        );
      }

      const fileId = nanoid();
      const sanitizedFileName = file.name.replace(/[/\\]/g, '-');
      const category = entityType === 'truck' ? 'trucks' : 'routes';
      s3Key = `tenant-${tenantId}/${category}/${fileId}-${sanitizedFileName}`;
      contentType = file.type;
      sizeBytes = file.size;

      const fileBuffer = Buffer.from(await file.arrayBuffer());

      await s3Client.send(
        new PutObjectCommand({
          Bucket: getBucketName(),
          Key: s3Key,
          Body: fileBuffer,
          ContentType: contentType,
          ContentLength: sizeBytes,
        })
      );
    }

    step = 'save-db';
    const documentData: any = {
      fileName: documentName.trim(),
      s3Key,
      contentType,
      sizeBytes,
    };

    if (entityType === 'truck') {
      documentData.truckId = entityId;
    } else {
      documentData.routeId = entityId;
    }

    if (description?.trim()) documentData.description = description.trim();
    if (externalUrl?.trim()) documentData.externalUrl = externalUrl.trim();
    if (expiryDate) documentData.expiryDate = new Date(expiryDate);

    const result = documentCreateSchema.safeParse(documentData);
    if (!result.success) {
      const messages = Object.values(result.error.flatten().fieldErrors).flat().join(', ');
      return NextResponse.json({ error: messages || 'Invalid document data' }, { status: 400 });
    }

    const repo = new DocumentRepository(tenantId);
    await repo.create({
      ...result.data,
      tenantId,
      uploadedBy: user.id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`[upload] CAUGHT ERROR at step=${step}:`, error instanceof Error ? error.stack : String(error));
    return NextResponse.json(
      { error: `[upload:${step}] ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 }
    );
  }
}
