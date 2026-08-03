/**
 * Extraction service tests — the pipeline end to end, with a fake model client
 * and a fake cache. No network, no database.
 */

import { describe, it, expect } from 'vitest';
import { extractDocument, type PageCache, type CachedPage } from '../service';
import { mapWithConcurrency } from '../concurrency';
import type { SourceFile } from '../pages';
import type { AnthropicLike } from '../extractor';

// ---------------------------------------------------------------------------
// Fakes
// ---------------------------------------------------------------------------

function reply(consignments: unknown[], warnings: unknown[] = []) {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({
          documentType: 'MANIFEST',
          header: { documentDate: '2026-07-27', originName: 'DEALER TIRE' },
          consignments,
          extractionWarnings: warnings,
        }),
      },
    ],
    usage: { input_tokens: 1000, output_tokens: 200 },
  };
}

function fakeClient(
  handler: (call: number) => unknown,
): AnthropicLike & { calls: number } {
  const c = {
    calls: 0,
    messages: {
      async create() {
        c.calls += 1;
        return handler(c.calls);
      },
    },
    beta: {
      messages: {
        async create() {
          c.calls += 1;
          return handler(c.calls);
        },
      },
    },
  };
  return c;
}

function memoryCache(): PageCache & { store: Map<string, CachedPage> } {
  const store = new Map<string, CachedPage>();
  return {
    store,
    async get(tenantId, hash) {
      return store.get(`${tenantId}:${hash}`) ?? null;
    },
    async put(tenantId, hash, value) {
      store.set(`${tenantId}:${hash}`, value);
    },
  };
}

function photo(ordinal: number, content: string): SourceFile {
  return {
    ordinal,
    filename: `page-${ordinal}.jpg`,
    mimeType: 'image/jpeg',
    bytes: Buffer.from(content, 'utf8'),
  };
}

const RUSS = {
  externalCode: '43775',
  name: 'RUSS DARROW NISSAN',
  address: { line1: '11212 W METRO BLVD', city: 'MILWAUKEE', state: 'WI', postalCode: '53224' },
  references: [{ type: 'SHIPMENT', value: '77198347' }],
  totals: { pieces: 4, weight: 88, weightUom: 'LBS' },
  fieldConfidence: { name: 0.97 },
};

// ---------------------------------------------------------------------------

