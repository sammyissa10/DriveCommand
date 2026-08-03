/**
 * Document Import — extraction pipeline (Phase 1).
 *
 * Spec:  docs/specs/DocumentImport_TechnicalSpec_v1.md
 * Audit: .planning/document-import/00-AUDIT.md
 *
 * No UI, no React, no route handlers. Phase 2 wires this up.
 *
 * `cache.ts` is intentionally NOT re-exported here — it imports the request-scoped
 * tenant Prisma client, which would drag Next.js server context into every unit
 * test that touches the merge logic. Import it directly where it is needed.
 */

export * from './lifecycle';
export * from './hashing';
export * from './pages';
export * from './merge';
export * from './concurrency';
export * from './extractor';
export * from './service';
export * from './spreadsheet';

/**
 * `upload.ts`, `persistence.ts` and `intake.ts` are NOT re-exported here, for
 * the same reason `cache.ts` is not: they reach for the tenant Prisma client
 * and the storage layer, which would drag server context into every unit test
 * that only wants the merge logic. Import them directly where they are needed.
 */
