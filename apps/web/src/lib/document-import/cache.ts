/**
 * Prisma-backed per-page extraction cache.
 *
 * Spec Section 14: "Per-page caching: hash each page independently. Re-running
 * sixteen pages where one was re-shot bills for one page."
 *
 * The lookup is scoped by `orgId` as well as `pageHash`. RLS already enforces
 * that, but a cache that silently crossed tenants would leak one carrier's
 * document contents into another's import, so the filter is explicit here too.
 */

import { pageExtractionSchema } from '@drivecommand/validation';
import { Prisma } from '@/generated/prisma';
import { getTenantPrisma } from '@/lib/context/tenant-context';
import { logger } from '@/lib/logger';
import type { CachedPage, PageCache } from './service';

/**
 * Reads the newest successful extraction for these bytes within this tenant.
 *
 * A cache miss is never fatal — if anything goes wrong we return null and the
 * page is extracted fresh. A broken cache should cost money, not correctness.
 */
export const prismaPageCache: PageCache = {
  async get(tenantId: string, pageHash: string): Promise<CachedPage | null> {
    try {
      const db = await getTenantPrisma();
      const row = await db.documentImportPage.findFirst({
        where: {
          orgId: tenantId,
          pageHash,
          // Prisma.DbNull, not null: a nullable Json column needs the sentinel
          // to express "is not SQL NULL" in a filter.
          extraction: { not: Prisma.DbNull },
          failureCode: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { extraction: true, modelIdentifier: true },
      });

      if (!row?.extraction) return null;

      // Validate on the way out: a cached shape written by an older version of
      // the schema must not silently poison a new import.
      const parsed = pageExtractionSchema.safeParse(row.extraction);
      if (!parsed.success) return null;

      return { extraction: parsed.data, model: row.modelIdentifier ?? 'cached' };
    } catch (err) {
      logger.warn('[document-import] page cache read failed; extracting fresh', { pageHash, err });
      return null;
    }
  },

  /**
   * No-op. Rows are written by the import persistence layer, which owns the
   * `document_import_pages` row for this import (it needs importId and
   * pageNumber, which the cache port does not carry). Keeping this a no-op
   * avoids two writers racing for the same row.
   */
  async put(): Promise<void> {
    /* intentionally empty — see doc comment */
  },
};
