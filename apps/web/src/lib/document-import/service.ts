/**
 * Extraction service — the orchestrator.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 5, Phase 1 item 3.
 *
 * Takes an ordered list of source files and returns one canonical extraction,
 * with token accounting and a typed failure for the zero-consignment case.
 *
 * Deliberately free of UI and of Prisma. The per-page cache is an injected
 * interface, so the whole pipeline can be exercised in a unit test with a fake
 * cache and a fake model client. `cache.ts` supplies the Prisma-backed
 * implementation used in production.
 */

import type { CanonicalExtraction, PageExtraction } from '@drivecommand/validation';
import { assemblePages, type PageInput } from './merge';
import { DEFAULT_CONCURRENCY, mapWithConcurrency } from './concurrency';
import {
  estimateCostUsd,
  extractPage,
  EXTRACTION_MODEL,
  type AnthropicLike,
  type ExtractionFailureCode,
} from './extractor';
import { hashDocument } from './hashing';
import {
  classify,
  isUnsupportedSpreadsheet,
  toPages,
  type SourceFile,
  type SourcePage,
} from './pages';

// ---------------------------------------------------------------------------
// Cache port
// ---------------------------------------------------------------------------

export interface CachedPage {
  extraction: PageExtraction;
  model: string;
}

/**
 * Per-page extraction cache, keyed on (tenant, page hash).
 *
 * Tenant-scoped by contract: one tenant must never read another's extraction,
 * even for byte-identical pages. The Prisma implementation enforces this with
 * `org_id` in the lookup, on top of RLS.
 */
export interface PageCache {
  get(tenantId: string, pageHash: string): Promise<CachedPage | null>;
  put(tenantId: string, pageHash: string, value: CachedPage): Promise<void>;
}

/** No-op cache: every page is extracted fresh. */
export const NULL_PAGE_CACHE: PageCache = {
  async get() {
    return null;
  },
  async put() {
    /* no-op */
  },
};

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface PageOutcome {
  pageNumber: number;
  pageHash: string;
  storageKey?: string | null;
  ok: boolean;
  wasCached: boolean;
  failureCode?: ExtractionFailureCode;
  failureMessage?: string;
  /**
   * What the model actually sent, when the reply could not be parsed — capped at
   * `RAW_RESPONSE_LIMIT` (20KB) by the extractor.
   *
   * `document_import_pages` has no column for this today; the row carries only
   * `failure_code` and `failure_message`, and nothing writes those rows yet
   * (the persistence layer lands in Phase 2). Carrying it on the outcome means
   * the diagnostic survives to whoever calls the service now, and gives that
   * layer something to persist into failure details when it is built. Do not
   * fold it into `failureMessage` — that string is user-facing.
   */
  rawResponse?: string;
  inputTokens: number;
  outputTokens: number;
  model?: string;
}

export interface ExtractionUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  /** Money as a fixed-precision string, never a float. Persisted to Decimal. */
  costUsd: string;
  pageCount: number;
  cachedPages: number;
}

export interface ExtractionSuccess {
  ok: true;
  extraction: CanonicalExtraction;
  contentHash: string;
  usage: ExtractionUsage;
  pages: PageOutcome[];
  mergedCount: number;
}

export type ServiceFailureCode =
  | 'NO_PAGES'
  | 'UNSUPPORTED_XLSX'
  | 'UNSUPPORTED_TYPE'
  | 'ALL_PAGES_FAILED'
  | 'ZERO_CONSIGNMENTS';

export interface ExtractionFailure {
  ok: false;
  code: ServiceFailureCode;
  /** Plain language, safe to show a dispatcher at 5:30am. */
  message: string;
  contentHash?: string;
  usage?: ExtractionUsage;
  pages?: PageOutcome[];
}

export type ExtractionServiceResult = ExtractionSuccess | ExtractionFailure;

