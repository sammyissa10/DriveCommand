/**
 * Live per-page PDF import test, runnable from a terminal.
 *
 *   npx tsx scripts/test-pdf-import.ts [path-to.pdf] [new|correction]
 *
 * WHAT THIS EXERCISES — the whole intake path, not a lookalike:
 *   putObjectBytes()  — puts the PDF in R2 exactly as the browser's presigned
 *                       PUT does, so `startImport` reads it back from storage
 *   startImport()     — the REAL path: loadSources → materialisePages (renders
 *                       every PDF page to a PNG and stores each as its own R2
 *                       object) → hashDocument → dedupe → insert
 *   runExtraction()   — loads the per-page objects back out of R2 and extracts
 *                       each one through the same image path a photo takes
 *
 * Nothing is stubbed. This is the same code the web route and the mobile route
 * both call.
 *
 * Run it twice — the second time with `correction`, which is what the UI's
 * "import as a correction" button sends, since the same PDF re-uploaded is
 * correctly refused as a duplicate. The second run must report `wasCached=true`
 * on every page and near-zero tokens: rendering is deterministic, so the page
 * hashes match and the per-page cache serves all of them.
 */

// MUST be first — see the note in _bootstrap-env.ts.
import './_bootstrap-env';

import { readFileSync } from 'fs';
import { basename } from 'path';
import { nanoid } from 'nanoid';
import { putObjectBytes } from '../src/lib/storage/object-bytes';
import { startImport, runExtraction, summariseImport } from '../src/lib/document-import/intake';
import { getTenantPrismaForOrg } from '../src/lib/context/tenant-context';
import type { StagedFile } from '../src/lib/document-import/persistence';

const TENANT_ID = '7e9eca25-1f97-46ed-9365-e67be49436d5';
const USER_ID = 'a0a6fe40-78a5-4b4e-8499-8ed1cc4fa63a';

async function main() {
  const path = process.argv[2] ?? 'C:/Users/sammy/Downloads/manifest-3page.pdf';
  const mode = process.argv[3] === 'correction' ? 'correction' : 'new';

  const bytes = readFileSync(path);
  const filename = basename(path);
  console.log(`${filename} · ${(bytes.length / 1024).toFixed(0)}KB · mode=${mode}\n`);

  // Stand in for the browser's presigned PUT. Same bucket, same tenant-prefixed
  // key convention the upload endpoint mints.
  const storageKey = `tenant-${TENANT_ID}/imports/${nanoid()}-${filename}`;
  await putObjectBytes(storageKey, bytes, 'application/pdf');
  console.log(`uploaded → ${storageKey}\n`);

  const files: StagedFile[] = [
    { storageKey, filename, mimeType: 'application/pdf', sizeBytes: bytes.length },
  ];

  const started = await startImport({ orgId: TENANT_ID, userId: USER_ID, files, mode });
  if (!started.ok) {
    console.error('startImport refused:', JSON.stringify(started, null, 2));
    process.exit(1);
  }

  const importId = started.importId;
  console.log(`import ${importId}\nextracting…\n`);

  const t0 = Date.now();
  const result = await runExtraction(TENANT_ID, USER_ID, importId);
  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

  const db = await getTenantPrismaForOrg(TENANT_ID, USER_ID);
  const row = await db.documentImport.findFirst({
    where: { id: importId, orgId: TENANT_ID },
    select: {
      status: true,
      originalName: true,
      sourceMimeType: true,
      sourceFileKeys: true,
      documentType: true,
      documentNumber: true,
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
      storageKey: true,
      wasCached: true,
      inputTokens: true,
      outputTokens: true,
      failureCode: true,
    },
  });

  console.log(`result: ${result.ok ? 'OK' : 'FAILED'} · status ${result.status} · ${elapsed}s`);
  if (result.message) console.log(`message: ${result.message}`);

  console.log('\n--- import row -----------------------------------------------');
  console.log(`originalName   ${row?.originalName ?? '—'}`);
  console.log(`sourceMimeType ${row?.sourceMimeType ?? '—'}`);
  console.log(`sourceFileKeys ${row?.sourceFileKeys.length}`);
  for (const k of row?.sourceFileKeys ?? []) console.log(`               ${k}`);
  console.log(`status         ${row?.status}`);
  console.log(`documentType   ${row?.documentType ?? '—'}`);
  console.log(`pageCount      ${row?.pageCount}`);
  console.log(`cachedPages    ${row?.cachedPages}`);
  console.log(`inputTokens    ${row?.inputTokens}`);
  console.log(`outputTokens   ${row?.outputTokens}`);
  console.log(`costUsd        ${row?.costUsd?.toString() ?? '—'}`);
  if (row?.failureCode) console.log(`failure        ${row.failureCode}: ${row.failureMessage}`);

  console.log(`\n--- document_import_pages (${pages.length} rows) -------------------------`);
  for (const p of pages) {
    console.log(
      `page ${p.pageNumber}  hash ${p.pageHash.slice(0, 16)}…  was_cached=${p.wasCached}  ` +
        `in=${p.inputTokens ?? 0} out=${p.outputTokens ?? 0}` +
        `${p.failureCode ? `  FAILED ${p.failureCode}` : ''}`,
    );
    console.log(`         object ${p.storageKey ?? '—'}`);
  }

  // The view the UI renders — this is where "1 page" was coming from.
  const view = await summariseImport(TENANT_ID, importId, USER_ID);
  console.log(`\n--- summariseImport (what the page strip shows) ---------------`);
  console.log(`pageCount ${view?.pageCount}  pagesDone ${view?.pagesDone}  pagesFailed ${view?.pagesFailed}`);
  for (const p of view?.pages ?? []) {
    console.log(
      `page ${p.pageNumber}  ${p.mimeType}  status=${p.status}  thumbnail=${p.previewUrl ? 'yes' : 'NONE'}`,
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
