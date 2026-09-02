/**
 * HTML -> plain text, for the `text/plain` alternative part of every send.
 *
 * ===========================================================================
 * WHY THIS IS REGEX AND NOT A PARSER
 * ===========================================================================
 * Same constraint quick-573 established and re-verified here: there is NO HTML
 * parser in this app's PRODUCTION dependency tree. `parse5` and `jsdom` resolve
 * only as transitive dependencies of `vitest`, `happy-dom` is a devDependency.
 * This runs in the send path, so importing any of them would pass every test and
 * then fail on Vercel, where devDependencies are pruned.
 *
 * ===========================================================================
 * IT MUST RUN ON THE FINAL SHELL HTML, NOT THE RAW BODY
 * ===========================================================================
 * The order matters and is easy to get wrong in the cheap direction. Run this
 * on the cached body and the text part is missing the greeting split and the
 * button; run it on the final shell output — which is what both call sites do —
 * and it has to actively remove three things the shell adds:
 *
 *   1. the preheader div, whose ~120 zero-width joiners would otherwise open
 *      the text part with a wall of invisible characters;
 *   2. the `<style>` block, which would dump the entire CSS into the message;
 *   3. the bulletproof button, which is a VML conditional comment plus a nested
 *      table and would otherwise render as the label, then the URL, then the
 *      URL again from the plain-text note beneath it.
 *
 * Each of those is asserted in the tests rather than eyeballed.
 */

/** Body text wraps here. 78 is the long-standing plain-text convention. */
const WRAP_COLUMN = 78;

/** The zero-width joiners and hair spaces the preheader pads with. */
const INVISIBLES = /[​-‍  ﻿]/g;

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Wrap to `width`, preserving existing line structure and never breaking a long
 * token (a URL must stay clickable, so an over-long line is the lesser evil).
 */
function hardWrap(text: string, width: number): string {
  return text
    .split('\n')
    .map((line) => {
      if (line.length <= width) return line;

      const words = line.split(' ');
      const out: string[] = [];
      let current = '';

      for (const word of words) {
        if (!current) {
          current = word;
        } else if (`${current} ${word}`.length <= width) {
          current += ` ${word}`;
        } else {
          out.push(current);
          current = word;
        }
      }
      if (current) out.push(current);
      return out.join('\n');
    })
    .join('\n');
}

/**
 * Convert rendered email HTML to a readable plain-text alternative.
 *
 * Pure. Never throws — on any failure it degrades to a tag-stripped version of
 * the input, because an ugly text part is better than a lost email.
 */
export function htmlToPlainText(html: string): string {
  if (typeof html !== 'string' || html.length === 0) return '';

  try {
    let s = html;

    // --- 1. Remove things that must never appear as text -------------------
    s = s.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');
    s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    s = s.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '');

    // The preheader: the div AND its zero-width padding.
    s = s.replace(/<div[^>]*class="[^"]*dc-preheader[^"]*"[^>]*>[\s\S]*?<\/div>/gi, '');

    // Conditional comments come in TWO shapes and must be handled differently.
    // Treating them alike is what made the first version of this function
    // delete the CTA label entirely, leaving a bare URL in the text part:
    //
    //   <!--[if mso]>  ...VML...  <![endif]-->   a real comment  -> DROP it
    //   <!--[if !mso]><!-->  ...markup...  <!--<![endif]-->
    //        downlevel-REVEALED: the content is LIVE MARKUP and only the
    //        markers are comments. Dropping the whole span removes the button.
    //
    // Strip the revealed markers first (keeping their content), then remove
    // true conditional blocks, whose VML twin holds a duplicate of the label.
    s = s.replace(/<!--\[if\s*![^\]]*\]><!-->/gi, "");
    s = s.replace(/<!--<!\[endif\]-->/gi, "");
    s = s.replace(/<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi, "");
    s = s.replace(/<!--[\s\S]*?-->/g, "");

    // --- 2. The bulletproof button -> one "label (url)" line ---------------
    // Swallow the plain-text URL note that follows it, or the URL prints twice.
    s = s.replace(
      /<a[^>]*class="[^"]*dc-btn[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>([\s\S]*?)<p[^>]*>\s*\1\s*<\/p>/gi,
      (_m, href: string, label: string) => `\n\n${stripTags(label).trim()} (${href})\n\n`,
    );
    // Same button with no following note (defensive — shape may change).
    s = s.replace(
      /<a[^>]*class="[^"]*dc-btn[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) => `\n\n${stripTags(label).trim()} (${href})\n\n`,
    );

    // --- 3. Block structure -> line breaks ---------------------------------
    s = s.replace(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, _l, inner: string) => {
      const text = stripTags(inner).trim();
      return text ? `\n\n${text}\n\n` : '\n';
    });

    s = s.replace(/<li\b[^>]*>/gi, '\n- ');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<\/(p|div|tr|li|ul|ol|table|section)>/gi, '\n');

    // --- 4. Remaining anchors -> "label (url)" -----------------------------
    s = s.replace(
      /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_m, href: string, label: string) => {
        const text = stripTags(label).replace(/\s+/g, ' ').trim();
        if (!text) return href;
        // A link whose text already IS the URL should not be doubled.
        if (text === href) return href;
        return `${text} (${href})`;
      },
    );

    // --- 5. Flatten ---------------------------------------------------------
    s = stripTags(s);
    s = decodeEntities(s);
    s = s.replace(INVISIBLES, '');

    // Collapse runs of spaces/tabs without destroying line structure.
    s = s
      .split('\n')
      .map((line) => line.replace(/[ \t ]+/g, ' ').trim())
      .join('\n');

    s = s.replace(/\n{3,}/g, '\n\n').trim();

    return hardWrap(s, WRAP_COLUMN);
  } catch {
    // Degrade rather than lose the email.
    return stripTags(html).replace(/\s+/g, ' ').trim();
  }
}

function stripTags(s: string): string {
  return s.replace(/<[^>]*>/g, '');
}
