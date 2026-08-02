/**
 * The vision extraction call.
 *
 * Spec: docs/specs/DocumentImport_TechnicalSpec_v1.md Section 5.
 *
 * Reuses the Anthropic call shape proven in
 * `src/app/(owner)/actions/ai-documents.ts` — same SDK, same PDF `document`
 * block with the `pdfs-2024-09-25` beta, same image block. What is new here is
 * everything around it: the canonical schema, per-field confidence, warnings,
 * token accounting, and a typed failure instead of a thrown error.
 *
 * No UI imports. No Prisma imports. This module takes bytes and returns data,
 * which is what makes it testable without a database or a browser.
 */

import Anthropic from '@anthropic-ai/sdk';
import {
  pageExtractionSchema,
  type PageExtraction,
} from '@drivecommand/validation';
import type { SourcePage } from './pages';

/**
 * Single source of truth for the model id. `ai-documents.ts` hardcodes this in
 * two places; this module keeps it in one so a change is one edit.
 */
export const EXTRACTION_MODEL = 'claude-sonnet-5';

/**
 * A 16-page manifest with a dozen consignments and their line items does not fit
 * in the 1024 tokens the existing `analyzeDocument` allows. Sized for one page's
 * worth of consignments with room for line items and confidence.
 */
export const MAX_OUTPUT_TOKENS = 8192;

/** USD per million tokens. Used for the cost figure recorded on the import. */
export interface ModelPricing {
  inputPerMTok: number;
  outputPerMTok: number;
}

export const DEFAULT_PRICING: ModelPricing = {
  inputPerMTok: 3,
  outputPerMTok: 15,
};

export type ExtractionFailureCode =
  | 'NO_API_KEY'
  | 'MODEL_ERROR'
  | 'UNPARSEABLE_RESPONSE'
  | 'UNREADABLE_PAGE'
  | 'ZERO_CONSIGNMENTS';

export interface PageExtractionSuccess {
  ok: true;
  extraction: PageExtraction;
  inputTokens: number;
  outputTokens: number;
  model: string;
}

export interface PageExtractionFailure {
  ok: false;
  code: ExtractionFailureCode;
  message: string;
  /** Raw model text, when there was some, for debugging a bad parse. */
  raw?: string;
  inputTokens?: number;
  outputTokens?: number;
  model?: string;
}

/**
 * How much raw model text to keep on a failure.
 *
 * A truncated reply is still diagnosable — the shape of what went wrong is
 * almost always visible in the first few KB — and 20KB bounds what a bad run
 * can write into the page record.
 */
export const RAW_RESPONSE_LIMIT = 20_000;

export type PageExtractionResult = PageExtractionSuccess | PageExtractionFailure;

// ---------------------------------------------------------------------------
// Prompt
// ---------------------------------------------------------------------------

/**
 * Built from the real document in spec Section 1.2. The callouts there are not
 * decoration — each rule below exists because a real page breaks a naive
 * assumption.
 */
