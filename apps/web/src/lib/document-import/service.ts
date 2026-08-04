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
   * Persisted to `document_import_pages.raw_response` by `writePageOutcome`
   * (Phase 2, migration `20260803115314_add_raw_response`). Do not fold it into
   * `failureMessage` — that string is user-facing and this one is model output.
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
  | 'ZERO_CONSIGNMENTS'
  /** The caller's `shouldContinue` returned false mid-run (Phase 2 — Cancel). */
  | 'CANCELLED';

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

  /**
   * Called as each page settles, success or failure, before the run finishes
   * (Phase 2).
   *
   * This is what makes the progress counter and the resume path real rather
   * than cosmetic: the persistence layer writes the `document_import_pages` row
   * here, so a run that dies halfway — a killed lambda, a closed tab, a phone
   * that went to sleep — leaves behind exactly the pages that did land. Re-running
   * then costs only the pages that did not, because the cache reads those rows.
   *
   * The page's extraction is passed alongside the outcome rather than folded
   * into it: `PageOutcome` is the public accounting shape and has no business
   * carrying a payload, but the persistence layer needs both to write the row
   * that `cache.ts` later reads.
   *
   * A throw is swallowed. Progress reporting must never lose a page that was
   * successfully extracted and paid for.
   *
   * BUT: the swallow is not permission to fail quietly. A callback that cannot
   * write its row must LOG before it throws — otherwise a failed write produces
   * no row, no log, and a cache that is cold forever with nothing to explain it.
   * See `intake.ts`, which wraps `writePageOutcome` for exactly this reason.
   */
  onPageSettled?: (
    outcome: PageOutcome,
    extraction: PageExtraction | null,
  ) => void | Promise<void>;

  /**
   * Checked before each page is sent to the model. Returning false stops the
   * run cleanly (Phase 2 — the Cancel button).
   *
   * Pages already in flight finish; their outcomes are still reported and still
   * cached, because they have already been billed. Only unstarted work is
   * dropped, and the result comes back as `CANCELLED`.
   */
  shouldContinue?: () => boolean | Promise<boolean>;
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

/**
 * The zero-consignments message, chosen by what was actually read (DEC-6).
 *
 * Three different situations wear the same failure code, and only one of them
 * is fixed by a camera:
 * - photos      → re-shoot, and say what "clearer" means (whole page in frame)
 * - a PDF       → nothing to re-shoot; the read succeeded and found no stops
 * - a mix       → name both, because either could be the cause
 */
