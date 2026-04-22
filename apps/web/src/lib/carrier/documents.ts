import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';
import { s3Client, getBucketName } from '@/lib/storage/s3-client';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'heic', 'webp'];
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DocumentUploadInput {
  parentType: string;
  parentId: string;
  documentType: string;
  documentTypeId?: string;
  loadId?: string;
  dispatchId?: string;
  contractId?: string;
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
  const { parentType, parentId, documentType, documentTypeId, file } = data;
  let { loadId, dispatchId, contractId } = data;

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

  // Verify parent entity belongs to this org (cross-tenant isolation)
  let orgVerified = false;

  if (parentType === 'stop') {
    const stop = await prisma.carrierStop.findFirst({
      where: { id: parentId, dispatch: { orgId } },
      select: { dispatchId: true, loadId: true },
    });
    orgVerified = !!stop;
    // Auto-derive context FKs from stop
    if (stop) {
      if (!dispatchId) dispatchId = stop.dispatchId;
      if (!loadId && stop.loadId) loadId = stop.loadId;
    }
  } else if (parentType === 'load') {
    const load = await prisma.carrierLoad.findFirst({
      where: { id: parentId, orgId },
      select: { dispatchId: true, contractId: true },
    });
    orgVerified = !!load;
    if (load) {
      if (!loadId) loadId = parentId;
      if (!dispatchId && load.dispatchId) dispatchId = load.dispatchId;
      if (!contractId && load.contractId) contractId = load.contractId;
    }
  } else if (parentType === 'dispatch') {
    const dispatch = await prisma.carrierDispatch.findFirst({ where: { id: parentId, orgId } });
    orgVerified = !!dispatch;
    if (dispatch && !dispatchId) dispatchId = parentId;
  } else if (parentType === 'contract') {
    const contract = await prisma.carrierContract.findFirst({ where: { id: parentId, orgId } });
    orgVerified = !!contract;
    if (contract && !contractId) contractId = parentId;
  } else if (parentType === 'expense') {
    const expense = await prisma.carrierExpense.findFirst({ where: { id: parentId, orgId } });
    orgVerified = !!expense;
  }

  if (!orgVerified) {
    return { error: 'Invalid parent', status: 400 };
  }

  // Validate documentTypeId ownership if provided
  if (documentTypeId) {
    const typeRecord = await prisma.carrierDocumentType.findFirst({
      where: { id: documentTypeId, orgId, isActive: true },
    });
    if (!typeRecord) {
      return { error: 'Invalid document type', status: 400 };
    }
  }

  // Build storage path: {orgId}/{parentType}/{parentId}/{documentType}/{uuid}.{ext}
  const uuid = crypto.randomUUID();
  const storagePath = `${orgId}/${parentType}/${parentId}/${documentType}/${uuid}.${ext}`;

  // Upload to R2
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: getBucketName(),
        Key: storagePath,
        Body: buffer,
        ContentType: file.type,
        ContentLength: file.size,
      })
    );
  } catch (uploadError) {
    logger.error('uploadDocument: R2 upload failed', uploadError, { orgId, storagePath });
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
      documentTypeId: documentTypeId ?? null,
      fileUrl: storagePath,
      filename: originalName,
      fileSizeBytes: file.size,
      uploadedBy: userId,
      stopId,
      clientId,
      loadId: loadId ?? null,
      dispatchId: dispatchId ?? null,
      contractId: contractId ?? null,
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
    include: {
      documentTypeRef: { select: { name: true } },
      uploader: { select: { firstName: true, lastName: true } },
    },
  });

  return {
    data: documents.map((doc) => {
      const uploaderName = doc.uploader
        ? [doc.uploader.firstName, doc.uploader.lastName].filter(Boolean).join(' ') || null
        : null;

      return {
        id: doc.id,
        documentType: doc.documentType,
        documentTypeName: doc.documentTypeRef?.name ?? null,
        fileName: doc.filename,
        fileSize: doc.fileSizeBytes ?? 0,
        uploadedByName: uploaderName,
        uploadedAt: doc.createdAt.toISOString(),
        verified: doc.verified,
        // URL is not pre-signed here — clients use a separate presign endpoint or pass fileUrl raw
        url: doc.fileUrl,
        // Additional fields for reference
        notes: doc.notes,
        documentTypeId: doc.documentTypeId,
        loadId: doc.loadId,
        dispatchId: doc.dispatchId,
        contractId: doc.contractId,
      };
    }),
  };
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

  // Remove from R2
  try {
    await s3Client.send(
      new DeleteObjectCommand({
        Bucket: getBucketName(),
        Key: doc.fileUrl,
      })
    );
  } catch (storageError) {
    logger.error('deleteDocument: R2 delete failed', storageError, { orgId, docId });
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
