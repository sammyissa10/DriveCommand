/**
 * Bounded post-processing of cached Tiptap body HTML, applied after variable
 * substitution and immediately before the shell renders it.
 *
 * ===========================================================================
 * THERE ARE EXACTLY THREE TRANSFORMS. DO NOT ADD A FOURTH.
 * ===========================================================================
 * This module rewrites copy that a human authored and that a tenant may have
 * customised. Every transform here is a small, reversible upgrade of a shape we
 * can recognise with certainty. The moment it starts "tidying up" markup it
 * merely suspects, it becomes a system that silently edits customer
 * communications — including safety-critical ones like `inspection.failed`.
 *
 * ===========================================================================
 * WHY REGEX AND NOT A DOM PARSER
 * ===========================================================================
 * Checked before deciding, not assumed: **no HTML parser exists in this app's
 * PRODUCTION dependency tree.** `parse5` and `jsdom` resolve only as transitive
 * dependencies of `vitest`, `happy-dom` is a devDependency, and `zeed-dom` (via
 * `@tiptap/html`) does not resolve at all. This module runs inside the
 * dispatcher's request path, so importing any of them would pass every local
 * test and every CI run, then fail at runtime on Vercel where devDependencies
 * are pruned — the worst possible failure shape.
 *
 * So: regex, with each transform confined to ONE anchored pattern, and a
 * near-miss test for every one proving it does not fire on the shape next door.
 *
 * ===========================================================================
 * NEVER THROWS
 * ===========================================================================
 * A notification must not be lost because its body had unusual markup. Every
 * transform is wrapped; on any failure the input is returned unchanged with a
 * note. The caller logs the notes.
 */

import { buildButtonBlockHtml } from '@/emails/_system/Button';

export type TransformResult = {
  html: string;
  /** One entry per transform that fired, or that declined for a stated reason. */
  notes: string[];
};

/**
 * Guard against pathological input. Anchored lazy patterns on a multi-hundred-KB
 * string are the classic place a render turns into a hang.
 */
const MAX_INPUT_LENGTH = 200_000;

/** The five entities Tiptap actually emits. */
function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}

function normaliseText(s: string): string {
  return decodeEntities(stripTags(s)).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// Transform 1 — CTA upgrade
// ---------------------------------------------------------------------------

/**
 * Final block element is a <p> whose ENTIRE content is one anchor.
 *
 * `\s*$` anchors it to the end of the body, which is what "final block-level
 * element" means here. The `\s*` either side of the capture is what enforces
 * "and no other non-whitespace text" — a paragraph of prose containing a link
 * cannot match, which is the explicit requirement not to guess.
 */
const CTA_PATTERN = /<p\b[^>]*>\s*(<a\b[^>]*>[\s\S]*?<\/a>)\s*<\/p>\s*$/i;
const HREF_PATTERN = /\bhref\s*=\s*"([^"]*)"/i;

/** Only real, clickable destinations get promoted to a button. */
const SAFE_HREF = /^(https?:|mailto:)/i;

function transformCta(html: string, notes: string[]): string {
  const match = html.match(CTA_PATTERN);
  if (!match) return html;

  const anchorHtml = match[1];

  // A <p> holding TWO anchors backtracks into a single capture spanning both.
  // Reject it: "exactly one anchor" is the stated condition.
  const anchorCount = (anchorHtml.match(/<a\b/gi) ?? []).length;
  if (anchorCount !== 1) {
    notes.push('cta: declined — paragraph contains more than one anchor');
    return html;
  }

  const hrefMatch = anchorHtml.match(HREF_PATTERN);
  if (!hrefMatch) {
    notes.push('cta: declined — anchor has no double-quoted href');
    return html;
  }

  const href = decodeEntities(hrefMatch[1]).trim();
  if (!SAFE_HREF.test(href)) {
    notes.push(`cta: declined — href is not http(s)/mailto`);
    return html;
  }

  const label = normaliseText(anchorHtml);
  if (!label) {
    notes.push('cta: declined — anchor has no text');
    return html;
  }

  // buildButtonBlockHtml escapes both values, so they are passed DECODED here.
  // Escaping already-escaped text would render a literal "&amp;" to the reader.
  const replacement = buildButtonBlockHtml(href, label);
  notes.push(`cta: upgraded anchor to button (label="${label}")`);
  return html.slice(0, match.index) + replacement;
}

// ---------------------------------------------------------------------------
// Transform 2 — banner de-duplication
// ---------------------------------------------------------------------------

/** First element only. `^\s*` is the anchor that enforces "first". */
const LEADING_HEADING_PATTERN = /^\s*<(h1|h2)\b[^>]*>([\s\S]*?)<\/\1>\s*/i;

