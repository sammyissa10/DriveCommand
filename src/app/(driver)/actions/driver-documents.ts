'use server';

/**
 * Driver-scoped document server actions.
 * All actions enforce DRIVER role check and verify document ownership through route assignment.
 * CRITICAL SECURITY: No action accepts driverId as input — identity resolved from getCurrentUser().
 */

import { requireRole, getCurrentUser } from '@/lib/auth/server';
import { UserRole } from '@/lib/auth/roles';
import { getTenantPrisma, requireTenantId } from '@/lib/context/tenant-context';
import { DocumentRepository } from '@/lib/db/repositories/document.repository';
import { generateDownloadUrl } from '@/lib/storage/presigned';

/**
 * Get documents for the driver's assigned route.
 * Returns only documents associated with the driver's active route (PLANNED or IN_PROGRESS).
 * Returns empty array if no active route assignment exists.
 *
 * SECURITY: Double-check via route query ensures driver can only access their own route documents.
 */
export async function getMyRouteDocuments() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.DRIVER]);

  // Get current user from database
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not found');
  }

  // Get tenant ID and Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Query route assigned to this driver (filter by user.id in WHERE clause)
  const route = await prisma.route.findFirst({
    where: {
      driverId: user.id, // CRITICAL: user.id from database, NOT from parameters
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    },
  });

  // No active route → no documents
  if (!route) {
    return [];
  }

  // Use DocumentRepository to fetch documents for the driver's route
  const repo = new DocumentRepository(tenantId);
  return repo.findByRouteId(route.id);
}

/**
 * Get documents for the driver's assigned truck.
 * Returns only documents associated with the truck assigned to the driver's active route.
 * Returns empty array if no active route assignment exists.
 *
 * SECURITY: Double-check via route query ensures driver can only access their assigned truck documents.
 */
export async function getMyTruckDocuments() {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.DRIVER]);

  // Get current user from database
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not found');
  }

  // Get tenant ID and Prisma client
  const tenantId = await requireTenantId();
  const prisma = await getTenantPrisma();

  // Query route assigned to this driver to get truckId
  const route = await prisma.route.findFirst({
    where: {
      driverId: user.id, // CRITICAL: user.id from database, NOT from parameters
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    },
    select: {
      truckId: true,
    },
  });

  // No active route → no truck documents
  if (!route) {
    return [];
  }

  // Use DocumentRepository to fetch documents for the driver's truck
  const repo = new DocumentRepository(tenantId);
  return repo.findByTruckId(route.truckId);
}

/**
 * Generate presigned download URL for a document with ownership verification.
 * Verifies the document belongs to the driver's assigned route or truck before generating URL.
 * Returns error if document not found or not accessible to the driver.
 *
 * SECURITY: Ownership check via route assignment chain prevents IDOR attacks.
 */
export async function getDriverDownloadUrl(documentId: string) {
  // CRITICAL: Auth check FIRST before any data access
  await requireRole([UserRole.DRIVER]);

  // Get current user from database
  const user = await getCurrentUser();
  if (!user) {
    throw new Error('User not found');
  }

  // Get tenant ID
  const tenantId = await requireTenantId();

  // Find document via repository (RLS ensures tenant isolation)
  const repo = new DocumentRepository(tenantId);
  const doc = await repo.findById(documentId);

  if (!doc) {
    return {
      error: 'Document not found',
    };
  }

  // Get tenant-scoped Prisma client
  const prisma = await getTenantPrisma();

  // CRITICAL ownership check: Verify document belongs to driver's route or truck
  const route = await prisma.route.findFirst({
    where: {
      driverId: user.id, // CRITICAL: user.id from database, NOT from parameters
      status: { in: ['PLANNED', 'IN_PROGRESS'] },
    },
    select: {
      id: true,
      truckId: true,
    },
  });

  if (!route) {
    return {
      error: 'Document not accessible',
    };
  }

  // Check if document belongs to driver's route or truck
  if (doc.routeId !== route.id && doc.truckId !== route.truckId) {
    return {
      error: 'Document not accessible',
    };
  }

  // CRITICAL: Verify s3Key starts with tenant prefix (defense in depth)
  if (!doc.s3Key.startsWith(`tenant-${tenantId}/`)) {
    return {
      error: 'Invalid document: does not match tenant',
    };
  }

  // Generate presigned download URL
  const downloadUrl = await generateDownloadUrl(doc.s3Key);

  return {
    downloadUrl,
    fileName: doc.fileName,
  };
}
