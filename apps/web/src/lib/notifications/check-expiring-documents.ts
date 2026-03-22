/**
 * Query expiring documents for notification purposes.
 * Finds truck documents (registration, insurance) expiring within 14 days.
 */

import { prisma } from '../db/prisma';
import { withTenantRLS } from '../db/extensions/tenant-rls';

export interface ExpiringDocumentItem {
  truckId: string;
  truckName: string;
  documentType: 'Registration' | 'Insurance';
  expiryDate: Date;
  daysUntilExpiry: number;
}

/**
 * Helper to create a tenant-scoped Prisma client for cron context.
 */
function getTenantPrismaForCron(tenantId: string) {
  // @ts-ignore - Prisma 7 type issue with extended client
  return prisma.$extends(withTenantRLS(tenantId));
}

/**
 * Parse document metadata JSONB and extract expiry dates.
 */
interface DocumentMetadata {
  registrationNumber?: string;
  registrationExpiry?: string;
  insuranceProvider?: string;
  insuranceExpiry?: string;
  insurancePolicyNumber?: string;
}

/**
 * Find documents expiring within 14 days.
 * Checks both registration and insurance expiry dates in truck documentMetadata.
 */
export async function findExpiringDocuments(
  tenantId: string
): Promise<ExpiringDocumentItem[]> {
  const tenantPrisma = getTenantPrismaForCron(tenantId);

  // Fetch all trucks with document metadata
  // @ts-ignore - Extended client type inference
  const trucks = await tenantPrisma.truck.findMany({
    select: {
      id: true,
      make: true,
      model: true,
      year: true,
      documentMetadata: true,
    },
  });

  const now = new Date();
  const fourteenDaysFromNow = new Date(now);
  fourteenDaysFromNow.setDate(fourteenDaysFromNow.getDate() + 14);

  const expiringItems: ExpiringDocumentItem[] = [];

  for (const truck of trucks) {
    const truckName = `${truck.year} ${truck.make} ${truck.model}`;

    // Parse documentMetadata JSONB
    if (!truck.documentMetadata || typeof truck.documentMetadata !== 'object') {
      continue;
    }

    const metadata = truck.documentMetadata as DocumentMetadata;

    // Check registration expiry
    if (metadata.registrationExpiry) {
      const expiryDate = new Date(metadata.registrationExpiry);
      if (expiryDate <= fourteenDaysFromNow) {
        const daysUntilExpiry = Math.ceil(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        expiringItems.push({
          truckId: truck.id,
          truckName,
          documentType: 'Registration',
          expiryDate,
          daysUntilExpiry,
        });
      }
    }

    // Check insurance expiry
    if (metadata.insuranceExpiry) {
      const expiryDate = new Date(metadata.insuranceExpiry);
      if (expiryDate <= fourteenDaysFromNow) {
        const daysUntilExpiry = Math.ceil(
          (expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        expiringItems.push({
          truckId: truck.id,
          truckName,
          documentType: 'Insurance',
          expiryDate,
          daysUntilExpiry,
        });
      }
    }
  }

  return expiringItems;
}
