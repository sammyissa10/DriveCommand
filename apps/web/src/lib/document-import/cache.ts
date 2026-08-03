/**
 * Prisma-backed per-page extraction cache.
 *
 * Spec Section 14: "Per-page caching: hash each page independently. Re-running
 * sixteen pages where one was re-shot bills for one page."
 *
 * TENANT SCOPING — read this before changing the client acquisition.
 *
 * This module used `getTenantPrisma()`, which resolves the tenant by reading the
 * `x-tenant-id` request header that `middleware.ts` injects. That made the cache
 * silently unusable in two places:
 *
 *   1. Every `/api/mobile/*` request. Mobile authenticates with a Bearer token,
 *      so there is no Supabase session cookie; middleware sees `user === null`,
 *      returns `NextResponse.next()` early for `/api/*`, and never injects the
 *      header. `requireTenantId()` then threw on every page, the catch below
 *      swallowed it, and every mobile import re-read every page at full price —
 *      breaking the "re-shoot one page, bill for one page" guarantee outright.
 *   2. Any context with no request at all: scripts, cron, background work.
 *
 * `getTenantPrismaForOrg(tenantId)` takes the org explicitly, sets the same
 * `app.current_tenant_id` GUC, and applies the same `withTenantRLS` extension.
 * The `PageCache` contract already hands us `tenantId` — it comes from the
 * caller's verified auth (session claim or Bearer claim), which is a stronger
 * source than a header, not a weaker one. Isolation is unchanged: RLS is still
 * forced on this table, the GUC is still set, and `orgId` is still in the where
 * clause. Nothing here bypasses RLS.
 */

import { pageExtractionSchema } from '@drivecommand/validation';
import { Prisma } from '@/generated/prisma';
import { getTenantPrismaForOrg } from '@/lib/context/tenant-context';
import { logger, serializeError } from '@/lib/logger';
import type { CachedPage, PageCache } from './service';

/**
 * Reads the newest successful extraction for these bytes within this tenant.
 *
 * A cache miss is never fatal — if anything goes wrong we return null and the
 * page is extracted fresh. A broken cache should cost money, not correctness.
 * It should not, however, cost money *quietly*: the failure is logged with a
 * serialized error, because `JSON.stringify(someError)` is `{}` and that is
 * exactly how this defect hid.
 */
export const prismaPageCache: PageCache = {
  async get(tenantId: string, pageHash: string): Promise<CachedPage | null> {
    try {
      const db = await getTenantPrismaForOrg(tenantId);
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
      if (!parsed.success) {
        logger.warn('[document-import] cached page failed schema validation; extracting fresh', {
          pageHash,
          issues: parsed.error.issues.slice(0, 3),
        });
        return null;
      }

      return { extraction: parsed.data, model: row.modelIdentifier ?? 'cached' };
    } catch (err) {
      logger.warn('[document-import] page cache read failed; extracting fresh', {
        pageHash,
        err: serializeError(err),
      });
      return null;
    }
  },

  /**
   * Intentionally a no-op — and it is not the reason a run shows `cachedPages: 0`.
   *
   * Rows in `document_import_pages` are written by `writePageOutcome`
   * (persistence.ts), driven by the `onPageSettled` hook. That writer owns
   * `importId` and `pageNumber`, which this port does not carry, and having two
   * writers race for one `(importId, pageNumber)` row would be worse than
   * having one.
   *
   * The genuinely silent failure was elsewhere: `extractDocument`'s `report()`
   * swallows anything `onPageSettled` throws, so a failed row write produced no
   * row, no log, and a permanently cold cache. That call site now logs before
   * rethrowing (intake.ts).
   */
  async put(tenantId: string, pageHash: string): Promise<void> {
    logger.debug('[document-import] cache.put is a no-op; writePageOutcome owns the row', {
      tenantId,
      pageHash,
    });
  },
};