export const EXTRACTION_PROMPT = `You are a freight document parser. Extract every consignee block on this page into structured JSON.

Return ONLY a JSON object with this exact shape (use null for anything absent):

{
  "documentType": "MANIFEST" | "RATE_CONFIRMATION" | "DELIVERY_SCHEDULE" | "PACKING_LIST" | "UNKNOWN",
  "header": {
    "documentNumber": string|null,
    "documentDate": string|null,
    "totalPages": number|null,
    "originName": string|null,
    "originAddress": { "line1":string|null, "line2":string|null, "city":string|null, "state":string|null, "postalCode":string|null, "country":string|null }|null,
    "originContact": { "name":string|null, "phone":string|null, "email":string|null }|null,
    "currency": string|null,
    "totalRate": string|null
  },
  "consignments": [{
    "externalCode": string|null,
    "name": string,
    "address": { "line1":string|null, "line2":string|null, "city":string|null, "state":string|null, "postalCode":string|null, "country":string|null },
    "contact": { "name":string|null, "phone":string|null }|null,
    "groupLabel": string|null,
    "appointment": { "earliest":string|null, "latest":string|null, "isFirm":boolean|null }|null,
    "references": [{ "type":"SHIPMENT"|"PRO"|"ORDER"|"PO"|"BOL"|"LOAD"|"SEAL"|"OTHER", "value":string }],
    "totals": { "pieces":number|null, "pallets":number|null, "weight":number|null, "weightUom":"LBS"|"KG"|null },
    "lineItems": [{ "sku":string|null, "description":string|null, "quantity":number|null, "uom":string|null, "weight":number|null, "hazmat":boolean|null }],
    "notes": string|null,
    "fieldConfidence": { "<fieldPath>": 0.0-1.0 }
  }],
  "extractionWarnings": [{ "code":string, "message":string, "pageNumbers":[number] }]
}

RULES — each of these comes from a real document:

1. A field LABELLED "number" may contain a DATE. Read the value, not the label.
   "Manifest Number: 07/27/26" is a date. Put it in documentDate, not documentNumber.

2. The consignee CODE is the most important value on the page. It is a stable
   customer id (e.g. "Consignee: 43775"). Always capture it as externalCode.

3. If the SAME consignee code appears in two separate blocks on this page, emit
   TWO separate consignment objects. Do not merge them yourself — each block has
   its own shipment number and its own quantities, and they are combined later.

4. A quantity of 0 is real. Substitution rows ("subs") and pallet rows with
   quantity 0 must still be emitted as lineItems.

5. A PO field often contains a PERSON'S NAME rather than a number. Capture the
   text as it appears; do not discard it for looking wrong.

6. "Shipment Num" is type SHIPMENT. "PRO Num" is type PRO. "Order Number" is
   type ORDER. "Customer PO" is type PO. Anything else you find is type OTHER.

7. A routing zone such as "WEST - MKE" is the groupLabel.

8. fieldConfidence: give a real 0.0-1.0 per field path you extracted, e.g.
   {"name":0.98,"address.postalCode":0.62,"totals.weight":0.9}. Base it on how
   clearly the value is printed. Do NOT return a constant — a smudged or
   handwritten value must score lower than crisp machine print.

9. Handwriting is best-effort. Capture it in notes if legible, and add an
   extractionWarnings entry. Never let handwriting block anything.

10. If the page is too blurred or cropped to read, return an empty consignments
    array and one extractionWarnings entry with code "UNREADABLE_PAGE".

Return only the JSON. No markdown fences, no explanation.`;

// ---------------------------------------------------------------------------
// Response handling
// ---------------------------------------------------------------------------

/**
 * Models occasionally wrap JSON in fences despite instructions, and sometimes
 * put a sentence in front of the fence as well. Handle both.
 */
export function stripJsonFences(text: string): string {
  const trimmed = text.trim();

  // The whole reply is one fenced block.
  const whole = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  if (whole) return whole[1].trim();

  // A fenced block somewhere inside prose ("Here is the JSON:\n```json ...").
  const embedded = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmed);
  if (embedded) return embedded[1].trim();

  return trimmed;
}

/**
 * Pull a JSON value out of model text without being fussy about what surrounds
 * it.
 *
 * Two passes, cheapest first: parse the de-fenced text as-is, and only if that
 * fails fall back to the widest brace span in it. The brace span is what
 * survives leading prose ("Here is the extraction:") and trailing commentary
 * ("Note: page 3 was blurry") — both of which a model will emit despite the
 * prompt, especially when it has been thinking first.
 *
 * Returns a tagged result rather than `undefined` so a reply of literal `null`
 * is not confused with a failure to parse.
 */
export function extractJsonValue(text: string): { ok: true; value: unknown } | { ok: false } {
  const cleaned = stripJsonFences(text);
  if (!cleaned) return { ok: false };

  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch {
    /* fall through to the brace span */
  }

  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end <= start) return { ok: false };

  try {
    return { ok: true, value: JSON.parse(cleaned.slice(start, end + 1)) };
  } catch {
    return { ok: false };
  }
}

/**
 * Parse and validate a model reply into the canonical page shape.
 *
 * Zod `.default()`s mean a reply missing optional keys still validates — the
 * schema is deliberately forgiving because a half-read page is worth showing a
 * human, and only `name` is genuinely required per spec Section 5.
 */
export function parsePageReply(text: string): PageExtraction | null {
  const json = extractJsonValue(text);
  if (!json.ok) return null;

  const result = pageExtractionSchema.safeParse(json.value);
  if (!result.success) return null;
  return result.data;
}

export function estimateCostUsd(
  inputTokens: number,
  outputTokens: number,
  pricing: ModelPricing = DEFAULT_PRICING,
): number {
  return (
    (inputTokens / 1_000_000) * pricing.inputPerMTok +
    (outputTokens / 1_000_000) * pricing.outputPerMTok
  );
}

// ---------------------------------------------------------------------------
// The call
// ---------------------------------------------------------------------------