export function zeroConsignmentsMessage(pages: SourcePage[]): string {
  // PDF-derived means "the user cannot re-shoot this", which is the only thing
  // the wording turns on. A page rendered out of a PDF is an `image/png` and is
  // otherwise indistinguishable from a photo, so it must be asked, not inferred
  // from the MIME type — getting this wrong sends a dispatcher out to re-shoot
  // a document that arrived by email.
  const isPdfDerived = (p: SourcePage) => p.isMultiPage || p.fromPdf;
  const hasPdf = pages.some(isPdfDerived);
  const hasPhotos = pages.some((p) => !isPdfDerived(p));
  const many = pages.filter((p) => !isPdfDerived(p)).length > 1;

  if (hasPdf && !hasPhotos) {
    return 'That PDF was read, but no delivery stops were found in it. Check it is the delivery schedule or manifest rather than a cover sheet, then try again.';
  }
  if (hasPdf && hasPhotos) {
    return 'No delivery stops were found. Check the PDF is the right document, and re-shoot any photo that was blurred or cropped.';
  }
  return many
    ? 'No delivery stops were found on those pages. Take the photos again with the whole page in frame, square on and well lit.'
    : 'No delivery stops were found on that page. Take the photo again with the whole page in frame, square on and well lit.';
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
    onPageSettled,
    shouldContinue,
  } = opts;

  /**
   * Progress reporting is best-effort by design. A page that extracted
   * successfully has already cost money; losing it because the progress write
   * failed would be the worst possible trade.
   */
  const report = async (
    outcome: PageOutcome,
    extraction: PageExtraction | null,
  ): Promise<void> => {
    if (!onPageSettled) return;
    try {
      await onPageSettled(outcome, extraction);
    } catch {
      /* deliberately swallowed — see above */
    }
  };

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

  /**
   * Set once `shouldContinue` says stop. Sticky: we ask the caller at most once
   * per page and never un-cancel, so a slow cancellation check cannot produce a
   * run that half-resumes.
   */
  let cancelled = false;

  // --- per-page extraction, cache-first, bounded concurrency ---------------
  const settled = await mapWithConcurrency(pages, concurrency, async (page) => {
    const cached = await cache.get(tenantId, page.hash);
    if (cached) {
      const outcome: PageOutcome = {
        pageNumber: page.pageNumber,
        pageHash: page.hash,
        storageKey: page.storageKey,
        ok: true,
        wasCached: true,
        inputTokens: 0,
        outputTokens: 0,
        model: cached.model,
      };
      await report(outcome, cached.extraction);
      return { page, extraction: cached.extraction, outcome, skipped: false };
    }

    // Asked only for work not yet started. A page already at the model is paid
    // for either way, so it runs to completion and its result is kept.
    if (cancelled || (shouldContinue && !(await shouldContinue()))) {
      cancelled = true;
      return { page, extraction: null, outcome: null, skipped: true };
    }

    const result = await extractPage(page, { client, model, extractionHints });

    if (!result.ok) {
      const outcome: PageOutcome = {
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
      };
      await report(outcome, null);
      return { page, extraction: null, outcome, skipped: false };
    }

    await cache.put(tenantId, page.hash, { extraction: result.extraction, model: result.model });

    const outcome: PageOutcome = {
      pageNumber: page.pageNumber,
      pageHash: page.hash,
      storageKey: page.storageKey,
      ok: true,
      wasCached: false,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
      model: result.model,
    };
    await report(outcome, result.extraction);
    return { page, extraction: result.extraction, outcome, skipped: false };
  });

  const outcomes: PageOutcome[] = [];
  const pageInputs: PageInput[] = [];
  const thrown: PageOutcome[] = [];

  settled.forEach((s, i) => {
    if (s.ok) {
      // Cancelled before it started — no outcome, nothing billed, nothing to
      // report. The page stays unextracted and a later run will pick it up.
      if (s.value.skipped || !s.value.outcome) return;
      outcomes.push(s.value.outcome);
      if (s.value.extraction) {
        pageInputs.push({ pageNumber: s.value.page.pageNumber, extraction: s.value.extraction });
      }
      return;
    }
    // A thrown error rather than a typed failure — unexpected, but still must
    // not lose the other pages.
    const page = pages[i];
    thrown.push({
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

  // Reported outside the forEach so the callback can be awaited — the worker
  // never saw these, so nothing has told the persistence layer about them yet.
  for (const o of thrown) {
    outcomes.push(o);
    await report(o, null);
  }

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

  // Cancellation is reported before any failure verdict. A run the user stopped
  // is not a run that failed, and telling them to re-shoot pages they chose not
  // to read would be nonsense.
  if (cancelled) {
    const done = outcomes.filter((o) => o.ok).length;
    return {
      ok: false,
      code: 'CANCELLED',
      message:
        done > 0
          ? `Stopped after ${done} of ${pages.length} page${pages.length === 1 ? '' : 's'}. Nothing was lost — starting again will pick up where this left off.`
          : 'Stopped before any pages were read.',
      contentHash,
      usage,
      pages: outcomes,
    };
  }

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
  //
  // DEC-6: the wording is page-count aware and never says "photo" about a PDF.
  // "Take a clearer photo" is a real instruction a dispatcher will follow at
  // 5:30am; sending them out to re-shoot a PDF they were emailed is not.
  if (extraction.consignments.length === 0) {
    return {
      ok: false,
      code: 'ZERO_CONSIGNMENTS',
      message: zeroConsignmentsMessage(pages),
      contentHash,
      usage,
      pages: outcomes,
    };
  }

  return { ok: true, extraction, contentHash, usage, pages: outcomes, mergedCount };
}
