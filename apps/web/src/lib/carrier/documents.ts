import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BUCKET = 'carrier-documents';
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentUploadInput {
  parentType: string;
  parentId: string;
  documentType: string;
  file: File;
}

type DocumentResult<T> = Promise<{ data: T } | { error: string; status: number }>;

// ---------------------------------------------------------------------------
// uploadDocument
// ---------------------------------------------------------------------------

export async function uploadDocument(
  orgId: string,
  userId: string,
  data: DocumentUploadInput
): DocumentResult<import('@/generated/prisma').CarrierDocument> {
  const { parentType, parentId, documentType, file } = data;

  // Validate file type
  const originalName = file.name ?? 'upload';
  const ext = originalName.split('.').pop()?.toLowerCase() ?? '';
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return {
      error: `Invalid file type. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`,
      status: 400,
    };
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return { error: 'File too large. Maximum size is 25MB.', status: 400 };
  }

  // Build storage path: {orgId}/{parentType}/{parentId}/{documentType}/{uuid}.{ext}
  const uuid = crypto.randomUUID();
  const storagePath = `${orgId}/${parentType}/${parentId}/${documentType}/${uuid}.${ext}`;

  // Upload to Supabase Storage
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await createAdminClient()
    .storage.from(BUCKET)
    .upload(storagePath, buffer, { contentType: file.type });

  if (uploadError) {
    logger.error('uploadDocument: storage upload failed', { orgId, storagePath, err: uploadError });
    return { error: 'Storage upload failed', status: 500 };
  }

  // Determine stopId and clientId linkage
  let stopId: string | null = null;
  let clientId: string | null = null;

  if (parentType === 'stop') {
    stopId = parentId;
    // If BOL or POD, look up stop to get clientId via load
    if (documentType === 'bol' || documentType === 'pod') {
      const stop = await prisma.carrierStop.findFirst({
        where: { id: parentId },
        select: { clientId: true, load: { select: { clientId: true } } },
      });
      if (stop) {
        clientId = stop.clientId ?? stop.load?.clientId ?? null;
      }
    }
  }

  const document = await prisma.carrierDocument.create({
    data: {
      parentType,
      parentId,
      documentType,
      fileUrl: storagePath,
      filename: originalName,
      fileSizeBytes: file.size,
      uploadedBy: userId,
      stopId,
      clientId,
    },
  });

  logger.info('uploadDocument: created', { orgId, docId: document.id, storagePath });
  return { data: document };
}

// ---------------------------------------------------------------------------
// listDocuments
// ---------------------------------------------------------------------------

export async function listDocuments(orgId: string, parentType: string, parentId: string) {
  // CarrierDocument has no orgId column — scope by org through parent chain.
  // Strategy: query by parentType+parentId, then verify the parent belongs to orgId.
  let orgVerified = false;

  if (parentType === 'stop') {
    const stop = await prisma.carrierStop.findFirst({
      where: { id: parentId, dispatch: { orgId } },
    });
    orgVerified = !!stop;
  } else if (parentType === 'load') {
    const load = await prisma.carrierLoad.findFirst({ where: { id: parentId, orgId } });
    orgVerified = !!load;
  } else if (parentType === 'dispatch') {
    const dispatch = await prisma.carrierDispatch.findFirst({ where: { id: parentId, orgId } });
    orgVerified = !!dispatch;
  } else {
    // Unknown parent type — deny for safety
    orgVerified = false;
  }

  if (!orgVerified) {
    return { data: [] };
  }

  const documents = await prisma.carrierDocument.findMany({
    where: { parentType, parentId },
    orderBy: { createdAt: 'desc' },
  });

  return { data: documents };
}

// ---------------------------------------------------------------------------
// deleteDocument
// ---------------------------------------------------------------------------

export async function deleteDocument(
  orgId: string,
  docId: string
): DocumentResult<{ deleted: boolean }> {
  const doc = await prisma.carrierDocument.findFirst({ where: { id: docId } });
  if (!doc) return { error: 'Document not found', status: 404 };

  // Verify org ownership through parent chain
  let orgVerified = false;
  if (doc.parentType === 'stop') {
    const stop = await prisma.carrierStop.findFirst({
      where: { id: doc.parentId, dispatch: { orgId } },
    });
    orgVerified = !!stop;
  } else if (doc.parentType === 'load') {
    const load = await prisma.carrierLoad.findFirst({ where: { id: doc.parentId, orgId } });
    orgVerified = !!load;
  } else if (doc.parentType === 'dispatch') {
    const dispatch = await prisma.carrierDispatch.findFirst({ where: { id: doc.parentId, orgId } });
    orgVerified = !!dispatch;
  }

  if (!orgVerified) return { error: 'Unauthorized', status: 403 };

  // Remove from Supabase Storage
  const { error: storageError } = await createAdminClient()
    .storage.from(BUCKET)
    .remove([doc.fileUrl]);

  if (storageError) {
    logger.error('deleteDocument: storage delete failed', { orgId, docId, err: storageError });
    // Continue — still delete the DB record even if storage fails
  }

  await prisma.carrierDocument.delete({ where: { id: docId } });

  logger.info('deleteDocument: deleted', { orgId, docId });
  return { data: { deleted: true } };
}

// ---------------------------------------------------------------------------
// verifyDocument
// ---------------------------------------------------------------------------

export async function verifyDocument(
  orgId: string,
  docId: string,
  userId: string
): DocumentResult<import('@/generated/prisma').CarrierDocument> {
  const doc = await prisma.carrierDocument.findFirst({ where: { id: docId } });
  if (!doc) return { error: 'Document not found', status: 404 };

  // Verify org ownership through parent chain
  let orgVerified = false;
  if (doc.parentType === 'stop') {
    const stop = await prisma.carrierStop.findFirst({
      where: { id: doc.parentId, dispatch: { orgId } },
    });
    orgVerified = !!stop;
  } else if (doc.parentType === 'load') {
    const load = await prisma.carrierLoad.findFirst({ where: { id: doc.parentId, orgId } });
    orgVerified = !!load;
  } else if (doc.parentType === 'dispatch') {
    const dispatch = await prisma.carrierDispatch.findFirst({ where: { id: doc.parentId, orgId } });
    orgVerified = !!dispatch;
  }

  if (!orgVerified) return { error: 'Unauthorized', status: 403 };

  const updated = await prisma.carrierDocument.update({
    where: { id: docId },
    data: { verified: true, verifiedBy: userId, verifiedAt: new Date() },
  });

  logger.info('verifyDocument: verified', { orgId, docId, verifiedBy: userId });
  return { data: updated };
}