/** Injectable so tests never reach the network. */
export interface AnthropicLike {
  messages: {
    create(args: Record<string, unknown>): Promise<unknown>;
  };
  beta: {
    messages: {
      create(args: Record<string, unknown>): Promise<unknown>;
    };
  };
}

/**
 * Pull the assistant's text out of a Messages API reply.
 *
 * Never `content[0]`, never an assumption about ordering. A model with thinking
 * enabled — which Sonnet 5 has on adaptively, always — returns a `thinking`
 * block *before* its `text` block, so indexing position zero reads the reasoning
 * and then fails to parse it as JSON. That is exactly the intermittent
 * UNPARSEABLE_RESPONSE seen in live testing.
 *
 * Selecting every `type === 'text'` block and joining them is model-agnostic:
 * thinking, redacted_thinking, and tool_use blocks are ignored wherever they
 * appear, and a reply split across several text blocks still reassembles.
 */
export function readReply(response: unknown): {
  text: string;
  inputTokens: number;
  outputTokens: number;
} {
  const r = response as {
    content?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number };
  };

  const blocks = Array.isArray(r?.content) ? (r.content as Array<unknown>) : [];
  const text = blocks
    .filter(
      (b): b is { type: string; text: string } =>
        typeof b === 'object' &&
        b !== null &&
        (b as { type?: unknown }).type === 'text' &&
        typeof (b as { text?: unknown }).text === 'string',
    )
    .map((b) => b.text)
    .join('\n')
    .trim();

  return {
    text,
    inputTokens: r?.usage?.input_tokens ?? 0,
    outputTokens: r?.usage?.output_tokens ?? 0,
  };
}

/**
 * Extract one page.
 *
 * Never throws for an expected condition — an unreadable page, a zero-result
 * page, and a bad parse all come back as typed failures so the caller can flag
 * that page and carry on with the other fifteen (spec Section 14: "One page
 * unreadable — flag it, extract the rest, re-shoot that page").
 */
export async function extractPage(
  page: SourcePage,
  opts: {
    client?: AnthropicLike;
    apiKey?: string;
    model?: string;
    extractionHints?: Record<string, unknown>;
  } = {},
): Promise<PageExtractionResult> {
  const model = opts.model ?? EXTRACTION_MODEL;

  let client = opts.client;
  if (!client) {
    const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { ok: false, code: 'NO_API_KEY', message: 'ANTHROPIC_API_KEY is not configured.' };
    }
    client = new Anthropic({ apiKey }) as unknown as AnthropicLike;
  }

  const hintText =
    opts.extractionHints && Object.keys(opts.extractionHints).length > 0
      ? `\n\nCLIENT-SPECIFIC HINTS for this document layout:\n${JSON.stringify(opts.extractionHints, null, 2)}`
      : '';

  const textBlock = { type: 'text', text: EXTRACTION_PROMPT + hintText };
  const base64 = page.bytes.toString('base64');

  let response: unknown;
  try {
    if (page.mimeType === 'application/pdf') {
      response = await client.beta.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        betas: ['pdfs-2024-09-25'],
        messages: [
          {
            role: 'user',
            content: [
              { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
              textBlock,
            ],
          },
        ],
      });
    } else {
      response = await client.messages.create({
        model,
        max_tokens: MAX_OUTPUT_TOKENS,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: page.mimeType, data: base64 } },
              textBlock,
            ],
          },
        ],
      });
    }
  } catch (err) {
    return {
      ok: false,
      code: 'MODEL_ERROR',
      message: err instanceof Error ? err.message : 'The extraction model call failed.',
      model,
    };
  }

  const { text, inputTokens, outputTokens } = readReply(response);
  const parsed = parsePageReply(text);

  if (!parsed) {
    return {
      ok: false,
      code: 'UNPARSEABLE_RESPONSE',
      message: 'The model reply was not valid JSON in the expected shape.',
      // Kept so a failed page is diagnosable after the fact. Discarding this is
      // what made the live UNPARSEABLE_RESPONSE failures impossible to explain.
      raw: text.slice(0, RAW_RESPONSE_LIMIT),
      inputTokens,
      outputTokens,
      model,
    };
  }

  const unreadable = parsed.extractionWarnings?.some((w) => w.code === 'UNREADABLE_PAGE');
  if (unreadable && parsed.consignments.length === 0) {
    return {
      ok: false,
      code: 'UNREADABLE_PAGE',
      message: 'This page could not be read. Re-shoot it and try again.',
      inputTokens,
      outputTokens,
      model,
    };
  }

  return { ok: true, extraction: parsed, inputTokens, outputTokens, model };
}
