/**
 * Live extraction + page-cache test, runnable from a terminal.
 *
 *   npx tsx scripts/test-extraction.ts
 *
 * WHAT THIS EXERCISES. The real code path, not a lookalike:
 *   beginImport()              — the dedupe / supersede / insert `startImport` uses
 *   runExtractionWithSources() — the same status guards, the same
 *                                UPLOADED→EXTRACTING transition, the same cache
 *                                wiring, per-page persistence and finish/fail
 *                                handling that `runExtraction` uses from a route
 *
 * The ONE thing it replaces is `loadSources()`, i.e. "fetch the bytes from R2".
 * There are no S3 credentials in `.env` or `.env.local`, so the storage read
 * cannot run here — the bytes are read from a local folder instead. That step
 * is not part of the cache mechanism, so the cache result below is real.
 *
 * WHY THE CACHE USED TO MISS EVERY TIME. `prismaPageCache` acquired its client
 * through `getTenantPrisma()`, which resolves the tenant from the `x-tenant-id`
 * header that `middleware.ts` injects. In a script there is no request, so
 * `headers()` threw; the catch swallowed it, logged `err: {}` (an Error has no
 * enumerable own properties, so `JSON.stringify` yields `{}`), and every page
 * was extracted fresh. The same was true of every `/api/mobile/*` request,
 * where middleware never injects that header. Both are fixed by taking the org
 * explicitly — see `cache.ts`.
 *
 * Run it twice. The second run should report `cachedPages: 4` and near-zero
 * tokens, and `document_import_pages` should hold rows afterwards.
 */

// MUST be first — it loads .env + .env.local and repoints DATABASE_URL at
// DIRECT_URL before `lib/db/prisma.ts` builds its pool at module scope.
import './_bootstrap-env';

import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { hashDocument } from '../src/lib/document-import/hashing';
import { beginImport, runExtractionWithSources } from '../src/lib/document-import/intake';
import { getTenantPrismaForOrg } from '../src/lib/context/tenant-context';
import type { SourceFile } from '../src/lib/document-import/pages';
import type { StagedFile } from '../src/lib/document-import/persistence';

const FOLDER = 'C:/Users/sammy/Desktop/manifest';
const TENANT_ID = '7e9eca25-1f97-46ed-9365-e67be49436d5';
const USER_ID = 'a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a';

function mimeFor(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop();
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'pdf') return 'application/pdf';
  if (ext === 'csv') return 'text/csv';
  return 'image/jpeg';
}

async function main() {
  const filenames = readdirSync(FOLDER)
    .filter((f) => /\.(jpe?g|png|webp|pdf)$/i.test(f))
    .sort();

  if (filenames.length === 0) {
    console.error(`No source files in ${FOLDER}`);
    process.exit(1);
  }

  // Local bytes standing in for the storage read. The keys are the tenant-
  // prefixed keys these files WOULD have — `beginImport` asserts the prefix, and
  // that assertion must not be weakened just because this is a script.
  const sources: SourceFile[] = filenames.map((filename, i) => ({
    ordinal: i,
    filename,
    mimeType: mimeFor(filename),
    bytes: readFileSync(join(FOLDER, filename)),
    storageKey: `tenant-${TENANT_ID}/imports/local-${filename}`,
  }));

  const files: StagedFile[] = sources.map((s) => ({
    storageKey: s.storageKey!,
    filename: s.filename,
    mimeType: s.mimeType,
    sizeBytes: s.bytes.length,
  }));

  const contentHash = hashDocument(sources.map((s) => s.bytes));
  console.log(`${sources.length} pages · contentHash ${contentHash.slice(0, 16)}…\n`);

  // 'correction' so a second run supersedes the first rather than being
  // refused as a duplicate — the same path the UI's "import as a correction"
  // button takes. The per-page cache is keyed on (org, pageHash) and is
  // independent of which import row asks for it, which is the whole point.
  const started = await beginImport({
    orgId: TENANT_ID,
    userId: USER_ID,
    files,
    contentHash,
    mode: 'correction',
  });

  if (!started.ok) {
    console.error('beginImport refused:', JSON.stringify(started, null, 2));
    process.exit(1);
  }

  const importId = started.importId;
  console.log(`import ${importId}\nextracting…\n`);

  const started_at = Date.now();
  const result = await runExtractionWithSources(TENANT_ID, USER_ID, importId, sources);
  const elapsed = ((Date.now() - started_at) / 1000).toFixed(1);

  // Read the accounting back off the row, which is where the route reads it.
  const db = await getTenantPrismaForOrg(TENANT_ID, USER_ID);
  const row = await db.documentImport.findFirst({
    where: { id: importId, orgId: TENANT_ID },
    select: {
      status: true,
      documentType: true,
      documentNumber: true,
      documentDate: true,
      modelIdentifier: true,
      inputTokens: true,
      outputTokens: true,
      costUsd: true,
      pageCount: true,
      cachedPages: true,
      failureCode: true,
      failureMessage: true,
      rawExtraction: true,
    },
  });

  const pages = await db.documentImportPage.findMany({
    where: { orgId: TENANT_ID, importId },
    orderBy: { pageNumber: 'asc' },
    select: {
      pageNumber: true,
      pageHash: true,
      wasCached: true,
      inputTokens: true,
      outputTokens: true,
      failureCode: true,
    },
  });

  console.log(`result: ${result.ok ? 'OK' : 'FAILED'} · status ${result.status} · ${elapsed}s`);
  if (result.message) console.log(`message: ${result.message}`);
  console.log();

  console.log('--- import row -----------------------------------------------');
  console.log(`status        ${row?.status}`);
  console.log(`documentType  ${row?.documentType ?? '—'}`);
  console.log(`documentNo    ${row?.documentNumber ?? '—'}`);
  console.log(`model         ${row?.modelIdentifier ?? '—'}`);
  console.log(`pageCount     ${row?.pageCount}`);
  console.log(`cachedPages   ${row?.cachedPages}`);
  console.log(`inputTokens   ${row?.inputTokens}`);
  console.log(`outputTokens  ${row?.outputTokens}`);
  console.log(`costUsd       ${row?.costUsd?.toString() ?? '—'}`);
  if (row?.failureCode) console.log(`failure       ${row.failureCode}: ${row.failureMessage}`);

  console.log('\n--- document_import_pages rows -------------------------------');
  for (const p of pages) {
    console.log(
      `page ${p.pageNumber}  hash ${p.pageHash.slice(0, 12)}…  cached=${p.wasCached}  ` +
        `in=${p.inputTokens ?? 0} out=${p.outputTokens ?? 0}${p.failureCode ? `  FAILED ${p.failureCode}` : ''}`,
    );
  }

  const extraction = row?.rawExtraction as
    | { consignments?: Array<{ externalCode?: string; name?: string; pageNumbers?: number[] }> }
    | null;
  const consignments = extraction?.consignments ?? [];
  console.log(`\n--- ${consignments.length} consignments ---------------------------------------`);
  for (const c of consignments) {
    console.log(`${c.externalCode ?? 'no-code'}  ${c.name}  pages ${JSON.stringify(c.pageNumbers)}`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error('ERROR:', e);
  process.exit(1);
});