function transformBanner(html: string, brandName: string, notes: string[]): string {
  const match = html.match(LEADING_HEADING_PATTERN);
  if (!match) return html;

  const text = normaliseText(match[2]).toLowerCase();
  const brand = brandName.trim().toLowerCase();

  // EXACT match only. A heading like "Welcome to DriveCommand" merely CONTAINS
  // the brand and is the author's own copy — removing it would delete meaning.
  if (text !== brand) return html;

  notes.push(`banner: removed leading <${match[1].toLowerCase()}> duplicating the shell brand`);
  return html.slice(match[0].length);
}

// ---------------------------------------------------------------------------
// Transform 3 — leading-greeting normalisation
// ---------------------------------------------------------------------------

/**
 * "Mike Rodriguez, trip DC-2026-00412 has not been started. …"
 *   -> "Mike Rodriguez," / "Trip DC-2026-00412 has not been started. …"
 *
 * THE TWO GUARDS THAT MAKE THIS SAFE, and why each exists:
 *
 *   (a) The remainder must begin with a LOWERCASE letter. This single condition
 *       kills every realistic false positive, because they all continue with a
 *       capital:
 *         "Chicago, IL to Dallas"        -> 'I'  no fire
 *         "Smith, John, trip …"          -> 'J'  no fire  (last-name-first data)
 *         "Hall Ford, West Bend, …"      -> 'W'  no fire  (facility names)
 *         "Mirrors, Wiper blades"        -> 'W'  no fire  (defectItems)
 *
 *   (b) The name must be TWO or THREE capitalised words. This kills the
 *       single-word openers that read like names but are not:
 *         "Reminder, your trip departs"  -> 1 word, no fire
 *         "Dispatch, please review"      -> 1 word, no fire
 *       The cost is a real false negative — a mononym or a first-name-only
 *       `driverName` will not fire — and that is the correct direction to fail.
 *       The brief is explicit that a mangled sentence is worse than no split.
 *
 * Digits are excluded from the name, and the remainder must contain a sentence
 * period, so a fragment is never promoted to a standalone paragraph.
 */
const GREETING_PATTERN =
  /^(\s*<p\b[^>]*>)\s*([A-Z][A-Za-z'’-]+(?:\s+[A-Z][A-Za-z'’-]+){1,2}),\s+([a-z][\s\S]*?)(<\/p>)/;

const MAX_NAME_LENGTH = 40;

/**
 * Locates the first paragraph. The lookahead is what keeps `<pre>` from being
 * mistaken for a paragraph while still allowing `<p class="…">`.
 */
const FIRST_PARAGRAPH_PATTERN = /<p(?=[\s>])/i;

function transformGreeting(html: string, notes: string[]): string {
  // "The FIRST PARAGRAPH", not the first element. Anchoring at the very start
  // of the body made this dead code in production: every real template opens
  // with an <h2> heading, so a `^<p>` anchor never matched. Caught by the
  // dry-run against all 47 production rows reporting zero fires — the number
  // that was supposed to be evidence turned out to be the bug.
  const firstParagraph = html.search(FIRST_PARAGRAPH_PATTERN);
  if (firstParagraph === -1) return html;

  const prefix = html.slice(0, firstParagraph);
  const rest = html.slice(firstParagraph);

  const match = rest.match(GREETING_PATTERN);
  if (!match) return html;

  const [full, openTag, name, remainder, closeTag] = match;

  if (name.length > MAX_NAME_LENGTH) {
    notes.push('greeting: declined — leading phrase is too long to be a name');
    return html;
  }

  // A remainder with no sentence period is a fragment, not a sentence.
  if (!remainder.includes('.')) {
    notes.push('greeting: declined — remainder is not a complete sentence');
    return html;
  }

  // Capitalise only a plain lowercase ASCII initial. Anything else is left as
  // the author wrote it.
  const first = remainder[0];
  const capitalised = first >= 'a' && first <= 'z' ? first.toUpperCase() + remainder.slice(1) : remainder;

  const replacement = `${openTag}${name},${closeTag}${openTag}${capitalised}${closeTag}`;
  notes.push(`greeting: split leading salutation (name="${name}")`);
  return prefix + replacement + rest.slice(full.length);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Apply the three transforms. Pure; never throws.
 *
 * Order matters: the banner transform runs FIRST so that the greeting transform
 * sees the real first paragraph rather than one sitting behind a heading.
 */
export function transformBodyHtml(
  html: string,
  options?: { brandName?: string },
): TransformResult {
  const notes: string[] = [];

  if (typeof html !== 'string' || html.length === 0) {
    return { html: typeof html === 'string' ? html : '', notes };
  }

  if (html.length > MAX_INPUT_LENGTH) {
    notes.push(`skipped — body exceeds ${MAX_INPUT_LENGTH} characters`);
    return { html, notes };
  }

  const brandName = options?.brandName ?? 'DriveCommand';

  try {
    let out = html;
    out = transformBanner(out, brandName, notes);
    out = transformGreeting(out, notes);
    out = transformCta(out, notes);
    return { html: out, notes };
  } catch (err) {
    // A notification must never be lost to a transform. Return the input.
    notes.push(
      `skipped — transform threw: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { html, notes };
  }
}
