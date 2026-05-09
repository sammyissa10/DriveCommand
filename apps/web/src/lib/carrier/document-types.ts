import { prisma } from '@/lib/db/prisma';
import { logger } from '@/lib/logger';

// ---------------------------------------------------------------------------
// Default document types seeded for every new tenant
// ---------------------------------------------------------------------------

const DEFAULT_TYPES = [
  { name: 'Manifest', slug: 'manifest' },
  { name: 'POD', slug: 'pod' },
  { name: 'BOL', slug: 'bol' },
  { name: "Driver's License", slug: 'drivers-license' },
  { name: 'Invoice', slug: 'invoice' },
  { name: 'Rate Confirmation', slug: 'rate_confirmation' },
  { name: 'Blank Check', slug: 'blank-check' },
  { name: 'Insurance Certificate', slug: 'insurance-certificate' },
  { name: 'Unclassified', slug: 'unclassified' },
  { name: 'Other', slug: 'other' },
] as const;

// ---------------------------------------------------------------------------
// seedDefaultTypes
// ---------------------------------------------------------------------------

export async function seedDefaultTypes(orgId: string): Promise<void> {
  await prisma.$transaction(
    DEFAULT_TYPES.map((t) =>
      prisma.carrierDocumentType.upsert({
        where: { orgId_slug: { orgId, slug: t.slug } },
        update: {},
        create: { orgId, name: t.name, slug: t.slug, isDefault: true, isActive: true },
      })
    )
  );
  logger.info('seedDefaultTypes: seeded defaults', { orgId });
}

// ---------------------------------------------------------------------------
// listDocumentTypes
// ---------------------------------------------------------------------------

export async function listDocumentTypes(orgId: string, activeOnly = false) {
  const count = await prisma.carrierDocumentType.count({ where: { orgId } });
  if (count === 0) {
    await seedDefaultTypes(orgId);
  }

  return prisma.carrierDocumentType.findMany({
    where: { orgId, ...(activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
  });
}

// ---------------------------------------------------------------------------
// createDocumentType
// ---------------------------------------------------------------------------

function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();
}

export async function createDocumentType(
  orgId: string,
  name: string
): Promise<
  | { data: import('@/generated/prisma').CarrierDocumentType }
  | { error: string; status: number }
> {
  if (!name || !name.trim()) {
    return { error: 'Name is required', status: 400 };
  }

  let slug = generateSlug(name.trim());
  if (!slug) return { error: 'Invalid name', status: 400 };

  // Ensure slug uniqueness within org
  const existing = await prisma.carrierDocumentType.findMany({
    where: { orgId, slug: { startsWith: slug } },
    select: { slug: true },
  });
  const slugSet = new Set(existing.map((t) => t.slug));
  if (slugSet.has(slug)) {
    let i = 2;
    while (slugSet.has(`${slug}-${i}`)) i++;
    slug = `${slug}-${i}`;
  }

  const docType = await prisma.carrierDocumentType.create({
    data: { orgId, name: name.trim(), slug, isDefault: false, isActive: true },
  });

  logger.info('createDocumentType: created', { orgId, id: docType.id, slug });
  return { data: docType };
}

// ---------------------------------------------------------------------------
// updateDocumentType
// ---------------------------------------------------------------------------

export async function updateDocumentType(
  orgId: string,
  id: string,
  updates: { name?: string; isActive?: boolean }
): Promise<
  | { data: import('@/generated/prisma').CarrierDocumentType }
  | { error: string; status: number }
> {
  const existing = await prisma.carrierDocumentType.findFirst({ where: { id, orgId } });
  if (!existing) return { error: 'Not found', status: 404 };

  const data: { name?: string; isActive?: boolean } = {};

  if (updates.name !== undefined) {
    if (existing.isDefault) {
      return { error: 'Cannot rename a default document type', status: 400 };
    }
    if (!updates.name.trim()) return { error: 'Name is required', status: 400 };
    data.name = updates.name.trim();
  }

  if (updates.isActive !== undefined) {
    data.isActive = updates.isActive;
  }

  const updated = await prisma.carrierDocumentType.update({ where: { id }, data });
  return { data: updated };
}

// ---------------------------------------------------------------------------
// deleteDocumentType
// ---------------------------------------------------------------------------

export async function deleteDocumentType(
  orgId: string,
  id: string
): Promise<{ data: { deleted: boolean } } | { error: string; status: number }> {
  const existing = await prisma.carrierDocumentType.findFirst({ where: { id, orgId } });
  if (!existing) return { error: 'Not found', status: 404 };

  if (existing.isDefault) {
    return { error: 'Default document types cannot be deleted', status: 400 };
  }

  const docCount = await prisma.carrierDocument.count({ where: { documentTypeId: id } });
  if (docCount > 0) {
    return {
      error: `Cannot delete: ${docCount} document(s) reference this type`,
      status: 400,
    };
  }

  await prisma.carrierDocumentType.delete({ where: { id } });
  logger.info('deleteDocumentType: deleted', { orgId, id });
  return { data: { deleted: true } };
}
