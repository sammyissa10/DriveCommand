/**
 * DynamicTemplateEmail — React Email shell for dispatcher-rendered notifications.
 *
 * The markup now lives in `@/emails/_system`; this file is the thin adapter
 * between the dispatcher's render call and that design system.
 *
 * The `dangerouslySetInnerHTML` warning still stands and has simply moved down
 * one level: `bodyHtml` must be Tiptap-generated and variable-substituted by
 * template-renderer.ts BEFORE it reaches here, and Shell.tsx injects it in
 * exactly one place. Never pass raw user input.
 *
 * ---------------------------------------------------------------------------
 * COMPATIBILITY
 * ---------------------------------------------------------------------------
 * The exported name, the default export and the original prop signature are
 * unchanged, so `React.createElement(DynamicTemplateEmail, { bodyHtml })` in
 * template-renderer.ts compiles and behaves exactly as before. Everything new
 * is optional and additive.
 *
 * Two of the original props are now inert, and that is a behaviour change worth
 * stating rather than burying:
 *
 *   `brandName`      — the header is a fixed brand lockup (the mark asset plus
 *                      the wordmark as live text). It was only ever called with
 *                      its default, 'DriveCommand'; no caller passes it.
 *   `footerAddress`  — the postal address is now read from
 *                      EMAIL_FOOTER_ADDRESS in Footer.tsx. The old prop was
 *                      never passed by any caller, so the address line was dead
 *                      code that read as though the requirement had been met.
 *
 * Both are still accepted so no call site breaks; neither is read.
 */

import * as React from 'react';
import { Shell, type StatusTone } from './_system';
import { getAppBaseUrl } from '@/lib/app-url';

/** Trim the derived preview to something an inbox will actually show. */
const PREHEADER_MAX = 90;

export type DynamicTemplateEmailProps = {
  /** Already-substituted, Tiptap-generated HTML. The sole HTML injection site. */
  bodyHtml: string;
  /** @deprecated Inert — the header lockup is fixed. Accepted for compatibility. */
  brandName?: string;
  /** @deprecated Inert — the address comes from EMAIL_FOOTER_ADDRESS. */
  footerAddress?: string;

  /**
   * Inbox preview line. When omitted it is DERIVED from the body text.
   *
   * The shell this replaces used a constant here, so every dispatcher email
   * previewed as "DriveCommand notification" — a trip reminder and a failed
   * brake inspection were indistinguishable in the message list. Deriving from
   * the body is worse than a purpose-written line and far better than a
   * constant, so there is deliberately no constant fallback.
   */
  preheader?: string;
  /** Optional glanceable strip under the header. */
  statusBar?: { tone: StatusTone; label: string };
  /** Overrides the 3px accent rule under the header band. */
  accentColor?: string;
  /** Absolute URL to notification preferences. Omitted if absent. */
  preferencesUrl?: string;
  /**
   * Absolute origin for the logo asset. Defaults to the app base URL.
   *
   * This MUST be absolute: a relative src resolves against the mail client's
   * own origin and is simply a broken image.
   */
  logoBaseUrl?: string;
};

/**
 * Derive a preview line from body HTML.
 *
 * Strips tags, collapses whitespace, decodes the handful of entities Tiptap
 * actually emits, then cuts on a word boundary so the preview does not end
 * mid-word. Returns '' for empty input — the Preheader then renders only its
 * padding, which is still better than a misleading constant.
 */
export function derivePreheader(bodyHtml: string, maxLength = PREHEADER_MAX): string {
  const text = bodyHtml
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();

  if (text.length <= maxLength) return text;

  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(' ');
  // Only honour the word boundary if it is not so early that we lose the line.
  const base = lastSpace > maxLength * 0.6 ? cut.slice(0, lastSpace) : cut;
  return `${base.replace(/[,.;:]$/, '')}…`;
}

export const DynamicTemplateEmail: React.FC<DynamicTemplateEmailProps> = ({
  bodyHtml,
  preheader,
  statusBar,
  accentColor,
  preferencesUrl,
  logoBaseUrl,
}) => (
  <Shell
    preheader={preheader ?? derivePreheader(bodyHtml)}
    bodyHtml={bodyHtml}
    statusBar={statusBar}
    accentColor={accentColor}
    preferencesUrl={preferencesUrl}
    logoBaseUrl={logoBaseUrl ?? getAppBaseUrl()}
  />
);

export default DynamicTemplateEmail;