export interface ExtractOptions {
  tenantId: string;
  sources: SourceFile[];
  cache?: PageCache;
  client?: AnthropicLike;
  model?: string;
  concurrency?: number;
  extractionHints?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Failure classification
// ---------------------------------------------------------------------------

/**
 * Failures that have nothing to do with the photograph.
 *
 * A missing API key, a model call that threw, or a reply we could not parse are
 * all our problem. Telling a dispatcher at 5:30am to "take clearer photos"
 * because our API key expired sends them out to re-shoot sixteen pages that were
 * fine, and they will do it, because we told them to.
 */
const SERVICE_FAILURE_CODES: ReadonlySet<ExtractionFailureCode> = new Set([
  'NO_API_KEY',
  'MODEL_ERROR',
  'UNPARSEABLE_RESPONSE',
]);

/**
 * The all-pages-failed message, chosen by what actually failed.
 *
 * Only a page-level unreadable-image failure earns a "re-shoot it" instruction.
 * A mix of both keeps the photo advice — at least one page genuinely was
 * unreadable — but says the rest was on us.
 */
export function allPagesFailedMessage(failed: PageOutcome[], pageCount: number): string {
  const singular = pageCount === 1;
  const allService =
    failed.length > 0 &&
    failed.every((o) => o.failureCode !== undefined && SERVICE_FAILURE_CODES.has(o.failureCode));

  if (allService) {
    return singular
      ? 'The document reader could not process that page. This is a problem with the reading service, not with your photo — try again in a few minutes, and contact support if it keeps happening.'
      : 'The document reader could not process any of those pages. This is a problem with the reading service, not with your photos — try again in a few minutes, and contact support if it keeps happening.';
  }

  const someService = failed.some(
    (o) => o.failureCode !== undefined && SERVICE_FAILURE_CODES.has(o.failureCode),
  );

  if (someService) {
    return 'Some pages could not be read, and the reading service failed on the rest. Re-shoot any page that was blurred or cropped, then try again — and contact support if it keeps happening.';
  }

  return singular
    ? 'That page could not be read. Take a clearer photo and try again.'
    : 'None of those pages could be read. Take clearer photos and try again.';
}

// ---------------------------------------------------------------------------
// Orchestration
// ---------------------------------------------------------------------------

export async function extractDocument(opts: ExtractOptions): Promise<ExtractionServiceResult> {
  const {
    tenantId,
    sources,
    cache = NULL_PAGE_CACHE,
    client,
    model = EXTRACTION_MODEL,
    concurrency = DEFAULT_CONCURRENCY,
    extractionHints,
  } = opts;

  // XLSX gets its own message rather than a generic type error — the user can
  // act on "save it as CSV", not on "unsupported MIME type".
  const xlsx = sources.find((s) => isUnsupportedSpreadsheet(s.mimeType));
  if (xlsx) {
    return {
      ok: false,
      code: 'UNSUPPORTED_XLSX',
      message:
        'Excel files are not supported yet. Save the sheet as CSV and upload that instead.',
    };
  }

  const unsupported = sources.find((s) => classify(s.mimeType) === 'unsupported');
  if (unsupported) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      message: `"${unsupported.filename}" is not a photo, PDF, or CSV. Upload a photo of the page, a PDF, or a CSV.`,
    };
  }

  const pages: SourcePage[] = toPages(sources);
  if (pages.length === 0) {
    return {
      ok: false,
      code: 'NO_PAGES',
      message: 'No pages to read. Add at least one photo or PDF.',
    };
  }

  const contentHash = hashDocument(pages.map((p) => p.bytes));

  // --- per-page extraction, cache-first, bounded concurrency ---------------
  const settled = await mapWithConcurrency(pages, concurrency, async (page) => {
    const cached = await cache.get(tenantId, page.hash);
    if (cached) {
      return {
        page,
        extraction: cached.extraction,
        outcome: {
          pageNumber: page.pageNumber,
          pageHash: page.hash,
          storageKey: page.storageKey,
          ok: true,
          wasCached: true,
          inputTokens: 0,
          outputTokens: 0,
          model: cached.model,
        } satisfies PageOutcome,
      };
    }

    const result = await extractPage(page, { client, model, extractionHints });

    if (!result.ok) {
      return {
        page,
        extraction: null,
        outcome: {
          pageNumber: page.pageNumber,
          pageHash: page.hash,
          storageKey: page.storageKey,
          ok: false,
          wasCached: false,
          failureCode: result.code,
          failureMessage: result.message,
          rawResponse: result.raw,
          inputTokens: result.inputTokens ?? 0,
          outputTokens: result.outputTokens ?? 0,
          model: result.model,
        } satisfies PageOutcome,
      };
    }

    await cache.put(tenantId, page.hash, { extraction: result.extraction, model: result.model });

    return {
      page,
      extraction: result.extraction,
      outcome: {
        pageNumber: page.pageNumber,
        pageHash: page.hash,
        storageKey: page.storageKey,
        ok: true,
        wasCached: false,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        model: result.model,
      } satisfies PageOutcome,
    };
  });

  const outcomes: PageOutcome[] = [];
  const pageInputs: PageInput[] = [];

  settled.forEach((s, i) => {
    if (s.ok) {
      outcomes.push(s.value.outcome);
      if (s.value.extraction) {
        pageInputs.push({ pageNumber: s.value.page.pageNumber, extraction: s.value.extraction });
      }
      return;
    }
    // A thrown error rather than a typed failure — unexpected, but still must
    // not lose the other pages.
    const page = pages[i];
    outcomes.push({
      pageNumber: page.pageNumber,
      pageHash: page.hash,
      storageKey: page.storageKey,
      ok: false,
      wasCached: false,
      failureCode: 'MODEL_ERROR',
      failureMessage: s.error instanceof Error ? s.error.message : 'Unexpected extraction error.',
      inputTokens: 0,
      outputTokens: 0,
    });
  });

  outcomes.sort((a, b) => a.pageNumber - b.pageNumber);

  const inputTokens = outcomes.reduce((n, o) => n + o.inputTokens, 0);
  const outputTokens = outcomes.reduce((n, o) => n + o.outputTokens, 0);
  const cachedPages = outcomes.filter((o) => o.wasCached).length;

  const usage: ExtractionUsage = {
    model,
    inputTokens,
    outputTokens,
    costUsd: estimateCostUsd(inputTokens, outputTokens).toFixed(6),
    pageCount: pages.length,
    cachedPages,
  };

  if (pageInputs.length === 0) {
    return {
      ok: false,
      code: 'ALL_PAGES_FAILED',
      message: allPagesFailedMessage(
        outcomes.filter((o) => !o.ok),
        pages.length,
      ),
      contentHash,
      usage,
      pages: outcomes,
    };
  }

  // --- assemble + merge ----------------------------------------------------
  const { extraction, mergedCount } = assemblePages(pageInputs);

  // Pages that failed become warnings on the document, so the review screen can
  // offer "re-shoot page 7" rather than failing the whole import.
  for (const o of outcomes) {
    if (o.ok) continue;
    extraction.extractionWarnings.push({
      code: o.failureCode ?? 'PAGE_FAILED',
      message: o.failureMessage ?? `Page ${o.pageNumber} could not be read.`,
      pageNumbers: [o.pageNumber],
    });
  }

  // Spec Section 14: zero consignments is a CLEAN TYPED FAILURE, not an
  // exception — the user gets a "clearer photo" action, not a stack trace.
  if (extraction.consignments.length === 0) {
    return {
      ok: false,
      code: 'ZERO_CONSIGNMENTS',
      message:
        'No delivery stops were found on this document. Take a clearer photo, making sure the whole page is in frame.',
      contentHash,
      usage,
      pages: outcomes,
    };
  }

  return { ok: true, extraction, contentHash, usage, pages: outcomes, mergedCount };
}
