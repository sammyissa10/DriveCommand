/**
 * Extraction response-parsing tests.
 *
 * These cover the reply shapes that broke live extraction runs against the real
 * API, not hypothetical ones:
 *
 *  - a `thinking` block ahead of the `text` block (Sonnet 5 has adaptive
 *    thinking always on — this failed 4 of 4 pages)
 *  - JSON inside markdown fences despite the prompt forbidding them
 *  - JSON with a lead-in sentence and trailing commentary
 *  - a genuinely broken reply, which must still fail cleanly AND keep the raw
 *    text, because a failure we cannot read is a failure we cannot fix
 *
 * No network: the Anthropic client is injected.
 */

import { describe, it, expect } from 'vitest';
import {
  extractPage,
  parsePageReply,
  readReply,
  stripJsonFences,
  extractJsonValue,
  RAW_RESPONSE_LIMIT,
  type AnthropicLike,
} from '../extractor';
import { extractDocument } from '../service';
import type { SourceFile, SourcePage } from '../pages';
import { hashPage } from '../hashing';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const PAGE_JSON = {
  documentType: 'MANIFEST',
  header: { documentDate: '2026-07-27', originName: 'DEALER TIRE' },
  consignments: [
    {
      externalCode: '43775',
      name: 'RUSS DARROW NISSAN',
      address: { line1: '11212 W METRO BLVD', city: 'MILWAUKEE', state: 'WI', postalCode: '53224' },
      references: [{ type: 'SHIPMENT', value: '77198347' }],
      totals: { pieces: 4, weight: 88, weightUom: 'LBS' },
      fieldConfidence: { name: 0.97 },
    },
  ],
  extractionWarnings: [],
};

const PAGE_TEXT = JSON.stringify(PAGE_JSON);

/** A reply envelope with whatever content blocks the test wants to hand back. */
function envelope(content: unknown[]) {
  return { content, usage: { input_tokens: 1200, output_tokens: 340 } };
}

function textBlock(text: string) {
  return { type: 'text', text };
}

/** What a thinking-enabled model actually returns: reasoning first, then text. */
function thinkingBlock(thinking: string) {
  return { type: 'thinking', thinking, signature: 'sig-abc123' };
}

function fakeClient(response: unknown): AnthropicLike {
  const create = async () => response;
  return { messages: { create }, beta: { messages: { create } } };
}