describe('extractDocument', () => {
  it('extracts a multi-photo manifest into one canonical document', async () => {
    const client = fakeClient(() => reply([RUSS]));
    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'p1'), photo(2, 'p2')],
      client,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.usage.pageCount).toBe(2);
    expect(result.usage.inputTokens).toBe(2000);
    expect(result.usage.outputTokens).toBe(400);
    // Money as a fixed-precision string, never a float.
    expect(result.usage.costUsd).toMatch(/^\d+\.\d{6}$/);
    expect(result.extraction.header.documentDate).toBe('2026-07-27');
  });

  it('merges the same consignee across two photos into one stop', async () => {
    const client = fakeClient((n) =>
      n === 1
        ? reply([RUSS])
        : reply([{ ...RUSS, references: [{ type: 'SHIPMENT', value: '77203176' }], totals: { pieces: 1, weight: 26, weightUom: 'LBS' } }]),
    );

    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'p1'), photo(2, 'p2')],
      client,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.consignments).toHaveLength(1);
    expect(result.extraction.consignments[0].totals.pieces).toBe(5);
    expect(result.extraction.consignments[0].pageNumbers).toEqual([1, 2]);
  });

  it('bills nothing for a cached page on the second run', async () => {
    const cache = memoryCache();
    const client = fakeClient(() => reply([RUSS]));

    const first = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'same-bytes')],
      client,
      cache,
    });
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.usage.inputTokens).toBe(1000);
    expect(first.usage.cachedPages).toBe(0);
    expect(client.calls).toBe(1);

    const second = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'same-bytes')],
      client,
      cache,
    });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    // Spec Section 14 / verify check #5: far fewer tokens the second time.
    expect(second.usage.inputTokens).toBe(0);
    expect(second.usage.cachedPages).toBe(1);
    expect(client.calls).toBe(1); // model was NOT called again
  });

  it('never serves one tenant a cached page from another', async () => {
    const cache = memoryCache();
    const client = fakeClient(() => reply([RUSS]));

    await extractDocument({ tenantId: 't1', sources: [photo(1, 'shared')], client, cache });
    const other = await extractDocument({ tenantId: 't2', sources: [photo(1, 'shared')], client, cache });

    expect(other.ok).toBe(true);
    if (!other.ok) return;
    expect(other.usage.cachedPages).toBe(0);
    expect(client.calls).toBe(2);
  });

  it('bills only the re-shot page when one page of many changed', async () => {
    const cache = memoryCache();
    const client = fakeClient(() => reply([RUSS]));

    await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b'), photo(3, 'c')],
      client,
      cache,
    });
    expect(client.calls).toBe(3);

    // Page 2 re-shot; 1 and 3 are byte-identical.
    const rerun = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b-reshot'), photo(3, 'c')],
      client,
      cache,
    });

    expect(rerun.ok).toBe(true);
    if (!rerun.ok) return;
    expect(rerun.usage.cachedPages).toBe(2);
    expect(client.calls).toBe(4); // exactly one more call
  });

  it('keeps the other pages when one page is unreadable', async () => {
    const client = fakeClient((n) =>
      n === 2
        ? reply([], [{ code: 'UNREADABLE_PAGE', message: 'too blurred', pageNumbers: [2] }])
        : reply([RUSS]),
    );

    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b'), photo(3, 'c')],
      client,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.consignments).toHaveLength(1);
    expect(result.pages.filter((p) => !p.ok)).toHaveLength(1);
    expect(result.extraction.extractionWarnings.some((w) => w.code === 'UNREADABLE_PAGE')).toBe(true);
  });

  it('returns a clean typed failure for zero consignments, not an exception', async () => {
    const client = fakeClient(() => reply([]));
    const result = await extractDocument({ tenantId: 't1', sources: [photo(1, 'blank')], client });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ZERO_CONSIGNMENTS');
    // DEC-6: the wording tells the user what to DO, and "take the photo again"
    // is only correct advice when the source actually was a photo — see the
    // PDF case below.
    expect(result.message).toMatch(/take the photo again/i);
    expect(result.message).toMatch(/whole page in frame/i);
  });

  it('does not tell the user to re-shoot a PDF that had no stops in it (DEC-6)', async () => {
    const client = fakeClient(() => reply([]));
    const result = await extractDocument({
      tenantId: 't1',
      sources: [
        { ordinal: 1, filename: 'manifest.pdf', mimeType: 'application/pdf', bytes: Buffer.from('%PDF-') },
      ],
      client,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ZERO_CONSIGNMENTS');
    expect(result.message).not.toMatch(/photo/i);
    expect(result.message).toMatch(/PDF/);
  });

  it('uses plural wording when several photos came back empty', async () => {
    const client = fakeClient(() => reply([]));
    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b')],
      client,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.message).toMatch(/take the photos again/i);
  });

  it('returns a typed failure when every page fails', async () => {
    const client = fakeClient(() => {
      throw new Error('model exploded');
    });
    const result = await extractDocument({ tenantId: 't1', sources: [photo(1, 'a')], client });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ALL_PAGES_FAILED');
  });

  it('rejects xlsx with a message naming CSV', async () => {
    const result = await extractDocument({
      tenantId: 't1',
      sources: [
        {
          ordinal: 1,
          filename: 'manifest.xlsx',
          mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          bytes: Buffer.from('x'),
        },
      ],
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNSUPPORTED_XLSX');
    expect(result.message).toMatch(/CSV/);
  });

  it('rejects an empty source list', async () => {
    const result = await extractDocument({ tenantId: 't1', sources: [] });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('NO_PAGES');
  });

  it('respects the user-chosen page order, not the array order', async () => {
    const client = fakeClient((n) =>
      reply([{ ...RUSS, externalCode: `code-${n}`, name: `CONSIGNEE ${n}` }]),
    );
    const result = await extractDocument({
      tenantId: 't1',
      // Deliberately out of order — the warehouse reality from spec Section 14.
      sources: [photo(3, 'c'), photo(1, 'a'), photo(2, 'b')],
      client,
      concurrency: 1,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages.map((p) => p.pageNumber)).toEqual([1, 2, 3]);
  });
});

// ---------------------------------------------------------------------------
// Phase 2 — progress reporting and cancellation
// ---------------------------------------------------------------------------

describe('extractDocument progress hooks', () => {
  it('reports every page as it settles, before the run returns', async () => {
    const client = fakeClient(() => reply([RUSS]));
    const seen: Array<{ page: number; ok: boolean; hasExtraction: boolean }> = [];

    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b'), photo(3, 'c')],
      client,
      concurrency: 1,
      onPageSettled: (outcome, extraction) => {
        seen.push({ page: outcome.pageNumber, ok: outcome.ok, hasExtraction: extraction !== null });
      },
    });

    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(3);
    expect(seen.map((s) => s.page).sort()).toEqual([1, 2, 3]);
    expect(seen.every((s) => s.ok && s.hasExtraction)).toBe(true);
  });

  it('reports a failed page too, so the UI can offer to re-shoot just that one', async () => {
    const client = fakeClient((n) =>
      n === 2 ? { content: [{ type: 'text', text: 'not json' }], usage: {} } : reply([RUSS]),
    );
    const failed: number[] = [];

    await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b'), photo(3, 'c')],
      client,
      concurrency: 1,
      onPageSettled: (outcome) => {
        if (!outcome.ok) failed.push(outcome.pageNumber);
      },
    });

    expect(failed).toEqual([2]);
  });

  it('a throwing progress callback never loses a page that was already paid for', async () => {
    const client = fakeClient(() => reply([RUSS]));
    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b')],
      client,
      onPageSettled: () => {
        throw new Error('database is on fire');
      },
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pages).toHaveLength(2);
  });

  it('stops cleanly when shouldContinue turns false, and says so', async () => {
    const client = fakeClient(() => reply([RUSS]));
    let allowed = 2;

    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b'), photo(3, 'c'), photo(4, 'd')],
      client,
      concurrency: 1,
      shouldContinue: () => allowed-- > 0,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('CANCELLED');
    // Two pages were read and billed; the other two were never sent.
    expect(client.calls).toBe(2);
    expect(result.pages).toHaveLength(2);
    expect(result.message).toMatch(/pick up where this left off/i);
  });

  it('a cancelled run leaves its finished pages in the cache, so resuming is free', async () => {
    const cache = memoryCache();
    const client = fakeClient(() => reply([RUSS]));
    let allowed = 1;

    await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b'), photo(3, 'c')],
      client,
      cache,
      concurrency: 1,
      shouldContinue: () => allowed-- > 0,
    });
    expect(client.calls).toBe(1);

    // Resume: page 1 comes from the cache, only 2 and 3 reach the model.
    const resumed = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b'), photo(3, 'c')],
      client,
      cache,
      concurrency: 1,
    });

    expect(resumed.ok).toBe(true);
    if (!resumed.ok) return;
    expect(resumed.usage.cachedPages).toBe(1);
    expect(client.calls).toBe(3); // 1 before + 2 after
  });
});

describe('mapWithConcurrency', () => {
  it('never exceeds the limit', async () => {
    let active = 0;
    let peak = 0;
    await mapWithConcurrency(Array.from({ length: 20 }, (_, i) => i), 4, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 1));
      active -= 1;
      return null;
    });
    expect(peak).toBeLessThanOrEqual(4);
  });

  it('settles every task even when one rejects', async () => {
    const out = await mapWithConcurrency([1, 2, 3], 2, async (n) => {
      if (n === 2) throw new Error('nope');
      return n;
    });
    expect(out.map((r) => r.ok)).toEqual([true, false, true]);
  });

  it('preserves input order in the results', async () => {
    const out = await mapWithConcurrency([30, 10, 20], 3, async (n) => {
      await new Promise((r) => setTimeout(r, n / 10));
      return n;
    });
    expect(out.map((r) => (r.ok ? r.value : null))).toEqual([30, 10, 20]);
  });

  it('handles an empty list', async () => {
    expect(await mapWithConcurrency([], 4, async () => 1)).toEqual([]);
  });
});