function page(bytes = 'page-bytes'): SourcePage {
  const buf = Buffer.from(bytes, 'utf8');
  return {
    pageNumber: 1,
    mimeType: 'image/jpeg',
    bytes: buf,
    hash: hashPage(buf),
    storageKey: null,
    isMultiPage: false,
    fromPdf: false,
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

// ---------------------------------------------------------------------------
// (a) thinking block before the text block
// ---------------------------------------------------------------------------

describe('readReply — content block selection', () => {
  it('reads the text block when a thinking block comes first', () => {
    const { text } = readReply(
      envelope([thinkingBlock('Let me look at the consignee codes...'), textBlock(PAGE_TEXT)]),
    );
    expect(text).toBe(PAGE_TEXT);
  });

  it('ignores thinking and redacted_thinking wherever they appear', () => {
    const { text } = readReply(
      envelope([
        thinkingBlock('first thought'),
        { type: 'redacted_thinking', data: 'encrypted-blob' },
        textBlock(PAGE_TEXT),
        thinkingBlock('afterthought'),
      ]),
    );
    expect(text).toBe(PAGE_TEXT);
  });

  it('joins several text blocks in order', () => {
    const { text } = readReply(
      envelope([thinkingBlock('thinking'), textBlock('first'), textBlock('second')]),
    );
    expect(text).toBe('first\nsecond');
  });

  it('reassembles JSON split across text blocks at a line boundary', () => {
    // Split on newlines, so rejoining with a newline reproduces the original.
    // Splitting mid-token would not survive, and no model emits it that way.
    const pretty = JSON.stringify(PAGE_JSON, null, 2);
    const lines = pretty.split('\n');
    const cut = Math.floor(lines.length / 2);
    const { text } = readReply(
      envelope([
        thinkingBlock('thinking'),
        textBlock(lines.slice(0, cut).join('\n')),
        textBlock(lines.slice(cut).join('\n')),
      ]),
    );
    expect(text).toBe(pretty);
    expect(parsePageReply(text)?.consignments).toHaveLength(1);
  });

  it('still carries usage when there is no text block at all', () => {
    const { text, inputTokens, outputTokens } = readReply(envelope([thinkingBlock('only this')]));
    expect(text).toBe('');
    expect(inputTokens).toBe(1200);
    expect(outputTokens).toBe(340);
  });

  it('does not throw on a malformed envelope', () => {
    expect(readReply(undefined).text).toBe('');
    expect(readReply({}).text).toBe('');
    expect(readReply({ content: 'not-an-array' }).text).toBe('');
    expect(readReply({ content: [null, 42, { type: 'text' }] }).text).toBe('');
  });

  it('extracts a page through the full call path with thinking enabled', async () => {
    const client = fakeClient(
      envelope([thinkingBlock('reasoning about the manifest'), textBlock(PAGE_TEXT)]),
    );
    const result = await extractPage(page(), { client });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.consignments[0].externalCode).toBe('43775');
    expect(result.inputTokens).toBe(1200);
    expect(result.outputTokens).toBe(340);
  });
});

// ---------------------------------------------------------------------------
// (b) markdown fences
// ---------------------------------------------------------------------------

describe('stripJsonFences', () => {
  it('strips a ```json fence wrapping the whole reply', () => {
    expect(stripJsonFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a bare ``` fence', () => {
    expect(stripJsonFences('```\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a fence that sits inside prose', () => {
    expect(stripJsonFences('Here is the extraction:\n```json\n{"a":1}\n```\nHope that helps.')).toBe(
      '{"a":1}',
    );
  });

  it('leaves unfenced text alone', () => {
    expect(stripJsonFences('  {"a":1}  ')).toBe('{"a":1}');
  });
});

describe('parsing fenced replies', () => {
  it('parses JSON wrapped in markdown fences', () => {
    const parsed = parsePageReply('```json\n' + PAGE_TEXT + '\n```');
    expect(parsed?.consignments[0].name).toBe('RUSS DARROW NISSAN');
  });

  it('extracts a page whose reply is fenced, behind a thinking block', async () => {
    const client = fakeClient(
      envelope([thinkingBlock('reasoning'), textBlock('```json\n' + PAGE_TEXT + '\n```')]),
    );
    const result = await extractPage(page(), { client });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.consignments).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (c) leading prose and trailing commentary
// ---------------------------------------------------------------------------

describe('parsing replies surrounded by prose', () => {
  it('parses JSON with a lead-in sentence and a trailing note', () => {
    const reply =
      'I read the manifest. Here is the extraction:\n\n' +
      PAGE_TEXT +
      '\n\nNote: the handwriting in the margin was not legible.';
    const parsed = parsePageReply(reply);
    expect(parsed?.consignments[0].externalCode).toBe('43775');
  });

  it('takes the widest brace span so nested objects survive', () => {
    const json = extractJsonValue('prefix {"a":{"b":1},"c":2} suffix');
    expect(json.ok).toBe(true);
    if (!json.ok) return;
    expect(json.value).toEqual({ a: { b: 1 }, c: 2 });
  });

  it('extracts a page through the full call path with prose around the JSON', async () => {
    const client = fakeClient(
      envelope([
        thinkingBlock('deciding on confidences'),
        textBlock('Here is the JSON you asked for:\n' + PAGE_TEXT + '\nLet me know if anything looks off.'),
      ]),
    );
    const result = await extractPage(page(), { client });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.extraction.consignments).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// (d) genuinely malformed — fails cleanly, raw text kept
// ---------------------------------------------------------------------------

describe('unparseable replies', () => {
  it('returns null from parsePageReply for text with no JSON in it', () => {
    expect(parsePageReply('I am unable to read this page.')).toBeNull();
  });

  it('returns null for a truncated JSON object', () => {
    expect(parsePageReply('{"documentType":"MANIFEST","consignments":[{"name":"RUSS')).toBeNull();
  });

  it('returns null when the JSON violates the schema', () => {
    // `name` is the one genuinely required field on a consignment (spec 5).
    expect(parsePageReply('{"consignments":[{"address":{"city":"MILWAUKEE"}}]}')).toBeNull();
  });

  it('accepts an unrecognised object rather than rejecting it', () => {
    // Every root key carries a Zod `.default()` on purpose — a half-read page is
    // still worth showing a human. So this is NOT an unparseable response; it
    // becomes an empty extraction and the service reports ZERO_CONSIGNMENTS.
    // Documented here because it is easy to mistake for a parser bug.
    expect(parsePageReply('{"totally":"different"}')?.consignments).toEqual([]);
  });

  it('reports UNPARSEABLE_RESPONSE and keeps the raw text', async () => {
    const garbage = 'I could not produce JSON for this page. Sorry!';
    const client = fakeClient(envelope([thinkingBlock('hmm'), textBlock(garbage)]));
    const result = await extractPage(page(), { client });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('UNPARSEABLE_RESPONSE');
    expect(result.raw).toBe(garbage);
    expect(result.inputTokens).toBe(1200);
    expect(result.outputTokens).toBe(340);
  });

  it('truncates a huge raw reply to the 20KB cap', async () => {
    const huge = 'x'.repeat(RAW_RESPONSE_LIMIT + 5_000);
    const client = fakeClient(envelope([textBlock(huge)]));
    const result = await extractPage(page(), { client });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.raw).toHaveLength(RAW_RESPONSE_LIMIT);
  });

  it('carries the raw text onto the page outcome', async () => {
    const garbage = 'no json here at all';
    const client = fakeClient(envelope([textBlock(garbage)]));
    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a')],
      client,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.pages?.[0].failureCode).toBe('UNPARSEABLE_RESPONSE');
    expect(result.pages?.[0].rawResponse).toBe(garbage);
  });
});

// ---------------------------------------------------------------------------
// Failure message discrimination
// ---------------------------------------------------------------------------

describe('ALL_PAGES_FAILED message', () => {
  it('blames the service, not the photos, when every page was unparseable', async () => {
    const client = fakeClient(envelope([thinkingBlock('...'), textBlock('not json')]));
    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b')],
      client,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ALL_PAGES_FAILED');
    expect(result.message).not.toMatch(/clearer photo/i);
    expect(result.message).toMatch(/reading service/i);
  });

  it('blames the service when every page threw a model error', async () => {
    const create = async () => {
      throw new Error('overloaded_error');
    };
    const client: AnthropicLike = { messages: { create }, beta: { messages: { create } } };
    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a')],
      client,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ALL_PAGES_FAILED');
    expect(result.message).not.toMatch(/clearer photo/i);
    expect(result.message).toMatch(/reading service/i);
  });

  it('still suggests re-shooting when every page was genuinely unreadable', async () => {
    const unreadable = JSON.stringify({
      documentType: 'UNKNOWN',
      consignments: [],
      extractionWarnings: [{ code: 'UNREADABLE_PAGE', message: 'too blurred', pageNumbers: [1] }],
    });
    const client = fakeClient(envelope([textBlock(unreadable)]));
    const result = await extractDocument({
      tenantId: 't1',
      sources: [photo(1, 'a'), photo(2, 'b')],
      client,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe('ALL_PAGES_FAILED');
    expect(result.message).toMatch(/clearer photo/i);
  });
});
